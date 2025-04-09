/*
Ideas:
 - Clean design of new ui
 - change select text versus options for playing: audio
 - cross fading between bgm / start a different time
 - fading should appear before end when switching randomly
 - Background based ambient sounds
    - import option on background UI ?
 - Allow background music edition using background menu
    - https://fontawesome.com/icons/music?f=classic&s=solid
    - https://codepen.io/noirsociety/pen/rNQxQwm
    - https://codepen.io/xrocker/pen/abdKVGy
*/

import { saveSettingsDebounced, getRequestHeaders } from '../../../../script.js';
import { getContext, extension_settings, ModuleWorkerWrapper } from '../../../extensions.js';
import { isDataURL } from '../../../utils.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue, enumTypes } from '../../../slash-commands/SlashCommandEnumValue.js';
import { enumIcons } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
export { MODULE_NAME };

const extensionName = 'Extension-Audio';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const MODULE_NAME = 'Audio';
const DEBUG_PREFIX = '<Audio module> ';
const UPDATE_INTERVAL = 1000;

const ASSETS_BGM_FOLDER = 'bgm';
const ASSETS_AMBIENT_FOLDER = 'ambient';
const CHARACTER_BGM_FOLDER = 'bgm';

const FALLBACK_EXPRESSION = 'neutral';
const DEFAULT_EXPRESSIONS = [
    //"talkinghead",
    'admiration',
    'amusement',
    'anger',
    'annoyance',
    'approval',
    'caring',
    'confusion',
    'curiosity',
    'desire',
    'disappointment',
    'disapproval',
    'disgust',
    'embarrassment',
    'excitement',
    'fear',
    'gratitude',
    'grief',
    'joy',
    'love',
    'nervousness',
    'optimism',
    'pride',
    'realization',
    'relief',
    'remorse',
    'sadness',
    'surprise',
    'neutral',
];
const SPRITE_DOM_ID = '#expression-image';

let current_chat_id = null;

let fallback_BGMS = null; // Initialized only once with module workers
let ambients = null; // Initialized only once with module workers
let characterMusics = {}; // Updated with module workers

let currentCharacterBGM = null;
let currentExpressionBGM = null;
let currentBackground = null;

let cooldownBGM = 0;

let bgmEnded = true;

//#############################//
//  Extension UI and Settings  //
//#############################//

const defaultSettings = {
    enabled: false,
    dynamic_bgm_enabled: false,
    //dynamic_ambient_enabled: false,

    bgm_locked: true,
    bgm_muted: true,
    bgm_volume: 50,
    bgm_selected: null,

    ambient_locked: true,
    ambient_muted: true,
    ambient_volume: 50,
    ambient_selected: null,

    bgm_cooldown: 30,
};

