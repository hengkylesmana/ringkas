// Elemen DOM
const fileUpload = document.getElementById('file-upload');
const fileListDiv = document.getElementById('file-list');
const urlInput = document.getElementById('url-input');
const addUrlBtn = document.getElementById('add-url-btn');
const urlListDiv = document.getElementById('url-list');
const generateBtn = document.getElementById('generate-btn');
const statusSection = document.getElementById('status-section');
const statusText = document.getElementById('status-text');
const resultSection = document.getElementById('result-section');
const downloadLink = document.getElementById('download-link');
const progressBar = document.getElementById('progress-bar');

// State aplikasi
let filesToProcess = [];
let urlsToProcess = [];

// Event Listeners
fileUpload.addEventListener('change', (e) => {
    filesToProcess = Array.from(e.target.files);
    updateFileListView();
});

addUrlBtn.addEventListener('click', () => {
    if (urlInput.value && isValidUrl(urlInput.value)) {
        urlsToProcess.push(urlInput.value);
        updateUrlListView();
        urlInput.value = '';
    } else {
        alert('Silakan masukkan URL yang valid.');
    }
});

generateBtn.addEventListener('click', handleGeneration);

// Functions
function updateFileListView() {
    fileListDiv.innerHTML = filesToProcess.length > 0 ? '<strong>File terpilih:</strong><ul>' + filesToProcess.map(f => `<li>${f.name} (${(f.size / 1024).toFixed(1)} KB)</li>`).join('') + '</ul>' : '';
}

function updateUrlListView() {
    urlListDiv.innerHTML = urlsToProcess.length > 0 ? '<strong>Link ditambahkan:</strong><ul>' + urlsToProcess.map(u => `<li>${u}</li>`).join('') + '</ul>' : '';
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function showStatus(message, progress) {
    statusSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    statusText.textContent = message;
    progressBar.style.width = `${progress}%`;
}

function showResult(blob, filename) {
    statusSection.classList.add('hidden');
    resultSection.classList.remove('hidden');
    
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = filename;
}

async function handleGeneration() {
    if (filesToProcess.length === 0 && urlsToProcess.length === 0) {
        alert('Silakan unggah file atau tambahkan link terlebih dahulu.');
        return;
    }

    generateBtn.disabled = true;
    let extractedTexts = [];
    const totalTasks = filesToProcess.length + urlsToProcess.length;
    let tasksCompleted = 0;

    // 1. Proses semua file
    for (const file of filesToProcess) {
        tasksCompleted++;
        const progress = (tasksCompleted / (totalTasks + 1)) * 100;
        showStatus(`Menganalisis file: ${file.name}...`, progress);
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/.netlify/functions/file-processor', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) throw new Error(`Gagal memproses ${file.name}`);
            const { text } = await response.json();
            extractedTexts.push({ source: `File: ${file.name}`, content: text });
        } catch (error) {
            alert(`Error: ${error.message}`);
            generateBtn.disabled = false;
            return;
        }
    }

    // 2. Proses semua URL
    for (const url of urlsToProcess) {
        tasksCompleted++;
        const progress = (tasksCompleted / (totalTasks + 1)) * 100;
        showStatus(`Mengambil konten dari: ${url}...`, progress);
        
        try {
            const response = await fetch('/.netlify/functions/url-scraper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            if (!response.ok) throw new Error(`Gagal mengambil konten dari ${url}`);
            const { text } = await response.json();
            extractedTexts.push({ source: `URL: ${url}`, content: text });
        } catch (error) {
            alert(`Error: ${error.message}`);
            generateBtn.disabled = false;
            return;
        }
    }

    // 3. Kirim ke AI untuk pembuatan dokumen
    showStatus('Menyusun draf dokumen dengan AI...', 90);
    const outputFormat = document.getElementById('output-format').value;

    try {
        const response = await fetch('/.netlify/functions/document-generator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sources: extractedTexts,
                format: outputFormat
            }),
        });

        if (!response.ok) {
           const errorData = await response.json();
           throw new Error(errorData.error || 'Gagal membuat dokumen.');
        }

        const blob = await response.blob();
        const filename = `dokumen_ai.${outputFormat}`;
        showResult(blob, filename);

    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        generateBtn.disabled = false;
    }
}