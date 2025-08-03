// Impor pustaka yang diperlukan
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Document, Packer, Paragraph, TextRun } = require("docx");

// Ambil API Key dari Environment Variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { sources, format } = JSON.parse(event.body);

        // Gabungkan semua teks dari sumber menjadi satu konteks
        const context = sources.map(s => `--- SUMBER: ${s.source} ---\n${s.content}\n\n`).join('');

        // Buat prompt untuk Gemini
        const prompt = `Anda adalah asisten ahli dalam menyusun dokumen. Berdasarkan teks-teks berikut yang diambil dari berbagai sumber, buatlah sebuah dokumen ringkasan yang sistematis dan koheren. Pastikan untuk menyertakan sitasi di akhir setiap paragraf atau poin penting yang merujuk kembali ke sumber aslinya (gunakan format [SUMBER: nama file/URL]).

KONTEKS DARI SEMUA SUMBER:
${context}

TUGAS:
Susunlah sebuah dokumen yang terstruktur dengan baik dari informasi di atas. Jangan menambahkan informasi di luar konteks yang diberikan.`;

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Buat file output berdasarkan format yang diminta
        if (format === 'docx') {
            const doc = new Document({
                sections: [{
                    properties: {},
                    children: [
                        new Paragraph({
                            children: text.split('\n').map(line => new TextRun({ text: line, break: 1 })),
                        }),
                    ],
                }],
            });

            const buffer = await Packer.toBuffer(doc);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
                body: buffer.toString('base64'),
                isBase64Encoded: true,
            };
        } else { // Default to markdown/text
             return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/markdown' },
                body: text,
            };
        }

    } catch (error) {
        console.error("Error generating document:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Terjadi kesalahan saat berkomunikasi dengan AI.' }),
        };
    }
};
