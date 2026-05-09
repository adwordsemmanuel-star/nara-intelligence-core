const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// CONFIG
const SUPABASE_URL = 'https://lnjedahsquawinemhmfi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vI0L7JI3ZTJbArACHyp6qQ_hLJ3EIVC';
const AGENT_API_URL = 'https://lnjedahsquawinemhmfi.supabase.co/functions/v1/whatsapp-webhook?action=send';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Personalidad de NARA (Cerebro de Cierre v3.4 — Etapa 3: Reserva Temporal)
const NARA_PROMPT = `
Eres la Asistente de NARA Psychology. Tu misión es COORDINAR la agenda en tiempo real y cerrar ventas.

PLAYBOOK DE VENTA:
1. BIENVENIDA: Saludo cálido.
2. CALIFICACIÓN: Breve motivo de consulta.
3. TARIFA: 
   - Pareja: Emmanuel ($1,400), Especialistas ($1,200).
   - Individual: Emmanuel ($1,300), Especialistas ($1,000).
   - Niños/Adolescentes: Aracelly ($1,000 / Paquete 5 x $3,600).
4. RESERVA (CRÍTICO): Si el paciente pide un horario, usa "Déjame revisar...".
5. CIERRE: Genera el link de pago y avisa que el espacio se libera en 2 HORAS si no se confirma el depósito.

REGLAS DE COORDINACIÓN:
- Al apartar un slot, marca estado='apartado'.
- Envía el link de pago inmediatamente.
- Informa que la reserva es temporal (2 hrs).
`;

async function createTemporaryHold(contactoId, psicologoId, fechaHora) {
    const expiration = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2 horas
    const linkPago = `https://pago.nara.com/reserva?id=${contactoId}`;

    console.log(`📅 COORDINADOR: Creando reserva temporal para ${fechaHora}. Expira: ${expiration}`);

    const { error } = await supabase
        .from('agenda')
        .update({
            estado: 'apartado',
            contacto_id: contactoId,
            link_pago: linkPago,
            expira_en: expiration
        })
        .eq('psicologo_id', psicologoId)
        .eq('fecha_hora', fechaHora)
        .eq('estado', 'disponible');

    if (error) {
        console.error('❌ Error al crear hold:', error.message);
        return null;
    }

    return linkPago;
}

async function updateContactMemory(contactoId, data) {
    if (!data.nombre && !data.motivo && !data.resumen && !data.fuente) return;
    console.log(`🧠 MEMORIA: Actualizando contacto ${contactoId}:`, data);
    const updates = {};
    if (data.nombre) updates.nombre = data.nombre;
    if (data.fuente) updates.fuente = data.fuente;
    
    if (data.resumen || data.motivo) {
        updates.notas_admin = `📌 RESUMEN: ${data.resumen || ''}\n❓ MOTIVO: ${data.motivo || ''}`;
    }
    const { error } = await supabase.from('contactos').update(updates).eq('id', contactoId);
    if (error) console.error('❌ Error actualizando memoria:', error.message);
    else console.log('✅ Memoria actualizada exitosamente.');
}

async function sendMessage(telefono, mensaje) {
    try {
        await axios.post(AGENT_API_URL, { telefono, mensaje });
        console.log(`✅ MENSAJE ENVIADO A ${telefono}`);
    } catch (e) {
        console.error('❌ Error enviando mensaje:', e.message);
    }
}

