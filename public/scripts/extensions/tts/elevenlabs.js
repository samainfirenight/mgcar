import { saveTtsProviderSettings } from './index.js';
export { ElevenLabsTtsProvider };

class ElevenLabsTtsProvider {
    //########//
    // Config //
    //########//

    settings;
    voices = [];
    separator = ' ... ... ... ';


    defaultSettings = {
        stability: 0.75,
        similarity_boost: 0.75,
        style_exaggeration: 0.00,
        speaker_boost: true,
        apiKey: '',
        model: 'eleven_monolingual_v1',
        voiceMap: {},
    };

    get settingsHtml() {
        let html = `
        <div class="elevenlabs_tts_settings">
            <label for="elevenlabs_tts_api_key">API Key</label>
            <input id="elevenlabs_tts_api_key" type="text" class="text_pole" placeholder="<API Key>"/>
            <label for="elevenlabs_tts_model">Model</label>
            <select id="elevenlabs_tts_model" class="text_pole">
                <option value="eleven_monolingual_v1">English v1</option>
                <option value="eleven_multilingual_v1">Multilingual v1</option>
                <option value="eleven_multilingual_v2">Multilingual v2</option>
                <option value="eleven_turbo_v2">Turbo v2</option>
            </select>
            <input id="eleven_labs_connect" class="menu_button" type="button" value="Connect" />
            <label for="elevenlabs_tts_stability">Stability: <span id="elevenlabs_tts_stability_output"></span></label>
            <input id="elevenlabs_tts_stability" type="range" value="${this.defaultSettings.stability}" min="0" max="1" step="0.01" />
            <label for="elevenlabs_tts_similarity_boost">Similarity Boost: <span id="elevenlabs_tts_similarity_boost_output"></span></label>
            <input id="elevenlabs_tts_similarity_boost" type="range" value="${this.defaultSettings.similarity_boost}" min="0" max="1" step="0.01" />
            <div id="elevenlabs_tts_v2_options" style="display: none;">
                <label for="elevenlabs_tts_style_exaggeration">Style Exaggeration: <span id="elevenlabs_tts_style_exaggeration_output"></span></label>
                <input id="elevenlabs_tts_style_exaggeration" type="range" value="${this.defaultSettings.style_exaggeration}" min="0" max="1" step="0.01" />
                <label for="elevenlabs_tts_speaker_boost">Speaker Boost:</label>
                <input id="elevenlabs_tts_speaker_boost" style="display: inline-grid" type="checkbox" />
            </div>
            <hr>
            <div id="elevenlabs_tts_voice_cloning">
                <span>Instant Voice Cloning</span><br>
                <input id="elevenlabs_tts_voice_cloning_name" type="text" class="text_pole" placeholder="Voice Name"/>
                <input id="elevenlabs_tts_voice_cloning_description" type="text" class="text_pole" placeholder="Voice Description"/>
                <input id="elevenlabs_tts_voice_cloning_labels" type="text" class="text_pole" placeholder="Labels"/>
                <div class="menu_button menu_button_icon" id="upload_audio_file">
                    <i class="fa-solid fa-file-import"></i>
                    <span>Upload Audio Files</span>
                </div>
                <input id="elevenlabs_tts_audio_files" type="file" name="audio_files" accept="audio/*" style="display: none;" multiple>
                <div id="elevenlabs_tts_selected_files_list"></div>
                <input id="elevenlabs_tts_clone_voice_button" class="menu_button menu_button_icon" type="button" value="Clone Voice">
            </div>
            <hr>
        </div>
        `;
        return html;
    }

    shouldInvolveExtendedSettings() {
        return this.settings.model === 'eleven_multilingual_v2';
    }

    onSettingsChange() {
        // Update dynamically
        this.settings.stability = $('#elevenlabs_tts_stability').val();
        this.settings.similarity_boost = $('#elevenlabs_tts_similarity_boost').val();
        this.settings.style_exaggeration = $('#elevenlabs_tts_style_exaggeration').val();
        this.settings.speaker_boost = $('#elevenlabs_tts_speaker_boost').is(':checked');
        this.settings.model = $('#elevenlabs_tts_model').find(':selected').val();
        $('#elevenlabs_tts_stability_output').text(Math.round(this.settings.stability * 100) + '%');
        $('#elevenlabs_tts_similarity_boost_output').text(Math.round(this.settings.similarity_boost * 100) + '%');
        $('#elevenlabs_tts_style_exaggeration_output').text(Math.round(this.settings.style_exaggeration * 100) + '%');
        $('#elevenlabs_tts_v2_options').toggle(this.shouldInvolveExtendedSettings());
        saveTtsProviderSettings();
    }

    async loadSettings(settings) {
        // Pupulate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.info('Using default TTS Provider settings');
        }

