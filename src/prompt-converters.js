import crypto from 'node:crypto';
import { getConfigValue } from './util.js';

const PROMPT_PLACEHOLDER = getConfigValue('promptPlaceholder', 'Let\'s get started.');

/**
 * Convert a prompt from the ChatML objects to the format used by Claude.
 * Mainly deprecated. Only used for counting tokens.
 * @param {object[]} messages Array of messages
 * @param {boolean}  addAssistantPostfix Add Assistant postfix.
 * @param {string}   addAssistantPrefill Add Assistant prefill after the assistant postfix.
 * @param {boolean}  withSysPromptSupport Indicates if the Claude model supports the system prompt format.
 * @param {boolean}  useSystemPrompt Indicates if the system prompt format should be used.
 * @param {boolean}  excludePrefixes Exlude Human/Assistant prefixes.
 * @param {string}   addSysHumanMsg Add Human message between system prompt and assistant.
 * @returns {string} Prompt for Claude
 * @copyright Prompt Conversion script taken from RisuAI by kwaroran (GPLv3).
 */
export function convertClaudePrompt(messages, addAssistantPostfix, addAssistantPrefill, withSysPromptSupport, useSystemPrompt, addSysHumanMsg, excludePrefixes) {

    //Prepare messages for claude.
    //When 'Exclude Human/Assistant prefixes' checked, setting messages role to the 'system'(last message is exception).
    if (messages.length > 0) {
        messages.forEach((m) => {
            if (!m.content) {
                m.content = '';
            }
            if (m.tool_calls) {
                m.content += JSON.stringify(m.tool_calls);
            }
        });
        if (excludePrefixes) {
            messages.slice(0, -1).forEach(message => message.role = 'system');
        } else {
            messages[0].role = 'system';
        }
        //Add the assistant's message to the end of messages.
        if (addAssistantPostfix) {
            messages.push({
                role: 'assistant',
                content: addAssistantPrefill || '',
            });
        }
        // Find the index of the first message with an assistant role and check for a "'user' role/Human:" before it.
        let hasUser = false;
        const firstAssistantIndex = messages.findIndex((message, i) => {
            if (i >= 0 && (message.role === 'user' || message.content.includes('\n\nHuman: '))) {
                hasUser = true;
            }
            return message.role === 'assistant' && i > 0;
        });
        // When 2.1+ and 'Use system prompt' checked, switches to the system prompt format by setting the first message's role to the 'system'.
        // Inserts the human's message before the first the assistant one, if there are no such message or prefix found.
        if (withSysPromptSupport && useSystemPrompt) {
            messages[0].role = 'system';
            if (firstAssistantIndex > 0 && addSysHumanMsg && !hasUser) {
                messages.splice(firstAssistantIndex, 0, {
                    role: 'user',
                    content: addSysHumanMsg,
                });
            }
        } else {
            // Otherwise, use the default message format by setting the first message's role to 'user'(compatible with all claude models including 2.1.)
            messages[0].role = 'user';
            // Fix messages order for default message format when(messages > Context Size) by merging two messages with "\n\nHuman: " prefixes into one, before the first Assistant's message.
            if (firstAssistantIndex > 0 && !excludePrefixes) {
                messages[firstAssistantIndex - 1].role = firstAssistantIndex - 1 !== 0 && messages[firstAssistantIndex - 1].role === 'user' ? 'FixHumMsg' : messages[firstAssistantIndex - 1].role;
            }
        }
    }

    // Convert messages to the prompt.
    let requestPrompt = messages.map((v, i) => {
        // Set prefix according to the role. Also, when "Exclude Human/Assistant prefixes" is checked, names are added via the system prefix.
        let prefix = {
            'assistant': '\n\nAssistant: ',
            'user': '\n\nHuman: ',
            'system': i === 0 ? '' : v.name === 'example_assistant' ? '\n\nA: ' : v.name === 'example_user' ? '\n\nH: ' : excludePrefixes && v.name ? `\n\n${v.name}: ` : '\n\n',
            'FixHumMsg': '\n\nFirst message: ',
        }[v.role] ?? '';
        // Claude doesn't support message names, so we'll just add them to the message content.
        return `${prefix}${v.name && v.role !== 'system' ? `${v.name}: ` : ''}${v.content}`;
    }).join('');

    return requestPrompt;
}