function loadSettings() {
    if (extension_settings.audio === undefined)
        extension_settings.audio = {};

    if (Object.keys(extension_settings.audio).length === 0) {
        Object.assign(extension_settings.audio, defaultSettings);
    }
    $('#audio_enabled').prop('checked', extension_settings.audio.enabled);
    $('#audio_dynamic_bgm_enabled').prop('checked', extension_settings.audio.dynamic_bgm_enabled);
    //$("#audio_dynamic_ambient_enabled").prop('checked', extension_settings.audio.dynamic_ambient_enabled);

    $('#audio_bgm_volume').text(extension_settings.audio.bgm_volume);
    $('#audio_ambient_volume').text(extension_settings.audio.ambient_volume);

    $('#audio_bgm_volume_slider').val(extension_settings.audio.bgm_volume);
    $('#audio_ambient_volume_slider').val(extension_settings.audio.ambient_volume);

    if (extension_settings.audio.bgm_muted) {
        $('#audio_bgm_mute_icon').removeClass('fa-volume-high');
        $('#audio_bgm_mute_icon').addClass('fa-volume-mute');
        $('#audio_bgm_mute').addClass('redOverlayGlow');
        $('#audio_bgm').prop('muted', true);
    }
    else {
        $('#audio_bgm_mute_icon').addClass('fa-volume-high');
        $('#audio_bgm_mute_icon').removeClass('fa-volume-mute');
        $('#audio_bgm_mute').removeClass('redOverlayGlow');
        $('#audio_bgm').prop('muted', false);
    }

    if (extension_settings.audio.bgm_locked) {
        //$("#audio_bgm_lock_icon").removeClass("fa-lock-open");
        //$("#audio_bgm_lock_icon").addClass("fa-lock");
        $('#audio_bgm').attr('loop', true);
        $('#audio_bgm_lock').addClass('redOverlayGlow');
    }
    else {
        //$("#audio_bgm_lock_icon").removeClass("fa-lock");
        //$("#audio_bgm_lock_icon").addClass("fa-lock-open");
        $('#audio_bgm').attr('loop', false);
        $('#audio_bgm_lock').removeClass('redOverlayGlow');
    }

    /*
    if (extension_settings.audio.bgm_selected !== null) {
        $("#audio_bgm_select").append(new Option(extension_settings.audio.bgm_selected, extension_settings.audio.bgm_selected));
        $("#audio_bgm_select").val(extension_settings.audio.bgm_selected);
    }*/

    if (extension_settings.audio.ambient_locked) {
        $('#audio_ambient_lock_icon').removeClass('fa-lock-open');
        $('#audio_ambient_lock_icon').addClass('fa-lock');
        $('#audio_ambient_lock').addClass('redOverlayGlow');
    }
    else {
        $('#audio_ambient_lock_icon').removeClass('fa-lock');
        $('#audio_ambient_lock_icon').addClass('fa-lock-open');
    }

    /*
    if (extension_settings.audio.ambient_selected !== null) {
        $("#audio_ambient_select").append(new Option(extension_settings.audio.ambient_selected, extension_settings.audio.ambient_selected));
        $("#audio_ambient_select").val(extension_settings.audio.ambient_selected);
    }*/

    if (extension_settings.audio.ambient_muted) {
        $('#audio_ambient_mute_icon').removeClass('fa-volume-high');
        $('#audio_ambient_mute_icon').addClass('fa-volume-mute');
        $('#audio_ambient_mute').addClass('redOverlayGlow');
        $('#audio_ambient').prop('muted', true);
    }
    else {
        $('#audio_ambient_mute_icon').addClass('fa-volume-high');
        $('#audio_ambient_mute_icon').removeClass('fa-volume-mute');
        $('#audio_ambient_mute').removeClass('redOverlayGlow');
        $('#audio_ambient').prop('muted', false);
    }

    $('#audio_bgm_cooldown').val(extension_settings.audio.bgm_cooldown);

    $('#audio_debug_div').hide(); // DBG: comment to see debug mode
}

async function onEnabledClick() {
    extension_settings.audio.enabled = $('#audio_enabled').is(':checked');
    if (extension_settings.audio.enabled) {
        if ($('#audio_bgm').attr('src') != '')
            $('#audio_bgm')[0].play();
        if ($('#audio_ambient').attr('src') != '')
            $('#audio_ambient')[0].play();
    } else {
        $('#audio_bgm')[0].pause();
        $('#audio_ambient')[0].pause();
    }
    saveSettingsDebounced();
}

async function onDynamicBGMEnabledClick() {
    extension_settings.audio.dynamic_bgm_enabled = $('#audio_dynamic_bgm_enabled').is(':checked');
    currentCharacterBGM = null;
    currentExpressionBGM = null;
    cooldownBGM = 0;
    saveSettingsDebounced();
}
/*
async function onDynamicAmbientEnabledClick() {
    extension_settings.audio.dynamic_ambient_enabled = $('#audio_dynamic_ambient_enabled').is(':checked');
    currentBackground = null;
    saveSettingsDebounced();
}
*/
async function onBGMLockClick() {
    extension_settings.audio.bgm_locked = !extension_settings.audio.bgm_locked;
    if (extension_settings.audio.bgm_locked) {
        extension_settings.audio.bgm_selected = $('#audio_bgm_select').val();
        $('#audio_bgm').attr('loop', true);
    }
    else {
        $('#audio_bgm').attr('loop', false);
    }
    //$("#audio_bgm_lock_icon").toggleClass("fa-lock");
    //$("#audio_bgm_lock_icon").toggleClass("fa-lock-open");
    $('#audio_bgm_lock').toggleClass('redOverlayGlow');
    saveSettingsDebounced();
}

async function onBGMRandomClick() {
    var select = document.getElementById('audio_bgm_select');
    var items = select.getElementsByTagName('option');

    if (items.length < 2)
        return;

    var index;
    do {
        index = Math.floor(Math.random() * items.length);
    } while (index == select.selectedIndex);

    select.selectedIndex = index;
    onBGMSelectChange();
}

async function onBGMMuteClick() {
    extension_settings.audio.bgm_muted = !extension_settings.audio.bgm_muted;
    $('#audio_bgm_mute_icon').toggleClass('fa-volume-high');
    $('#audio_bgm_mute_icon').toggleClass('fa-volume-mute');
    $('#audio_bgm').prop('muted', !$('#audio_bgm').prop('muted'));
    $('#audio_bgm_mute').toggleClass('redOverlayGlow');
    saveSettingsDebounced();
}