        // Only accept keys defined in defaultSettings
        this.settings = this.defaultSettings;

        // Migrate old settings
        if (settings['multilingual'] !== undefined) {
            settings.model = settings.multilingual ? 'eleven_multilingual_v1' : 'eleven_monolingual_v1';
            delete settings['multilingual'];
        }

        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                throw `Invalid setting passed to TTS Provider: ${key}`;
            }
        }

        $('#elevenlabs_tts_stability').val(this.settings.stability);
        $('#elevenlabs_tts_similarity_boost').val(this.settings.similarity_boost);
        $('#elevenlabs_tts_style_exaggeration').val(this.settings.style_exaggeration);
        $('#elevenlabs_tts_speaker_boost').prop('checked', this.settings.speaker_boost);
        $('#elevenlabs_tts_api_key').val(this.settings.apiKey);
        $('#elevenlabs_tts_model').val(this.settings.model);
        $('#eleven_labs_connect').on('click', () => { this.onConnectClick(); });
        $('#elevenlabs_tts_similarity_boost').on('input', this.onSettingsChange.bind(this));
        $('#elevenlabs_tts_stability').on('input', this.onSettingsChange.bind(this));
        $('#elevenlabs_tts_style_exaggeration').on('input', this.onSettingsChange.bind(this));
        $('#elevenlabs_tts_speaker_boost').on('change', this.onSettingsChange.bind(this));
        $('#elevenlabs_tts_model').on('change', this.onSettingsChange.bind(this));
        $('#elevenlabs_tts_stability_output').text(Math.round(this.settings.stability * 100) + '%');
        $('#elevenlabs_tts_similarity_boost_output').text(Math.round(this.settings.similarity_boost * 100) + '%');
        $('#elevenlabs_tts_style_exaggeration_output').text(Math.round(this.settings.style_exaggeration * 100) + '%');
        $('#elevenlabs_tts_v2_options').toggle(this.shouldInvolveExtendedSettings());
        try {
            await this.checkReady();
            console.debug('ElevenLabs: Settings loaded');
        } catch {
            console.debug('ElevenLabs: Settings loaded, but not ready');
        }

        this.setupVoiceCloningMenu();
    }

    // Perform a simple readiness check by trying to fetch voiceIds
    async checkReady() {
        await this.fetchTtsVoiceObjects();
    }

    async onRefreshClick() {
    }

    async onConnectClick() {
        // Update on Apply click
        return await this.updateApiKey().catch((error) => {
            toastr.error(`ElevenLabs: ${error}`);
        });
    }

    setupVoiceCloningMenu() {
        const audioFilesInput = document.getElementById('elevenlabs_tts_audio_files');
        const selectedFilesListElement = document.getElementById('elevenlabs_tts_selected_files_list');
        const cloneVoiceButton = document.getElementById('elevenlabs_tts_clone_voice_button');
        const uploadAudioFileButton = document.getElementById('upload_audio_file');
        const voiceCloningNameInput = document.getElementById('elevenlabs_tts_voice_cloning_name');
        const voiceCloningDescriptionInput = document.getElementById('elevenlabs_tts_voice_cloning_description');
        const voiceCloningLabelsInput = document.getElementById('elevenlabs_tts_voice_cloning_labels');

        const updateCloneVoiceButtonVisibility = () => {
            cloneVoiceButton.style.display = audioFilesInput.files.length > 0 ? 'inline-block' : 'none';
        };

        const clearSelectedFiles = () => {
            audioFilesInput.value = '';
            selectedFilesListElement.innerHTML = '';
            updateCloneVoiceButtonVisibility();
        };

        uploadAudioFileButton.addEventListener('click', () => {
            audioFilesInput.click();
        });

        audioFilesInput.addEventListener('change', () => {
            selectedFilesListElement.innerHTML = '';
            for (const file of audioFilesInput.files) {
                const listItem = document.createElement('div');
                listItem.textContent = file.name;
                selectedFilesListElement.appendChild(listItem);
            }
            updateCloneVoiceButtonVisibility();
        });

        cloneVoiceButton.addEventListener('click', async () => {
            const voiceName = voiceCloningNameInput.value.trim();
            const voiceDescription = voiceCloningDescriptionInput.value.trim();
            const voiceLabels = voiceCloningLabelsInput.value.trim();

            if (!voiceName) {
                toastr.error('Please provide a name for the cloned voice.');
                return;
            }

            try {
                await this.addVoice(voiceName, voiceDescription, voiceLabels);
                toastr.success('Voice cloned successfully. Hit reload to see the new voice in the voice listing.');
                clearSelectedFiles();
                voiceCloningNameInput.value = '';
                voiceCloningDescriptionInput.value = '';
                voiceCloningLabelsInput.value = '';
            } catch (error) {
                toastr.error(`Failed to clone voice: ${error.message}`);
            }
        });

        updateCloneVoiceButtonVisibility();
    }

    async updateApiKey() {
        // Using this call to validate API key
        this.settings.apiKey = $('#elevenlabs_tts_api_key').val();

        await this.fetchTtsVoiceObjects().catch(error => {
            throw 'TTS API key validation failed';
        });
        console.debug(`Saved new API_KEY: ${this.settings.apiKey}`);
        $('#tts_status').text('');
        this.onSettingsChange();
    }

    //#################//
    //  TTS Interfaces //
    //#################//

    async getVoice(voiceName) {
        if (this.voices.length == 0) {
            this.voices = await this.fetchTtsVoiceObjects();
        }
        const match = this.voices.filter(
            elevenVoice => elevenVoice.name == voiceName,
        )[0];
        if (!match) {
            throw `TTS Voice name ${voiceName} not found in ElevenLabs account`;
        }
        return match;
    }


    async generateTts(text, voiceId) {
        const historyId = await this.findTtsGenerationInHistory(text, voiceId);

        let response;
        if (historyId) {
            console.debug(`Found existing TTS generation with id ${historyId}`);
            response = await this.fetchTtsFromHistory(historyId);
        } else {
            console.debug('No existing TTS generation found, requesting new generation');
            response = await this.fetchTtsGeneration(text, voiceId);
        }
        return response;
    }

    //###################//
    //  Helper Functions //
    //###################//

    async findTtsGenerationInHistory(message, voiceId) {
        const ttsHistory = await this.fetchTtsHistory();
        for (const history of ttsHistory) {
            const text = history.text;
            const itemId = history.history_item_id;
            if (message === text && history.voice_id == voiceId) {
                console.info(`Existing TTS history item ${itemId} found: ${text} `);
                return itemId;
            }
        }
        return '';
    }


    //###########//
    // API CALLS //
    //###########//
    async fetchTtsVoiceObjects() {
        const headers = {
            'xi-api-key': this.settings.apiKey,
        };
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: headers,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        const responseJson = await response.json();
        return responseJson.voices;
    }

    async fetchTtsVoiceSettings() {
        const headers = {
            'xi-api-key': this.settings.apiKey,
        };
        const response = await fetch(
            'https://api.elevenlabs.io/v1/voices/settings/default',
            {
                headers: headers,
            },
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response.json();
    }

    async fetchTtsGeneration(text, voiceId) {
        let model = this.settings.model ?? 'eleven_monolingual_v1';
// XXXXXXXXXXXXXXX MGB Start XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX		
		let mgbStability = this.settings.stability;
		let mgbSimilarity = this.settings.similarity_boost;
		let mgbStyle = this.settings.style_exaggeration;
		let mgbBoost = this.settings.speaker_boost;
        let mgbVoiceSet = false;
		
		// scenario Alan Rickman == stability 0.35 == simularity 0.50 == style 0.01 == boost false 
		// scenario Sandro Miranda == stability 0.35 == simularity 0.45 == style 0.01 == boost false
		// scenario three Stefan == stability 0.37 == simularity 0.49 == style 0.01 == boost false 		
		// scenario four Stefan == stability 0.38 35== simularity 0.49 47== style 0.01 == boost false <-- best so far for Stefan009
        // scenario for KITT 1hGxo59Oy0ObivptSgnm == eleven_turbo_v2 stability 0.35 35== simularity 0.32 35
		
		
		if (voiceId == 'agrs2Hcedkm3KMRQSkhv' || voiceId == 'uF5oc4ifPTxk5Sib6xDU') {
			model = 'eleven_multilingual_v2';
			mgbStability = 0.36;
			mgbSimilarity = 0.47;
			mgbStyle = 0.01;
			mgbBoost = true;
            mgbVoiceSet = false;
			console.debug(' ----------- MGB Stefan Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');
          } else if(voiceId == '5Yms7akWX8ksVcYSHbB4' || voiceId == 'lZVNukDE7lqa1xdsRJ3l') {  
			model = 'eleven_multilingual_v2';
			mgbStability = 0.35;
			mgbSimilarity = 0.50;
			mgbStyle = 0.01;
			mgbBoost = false;
            mgbVoiceSet = true;
			console.debug(' ----------- MGB Alan Rickman Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');
          } else if(voiceId == 'WlIaUSd7C3wRfhz85ZCk') {  
			model = 'eleven_multilingual_v2';
			mgbStability = 0.32;
			mgbSimilarity = 0.45;
			mgbStyle = 0.01;
			mgbBoost = true;
            mgbVoiceSet = true;
			console.debug(' ----------- MGB Sandro Miranda Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');    
          } else if(voiceId == '1hGxo59Oy0ObivptSgnm') {  
			model = 'eleven_turbo_v2';
			mgbStability = 0.35;
			mgbSimilarity = 0.35;
			mgbStyle = 0.00;
			mgbBoost = false;
            mgbVoiceSet = false;
			console.debug(' ----------- MGB KITT Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');  
          } else if(voiceId == 'IQaHrTWSY3jiqF3jocB9') {  
			model = 'eleven_turbo_v2';
			mgbStability = 0.33;
			mgbSimilarity = 0.66;
			mgbStyle = 0.00;
			mgbBoost = false;
            mgbVoiceSet = false;
			console.debug(' ----------- MGB LokiVoice Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');
          } else if(voiceId == 'f55fnnEc8nOG5s6xZJxW') {  
			model = 'eleven_multilingual_v2';
			mgbStability = 0.33;
			mgbSimilarity = 0.49;
			mgbStyle = 0.00;
			mgbBoost = true;
            mgbVoiceSet = false;
			console.debug(' ----------- MGB DanteVoiceThree Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');
//         } else if(voiceId == 'RnEQwdGxgOdFCir6K06O') {  
//			model = 'eleven_multilingual_v2';
//			mgbStability = 0.39;
//			mgbSimilarity = 0.75;
//			mgbStyle = 0.00;
//			mgbBoost = true;
//          mgbVoiceSet = false;
//			console.debug(' ----------- MGB VergilVoice Voice Model Changed ------------------ ');
//			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');		
         } else if(voiceId == 'b7bWZ73Z6RC50FHlyUT1' || voiceId == 'pIgg6nuLICwT2xqKjTnq') {  
			model = 'eleven_multilingual_v2';
			mgbStability = 0.33;
			mgbSimilarity = 0.54;
			mgbStyle = 0.00;
			mgbBoost = true;
            mgbVoiceSet = false;
			console.debug(' ----------- MGB OtyrFour, OtyrTwo Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');				
          } else if(voiceId == '7Dw0CVvUdfFsigVG0GI4' || voiceId == 'psGgsYDJqHt3nsP1uvqi') {  
			model = 'eleven_multilingual_v2';
			mgbStability = 0.33;
			mgbSimilarity = 0.49;
			mgbStyle = 0.00;
			mgbBoost = true;
            mgbVoiceSet = false;
			console.debug(' ----------- MGB Otyr, OtyrThree Voice Model Changed ------------------ ');
			console.debug('---- MGB Stability: ' + mgbStability + ' -- Similarity: ' + mgbSimilarity + ' ------- ');				
		}	

        console.info(`Generating new TTS for voice_id ${voiceId}, model ${model}`);
        const request = {
            model_id: model,
            text: text,
            voice_settings: {
                stability: Number(mgbStability),
                similarity_boost: Number(mgbSimilarity),
            },
        };
// XXXXXXXXXXXXXXX MGB End XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
        if (this.shouldInvolveExtendedSettings()) {
            request.voice_settings.style = Number(this.settings.style_exaggeration);
            request.voice_settings.use_speaker_boost = Boolean(this.settings.speaker_boost);
        }
		
// XXXXXXXXXXXXXXX MGB Start XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX		
		if (mgbVoiceSet == true ) {
            request.voice_settings.style = Number(mgbStyle);
            request.voice_settings.use_speaker_boost = Boolean(mgbBoost);
			console.debug('---- MGB Style Eggr: ' + mgbStyle + ' -- Speaker Boost: ' + mgbBoost + ' ------- ');
		}	
// XXXXXXXXXXXXXXX MGB End XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
		
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': this.settings.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            toastr.error(response.statusText, 'TTS Generation Failed');
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response;
    }

    async fetchTtsFromHistory(history_item_id) {
        console.info(`Fetched existing TTS with history_item_id ${history_item_id}`);
        const response = await fetch(
            `https://api.elevenlabs.io/v1/history/${history_item_id}/audio`,
            {
                headers: {
                    'xi-api-key': this.settings.apiKey,
                },
            },
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response;
    }

    async fetchTtsHistory() {
        const headers = {
            'xi-api-key': this.settings.apiKey,
        };
        const response = await fetch('https://api.elevenlabs.io/v1/history', {
            headers: headers,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        const responseJson = await response.json();
        return responseJson.history;
    }

    async addVoice(name, description, labels) {
        const selected_files = document.querySelectorAll('input[type="file"][name="audio_files"]');
        const formData = new FormData();

        formData.append('name', name);
        formData.append('description', description);
        formData.append('labels', labels);

        for (const file of selected_files) {
            if (file.files.length > 0) {
                formData.append('files', file.files[0]);
            }
        }

        const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
            method: 'POST',
            headers: {
                'xi-api-key': this.settings.apiKey,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        return await response.json();
    }
}
