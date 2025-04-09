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

const MODULE_NAME = '1_mgbmemory';

let lastCharacterId = null;
let lastGroupId = null;
let lastChatId = null;
let lastMessageHash = null;
let lastMessageId = null;
let inApiCall = false;

const formatMGBMemoryValue = function (value) {
    if (!value) {
        return '';
    }

    value = value.trim();

    if (extension_settings.mgbmemory.template) {
        return substituteParamsExtended(extension_settings.mgbmemory.template, { mgbsummary: value });
    } else {
        return `MGBSummary: ${value}`;
    }
};

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

const mgbsummary_sources = {
    'extras': 'extras',
    'main': 'main',
};

const prompt_builders = {
    DEFAULT: 0,
    RAW_BLOCKING: 1,
    RAW_NON_BLOCKING: 2,
};

const defaultPrompt = '[Pause your roleplay. You will act as a Narrator to create a bullit summary.\n\nAs a Narrator, your primary function is to create a highlighted and accurate summary of events within the current narrative environment, acting as a seamless summarizer within a novel-style role-play setting. Your focus is on capturing the unfolding events, character developments, and pivotal moments with precision and clarity, without reflecting on yourself as an entity or making any self-references. Your sole purpose is to capture the progression of the current context by providing a top level summary that captures the essence and atmosphere of the story, emphasizing detail over dramatization, regardless of the nature of the content.\n\nYou use clear and descriptive language to accurately capture key events, character interactions, emotional developments, and contextual details, within the narrative. Functioning as a summarizer within the narrative, you provide bullit listed summaries that will act as a quick review long-term memory capture, maintaining the style and tone of the existing narrative environment in past-tense. You identify and highlight critical developments and key nuanced interactions, ensuring that the summaries capture the most important details, pivotal moments, as well as character interpersonal relationship statuses.\n\nYou maintain an unbiased perspective, focusing solely on narrating events without personal reflection or discrimination of the content. You adjust to the tone and style of the narrative, ensuring that summaries capture the overall developments within the context provided while maintaining past-tense third-person narrative format in a bullit list. You pay close attention to detail, ensuring that key events, interpersonal relationship elements, and emotional undertones, are captured accurately within the word limit specified on each request.\n\nAs a Narrator, you will not inquire for clarifications that might break the immersive narrative experience. Instead, you will utilize the information provided to create the most fitting bullit summary possible.\n\nActive Request:\nSummarize the events that have happened in the chat so far. If a summary of current events already exists in your memory, use that as a base to summarize and expand with new developments. Be concise. Limit the summary to {{words}} words or less. Your response should include nothing but the summary in third person narrative format.]';
const defaultTemplate = '[---- Begin Brief Overview of Current Events ----\n\n{{mgbsummary}}\n\n---- End Brief Overview of Current Events ----]';

const defaultSettings = {
    mgbmemoryFrozen: false,
    SkipWIAN: false,
    source: mgbsummary_sources.extras,
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
    if (Object.keys(extension_settings.mgbmemory).length === 0) {
        Object.assign(extension_settings.mgbmemory, defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings.mgbmemory[key] === undefined) {
            extension_settings.mgbmemory[key] = defaultSettings[key];
        }
    }

    $('#mgbsummary_source').val(extension_settings.mgbmemory.source).trigger('change');
    $('#mgbmemory_frozen').prop('checked', extension_settings.mgbmemory.mgbmemoryFrozen).trigger('input');
    $('#mgbmemory_skipWIAN').prop('checked', extension_settings.mgbmemory.SkipWIAN).trigger('input');
    $('#mgbmemory_prompt').val(extension_settings.mgbmemory.prompt).trigger('input');
    $('#mgbmemory_prompt_words').val(extension_settings.mgbmemory.promptWords).trigger('input');
    $('#mgbmemory_prompt_interval').val(extension_settings.mgbmemory.promptInterval).trigger('input');
    $('#mgbmemory_template').val(extension_settings.mgbmemory.template).trigger('input');
    $('#mgbmemory_depth').val(extension_settings.mgbmemory.depth).trigger('input');
    $('#mgbmemory_role').val(extension_settings.mgbmemory.role).trigger('input');
    $(`input[name="mgbmemory_position"][value="${extension_settings.mgbmemory.position}"]`).prop('checked', true).trigger('input');
    $('#mgbmemory_prompt_words_force').val(extension_settings.mgbmemory.promptForceWords).trigger('input');
    $(`input[name="mgbmemory_prompt_builder"][value="${extension_settings.mgbmemory.prompt_builder}"]`).prop('checked', true).trigger('input');
    $('#mgbmemory_override_response_length').val(extension_settings.mgbmemory.overrideResponseLength).trigger('input');
    $('#mgbmemory_max_messages_per_request').val(extension_settings.mgbmemory.maxMessagesPerRequest).trigger('input');
	$('#mgbmemory_include_wi_scan').prop('checked', extension_settings.memory.scan).trigger('input');
    switchSourceControls(extension_settings.mgbmemory.source);
}

