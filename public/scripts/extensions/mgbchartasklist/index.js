import { getStringHash, debounce, waitUntilCondition, extractAllWords } from '../../utils.js';
import { getContext, getApiUrl, extension_settings, doExtrasFetch, modules, renderExtensionTemplateAsync } from '../../extensions.js';
import {
    activateSendButtons,
    deactivateSendButtons,
    animation_duration,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    generateQuietPrompt,
    is_send_press,
    saveSettingsDebounced,
    substituteParamsExtended,
    generateRaw,
    getMaxContextSize,
} from '../../../script.js';
import { is_group_generating, selected_group } from '../../group-chats.js';
import { loadMovingUIState } from '../../power-user.js';
import { dragElement } from '../../RossAscends-mods.js';
import { getTextTokens, getTokenCountAsync, tokenizers } from '../../tokenizers.js';
import { debounce_timeout } from '../../constants.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
import { resolveVariable } from '../../variables.js';
import { commonEnumProviders } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
export { MODULE_NAME };

const MODULE_NAME = '1_mgbchartasklist';

let lastCharacterId = null;
let lastGroupId = null;
let lastChatId = null;
let lastMessageHash = null;
let lastMessageId = null;
let inApiCall = false;

const formatMGBCharTaskListValue = function (value) {
    if (!value) {
        return '';
    }

    value = value.trim();

    if (extension_settings.mgbchartasklist.template) {
        return substituteParamsExtended(extension_settings.mgbchartasklist.template, { mgbcharstaskslisted: value });
    } else {
        return `MGBCharsTasksListed: ${value}`;
    }
};

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

const mgbcharstaskslisted_sources = {
    'extras': 'extras',
    'main': 'main',
};

const prompt_builders = {
    DEFAULT: 0,
    RAW_BLOCKING: 1,
    RAW_NON_BLOCKING: 2,
};

const defaultPrompt = '[Pause your roleplay. You will act as a Narrator to create a bulleted list of character objectives.\n\nAs a Narrator, your primary function is to create a concise, organized list of current goals, open items, and tasks for each character within the current narrative environment. Your focus is on capturing the ongoing objectives, unresolved issues, and pending actions for each character, without reflecting on yourself as an entity or making any self-references. Your sole purpose is to provide a clear overview of what each character aims to accomplish or resolve in the near future.\n\nYou use clear and concise language to accurately capture key objectives, unfinished business, and upcoming tasks for each character involved in the narrative. Functioning as an objective tracker within the story, you provide bulleted lists that will act as a quick reference for character motivations and pending actions, maintaining the style and tone of the existing narrative environment. You identify and highlight critical goals, unresolved conflicts, and important tasks, ensuring that the lists capture the most pressing matters for each character.\n\nYou maintain an unbiased perspective, focusing solely on listing objectives without personal reflection or discrimination of the content. You adjust to the tone and style of the narrative, ensuring that the lists capture the overall direction and motivations of each character within the context provided. You pay close attention to detail, ensuring that key goals, relationship-related objectives, and personal tasks are captured accurately for each character.\n\nAs a Narrator, you will not inquire for clarifications that might break the immersive narrative experience. Instead, you will utilize the information provided to create the most fitting bulleted list of objectives possible for each character.\n\nActive Request:\nCreate a bulleted list of current goals, open items, and tasks for each character in the chat so far. If a list of character objectives already exists in your memory, use that as a base to update and expand with new developments. Be concise. Organize the list by character name, with sub-bullets for each character\'s objectives. Your response should include nothing but the organized list of character objectives.]';
const defaultTemplate = '[---- Begin Brief Overview of Current Character Goals and Objectives ----\n\n{{mgbcharstaskslisted}}\n\n---- End Brief Overview of Current Character Goals and Objectives ----]';

const defaultSettings = {
    mgbchartasklistFrozen: false,
    SkipWIAN: false,
    source: mgbcharstaskslisted_sources.extras,
    prompt: defaultPrompt,
    template: defaultTemplate,
    position: extension_prompt_types.IN_PROMPT,
    role: extension_prompt_roles.SYSTEM,
    depth: 2,
    promptWords: 200,
    promptMinWords: 25,
    promptMaxWords: 4000,
    promptWordsStep: 25,
    promptInterval: 10,
    promptMinInterval: 0,
    promptMaxInterval: 250,
    promptIntervalStep: 1,
    promptForceWords: 0,
    promptForceWordsStep: 100,
    promptMinForceWords: 0,
    promptMaxForceWords: 10000,
    overrideResponseLength: 0,
    overrideResponseLengthMin: 0,
    overrideResponseLengthMax: 4096,
    overrideResponseLengthStep: 16,
    maxMessagesPerRequest: 0,
    maxMessagesPerRequestMin: 0,
    maxMessagesPerRequestMax: 250,
    maxMessagesPerRequestStep: 1,
    prompt_builder: prompt_builders.DEFAULT,
};