/**
 * Convert ChatML objects into working with Anthropic's new Messaging API.
 * @param {object[]} messages Array of messages
 * @param {string}   prefillString User determined prefill string
 * @param {boolean}  useSysPrompt See if we want to use a system prompt
 * @param {boolean}  useTools See if we want to use tools
 * @param {string}   humanMsgFix Add Human message between system prompt and assistant.
 * @param {string}   charName Character name
 * @param {string}   userName User name
 */
export function convertClaudeMessages(messages, prefillString, useSysPrompt, useTools, humanMsgFix, charName = '', userName = '') {
    let systemPrompt = [];
    if (useSysPrompt) {
        // Collect all the system messages up until the first instance of a non-system message, and then remove them from the messages array.
        let i;
        for (i = 0; i < messages.length; i++) {
            if (messages[i].role !== 'system') {
                break;
            }
            // Append example names if not already done by the frontend (e.g. for group chats).
            if (userName && messages[i].name === 'example_user') {
                if (!messages[i].content.startsWith(`${userName}: `)) {
                    messages[i].content = `${userName}: ${messages[i].content}`;
                }
            }
            if (charName && messages[i].name === 'example_assistant') {
                if (!messages[i].content.startsWith(`${charName}: `)) {
                    messages[i].content = `${charName}: ${messages[i].content}`;
                }
            }
            systemPrompt.push({ type: 'text', text: messages[i].content });
        }

        messages.splice(0, i);

        // Check if the first message in the array is of type user, if not, interject with humanMsgFix or a blank message.
        // Also prevents erroring out if the messages array is empty.
        if (messages.length === 0 || (messages.length > 0 && messages[0].role !== 'user')) {
            messages.unshift({
                role: 'user',
                content: humanMsgFix || PROMPT_PLACEHOLDER,
            });
        }
    }

    // Now replace all further messages that have the role 'system' with the role 'user'. (or all if we're not using one)
    const parse = (str) => typeof str === 'string' ? JSON.parse(str) : str;
    messages.forEach((message) => {
        if (message.role === 'assistant' && message.tool_calls) {
            message.content = message.tool_calls.map((tc) => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: parse(tc.function.arguments),
            }));
        }

        if (message.role === 'tool') {
            message.role = 'user';
            message.content = [{
                type: 'tool_result',
                tool_use_id: message.tool_call_id,
                content: message.content,
            }];
        }

        if (message.role === 'system') {
            if (userName && message.name === 'example_user') {
                message.content = `${userName}: ${message.content}`;
            }
            if (charName && message.name === 'example_assistant') {
                message.content = `${charName}: ${message.content}`;
            }
            message.role = 'user';

            // Delete name here so it doesn't get added later
            delete message.name;
        }

        // Convert everything to an array of it would be easier to work with
        if (typeof message.content === 'string') {
            // Take care of name properties since claude messages don't support them
            if (message.name) {
                message.content = `${message.name}: ${message.content}`;
            }

            message.content = [{ type: 'text', text: message.content }];
        } else if (Array.isArray(message.content)) {
            message.content = message.content.map((content) => {
                if (content.type === 'image_url') {
                    const imageEntry = content?.image_url;
                    const imageData = imageEntry?.url;
                    const mimeType = imageData?.split(';')?.[0].split(':')?.[1];
                    const base64Data = imageData?.split(',')?.[1];

                    return {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mimeType,
                            data: base64Data,
                        },
                    };
                }

                if (content.type === 'text') {
                    if (message.name) {
                        content.text = `${message.name}: ${content.text}`;
                    }

                    // If the text is empty, replace it with a zero-width space
                    return { type: 'text', text: content.text || '\u200b' };
                }

                return content;
            });
        }

        // Remove offending properties
        delete message.name;
        delete message.tool_calls;
        delete message.tool_call_id;
    });

    // Images in assistant messages should be moved to the next user message
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'assistant' && messages[i].content.some(c => c.type === 'image')) {
            // Find the next user message
            let j = i + 1;
            while (j < messages.length && messages[j].role !== 'user') {
                j++;
            }

            // Move the images
            if (j >= messages.length) {
                // If there is no user message after the assistant message, add a new one
                messages.splice(i + 1, 0, { role: 'user', content: [] });
            }

            messages[j].content.push(...messages[i].content.filter(c => c.type === 'image'));
            messages[i].content = messages[i].content.filter(c => c.type !== 'image');
        }
    }

    // Shouldn't be conditional anymore, messages api expects the last role to be user unless we're explicitly prefilling
    if (prefillString) {
        messages.push({
            role: 'assistant',
            // Dangling whitespace are not allowed for prefilling
            content: [{ type: 'text', text: prefillString.trimEnd() }],
        });
    }

    // Since the messaging endpoint only supports user assistant roles in turns, we have to merge messages with the same role if they follow eachother
    // Also handle multi-modality, holy slop.
    let mergedMessages = [];
    messages.forEach((message) => {
        if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === message.role) {
            mergedMessages[mergedMessages.length - 1].content.push(...message.content);
        } else {
            mergedMessages.push(message);
        }
    });

    if (!useTools) {
        mergedMessages.forEach((message) => {
            message.content.forEach((content) => {
                if (content.type === 'tool_use') {
                    content.type = 'text';
                    content.text = JSON.stringify(content.input);
                    delete content.id;
                    delete content.name;
                    delete content.input;
                }
                if (content.type === 'tool_result') {
                    content.type = 'text';
                    content.text = content.content;
                    delete content.tool_use_id;
                    delete content.content;
                }
            });
        });
    }

    return { messages: mergedMessages, systemPrompt: systemPrompt };
}