async function onPromptForceWordsAutoClick() {
    const context = getContext();
    const maxPromptLength = getMaxContextSize(extension_settings.mgbmemory.overrideResponseLength);
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
    const mgbsummaryPromptWords = extractAllWords(extension_settings.mgbmemory.prompt).length;
    const promptAllowanceWords = maxPromptLengthWords - extension_settings.mgbmemory.promptWords - mgbsummaryPromptWords;
    const averageMessagesPerPrompt = Math.floor(promptAllowanceWords / averageMessageWordCount);
    const maxMessagesPerMGBSummary = extension_settings.mgbmemory.maxMessagesPerRequest || 0;
    const targetMessagesInPrompt = maxMessagesPerMGBSummary > 0 ? maxMessagesPerMGBSummary : Math.max(0, averageMessagesPerPrompt);
    const targetMGBSummaryWords = (targetMessagesInPrompt * averageMessageWordCount) + (promptAllowanceWords / 4);

    console.table({
        maxPromptLength,
        maxPromptLengthWords,
        promptAllowanceWords,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        targetMGBSummaryWords,
        wordsPerPrompt,
        wordsPerToken,
        tokensPerWord,
        messagesWordCount,
    });

    const ROUNDING = 100;
    extension_settings.mgbmemory.promptForceWords = Math.max(1, Math.floor(targetMGBSummaryWords / ROUNDING) * ROUNDING);
    $('#mgbmemory_prompt_words_force').val(extension_settings.mgbmemory.promptForceWords).trigger('input');
}

async function onPromptIntervalAutoClick() {
    const context = getContext();
    const maxPromptLength = getMaxContextSize(extension_settings.mgbmemory.overrideResponseLength);
    const chat = context.chat;
    const allMessages = chat.filter(m => !m.is_system && m.mes).map(m => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const messagesTokenCount = await getTokenCountAsync(allMessages.join('\n'));
    const tokensPerWord = messagesTokenCount / messagesWordCount;
    const averageMessageTokenCount = messagesTokenCount / allMessages.length;
    const targetMGBSummaryTokens = Math.round(extension_settings.mgbmemory.promptWords * tokensPerWord);
    const promptTokens = await getTokenCountAsync(extension_settings.mgbmemory.prompt);
    const promptAllowance = maxPromptLength - promptTokens - targetMGBSummaryTokens;
    const maxMessagesPerMGBSummary = extension_settings.mgbmemory.maxMessagesPerRequest || 0;
    const averageMessagesPerPrompt = Math.floor(promptAllowance / averageMessageTokenCount);
    const targetMessagesInPrompt = maxMessagesPerMGBSummary > 0 ? maxMessagesPerMGBSummary : Math.max(0, averageMessagesPerPrompt);
    const adjustedAverageMessagesPerPrompt = targetMessagesInPrompt + (averageMessagesPerPrompt - targetMessagesInPrompt) / 4;

    console.table({
        maxPromptLength,
        promptAllowance,
        targetMGBSummaryTokens,
        promptTokens,
        messagesWordCount,
        messagesTokenCount,
        tokensPerWord,
        averageMessageTokenCount,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        adjustedAverageMessagesPerPrompt,
        maxMessagesPerMGBSummary,
    });

    const ROUNDING = 5;
    extension_settings.mgbmemory.promptInterval = Math.max(1, Math.floor(adjustedAverageMessagesPerPrompt / ROUNDING) * ROUNDING);

    $('#mgbmemory_prompt_interval').val(extension_settings.mgbmemory.promptInterval).trigger('input');
}

function onMGBSummarySourceChange(event) {
    const value = event.target.value;
    extension_settings.mgbmemory.source = value;
    switchSourceControls(value);
    saveSettingsDebounced();
}

function switchSourceControls(value) {
    $('#mgbmemory_settings [data-mgbsummary-source]').each((_, element) => {
        const source = $(element).data('mgbsummary-source');
        $(element).toggle(source === value);
    });
}

function onMGBMemoryFrozenInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.mgbmemory.mgbmemoryFrozen = value;
    saveSettingsDebounced();
}

function onMGBMemorySkipWIANInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.mgbmemory.SkipWIAN = value;
    saveSettingsDebounced();
}

function onMGBMemoryPromptWordsInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.promptWords = Number(value);
    $('#mgbmemory_prompt_words_value').text(extension_settings.mgbmemory.promptWords);
    saveSettingsDebounced();
}

function onMGBMemoryPromptIntervalInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.promptInterval = Number(value);
    $('#mgbmemory_prompt_interval_value').text(extension_settings.mgbmemory.promptInterval);
    saveSettingsDebounced();
}

function onMGBMemoryPromptRestoreClick() {
    $('#mgbmemory_prompt').val(defaultPrompt).trigger('input');
}

function onMGBMemoryPromptInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.prompt = value;
    saveSettingsDebounced();
}

function onMGBMemoryTemplateInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.template = value;
    reinsertMGBMemory();
    saveSettingsDebounced();
}

function onMGBMemoryDepthInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.depth = Number(value);
    reinsertMGBMemory();
    saveSettingsDebounced();
}

function onMGBMemoryRoleInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.role = Number(value);
    reinsertMGBMemory();
    saveSettingsDebounced();
}

function onMGBMemoryPositionChange(e) {
    const value = e.target.value;
    extension_settings.mgbmemory.position = value;
    reinsertMGBMemory();
    saveSettingsDebounced();
}

function onMGBMemoryPromptWordsForceInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.promptForceWords = Number(value);
    $('#mgbmemory_prompt_words_force_value').text(extension_settings.mgbmemory.promptForceWords);
    saveSettingsDebounced();
}

function onOverrideResponseLengthInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.overrideResponseLength = Number(value);
    $('#mgbmemory_override_response_length_value').text(extension_settings.mgbmemory.overrideResponseLength);
    saveSettingsDebounced();
}

function onMaxMessagesPerRequestInput() {
    const value = $(this).val();
    extension_settings.mgbmemory.maxMessagesPerRequest = Number(value);
    $('#mgbmemory_max_messages_per_request_value').text(extension_settings.mgbmemory.maxMessagesPerRequest);
    saveSettingsDebounced();
}

function onMGBMemoryIncludeWIScanInput() {
    const value = !!$(this).prop('checked');
    extension_settings.mgbmemory.scan = value;
    reinsertMemory();
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

function getLatestMGBMemoryFromChat(chat) {
    if (!Array.isArray(chat) || !chat.length) {
        return '';
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbmemory) {
            return mes.extra.mgbmemory;
        }
    }

    return '';
}

function getIndexOfLatestChatMGBSummary(chat) {
    if (!Array.isArray(chat) || !chat.length) {
        return -1;
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbmemory) {
            return chat.indexOf(mes);
        }
    }

    return -1;
}