function loadSettings() {
    if (Object.keys(extension_settings.mgbchartasklist).length === 0) {
        Object.assign(extension_settings.mgbchartasklist, defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings.mgbchartasklist[key] === undefined) {
            extension_settings.mgbchartasklist[key] = defaultSettings[key];
        }
    }

    $('#mgbcharstaskslisted_source').val(extension_settings.mgbchartasklist.source).trigger('change');
    $('#mgbchartasklist_frozen').prop('checked', extension_settings.mgbchartasklist.mgbchartasklistFrozen).trigger('input');
    $('#mgbchartasklist_skipWIAN').prop('checked', extension_settings.mgbchartasklist.SkipWIAN).trigger('input');
    $('#mgbchartasklist_prompt').val(extension_settings.mgbchartasklist.prompt).trigger('input');
    $('#mgbchartasklist_prompt_words').val(extension_settings.mgbchartasklist.promptWords).trigger('input');
    $('#mgbchartasklist_prompt_interval').val(extension_settings.mgbchartasklist.promptInterval).trigger('input');
    $('#mgbchartasklist_template').val(extension_settings.mgbchartasklist.template).trigger('input');
    $('#mgbchartasklist_depth').val(extension_settings.mgbchartasklist.depth).trigger('input');
    $('#mgbchartasklist_role').val(extension_settings.mgbchartasklist.role).trigger('input');
    $(`input[name="mgbchartasklist_position"][value="${extension_settings.mgbchartasklist.position}"]`).prop('checked', true).trigger('input');
    $('#mgbchartasklist_prompt_words_force').val(extension_settings.mgbchartasklist.promptForceWords).trigger('input');
    $(`input[name="mgbchartasklist_prompt_builder"][value="${extension_settings.mgbchartasklist.prompt_builder}"]`).prop('checked', true).trigger('input');
    $('#mgbchartasklist_override_response_length').val(extension_settings.mgbchartasklist.overrideResponseLength).trigger('input');
    $('#mgbchartasklist_max_messages_per_request').val(extension_settings.mgbchartasklist.maxMessagesPerRequest).trigger('input');
    switchSourceControls(extension_settings.mgbchartasklist.source);
}

async function onPromptForceWordsAutoClick() {
    const context = getContext();
    const maxPromptLength = getMaxContextSize(extension_settings.mgbchartasklist.overrideResponseLength);
    const chat = context.chat;
    const allMessages = chat.filter(m => !m.is_system && m.mes).map(m => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const averageMessageWordCount = messagesWordCount / allMessages.length;
    const tokensPerWord = await getTokenCountAsync(allMessages.join('\n')) / messagesWordCount;
    const wordsPerToken = 1 / tokensPerWord;
    const maxPromptLengthWords = Math.round(maxPromptLength * wordsPerToken);
    // How many words should pass so that messages will start be dropped out of context;
    const wordsPerPrompt = Math.floor(maxPromptLength / tokensPerWord);
    // How many words will be needed to fit the allowance buffer
    const mgbcharstaskslistedPromptWords = extractAllWords(extension_settings.mgbchartasklist.prompt).length;
    const promptAllowanceWords = maxPromptLengthWords - extension_settings.mgbchartasklist.promptWords - mgbcharstaskslistedPromptWords;
    const averageMessagesPerPrompt = Math.floor(promptAllowanceWords / averageMessageWordCount);
    const maxMessagesPerMGBCharsTasksListed = extension_settings.mgbchartasklist.maxMessagesPerRequest || 0;
    const targetMessagesInPrompt = maxMessagesPerMGBCharsTasksListed > 0 ? maxMessagesPerMGBCharsTasksListed : Math.max(0, averageMessagesPerPrompt);
    const targetMGBCharsTasksListedWords = (targetMessagesInPrompt * averageMessageWordCount) + (promptAllowanceWords / 4);

    console.table({
        maxPromptLength,
        maxPromptLengthWords,
        promptAllowanceWords,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        targetMGBCharsTasksListedWords,
        wordsPerPrompt,
        wordsPerToken,
        tokensPerWord,
        messagesWordCount,
    });

    const ROUNDING = 100;
    extension_settings.mgbchartasklist.promptForceWords = Math.max(1, Math.floor(targetMGBCharsTasksListedWords / ROUNDING) * ROUNDING);
    $('#mgbchartasklist_prompt_words_force').val(extension_settings.mgbchartasklist.promptForceWords).trigger('input');
}

async function onPromptIntervalAutoClick() {
    const context = getContext();
    const maxPromptLength = getMaxContextSize(extension_settings.mgbchartasklist.overrideResponseLength);
    const chat = context.chat;
    const allMessages = chat.filter(m => !m.is_system && m.mes).map(m => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const messagesTokenCount = await getTokenCountAsync(allMessages.join('\n'));
    const tokensPerWord = messagesTokenCount / messagesWordCount;
    const averageMessageTokenCount = messagesTokenCount / allMessages.length;
    const targetMGBCharsTasksListedTokens = Math.round(extension_settings.mgbchartasklist.promptWords * tokensPerWord);
    const promptTokens = await getTokenCountAsync(extension_settings.mgbchartasklist.prompt);
    const promptAllowance = maxPromptLength - promptTokens - targetMGBCharsTasksListedTokens;
    const maxMessagesPerMGBCharsTasksListed = extension_settings.mgbchartasklist.maxMessagesPerRequest || 0;
    const averageMessagesPerPrompt = Math.floor(promptAllowance / averageMessageTokenCount);
    const targetMessagesInPrompt = maxMessagesPerMGBCharsTasksListed > 0 ? maxMessagesPerMGBCharsTasksListed : Math.max(0, averageMessagesPerPrompt);
    const adjustedAverageMessagesPerPrompt = targetMessagesInPrompt + (averageMessagesPerPrompt - targetMessagesInPrompt) / 4;

    console.table({
        maxPromptLength,
        promptAllowance,
        targetMGBCharsTasksListedTokens,
        promptTokens,
        messagesWordCount,
        messagesTokenCount,
        tokensPerWord,
        averageMessageTokenCount,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        adjustedAverageMessagesPerPrompt,
        maxMessagesPerMGBCharsTasksListed,
    });

    const ROUNDING = 5;
    extension_settings.mgbchartasklist.promptInterval = Math.max(1, Math.floor(adjustedAverageMessagesPerPrompt / ROUNDING) * ROUNDING);

    $('#mgbchartasklist_prompt_interval').val(extension_settings.mgbchartasklist.promptInterval).trigger('input');
}

function onMGBCharsTasksListedSourceChange(event) {
    const value = event.target.value;
    extension_settings.mgbchartasklist.source = value;
    switchSourceControls(value);
    saveSettingsDebounced();
}

function switchSourceControls(value) {
    $('#mgbchartasklist_settings [data-mgbcharstaskslisted-source]').each((_, element) => {
        const source = $(element).data('mgbcharstaskslisted-source');
        $(element).toggle(source === value);
    });
}

function onMGBCharTaskListFrozenInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.mgbchartasklist.mgbchartasklistFrozen = value;
    saveSettingsDebounced();
}

function onMGBCharTaskListSkipWIANInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.mgbchartasklist.SkipWIAN = value;
    saveSettingsDebounced();
}

function onMGBCharTaskListPromptWordsInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.promptWords = Number(value);
    $('#mgbchartasklist_prompt_words_value').text(extension_settings.mgbchartasklist.promptWords);
    saveSettingsDebounced();
}

function onMGBCharTaskListPromptIntervalInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.promptInterval = Number(value);
    $('#mgbchartasklist_prompt_interval_value').text(extension_settings.mgbchartasklist.promptInterval);
    saveSettingsDebounced();
}

function onMGBCharTaskListPromptRestoreClick() {
    $('#mgbchartasklist_prompt').val(defaultPrompt).trigger('input');
}

function onMGBCharTaskListPromptInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.prompt = value;
    saveSettingsDebounced();
}

function onMGBCharTaskListTemplateInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.template = value;
    reinsertMGBCharTaskList();
    saveSettingsDebounced();
}

function onMGBCharTaskListDepthInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.depth = Number(value);
    reinsertMGBCharTaskList();
    saveSettingsDebounced();
}

function onMGBCharTaskListRoleInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.role = Number(value);
    reinsertMGBCharTaskList();
    saveSettingsDebounced();
}

function onMGBCharTaskListPositionChange(e) {
    const value = e.target.value;
    extension_settings.mgbchartasklist.position = value;
    reinsertMGBCharTaskList();
    saveSettingsDebounced();
}

function onMGBCharTaskListPromptWordsForceInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.promptForceWords = Number(value);
    $('#mgbchartasklist_prompt_words_force_value').text(extension_settings.mgbchartasklist.promptForceWords);
    saveSettingsDebounced();
}

function onOverrideResponseLengthInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.overrideResponseLength = Number(value);
    $('#mgbchartasklist_override_response_length_value').text(extension_settings.mgbchartasklist.overrideResponseLength);
    saveSettingsDebounced();
}

function onMaxMessagesPerRequestInput() {
    const value = $(this).val();
    extension_settings.mgbchartasklist.maxMessagesPerRequest = Number(value);
    $('#mgbchartasklist_max_messages_per_request_value').text(extension_settings.mgbchartasklist.maxMessagesPerRequest);
    saveSettingsDebounced();
}

function saveLastValues() {
    const context = getContext();
    lastGroupId = context.groupId;
    lastCharacterId = context.characterId;
    lastChatId = context.chatId;
    lastMessageId = context.chat?.length ?? null;
    lastMessageHash = getStringHash((context.chat.length && context.chat[context.chat.length - 1]['mes']) ?? '');
}

