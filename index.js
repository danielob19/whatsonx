const express = require('express');
const multer = require('multer');
const axios = require('axios');
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');
const app = express();

app.use(express.json()); // Para parsear JSON en las solicitudes

// Ruta raíz "/"
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
  const fileName = req.file.originalname;
  res.send(`Archivo CSV subido correctamente: ${fileName}`);
});

// Configuración e integración de IBM Watson Assistant
const assistant = new AssistantV2({
  version: '2023-04-01',
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_API_KEY,
  }),
  serviceUrl: process.env.IBM_SERVICE_URL,
});

// Función para obtener respuesta de GPT
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
    console.error("Error en GPT:", error);
    return "Lo siento, hubo un problema al obtener la respuesta de GPT.";
  }
}

// Función que procesa la respuesta de Watson y la envía a GPT para enriquecer la respuesta
async function processWatsonAndGPT(sessionId, message) {
  try {
    // Obtener respuesta de Watson
    const watsonResponse = await assistant.message({
      assistantId: process.env.ASSISTANT_ID,
      sessionId: sessionId,
      input: {
        'message_type': 'text',
        'text': message,
      },
    });

    const watsonText = watsonResponse.result.output.generic[0].text;

    // Enviar respuesta de Watson a GPT para enriquecer la respuesta
    const gptResponse = await getGPTResponse(watsonText);

    // Devolver ambas respuestas al usuario
    return { watsonResponse: watsonText, gptResponse: gptResponse };
  } catch (error) {
    console.error("Error en la integración de Watson y GPT:", error);
    throw new Error('Hubo un problema al procesar la solicitud.');
  }
}

// Endpoint para interactuar con Watson y luego con GPT
app.post('/watson-to-gpt', async (req, res) => {
  const { sessionId, message } = req.body;

  try {
    const combinedResponse = await processWatsonAndGPT(sessionId, message);
    res.send(combinedResponse);
  } catch (error) {
    res.status(500).send('Hubo un problema al procesar la solicitud.');
  }
});

// Endpoint para interactuar solo con GPT
app.post('/gpt', async (req, res) => {
  const prompt = req.body.prompt;
  const gptResponse = await getGPTResponse(prompt);
  res.send({ response: gptResponse });
});

// Endpoint para interactuar solo con IBM Watson
app.post('/watson', async (req, res) => {
  const { sessionId, message } = req.body;
  try {
    const watsonResponse = await assistant.message({
      assistantId: process.env.ASSISTANT_ID,
      sessionId: sessionId,
      input: {
        'message_type': 'text',
        'text': message,
      },
    });
    const watsonText = watsonResponse.result.output.generic[0].text;
    res.send({ response: watsonText });
  } catch (error) {
    console.error(error);
    res.status(500).send('Hubo un problema al procesar la solicitud en Watson.');
  }
});

// Configuración del puerto y arranque del servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
