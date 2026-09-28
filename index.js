const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

app.get('/', (req, res) => {
  res.send('Gemini Node.js Bot Running!');
});

app.post('/', async (req, res) => {
  try {
    const update = req.body;
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const userText = update.message.text;

      let replyText = "नमस्ते! शांति निकेतन साड़ी केंद्र में आपका स्वागत है। अभी सर्वर पर थोड़ा लोड है, कृपया 1 मिनट बाद पुनः प्रयास करें।";

      try {
        const prompt = `तुम 'शांति निकेतन साड़ी केंद्र' (Deendayal Nagar, behind Sai Mandir Road, Moradabad) के एक बहुत ही विनम्र और मददगार वर्चुअल असिस्टेंट हो। 
        ग्राहक का सवाल: '${userText}'
        कृपया ग्राहक को हिंदी में एक छोटा और स्पष्ट जवाब दो।`;

        const result = await model.generateContent(prompt);
        replyText = result.response.text();
      } catch (aiError) {
        console.error('Gemini API temporary error:', aiError.message);
      }

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: replyText
      });
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
