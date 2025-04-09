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

const MODULE_NAME = '1_mgbcharmemory';

let lastCharacterId = null;
let lastGroupId = null;
let lastChatId = null;
let lastMessageHash = null;
let lastMessageId = null;
let inApiCall = false;

const formatMGBCharMemoryValue = function (value) {
    if (!value) {
        return '';
    }

    value = value.trim();

    if (extension_settings.mgbcharmemory.template) {
        return substituteParamsExtended(extension_settings.mgbcharmemory.template, { mgbcharsummary: value });
    } else {
        return `MGBCharSummary: ${value}`;
    }
};

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

const mgbcharsummary_sources = {
    'extras': 'extras',
    'main': 'main',
};

const prompt_builders = {
    DEFAULT: 0,
    RAW_BLOCKING: 1,
    RAW_NON_BLOCKING: 2,
};

const defaultPrompt = '[Pause your roleplay. You will act as a Narrator to create a character overview summary.  \n\nAs a Narrator, your primary function is to create a highlighted and accurate summary of the character, {{chosechar}}, within the current narrative environment, acting as a seamless summarizer within a novel-style role-play setting. Your focus is on capturing the core aspects of {{chosechar}}, character developments, and interpersonal relationships with precision and clarity, without reflecting on yourself as an entity or making any self-references. Your sole purpose is to capture the progression of {{chosechar}}\'s character by providing a top level summary that captures the essence, growth, and releationship developments, emphasizing detail over dramatization, regardless of the nature of the content.\n\nYou use clear and descriptive language to accurately capture key elements, character interactions, emotional developments, and relationship details, within the narrative. Functioning as a summarizer within the narrative, you provide bullit listed summaries that will act as a quick review long-term memory capture, maintaining the style and tone of the existing narrative environment. You identify and highlight critical developments and key nuanced details, ensuring that the summaries capture the most important character details, pivotal moments of growth, as well as character interpersonal relationship statuses.\n\nYou maintain an unbiased perspective, focusing solely on narrating without personal reflection or discrimination of the content. You adjust to the tone and style of the narrative, ensuring that summaries capture the overall character essence within the context provided while maintaining past-tense third-person narrative format in a bullit list. You pay close attention to detail, ensuring that key points, interpersonal relationship elements, and emotional undertones, are captured accurately within the word limit specified on each request.\n\nAs a Narrator, you will not inquire for clarifications that might break the immersive narrative experience. Instead, you will utilize the information provided to create the most fitting bullit summary possible.\n\nActive Request:\nCreate a character overview summary for {{chosechar}}. If a summary currently exists in your memory, use that as a base to summarize and expand with new developments. Be concise. Limit the summary to {{words}} words or less. Your response should include nothing but the bullit list in third person narrative format.]';
const defaultTemplate = '[---- Begin Brief Overview of {{chosechar}} ----\n\n{{mgbcharsummary}}\n\n---- End Brief Overview of {{chosechar}} ----]';

const defaultSettings = {
    mgbcharmemoryFrozen: false,
    SkipWIAN: false,
    source: mgbcharsummary_sources.extras,
    prompt: defaultPrompt,
    template: defaultTemplate,
    position: extension_prompt_types.IN_PROMPT,
    role: extension_prompt_roles.SYSTEM,
    depth: 2,
	chosechar: "Chose",
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
    if (Object.keys(extension_settings.mgbcharmemory).length === 0) {
        Object.assign(extension_settings.mgbcharmemory, defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings.mgbcharmemory[key] === undefined) {
            extension_settings.mgbcharmemory[key] = defaultSettings[key];
        }
    }

    $('#mgbcharsummary_source').val(extension_settings.mgbcharmemory.source).trigger('change');
    $('#mgbcharmemory_frozen').prop('checked', extension_settings.mgbcharmemory.mgbcharmemoryFrozen).trigger('input');
    $('#mgbcharmemory_skipWIAN').prop('checked', extension_settings.mgbcharmemory.SkipWIAN).trigger('input');
    $('#mgbcharmemory_prompt').val(extension_settings.mgbcharmemory.prompt).trigger('input');
    $('#mgbcharmemory_prompt_words').val(extension_settings.mgbcharmemory.promptWords).trigger('input');
    $('#mgbcharmemory_prompt_interval').val(extension_settings.mgbcharmemory.promptInterval).trigger('input');
    $('#mgbcharmemory_template').val(extension_settings.mgbcharmemory.template).trigger('input');
    $('#mgbcharmemory_depth').val(extension_settings.mgbcharmemory.depth).trigger('input');
	$('#mgbcharmemory_chosechar').val(extension_settings.mgbcharmemory.chosechar).trigger('input');
    $('#mgbcharmemory_role').val(extension_settings.mgbcharmemory.role).trigger('input');
    $(`input[name="mgbcharmemory_position"][value="${extension_settings.mgbcharmemory.position}"]`).prop('checked', true).trigger('input');
    $('#mgbcharmemory_prompt_words_force').val(extension_settings.mgbcharmemory.promptForceWords).trigger('input');
    $(`input[name="mgbcharmemory_prompt_builder"][value="${extension_settings.mgbcharmemory.prompt_builder}"]`).prop('checked', true).trigger('input');
    $('#mgbcharmemory_override_response_length').val(extension_settings.mgbcharmemory.overrideResponseLength).trigger('input');
    $('#mgbcharmemory_max_messages_per_request').val(extension_settings.mgbcharmemory.maxMessagesPerRequest).trigger('input');
	$('#mgbcharmemory_include_wi_scan').prop('checked', extension_settings.mgbcharmemory.scan).trigger('input');
    switchSourceControls(extension_settings.mgbcharmemory.source);
}

