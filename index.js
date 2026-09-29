const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { GoogleGenAI, Modality } = require('@google/genai');

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' }
  }
});

// User session storage (Memory me temporary user states)
const userSessions = {};

// Helper: Telegram se photo download karke Base64 banana
async function getTelegramPhotoBase64(fileId) {
  const getFileUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`;
  const res = await axios.get(getFileUrl);
  const filePath = res.data.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
  
  const imgRes = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
  const base64Data = Buffer.from(imgRes.data).toString('base64');
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { base64Data, mimeType };
}

// Helper: Telegram par image buffer send karna
async function sendPhotoToTelegram(chatId, base64Buffer, caption) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('photo', base64Buffer, { filename: 'tryon.png', contentType: 'image/png' });

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form, {
    headers: form.getHeaders()
  });
}

// AI Studio ka exact prompt
function getTryOnPrompt() {
  return `IMAGE 1 is the real customer and must remain the same person. IMAGE 2 is the exact garment to be worn. Preserve the customer's identity, facial structure, skin tone, hair, hairstyle, natural body appearance and recognizable characteristics. Enhance only photographic quality such as clarity, sharpness, lighting, exposure, and natural detail. Do not change the person's identity or create a new face. Dress the same customer in the exact referenced garment. Preserve the garment's original colour, design, pattern, border, fabric, embroidery, texture, cut and visible details. Make the garment physically realistic on the customer's body. Replace/cover the relevant original clothing naturally so that the old clothing does not incorrectly remain visible. Use realistic lighting, folds, draping, shadows and perspective. Create a tasteful, realistic background appropriate for the garment while keeping the customer and garment as the main focus. The final image should look like a professional photograph of the same real customer wearing the actual selected garment. Do not make the customer look like a generic AI model.
  
GARMENT SPECIFIC (SAREE):
- The garment in IMAGE 2 is an authentic Indian SAREE.
- Realistically drape this saree around the customer from IMAGE 1: form neat, classical pleats at the waist, tailor a matching or coordinated blouse complementing the neckline, and drape the pallu gracefully over the shoulder to display the exact pallu weave, border embroidery, and zari work.
- Accurately preserve the exact color hue, silk sheen, zari/golden threads, borders, motifs, and texture of the saree from IMAGE 2.
- Cleanly drape the saree so that the customer's previous clothes are completely replaced without any collar or old fabric peeking through.
- Background: A premium, elegant Indian saree showroom with soft, warm ambient lighting.`;
}

// Model generation function
async function generateTryOnImage(customer, garment) {
  const modelsToTry = ['gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image'];
  const prompt = getTryOnPrompt();

  const parts = [
    { inlineData: { data: customer.base64Data, mimeType: customer.mimeType } },
    { inlineData: { data: garment.base64Data, mimeType: garment.mimeType } },
    { text: prompt }
  ];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE] }
      });

      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData?.data) {
            return part.inlineData.data;
          }
        }
      }
    } catch (err) {
      console.warn(`Model ${model} error, trying fallback...`, err.message);
    }
  }
  throw new Error("Try-On Image generation failed on all models.");
}

app.get('/', (req, res) => {
  res.send('Shanti Niketan Saree Try-On Bot Running!');
});

app.post('/', async (req, res) => {
  try {
    const update = req.body;
    if (!update.message) return res.sendStatus(200);

    const chatId = update.message.chat.id;
    const session = userSessions[chatId] || { step: 'IDLE' };

    // Agar text message aaya hai
    if (update.message.text) {
      const text = update.message.text.trim().toLowerCase();

      if (text === '/start' || text === 'reset' || text === 'hi' || text === 'namaste') {
        userSessions[chatId] = { step: 'WAITING_CUSTOMER_PHOTO' };
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `नमस्ते! 🙏 **शांति निकेतन साड़ी केंद्र** (दीनदयाल नगर, मुरादाबाद) के Virtual Try-On Studio में आपका स्वागत है।\n\n✨ **Step 1:** कृपया ग्राहक की एक साफ़ (Full-length या Half) फ़ोटो भेजें।`
        });
        return res.sendStatus(200);
      }
    }

    // Agar photo aayi hai
    if (update.message.photo && update.message.photo.length > 0) {
      const highestPhoto = update.message.photo[update.message.photo.length - 1];

      if (session.step === 'WAITING_CUSTOMER_PHOTO' || session.step === 'IDLE') {
        session.customerPhoto = await getTelegramPhotoBase64(highestPhoto.file_id);
        session.step = 'WAITING_GARMENT_PHOTO';
        userSessions[chatId] = session;

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `✅ **ग्राहक की फ़ोटो मिल गई!**\n\n✨ **Step 2:** अब जिस साड़ी या सूट को पहनाकर देखना चाहते हैं, उसकी साफ़ फ़ोटो भेजें।`
        });
        return res.sendStatus(200);
      }

      if (session.step === 'WAITING_GARMENT_PHOTO') {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `🎨 **AI साड़ी ड्रेप कर रहा है...**\nकृपया 15-30 सेकंड प्रतीक्षा करें, आपकी एक्सक्लूसिव Try-On फ़ोटो तैयार की जा रही है!`
        });

        const garmentPhoto = await getTelegramPhotoBase64(highestPhoto.file_id);
        const resultBase64 = await generateTryOnImage(session.customerPhoto, garmentPhoto);
        const imageBuffer = Buffer.from(resultBase64, 'base64');

        await sendPhotoToTelegram(
          chatId,
          imageBuffer,
          `✨ **शांति निकेतन साड़ी केंद्र - Virtual Try-On** ✨\n\nपसंद आने पर ऑर्डर व बुकिंग के लिए संपर्क करें:\n📞 9412142120\n📍 दीनदयाल नगर, साईं मंदिर रोड के पीछे, मुरादाबाद\n\nदुबारा ट्राय करने के लिए नई फ़ोटो भेजें या 'reset' लिखें।`
        );

        userSessions[chatId] = { step: 'IDLE' };
        return res.sendStatus(200);
      }
    }
  } catch (err) {
    console.error('Bot Error:', err.message);
  }
  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
