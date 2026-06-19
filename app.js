document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsSection = document.getElementById('resultsSection');
    const recommendationsList = document.getElementById('recommendationsList');
    
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');

    let currentFile = null;
    let base64Image = null;

    // Initialize API Key from localStorage
    const savedApiKey = localStorage.getItem('gemini_api_key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    } else {
        // Show settings modal on first load if no key
        setTimeout(() => settingsModal.classList.remove('hidden'), 500);
    }

    // --- Settings Modal Logic ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            settingsModal.classList.add('hidden');
        } else {
            alert('API 키를 입력해주세요.');
        }
    });

    // Close modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // --- Drag and Drop & File Selection ---
    dropZone.addEventListener('click', (e) => {
        if (e.target !== removeImageBtn && e.target.closest('#removeImageBtn') === null) {
            fileInput.click();
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', function() {
        if (this.files && this.files.length > 0) {
            handleFile(this.files[0]);
        }
    });

    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetImage();
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 업로드 가능합니다.');
            return;
        }

        currentFile = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreviewContainer.classList.remove('hidden');
            analyzeBtn.disabled = false;
            
            // Extract base64 part for API
            base64Image = e.target.result.split(',')[1];
            
            // Hide initial content
            dropZone.querySelector('.upload-content').classList.add('hidden');
            
            // Hide previous results
            resultsSection.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }

    function resetImage() {
        currentFile = null;
        base64Image = null;
        fileInput.value = '';
        imagePreview.src = '';
        imagePreviewContainer.classList.add('hidden');
        dropZone.querySelector('.upload-content').classList.remove('hidden');
        analyzeBtn.disabled = true;
        resultsSection.classList.add('hidden');
    }

    // --- Gemini API Logic ---
    analyzeBtn.addEventListener('click', async () => {
        const apiKey = localStorage.getItem('gemini_api_key');
        
        if (!apiKey) {
            alert('설정에서 Gemini API 키를 먼저 입력해주세요.');
            settingsModal.classList.remove('hidden');
            return;
        }

        if (!base64Image) {
            alert('이미지를 먼저 업로드해주세요.');
            return;
        }

        // Show loading
        analyzeBtn.disabled = true;
        loadingIndicator.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        
        try {
            const result = await callGeminiAPI(apiKey, base64Image, currentFile.type);
            displayResults(result);
        } catch (error) {
            console.error('API Error:', error);
            alert('음악 추천을 가져오는데 실패했습니다: ' + error.message);
            analyzeBtn.disabled = false;
        } finally {
            loadingIndicator.classList.add('hidden');
            analyzeBtn.disabled = false;
        }
    });

    async function callGeminiAPI(apiKey, base64Data, mimeType) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const prompt = `
당신은 사진의 분위기를 분석하고 어울리는 음악을 추천해주는 전문가입니다.
첨부된 사진을 보고 사진에서 느껴지는 감정, 분위기, 시간대, 날씨 등을 파악한 후, 
이 사진과 가장 잘 어울리는 음악 3곡을 추천해주세요.

각 음악 추천에는 다음 정보가 포함되어야 합니다:
1. 곡 제목
2. 아티스트
3. 이 음악을 추천하는 이유 (사진의 어떤 요소와 잘 어울리는지 1-2문장으로 설명)

응답은 마크다운 형식으로 작성해주세요.`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }
            ]
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API 요청 실패');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    function displayResults(markdownText) {
        // marked.js is loaded from CDN
        if (typeof marked !== 'undefined') {
            recommendationsList.innerHTML = marked.parse(markdownText);
        } else {
            // Fallback if marked.js fails to load
            recommendationsList.innerText = markdownText;
        }
        
        resultsSection.classList.remove('hidden');
        
        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
});