async function onPromptForceWordsAutoClick() {
    const context = getContext();
    const maxPromptLength = getMaxContextSize(extension_settings.mgbcharmemory.overrideResponseLength);
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
    const mgbcharsummaryPromptWords = extractAllWords(extension_settings.mgbcharmemory.prompt).length;
    const promptAllowanceWords = maxPromptLengthWords - extension_settings.mgbcharmemory.promptWords - mgbcharsummaryPromptWords;
    const averageMessagesPerPrompt = Math.floor(promptAllowanceWords / averageMessageWordCount);
    const maxMessagesPerMGBCharSummary = extension_settings.mgbcharmemory.maxMessagesPerRequest || 0;
    const targetMessagesInPrompt = maxMessagesPerMGBCharSummary > 0 ? maxMessagesPerMGBCharSummary : Math.max(0, averageMessagesPerPrompt);
    const targetMGBCharSummaryWords = (targetMessagesInPrompt * averageMessageWordCount) + (promptAllowanceWords / 4);

    console.table({
        maxPromptLength,
        maxPromptLengthWords,
        promptAllowanceWords,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        targetMGBCharSummaryWords,
        wordsPerPrompt,
        wordsPerToken,
        tokensPerWord,
        messagesWordCount,
    });

    const ROUNDING = 100;
    extension_settings.mgbcharmemory.promptForceWords = Math.max(1, Math.floor(targetMGBCharSummaryWords / ROUNDING) * ROUNDING);
    $('#mgbcharmemory_prompt_words_force').val(extension_settings.mgbcharmemory.promptForceWords).trigger('input');
}

async function onPromptIntervalAutoClick() {
    const context = getContext();
    const maxPromptLength = getMaxContextSize(extension_settings.mgbcharmemory.overrideResponseLength);
    const chat = context.chat;
    const allMessages = chat.filter(m => !m.is_system && m.mes).map(m => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const messagesTokenCount = await getTokenCountAsync(allMessages.join('\n'));
    const tokensPerWord = messagesTokenCount / messagesWordCount;
    const averageMessageTokenCount = messagesTokenCount / allMessages.length;
    const targetMGBCharSummaryTokens = Math.round(extension_settings.mgbcharmemory.promptWords * tokensPerWord);
    const promptTokens = await getTokenCountAsync(extension_settings.mgbcharmemory.prompt);
    const promptAllowance = maxPromptLength - promptTokens - targetMGBCharSummaryTokens;
    const maxMessagesPerMGBCharSummary = extension_settings.mgbcharmemory.maxMessagesPerRequest || 0;
    const averageMessagesPerPrompt = Math.floor(promptAllowance / averageMessageTokenCount);
    const targetMessagesInPrompt = maxMessagesPerMGBCharSummary > 0 ? maxMessagesPerMGBCharSummary : Math.max(0, averageMessagesPerPrompt);
    const adjustedAverageMessagesPerPrompt = targetMessagesInPrompt + (averageMessagesPerPrompt - targetMessagesInPrompt) / 4;

    console.table({
        maxPromptLength,
        promptAllowance,
        targetMGBCharSummaryTokens,
        promptTokens,
        messagesWordCount,
        messagesTokenCount,
        tokensPerWord,
        averageMessageTokenCount,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        adjustedAverageMessagesPerPrompt,
        maxMessagesPerMGBCharSummary,
    });

    const ROUNDING = 5;
    extension_settings.mgbcharmemory.promptInterval = Math.max(1, Math.floor(adjustedAverageMessagesPerPrompt / ROUNDING) * ROUNDING);

    $('#mgbcharmemory_prompt_interval').val(extension_settings.mgbcharmemory.promptInterval).trigger('input');
}

function onMGBCharSummarySourceChange(event) {
    const value = event.target.value;
    extension_settings.mgbcharmemory.source = value;
    switchSourceControls(value);
    saveSettingsDebounced();
}

function switchSourceControls(value) {
    $('#mgbcharmemory_settings [data-mgbcharsummary-source]').each((_, element) => {
        const source = $(element).data('mgbcharsummary-source');
        $(element).toggle(source === value);
    });
}

function onMGBCharMemoryFrozenInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.mgbcharmemory.mgbcharmemoryFrozen = value;
    saveSettingsDebounced();
}

function onMGBCharMemorySkipWIANInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.mgbcharmemory.SkipWIAN = value;
    saveSettingsDebounced();
}

function onMGBCharMemoryPromptWordsInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.promptWords = Number(value);
    $('#mgbcharmemory_prompt_words_value').text(extension_settings.mgbcharmemory.promptWords);
    saveSettingsDebounced();
}

function onMGBCharMemoryPromptIntervalInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.promptInterval = Number(value);
    $('#mgbcharmemory_prompt_interval_value').text(extension_settings.mgbcharmemory.promptInterval);
    saveSettingsDebounced();
}

function onMGBCharMemoryPromptRestoreClick() {
    $('#mgbcharmemory_prompt').val(defaultPrompt).trigger('input');
}

function onMGBCharMemoryPromptInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.prompt = value;
    saveSettingsDebounced();
}

function onMGBCharMemoryTemplateInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.template = value;
    reinsertMGBCharMemory();
    saveSettingsDebounced();
}

function onMGBCharMemoryDepthInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.depth = Number(value);
    reinsertMGBCharMemory();
    saveSettingsDebounced();
}

function onMGBCharMemoryChoseCharInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.chosechar = value;
    reinsertMGBCharMemory();
    saveSettingsDebounced();
}

function onMGBCharMemoryRoleInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.role = Number(value);
    reinsertMGBCharMemory();
    saveSettingsDebounced();
}

function onMGBCharMemoryPositionChange(e) {
    const value = e.target.value;
    extension_settings.mgbcharmemory.position = value;
    reinsertMGBCharMemory();
    saveSettingsDebounced();
}

function onMGBCharMemoryPromptWordsForceInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.promptForceWords = Number(value);
    $('#mgbcharmemory_prompt_words_force_value').text(extension_settings.mgbcharmemory.promptForceWords);
    saveSettingsDebounced();
}

function onOverrideResponseLengthInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.overrideResponseLength = Number(value);
    $('#mgbcharmemory_override_response_length_value').text(extension_settings.mgbcharmemory.overrideResponseLength);
    saveSettingsDebounced();
}

function onMaxMessagesPerRequestInput() {
    const value = $(this).val();
    extension_settings.mgbcharmemory.maxMessagesPerRequest = Number(value);
    $('#mgbcharmemory_max_messages_per_request_value').text(extension_settings.mgbcharmemory.maxMessagesPerRequest);
    saveSettingsDebounced();
}

function onMGBCharMemoryIncludeWIScanInput() {
    const value = !!$(this).prop('checked');
    extension_settings.mgbcharmemory.scan = value;
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



function getLatestMGBCharMemoryFromChat(chat) {
    if (!Array.isArray(chat) || !chat.length) {
        return '';
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbcharmemory) {
            return mes.extra.mgbcharmemory;
        }
    }

    return '';
}

function getIndexOfLatestChatMGBCharSummary(chat) {
    if (!Array.isArray(chat) || !chat.length) {
        return -1;
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbcharmemory) {
            return chat.indexOf(mes);
        }
    }

    return -1;
}