async function runAgent() {
    console.log('🚀 NARA AI Agent v3.6 (Modo Híbrido) Activo...');
    
    let processedIds = new Set();
    const { data: initialData } = await supabase.from('mensajes').select('id').order('fecha_recibido', { ascending: false }).limit(50);
    if (initialData) initialData.forEach(m => processedIds.add(m.id));

    setInterval(async () => {
        try {
            // 1. VERIFICAR MODO DE OPERACIÓN
            const { data: configData } = await supabase
                .from('admin_config')
                .select('value')
                .eq('key', 'operational_mode')
                .single();
            
            const operationalMode = configData?.value?.mode || 'intelligent';

            const { data: messages, error } = await supabase
                .from('mensajes')
                .select('*, conversaciones(contacto_id, contactos(*))')
                .eq('direccion', 'entrante')
                .order('fecha_recibido', { ascending: false })
                .limit(10);

            if (error) throw error;

            for (const msg of messages) {
                if (processedIds.has(msg.id)) continue;
                
                const contacto = msg.conversaciones?.contactos;
                if (!contacto) continue;

                const contenido = msg.contenido.toLowerCase();
                const telefono = contacto.telefono;

                console.log(`\n📩 NUEVO MENSAJE de ${contacto.nombre || telefono}: ${msg.contenido}`);

                const profilingData = {};
                
                // DETECCIÓN DE FUENTE
                if (contenido.includes('google')) profilingData.fuente = 'google_ads';
                if (contenido.includes('meta') || contenido.includes('facebook')) profilingData.fuente = 'meta_ads';

                // EXTRACCIÓN DE NOMBRE
                if (!contacto.nombre || contacto.nombre === 'Desconocido' || contacto.nombre === 'Prueba Diego') {
                    const nameMatch = msg.contenido.match(/(?:soy|llamo|me llamo|mi nombre es)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
                    if (nameMatch) profilingData.nombre = nameMatch[1];
                    else if (msg.contenido.split(' ').length <= 3 && !contenido.includes('hola')) profilingData.nombre = msg.contenido;
                }

                // EXTRACCIÓN DE MOTIVO
                if (contenido.includes('ansiedad')) profilingData.motivo = 'Ansiedad';
                if (contenido.includes('pareja')) profilingData.motivo = 'Terapia de Pareja';
                if (contenido.includes('adultos')) profilingData.motivo = 'Terapia Adultos';

                // ACTUALIZAR MEMORIA (Incluso en modo manual, para que el operador vea los datos)
                if (Object.keys(profilingData).length > 0) {
                    await updateContactMemory(contacto.id, profilingData);
                    if (profilingData.nombre) contacto.nombre = profilingData.nombre;
                }

                // SI EL MODO ES EMERGENCIA O MANUAL, NO RESPONDER AUTOMÁTICAMENTE
                if (operationalMode !== 'intelligent') {
                    console.log(`⏳ MODO ${operationalMode.toUpperCase()}: IA en silencio. Esperando intervención humana.`);
                    processedIds.add(msg.id);
                    continue;
                }

                // LÓGICA DE RESPUESTA AUTOMÁTICA (SOLO SI ES MODO INTELIGENTE)
                let respuesta = '';

                if (contenido.includes('hola') || contenido.includes('buenas')) {
                    respuesta = `¡Hola! Qué gusto saludarte. Soy NARA, asistente virtual de NARA Psychology. 👋 Vi que nos contactaste por nuestro anuncio. ¿En qué podemos apoyarte hoy?`;
                } 
                else if ((profilingData.nombre || profilingData.motivo) && !contenido.includes('precio')) {
                    const nombreUsar = profilingData.nombre || contacto.nombre || '';
                    const motivo = profilingData.motivo || 'tu consulta';
                    
                    if (motivo === 'Terapia de Pareja') {
                        respuesta = `Muchas gracias${nombreUsar ? ' ' + nombreUsar : ''}. Para Terapia de Pareja, el Dr. Emmanuel tiene una tarifa de $1,400 y las especialistas Adriana y Angélica de $1,200. ¿Te gustaría que revisemos disponibilidad?`;
                    } else if (motivo === 'Ansiedad' || motivo === 'Terapia Adultos') {
                        respuesta = `Muchas gracias${nombreUsar ? ' ' + nombreUsar : ''}. Para Terapia Individual, el Dr. Emmanuel tiene una tarifa de $1,300 y las especialistas Adriana y Angélica de $1,000. ¿Te gustaría agendar una valoración?`;
                    } else if (motivo.includes('Niños') || motivo.includes('Adolescentes')) {
                        respuesta = `Muchas gracias${nombreUsar ? ' ' + nombreUsar : ''}. Para niños y adolescentes, nuestra especialista es Aracelly Rodríguez. La sesión individual cuesta $1,000, pero tenemos un paquete recomendado de 5 sesiones por $3,600. ¿Te interesa conocer más sobre esta modalidad?`;
                    } else {
                        respuesta = `Muchas gracias${nombreUsar ? ' ' + nombreUsar : ''}. Entiendo que te interesa apoyo para ${motivo}. Nuestras sesiones individuales inician en $1,000 con especialistas. ¿Te gustaría agendar una cita?`;
                    }
                }
                else if (contenido.includes('precio') || contenido.includes('costo') || contenido.includes('cuanto')) {
                    respuesta = `Claro. Para Individual: Emmanuel ($1,300), Especialistas ($1,000). Para Pareja: Emmanuel ($1,400), Especialistas ($1,200). Para Niños/Adolescentes: Aracelly ($1,000 sesión / $3,600 paquete de 5). ¿Cuál opción te interesa más?`;
                }
                else if (contenido.includes('agendar') || contenido.includes('cita') || contenido.includes('horario') || contenido.includes('disponibilidad')) {
                    respuesta = `¡Excelente decisión! Déjame revisar... 📅 Tenemos un espacio disponible para este domingo a las 5:00 PM con el Dr. Emmanuel o el lunes a las 10:00 AM con nuestras especialistas. ¿Cuál te queda mejor?`;
                }
                else {
                    // Si ya tenemos nombre, pero el mensaje fue ambiguo, preguntar por el motivo
                    if (contacto.nombre && !profilingData.motivo) {
                        respuesta = `Un gusto saludarte, ${contacto.nombre}. Para canalizarte con el especialista ideal, ¿podrías contarme un poco sobre el motivo de tu consulta? (Individual, Pareja, Niños o Adolescentes)`;
                    } else {
                        respuesta = `Entiendo perfectamente. Para darte una mejor atención, ¿podrías decirme tu nombre y el motivo de tu consulta?`;
                    }
                }

                if (respuesta) {
                    await sendMessage(telefono, respuesta);
                }

                processedIds.add(msg.id);
            }
        } catch (e) {
            console.error('Error en el loop del agente:', e.message);
        }
    }, 5000);
}

runAgent();
