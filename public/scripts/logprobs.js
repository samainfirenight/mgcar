import {
    animation_duration,
    callPopup,
    chat,
    cleanUpMessage,
    event_types,
    eventSource,
    Generate,
    getGeneratingApi,
    is_send_press,
    isStreamingEnabled,
} from '../script.js';
import { debounce, delay, getStringHash } from './utils.js';
import { decodeTextTokens, getTokenizerBestMatch } from './tokenizers.js';
import { power_user } from './power-user.js';

const TINTS = 4;
const MAX_MESSAGE_LOGPROBS = 100;

/**
 * Tuple of a candidate token and its logarithm of probability of being chosen
 * @typedef {[string, number]} Candidate - (token, logprob)
 */

/**
 * Logprob data for a single message
 * @typedef {Object} MessageLogprobData
 * @property {number} created - timestamp of when the message was generated
 * @property {number} hash - hash of the message object
 * @property {number} messageId - ID of the source message
 * @property {number} swipeId - ID of the source swipe on the source message
 * @property {string} api - API used to generate the message
 * @property {TokenLogprobs[]} messageLogprobs Logprob data for each token, by
 * its index in the message
 * @property {string | null} continueFrom - the 'continue' prefix used to
 * generate the message, if any
 */

/**
 * Logprob data for a single token
 * @typedef {Object} TokenLogprobs
 * @property {string} token - A token generated by the model
 * @property {Candidate[]} topLogprobs - Array of top candidate tokens
 */

let state = {
    /** @type {TokenLogprobs | null} */
    selectedTokenLogprobs: null,
    /** @type {Map<number, MessageLogprobData>} */
    messageLogprobs: new Map(),
};

/**
 * renderAlternativeTokensView renders the Token Probabilities UI and all
 * subviews with the active message's logprobs data. If the message has no token
 * logprobs, a zero-state is rendered.
 */
function renderAlternativeTokensView() {
    const view = $('#logprobs_generation_output');
    if (!view.is(':visible')) {
        return;
    }
    view.empty();
    state.selectedTokenLogprobs = null;
    renderTopLogprobs();

    const { messageLogprobs, continueFrom } = getActiveMessageLogprobData() || {};
    const usingSmoothStreaming = isStreamingEnabled() && power_user.smooth_streaming;
    if (!messageLogprobs?.length || usingSmoothStreaming) {
        const emptyState = $('<div></div>');
        const noTokensMsg = usingSmoothStreaming
            ? 'Token probabilities are not available when using Smooth Streaming.'
            : 'No token probabilities available for the current message.';
        const msg = power_user.request_token_probabilities
            ? noTokensMsg
            : '<span>Enable <b>Request token probabilities</b> in the User Settings menu to use this feature.</span>';
        emptyState.html(msg);
        emptyState.addClass('logprobs_empty_state');
        view.append(emptyState);
        return;
    }

    const prefix = continueFrom || '';
    const tokenSpans = [];

    if (prefix) {
        const prefixSpan = $('<span></span>');
        prefixSpan.text(prefix);
        prefixSpan.html(prefixSpan.html().replace(/\n/g, '<br>'));
        prefixSpan.addClass('logprobs_output_prefix');
        prefixSpan.attr('title', 'Select to reroll the last \'Continue\' generation.\nHold the CTRL key when clicking to reroll from before that word.');
        prefixSpan.click(onPrefixClicked);
        addKeyboardProps(prefixSpan);
        tokenSpans.push(...withVirtualWhitespace(prefix, prefixSpan));
    }

    messageLogprobs.forEach((tokenData, i) => {
        const { token } = tokenData;
        const span = $('<span></span>');
        const text = toVisibleWhitespace(token);
        span.text(text);
        span.addClass('logprobs_output_token');
        span.addClass('logprobs_tint_' + (i % TINTS));
        span.click(() => onSelectedTokenChanged(tokenData, span));
        addKeyboardProps(span);
        tokenSpans.push(...withVirtualWhitespace(token, span));
    });

    view.append(tokenSpans);

    // scroll past long prior context
    if (prefix) {
        const element = view.find('.logprobs_output_token').first();
        const scrollOffset = element.offset().top - element.parent().offset().top;
        element.parent().scrollTop(scrollOffset);
    }
}

function addKeyboardProps(element) {
    element.attr('role', 'button');
    element.attr('tabindex', '0');
    element.keydown(function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            element.click();
        }
    });
}

/**
 * renderTopLogprobs renders the top logprobs subview with the currently
 * selected token highlighted. If no token is selected, the subview is hidden.
 */
