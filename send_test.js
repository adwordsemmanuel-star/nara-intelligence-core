const axios = require('axios');
require('dotenv').config();

const token = process.env.META_ACCESS_TOKEN;
const phoneId = process.env.META_PHONE_ID;
const destination = '5215545004698'; // Tu número de celular

async function sendMessage() {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v25.0/${phoneId}/messages`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        to: destination,
        type: 'template',
        template: {
          name: 'hello_world',
          language: {
            code: 'en_US'
          }
        }
      }
    });

    console.log('✅ Mensaje enviado con éxito!');
    console.log('ID del mensaje:', response.data.messages[0].id);
  } catch (error) {
    console.error('❌ Error al enviar mensaje:');
    console.error(error.response ? error.response.data : error.message);
  }
}

sendMessage();
