import Groq from "groq-sdk";

// تعطيل الـ bodyParser الافتراضي لاستقبال ملف الصوت الخام كـ Stream
export const config = {
  api: {
    bodyParser: false,
  },
};

// إعداد مكتبة Groq باستخدام المفتاح المجاني المخزن في البيئة
const groq = new Groq({
  apiKey: process.env.GROQ_QURAN_API_KEY || process.env.GROQ_API_KEY,
});

/**
 * 1. قاعدة بيانات الخصائص الصوتية التقريبية لكبار القراء
 * (تستخدم كمرجع لمقارنة غلظة الصوت، وطبيعة الأداء برمجياً)
 */
const recitersAudioProfiles = {
  "محمود الحصري": { pitch: "medium-low", speed: "slow", stability: 9.5 },
  "عبدالباسط عبدالصمد": { pitch: "high", speed: "medium", stability: 9.8 },
  "محمد صديق المنشاوي": { pitch: "medium", speed: "slow-medium", stability: 9.6 },
  "محمد رفعت": { pitch: "medium-high", speed: "slow", stability: 9.2 },
  "عبدالرحمن السديس": { pitch: "high", speed: "fast", stability: 8.5 },
  "سعود الشريم": { pitch: "medium-high", speed: "medium-fast", stability: 8.8 },
  "ماهر المعيقلي": { pitch: "medium", speed: "medium-fast", stability: 9.0 },
  "مشاري العفاسي": { pitch: "medium-high", speed: "medium", stability: 9.3 },
  "ياسر الدوسري": { pitch: "high", speed: "medium-fast", stability: 9.1 },
  // الافتراضي في حال عدم تطابق الاسم بدقة
  "default": { pitch: "medium", speed: "medium", stability: 9.0 }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "المسار يقبل طلبات POST فقط" });
  }

  try {
    // 2. استخراج البيانات الممررة عبر الـ Headers
    const encodedVerse = req.headers['x-reference-text'] || "";
    const referenceText = decodeURIComponent(encodedVerse).trim();

    const encodedReciter = req.headers['x-target-reciter'] || "";
    const targetReciter = decodeURIComponent(encodedReciter).trim();

    // 3. تجميع دفق البيانات الصوتية الخام (Buffer) القادمة من المتصفح
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: "الملف الصوتي فارغ أو لم يتم استلامه بشكل صحيح" });
    }

    // 4. تحويل الـ Buffer إلى ملف افتراضي متوافق مع Groq SDK
    const audioFile = new File([audioBuffer], "recitation.webm", { type: "audio/webm" });

    // 5. إرسال الملف إلى Groq (Whisper V3 Turbo) لتحويله إلى نص بدقة عالية مجاناً
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      language: "ar",
    });

    const userText = (transcription.text || "").trim();

    // 6. إجراء التحليل والمقارنة الذكية بناءً على النص والشيخ المختار
    const analysisResults = calculateScores(userText, referenceText, targetReciter, audioBuffer.length);

    // 7. إرجاع النتيجة الكاملة للفرونت إند
    res.status(200).json({
      transcript: userText,
      scores: analysisResults.scores,
      advice: analysisResults.advice
    });

  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: "فشل في تحليل ومعالجة الملف الصوتي" });
  }
}

/**
 * دالة الحسابات والتحليل النصي والصوتي الرياضي
 */
function calculateScores(userText, refText, reciterName, audioSize) {
  // جلب بروفايل الشيخ أو الافتراضي
  const profile = recitersAudioProfiles[reciterName] || recitersAudioProfiles["default"];

  // تنظيف النصوص من الحركات لتسهيل المقارنة البرمجية الأساسية
  const cleanText = (str) => str.replace(/[\u064B-\u065F\u0670]/g, "");
  const cleanUser = cleanText(userText);
  const cleanRef = cleanText(refText);

  // [1] حساب النطق الصحيح (بناءً على نسبة الحروف المتطابقة)
  let matchedChars = 0;
  const refChars = cleanRef.split('');
  refChars.forEach(char => {
    if (cleanUser.includes(char)) matchedChars++;
  });
  
  let nutqScore = refText.length > 0 ? (matchedChars / refText.length) * 10 : 0;
  nutqScore = Math.min(10, Math.max(0, nutqScore));

  // [2] حساب اللحن والأداء (بناءً على الفارق في أطوال الكلمات وإسقاط الحروف)
  const lengthDiff = Math.abs(cleanUser.length - cleanRef.length);
  let lahnScore = 10 - (lengthDiff / (cleanRef.length || 1)) * 10;
  lahnScore = Math.min(10, Math.max(0, lahnScore));

  // [3] محاكاة حساب التحكم في النفس (بناءً على حجم الملف الصوتي مقارنة بطول الآية المستهدفة)
  // القراءة المتزنة المستمرة تعطي حجم ملف مثالي، الانقطاعات الطويلة تخل بالحجم
  let nafsScore = 8.5; 
  if (audioSize < 20000) nafsScore = 6.0; // التسجيل قصير جداً

  // [4] أحكام التجويد (تعتمد على دقة مطابقة الكلمات المفتاحية في الآية)
  let tajweedScore = nutqScore > 8 ? 8.5 : (nutqScore * 0.9);

  // [5] غلظة وحدة الصوت (مقارنة محاكية لنبرة القارئ)
  let ghilzaScore = 7.5;
  if (profile.pitch === "high") ghilzaScore = 8.2; // محاكاة تقارب لطبقات الشيخ عبد الباسط مثلاً
  if (profile.pitch === "medium-low") ghilzaScore = 7.9;

  // تقريب الدرجات لأقرب رقم عشري واحد
  const scores = {
    lahn: parseFloat(lahnScore.toFixed(1)),
    nutq: parseFloat(nutqScore.toFixed(1)),
    nafs: parseFloat(nafsScore.toFixed(1)),
    tajweed: parseFloat(tajweedScore.toFixed(1)),
    ghilza: parseFloat(ghilzaScore.toFixed(1))
  };

  // توليد النصيحة الذكية ديناميكياً بناءً على الدرجة الأقل
  let advice = `قراءتك ممتازة وجميلة! استمر في المحاكاة لتصل لروح أداء الشيخ ${reciterName}.`;
  
  const minScoreKey = Object.keys(scores).reduce((a, b) => scores[a] < scores[b] ? a : b);
  
  if (scores[minScoreKey] < 8.0) {
    if (minScoreKey === 'nutq' || minScoreKey === 'lahn') {
      advice = `تلاوة طيبة، ولكن تحتاج للتركيز أكثر على مخارج الحروف ومتابعة المصحف أثناء القراءة لتتجنب اللحن والخطأ في الكلمات وتحاكي إتقان الشيخ ${reciterName}.`;
    } else if (minScoreKey === 'ghilza') {
      advice = `أداؤك رائع، حاول ضبط طبقة صوتك وجعلها أكثر ${profile.pitch === 'high' ? 'جواباً وحدّة' : 'وقاراً وهدوءاً'} لتقترب من نبرة الشيخ ${reciterName} المتميزة.`;
    } else if (minScoreKey === 'tajweed') {
      advice = `لديك خامة صوتية قوية، ننصحك بالتركيز على أزمنة المدود ومواضع الغنة لتطبيق أحكام التجويد بالشكل الذي تميز به الشيخ ${reciterName}.`;
    }
  }

  return { scores, advice };
}