function renderTopLogprobs() {
    $('#logprobs_top_logprobs_hint').hide();
    const view = $('.logprobs_candidate_list');
    view.empty();

    if (!state.selectedTokenLogprobs) {
        return;
    }

    const { token: selectedToken, topLogprobs } = state.selectedTokenLogprobs;

    let sum = 0;
    const nodes = [];
    const candidates = topLogprobs
        .sort(([, logA], [, logB]) => logB - logA)
        .map(([text, log]) => {
            if (log <= 0) {
                const probability = Math.exp(log);
                sum += probability;
                return [text, probability, log];
            }
            else {
                return [text, log, null];
            }
        });
    candidates.push(['<others>', 1 - sum, 0]);

    let matched = false;
    for (const [token, probability, log] of candidates) {
        const container = $('<button class="flex-container flexFlowColumn logprobs_top_candidate"></button>');
        const tokenNormalized = String(token).replace(/^[▁Ġ]/g, ' ');

        if (token === selectedToken || tokenNormalized === selectedToken) {
            matched = true;
            container.addClass('selected');
        }

        const tokenText = $('<span></span>').text(`${toVisibleWhitespace(token)}`);
        const percentText = $('<span></span>').text(`${(probability * 100).toFixed(2)}%`);
        container.append(tokenText, percentText);
        if (log) {
            container.attr('title', `logarithm: ${log}`);
        }
        addKeyboardProps(container);
        if (token !== '<others>') {
            container.click(() => onAlternativeClicked(state.selectedTokenLogprobs, token));
        } else {
            container.prop('disabled', true);
        }
        nodes.push(container);
    }

    // Highlight the <others> node if the selected token was not included in the
    // top logprobs
    if (!matched) {
        nodes[nodes.length - 1].css('background-color', 'rgba(255, 0, 0, 0.1)');
    }

    view.append(nodes);
}

/**
 * onSelectedTokenChanged is called when the user clicks on a token in the
 * token output view. It updates the selected token state and re-renders the
 * top logprobs view, or deselects the token if it was already selected.
 * @param {TokenLogprobs} logprobs - logprob data for the selected token
 * @param {Element} span - target span node that was clicked
 */
function onSelectedTokenChanged(logprobs, span) {
    $('.logprobs_output_token.selected').removeClass('selected');
    if (state.selectedTokenLogprobs === logprobs) {
        state.selectedTokenLogprobs = null;
    } else {
        state.selectedTokenLogprobs = logprobs;
        $(span).addClass('selected');
    }
    renderTopLogprobs();
}

/**
 * onAlternativeClicked is called when the user clicks on an alternative token
 * in the top logprobs view. It will create a new swipe message and prefill it
 * with all text up to the selected token, followed by the chosen alternative.
 * Then it requests a `continue` completion from the model with the new prompt.
 * @param {TokenLogprobs} tokenLogprobs - logprob data for selected alternative
 * @param {string} alternative - selected alternative token's text
 */
function onAlternativeClicked(tokenLogprobs, alternative) {
    if (!checkGenerateReady()) {
        return;
    }

    if (getGeneratingApi() === 'openai') {
        return callPopup('<h3>Feature unavailable</h3><p>Due to API limitations, rerolling a token is not supported with OpenAI. Try switching to a different API.</p>', 'text');
    }

    const { messageLogprobs, continueFrom } = getActiveMessageLogprobData();
    const replaceIndex = messageLogprobs.findIndex(x => x === tokenLogprobs);

    const tokens = messageLogprobs.slice(0, replaceIndex + 1).map(({ token }) => token);
    tokens[replaceIndex] = String(alternative).replace(/^[▁Ġ]/g, ' ').replace(/Ċ/g, '\n');

    const prefix = continueFrom || '';
    const prompt = prefix + tokens.join('');
    const messageId = chat.length - 1;
    createSwipe(messageId, prompt);

    $('.swipe_right:last').click(); // :see_no_evil:

    Generate('continue').then(_ => void _);
}

/**
 * getTextBeforeClickedWord retrieves the portion of text within a span
 * that appears before the word clicked by the user. Using the x and y
 * coordinates from a PointerEvent, this function identifies the exact
 * word clicked and returns the text preceding it within the span.
 *
 * If the clicked position does not resolve to a valid word or text node, 
 * the entire span text is returned as a fallback.
 *
 * @param {PointerEvent} event - The click event containing the x and y coordinates.
 * @param {string} spanText - The full text content of the span element.
 * @returns {string} The text before the clicked word, or the entire span text as fallback.
 */