async function onChatEvent() {
    // Module not enabled
    if (extension_settings.mgbcharmemory.source === mgbcharsummary_sources.extras) {
        if (!modules.includes('mgbcharsummarize')) {
            return;
        }
    }

    const context = getContext();
    const chat = context.chat;

    // no characters or group selected
    if (!context.groupId && context.characterId === undefined) {
        return;
    }

    // Generation is in progress, mgbcharsummary prevented
    if (is_send_press) {
        return;
    }

    // Chat/character/group changed
    if ((context.groupId && lastGroupId !== context.groupId) || (context.characterId !== lastCharacterId) || (context.chatId !== lastChatId)) {
        const latestMGBCharMemory = getLatestMGBCharMemoryFromChat(chat);
        setMGBCharMemoryContext(latestMGBCharMemory, false);
        saveLastValues();
        return;
    }

    // Currently summarizing or frozen state - skip
    if (inApiCall || extension_settings.mgbcharmemory.mgbcharmemoryFrozen) {
        return;
    }

    // No new messages - do nothing
    if (chat.length === 0 || (lastMessageId === chat.length && getStringHash(chat[chat.length - 1].mes) === lastMessageHash)) {
        return;
    }

    // Messages has been deleted - rewrite the context with the latest available mgbcharmemory
    if (chat.length < lastMessageId) {
        const latestMGBCharMemory = getLatestMGBCharMemoryFromChat(chat);
        setMGBCharMemoryContext(latestMGBCharMemory, false);
    }

    // Message has been edited / regenerated - delete the saved mgbcharmemory
    if (chat.length
        && chat[chat.length - 1].extra
        && chat[chat.length - 1].extra.mgbcharmemory
        && lastMessageId === chat.length
        && getStringHash(chat[chat.length - 1].mes) !== lastMessageHash) {
        delete chat[chat.length - 1].extra.mgbcharmemory;
    }

    try {
        await mgbcharsummarizeChat(context);
    }
    catch (error) {
        console.log(error);
    }
    finally {
        saveLastValues();
    }
}

async function forceMGBCharSummarizeChat() {
    if (extension_settings.mgbcharmemory.source === mgbcharsummary_sources.extras) {
        toastr.warning('Force summarization is not supported for Extras API');
        return;
    }

    const context = getContext();

    const skipWIAN = extension_settings.mgbcharmemory.SkipWIAN;
    console.log(`Skipping WIAN? ${skipWIAN}`);
    if (!context.chatId) {
        toastr.warning('No chat selected');
        return '';
    }

    toastr.info('Summarizing chat...', 'Please wait');
    const value = await mgbcharsummarizeChatMain(context, true, skipWIAN);

    if (!value) {
        toastr.warning('Failed to mgbcharsummarize chat');
        return '';
    }

    return value;
}

/**
 * Callback for the mgbcharsummarize command.
 * @param {object} args Command arguments
 * @param {string} text Text to mgbcharsummarize
 */
async function mgbcharsummarizeCallback(args, text) {
    text = text.trim();

    // Using forceMGBCharSummarizeChat to mgbcharsummarize the current chat
    if (!text) {
        return await forceMGBCharSummarizeChat();
    }

    const source = args.source || extension_settings.mgbcharmemory.source;
    const prompt = substituteParamsExtended((args.prompt || extension_settings.mgbcharmemory.prompt), { words: extension_settings.mgbcharmemory.promptWords });

    try {
        switch (source) {
            case mgbcharsummary_sources.extras:
                return await callExtrasMGBCharSummarizeAPI(text);
            case mgbcharsummary_sources.main:
                return await generateRaw(text, '', false, false, prompt, extension_settings.mgbcharmemory.overrideResponseLength);
            default:
                toastr.warning('Invalid summarization source specified');
                return '';
        }
    } catch (error) {
        toastr.error(String(error), 'Failed to mgbcharsummarize text');
        console.log(error);
        return '';
    }
}

async function mgbcharsummarizeChat(context) {
    const skipWIAN = extension_settings.mgbcharmemory.SkipWIAN;
    switch (extension_settings.mgbcharmemory.source) {
        case mgbcharsummary_sources.extras:
            await mgbcharsummarizeChatExtras(context);
            break;
        case mgbcharsummary_sources.main:
            await mgbcharsummarizeChatMain(context, false, skipWIAN);
            break;
        default:
            break;
    }
}