async function onAmbientLockClick() {
    extension_settings.audio.ambient_locked = !extension_settings.audio.ambient_locked;
    if (extension_settings.audio.ambient_locked)
        extension_settings.audio.ambient_selected = $('#audio_ambient_select').val();
    else {
        extension_settings.audio.ambient_selected = null;
        currentBackground = null;
    }
    $('#audio_ambient_lock_icon').toggleClass('fa-lock');
    $('#audio_ambient_lock_icon').toggleClass('fa-lock-open');
    $('#audio_ambient_lock').toggleClass('redOverlayGlow');
    saveSettingsDebounced();
}

async function onAmbientMuteClick() {
    extension_settings.audio.ambient_muted = !extension_settings.audio.ambient_muted;
    $('#audio_ambient_mute_icon').toggleClass('fa-volume-high');
    $('#audio_ambient_mute_icon').toggleClass('fa-volume-mute');
    $('#audio_ambient').prop('muted', !$('#audio_ambient').prop('muted'));
    $('#audio_ambient_mute').toggleClass('redOverlayGlow');
    saveSettingsDebounced();
}

async function onBGMVolumeChange() {
    extension_settings.audio.bgm_volume = ~~($('#audio_bgm_volume_slider').val());
    $('#audio_bgm').prop('volume', extension_settings.audio.bgm_volume * 0.01);
    $('#audio_bgm_volume').text(extension_settings.audio.bgm_volume);
    saveSettingsDebounced();
    //console.debug(DEBUG_PREFIX,"UPDATED BGM MAX TO",extension_settings.audio.bgm_volume);
}

async function onAmbientVolumeChange() {
    extension_settings.audio.ambient_volume = ~~($('#audio_ambient_volume_slider').val());
    $('#audio_ambient').prop('volume', extension_settings.audio.ambient_volume * 0.01);
    $('#audio_ambient_volume').text(extension_settings.audio.ambient_volume);
    saveSettingsDebounced();
    //console.debug(DEBUG_PREFIX,"UPDATED Ambient MAX TO",extension_settings.audio.ambient_volume);
}

async function onBGMSelectChange() {
    extension_settings.audio.bgm_selected = $('#audio_bgm_select').val();
    updateBGM(true);
    saveSettingsDebounced();
    //console.debug(DEBUG_PREFIX,"UPDATED BGM MAX TO",extension_settings.audio.bgm_volume);
}

async function onAmbientSelectChange() {
    extension_settings.audio.ambient_selected = $('#audio_ambient_select').val();
    updateAmbient(true);
    saveSettingsDebounced();
    //console.debug(DEBUG_PREFIX,"UPDATED BGM MAX TO",extension_settings.audio.bgm_volume);
}

async function onBGMCooldownInput() {
    extension_settings.audio.bgm_cooldown = ~~($('#audio_bgm_cooldown').val());
    cooldownBGM = extension_settings.audio.bgm_cooldown * 1000;
    saveSettingsDebounced();
    console.debug(DEBUG_PREFIX, 'UPDATED BGM cooldown to', extension_settings.audio.bgm_cooldown);
}

//#############################//
//  API Calls                  //
//#############################//

async function getAssetsList(type) {
    console.debug(DEBUG_PREFIX, 'getting assets of type', type);

    try {
        const result = await fetch('/api/assets/get', {
            method: 'POST',
            headers: getRequestHeaders(),
        });
        const assets = result.ok ? (await result.json()) : { type: [] };
        console.debug(DEBUG_PREFIX, 'Found assets:', assets);

        const output = assets[type];
        for(const i in output) {
            output[i] = output[i].replaceAll('\\','/');
            console.debug(DEBUG_PREFIX,'DEBUG',output[i]);
        }

        return output;
    }
    catch (err) {
        console.log(err);
        return [];
    }
}

async function getCharacterBgmList(name) {
    console.debug(DEBUG_PREFIX, 'getting bgm list for', name);

    try {
        const result = await fetch(`/api/assets/character?name=${encodeURIComponent(name)}&category=${CHARACTER_BGM_FOLDER}`, {
            method: 'POST',
            headers: getRequestHeaders(),
        });
        let musics = result.ok ? (await result.json()) : [];
        return musics;
    }
    catch (err) {
        console.log(err);
        return [];
    }
}

//#############################//
//  Module Worker              //
//#############################//