/**
 * Convert a prompt from the ChatML objects to the format used by Cohere.
 * @param {object[]} messages Array of messages
 * @param {string}   charName Character name
 * @param {string}   userName User name
 * @returns {{chatHistory: object[]}} Prompt for Cohere
 */
export function convertCohereMessages(messages, charName = '', userName = '') {
    if (messages.length === 0) {
        messages.unshift({
            role: 'user',
            content: PROMPT_PLACEHOLDER,
        });
    }

    messages.forEach((msg, index) => {
        // Tool calls require an assistent primer
        if (Array.isArray(msg.tool_calls)) {
            if (index > 0 && messages[index - 1].role === 'assistant') {
                msg.content = messages[index - 1].content;
                messages.splice(index - 1, 1);
            } else {
                msg.content = `I'm going to call a tool for that: ${msg.tool_calls.map(tc => tc?.function?.name).join(', ')}`;
            }
        }
        // No names support (who would've thought)
        if (msg.name) {
            if (msg.role == 'system' && msg.name == 'example_assistant') {
                if (charName && !msg.content.startsWith(`${charName}: `)) {
                    msg.content = `${charName}: ${msg.content}`;
                }
            }
            if (msg.role == 'system' && msg.name == 'example_user') {
                if (userName && !msg.content.startsWith(`${userName}: `)) {
                    msg.content = `${userName}: ${msg.content}`;
                }
            }
            if (msg.role !== 'system' && !msg.content.startsWith(`${msg.name}: `)) {
                msg.content = `${msg.name}: ${msg.content}`;
            }
            delete msg.name;
        }
    });

    // A prompt should end with a user/tool message
    if (messages.length && !['user', 'tool'].includes(messages[messages.length - 1].role)) {
        messages[messages.length - 1].role = 'user';
    }

    return { chatHistory: messages };
}