async function mgbcharsummarizeChatMain(context, force, skipWIAN) {

    if (extension_settings.mgbcharmemory.promptInterval === 0 && !force) {
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
        console.debug('No messages in chat to mgbcharsummarize');
        return;
    }

    if (context.chat.length < extension_settings.mgbcharmemory.promptInterval && !force) {
        console.debug(`Not enough messages in chat to mgbcharsummarize (chat: ${context.chat.length}, interval: ${extension_settings.mgbcharmemory.promptInterval})`);
        return;
    }

    let messagesSinceLastMGBCharSummary = 0;
    let wordsSinceLastMGBCharSummary = 0;
    let conditionSatisfied = false;
    for (let i = context.chat.length - 1; i >= 0; i--) {
        if (context.chat[i].extra && context.chat[i].extra.mgbcharmemory) {
            break;
        }
        messagesSinceLastMGBCharSummary++;
        wordsSinceLastMGBCharSummary += extractAllWords(context.chat[i].mes).length;
    }

    if (messagesSinceLastMGBCharSummary >= extension_settings.mgbcharmemory.promptInterval) {
        conditionSatisfied = true;
    }

    if (extension_settings.mgbcharmemory.promptForceWords && wordsSinceLastMGBCharSummary >= extension_settings.mgbcharmemory.promptForceWords) {
        conditionSatisfied = true;
    }

    if (!conditionSatisfied && !force) {
        console.debug(`MGBCharSummary conditions not satisfied (messages: ${messagesSinceLastMGBCharSummary}, interval: ${extension_settings.mgbcharmemory.promptInterval}, words: ${wordsSinceLastMGBCharSummary}, force words: ${extension_settings.mgbcharmemory.promptForceWords})`);
        return;
    }

    console.log('Summarizing chat, messages since last mgbcharsummary: ' + messagesSinceLastMGBCharSummary, 'words since last mgbcharsummary: ' + wordsSinceLastMGBCharSummary);
    const prompt = substituteParamsExtended(extension_settings.mgbcharmemory.prompt, { words: extension_settings.mgbcharmemory.promptWords });

    if (!prompt) {
        console.debug('Summarization prompt is empty. Skipping summarization.');
        return;
    }

    console.log('sending mgbcharsummary prompt');
    let mgbcharsummary = '';
    let index = null;

    if (prompt_builders.DEFAULT === extension_settings.mgbcharmemory.prompt_builder) {
        mgbcharsummary = await generateQuietPrompt(prompt, false, skipWIAN, '', '', extension_settings.mgbcharmemory.overrideResponseLength);
    }

    if ([prompt_builders.RAW_BLOCKING, prompt_builders.RAW_NON_BLOCKING].includes(extension_settings.mgbcharmemory.prompt_builder)) {
        const lock = extension_settings.mgbcharmemory.prompt_builder === prompt_builders.RAW_BLOCKING;
        try {
            if (lock) {
                deactivateSendButtons();
            }

            const { rawPrompt, lastUsedIndex } = await getRawMGBCharSummaryPrompt(context, prompt);

            if (lastUsedIndex === null || lastUsedIndex === -1) {
                if (force) {
                    toastr.info('To try again, remove the latest mgbcharsummary.', 'No messages found to mgbcharsummarize');
                }

                return null;
            }

            mgbcharsummary = await generateRaw(rawPrompt, '', false, false, prompt, extension_settings.mgbcharmemory.overrideResponseLength);
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
        console.log('Context changed, mgbcharsummary discarded');
        return;
    }

    setMGBCharMemoryContext(mgbcharsummary, true, index);
    return mgbcharsummary;
}

/**
 * Get the raw summarization prompt from the chat context.
 * @param {object} context ST context
 * @param {string} prompt Summarization system prompt
 * @returns {Promise<{rawPrompt: string, lastUsedIndex: number}>} Raw summarization prompt
 */
async function getRawMGBCharSummaryPrompt(context, prompt) {
    /**
     * Get the mgbcharmemory string from the chat buffer.
     * @param {boolean} includeSystem Include prompt into the mgbcharmemory string
     * @returns {string} MGBCharMemory string
     */
    function getMGBCharMemoryString(includeSystem) {
        const delimiter = '\n\n';
        const stringBuilder = [];
        const bufferString = chatBuffer.slice().join(delimiter);

        if (includeSystem) {
            stringBuilder.push(prompt);
        }

        if (latestMGBCharSummary) {
            stringBuilder.push(latestMGBCharSummary);
        }

        stringBuilder.push(bufferString);

        return stringBuilder.join(delimiter).trim();
    }

    const chat = context.chat.slice();
    const latestMGBCharSummary = getLatestMGBCharMemoryFromChat(chat);
    const latestMGBCharSummaryIndex = getIndexOfLatestChatMGBCharSummary(chat);
    chat.pop(); // We always exclude the last message from the buffer
    const chatBuffer = [];
    const PADDING = 64;
    const PROMPT_SIZE = getMaxContextSize(extension_settings.mgbcharmemory.overrideResponseLength);
    let latestUsedMessage = null;

    for (let index = latestMGBCharSummaryIndex + 1; index < chat.length; index++) {
        const message = chat[index];

        if (!message) {
            break;
        }

        if (message.is_system || !message.mes) {
            continue;
        }

        const entry = `${message.name}:\n${message.mes}`;
        chatBuffer.push(entry);

        const tokens = await getTokenCountAsync(getMGBCharMemoryString(true), PADDING);

        if (tokens > PROMPT_SIZE) {
            chatBuffer.pop();
            break;
        }

        latestUsedMessage = message;

        if (extension_settings.mgbcharmemory.maxMessagesPerRequest > 0 && chatBuffer.length >= extension_settings.mgbcharmemory.maxMessagesPerRequest) {
            break;
        }
    }

    const lastUsedIndex = context.chat.indexOf(latestUsedMessage);
    const rawPrompt = getMGBCharMemoryString(false);
    return { rawPrompt, lastUsedIndex };
}

async function mgbcharsummarizeChatExtras(context) {
    function getMGBCharMemoryString() {
        return (longMGBCharMemory + '\n\n' + mgbcharmemoryBuffer.slice().reverse().join('\n\n')).trim();
    }

    const chat = context.chat;
    const longMGBCharMemory = getLatestMGBCharMemoryFromChat(chat);
    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    const mgbcharmemoryBuffer = [];
    const CONTEXT_SIZE = 1024 - 64;

    for (const message of reversedChat) {
        // we reached the point of latest mgbcharmemory
        if (longMGBCharMemory && message.extra && message.extra.mgbcharmemory == longMGBCharMemory) {
            break;
        }

        // don't care about system
        if (message.is_system) {
            continue;
        }

        // determine the sender's name
        const entry = `${message.name}:\n${message.mes}`;
        mgbcharmemoryBuffer.push(entry);

        // check if token limit was reached
        const tokens = getTextTokens(tokenizers.GPT2, getMGBCharMemoryString()).length;
        if (tokens >= CONTEXT_SIZE) {
            break;
        }
    }

    const resultingString = getMGBCharMemoryString();
    const resultingTokens = getTextTokens(tokenizers.GPT2, resultingString).length;

    if (!resultingString || resultingTokens < CONTEXT_SIZE) {
        console.debug('Not enough context to mgbcharsummarize');
        return;
    }

    // perform the summarization API call
    try {
        inApiCall = true;
        const mgbcharsummary = await callExtrasMGBCharSummarizeAPI(resultingString);
        const newContext = getContext();

        // something changed during summarization request
        if (newContext.groupId !== context.groupId
            || newContext.chatId !== context.chatId
            || (!newContext.groupId && (newContext.characterId !== context.characterId))) {
            console.log('Context changed, mgbcharsummary discarded');
            return;
        }

        setMGBCharMemoryContext(mgbcharsummary, true);
    }
    catch (error) {
        console.log(error);
    }
    finally {
        inApiCall = false;
    }
}

/**
 * Call the Extras API to mgbcharsummarize the provided text.
 * @param {string} text Text to mgbcharsummarize
 * @returns {Promise<string>} MGBCharSummarized text
 */
async function callExtrasMGBCharSummarizeAPI(text) {
    if (!modules.includes('mgbcharsummarize')) {
        throw new Error('MGBCharSummarize module is not enabled in Extras API');
    }

    const url = new URL(getApiUrl());
    url.pathname = '/api/mgbcharsummarize';

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
        const mgbcharsummary = data.mgbcharsummary;
        return mgbcharsummary;
    }

    throw new Error('Extras API call failed');
}

