# Instrucciones Manuales: PoC WhatsApp a Supabase

Sigue estos pasos. Una vez que tengas las llaves, crea una copia del archivo `.env.example`, llámalo `.env` y pega tus llaves ahí.

## Parte 1: Base de Datos (Supabase)
1. Entra a [Supabase.com](https://supabase.com) y crea un proyecto nuevo (ej. "NARA-PoC").
2. Ve al "SQL Editor" (ícono de código en el menú izquierdo) y ejecuta este comando para crear la tabla:
   ```sql
   create table mensajes_prueba (
     id bigint primary key generated always as identity,
     fecha_recibido timestamp with time zone,
     telefono text,
     nombre_contacto text,
     mensaje text
   );
   ```
3. Ve a `Project Settings` (Ícono de engrane) -> `API`. Copia la **Project URL** y la **anon public Key**.
4. Pega ambas cosas en tu nuevo archivo `.env`.

## Parte 2: El Túnel Público (Ngrok)
Como Meta necesita una URL pública y tu Mac es privada, necesitamos Ngrok.
1. Abre tu terminal.
2. Ve a la carpeta del proyecto: `cd /Users/diego/Downloads/PROYECTOS_DIEGO/NARA_360_CRM/whatsapp_poc`
3. Ejecuta: `npx ngrok http 3000` (Presiona Y si te pide instalarlo).
4. Ngrok te dará una URL "Forwarding" que se ve así: `https://abcd-123.ngrok.app`. Copia esa URL. **¡No cierres esa terminal!**

## Parte 3: Encender el Servidor
1. Abre **otra** pestaña en tu terminal (dejando la de Ngrok corriendo).
2. Ve a la carpeta: `cd /Users/diego/Downloads/PROYECTOS_DIEGO/NARA_360_CRM/whatsapp_poc`
3. Ejecuta: `npm start`
4. Deberías ver: "🚀 Servidor de Prueba NARA corriendo en http://localhost:3000"

## Parte 4: Conectar WhatsApp (Meta for Developers)
1. Entra a [Meta for Developers](https://developers.facebook.com/) y crea una App (Tipo: Empresa).
2. En productos, agrega **WhatsApp**.
3. Ve a WhatsApp -> **Configuración de la API**. Verás un Número de Prueba que Meta te regala.
4. Ve a WhatsApp -> **Configuración** (Webhooks), dale a "Editar".
5. En **URL de devolución de llamada**, pega tu link de ngrok seguido de `/webhook` (Ej: `https://abcd-123.ngrok.app/webhook`).
6. En **Token de verificación**, pega la contraseña de tu archivo `.env` (Ej: `nara_360_prueba_segura_123`).
7. Haz clic en Verificar y Guardar. Si tu servidor local está corriendo, Meta lo verificará con éxito.
8. Dale a "Administrar campos de webhook" y suscríbete a la casilla de **messages**.

## Parte 5: ¡La Prueba Mágica!
1. En el panel de Meta, agrega tu número de celular personal a los números autorizados.
2. Agrega el Número de Prueba de Meta a los contactos de tu celular personal.
3. Mándale un WhatsApp a ese número ("Hola prueba NARA").
4. Observa cómo el mensaje aparece en tu terminal y, mágicamente, en tu base de datos de Supabase.
