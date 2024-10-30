const express = require('express');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');
const app = express();

// Definir la ruta raíz "/"
app.get('/', (req, res) => {
  res.send('¡Bienvenido! El servidor está funcionando correctamente.');
});

// Configuración de Multer para manejar la carga de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Carpeta donde se guardarán los archivos subidos
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Usar el nombre original del archivo
  }
});

const upload = multer({ storage: storage });

// Ruta para subir el archivo CSV
app.post('/upload-csv', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No se subió ningún archivo.');
  }
  const fileName = req.file.originalname; // Obtener el nombre del archivo
  res.send(`Archivo CSV subido correctamente: ${fileName}`);
});

// Función para interactuar con OpenAI GPT
async function getGPTResponse(prompt) {
  try {
    const response = await axios.post('https://api.openai.com/v1/completions', {
      prompt: prompt,
      model: 'gpt-3.5-turbo',
      max_tokens: 100,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });
    return response.data.choices[0].text;
  } catch (error) {
    console.error(error);
  }
}

// Configuración e interacción con IBM Watson Assistant
const assistant = new AssistantV2({
  version: '2023-04-01',
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_API_KEY,
  }),
  serviceUrl: process.env.IBM_SERVICE_URL,
});

async function sendMessageToWatson(sessionId, message) {
  try {
    const response = await assistant.message({
      assistantId: 'tu_assistant_id', // Reemplaza con el ID de tu asistente
      sessionId: sessionId,
      input: {
        'message_type': 'text',
        'text': message,
      },
    });
    return response.result.output.generic[0].text;
  } catch (error) {
    console.error(error);
  }
}

// Endpoint para interactuar con GPT
app.post('/gpt', async (req, res) => {
  const prompt = req.body.prompt; // Espera el prompt del cuerpo de la solicitud
  const gptResponse = await getGPTResponse(prompt);
  res.send({ response: gptResponse });
});

// Endpoint para interactuar con IBM Watson
app.post('/watson', async (req, res) => {
  const { sessionId, message } = req.body; // Recibe el mensaje y el ID de sesión del cliente
  const watsonResponse = await sendMessageToWatson(sessionId, message);
  res.send({ response: watsonResponse });
});

// Configuración del puerto y arranque del servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