function onMGBCharMemoryRestoreClick() {
    const context = getContext();
    const content = $('#mgbcharmemory_contents').val();
    const reversedChat = context.chat.slice().reverse();
    reversedChat.shift();

    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.mgbcharmemory == content) {
            delete mes.extra.mgbcharmemory;
            break;
        }
    }

    const newContent = getLatestMGBCharMemoryFromChat(context.chat);
    setMGBCharMemoryContext(newContent, false);
}

function onMGBCharMemoryContentInput() {
    const value = $(this).val();
    setMGBCharMemoryContext(value, true);
}

function onMGBCharMemoryPromptBuilderInput(e) {
    const value = Number(e.target.value);
    extension_settings.mgbcharmemory.prompt_builder = value;
    saveSettingsDebounced();
}

function reinsertMGBCharMemory() {
    const existingValue = String($('#mgbcharmemory_contents').val());
    setMGBCharMemoryContext(existingValue, false);
}

/**
 * Set the mgbcharsummary value to the context and save it to the chat message extra.
 * @param {string} value Value of a mgbcharsummary
 * @param {boolean} saveToMessage Should the mgbcharsummary be saved to the chat message extra
 * @param {number|null} index Index of the chat message to save the mgbcharsummary to. If null, the pre-last message is used.
 */