/**
 * Convert a prompt from the ChatML objects to the format used by Google MakerSuite models.
 * @param {object[]} messages Array of messages
 * @param {string} model Model name
 * @param {boolean} useSysPrompt Use system prompt
 * @param {string} charName Character name
 * @param {string} userName User name
 * @returns {{contents: *[], system_instruction: {parts: {text: string}}}} Prompt for Google MakerSuite models
 */
export function convertGooglePrompt(messages, model, useSysPrompt = false, charName = '', userName = '') {
    // This is a 1x1 transparent PNG
    const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const visionSupportedModels = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash-002',
        'gemini-1.5-flash-exp-0827',
        'gemini-1.5-flash-8b',
        'gemini-1.5-flash-8b-exp-0827',
        'gemini-1.5-flash-8b-exp-0924',
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro-001',
        'gemini-1.5-pro-002',
        'gemini-1.5-pro-exp-0801',
        'gemini-1.5-pro-exp-0827',
        'gemini-1.0-pro-vision-latest',
        'gemini-pro-vision',
    ];

    const dummyRequiredModels = [
        'gemini-1.0-pro-vision-latest',
        'gemini-pro-vision',
    ];

    const isMultimodal = visionSupportedModels.includes(model);
    let hasImage = false;

    let sys_prompt = '';
    if (useSysPrompt) {
        while (messages.length > 1 && messages[0].role === 'system') {
            // Append example names if not already done by the frontend (e.g. for group chats).
            if (userName && messages[0].name === 'example_user') {
                if (!messages[0].content.startsWith(`${userName}: `)) {
                    messages[0].content = `${userName}: ${messages[0].content}`;
                }
            }
            if (charName && messages[0].name === 'example_assistant') {
                if (!messages[0].content.startsWith(`${charName}: `)) {
                    messages[0].content = `${charName}: ${messages[0].content}`;
                }
            }
            sys_prompt += `${messages[0].content}\n\n`;
            messages.shift();
        }
    }

    const system_instruction = { parts: { text: sys_prompt.trim() } };

    const contents = [];
    messages.forEach((message, index) => {
        // fix the roles
        if (message.role === 'system') {
            message.role = 'user';
        } else if (message.role === 'assistant') {
            message.role = 'model';
        }

        // similar story as claude
        if (message.name) {
            if (userName && message.name === 'example_user') {
                message.name = userName;
            }
            if (charName && message.name === 'example_assistant') {
                message.name = charName;
            }

            if (Array.isArray(message.content)) {
                if (!message.content[0].text.startsWith(`${message.name}: `)) {
                    message.content[0].text = `${message.name}: ${message.content[0].text}`;
                }
            } else {
                if (!message.content.startsWith(`${message.name}: `)) {
                    message.content = `${message.name}: ${message.content}`;
                }
            }

            delete message.name;
        }

        //create the prompt parts
        const parts = [];
        if (typeof message.content === 'string') {
            parts.push({ text: message.content });
        } else if (Array.isArray(message.content)) {
            message.content.forEach((part) => {
                if (part.type === 'text') {
                    parts.push({ text: part.text });
                } else if (part.type === 'image_url' && isMultimodal) {
                    const mimeType = part.image_url.url.split(';')[0].split(':')[1];
                    const base64Data = part.image_url.url.split(',')[1];
                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data,
                        },
                    });
                    hasImage = true;
                }
            });
        }

        // merge consecutive messages with the same role
        if (index > 0 && message.role === contents[contents.length - 1].role) {
            contents[contents.length - 1].parts[0].text += '\n\n' + parts[0].text;
        } else {
            contents.push({
                role: message.role,
                parts: parts,
            });
        }
    });

    // pro 1.5 doesn't require a dummy image to be attached, other vision models do
    if (isMultimodal && dummyRequiredModels.includes(model) && !hasImage) {
        contents[0].parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: PNG_PIXEL,
            },
        });
    }

    return { contents: contents, system_instruction: system_instruction };
}

/**
 * Convert AI21 prompt. Classic: system message squash, user/assistant message merge.
 * @param {object[]} messages Array of messages
 * @param {string} charName Character name
 * @param {string} userName User name
 */
