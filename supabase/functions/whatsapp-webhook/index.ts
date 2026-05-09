import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const verifyToken = Deno.env.get('META_VERIFY_TOKEN') || ''
const metaAccessToken = Deno.env.get('META_ACCESS_TOKEN') || ''
const metaPhoneId = Deno.env.get('META_PHONE_ID') || ''

const supabase = createClient(supabaseUrl, supabaseKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

async function getOrCreateContact(phone: string, name: string) {
  let { data: contact } = await supabase.from('contactos').select('*').eq('telefono', phone).maybeSingle()
  if (!contact) {
    const { data: newContact, error } = await supabase.from('contactos').insert([{ telefono: phone, nombre: name }]).select().single()
    if (error) {
      console.error('Error creating contact:', error)
      return null
    }
    contact = newContact
  }
  return contact
}

async function getOrCreateConversation(contactId: string) {
  let { data: conv } = await supabase.from('conversaciones').select('*').eq('contacto_id', contactId).eq('estado', 'abierta').maybeSingle()
  if (!conv) {
    const { data: newConv, error } = await supabase.from('conversaciones').insert([{ contacto_id: contactId }]).select().single()
    if (error) {
      console.error('Error creating conversation:', error)
      return null
    }
    conv = newConv
  }
  return conv
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)

  // 1. Verificación de Webhook de Meta (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verificado exitosamente!')
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // 2. Envío de Mensajes desde el Dashboard (POST con action=send)
  if (req.method === 'POST' && url.searchParams.get('action') === 'send') {
    try {
      const { telefono, mensaje } = await req.json()
      if (!telefono || !mensaje) {
        return new Response(JSON.stringify({ error: 'Falta telefono o mensaje' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const metaUrl = `https://graph.facebook.com/v19.0/${metaPhoneId}/messages`
      const payload = {
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        text: { body: mensaje }
      }

      const response = await fetch(metaUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${metaAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const responseData = await response.json()
      if (!response.ok) throw new Error(JSON.stringify(responseData))

      // Guardar en SCHEMA V2
      const contact = await getOrCreateContact(telefono, 'NARA (Staff)')
      if (contact) {
        const conv = await getOrCreateConversation(contact.id)
        if (conv) {
          await supabase.from('mensajes').insert([{
            conversacion_id: conv.id,
            direccion: 'saliente',
            contenido: mensaje,
            wamid: responseData.messages?.[0]?.id
          }])
        }
      }

      return new Response(JSON.stringify({ success: true, data: responseData }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // 3. Recepción de Mensajes de Meta (POST)
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.value?.messages?.[0]) {
              const msg = change.value.messages[0]
              const contactData = change.value.contacts?.[0]
              const phone = msg.from
              const name = contactData?.profile?.name || 'Desconocido'

              const contact = await getOrCreateContact(phone, name)
              if (!contact) continue
              
              const conv = await getOrCreateConversation(contact.id)
              if (!conv) continue

              const type = msg.type
              let content = ''
              let mediaId = null
              let mimeType = null

              if (type === 'text') {
                content = msg.text.body
              } else if (msg[type]) {
                const media = msg[type]
                mediaId = media.id
                mimeType = media.mime_type
                content = `[Archivo ${type}] ${media.caption || ''}`
              }

              const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000).toISOString() : new Date().toISOString()

              // Guardar en mensajes SCHEMA V2
              await supabase.from('mensajes').insert([{
                conversacion_id: conv.id,
                wamid: msg.id,
                direccion: 'entrante',
                tipo: type,
                contenido: content,
                media_id: mediaId,
                mime_type: mimeType,
                fecha_recibido: timestamp
              }])

              console.log(`📩 Mensaje ${type} de ${name}: ${content}`)
            }
          }
        }
      }
      return new Response('EVENT_RECEIVED', { status: 200 })
    } catch (err: any) {
      return new Response('Error', { status: 500 })
    }
  }

  return new Response('Not Found', { status: 404 })
})
