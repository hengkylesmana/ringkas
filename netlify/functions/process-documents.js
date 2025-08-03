// Import pustaka yang diperlukan
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mammoth = require("mammoth");
const xlsx = require('node-xlsx');
const pdf = require('pdf-parse');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Inisialisasi Gemini AI dengan API Key dari Netlify Environment Variables
// Ini adalah cara yang aman, API Key tidak terekspos di frontend.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fungsi utama yang akan dieksekusi oleh Netlify
exports.handler = async (event) => {
    // Hanya izinkan metode POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { prompt, files, links } = JSON.parse(event.body);
        let fullContext = "=== MULAI SUMBER DATA ===\n\n";

        // 1. Proses semua file yang diunggah
        for (const file of files) {
            const buffer = Buffer.from(file.content, 'base64');
            let content = '';

            try {
                switch (file.type) {
                    case 'application/pdf':
                        const pdfData = await pdf(buffer);
                        content = pdfData.text;
                        break;
                    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': // .docx
                        const docxResult = await mammoth.extractRawText({ buffer });
                        content = docxResult.value;
                        break;
                    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': // .xlsx
                        const workSheets = xlsx.parse(buffer);
                        content = workSheets.map(sheet => 
                            `Sheet: ${sheet.name}\n` + 
                            sheet.data.map(row => row.join('\t')).join('\n')
                        ).join('\n\n');
                        break;
                    // Tipe file gambar dan teks sudah diproses di frontend, kita hanya meneruskan kontennya
                    case 'image/png':
                    case 'image/jpeg':
                    case 'text/plain':
                        content = file.extractedText; // Mengambil teks hasil OCR dari frontend
                        break;
                    default:
                        console.warn(`Unsupported file type on backend: ${file.type}`);
                        content = `Konten dari file ${file.name} tidak dapat diproses (tipe tidak didukung).`;
                }
            } catch (procError) {
                console.error(`Error processing file ${file.name}:`, procError);
                content = `Gagal memproses file ${file.name}.`;
            }

            fullContext += `--- MULAI DOKUMEN: ${file.name} ---\n${content}\n--- AKHIR DOKUMEN: ${file.name} ---\n\n`;
        }

        // 2. Proses semua link yang diberikan
        for (const url of links) {
            let linkContent = '';
            try {
                const response = await fetch(url);
                const html = await response.text();
                const $ = cheerio.load(html);
                // Ekstrak teks dari elemen utama seperti paragraf, heading, dan list
                $('p, h1, h2, h3, h4, li').each((i, elem) => {
                    linkContent += $(elem).text() + '\n';
                });
                if (!linkContent) {
                    linkContent = "Tidak dapat mengekstrak konten teks utama dari link ini.";
                }
            } catch (scrapeError) {
                console.error(`Error scraping URL ${url}:`, scrapeError);
                linkContent = `Gagal mengambil konten dari link ${url}.`;
            }
            fullContext += `--- MULAI LINK: ${url} ---\n${linkContent}\n--- AKHIR LINK: ${url} ---\n\n`;
        }
        
        fullContext += "=== AKHIR SUMBER DATA ===\n\n";

        // 3. Buat prompt akhir untuk AI
        const finalPrompt = `Anda adalah asisten AI profesional yang bertugas menyusun dokumen secara sistematis. Berdasarkan HANYA pada SUMBER DATA yang diberikan, buatlah dokumen sesuai dengan instruksi berikut.
            
Instruksi Pengguna: "${prompt}"

Tugas Anda:
1. Buat dokumen yang diminta dalam format Markdown yang rapi.
2. Pastikan semua informasi yang Anda tulis berasal dari SUMBER DATA yang disediakan.
3. SANGAT PENTING: Setiap kali Anda menyajikan sebuah fakta atau data, Anda HARUS menyertakan kutipan dalam format (Sumber: nama_file) atau (Sumber: URL_link).
4. Jika informasi tidak ditemukan di sumber, nyatakan secara eksplisit bahwa informasi tersebut tidak tersedia dalam dokumen yang diberikan.
5. Strukturkan jawaban Anda dengan jelas menggunakan heading, list, dan paragraf.

Sekarang, mulailah membuat dokumen berdasarkan instruksi di atas dan sumber data berikut:

${fullContext}`;

        // 4. Panggil Gemini API
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();

        // 5. Kirim hasil kembali ke frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, data: text }),
        };

    } catch (error) {
        console.error('Error in Netlify function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message }),
        };
    }
};