function getLatestMGBCharTaskListFromChat(chat) {
    if (!Array.isArray(chat) || !chat.length) {
        return '';
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbchartasklist) {
            return mes.extra.mgbchartasklist;
        }
    }

    return '';
}

function getIndexOfLatestChatMGBCharsTasksListed(chat) {
    if (!Array.isArray(chat) || !chat.length) {
        return -1;
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbchartasklist) {
            return chat.indexOf(mes);
        }
    }

    return -1;
}

async function onChatEvent() {
    // Module not enabled
    if (extension_settings.mgbchartasklist.source === mgbcharstaskslisted_sources.extras) {
        if (!modules.includes('mgbchartaskslisted')) {
            return;
        }
    }

    const context = getContext();
    const chat = context.chat;

    // no characters or group selected
    if (!context.groupId && context.characterId === undefined) {
        return;
    }

    // Generation is in progress, mgbcharstaskslisted prevented
    if (is_send_press) {
        return;
    }

    // Chat/character/group changed
    if ((context.groupId && lastGroupId !== context.groupId) || (context.characterId !== lastCharacterId) || (context.chatId !== lastChatId)) {
        const latestMGBCharTaskList = getLatestMGBCharTaskListFromChat(chat);
        setMGBCharTaskListContext(latestMGBCharTaskList, false);
        saveLastValues();
        return;
    }

    // Currently summarizing or frozen state - skip
    if (inApiCall || extension_settings.mgbchartasklist.mgbchartasklistFrozen) {
        return;
    }

    // No new messages - do nothing
    if (chat.length === 0 || (lastMessageId === chat.length && getStringHash(chat[chat.length - 1].mes) === lastMessageHash)) {
        return;
    }

    // Messages has been deleted - rewrite the context with the latest available mgbchartasklist
    if (chat.length < lastMessageId) {
        const latestMGBCharTaskList = getLatestMGBCharTaskListFromChat(chat);
        setMGBCharTaskListContext(latestMGBCharTaskList, false);
    }

    // Message has been edited / regenerated - delete the saved mgbchartasklist
    if (chat.length
        && chat[chat.length - 1].extra
        && chat[chat.length - 1].extra.mgbchartasklist
        && lastMessageId === chat.length
        && getStringHash(chat[chat.length - 1].mes) !== lastMessageHash) {
        delete chat[chat.length - 1].extra.mgbchartasklist;
    }

    try {
        await mgbchartaskslistedChat(context);
    }
    catch (error) {
        console.log(error);
    }
    finally {
        saveLastValues();
    }
}

async function forceMGBCharTasksListedChat() {
    if (extension_settings.mgbchartasklist.source === mgbcharstaskslisted_sources.extras) {
        toastr.warning('Force summarization is not supported for Extras API');
        return;
    }

    const context = getContext();

    const skipWIAN = extension_settings.mgbchartasklist.SkipWIAN;
    console.log(`Skipping WIAN? ${skipWIAN}`);
    if (!context.chatId) {
        toastr.warning('No chat selected');
        return '';
    }

    toastr.info('Building Character Objectives List...', 'Please wait');
    const value = await mgbchartaskslistedChatMain(context, true, skipWIAN);

    if (!value) {
        toastr.warning('Failed to mgbchartaskslisted chat');
        return '';
    }

    return value;
}

/**
 * Callback for the mgbchartaskslisted command.
 * @param {object} args Command arguments
 * @param {string} text Text to mgbchartaskslisted
 */
async function mgbchartaskslistedCallback(args, text) {
    text = text.trim();

    // Using forceMGBCharTasksListedChat to mgbchartaskslisted the current chat
    if (!text) {
        return await forceMGBCharTasksListedChat();
    }

    const source = args.source || extension_settings.mgbchartasklist.source;
    const prompt = substituteParamsExtended((args.prompt || extension_settings.mgbchartasklist.prompt), { words: extension_settings.mgbchartasklist.promptWords });

    try {
        switch (source) {
            case mgbcharstaskslisted_sources.extras:
                return await callExtrasMGBCharTasksListedAPI(text);
            case mgbcharstaskslisted_sources.main:
                return await generateRaw(text, '', false, false, prompt, extension_settings.mgbchartasklist.overrideResponseLength);
            default:
                toastr.warning('Invalid summarization source specified');
                return '';
        }
    } catch (error) {
        toastr.error(String(error), 'Failed to mgbchartaskslisted text');
        console.log(error);
        return '';
    }
}

async function mgbchartaskslistedChat(context) {
    const skipWIAN = extension_settings.mgbchartasklist.SkipWIAN;
    switch (extension_settings.mgbchartasklist.source) {
        case mgbcharstaskslisted_sources.extras:
            await mgbchartaskslistedChatExtras(context);
            break;
        case mgbcharstaskslisted_sources.main:
            await mgbchartaskslistedChatMain(context, false, skipWIAN);
            break;
        default:
            break;
    }
}