function fillBGMSelect() {
    let found_last_selected_bgm = false;
    // Update bgm list in UI
    $('#audio_bgm_select')
        .find('option')
        .remove();

    for (const file of fallback_BGMS) {
        $('#audio_bgm_select').append(new Option('asset: ' + file.replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, ''), file));
        if (file === extension_settings.audio.bgm_selected) {
            $('#audio_bgm_select').val(extension_settings.audio.bgm_selected);
            found_last_selected_bgm = true;
        }
    }

    // Update bgm list in UI
    for (const char in characterMusics)
        for (const e in characterMusics[char])
            for (const file of characterMusics[char][e]) {
                $('#audio_bgm_select').append(new Option(char + ': ' + file.replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, ''), file));
                if (file === extension_settings.audio.bgm_selected) {
                    $('#audio_bgm_select').val(extension_settings.audio.bgm_selected);
                    found_last_selected_bgm = true;
                }
            }

    if (!found_last_selected_bgm) {
        $('#audio_bgm_select').val($('#audio_bgm_select option:first').val());
        extension_settings.audio.bgm_selected = null;
    }
}

/*
    - Update ambient sound
    - Update character BGM
        - Solo dynamique expression
        - Group only neutral bgm
*/
async function moduleWorker() {
    const moduleEnabled = extension_settings.audio.enabled;

    if (moduleEnabled) {

        if (cooldownBGM > 0)
            cooldownBGM -= UPDATE_INTERVAL;

        if (fallback_BGMS == null) {
            console.debug(DEBUG_PREFIX, 'Updating audio bgm assets...');
            fallback_BGMS = await getAssetsList(ASSETS_BGM_FOLDER);
            fallback_BGMS = fallback_BGMS.filter((filename) => filename != '.placeholder');
            console.debug(DEBUG_PREFIX, 'Detected assets:', fallback_BGMS);

            fillBGMSelect();
        }

        if (ambients == null) {
            console.debug(DEBUG_PREFIX, 'Updating audio ambient assets...');
            ambients = await getAssetsList(ASSETS_AMBIENT_FOLDER);
            ambients = ambients.filter((filename) => filename != '.placeholder');
            console.debug(DEBUG_PREFIX, 'Detected assets:', ambients);

            // Update bgm list in UI
            $('#audio_ambient_select')
                .find('option')
                .remove();

            if (extension_settings.audio.ambient_selected !== null) {
                let ambient_label = extension_settings.audio.ambient_selected;
                if (ambient_label.includes('assets'))
                    ambient_label = 'asset: ' + ambient_label.replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, '');
                else {
                    ambient_label = ambient_label.substring('/characters/'.length);
                    ambient_label = ambient_label.substring(0, ambient_label.indexOf('/')) + ': ' + ambient_label.substring(ambient_label.indexOf('/') + '/bgm/'.length);
                    ambient_label = ambient_label.replace(/\.[^/.]+$/, '');
                }
                $('#audio_ambient_select').append(new Option(ambient_label, extension_settings.audio.ambient_selected));
            }

            for (const file of ambients) {
                if (file !== extension_settings.audio.ambient_selected)
                    $('#audio_ambient_select').append(new Option('asset: ' + file.replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, ''), file));
            }
        }

        // 1) Update ambient audio
        // ---------------------------
        //if (extension_settings.audio.dynamic_ambient_enabled) {
        let newBackground = $('#bg1').css('background-image');
        const custom_background = getContext()['chatMetadata']['custom_background'];

        if (custom_background !== undefined)
            newBackground = custom_background;

        if (!isDataURL(newBackground)) {
            newBackground = newBackground.substring(newBackground.lastIndexOf('/') + 1).replace(/\.[^/.]+$/, '').replaceAll('%20', '-').replaceAll(' ', '-'); // remove path and spaces

            //console.debug(DEBUG_PREFIX,"Current backgroung:",newBackground);

            if (currentBackground !== newBackground) {
                currentBackground = newBackground;

                console.debug(DEBUG_PREFIX, 'Changing ambient audio for', currentBackground);
                updateAmbient();
            }
        }
        //}

        const context = getContext();
        //console.debug(DEBUG_PREFIX,context);

        if (context.chat.length == 0)
            return;

        let chatIsGroup = context.chat[0].is_group;
        let newCharacter = null;

        // 1) Update BGM (single chat)
        // -----------------------------
        if (!chatIsGroup) {

            // Reset bgm list on new chat
            if (context.chatId != current_chat_id) {
                current_chat_id = context.chatId;
                characterMusics = {};
                cooldownBGM = 0;
            }

            newCharacter = context.name2;

            //console.log(DEBUG_PREFIX,"SOLO CHAT MODE"); // DBG

            // 1.1) First time loading chat
            if (characterMusics[newCharacter] === undefined) {
                await loadCharacterBGM(newCharacter);
                currentExpressionBGM = FALLBACK_EXPRESSION;
                //currentCharacterBGM = newCharacter;

                //updateBGM();
                //cooldownBGM = BGM_UPDATE_COOLDOWN;
                return;
            }

            // 1.2) Switched chat
            if (currentCharacterBGM !== newCharacter) {
                currentCharacterBGM = newCharacter;
                try {
                    await updateBGM(false, true);
                    cooldownBGM = extension_settings.audio.bgm_cooldown * 1000;
                }
                catch (error) {
                    console.debug(DEBUG_PREFIX, 'Error while trying to update BGM character, will try again');
                    currentCharacterBGM = null;
                }
                return;
            }

            const newExpression = getNewExpression();

            // 1.3) Same character but different expression
            if (currentExpressionBGM !== newExpression) {

                // Check cooldown
                if (cooldownBGM > 0) {
                    //console.debug(DEBUG_PREFIX,"(SOLO) BGM switch on cooldown:",cooldownBGM);
                    return;
                }

                try {
                    currentExpressionBGM = newExpression;
                    await updateBGM();
                    cooldownBGM = extension_settings.audio.bgm_cooldown * 1000;
                    console.debug(DEBUG_PREFIX, '(SOLO) Updated current character expression to', currentExpressionBGM, 'cooldown', cooldownBGM);
                }
                catch (error) {
                    console.debug(DEBUG_PREFIX, 'Error while trying to update BGM expression, will try again');
                    currentCharacterBGM = null;
                }
                return;
            }

            return;
        }

        // 2) Update BGM (group chat)
        // -----------------------------

        // Load current chat character bgms
        // Reset bgm list on new chat
        if (context.chatId != current_chat_id) {
            current_chat_id = context.chatId;
            characterMusics = {};
            cooldownBGM = 0;
            for (const message of context.chat) {
                if (characterMusics[message.name] === undefined)
                    await loadCharacterBGM(message.name);
            }

            try {
                newCharacter = context.chat[context.chat.length - 1].name;
                currentCharacterBGM = newCharacter;
                await updateBGM(false, true);
                cooldownBGM = extension_settings.audio.bgm_cooldown * 1000;
                currentCharacterBGM = newCharacter;
                currentExpressionBGM = FALLBACK_EXPRESSION;
                console.debug(DEBUG_PREFIX, '(GROUP) Updated current character BGM to', currentExpressionBGM, 'cooldown', cooldownBGM);
            }
            catch (error) {
                console.debug(DEBUG_PREFIX, 'Error while trying to update BGM group, will try again');
                currentCharacterBGM = null;
            }
            return;
        }

        newCharacter = context.chat[context.chat.length - 1].name;
        const userName = context.name1;

        if (newCharacter !== undefined && newCharacter != userName) {

            //console.log(DEBUG_PREFIX,"GROUP CHAT MODE"); // DBG

            // 2.1) New character appear
            if (characterMusics[newCharacter] === undefined) {
                await loadCharacterBGM(newCharacter);
                return;
            }

            // 2.2) Switched char
            if (currentCharacterBGM !== newCharacter) {
                // Check cooldown
                if (cooldownBGM > 0) {
                    console.debug(DEBUG_PREFIX, '(GROUP) BGM switch on cooldown:', cooldownBGM);
                    return;
                }

                try {
                    currentCharacterBGM = newCharacter;
                    await updateBGM();
                    cooldownBGM = extension_settings.audio.bgm_cooldown * 1000;
                    currentCharacterBGM = newCharacter;
                    currentExpressionBGM = FALLBACK_EXPRESSION;
                    console.debug(DEBUG_PREFIX, '(GROUP) Updated current character BGM to', currentExpressionBGM, 'cooldown', cooldownBGM);
                }
                catch (error) {
                    console.debug(DEBUG_PREFIX, 'Error while trying to update BGM group, will try again');
                    currentCharacterBGM = null;
                }
                return;
            }

            /*
            const newExpression = getNewExpression();

            // 1.3) Same character but different expression
            if (currentExpressionBGM !== newExpression) {

                // Check cooldown
                if (cooldownBGM > 0) {
                    console.debug(DEBUG_PREFIX,"BGM switch on cooldown:",cooldownBGM);
                    return;
                }

                cooldownBGM = BGM_UPDATE_COOLDOWN;
                currentExpressionBGM = newExpression;
                console.debug(DEBUG_PREFIX,"Updated current character expression to",currentExpressionBGM);
                updateBGM();
                return;
            }

            return;*/

        }

        // Case 3: Same character/expression or BGM switch on cooldown keep playing same BGM
        //console.debug(DEBUG_PREFIX,"Nothing to do for",currentCharacterBGM, newCharacter, currentExpressionBGM, cooldownBGM);
    }
}

