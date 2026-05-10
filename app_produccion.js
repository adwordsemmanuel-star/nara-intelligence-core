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

const ALMA_PROMPT = `
Eres ALMA, la asistente virtual de NARA Psychology. Tu misión es ayudar a los pacientes a entender nuestros servicios y facilitar el agendamiento.

IDENTIDAD Y TRANSPARENCIA:
- Preséntate siempre: "[ALMA-V2] Hola, soy Alma, asistente de NARA. Estoy para atenderte." (Solo en el primer mensaje de la charla).
- Sé transparente: Eres un asistente virtual, pero siempre ofreces la opción de hablar con un humano.

REGLAS DE ORO DE CONVERSACIÓN:
1. RESPUESTA PUNTUAL: Si preguntan algo específico (niños, precios, ubicación), responde eso PRIMERO de forma amable y cálida.
2. OPCIONES DE CIERRE: Al final de cada respuesta, ofrece SIEMPRE una de estas opciones según el flujo:
   - "¿Te gustaría que revise qué días tenemos disponibles para reservar?"
   - "¿Deseas más información sobre algún especialista?"
   - "¿Prefieres ser atendido directamente por un psicólogo para resolver dudas técnicas?"
3. PROTOCOLO DE ENLACE HUMANO: Si el usuario pide hablar con un psicólogo o humano, responde:
   "Con gusto. Por favor dame oportunidad de enlazarte con Emmanuel, quien atenderá todas tus dudas personalmente. Dame un momento."

TARIFAS:
- Pareja: Emmanuel ($1,400), Especialistas ($1,200).
- Individual: Emmanuel ($1,300), Especialistas ($1,000).
- Niños/Adolescentes (Aracelly): $1,000 sesión o Paquete 5 por $3,600.

MODO DE OPERACIÓN:
- Sé empática, profesional y puntual.
- Si el humano (Emmanuel) interviene y dice: "Un placer atenderte, te dejo con el asistente para reservar tu espacio", tú retomas la charla con naturalidad para cerrar la cita.
`;

// --- 2. AGENTE INTELIGENTE ---

let processedIds = new Set();

async function runAgentLogic() {
  try {
    const { data: config } = await supabase.from('admin_config').select('operational_mode').single();
    if (config?.operational_mode === 'emergency') return;

    // Obtener el último mensaje entrante GLOBAL para procesar de uno en uno
    const { data: messages, error } = await supabase
      .from('mensajes')
      .select('*')
      .eq('direccion', 'entrante')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !messages || messages.length === 0) return;

    const msg = messages[0];
    if (processedIds.has(msg.id)) return;
    processedIds.add(msg.id);

    // Verificar si ya respondimos a este mensaje específico (para evitar doble respuesta al reiniciar)
    const { data: alreadyReplied } = await supabase
      .from('mensajes')
      .select('id')
      .eq('conversacion_id', msg.conversacion_id)
      .eq('direccion', 'saliente')
      .gt('created_at', msg.created_at);

    if (alreadyReplied && alreadyReplied.length > 0) return;

    // Obtener Historial
    const { data: history } = await supabase
      .from('mensajes')
      .select('direccion, contenido')
      .eq('conversacion_id', msg.conversacion_id)
      .order('created_at', { ascending: false })
      .limit(6);

    const formattedHistory = history?.reverse().map(m => `${m.direccion === 'entrante' ? 'Usuario' : 'ALMA'}: ${m.contenido}`).join('\n');
    const { data: contact } = await supabase.from('contactos').select('*').eq('id', msg.contacto_id).single();

    console.log(`🧠 Respondiendo a: ${contact?.nombre || contact?.telefono}`);

    const result = await model.generateContent([
      { text: ALMA_PROMPT },
      { text: `Historial:\n${formattedHistory}` },
      { text: `Pregunta actual: ${msg.contenido}` }
    ]);
    
    const responseText = result.response.text();
    await sendWhatsAppMessage(contact.telefono, responseText, msg.conversacion_id, contact.id);
    console.log(`✅ Respuesta con memoria enviada.`);
    
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
