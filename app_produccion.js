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

            // Lanzar lógica del agente inmediatamente
            runAgentLogic(conv.id, contactId, text);
          }
        }
      }
    }
  } catch (e) { console.error('❌ Error Webhook:', e.message); }
});

// Conexión Directa por API activa



const ALMA_PROMPT = `
Eres ALMA, la asistente virtual oficial de NARA Psychology. Tu misión es resolver dudas de pacientes y facilitar el agendamiento basándote EXCLUSIVAMENTE en el CONOCIMIENTO OFICIAL proporcionado abajo.

DIRECTRICES:
- Sé cálida, profesional y concisa.
- No inventes precios ni servicios. Si no tienes la información, ofrece canalizar con un humano.
- MEMORIA: Si ya te presentaste en el historial, continúa la charla con naturalidad sin repetir tu nombre.
- CIERRE: Termina siempre con una pregunta breve para avanzar en la cita.
`;

// --- 2. AGENTE INTELIGENTE ---

async function listAvailableModels() {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`;
    const { data } = await axios.get(listUrl);
    console.log('📋 MODELOS DISPONIBLES EN ESTA LLAVE:', data.models.map(m => m.name.replace('models/', '')));
  } catch (e) {
    console.error('❌ Error listando modelos:', e.response?.data || e.message);
  }
}
listAvailableModels();

async function runAgentLogic(conversacion_id, contacto_id, text) {
  console.log(`🤖 ALMA activada para conv: ${conversacion_id}`);
  try {
    // 1. ALINEACIÓN CON CONTROL CENTER Y RECUPERACIÓN DE MEMORIA (RAG)
    const [configRes, knowledgeRes] = await Promise.all([
      supabase.from('admin_config').select('value').eq('key', 'operational_mode').single(),
      supabase.from('nara_knowledge').select('contenido')
    ]);
    
    const operationalMode = configRes.data?.value?.mode || 'intelligent';
    const knowledgeBase = knowledgeRes.data?.map(k => k.contenido).join('\n') || 'No hay información adicional.';

    if (operationalMode !== 'intelligent') {
      console.log(`⚠️ MODO ${operationalMode.toUpperCase()} activo. ALMA en silencio.`);
      return;
    }

    // Obtener Historial
    const { data: history } = await supabase
      .from('mensajes')
      .select('direccion, contenido')
      .eq('conversacion_id', conversacion_id)
      .order('created_at', { ascending: false })
      .limit(6);

    const formattedHistory = history?.reverse().map(m => `${m.direccion === 'entrante' ? 'Usuario' : 'ALMA'}: ${m.contenido}`).join('\n');
    const { data: contact } = await supabase.from('contactos').select('*').eq('id', contacto_id).single();

    console.log(`🧠 Procesando IA para: ${contact?.nombre}`);

    // Lista de modelos a intentar (usando la lista real de tu llave)
    const modelsToTry = [
      'models/gemini-2.5-flash', 
      'models/gemini-2.5-pro', 
      'models/gemini-2.0-flash', 
      'models/gemini-2.0-flash-lite'
    ];
    let response;
    let success = false;

    for (const modelName of modelsToTry) {
      try {
        console.log(`📡 Intentando con: ${modelName} (v1beta)...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const fullPrompt = `${ALMA_PROMPT}\n\n### CONOCIMIENTO OFICIAL NARA:\n${knowledgeBase}\n\n### HISTORIAL RECIENTE:\n${formattedHistory}\n\n### USUARIO:\n${text}`;

        response = await axios.post(geminiUrl, {
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
        });
        success = true;
        break; 
      } catch (err) {
        console.log(`❌ Falló ${modelName}:`, err.response?.data?.error?.message || err.message);
      }
    }

    if (!success) {
      console.error('🚨 NINGÚN MODELO FUNCIONÓ. Reintentando listado...');
      await listAvailableModels();
      return;
    }

    const responseText = response.data.candidates[0].content.parts[0].text;
    
    console.log(`📤 Enviando respuesta de ALMA...`);
    await sendWhatsAppMessage(contact.telefono, responseText, conversacion_id, contacto_id);
    console.log(`✅ Respuesta enviada exitosamente.`);
    
  } catch (e) { 
    console.error('❌ Error en ALMA Logic:', e.response?.data || e.message); 
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

// --- 3. DASHBOARD API (Para mensajes manuales) ---
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

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 ALMA CORE v3.7 Activa en puerto ${port}`);
});
