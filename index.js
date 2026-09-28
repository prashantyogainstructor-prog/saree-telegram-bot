const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get('/', (req, res) => {
  res.send('Gemini Bot Running!');
});

app.post('/', async (req, res) => {
  try {
    const update = req.body;
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const userText = update.message.text;

      let replyText = "नमस्ते! शांति निकेतन साड़ी केंद्र में आपका स्वागत है। मैं आपकी क्या सहायता कर सकता हूँ?";

      try {
        const prompt = `तुम 'शांति निकेतन साड़ी केंद्र' (दीनदयाल नगर, साईं मंदिर रोड के पीछे, मुरादाबाद) के एक विनम्र और सहायक वर्चुअल असिस्टेंट हो। 
ग्राहक का सवाल: '${userText}'
कृपया ग्राहक को हिंदी में बहुत ही सुंदर, संक्षिप्त और सटीक उत्तर दो।`;

        // Direct Google REST API call
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            contents: [{ parts: [{ text: prompt }] }]
          },
          { headers: { 'Content-Type': 'application/json' } }
        );

        if (
          response.data &&
          response.data.candidates &&
          response.data.candidates[0].content &&
          response.data.candidates[0].content.parts[0].text
        ) {
          replyText = response.data.candidates[0].content.parts[0].text;
        }
      } catch (aiError) {
        console.error('AI Error:', aiError.response ? aiError.response.data : aiError.message);
      }

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: replyText
      });
    }
  } catch (error) {
    console.error('Webhook error:', error.message);
  }
  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
