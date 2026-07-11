import { GoogleGenAI } from "@google/genai";

// 1. تعطيل الـ bodyParser الافتراضي لاستقبال ملف الصوت الخام كـ Buffer
export const config = {
  api: {
    bodyParser: false,
  },
};

// 2. إعداد مكتبة جينمي الرسمية الحديثة
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_QURAN_API_KEY,
});

export default async function handler(req, res) {
  // استقبال طلبات POST فقط
  if (req.method !== "POST") {
    return res.status(405).json({ error: "المسار يقبل طلبات POST فقط" });
  }

  try {
    // 3. استخراج نصوص الهيدرز المشفرة القادمة من الواجهة
    const encodedVerse = req.headers['x-reference-text'] || "";
    const referenceText = decodeURIComponent(encodedVerse).trim();

    const encodedReciter = req.headers['x-target-reciter'] || "";
    const targetReciter = decodeURIComponent(encodedReciter).trim();

    // 4. تجميع كتل الصوت بكفاءة عالية متوافقة مع Vercel
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: "الملف الصوتي فارغ أو لم يتم استلامه بشكل صحيح" });
    }

    // 5. صياغة الأمر الإرشادي (Prompt) بدقة عالية
    const prompt = `
      أنت محكّم خبير ومجاز في مسابقة قرآنية عالمية. 
      أمامك تسجيل صوتي لمستمع يحاول محاكاة تلاوة الشيخ المختار: "${targetReciter}".
      الآية أو السورة المراد قراءتها ومحاكاتها هي: "${referenceText}".

      قم بتحليل الملف الصوتي المرفق بدقة عالية وقارنه بالنص الأصلي وبأسلوب وطبقة الشيخ المختار، ثم قَيّم الأداء وأعطِ درجات حقيقية من 10 (يمكن استخدام كسور مثل 8.5) لكل من العناصر التالية:
      1. lahn (اللحن والأداء، وفحص أي إسقاط للكلمات أو أخطاء تشكيل مؤثرة).
      2. nutq (النطق الصحيح ومخارج الحروف العربية والقرآنية).
      3. nafs (التحكم في النفس وطريقة الوقف والابتداء المتزنة).
      4. tajweed (أحكام التجويد العملية مثل المدود، الغنن، الإظهار والإخفاء).
      5. ghilza (مطابقة نبرة الصوت، الترددات، والطبقة الصوتية "بصمة الصوت" لفضيلة الشيخ المختار).

      بناءً على التقييم، صغ نصيحة إرشادية وتوجيهية مشجعة ومخصصة للمستخدم (باللغة العربية وبأسلوب طيب) تخبره فيها بنقاط القوة والضعف وأين يركز ليصبح أداؤه أقرب لتمام التطابق مع الشيخ المختار.

      يجب أن تكون الاستجابة منك عبارة عن كائن JSON صالح وفقط JSON بدون أي نصوص إضافية خارج الكود، بالصيغة التالية تماماً:
      {
        "scores": {
          "lahn": 9.0,
          "nutq": 8.5,
          "nafs": 8.0,
          "tajweed": 7.5,
          "ghilza": 8.2
        },
        "advice": "نصيحة لجنة التحكيم الموجهة هنا..."
      }
    `;

    // 6. الاستدعاء المعتمد والمستقر في الحزمة الحالية لتجنب الـ 404
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash", 
      contents: [
        prompt,
        {
          inlineData: {
            mimeType: "audio/webm",
            data: audioBuffer.toString("base64"),
          },
        },
      ],
      responseMimeType: "application/json"
    });

    // 7. تنظيف النتيجة من أي علامات Markdown محتملة قبل التحليل لتجنب خطأ الـ JSON Syntax
    let resultText = response.text || "";
    resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const analysisResults = JSON.parse(resultText);

    // 8. تصدير النتيجة النهائية للفرونت إند
    return res.status(200).json({
      scores: {
        lahn: Number(analysisResults.scores?.lahn || 0),
        nutq: Number(analysisResults.scores?.nutq || 0),
        nafs: Number(analysisResults.scores?.nafs || 0),
        tajweed: Number(analysisResults.scores?.tajweed || 0),
        ghilza: Number(analysisResults.scores?.ghilza || 0),
      },
      advice: analysisResults.advice || "أداء طيب، استمر في المحاكاة والتدريب."
    });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "فشل في تحليل ومعالجة الملف الصوتي عبر الذكاء الاصطناعي" });
  }
}