async function mgbchartaskslistedChatMain(context, force, skipWIAN) {

    if (extension_settings.mgbchartasklist.promptInterval === 0 && !force) {
        console.debug('Prompt interval is set to 0, skipping summarization');
        return;
    }

    try {
        // Wait for group to finish generating
        if (selected_group) {
            await waitUntilCondition(() => is_group_generating === false, 4000, 10);
        }
        // Wait for the send button to be released
        waitUntilCondition(() => is_send_press === false, 30000, 100);
    } catch {
        console.debug('Timeout waiting for is_send_press');
        return;
    }

    if (!context.chat.length) {
        console.debug('No messages in chat to mgbchartaskslisted');
        return;
    }

    if (context.chat.length < extension_settings.mgbchartasklist.promptInterval && !force) {
        console.debug(`Not enough messages in chat to mgbchartaskslisted (chat: ${context.chat.length}, interval: ${extension_settings.mgbchartasklist.promptInterval})`);
        return;
    }

    let messagesSinceLastMGBCharsTasksListed = 0;
    let wordsSinceLastMGBCharsTasksListed = 0;
    let conditionSatisfied = false;
    for (let i = context.chat.length - 1; i >= 0; i--) {
        if (context.chat[i].extra && context.chat[i].extra.mgbchartasklist) {
            break;
        }
        messagesSinceLastMGBCharsTasksListed++;
        wordsSinceLastMGBCharsTasksListed += extractAllWords(context.chat[i].mes).length;
    }

    if (messagesSinceLastMGBCharsTasksListed >= extension_settings.mgbchartasklist.promptInterval) {
        conditionSatisfied = true;
    }

    if (extension_settings.mgbchartasklist.promptForceWords && wordsSinceLastMGBCharsTasksListed >= extension_settings.mgbchartasklist.promptForceWords) {
        conditionSatisfied = true;
    }

    if (!conditionSatisfied && !force) {
        console.debug(`MGBCharsTasksListed conditions not satisfied (messages: ${messagesSinceLastMGBCharsTasksListed}, interval: ${extension_settings.mgbchartasklist.promptInterval}, words: ${wordsSinceLastMGBCharsTasksListed}, force words: ${extension_settings.mgbchartasklist.promptForceWords})`);
        return;
    }

    console.log('Summarizing chat, messages since last mgbcharstaskslisted: ' + messagesSinceLastMGBCharsTasksListed, 'words since last mgbcharstaskslisted: ' + wordsSinceLastMGBCharsTasksListed);
    const prompt = substituteParamsExtended(extension_settings.mgbchartasklist.prompt, { words: extension_settings.mgbchartasklist.promptWords });

    if (!prompt) {
        console.debug('Summarization prompt is empty. Skipping summarization.');
        return;
    }

    console.log('sending mgbcharstaskslisted prompt');
    let mgbcharstaskslisted = '';
    let index = null;

    if (prompt_builders.DEFAULT === extension_settings.mgbchartasklist.prompt_builder) {
        mgbcharstaskslisted = await generateQuietPrompt(prompt, false, skipWIAN, '', '', extension_settings.mgbchartasklist.overrideResponseLength);
    }

    if ([prompt_builders.RAW_BLOCKING, prompt_builders.RAW_NON_BLOCKING].includes(extension_settings.mgbchartasklist.prompt_builder)) {
        const lock = extension_settings.mgbchartasklist.prompt_builder === prompt_builders.RAW_BLOCKING;
        try {
            if (lock) {
                deactivateSendButtons();
            }

            const { rawPrompt, lastUsedIndex } = await getRawMGBCharsTasksListedPrompt(context, prompt);

            if (lastUsedIndex === null || lastUsedIndex === -1) {
                if (force) {
                    toastr.info('To try again, remove the latest mgbcharstaskslisted.', 'No messages found to mgbchartaskslisted');
                }

                return null;
            }

            mgbcharstaskslisted = await generateRaw(rawPrompt, '', false, false, prompt, extension_settings.mgbchartasklist.overrideResponseLength);
            index = lastUsedIndex;
        } finally {
            if (lock) {
                activateSendButtons();
            }
        }
    }

    const newContext = getContext();

    // something changed during summarization request
    if (newContext.groupId !== context.groupId
        || newContext.chatId !== context.chatId
        || (!newContext.groupId && (newContext.characterId !== context.characterId))) {
        console.log('Context changed, mgbcharstaskslisted discarded');
        return;
    }

    setMGBCharTaskListContext(mgbcharstaskslisted, true, index);
    return mgbcharstaskslisted;
}

/**
 * Get the raw summarization prompt from the chat context.
 * @param {object} context ST context
 * @param {string} prompt Summarization system prompt
 * @returns {Promise<{rawPrompt: string, lastUsedIndex: number}>} Raw summarization prompt
 */
