const axios = require('axios');
require('dotenv').config();

const token = process.env.META_ACCESS_TOKEN;
const phoneId = process.env.META_PHONE_ID;
const destination = '5215545004698'; // Número de Diego

async function sendRealMessage() {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        to: destination,
        type: 'text',
        text: {
          body: '¡Hola Diego! 🌟 Este es un mensaje oficial enviado desde el servidor de NARA 360 CRM. \n\n¡La integración con Meta ha sido exitosa y ya estamos operando con el nuevo número oficial! 🚀 CLINICA NARA está lista.'
        }
      }
    });

    console.log('✅ Mensaje real enviado con éxito!');
    console.log('ID del mensaje:', response.data.messages[0].id);
  } catch (error) {
    console.error('❌ Error al enviar mensaje real:');
    console.error(error.response ? error.response.data : error.message);
  }
}

sendRealMessage();
