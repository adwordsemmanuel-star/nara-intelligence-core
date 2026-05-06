require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());

// CORS para permitir acceso desde el Dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const port = process.env.PORT || 3000;

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Advertencia: Falta la configuración de Supabase en el archivo .env");
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Endpoint for Meta to Verify the Webhook

app.get('/webhook', (req, res) => {
  const verify_token = process.env.META_VERIFY_TOKEN;
  
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verify_token) {
      console.log('✅ Webhook verificado exitosamente por Meta!');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.status(400).send('Bad Request');
  }
});

// Endpoint to Receive WhatsApp Messages
app.post('/webhook', async (req, res) => {
  console.log('\n==============================================');
  console.log('📢 ¡PETICIÓN POST RECIBIDA EN /WEBHOOK!');
  console.log('==============================================\n');
  console.log(JSON.stringify(req.body, null, 2));

  
  // Meta expects a 200 OK immediately
  res.sendStatus(200);

  try {
    let body = req.body;

    console.log("--- Nuevo evento de WhatsApp recibido ---");
    console.log(JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account') {
      for (let entry of body.entry) {
        for (let change of entry.changes) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            let message = change.value.messages[0];
            let contact = change.value.contacts ? change.value.contacts[0] : null;

            let phone_number = message.from;
            let text = message.text ? message.text.body : 'Mensaje sin texto (imagen/audio)';
            
            // Safer timestamp parsing
            let timestamp;
            try {
              timestamp = message.timestamp ? new Date(parseInt(message.timestamp) * 1000).toISOString() : new Date().toISOString();
            } catch (e) {
              timestamp = new Date().toISOString();
            }

            let contact_name = contact && contact.profile ? contact.profile.name : 'Desconocido';

            console.log(`📩 Mensaje de ${contact_name} (${phone_number}): ${text}`);


            // Insert into Supabase if configured
            if (supabase) {
              const { data, error } = await supabase
                .from('mensajes_prueba')
                .insert([
                  { 
                    telefono: phone_number, 
                    nombre_contacto: contact_name,
                    mensaje: text,
                    fecha_recibido: timestamp
                  }
                ]);

              if (error) {
                console.error('❌ Error guardando en Supabase:', error.message);
              } else {
                console.log('💾 Mensaje guardado exitosamente en la base de datos (Supabase).');
              }
            } else {
               console.log('⚠️ Supabase no está configurado en tu .env. El mensaje no se guardó en BD.');
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error procesando el Webhook:', error);
  }
});

// =============================================
// Endpoint para RESPONDER desde el Dashboard
// =============================================
app.post('/send-message', async (req, res) => {
  const { telefono, mensaje } = req.body;

  if (!telefono || !mensaje) {
    return res.status(400).json({ error: 'Se requieren telefono y mensaje.' });
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${process.env.META_PHONE_ID}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'text',
      text: { body: mensaje }
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Mensaje enviado a ${telefono}: ${mensaje}`);

    // Guardar mensaje saliente en Supabase
    if (supabase) {
      await supabase.from('mensajes_prueba').insert([{
        telefono,
        nombre_contacto: 'NARA (Staff)',
        mensaje,
        direccion: 'saliente',
        fecha_recibido: new Date().toISOString()
      }]);
    }

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// =============================================
// Endpoint de salud para Railway
// =============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'NARA WhatsApp Server', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🚀 Servidor NARA corriendo en puerto ${port}`);
  console.log(`📡 Webhook: /webhook | 💬 Send: /send-message | ❤️ Health: /health`);
});