async function getRawMGBCharsTasksListedPrompt(context, prompt) {
    /**
     * Get the mgbchartasklist string from the chat buffer.
     * @param {boolean} includeSystem Include prompt into the mgbchartasklist string
     * @returns {string} MGBCharTaskList string
     */
    function getMGBCharTaskListString(includeSystem) {
        const delimiter = '\n\n';
        const stringBuilder = [];
        const bufferString = chatBuffer.slice().join(delimiter);

        if (includeSystem) {
            stringBuilder.push(prompt);
        }

        if (latestMGBCharsTasksListed) {
            stringBuilder.push(latestMGBCharsTasksListed);
        }

        stringBuilder.push(bufferString);

        return stringBuilder.join(delimiter).trim();
    }

    const chat = context.chat.slice();
    const latestMGBCharsTasksListed = getLatestMGBCharTaskListFromChat(chat);
    const latestMGBCharsTasksListedIndex = getIndexOfLatestChatMGBCharsTasksListed(chat);
    chat.pop(); // We always exclude the last message from the buffer
    const chatBuffer = [];
    const PADDING = 64;
    const PROMPT_SIZE = getMaxContextSize(extension_settings.mgbchartasklist.overrideResponseLength);
    let latestUsedMessage = null;

    for (let index = latestMGBCharsTasksListedIndex + 1; index < chat.length; index++) {
        const message = chat[index];

        if (!message) {
            break;
        }

        if (message.is_system || !message.mes) {
            continue;
        }

        const entry = `${message.name}:\n${message.mes}`;
        chatBuffer.push(entry);

        const tokens = await getTokenCountAsync(getMGBCharTaskListString(true), PADDING);

        if (tokens > PROMPT_SIZE) {
            chatBuffer.pop();
            break;
        }

        latestUsedMessage = message;

        if (extension_settings.mgbchartasklist.maxMessagesPerRequest > 0 && chatBuffer.length >= extension_settings.mgbchartasklist.maxMessagesPerRequest) {
            break;
        }
    }

    const lastUsedIndex = context.chat.indexOf(latestUsedMessage);
    const rawPrompt = getMGBCharTaskListString(false);
    return { rawPrompt, lastUsedIndex };
}

async function mgbchartaskslistedChatExtras(context) {
    function getMGBCharTaskListString() {
        return (longMGBCharTaskList + '\n\n' + mgbchartasklistBuffer.slice().reverse().join('\n\n')).trim();
    }

    const chat = context.chat;
    const longMGBCharTaskList = getLatestMGBCharTaskListFromChat(chat);
    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    const mgbchartasklistBuffer = [];
    const CONTEXT_SIZE = 1024 - 64;

    for (const message of reversedChat) {
        // we reached the point of latest mgbchartasklist
        if (longMGBCharTaskList && message.extra && message.extra.mgbchartasklist == longMGBCharTaskList) {
            break;
        }

        // don't care about system
        if (message.is_system) {
            continue;
        }

        // determine the sender's name
        const entry = `${message.name}:\n${message.mes}`;
        mgbchartasklistBuffer.push(entry);

        // check if token limit was reached
        const tokens = getTextTokens(tokenizers.GPT2, getMGBCharTaskListString()).length;
        if (tokens >= CONTEXT_SIZE) {
            break;
        }
    }

    const resultingString = getMGBCharTaskListString();
    const resultingTokens = getTextTokens(tokenizers.GPT2, resultingString).length;

    if (!resultingString || resultingTokens < CONTEXT_SIZE) {
        console.debug('Not enough context to mgbchartaskslisted');
        return;
    }

    // perform the summarization API call
    try {
        inApiCall = true;
        const mgbcharstaskslisted = await callExtrasMGBCharTasksListedAPI(resultingString);
        const newContext = getContext();

        // something changed during summarization request
        if (newContext.groupId !== context.groupId
            || newContext.chatId !== context.chatId
            || (!newContext.groupId && (newContext.characterId !== context.characterId))) {
            console.log('Context changed, mgbcharstaskslisted discarded');
            return;
        }

        setMGBCharTaskListContext(mgbcharstaskslisted, true);
    }
    catch (error) {
        console.log(error);
    }
    finally {
        inApiCall = false;
    }
}

/**
 * Call the Extras API to mgbchartaskslisted the provided text.
 * @param {string} text Text to mgbchartaskslisted
 * @returns {Promise<string>} MGBCharTasksListedd text
 */
async function callExtrasMGBCharTasksListedAPI(text) {
    if (!modules.includes('mgbchartaskslisted')) {
        throw new Error('MGBCharTasksListed module is not enabled in Extras API');
    }

    const url = new URL(getApiUrl());
    url.pathname = '/api/mgbchartaskslisted';

    const apiResult = await doExtrasFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'bypass',
        },
        body: JSON.stringify({
            text: text,
            params: {},
        }),
    });

    if (apiResult.ok) {
        const data = await apiResult.json();
        const mgbcharstaskslisted = data.mgbcharstaskslisted;
        return mgbcharstaskslisted;
    }

    throw new Error('Extras API call failed');
}

