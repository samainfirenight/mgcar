import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import fetch from 'node-fetch';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import FormData from 'form-data';

import { getBasicAuthHeader, delay } from '../util.js';
import { jsonParser } from '../express-common.js';
import { readSecret, SECRET_KEYS } from './secrets.js';

/**
 * Gets the comfy workflows.
 * @param {import('../users.js').UserDirectoryList} directories
 * @returns {string[]} List of comfy workflows
 */
function getComfyWorkflows(directories) {
    return fs
        .readdirSync(directories.comfyWorkflows)
        .filter(file => file[0] != '.' && file.toLowerCase().endsWith('.json'))
        .sort(Intl.Collator().compare);
}

export const router = express.Router();

router.post('/ping', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/options';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        return response.sendStatus(200);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/upscalers', jsonParser, async (request, response) => {
    try {
        async function getUpscalerModels() {
            const url = new URL(request.body.url);
            url.pathname = '/sdapi/v1/upscalers';

            const result = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': getBasicAuthHeader(request.body.auth),
                },
            });

            if (!result.ok) {
                throw new Error('SD WebUI returned an error.');
            }

            /** @type {any} */
            const data = await result.json();
            const names = data.map(x => x.name);
            return names;
        }

        async function getLatentUpscalers() {
            const url = new URL(request.body.url);
            url.pathname = '/sdapi/v1/latent-upscale-modes';

            const result = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': getBasicAuthHeader(request.body.auth),
                },
            });

            if (!result.ok) {
                throw new Error('SD WebUI returned an error.');
            }

            /** @type {any} */
            const data = await result.json();
            const names = data.map(x => x.name);
            return names;
        }

        const [upscalers, latentUpscalers] = await Promise.all([getUpscalerModels(), getLatentUpscalers()]);

        // 0 = None, then Latent Upscalers, then Upscalers
        upscalers.splice(1, 0, ...latentUpscalers);

        return response.send(upscalers);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/vaes', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/sd-vae';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        /** @type {any} */
        const data = await result.json();
        const names = data.map(x => x.model_name);
        return response.send(names);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/samplers', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/samplers';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        /** @type {any} */
        const data = await result.json();
        const names = data.map(x => x.name);
        return response.send(names);

    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/schedulers', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/schedulers';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        /** @type {any} */
        const data = await result.json();
        const names = data.map(x => x.name);
        return response.send(names);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/models', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/sd-models';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        /** @type {any} */
        const data = await result.json();
        const models = data.map(x => ({ value: x.title, text: x.title }));
        return response.send(models);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/get-model', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/options';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });
        /** @type {any} */
        const data = await result.json();
        return response.send(data['sd_model_checkpoint']);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/set-model', jsonParser, async (request, response) => {
    try {
        async function getProgress() {
            const url = new URL(request.body.url);
            url.pathname = '/sdapi/v1/progress';

            const result = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': getBasicAuthHeader(request.body.auth),
                },
            });
            const data = await result.json();
            return data;
        }

        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/options';

        const options = {
            sd_model_checkpoint: request.body.model,
        };

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(options),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        const MAX_ATTEMPTS = 10;
        const CHECK_INTERVAL = 2000;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            /** @type {any} */
            const progressState = await getProgress();

            const progress = progressState['progress'];
            const jobCount = progressState['state']['job_count'];
            if (progress == 0.0 && jobCount === 0) {
                break;
            }

            console.log(`Waiting for SD WebUI to finish model loading... Progress: ${progress}; Job count: ${jobCount}`);
            await delay(CHECK_INTERVAL);
        }

        return response.sendStatus(200);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/generate', jsonParser, async (request, response) => {
    try {
        console.log('SD WebUI request:', request.body);

        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/txt2img';

        const controller = new AbortController();
        request.socket.removeAllListeners('close');
        request.socket.on('close', function () {
            if (!response.writableEnded) {
                const url = new URL(request.body.url);
                url.pathname = '/sdapi/v1/interrupt';
                fetch(url, { method: 'POST', headers: { 'Authorization': getBasicAuthHeader(request.body.auth) } });
            }
            controller.abort();
        });

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(request.body),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
            signal: controller.signal,
        });

        if (!result.ok) {
            const text = await result.text();
            throw new Error('SD WebUI returned an error.', { cause: text });
        }

        const data = await result.json();
        return response.send(data);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.post('/sd-next/upscalers', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/upscalers';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getBasicAuthHeader(request.body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        // Vlad doesn't provide Latent Upscalers in the API, so we have to hardcode them here
        const latentUpscalers = ['Latent', 'Latent (antialiased)', 'Latent (bicubic)', 'Latent (bicubic antialiased)', 'Latent (nearest)', 'Latent (nearest-exact)'];

        /** @type {any} */
        const data = await result.json();
        const names = data.map(x => x.name);

        // 0 = None, then Latent Upscalers, then Upscalers
        names.splice(1, 0, ...latentUpscalers);

        return response.send(names);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

const comfy = express.Router();

comfy.post('/ping', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/system_stats';

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        return response.sendStatus(200);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/samplers', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/object_info';

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        /** @type {any} */
        const data = await result.json();
        return response.send(data.KSampler.input.required.sampler_name[0]);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/models', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/object_info';

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }
        /** @type {any} */
        const data = await result.json();
        return response.send(data.CheckpointLoaderSimple.input.required.ckpt_name[0].map(it => ({ value: it, text: it })));
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/schedulers', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/object_info';

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        /** @type {any} */
        const data = await result.json();
        return response.send(data.KSampler.input.required.scheduler[0]);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/vaes', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/object_info';

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        /** @type {any} */
        const data = await result.json();
        return response.send(data.VAELoader.input.required.vae_name[0]);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/workflows', jsonParser, async (request, response) => {
    try {
        const data = getComfyWorkflows(request.user.directories);
        return response.send(data);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/workflow', jsonParser, async (request, response) => {
    try {
        let filePath = path.join(request.user.directories.comfyWorkflows, sanitize(String(request.body.file_name)));
        if (!fs.existsSync(filePath)) {
            filePath = path.join(request.user.directories.comfyWorkflows, 'Default_Comfy_Workflow.json');
        }
        const data = fs.readFileSync(filePath, { encoding: 'utf-8' });
        return response.send(JSON.stringify(data));
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/save-workflow', jsonParser, async (request, response) => {
    try {
        const filePath = path.join(request.user.directories.comfyWorkflows, sanitize(String(request.body.file_name)));
        writeFileAtomicSync(filePath, request.body.workflow, 'utf8');
        const data = getComfyWorkflows(request.user.directories);
        return response.send(data);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/delete-workflow', jsonParser, async (request, response) => {
    try {
        const filePath = path.join(request.user.directories.comfyWorkflows, sanitize(String(request.body.file_name)));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return response.sendStatus(200);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

comfy.post('/generate', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/prompt';

        const controller = new AbortController();
        request.socket.removeAllListeners('close');
        request.socket.on('close', function () {
            if (!response.writableEnded && !item) {
                const interruptUrl = new URL(request.body.url);
                interruptUrl.pathname = '/interrupt';
                fetch(interruptUrl, { method: 'POST', headers: { 'Authorization': getBasicAuthHeader(request.body.auth) } });
            }
            controller.abort();
        });

        const promptResult = await fetch(url, {
            method: 'POST',
            body: request.body.prompt,
        });
        if (!promptResult.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        /** @type {any} */
        const data = await promptResult.json();
        const id = data.prompt_id;
        let item;
        const historyUrl = new URL(request.body.url);
        historyUrl.pathname = '/history';
        while (true) {
            const result = await fetch(historyUrl);
            if (!result.ok) {
                throw new Error('ComfyUI returned an error.');
            }
            /** @type {any} */
            const history = await result.json();
            item = history[id];
            if (item) {
                break;
            }
            await delay(100);
        }
        if (item.status.status_str === 'error') {
            throw new Error('ComfyUI generation did not succeed.');
        }
        const imgInfo = Object.keys(item.outputs).map(it => item.outputs[it].images).flat()[0];
        const imgUrl = new URL(request.body.url);
        imgUrl.pathname = '/view';
        imgUrl.search = `?filename=${imgInfo.filename}&subfolder=${imgInfo.subfolder}&type=${imgInfo.type}`;
        const imgResponse = await fetch(imgUrl);
        if (!imgResponse.ok) {
            throw new Error('ComfyUI returned an error.');
        }
        const imgBuffer = await imgResponse.buffer();
        return response.send(imgBuffer.toString('base64'));
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

const together = express.Router();

together.post('/models', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.TOGETHERAI);

        if (!key) {
            console.log('TogetherAI key not found.');
            return response.sendStatus(400);
        }

        const modelsResponse = await fetch('https://api.together.xyz/api/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${key}`,
            },
        });

        if (!modelsResponse.ok) {
            console.log('TogetherAI returned an error.');
            return response.sendStatus(500);
        }

        const data = await modelsResponse.json();

        if (!Array.isArray(data)) {
            console.log('TogetherAI returned invalid data.');
            return response.sendStatus(500);
        }

        const models = data
            .filter(x => x.display_type === 'image')
            .map(x => ({ value: x.name, text: x.display_name }));

        return response.send(models);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

together.post('/generate', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.TOGETHERAI);

        if (!key) {
            console.log('TogetherAI key not found.');
            return response.sendStatus(400);
        }

        console.log('TogetherAI request:', request.body);

        const result = await fetch('https://api.together.xyz/v1/images/generations', {
            method: 'POST',
            body: JSON.stringify({
                prompt: request.body.prompt,
                negative_prompt: request.body.negative_prompt,
                height: request.body.height,
                width: request.body.width,
                model: request.body.model,
                steps: request.body.steps,
                n: 1,
                // Limited to 10000 on playground, works fine with more.
                seed: request.body.seed >= 0 ? request.body.seed : Math.floor(Math.random() * 10_000_000),
            }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            console.log('TogetherAI returned an error.', { body: await result.text() });
            return response.sendStatus(500);
        }

        /** @type {any} */
        const data = await result.json();
        console.log('TogetherAI response:', data);

        const choice = data?.data?.[0];
        let b64_json = choice.b64_json;

        if (!b64_json) {
            const buffer = await (await fetch(choice.url)).buffer();
            b64_json = buffer.toString('base64');
        }

        return response.send({ format: 'jpg', data: b64_json });
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

const drawthings = express.Router();

drawthings.post('/ping', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/';

        const result = await fetch(url, {
            method: 'HEAD',
        });

        if (!result.ok) {
            throw new Error('SD DrawThings API returned an error.');
        }

        return response.sendStatus(200);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

drawthings.post('/get-model', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/';

        const result = await fetch(url, {
            method: 'GET',
        });

        /** @type {any} */
        const data = await result.json();

        return response.send(data['model']);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

drawthings.post('/get-upscaler', jsonParser, async (request, response) => {
    try {
        const url = new URL(request.body.url);
        url.pathname = '/';

        const result = await fetch(url, {
            method: 'GET',
        });

        /** @type {any} */
        const data = await result.json();

        return response.send(data['upscaler']);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

drawthings.post('/generate', jsonParser, async (request, response) => {
    try {
        console.log('SD DrawThings API request:', request.body);

        const url = new URL(request.body.url);
        url.pathname = '/sdapi/v1/txt2img';

        const body = { ...request.body };
        const auth = getBasicAuthHeader(request.body.auth);
        delete body.url;
        delete body.auth;

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': auth,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            throw new Error('SD DrawThings API returned an error.', { cause: text });
        }

        const data = await result.json();
        return response.send(data);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

const pollinations = express.Router();

pollinations.post('/models', jsonParser, async (_request, response) => {
    try {
        const modelsUrl = new URL('https://image.pollinations.ai/models');
        const result = await fetch(modelsUrl);

        if (!result.ok) {
            console.log('Pollinations returned an error.', result.status, result.statusText);
            throw new Error('Pollinations request failed.');
        }

        const data = await result.json();

        if (!Array.isArray(data)) {
            console.log('Pollinations returned invalid data.');
            throw new Error('Pollinations request failed.');
        }

        const models = data.map(x => ({ value: x, text: x }));
        return response.send(models);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

pollinations.post('/generate', jsonParser, async (request, response) => {
    try {
        const promptUrl = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(request.body.prompt)}`);
        const params = new URLSearchParams({
            model: String(request.body.model),
            negative_prompt: String(request.body.negative_prompt),
            seed: String(request.body.seed >= 0 ? request.body.seed : Math.floor(Math.random() * 10_000_000)),
            enhance: String(request.body.enhance ?? false),
            width: String(request.body.width ?? 1024),
            height: String(request.body.height ?? 1024),
            nologo: String(true),
            nofeed: String(true),
            referer: 'sillytavern',
        });
        promptUrl.search = params.toString();

        console.log('Pollinations request URL:', promptUrl.toString());

        const result = await fetch(promptUrl);

        if (!result.ok) {
            console.log('Pollinations returned an error.', result.status, result.statusText);
            throw new Error('Pollinations request failed.');
        }

        const buffer = await result.buffer();
        const base64 = buffer.toString('base64');

        return response.send({ image: base64 });
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

const stability = express.Router();

stability.post('/generate', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.STABILITY);

        if (!key) {
            console.log('Stability AI key not found.');
            return response.sendStatus(400);
        }

        const { payload, model } = request.body;

        console.log('Stability AI request:', model, payload);

        const formData = new FormData();
        for (const [key, value] of Object.entries(payload)) {
            if (value !== undefined) {
                formData.append(key, String(value));
            }
        }

        let apiUrl;
        switch (model) {
            case 'stable-image-ultra':
                apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/ultra';
                break;
            case 'stable-image-core':
                apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/core';
                break;
            case 'stable-diffusion-3':
                apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
                break;
            default:
                throw new Error('Invalid Stability AI model selected');
        }

        const result = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Accept': 'image/*',
            },
            body: formData,
        });

        if (!result.ok) {
            const text = await result.text();
            console.log('Stability AI returned an error.', result.status, result.statusText, text);
            return response.sendStatus(500);
        }

        const buffer = await result.buffer();
        return response.send(buffer.toString('base64'));
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

const blockentropy = express.Router();

blockentropy.post('/models', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.BLOCKENTROPY);

        if (!key) {
            console.log('Block Entropy key not found.');
            return response.sendStatus(400);
        }

        const modelsResponse = await fetch('https://api.blockentropy.ai/sdapi/v1/sd-models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${key}`,
            },
        });

        if (!modelsResponse.ok) {
            console.log('Block Entropy returned an error.');
            return response.sendStatus(500);
        }

        const data = await modelsResponse.json();

        if (!Array.isArray(data)) {
            console.log('Block Entropy returned invalid data.');
            return response.sendStatus(500);
        }
        const models = data.map(x => ({ value: x.name, text: x.name }));
        return response.send(models);

    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

blockentropy.post('/generate', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.BLOCKENTROPY);

        if (!key) {
            console.log('Block Entropy key not found.');
            return response.sendStatus(400);
        }

        console.log('Block Entropy request:', request.body);

        const result = await fetch('https://api.blockentropy.ai/sdapi/v1/txt2img', {
            method: 'POST',
            body: JSON.stringify({
                prompt: request.body.prompt,
                negative_prompt: request.body.negative_prompt,
                model: request.body.model,
                steps: request.body.steps,
                width: request.body.width,
                height: request.body.height,
                // Random seed if negative.
                seed: request.body.seed >= 0 ? request.body.seed : Math.floor(Math.random() * 10_000_000),
            }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            console.log('Block Entropy returned an error.');
            return response.sendStatus(500);
        }

        const data = await result.json();
        console.log('Block Entropy response:', data);

        return response.send(data);
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});


const huggingface = express.Router();

huggingface.post('/generate', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.HUGGINGFACE);

        if (!key) {
            console.log('Hugging Face key not found.');
            return response.sendStatus(400);
        }

        console.log('Hugging Face request:', request.body);

        const result = await fetch(`https://api-inference.huggingface.co/models/${request.body.model}`, {
            method: 'POST',
            body: JSON.stringify({
                inputs: request.body.prompt,
            }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            console.log('Hugging Face returned an error.');
            return response.sendStatus(500);
        }

        const buffer = await result.buffer();
        return response.send({
            image: buffer.toString('base64'),
        });
    } catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

const nanogpt = express.Router();

nanogpt.post('/models', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.NANOGPT);

        if (!key) {
            console.log('NanoGPT key not found.');
            return response.sendStatus(400);
        }

        const modelsResponse = await fetch('https://nano-gpt.com/api/models', {
            method: 'GET',
            headers: {
                'x-api-key': key,
                'Content-Type': 'application/json',
            },
        });

        if (!modelsResponse.ok) {
            console.log('NanoGPT returned an error.');
            return response.sendStatus(500);
        }

        /** @type {any} */
        const data = await modelsResponse.json();
        const imageModels = data?.models?.image;

        if (!imageModels || typeof imageModels !== 'object') {
            console.log('NanoGPT returned invalid data.');
            return response.sendStatus(500);
        }

        const models = Object.values(imageModels).map(x => ({ value: x.model, text: x.name }));
        return response.send(models);
    }
    catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

nanogpt.post('/generate', jsonParser, async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.NANOGPT);

        if (!key) {
            console.log('NanoGPT key not found.');
            return response.sendStatus(400);
        }

        console.log('NanoGPT request:', request.body);

        const result = await fetch('https://nano-gpt.com/api/generate-image', {
            method: 'POST',
            body: JSON.stringify(request.body),
            headers: {
                'x-api-key': key,
                'Content-Type': 'application/json',
            },
        });

        if (!result.ok) {
            console.log('NanoGPT returned an error.');
            return response.sendStatus(500);
        }

        /** @type {any} */
        const data = await result.json();

        const image = data?.data?.[0]?.b64_json;
        if (!image) {
            console.log('NanoGPT returned invalid data.');
            return response.sendStatus(500);
        }

        return response.send({ image });
    }
    catch (error) {
        console.log(error);
        return response.sendStatus(500);
    }
});

router.use('/comfy', comfy);
router.use('/together', together);
router.use('/drawthings', drawthings);
router.use('/pollinations', pollinations);
router.use('/stability', stability);
router.use('/blockentropy', blockentropy);
router.use('/huggingface', huggingface);
router.use('/nanogpt', nanogpt);