function getTextBeforeClickedWord(event, spanText) {
    const x = event.clientX;
    const y = event.clientY;
    const range = document.caretRangeFromPoint(x, y);

    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer;
        const offset = range.startOffset;

        // Get the full text content of the text node
        const text = textNode.nodeValue;

        // Find the boundaries of the clicked word
        const start = text.lastIndexOf(" ", offset - 1) + 1;

        // Return the text before the clicked word
        return text.slice(0, start);
    }

    // If we can't determine the exact word, return the full span text as a fallback
    return spanText;
}


/**
 * onPrefixClicked is called when the user clicks on the carried-over prefix
 * in the token output view. It allows them to reroll the last 'continue'
 * completion with none of the output generated from it, in case they don't
 * like the results.
 *
 * If the user holds the Ctrl key while clicking, only the portion of text
 * before the clicked word is retained as the prefix for rerolling
 */
function onPrefixClicked() {
    if (!checkGenerateReady()) {
        return;
    }

    const { continueFrom } = getActiveMessageLogprobData();
    const messageId = chat.length - 1;

    // Check if Ctrl key is pressed during the click
    let prefix = continueFrom || '';
    if (event.ctrlKey) {
        // Ctrl is pressed - use the text before the clicked word
        prefix = getTextBeforeClickedWord(event, continueFrom);
    }

    // Use the determined `prefix`
    createSwipe(messageId, prefix);
    $('.swipe_right:last').click();
    Generate('continue').then(_ => void _);
}

function checkGenerateReady() {
    if (is_send_press) {
        toastr.warning('Please wait for the current generation to complete.');
        return false;
    }
    return true;
}


/**
 * onToggleLogprobsPanel is called when the user performs an action that toggles
 * the logprobs view, such as clicking the Token Probabilities menu item or the
 * close button.
 */
function onToggleLogprobsPanel() {
    const logprobsViewer = $('#logprobsViewer');

    // largely copied from CFGScale toggle
    if (logprobsViewer.css('display') === 'none') {
        logprobsViewer.addClass('resizing');
        logprobsViewer.css('display', 'flex');
        logprobsViewer.css('opacity', 0.0);
        renderAlternativeTokensView();
        logprobsViewer.transition({
            opacity: 1.0,
            duration: animation_duration,
        }, async function () {
            await delay(50);
            logprobsViewer.removeClass('resizing');
        });
    } else {
        logprobsViewer.addClass('resizing');
        logprobsViewer.transition({
            opacity: 0.0,
            duration: animation_duration,
        },
        async function () {
            await delay(50);
            logprobsViewer.removeClass('resizing');
        });
        setTimeout(function () {
            logprobsViewer.hide();
        }, animation_duration);
    }
}

/**
 * createSwipe appends a new swipe to the target chat message with the given
 * text.
 * @param {number} messageId - target chat message ID
 * @param {string} prompt - initial prompt text which will be continued
 */
function createSwipe(messageId, prompt) {
    // need to call `cleanUpMessage` on our new prompt, because we were working
    // with raw model output and our new prompt is missing trimming/macro replacements
    const cleanedPrompt = cleanUpMessage(prompt, false, false);

    const msg = chat[messageId];
    const newSwipeInfo = {
        send_date: msg.send_date,
        gen_started: msg.gen_started,
        gen_finished: msg.gen_finished,
        extra: { ...structuredClone(msg.extra), from_logprobs: new Date().getTime() },
    };

    msg.swipes = msg.swipes || [];
    msg.swipe_info = msg.swipe_info || [];

    // Add our new swipe, then make sure the active swipe is the one just before
    // it. The call to `swipe_right` will switch to it immediately.
    msg.swipes.push(cleanedPrompt);
    msg.swipe_info.push(newSwipeInfo);
    msg.swipe_id = Math.max(0, msg.swipes.length - 2);
}

/**
 * toVisibleWhitespace receives input text and replaces spaces with &middot; and
 * newlines with ↵.
 * @param {string} input
 * @returns {string}
 */
function toVisibleWhitespace(input) {
    return input.replace(/ /g, '·').replace(/[▁Ġ]/g, '·').replace(/[Ċ\n]/g, '↵');
}

/**
 * withVirtualWhitespace inserts line breaks and a zero-width space before and
 * after the span node if its token begins or ends with whitespace in order to
 * allow text to wrap despite whitespace characters being replaced with a dot.
 * @param {string} text - token text being evaluated for whitespace
 * @param {Element} span - target span node to be wrapped
 * @returns {Element[]} array of nodes to be appended to the DOM
 */
