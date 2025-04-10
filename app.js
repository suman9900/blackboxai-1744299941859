class Jarvis {
    constructor() {
        this.micButton = document.getElementById('micButton');
        this.status = document.getElementById('status');
        this.listeningStatus = document.getElementById('listening-status');
        this.conversationLog = document.getElementById('conversation-log');
        this.isListening = false;
        
        // ChatGPT API configuration
        this.OPENAI_API_KEY = localStorage.getItem('OPENAI_API_KEY') || ''; // Get stored API key
        this.conversationHistory = [];
        
        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.lang = 'en-US';
            this.setupRecognition();
            this.setupSpeechSynthesis();
            this.setupEventListeners();
        } else {
            this.handleError('Speech recognition is not supported in this browser.');
        }
    }

    setupEventListeners() {
        this.micButton.addEventListener('click', () => this.toggleListening());
    }

    setupRecognition() {
        this.recognition.onstart = () => {
            this.updateStatus('Listening...', true);
            this.micButton.classList.add('pulse');
        };

        this.recognition.onend = () => {
            this.updateStatus('Click to start', false);
            this.micButton.classList.remove('pulse');
            this.isListening = false;
        };

        this.recognition.onresult = (event) => {
            const command = event.results[0][0].transcript.toLowerCase();
            this.addToLog('user', command);
            this.processCommand(command);
        };

        this.recognition.onerror = (event) => {
            switch (event.error) {
                case 'not-allowed':
                    this.handleError('Microphone access was denied. Please allow microphone access in your browser settings and try again.');
                    this.status.innerHTML = `
                        <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                            <p class="font-bold">Microphone Access Required</p>
                            <p>To use JARVIS, please:</p>
                            <ol class="list-decimal ml-4 mt-2">
                                <li>Click the camera/microphone icon in your browser's address bar</li>
                                <li>Allow microphone access</li>
                                <li>Refresh the page</li>
                            </ol>
                        </div>
                    `;
                    break;
                case 'no-speech':
                    this.handleError('No speech was detected. Please try again.');
                    break;
                case 'audio-capture':
                    this.handleError('No microphone was found. Please ensure your microphone is connected and try again.');
                    break;
                case 'network':
                    this.handleError('Network error occurred. Please check your internet connection.');
                    break;
                default:
                    this.handleError('Error occurred in recognition: ' + event.error);
            }
            this.isListening = false;
            this.micButton.classList.remove('pulse');
        };
    }

    setupSpeechSynthesis() {
        this.synthesis = window.speechSynthesis;
        this.voice = null;

        window.speechSynthesis.onvoiceschanged = () => {
            const voices = this.synthesis.getVoices();
            this.voice = voices.find(voice => voice.lang.includes('en-')) || voices[0];
        };
    }

    toggleListening() {
        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
            this.isListening = true;
        }
    }

    updateStatus(message, isListening) {
        this.listeningStatus.textContent = message;
        if (isListening) {
            this.micButton.classList.add('bg-red-600');
            this.micButton.classList.remove('bg-blue-600');
        } else {
            this.micButton.classList.remove('bg-red-600');
            this.micButton.classList.add('bg-blue-600');
        }
    }

    addToLog(speaker, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'mb-4 p-3 rounded ' + 
            (speaker === 'user' ? 'bg-blue-100 ml-8' : 'bg-gray-100 mr-8');
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'mr-2';
        iconSpan.innerHTML = speaker === 'user' ? 
            '<i class="fas fa-user text-blue-600"></i>' : 
            '<i class="fas fa-robot text-gray-600"></i>';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        
        messageDiv.appendChild(iconSpan);
        messageDiv.appendChild(textSpan);
        this.conversationLog.appendChild(messageDiv);
        this.conversationLog.scrollTop = this.conversationLog.scrollHeight;
    }

    speak(text) {
        return new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.voice = this.voice;
            utterance.onend = resolve;
            this.synthesis.speak(utterance);
            this.addToLog('jarvis', text);
        });
    }

    async callChatGPT(prompt) {
        if (!this.OPENAI_API_KEY) {
            this.status.innerHTML = `
                <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                    <p class="font-bold">API Key Required</p>
                    <p>Please enter your OpenAI API key in the configuration section above to enable enhanced conversations.</p>
                </div>
            `;
            return this.getDefaultResponse(prompt);
        }

        try {
            this.updateStatus('Connecting to ChatGPT...', false);
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: "You are JARVIS, a helpful and knowledgeable AI assistant. Respond in a concise and natural way."
                        },
                        ...this.conversationHistory,
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    max_tokens: 150
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'API request failed');
            }

            const data = await response.json();
            if (data.choices && data.choices[0]) {
                const reply = data.choices[0].message.content;
                this.conversationHistory.push(
                    { role: "user", content: prompt },
                    { role: "assistant", content: reply }
                );
                // Keep conversation history manageable
                if (this.conversationHistory.length > 10) {
                    this.conversationHistory = this.conversationHistory.slice(-10);
                }
                this.updateStatus('Click the microphone to start talking', false);
                return reply;
            }
            throw new Error('No response from ChatGPT');
        } catch (error) {
            console.error('ChatGPT API Error:', error);
            
            let errorMessage = 'An error occurred while connecting to ChatGPT. ';
            if (error.message.includes('API key')) {
                errorMessage = 'Invalid API key. Please check your API key and try again.';
                // Clear the invalid API key
                this.OPENAI_API_KEY = '';
                localStorage.removeItem('OPENAI_API_KEY');
            } else if (error.message.includes('network')) {
                errorMessage = 'Network error. Please check your internet connection.';
            }

            this.status.innerHTML = `
                <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
                    <p class="font-bold">Error</p>
                    <p>${errorMessage}</p>
                </div>
            `;
            return this.getDefaultResponse(prompt);
        }
    }

    getDefaultResponse(command) {
        if (command.includes('hello') || command.includes('hi')) {
            return 'Hello! How can I help you today?';
        } else if (command.includes('what time')) {
            return `The current time is ${new Date().toLocaleTimeString()}`;
        } else if (command.includes('what date')) {
            return `Today's date is ${new Date().toLocaleDateString()}`;
        } else if (command.includes('who are you')) {
            return "I'm JARVIS, your AI assistant. I can help you with various tasks and engage in natural conversations.";
        } else {
            return "I'm having trouble connecting to my main intelligence system. I can still help with basic tasks like telling time or date.";
        }
    }

    async processCommand(command) {
        let response = '';

        try {
            // Handle system-specific commands locally
            if (command.includes('open')) {
                response = await this.handleOpenCommand(command);
            } else if (command.includes('volume')) {
                response = await this.handleVolumeCommand(command);
            } else if (command.includes('calculate')) {
                response = await this.handleCalculationCommand(command);
            } else {
                // Use ChatGPT for natural conversation and other queries
                response = await this.callChatGPT(command);
            }
        } catch (error) {
            console.error('Error processing command:', error);
            response = this.getDefaultResponse(command);
        }

        await this.speak(response);
    }

    async handleOpenCommand(command) {
        const apps = {
            'chrome': 'https://www.google.com',
            'youtube': 'https://www.youtube.com',
            'gmail': 'https://mail.google.com',
            'maps': 'https://maps.google.com',
            'calendar': 'https://calendar.google.com',
            'drive': 'https://drive.google.com',
            'spotify': 'https://open.spotify.com',
            'netflix': 'https://www.netflix.com',
            'amazon': 'https://www.amazon.com'
        };

        for (const [app, url] of Object.entries(apps)) {
            if (command.includes(app)) {
                window.open(url, '_blank');
                return `Opening ${app}`;
            }
        }
        return "I couldn't find the application you mentioned. Please try again with a supported application.";
    }

    async handleVolumeCommand(command) {
        return "I understand you want to control the volume. However, volume control requires system integration which is not available in this version.";
    }

    async handleCalculationCommand(command) {
        try {
            let calculation = command.replace('calculate', '').trim();
            calculation = calculation
                .replace(/plus/g, '+')
                .replace(/minus/g, '-')
                .replace(/times/g, '*')
                .replace(/divided by/g, '/');
            
            const result = eval(calculation);
            return `The result is ${result}`;
        } catch (error) {
            return "I couldn't perform that calculation. Please try again with a simpler calculation.";
        }
    }

    handleError(error) {
        console.error(error);
        this.status.innerHTML = `<p class="text-red-600">${error}</p>`;
    }

    setApiKey(apiKey) {
        if (!apiKey.trim()) {
            this.handleError('Please enter a valid API key');
            return;
        }
        this.OPENAI_API_KEY = apiKey;
        localStorage.setItem('OPENAI_API_KEY', apiKey);
        this.status.innerHTML = `
            <div class="bg-green-100 border-l-4 border-green-500 text-green-700 p-4">
                <p>API key has been saved successfully!</p>
            </div>
        `;
        setTimeout(() => {
            this.status.innerHTML = '<p class="text-gray-600">Click the microphone to start talking</p>';
        }, 3000);
    }
}

// Initialize Jarvis when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.jarvis = new Jarvis();
});
