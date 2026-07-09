import Groq from "groq-sdk";

export const config = {
  api: {
    bodyParser: false,
  },
};

const groq = new Groq({
  apiKey: process.env.GROQ_QURAN_API_KEY,
});

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    const file = new File(
      [buffer],
      "audio.webm",
      { type: "audio/webm" }
    );

    const transcription =
      await groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3-turbo",
        language: "ar",
      });

    res.status(200).json({
      text: transcription.text
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: "Transcription failed"
    });

  }

}