async function onChatEvent() {
    // Module not enabled
    if (extension_settings.mgbmemory.source === mgbsummary_sources.extras) {
        if (!modules.includes('mgbsummarize')) {
            return;
        }
    }

    const context = getContext();
    const chat = context.chat;

    // no characters or group selected
    if (!context.groupId && context.characterId === undefined) {
        return;
    }

    // Generation is in progress, mgbsummary prevented
    if (is_send_press) {
        return;
    }

    // Chat/character/group changed
    if ((context.groupId && lastGroupId !== context.groupId) || (context.characterId !== lastCharacterId) || (context.chatId !== lastChatId)) {
        const latestMGBMemory = getLatestMGBMemoryFromChat(chat);
        setMGBMemoryContext(latestMGBMemory, false);
        saveLastValues();
        return;
    }

    // Currently summarizing or frozen state - skip
    if (inApiCall || extension_settings.mgbmemory.mgbmemoryFrozen) {
        return;
    }

    // No new messages - do nothing
    if (chat.length === 0 || (lastMessageId === chat.length && getStringHash(chat[chat.length - 1].mes) === lastMessageHash)) {
        return;
    }

    // Messages has been deleted - rewrite the context with the latest available mgbmemory
    if (chat.length < lastMessageId) {
        const latestMGBMemory = getLatestMGBMemoryFromChat(chat);
        setMGBMemoryContext(latestMGBMemory, false);
    }

    // Message has been edited / regenerated - delete the saved mgbmemory
    if (chat.length
        && chat[chat.length - 1].extra
        && chat[chat.length - 1].extra.mgbmemory
        && lastMessageId === chat.length
        && getStringHash(chat[chat.length - 1].mes) !== lastMessageHash) {
        delete chat[chat.length - 1].extra.mgbmemory;
    }

    try {
        await mgbsummarizeChat(context);
    }
    catch (error) {
        console.log(error);
    }
    finally {
        saveLastValues();
    }
}

async function forceMGBSummarizeChat() {
    if (extension_settings.mgbmemory.source === mgbsummary_sources.extras) {
        toastr.warning('Force summarization is not supported for Extras API');
        return;
    }

    const context = getContext();

    const skipWIAN = extension_settings.mgbmemory.SkipWIAN;
    console.log(`Skipping WIAN? ${skipWIAN}`);
    if (!context.chatId) {
        toastr.warning('No chat selected');
        return '';
    }

    toastr.info('Summarizing chat...', 'Please wait');
    const value = await mgbsummarizeChatMain(context, true, skipWIAN);

    if (!value) {
        toastr.warning('Failed to mgbsummarize chat');
        return '';
    }

    return value;
}

/**
 * Callback for the mgbsummarize command.
 * @param {object} args Command arguments
 * @param {string} text Text to mgbsummarize
 */
async function mgbsummarizeCallback(args, text) {
    text = text.trim();

    // Using forceMGBSummarizeChat to mgbsummarize the current chat
    if (!text) {
        return await forceMGBSummarizeChat();
    }

    const source = args.source || extension_settings.mgbmemory.source;
    const prompt = substituteParamsExtended((args.prompt || extension_settings.mgbmemory.prompt), { words: extension_settings.mgbmemory.promptWords });

    try {
        switch (source) {
            case mgbsummary_sources.extras:
                return await callExtrasMGBSummarizeAPI(text);
            case mgbsummary_sources.main:
                return await generateRaw(text, '', false, false, prompt, extension_settings.mgbmemory.overrideResponseLength);
            default:
                toastr.warning('Invalid summarization source specified');
                return '';
        }
    } catch (error) {
        toastr.error(String(error), 'Failed to mgbsummarize text');
        console.log(error);
        return '';
    }
}

async function mgbsummarizeChat(context) {
    const skipWIAN = extension_settings.mgbmemory.SkipWIAN;
    switch (extension_settings.mgbmemory.source) {
        case mgbsummary_sources.extras:
            await mgbsummarizeChatExtras(context);
            break;
        case mgbsummary_sources.main:
            await mgbsummarizeChatMain(context, false, skipWIAN);
            break;
        default:
            break;
    }
}