export function convertAI21Messages(messages, charName = '', userName = '') {
    if (!Array.isArray(messages)) {
        return [];
    }

    // Collect all the system messages up until the first instance of a non-system message, and then remove them from the messages array.
    let i = 0, systemPrompt = '';

    for (i = 0; i < messages.length; i++) {
        if (messages[i].role !== 'system') {
            break;
        }
        // Append example names if not already done by the frontend (e.g. for group chats).
        if (userName && messages[i].name === 'example_user') {
            if (!messages[i].content.startsWith(`${userName}: `)) {
                messages[i].content = `${userName}: ${messages[i].content}`;
            }
        }
        if (charName && messages[i].name === 'example_assistant') {
            if (!messages[i].content.startsWith(`${charName}: `)) {
                messages[i].content = `${charName}: ${messages[i].content}`;
            }
        }
        systemPrompt += `${messages[i].content}\n\n`;
    }

    messages.splice(0, i);

    // Prevent erroring out if the messages array is empty.
    if (messages.length === 0) {
        messages.unshift({
            role: 'user',
            content: PROMPT_PLACEHOLDER,
        });
    }

    if (systemPrompt) {
        messages.unshift({
            role: 'system',
            content: systemPrompt.trim(),
        });
    }

    // Doesn't support completion names, so prepend if not already done by the frontend (e.g. for group chats).
    messages.forEach(msg => {
        if ('name' in msg) {
            if (msg.role !== 'system' && !msg.content.startsWith(`${msg.name}: `)) {
                msg.content = `${msg.name}: ${msg.content}`;
            }
            delete msg.name;
        }
    });

    // Since the messaging endpoint only supports alternating turns, we have to merge messages with the same role if they follow each other
    let mergedMessages = [];
    messages.forEach((message) => {
        if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === message.role) {
            mergedMessages[mergedMessages.length - 1].content += '\n\n' + message.content;
        } else {
            mergedMessages.push(message);
        }
    });

    return mergedMessages;
}

/**
 * Convert a prompt from the ChatML objects to the format used by MistralAI.
 * @param {object[]} messages Array of messages
 * @param {string} charName Character name
 * @param {string} userName User name
 */
export function convertMistralMessages(messages, charName = '', userName = '') {
    if (!Array.isArray(messages)) {
        return [];
    }

    // Make the last assistant message a prefill
    const prefixEnabled = getConfigValue('mistral.enablePrefix', false);
    const lastMsg = messages[messages.length - 1];
    if (prefixEnabled && messages.length > 0 && lastMsg?.role === 'assistant') {
        lastMsg.prefix = true;
    }

    const sanitizeToolId = (id) => crypto.createHash('sha512').update(id).digest('hex').slice(0, 9);

    // Doesn't support completion names, so prepend if not already done by the frontend (e.g. for group chats).
    messages.forEach(msg => {
        if ('tool_calls' in msg && Array.isArray(msg.tool_calls)) {
            msg.tool_calls.forEach(tool => {
                tool.id = sanitizeToolId(tool.id);
            });
        }
        if ('tool_call_id' in msg && msg.role === 'tool') {
            msg.tool_call_id = sanitizeToolId(msg.tool_call_id);
        }
        if (msg.role === 'system' && msg.name === 'example_assistant') {
            if (charName && !msg.content.startsWith(`${charName}: `)) {
                msg.content = `${charName}: ${msg.content}`;
            }
            delete msg.name;
        }

        if (msg.role === 'system' && msg.name === 'example_user') {
            if (userName && !msg.content.startsWith(`${userName}: `)) {
                msg.content = `${userName}: ${msg.content}`;
            }
            delete msg.name;
        }

        if (msg.name && msg.role !== 'system' && !msg.content.startsWith(`${msg.name}: `)) {
            msg.content = `${msg.name}: ${msg.content}`;
            delete msg.name;
        }
    });

    // If user role message immediately follows a tool message, append it to the last user message
    const fixToolMessages = () => {
        let rerun = true;
        while (rerun) {
            rerun = false;
            messages.forEach((message, i) => {
                if (i === messages.length - 1) {
                    return;
                }
                if (message.role === 'tool' && messages[i + 1].role === 'user') {
                    const lastUserMessage = messages.slice(0, i).findLastIndex(m => m.role === 'user' && m.content);
                    if (lastUserMessage !== -1) {
                        messages[lastUserMessage].content += '\n\n' + messages[i + 1].content;
                        messages.splice(i + 1, 1);
                        rerun = true;
                    }
                }
            });
        }
    };
    fixToolMessages();

    // If system role message immediately follows an assistant message, change its role to user
    for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].role === 'assistant' && messages[i + 1].role === 'system') {
            messages[i + 1].role = 'user';
        }
    }

    return messages;
}