async function loadCharacterBGM(newCharacter) {
    console.debug(DEBUG_PREFIX, 'New character detected, loading BGM folder of', newCharacter);

    // 1.1) First time character appear, load its music folder
    const audio_file_paths = await getCharacterBgmList(newCharacter);
    //console.debug(DEBUG_PREFIX, "Recieved", audio_file_paths);

    // Initialise expression/files mapping
    characterMusics[newCharacter] = {};
    for (const e of DEFAULT_EXPRESSIONS)
        characterMusics[newCharacter][e] = [];

    for (const i of audio_file_paths) {
        //console.debug(DEBUG_PREFIX,"File found:",i);
        for (const e of DEFAULT_EXPRESSIONS)
            if (i.includes(e))
                characterMusics[newCharacter][e].push(i);
    }
    console.debug(DEBUG_PREFIX, 'Updated BGM map of', newCharacter, 'to', characterMusics[newCharacter]);

    fillBGMSelect();
}

function getNewExpression() {
    let newExpression;

    // HACK: use sprite file name as expression detection
    if (!$(SPRITE_DOM_ID).length) {
        console.error(DEBUG_PREFIX, 'ERROR: expression sprite does not exist, cannot extract expression from ', SPRITE_DOM_ID);
        return FALLBACK_EXPRESSION;
    }

    const spriteFile = $('#expression-image').attr('src');
    newExpression = spriteFile.substring(spriteFile.lastIndexOf('/') + 1).replace(/\.[^/.]+$/, '');
    //

    // No sprite to detect expression
    if (newExpression == '') {
        //console.info(DEBUG_PREFIX,"Warning: no expression extracted from sprite, switch to",FALLBACK_EXPRESSION);
        newExpression = FALLBACK_EXPRESSION;
    }

    if (!DEFAULT_EXPRESSIONS.includes(newExpression)) {
        console.info(DEBUG_PREFIX, 'Warning:', newExpression, ' is not a handled expression, expected one of', FALLBACK_EXPRESSION);
        return FALLBACK_EXPRESSION;
    }

    return newExpression;
}