function withVirtualWhitespace(text, span) {
    const result = [span];
    if (text.match(/^\s/)) {
        result.unshift(document.createTextNode('\u200b'));
    }
    if (text.match(/\s$/)) {
        result.push($(document.createTextNode('\u200b')));
    }
    if (text.match(/^[▁Ġ]/)) {
        result.unshift(document.createTextNode('\u200b'));
    }
    // line breaks are trickier. we don't currently handle consecutive line
    // breaks or line breaks occuring in between non-whitespace characters, but
    // tokenizers generally don't produce those anyway.

    // matches leading line break, at least one character, and trailing line break
    if (text.match(/^\n(?:.|\n)+\n$/)) {
        result.unshift($('<br>'));
        result.push($('<br>'));
    } else if (text.match(/^\n/)) {
        result.unshift($('<br>'));
    } else if (text.match(/\n$/)) {
        result.push($('<br>'));
    }
    return result;
}

/**
 * saveLogprobsForActiveMessage receives an array of TokenLogprobs objects
 * representing the top logprobs for each token in a message and associates it
 * with the active message.
 *
 * **Ensure the active message has been updated and rendered before calling
 * this function or the logprobs data will be saved to the wrong message.**
 * @param {TokenLogprobs[]} logprobs - array of logprobs data for each token
 * @param {string | null} continueFrom  - for 'continue' generations, the prompt
 */
export function saveLogprobsForActiveMessage(logprobs, continueFrom) {
    if (!logprobs) {
        // non-streaming APIs could return null data
        return;
    }

    convertTokenIdLogprobsToText(logprobs);

    const msgId = chat.length - 1;
    /** @type {MessageLogprobData} */
    const data = {
        created: new Date().getTime(),
        api: getGeneratingApi(),
        messageId: msgId,
        swipeId: chat[msgId].swipe_id,
        messageLogprobs: logprobs,
        continueFrom,
        hash: getMessageHash(chat[msgId]),
    };

    state.messageLogprobs.set(data.hash, data);

    // Clean up old logprobs data
    const oldLogprobs = Array.from(state.messageLogprobs.values())
        .sort((a, b) => b.created - a.created)
        .slice(MAX_MESSAGE_LOGPROBS);
    for (const oldData of oldLogprobs) {
        state.messageLogprobs.delete(oldData.hash);
    }
}

function getMessageHash(message) {
    // We don't use the swipe ID as a hash component because it's not stable,
    // deleting a swipe will change the ID of all subsequent swipes.
    const hashParams = {
        name: message.name,
        mid: chat.indexOf(message),
        text: message.mes,
    };
    return getStringHash(JSON.stringify(hashParams));
}

/**
 * getActiveMessageLogprobData returns the logprobs data for the active chat
 * message.
 * @returns {MessageLogprobData || null}
 */
function getActiveMessageLogprobData() {
    const hash = getMessageHash(chat[chat.length - 1]);
    return state.messageLogprobs.get(hash) || null;
}

/**
 * convertLogprobTokenIdsToText mutates the given logprobs data's topLogprobs
 * field keyed by token text instead of token ID. This is only necessary for
 * APIs which only return token IDs in their logprobs data; for others this
 * function is a no-op.
 * @param {TokenLogprobs[]} input - logprobs data with numeric token IDs
 */
function convertTokenIdLogprobsToText(input) {
    const api = getGeneratingApi();
    if (api !== 'novel') {
        return input;
    }

    const tokenizerId = getTokenizerBestMatch(api);

    // Flatten unique token IDs across all logprobs
    const tokenIds = Array.from(new Set(input.flatMap(logprobs =>
        logprobs.topLogprobs.map(([token]) => token).concat(logprobs.token),
    )));

    // Submit token IDs to tokenizer to get token text, then build ID->text map
    const { chunks } = decodeTextTokens(tokenizerId, tokenIds);
    const tokenIdText = new Map(tokenIds.map((id, i) => [id, chunks[i]]));

    // Fixup logprobs data with token text
    input.forEach(logprobs => {
        logprobs.token = tokenIdText.get(logprobs.token);
        logprobs.topLogprobs = logprobs.topLogprobs.map(([token, logprob]) =>
            [tokenIdText.get(token), logprob],
        );
    });
}

export function initLogprobs() {
    const debouncedRender = debounce(renderAlternativeTokensView);
    $('#logprobsViewerClose').click(onToggleLogprobsPanel);
    $('#option_toggle_logprobs').click(onToggleLogprobsPanel);
    eventSource.on(event_types.CHAT_CHANGED, debouncedRender);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, debouncedRender);
    eventSource.on(event_types.IMPERSONATE_READY, debouncedRender);
    eventSource.on(event_types.MESSAGE_DELETED, debouncedRender);
    eventSource.on(event_types.MESSAGE_EDITED, debouncedRender);
    eventSource.on(event_types.MESSAGE_SWIPED, debouncedRender);
}