function onMGBCharTaskListRestoreClick() {
    const context = getContext();
    const content = $('#mgbchartasklist_contents').val();
    const reversedChat = context.chat.slice().reverse();
    reversedChat.shift();

    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbchartasklist == content) {
            delete mes.extra.mgbchartasklist;
            break;
        }
    }

    const newContent = getLatestMGBCharTaskListFromChat(context.chat);
    setMGBCharTaskListContext(newContent, false);
}

function onMGBCharTaskListContentInput() {
    const value = $(this).val();
    setMGBCharTaskListContext(value, true);
}

function onMGBCharTaskListPromptBuilderInput(e) {
    const value = Number(e.target.value);
    extension_settings.mgbchartasklist.prompt_builder = value;
    saveSettingsDebounced();
}

function reinsertMGBCharTaskList() {
    const existingValue = String($('#mgbchartasklist_contents').val());
    setMGBCharTaskListContext(existingValue, false);
}

/**
 * Set the mgbcharstaskslisted value to the context and save it to the chat message extra.
 * @param {string} value Value of a mgbcharstaskslisted
 * @param {boolean} saveToMessage Should the mgbcharstaskslisted be saved to the chat message extra
 * @param {number|null} index Index of the chat message to save the mgbcharstaskslisted to. If null, the pre-last message is used.
 */
function setMGBCharTaskListContext(value, saveToMessage, index = null) {
	console.log('MGBCharsTasksListed setMGBCharTaskListContext entered.');
    const context = getContext();
    context.setExtensionPrompt(MODULE_NAME, formatMGBCharTaskListValue(value), extension_settings.mgbchartasklist.position, extension_settings.mgbchartasklist.depth, false, extension_settings.mgbchartasklist.role);
    $('#mgbchartasklist_contents').val(value);
    console.log('MGBCharsTasksListed set to: ' + value, 'Position: ' + extension_settings.mgbchartasklist.position, 'Depth: ' + extension_settings.mgbchartasklist.depth, 'Role: ' + extension_settings.mgbchartasklist.role);

    if (saveToMessage && context.chat.length) {
        const idx = index ?? context.chat.length - 2;
        const mes = context.chat[idx < 0 ? 0 : idx];

        if (!mes.extra) {
            mes.extra = {};
        }

        mes.extra.mgbchartasklist = value;
        saveChatDebounced();
    }
}