async function updateBGM(isUserInput = false, newChat = false) {
    if (!isUserInput && !extension_settings.audio.dynamic_bgm_enabled && $('#audio_bgm').attr('src') != '' && !bgmEnded && !newChat) {
        console.debug(DEBUG_PREFIX, 'BGM already playing and dynamic switch disabled, no update done');
        return;
    }

    let audio_file_path = '';
    if (isUserInput || (extension_settings.audio.bgm_locked && extension_settings.audio.bgm_selected !== null)) {
        audio_file_path = extension_settings.audio.bgm_selected;

        if (isUserInput)
            console.debug(DEBUG_PREFIX, 'User selected BGM', audio_file_path);
        if (extension_settings.audio.bgm_locked)
            console.debug(DEBUG_PREFIX, 'BGM locked keeping current audio', audio_file_path);
    }
    else {

        let audio_files = null;

        if (extension_settings.audio.dynamic_bgm_enabled) {
            extension_settings.audio.bgm_selected = null;
            saveSettingsDebounced();
            audio_files = characterMusics[currentCharacterBGM][currentExpressionBGM];// Try char expression BGM

            if (audio_files === undefined || audio_files.length == 0) {
                console.debug(DEBUG_PREFIX, 'No BGM for', currentCharacterBGM, currentExpressionBGM);
                audio_files = characterMusics[currentCharacterBGM][FALLBACK_EXPRESSION]; // Try char FALLBACK BGM
                if (audio_files === undefined || audio_files.length == 0) {
                    console.debug(DEBUG_PREFIX, 'No default BGM for', currentCharacterBGM, FALLBACK_EXPRESSION, 'switch to ST BGM');
                    audio_files = fallback_BGMS; // ST FALLBACK BGM

                    if (audio_files.length == 0) {
                        console.debug(DEBUG_PREFIX, 'No default BGM file found, bgm folder may be empty.');
                        return;
                    }
                }
            }
        }
        else {
            audio_files = [];
            $('#audio_bgm_select option').each(function () { audio_files.push($(this).val()); });
        }

        audio_file_path = audio_files[Math.floor(Math.random() * audio_files.length)];
    }

    console.log(DEBUG_PREFIX, 'Updating BGM');
    console.log(DEBUG_PREFIX, 'Checking file', audio_file_path);
    try {
        const response = await fetch(audio_file_path);

        if (!response.ok) {
            console.log(DEBUG_PREFIX, 'File not found!');
        }
        else {
            console.log(DEBUG_PREFIX, 'Switching BGM to', currentExpressionBGM);
            $('#audio_bgm_select').val(audio_file_path);
            const audio = $('#audio_bgm');

            if (audio.attr('src') == audio_file_path && !bgmEnded) {
                console.log(DEBUG_PREFIX, 'Already playing, ignored');
                return;
            }

            let fade_time = 2000;
            bgmEnded = false;

            if (isUserInput || extension_settings.audio.bgm_locked) {
                audio.attr('src', audio_file_path);
                audio.prop('volume', extension_settings.audio.bgm_volume * 0.01);
                audio[0].play();
            }
            else {
                audio.animate({ volume: 0.0 }, fade_time, function () {
                    audio.attr('src', audio_file_path);
                    audio[0].play();
                    audio.prop('volume', extension_settings.audio.bgm_volume * 0.01);
                    audio.animate({ volume: extension_settings.audio.bgm_volume * 0.01 }, fade_time);
                });
            }
        }

    } catch (error) {
        console.log(DEBUG_PREFIX, 'Error while trying to fetch', audio_file_path, ':', error);
    }
}

