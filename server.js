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
  // Meta expects a 200 OK immediately
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            const message = change.value.messages[0];
            const contactInfo = change.value.contacts ? change.value.contacts[0] : null;

            const phone_number = message.from;
            const text = message.text ? message.text.body : 'Mensaje multimedia';
            const contact_name = contactInfo?.profile?.name || 'Nuevo Contacto';
            const timestamp = new Date().toISOString();

            console.log(`📩 Mensaje de ${contact_name} (${phone_number}): ${text}`);

            if (!supabase) return;

            // 1. Obtener o crear el contacto
            let { data: contact, error: contactError } = await supabase
              .from('contactos')
              .select('id')
              .eq('telefono', phone_number)
              .single();

            if (!contact) {
              const { data: newContact, error: createError } = await supabase
                .from('contactos')
                .insert([{ 
                  telefono: phone_number, 
                  nombre: contact_name, 
                  fuente: 'Meta',
                  estado: 'nuevo' 
                }])
                .select()
                .single();
              
              if (createError) throw createError;
              contact = newContact;
            }

            // 2. Obtener o crear conversación activa
            let { data: conversation, error: convError } = await supabase
              .from('conversaciones')
              .select('id')
              .eq('contacto_id', contact.id)
              .eq('estado', 'activa')
              .single();

            if (!conversation) {
              const { data: newConv, error: createConvError } = await supabase
                .from('conversaciones')
                .insert([{ 
                  contacto_id: contact.id, 
                  estado: 'activa' 
                }])
                .select()
                .single();
              
              if (createConvError) throw createConvError;
              conversation = newConv;
            }

            // 3. Insertar el mensaje en la tabla real
            const { error: msgError } = await supabase
              .from('mensajes')
              .insert([{
                conversacion_id: conversation.id,
                contacto_id: contact.id,
                direccion: 'entrante',
                tipo: message.type || 'text',
                contenido: text,
                created_at: timestamp
              }]);

            if (msgError) {
              console.error('❌ Error guardando mensaje:', msgError.message);
            } else {
              console.log('💾 Mensaje sincronizado con el Panel de Control.');
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error procesando el Webhook:', error.message);
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