async function mgbsummarizeChatMain(context, force, skipWIAN) {

    if (extension_settings.mgbmemory.promptInterval === 0 && !force) {
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
        console.debug('No messages in chat to mgbsummarize');
        return;
    }

    if (context.chat.length < extension_settings.mgbmemory.promptInterval && !force) {
        console.debug(`Not enough messages in chat to mgbsummarize (chat: ${context.chat.length}, interval: ${extension_settings.mgbmemory.promptInterval})`);
        return;
    }

    let messagesSinceLastMGBSummary = 0;
    let wordsSinceLastMGBSummary = 0;
    let conditionSatisfied = false;
    for (let i = context.chat.length - 1; i >= 0; i--) {
        if (context.chat[i].extra && context.chat[i].extra.mgbmemory) {
            break;
        }
        messagesSinceLastMGBSummary++;
        wordsSinceLastMGBSummary += extractAllWords(context.chat[i].mes).length;
    }

    if (messagesSinceLastMGBSummary >= extension_settings.mgbmemory.promptInterval) {
        conditionSatisfied = true;
    }

    if (extension_settings.mgbmemory.promptForceWords && wordsSinceLastMGBSummary >= extension_settings.mgbmemory.promptForceWords) {
        conditionSatisfied = true;
    }

    if (!conditionSatisfied && !force) {
        console.debug(`MGBSummary conditions not satisfied (messages: ${messagesSinceLastMGBSummary}, interval: ${extension_settings.mgbmemory.promptInterval}, words: ${wordsSinceLastMGBSummary}, force words: ${extension_settings.mgbmemory.promptForceWords})`);
        return;
    }

    console.log('Summarizing chat, messages since last mgbsummary: ' + messagesSinceLastMGBSummary, 'words since last mgbsummary: ' + wordsSinceLastMGBSummary);
    const prompt = substituteParamsExtended(extension_settings.mgbmemory.prompt, { words: extension_settings.mgbmemory.promptWords });

    if (!prompt) {
        console.debug('Summarization prompt is empty. Skipping summarization.');
        return;
    }

    console.log('sending mgbsummary prompt');
    let mgbsummary = '';
    let index = null;

    if (prompt_builders.DEFAULT === extension_settings.mgbmemory.prompt_builder) {
        mgbsummary = await generateQuietPrompt(prompt, false, skipWIAN, '', '', extension_settings.mgbmemory.overrideResponseLength);
    }

    if ([prompt_builders.RAW_BLOCKING, prompt_builders.RAW_NON_BLOCKING].includes(extension_settings.mgbmemory.prompt_builder)) {
        const lock = extension_settings.mgbmemory.prompt_builder === prompt_builders.RAW_BLOCKING;
        try {
            if (lock) {
                deactivateSendButtons();
            }

            const { rawPrompt, lastUsedIndex } = await getRawMGBSummaryPrompt(context, prompt);

            if (lastUsedIndex === null || lastUsedIndex === -1) {
                if (force) {
                    toastr.info('To try again, remove the latest mgbsummary.', 'No messages found to mgbsummarize');
                }

                return null;
            }

            mgbsummary = await generateRaw(rawPrompt, '', false, false, prompt, extension_settings.mgbmemory.overrideResponseLength);
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
        console.log('Context changed, mgbsummary discarded');
        return;
    }

    setMGBMemoryContext(mgbsummary, true, index);
    return mgbsummary;
}

/**
 * Get the raw summarization prompt from the chat context.
 * @param {object} context ST context
 * @param {string} prompt Summarization system prompt
 * @returns {Promise<{rawPrompt: string, lastUsedIndex: number}>} Raw summarization prompt
 */
async function getRawMGBSummaryPrompt(context, prompt) {
    /**
     * Get the mgbmemory string from the chat buffer.
     * @param {boolean} includeSystem Include prompt into the mgbmemory string
     * @returns {string} MGBMemory string
     */
    function getMGBMemoryString(includeSystem) {
        const delimiter = '\n\n';
        const stringBuilder = [];
        const bufferString = chatBuffer.slice().join(delimiter);

        if (includeSystem) {
            stringBuilder.push(prompt);
        }

        if (latestMGBSummary) {
            stringBuilder.push(latestMGBSummary);
        }

        stringBuilder.push(bufferString);

        return stringBuilder.join(delimiter).trim();
    }

    const chat = context.chat.slice();
    const latestMGBSummary = getLatestMGBMemoryFromChat(chat);
    const latestMGBSummaryIndex = getIndexOfLatestChatMGBSummary(chat);
    chat.pop(); // We always exclude the last message from the buffer
    const chatBuffer = [];
    const PADDING = 64;
    const PROMPT_SIZE = getMaxContextSize(extension_settings.mgbmemory.overrideResponseLength);
    let latestUsedMessage = null;

    for (let index = latestMGBSummaryIndex + 1; index < chat.length; index++) {
        const message = chat[index];

        if (!message) {
            break;
        }

        if (message.is_system || !message.mes) {
            continue;
        }

        const entry = `${message.name}:\n${message.mes}`;
        chatBuffer.push(entry);

        const tokens = await getTokenCountAsync(getMGBMemoryString(true), PADDING);

        if (tokens > PROMPT_SIZE) {
            chatBuffer.pop();
            break;
        }

        latestUsedMessage = message;

        if (extension_settings.mgbmemory.maxMessagesPerRequest > 0 && chatBuffer.length >= extension_settings.mgbmemory.maxMessagesPerRequest) {
            break;
        }
    }

    const lastUsedIndex = context.chat.indexOf(latestUsedMessage);
    const rawPrompt = getMGBMemoryString(false);
    return { rawPrompt, lastUsedIndex };
}

async function mgbsummarizeChatExtras(context) {
    function getMGBMemoryString() {
        return (longMGBMemory + '\n\n' + mgbmemoryBuffer.slice().reverse().join('\n\n')).trim();
    }

    const chat = context.chat;
    const longMGBMemory = getLatestMGBMemoryFromChat(chat);
    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    const mgbmemoryBuffer = [];
    const CONTEXT_SIZE = 1024 - 64;

    for (const message of reversedChat) {
        // we reached the point of latest mgbmemory
        if (longMGBMemory && message.extra && message.extra.mgbmemory == longMGBMemory) {
            break;
        }

        // don't care about system
        if (message.is_system) {
            continue;
        }

        // determine the sender's name
        const entry = `${message.name}:\n${message.mes}`;
        mgbmemoryBuffer.push(entry);

        // check if token limit was reached
        const tokens = getTextTokens(tokenizers.GPT2, getMGBMemoryString()).length;
        if (tokens >= CONTEXT_SIZE) {
            break;
        }
    }

    const resultingString = getMGBMemoryString();
    const resultingTokens = getTextTokens(tokenizers.GPT2, resultingString).length;

    if (!resultingString || resultingTokens < CONTEXT_SIZE) {
        console.debug('Not enough context to mgbsummarize');
        return;
    }

    // perform the summarization API call
    try {
        inApiCall = true;
        const mgbsummary = await callExtrasMGBSummarizeAPI(resultingString);
        const newContext = getContext();

        // something changed during summarization request
        if (newContext.groupId !== context.groupId
            || newContext.chatId !== context.chatId
            || (!newContext.groupId && (newContext.characterId !== context.characterId))) {
            console.log('Context changed, mgbsummary discarded');
            return;
        }

        setMGBMemoryContext(mgbsummary, true);
    }
    catch (error) {
        console.log(error);
    }
    finally {
        inApiCall = false;
    }
}

/**
 * Call the Extras API to mgbsummarize the provided text.
 * @param {string} text Text to mgbsummarize
 * @returns {Promise<string>} MGBSummarized text
 */
async function callExtrasMGBSummarizeAPI(text) {
    if (!modules.includes('mgbsummarize')) {
        throw new Error('MGBSummarize module is not enabled in Extras API');
    }

    const url = new URL(getApiUrl());
    url.pathname = '/api/mgbsummarize';

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
        const mgbsummary = data.mgbsummary;
        return mgbsummary;
    }

    throw new Error('Extras API call failed');
}