function setMGBCharMemoryContext(value, saveToMessage, index = null) {
	console.log('MGBCharSummary setMGBCharMemoryContext entered.');
    const context = getContext();
    context.setExtensionPrompt(MODULE_NAME, formatMGBCharMemoryValue(value), extension_settings.mgbcharmemory.position, extension_settings.mgbcharmemory.depth, false, extension_settings.mgbcharmemory.role);
    $('#mgbcharmemory_contents').val(value);
    console.log('MGBCharSummary set to: ' + value, 'Position: ' + extension_settings.mgbcharmemory.position, 'Depth: ' + extension_settings.mgbcharmemory.depth, 'Role: ' + extension_settings.mgbcharmemory.role);

    if (saveToMessage && context.chat.length) {
        const idx = index ?? context.chat.length - 2;
        const mes = context.chat[idx < 0 ? 0 : idx];

        if (!mes.extra) {
            mes.extra = {};
        }

        mes.extra.mgbcharmemory = value;
        saveChatDebounced();
    }
}

function doPopout(e) {
    const target = e.target;
    //repurposes the zoomed avatar template to server as a floating div
    if ($('#mgbcharsummaryExtensionPopout').length === 0) {
        console.debug('did not see popout yet, creating');
        const originalHTMLClone = $(target).parent().parent().parent().find('.inline-drawer-content').html();
        const originalElement = $(target).parent().parent().parent().find('.inline-drawer-content');
        const template = $('#zoomed_avatar_template').html();
        const controlBarHtml = `<div class="panelControlBar flex-container">
        <div id="mgbcharsummaryExtensionPopoutheader" class="fa-solid fa-grip drag-grabber hoverglow"></div>
        <div id="mgbcharsummaryExtensionPopoutClose" class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
        const newElement = $(template);
        newElement.attr('id', 'mgbcharsummaryExtensionPopout')
            .removeClass('zoomed_avatar')
            .addClass('draggable')
            .empty();
        const prevMGBCharSummaryBoxContents = $('#mgbcharmemory_contents').val(); //copy mgbcharsummary box before emptying
        originalElement.empty();
        originalElement.html('<div class="flex-container alignitemscenter justifyCenter wide100p"><small>Currently popped out</small></div>');
        newElement.append(controlBarHtml).append(originalHTMLClone);
        $('body').append(newElement);
        $('#mgbcharsummaryExtensionDrawerContents').addClass('scrollableInnerFull');
        setMGBCharMemoryContext(prevMGBCharSummaryBoxContents, false); //paste prev mgbcharsummary box contents into popout box
        setupListeners();
        loadSettings();
        loadMovingUIState();

        $('#mgbcharsummaryExtensionPopout').fadeIn(animation_duration);
        dragElement(newElement);

        //setup listener for close button to restore extensions menu
        $('#mgbcharsummaryExtensionPopoutClose').off('click').on('click', function () {
            $('#mgbcharsummaryExtensionDrawerContents').removeClass('scrollableInnerFull');
            const mgbcharsummaryPopoutHTML = $('#mgbcharsummaryExtensionDrawerContents');
            $('#mgbcharsummaryExtensionPopout').fadeOut(animation_duration, () => {
                originalElement.empty();
                originalElement.html(mgbcharsummaryPopoutHTML);
                $('#mgbcharsummaryExtensionPopout').remove();
            });
            loadSettings();
        });
    } else {
        console.debug('saw existing popout, removing');
        $('#mgbcharsummaryExtensionPopout').fadeOut(animation_duration, () => { $('#mgbcharsummaryExtensionPopoutClose').trigger('click'); });
    }
}

function setupListeners() {
    //setup shared listeners for popout and regular ext menu
    $('#mgbcharmemory_restore').off('click').on('click', onMGBCharMemoryRestoreClick);
    $('#mgbcharmemory_contents').off('click').on('input', onMGBCharMemoryContentInput);
    $('#mgbcharmemory_frozen').off('click').on('input', onMGBCharMemoryFrozenInput);
    $('#mgbcharmemory_skipWIAN').off('click').on('input', onMGBCharMemorySkipWIANInput);
    $('#mgbcharsummary_source').off('click').on('change', onMGBCharSummarySourceChange);
    $('#mgbcharmemory_prompt_words').off('click').on('input', onMGBCharMemoryPromptWordsInput);
    $('#mgbcharmemory_prompt_interval').off('click').on('input', onMGBCharMemoryPromptIntervalInput);
    $('#mgbcharmemory_prompt').off('click').on('input', onMGBCharMemoryPromptInput);
    $('#mgbcharmemory_force_mgbcharsummarize').off('click').on('click', forceMGBCharSummarizeChat);
    $('#mgbcharmemory_template').off('click').on('input', onMGBCharMemoryTemplateInput);
    $('#mgbcharmemory_depth').off('click').on('input', onMGBCharMemoryDepthInput);
	$('#mgbcharmemory_chosechar').off('click').on('input', onMGBCharMemoryChoseCharInput);
    $('#mgbcharmemory_role').off('click').on('input', onMGBCharMemoryRoleInput);
    $('input[name="mgbcharmemory_position"]').off('click').on('change', onMGBCharMemoryPositionChange);
    $('#mgbcharmemory_prompt_words_force').off('click').on('input', onMGBCharMemoryPromptWordsForceInput);
    $('#mgbcharmemory_prompt_builder_default').off('click').on('input', onMGBCharMemoryPromptBuilderInput);
    $('#mgbcharmemory_prompt_builder_raw_blocking').off('click').on('input', onMGBCharMemoryPromptBuilderInput);
    $('#mgbcharmemory_prompt_builder_raw_non_blocking').off('click').on('input', onMGBCharMemoryPromptBuilderInput);
    $('#mgbcharmemory_prompt_restore').off('click').on('click', onMGBCharMemoryPromptRestoreClick);
    $('#mgbcharmemory_prompt_interval_auto').off('click').on('click', onPromptIntervalAutoClick);
    $('#mgbcharmemory_prompt_words_auto').off('click').on('click', onPromptForceWordsAutoClick);
    $('#mgbcharmemory_override_response_length').off('click').on('input', onOverrideResponseLengthInput);
    $('#mgbcharmemory_max_messages_per_request').off('click').on('input', onMaxMessagesPerRequestInput);
	$('#mgbcharmemory_include_wi_scan').off('input').on('input', onMGBCharMemoryIncludeWIScanInput);
    $('#mgbcharsummarySettingsBlockToggle').off('click').on('click', function () {
        console.log('saw settings button click');
        $('#mgbcharsummarySettingsBlock').slideToggle(200, 'swing'); //toggleClass("hidden");
    });
}

jQuery(async function () {
	
	console.log('MGBCharSummary: Initial jQuery entered.');
	
    async function addExtensionControls() {
		console.log('MGBCharSummary: addExtensionControls entered.');
        const settingsHtml = await renderExtensionTemplateAsync('mgbcharmemory', 'settings', { defaultSettings });
	//	console.log('MGBCharSummary: settingsHtml value - ' + settingsHtml);
        $('#mgbcharsummarize_container').append(settingsHtml);
        setupListeners();
        $('#mgbcharsummaryExtensionPopoutButton').off('click').on('click', function (e) {
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
        name: 'mgbcharsummarize',
        callback: mgbcharsummarizeCallback,
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
            new SlashCommandArgument('text to mgbcharsummarize', [ARGUMENT_TYPE.STRING], false, false, ''),
        ],
        helpString: 'MGBCharSummarizes the given text. If no text is provided, the current chat will be mgbcharsummarized. Can specify the source and the prompt to use.',
        returns: ARGUMENT_TYPE.STRING,
    }));
});