async function updateAmbient(isUserInput = false) {
    let audio_file_path = null;

    if (isUserInput || extension_settings.audio.ambient_locked) {
        audio_file_path = extension_settings.audio.ambient_selected;

        if (isUserInput)
            console.debug(DEBUG_PREFIX, 'User selected Ambient', audio_file_path);
        if (extension_settings.audio.bgm_locked)
            console.debug(DEBUG_PREFIX, 'Ambient locked keeping current audio', audio_file_path);
    }
    else {
        extension_settings.audio.ambient_selected = null;
        for (const i of ambients) {
            console.debug(i);
            if (i.includes(currentBackground)) {
                audio_file_path = i;
                break;
            }
        }
    }

    if (audio_file_path === null) {
        console.debug(DEBUG_PREFIX, 'No bgm file found for background', currentBackground);
        const audio = $('#audio_ambient');
        audio.attr('src', '');
        audio[0].pause();
        return;
    }

    //const audio_file_path = AMBIENT_FOLDER+currentBackground+".mp3";
    console.log(DEBUG_PREFIX, 'Updating ambient');
    console.log(DEBUG_PREFIX, 'Checking file', audio_file_path);
    $('#audio_ambient_select').val(audio_file_path);

    let fade_time = 2000;
    if (isUserInput)
        fade_time = 0;

    const audio = $('#audio_ambient');

    if (audio.attr('src') == audio_file_path) {
        console.log(DEBUG_PREFIX, 'Already playing, ignored');
        return;
    }

    audio.animate({ volume: 0.0 }, fade_time, function () {
        audio.attr('src', audio_file_path);
        audio[0].play();
        audio.prop('volume', extension_settings.audio.ambient_volume * 0.01);
        audio.animate({ volume: extension_settings.audio.ambient_volume * 0.01 }, fade_time);
    });
}

/**
 * Handles wheel events on volume sliders.
 * @param {WheelEvent} e Event
 */
function onVolumeSliderWheelEvent(e) {
    const slider = $(this);
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY / 20;
    const sliderVal = Number(slider.val());

    let newVal = sliderVal - delta;
    if (newVal < 0) {
        newVal = 0;
    } else if (newVal > 100) {
        newVal = 100;
    }

    slider.val(newVal).trigger('input');
}

//#############################//
//  Extension load             //
//#############################//