function onMGBMemoryRestoreClick() {
    const context = getContext();
    const content = $('#mgbmemory_contents').val();
    const reversedChat = context.chat.slice().reverse();
    reversedChat.shift();

    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbmemory == content) {
            delete mes.extra.mgbmemory;
            break;
        }
    }

    const newContent = getLatestMGBMemoryFromChat(context.chat);
    setMGBMemoryContext(newContent, false);
}

function onMGBMemoryContentInput() {
    const value = $(this).val();
    setMGBMemoryContext(value, true);
}

function onMGBMemoryPromptBuilderInput(e) {
    const value = Number(e.target.value);
    extension_settings.mgbmemory.prompt_builder = value;
    saveSettingsDebounced();
}

function reinsertMGBMemory() {
    const existingValue = String($('#mgbmemory_contents').val());
    setMGBMemoryContext(existingValue, false);
}

/**
 * Set the mgbsummary value to the context and save it to the chat message extra.
 * @param {string} value Value of a mgbsummary
 * @param {boolean} saveToMessage Should the mgbsummary be saved to the chat message extra
 * @param {number|null} index Index of the chat message to save the mgbsummary to. If null, the pre-last message is used.
 */
function setMGBMemoryContext(value, saveToMessage, index = null) {
	console.log('MGBSummary setMGBMemoryContext entered.');
    const context = getContext();
    context.setExtensionPrompt(MODULE_NAME, formatMGBMemoryValue(value), extension_settings.mgbmemory.position, extension_settings.mgbmemory.depth, false, extension_settings.mgbmemory.role);
    $('#mgbmemory_contents').val(value);
    console.log('MGBSummary set to: ' + value, 'Position: ' + extension_settings.mgbmemory.position, 'Depth: ' + extension_settings.mgbmemory.depth, 'Role: ' + extension_settings.mgbmemory.role);

    if (saveToMessage && context.chat.length) {
        const idx = index ?? context.chat.length - 2;
        const mes = context.chat[idx < 0 ? 0 : idx];

        if (!mes.extra) {
            mes.extra = {};
        }

        mes.extra.mgbmemory = value;
        saveChatDebounced();
    }
}