/**
 * Merge messages with the same consecutive role, removing names if they exist.
 * @param {any[]} messages Messages to merge
 * @param {string} charName Character name
 * @param {string} userName User name
 * @param {boolean} strict Enable strict mode: only allow one system message at the start, force user first message
 * @returns {any[]} Merged messages
 */
export function mergeMessages(messages, charName, userName, strict) {
    let mergedMessages = [];

    // Remove names from the messages
    messages.forEach((message) => {
        if (!message.content) {
            message.content = '';
        }
        if (message.role === 'system' && message.name === 'example_assistant') {
            if (charName && !message.content.startsWith(`${charName}: `)) {
                message.content = `${charName}: ${message.content}`;
            }
        }
        if (message.role === 'system' && message.name === 'example_user') {
            if (userName && !message.content.startsWith(`${userName}: `)) {
                message.content = `${userName}: ${message.content}`;
            }
        }
        if (message.name && message.role !== 'system') {
            if (!message.content.startsWith(`${message.name}: `)) {
                message.content = `${message.name}: ${message.content}`;
            }
        }
        if (message.role === 'tool') {
            message.role = 'user';
        }
        delete message.name;
        delete message.tool_calls;
        delete message.tool_call_id;
    });

    // Squash consecutive messages with the same role
    messages.forEach((message) => {
        if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === message.role && message.content) {
            mergedMessages[mergedMessages.length - 1].content += '\n\n' + message.content;
        } else {
            mergedMessages.push(message);
        }
    });

    // Prevent erroring out if the messages array is empty.
    if (messages.length === 0) {
        messages.unshift({
            role: 'user',
            content: PROMPT_PLACEHOLDER,
        });
    }

    if (strict) {
        for (let i = 0; i < mergedMessages.length; i++) {
            // Force mid-prompt system messages to be user messages
            if (i > 0 && mergedMessages[i].role === 'system') {
                mergedMessages[i].role = 'user';
            }
        }
        if (mergedMessages.length) {
            if (mergedMessages[0].role === 'system' && (mergedMessages.length === 1 || mergedMessages[1].role !== 'user')) {
                mergedMessages.splice(1, 0, { role: 'user', content: PROMPT_PLACEHOLDER });
            }
            else if (mergedMessages[0].role !== 'system' && mergedMessages[0].role !== 'user') {
                mergedMessages.unshift({ role: 'user', content: PROMPT_PLACEHOLDER });
            }
        }
        return mergeMessages(mergedMessages, charName, userName, false);
    }

    return mergedMessages;
}

/**
 * Convert a prompt from the ChatML objects to the format used by Text Completion API.
 * @param {object[]} messages Array of messages
 * @returns {string} Prompt for Text Completion API
 */
export function convertTextCompletionPrompt(messages) {
    if (typeof messages === 'string') {
        return messages;
    }

    const messageStrings = [];
    messages.forEach(m => {
        if (m.role === 'system' && m.name === undefined) {
            messageStrings.push('System: ' + m.content);
        }
        else if (m.role === 'system' && m.name !== undefined) {
            messageStrings.push(m.name + ': ' + m.content);
        }
        else {
            messageStrings.push(m.role + ': ' + m.content);
        }
    });
    return messageStrings.join('\n') + '\nassistant:';
}