function doPopout(e) {
    const target = e.target;
    //repurposes the zoomed avatar template to server as a floating div
    if ($('#mgbcharstaskslistedExtensionPopout').length === 0) {
        console.debug('did not see popout yet, creating');
        const originalHTMLClone = $(target).parent().parent().parent().find('.inline-drawer-content').html();
        const originalElement = $(target).parent().parent().parent().find('.inline-drawer-content');
        const template = $('#zoomed_avatar_template').html();
        const controlBarHtml = `<div class="panelControlBar flex-container">
        <div id="mgbcharstaskslistedExtensionPopoutheader" class="fa-solid fa-grip drag-grabber hoverglow"></div>
        <div id="mgbcharstaskslistedExtensionPopoutClose" class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
        const newElement = $(template);
        newElement.attr('id', 'mgbcharstaskslistedExtensionPopout')
            .removeClass('zoomed_avatar')
            .addClass('draggable')
            .empty();
        const prevMGBCharsTasksListedBoxContents = $('#mgbchartasklist_contents').val(); //copy mgbcharstaskslisted box before emptying
        originalElement.empty();
        originalElement.html('<div class="flex-container alignitemscenter justifyCenter wide100p"><small>Currently popped out</small></div>');
        newElement.append(controlBarHtml).append(originalHTMLClone);
        $('body').append(newElement);
        $('#mgbcharstaskslistedExtensionDrawerContents').addClass('scrollableInnerFull');
        setMGBCharTaskListContext(prevMGBCharsTasksListedBoxContents, false); //paste prev mgbcharstaskslisted box contents into popout box
        setupListeners();
        loadSettings();
        loadMovingUIState();

        $('#mgbcharstaskslistedExtensionPopout').fadeIn(animation_duration);
        dragElement(newElement);

        //setup listener for close button to restore extensions menu
        $('#mgbcharstaskslistedExtensionPopoutClose').off('click').on('click', function () {
            $('#mgbcharstaskslistedExtensionDrawerContents').removeClass('scrollableInnerFull');
            const mgbcharstaskslistedPopoutHTML = $('#mgbcharstaskslistedExtensionDrawerContents');
            $('#mgbcharstaskslistedExtensionPopout').fadeOut(animation_duration, () => {
                originalElement.empty();
                originalElement.html(mgbcharstaskslistedPopoutHTML);
                $('#mgbcharstaskslistedExtensionPopout').remove();
            });
            loadSettings();
        });
    } else {
        console.debug('saw existing popout, removing');
        $('#mgbcharstaskslistedExtensionPopout').fadeOut(animation_duration, () => { $('#mgbcharstaskslistedExtensionPopoutClose').trigger('click'); });
    }
}

function setupListeners() {
    //setup shared listeners for popout and regular ext menu
    $('#mgbchartasklist_restore').off('click').on('click', onMGBCharTaskListRestoreClick);
    $('#mgbchartasklist_contents').off('click').on('input', onMGBCharTaskListContentInput);
    $('#mgbchartasklist_frozen').off('click').on('input', onMGBCharTaskListFrozenInput);
    $('#mgbchartasklist_skipWIAN').off('click').on('input', onMGBCharTaskListSkipWIANInput);
    $('#mgbcharstaskslisted_source').off('click').on('change', onMGBCharsTasksListedSourceChange);
    $('#mgbchartasklist_prompt_words').off('click').on('input', onMGBCharTaskListPromptWordsInput);
    $('#mgbchartasklist_prompt_interval').off('click').on('input', onMGBCharTaskListPromptIntervalInput);
    $('#mgbchartasklist_prompt').off('click').on('input', onMGBCharTaskListPromptInput);
    $('#mgbchartasklist_force_mgbchartaskslisted').off('click').on('click', forceMGBCharTasksListedChat);
    $('#mgbchartasklist_template').off('click').on('input', onMGBCharTaskListTemplateInput);
    $('#mgbchartasklist_depth').off('click').on('input', onMGBCharTaskListDepthInput);
    $('#mgbchartasklist_role').off('click').on('input', onMGBCharTaskListRoleInput);
    $('input[name="mgbchartasklist_position"]').off('click').on('change', onMGBCharTaskListPositionChange);
    $('#mgbchartasklist_prompt_words_force').off('click').on('input', onMGBCharTaskListPromptWordsForceInput);
    $('#mgbchartasklist_prompt_builder_default').off('click').on('input', onMGBCharTaskListPromptBuilderInput);
    $('#mgbchartasklist_prompt_builder_raw_blocking').off('click').on('input', onMGBCharTaskListPromptBuilderInput);
    $('#mgbchartasklist_prompt_builder_raw_non_blocking').off('click').on('input', onMGBCharTaskListPromptBuilderInput);
    $('#mgbchartasklist_prompt_restore').off('click').on('click', onMGBCharTaskListPromptRestoreClick);
    $('#mgbchartasklist_prompt_interval_auto').off('click').on('click', onPromptIntervalAutoClick);
    $('#mgbchartasklist_prompt_words_auto').off('click').on('click', onPromptForceWordsAutoClick);
    $('#mgbchartasklist_override_response_length').off('click').on('input', onOverrideResponseLengthInput);
    $('#mgbchartasklist_max_messages_per_request').off('click').on('input', onMaxMessagesPerRequestInput);
    $('#mgbcharstaskslistedSettingsBlockToggle').off('click').on('click', function () {
        console.log('saw settings button click');
        $('#mgbcharstaskslistedSettingsBlock').slideToggle(200, 'swing'); //toggleClass("hidden");
    });
}

jQuery(async function () {
	
	console.log('MGBCharsTasksListed: Initial jQuery entered.');
	
    async function addExtensionControls() {
		console.log('MGBCharsTasksListed: addExtensionControls entered.');
        const settingsHtml = await renderExtensionTemplateAsync('mgbchartasklist', 'settings', { defaultSettings });
	//	console.log('MGBCharsTasksListed: settingsHtml value - ' + settingsHtml);
        $('#mgbchartaskslisted_container').append(settingsHtml);
        setupListeners();
        $('#mgbcharstaskslistedExtensionPopoutButton').off('click').on('click', function (e) {
            doPopout(e);
            e.stopPropagation();
        });
    }

    await addExtensionControls();
    loadSettings();
    eventSource.on(event_types.MESSAGE_RECEIVED, onChatEvent);
    eventSource.on(event_types.MESSAGE_DELETED, onChatEvent);
    eventSource.on(event_types.MESSAGE_EDITED, onChatEvent);
    eventSource.on(event_types.MESSAGE_SWIPED, onChatEvent);
    eventSource.on(event_types.CHAT_CHANGED, onChatEvent);
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mgbchartaskslisted',
        callback: mgbchartaskslistedCallback,
        namedArgumentList: [
            new SlashCommandNamedArgument('source', 'API to use for summarization', [ARGUMENT_TYPE.STRING], false, false, '', ['main', 'extras']),
            SlashCommandNamedArgument.fromProps({
                name: 'prompt',
                description: 'prompt to use for summarization',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: '',
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument('text to mgbchartaskslisted', [ARGUMENT_TYPE.STRING], false, false, ''),
        ],
        helpString: 'MGBCharTasksListeds the given text. If no text is provided, the current chat will be mgbchartaskslistedd. Can specify the source and the prompt to use.',
        returns: ARGUMENT_TYPE.STRING,
    }));
});