function doPopout(e) {
    const target = e.target;
    //repurposes the zoomed avatar template to server as a floating div
    if ($('#mgbsummaryExtensionPopout').length === 0) {
        console.debug('did not see popout yet, creating');
        const originalHTMLClone = $(target).parent().parent().parent().find('.inline-drawer-content').html();
        const originalElement = $(target).parent().parent().parent().find('.inline-drawer-content');
        const template = $('#zoomed_avatar_template').html();
        const controlBarHtml = `<div class="panelControlBar flex-container">
        <div id="mgbsummaryExtensionPopoutheader" class="fa-solid fa-grip drag-grabber hoverglow"></div>
        <div id="mgbsummaryExtensionPopoutClose" class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
        const newElement = $(template);
        newElement.attr('id', 'mgbsummaryExtensionPopout')
            .removeClass('zoomed_avatar')
            .addClass('draggable')
            .empty();
        const prevMGBSummaryBoxContents = $('#mgbmemory_contents').val(); //copy mgbsummary box before emptying
        originalElement.empty();
        originalElement.html('<div class="flex-container alignitemscenter justifyCenter wide100p"><small>Currently popped out</small></div>');
        newElement.append(controlBarHtml).append(originalHTMLClone);
        $('body').append(newElement);
        $('#mgbsummaryExtensionDrawerContents').addClass('scrollableInnerFull');
        setMGBMemoryContext(prevMGBSummaryBoxContents, false); //paste prev mgbsummary box contents into popout box
        setupListeners();
        loadSettings();
        loadMovingUIState();

        $('#mgbsummaryExtensionPopout').fadeIn(animation_duration);
        dragElement(newElement);

        //setup listener for close button to restore extensions menu
        $('#mgbsummaryExtensionPopoutClose').off('click').on('click', function () {
            $('#mgbsummaryExtensionDrawerContents').removeClass('scrollableInnerFull');
            const mgbsummaryPopoutHTML = $('#mgbsummaryExtensionDrawerContents');
            $('#mgbsummaryExtensionPopout').fadeOut(animation_duration, () => {
                originalElement.empty();
                originalElement.html(mgbsummaryPopoutHTML);
                $('#mgbsummaryExtensionPopout').remove();
            });
            loadSettings();
        });
    } else {
        console.debug('saw existing popout, removing');
        $('#mgbsummaryExtensionPopout').fadeOut(animation_duration, () => { $('#mgbsummaryExtensionPopoutClose').trigger('click'); });
    }
}

function setupListeners() {
    //setup shared listeners for popout and regular ext menu
    $('#mgbmemory_restore').off('click').on('click', onMGBMemoryRestoreClick);
    $('#mgbmemory_contents').off('click').on('input', onMGBMemoryContentInput);
    $('#mgbmemory_frozen').off('click').on('input', onMGBMemoryFrozenInput);
    $('#mgbmemory_skipWIAN').off('click').on('input', onMGBMemorySkipWIANInput);
    $('#mgbsummary_source').off('click').on('change', onMGBSummarySourceChange);
    $('#mgbmemory_prompt_words').off('click').on('input', onMGBMemoryPromptWordsInput);
    $('#mgbmemory_prompt_interval').off('click').on('input', onMGBMemoryPromptIntervalInput);
    $('#mgbmemory_prompt').off('click').on('input', onMGBMemoryPromptInput);
    $('#mgbmemory_force_mgbsummarize').off('click').on('click', forceMGBSummarizeChat);
    $('#mgbmemory_template').off('click').on('input', onMGBMemoryTemplateInput);
    $('#mgbmemory_depth').off('click').on('input', onMGBMemoryDepthInput);
    $('#mgbmemory_role').off('click').on('input', onMGBMemoryRoleInput);
    $('input[name="mgbmemory_position"]').off('click').on('change', onMGBMemoryPositionChange);
    $('#mgbmemory_prompt_words_force').off('click').on('input', onMGBMemoryPromptWordsForceInput);
    $('#mgbmemory_prompt_builder_default').off('click').on('input', onMGBMemoryPromptBuilderInput);
    $('#mgbmemory_prompt_builder_raw_blocking').off('click').on('input', onMGBMemoryPromptBuilderInput);
    $('#mgbmemory_prompt_builder_raw_non_blocking').off('click').on('input', onMGBMemoryPromptBuilderInput);
    $('#mgbmemory_prompt_restore').off('click').on('click', onMGBMemoryPromptRestoreClick);
    $('#mgbmemory_prompt_interval_auto').off('click').on('click', onPromptIntervalAutoClick);
    $('#mgbmemory_prompt_words_auto').off('click').on('click', onPromptForceWordsAutoClick);
    $('#mgbmemory_override_response_length').off('click').on('input', onOverrideResponseLengthInput);
    $('#mgbmemory_max_messages_per_request').off('click').on('input', onMaxMessagesPerRequestInput);
	$('#mgbmemory_include_wi_scan').off('input').on('input', onMGBMemoryIncludeWIScanInput);
    $('#mgbsummarySettingsBlockToggle').off('click').on('click', function () {
        console.log('saw settings button click');
        $('#mgbsummarySettingsBlock').slideToggle(200, 'swing'); //toggleClass("hidden");
    });
}

jQuery(async function () {
	
	console.log('MGBSummary: Initial jQuery entered.');
	
    async function addExtensionControls() {
		console.log('MGBSummary: addExtensionControls entered.');
        const settingsHtml = await renderExtensionTemplateAsync('mgbmemory', 'settings', { defaultSettings });
	//	console.log('MGBSummary: settingsHtml value - ' + settingsHtml);
        $('#mgbsummarize_container').append(settingsHtml);
        setupListeners();
        $('#mgbsummaryExtensionPopoutButton').off('click').on('click', function (e) {
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
        name: 'mgbsummarize',
        callback: mgbsummarizeCallback,
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
            new SlashCommandArgument('text to mgbsummarize', [ARGUMENT_TYPE.STRING], false, false, ''),
        ],
        helpString: 'MGBSummarizes the given text. If no text is provided, the current chat will be mgbsummarized. Can specify the source and the prompt to use.',
        returns: ARGUMENT_TYPE.STRING,
    }));
});