// This function is called when the extension is loaded
jQuery(async () => {
    const getContainer = () => $(document.getElementById('audio_container') ?? document.getElementById('extensions_settings'));
    const windowHtml = $(await $.get(`${extensionFolderPath}/window.html`));

    getContainer().append(windowHtml);
    loadSettings();

    $('#audio_enabled').on('click', onEnabledClick);
    $('#audio_dynamic_bgm_enabled').on('click', onDynamicBGMEnabledClick);
    //$("#audio_dynamic_ambient_enabled").on("click", onDynamicAmbientEnabledClick);

    //$("#audio_bgm").attr("loop", false);
    $('#audio_ambient').attr('loop', true);

    $('#audio_bgm').hide();
    $('#audio_bgm_lock').on('click', onBGMLockClick);
    $('#audio_bgm_mute').on('click', onBGMMuteClick);
    $('#audio_bgm_volume_slider').on('input', onBGMVolumeChange);
    $('#audio_bgm_random').on('click', onBGMRandomClick);

    $('#audio_ambient').hide();
    $('#audio_ambient_lock').on('click', onAmbientLockClick);
    $('#audio_ambient_mute').on('click', onAmbientMuteClick);
    $('#audio_ambient_volume_slider').on('input', onAmbientVolumeChange);

    document.getElementById('audio_ambient_volume_slider').addEventListener('wheel', onVolumeSliderWheelEvent, { passive: false });
    document.getElementById('audio_bgm_volume_slider').addEventListener('wheel', onVolumeSliderWheelEvent, { passive: false });

    $('#audio_bgm_cooldown').on('input', onBGMCooldownInput);

    // Reset assets container, will be redected like if ST restarted
    $('#audio_refresh_assets').on('click', function () {
        console.debug(DEBUG_PREFIX, 'Refreshing audio assets');
        current_chat_id = null;
        fallback_BGMS = null;
        ambients = null;
        characterMusics = {};
        currentCharacterBGM = null;
        currentExpressionBGM = null;
        currentBackground = null;
    });

    $('#audio_bgm_select').on('change', onBGMSelectChange);
    $('#audio_ambient_select').on('change', onAmbientSelectChange);

    // DBG
    $('#audio_debug').on('click', function () {
        if ($('#audio_debug').is(':checked')) {
            $('#audio_bgm').show();
            $('#audio_ambient').show();
        }
        else {
            $('#audio_bgm').hide();
            $('#audio_ambient').hide();
        }
    });
    //

    $('#audio_bgm').on('ended', function () {
        console.debug(DEBUG_PREFIX, 'END OF BGM');
        if (!extension_settings.audio.bgm_locked) {
            bgmEnded = true;
            updateBGM();
        }
    });

    const wrapper = new ModuleWorkerWrapper(moduleWorker);
    setInterval(wrapper.update.bind(wrapper), UPDATE_INTERVAL);
    moduleWorker();

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'music',
        aliases: ['bgm'],
        helpString: 'Force change of bgm for given file.',
        callback: setBGMSlashCommand,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'file path',
                isRequired: true,
                acceptsMultiple: false,
                enumProvider: () => Array.from(document.querySelectorAll('[id=audio_bgm_select] option')).map(o => new SlashCommandEnumValue(o instanceof HTMLOptionElement && o.value, null, enumTypes.enum, enumIcons.file)),
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ambient',
        helpString: 'Force change of ambient audio for given file.',
        callback: setAmbientSlashCommand,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'file path',
                isRequired: true,
                acceptsMultiple: false,
                enumProvider: () => Array.from(document.querySelectorAll('[id=audio_ambient_select] option')).map(o => new SlashCommandEnumValue(o instanceof HTMLOptionElement && o.value, null, enumTypes.enum, enumIcons.file)),
            }),
        ],
    }));
});

async function setBGMSlashCommand(_, file) {
    if (!file) {
        console.log('No bgm file provided');
        return '';
    }

    file = file.trim().toLowerCase();

    // Fuzzy search for sprite

    let selectElement = document.querySelectorAll('[id=audio_bgm_select]');
    let optionValues = [...selectElement[0].options].map(o => o.value);
    //console.debug(DEBUG_PREFIX,"DEBUG:",optionValues);

    const fuse = new Fuse(optionValues);
    const results = fuse.search(file);
    const fileItem = results[0]?.item;

    if (!fileItem) {
        console.log('Bgm file path not valid');
        return '';
    }

    $('#audio_bgm_select').val(fileItem);
    onBGMSelectChange();

    return '';
}

async function setAmbientSlashCommand(_, file) {
    if (!file) {
        console.log('No ambient file provided');
        return '';
    }

    file = file.trim().toLowerCase();

    let selectElement = document.querySelectorAll('[id=audio_ambient_select]');
    let optionValues = [...selectElement[0].options].map(o => o.value);
    //console.debug(DEBUG_PREFIX,"DEBUG:",optionValues);

    const fuse = new Fuse(optionValues);
    const results = fuse.search(file);
    const fileItem = results[0]?.item;

    if (!fileItem) {
        console.log('Bgm file path not valid');
        return '';
    }

    $('#audio_ambient_select').val(fileItem);
    onAmbientSelectChange();

    return '';
}
