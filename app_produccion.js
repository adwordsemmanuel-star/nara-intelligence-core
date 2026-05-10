require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN ---
const port = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// --- 1. WEBHOOK RECEIVER (Lo que antes era server.js) ---

app.get('/webhook', (req, res) => {
  const verify_token = process.env.META_VERIFY_TOKEN;
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verify_token) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder rápido a Meta
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            const message = change.value.messages[0];
            const contactInfo = change.value.contacts ? change.value.contacts[0] : null;
            const phone = message.from;
            const text = message.text ? message.text.body : 'Multimedia';
            const name = contactInfo?.profile?.name || 'Nuevo Contacto';

            console.log(`📩 Recibido: ${name} (${phone}): ${text}`);

            // Sincronizar con DB
            const { data: contact } = await supabase.from('contactos').select('id').eq('telefono', phone).single();
            let contactId = contact?.id;

            if (!contactId) {
              const { data: newC } = await supabase.from('contactos').insert([{ telefono: phone, nombre: name, fuente: 'WhatsApp' }]).select().single();
              contactId = newC.id;
            }

            let { data: conv } = await supabase.from('conversaciones').select('id').eq('contacto_id', contactId).eq('estado', 'activa').single();
            if (!conv) {
              const { data: newConv } = await supabase.from('conversaciones').insert([{ contacto_id: contactId, estado: 'activa' }]).select().single();
              conv = newConv;
            }

            await supabase.from('mensajes').insert([{
              conversacion_id: conv.id,
              contacto_id: contactId,
              direccion: 'entrante',
              contenido: text
            }]);
          }
        }
      }
    }
  } catch (e) { console.error('❌ Error Webhook:', e.message); }
});

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURACIÓN IA ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const NARA_PROMPT = `
Eres NARA, la asistente virtual experta de NARA Psychology. Tu misión es la conversión de pacientes y coordinación de agenda.
ESTILO: Empática, profesional, directa y resolutiva. Usa emojis de forma sutil.

TARIFAS (CRÍTICO):
- Pareja: Emmanuel ($1,400), Especialistas ($1,200).
- Individual: Emmanuel ($1,300), Especialistas ($1,000).
- Niños/Adolescentes (Aracelly): $1,000 por sesión o Paquete de 5 por $3,600.

PLAYBOOK:
1. CALIFICA: Entiende el motivo de consulta (Pareja, Ansiedad, Depresión, etc.).
2. OFRECE OPCIONES: Presenta a Emmanuel y a las Especialistas con sus precios.
3. CIERRE: Si preguntan disponibilidad, di "Déjame revisar..." y ofrece dos horarios tentativos (ej: Lunes 10am o Martes 5pm).
4. PAGO: Menciona que el espacio se reserva temporalmente por 2 horas tras enviar el link de pago.

REGLA DE ORO: Si el usuario ya dio su nombre, úsalo. Si no, pregúntalo amablemente.
`;

// --- 2. AGENTE INTELIGENTE ---

let processedIds = new Set();

async function runAgentLogic() {
  try {
    // 1. Verificar Modo de Operación
    const { data: config } = await supabase.from('admin_config').select('operational_mode').single();
    const operationalMode = config?.operational_mode || 'intelligent';

    if (operationalMode === 'emergency') {
      console.log('🛡️ MODO EMERGENCIA: Agente en silencio. Intervención humana requerida.');
      return;
    }

    // 2. Buscar nuevos mensajes (Simplificado para evitar errores de relación)
    const { data: messages, error } = await supabase
      .from('mensajes')
      .select('*')
      .eq('direccion', 'entrante')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    for (const msg of messages) {
      if (processedIds.has(msg.id)) continue;
      processedIds.add(msg.id);

      // 3. Generar respuesta con Gemini
      const { data: contact } = await supabase.from('contactos').select('*').eq('id', msg.contacto_id).single();
      const chatHistory = `Usuario: ${msg.contenido}`;
      
      console.log(`🧠 Pensando respuesta para ${contact?.nombre || contact?.telefono || 'Desconocido'}...`);

      const result = await model.generateContent([
        { text: NARA_PROMPT },
        { text: `Contexto del paciente: ${JSON.stringify(contact || {})}` },
        { text: chatHistory }
      ]);
      
      const responseText = result.response.text();

      // 4. Enviar a WhatsApp
      await sendWhatsAppMessage(contact.telefono, responseText, msg.conversacion_id, contact.id);
      console.log(`✅ Respuesta enviada.`);
    }
    
  } catch (e) { 
    console.error('❌ Error Agente:', e.message); 
  }
}

async function sendWhatsAppMessage(telefono, mensaje, conversacion_id, contacto_id) {
  try {
    const url = `https://graph.facebook.com/v19.0/${process.env.META_PHONE_ID}/messages`;
    await axios.post(url, {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'text',
      text: { body: mensaje }
    }, { 
      headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } 
    });

    // Guardar en DB como saliente
    await supabase.from('mensajes').insert([{
      conversacion_id,
      contacto_id,
      direccion: 'saliente',
      contenido: mensaje
    }]);
  } catch (e) {
    console.error('❌ Error enviando WhatsApp:', e.response?.data || e.message);
  }
}

// Iniciar monitoreo
setInterval(runAgentLogic, 10000);

// --- 3. DASHBOARD API ---
app.post('/send-message', async (req, res) => {
  const { telefono, mensaje, conversacion_id, contacto_id } = req.body;
  try {
    const url = `https://graph.facebook.com/v19.0/${process.env.META_PHONE_ID}/messages`;
    await axios.post(url, {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'text',
      text: { body: mensaje }
    }, { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } });

    await supabase.from('mensajes').insert([{
      conversacion_id,
      contacto_id,
      direccion: 'saliente',
      contenido: mensaje
    }]);

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => {
  console.log(`🚀 NARA CORE v3.6 Unificado en puerto ${port}`);
});
