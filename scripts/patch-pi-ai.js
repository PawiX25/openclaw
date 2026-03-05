import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const piAiPath = path.join(__dirname, '../node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js');
let piAiContent = fs.readFileSync(piAiPath, 'utf8');

if (!piAiContent.includes('// PATCHED: Support authHeader: false')) {
    const startMarker = 'function createClient(model, context, apiKey, optionsHeaders) {';
    const endMarker = '});\n    }';

    const startIdx = piAiContent.indexOf(startMarker);
    if (startIdx === -1) {
        console.log('ERROR: Could not find createClient function');
        process.exit(1);
    }

    const searchStart = startIdx + startMarker.length;
    let braceCount = 1;
    let endIdx = searchStart;
    for (let i = searchStart; i < piAiContent.length; i++) {
        if (piAiContent[i] === '{') braceCount++;
        else if (piAiContent[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIdx = i + 1;
                break;
            }
        }
    }

    const patchedCreateClient = `function createClient(model, context, apiKey, optionsHeaders) {
    const noAuth = model.headers?.Authorization === "";
    if (!apiKey && !noAuth) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it as an argument.");
        }
        apiKey = process.env.OPENAI_API_KEY;
    }
    if (noAuth && !apiKey) {
        apiKey = "no-auth-required";
    }
    const headers = { ...model.headers };
    if (noAuth && model.baseUrl && model.baseUrl.includes("opencode.ai")) {
        const rid = "msg_" + Math.random().toString(36).slice(2, 14);
        const sid = "ses_" + Math.random().toString(36).slice(2, 14);
        Object.assign(headers, {
            "x-opencode-client": "cli",
            "x-opencode-project": "global",
            "x-opencode-request": rid,
            "x-opencode-session": sid,
        });
    }
    if (model.provider === "github-copilot") {
        const hasImages = hasCopilotVisionInput(context.messages);
        const copilotHeaders = buildCopilotDynamicHeaders({
            messages: context.messages,
            hasImages,
        });
        Object.assign(headers, copilotHeaders);
    }
    if (optionsHeaders) {
        Object.assign(headers, optionsHeaders);
    }
    return new OpenAI({
        apiKey,
        baseURL: model.baseUrl,
        dangerouslyAllowBrowser: true,
        defaultHeaders: headers,
    });
}`;

    piAiContent = piAiContent.slice(0, startIdx) + patchedCreateClient + piAiContent.slice(endIdx);
    fs.writeFileSync(piAiPath, piAiContent, 'utf8');
    console.log('Successfully patched pi-ai for authHeader: false support');
} else {
    console.log('pi-ai already patched');
}


const anthropicPath = path.join(__dirname, '../node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js');
let anthropicContent = fs.readFileSync(anthropicPath, 'utf8');

if (!anthropicContent.includes('// PATCHED: Support authHeader: false for Anthropic')) {
    const anthropicMarker = 'function createClient(model, apiKey, interleavedThinking, optionsHeaders, dynamicHeaders) {';
    const anthropicIdx = anthropicContent.indexOf(anthropicMarker);
    if (anthropicIdx === -1) {
        console.log('WARNING: Could not find Anthropic createClient function');
    } else {
        const anthropicSearchStart = anthropicIdx + anthropicMarker.length;
        let anthropicBraceCount = 1;
        let anthropicEndIdx = anthropicSearchStart;
        for (let i = anthropicSearchStart; i < anthropicContent.length; i++) {
            if (anthropicContent[i] === '{') anthropicBraceCount++;
            else if (anthropicContent[i] === '}') {
                anthropicBraceCount--;
                if (anthropicBraceCount === 0) {
                    anthropicEndIdx = i + 1;
                    break;
                }
            }
        }

        const origBody = anthropicContent.slice(anthropicIdx, anthropicEndIdx);

        const patchedAnthropicFn = `function createClient(model, apiKey, interleavedThinking, optionsHeaders, dynamicHeaders) {
    // PATCHED: Support authHeader: false for Anthropic
    const noAuth = model.headers?.Authorization === "";
    if (noAuth && !apiKey) {
        apiKey = "no-auth-required";
    }
    let effectiveBaseUrl = model.baseUrl;
    if (noAuth && effectiveBaseUrl.endsWith('/v1')) {
        effectiveBaseUrl = effectiveBaseUrl.slice(0, -3);
    }
    if (noAuth && model.baseUrl && model.baseUrl.includes("opencode.ai")) {
        const rid = "msg_" + Math.random().toString(36).slice(2, 14);
        const sid = "ses_" + Math.random().toString(36).slice(2, 14);
        if (!optionsHeaders) optionsHeaders = {};
        Object.assign(optionsHeaders, {
            "x-opencode-client": "cli",
            "x-opencode-project": "global",
            "x-opencode-request": rid,
            "x-opencode-session": sid,
        });
    }
` + origBody.slice(anthropicMarker.length).replaceAll('model.baseUrl', 'effectiveBaseUrl');

        anthropicContent = anthropicContent.slice(0, anthropicIdx) + patchedAnthropicFn + anthropicContent.slice(anthropicEndIdx);
        fs.writeFileSync(anthropicPath, anthropicContent, 'utf8');
        console.log('Successfully patched pi-ai/anthropic.js for authHeader: false');
    }
} else {
    console.log('anthropic.js already patched');
}

const modelRegistryPath = path.join(__dirname, '../node_modules/@mariozechner/pi-coding-agent/dist/core/model-registry.js');
let modelRegistryContent = fs.readFileSync(modelRegistryPath, 'utf8');

if (!modelRegistryContent.includes('// PATCHED: authHeader: false support')) {
    modelRegistryContent = modelRegistryContent.replace(
        'if (!config.apiKey && !config.oauth) {',
        'if (!config.apiKey && !config.oauth && config.authHeader !== false) {\n            } else if (!config.apiKey && !config.oauth) {'
    );

    modelRegistryContent = modelRegistryContent.replace(
        'if (!providerConfig.apiKey) {',
        'if (!providerConfig.apiKey && providerConfig.authHeader !== false) {\n                } else if (!providerConfig.apiKey) {'
    );

    const authHeaderPattern = 'if (providerConfig.authHeader && providerConfig.apiKey) {\n                    const resolvedKey = resolveConfigValue(providerConfig.apiKey);\n                    if (resolvedKey) {\n                        headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };\n                    }\n                }';
    const authHeaderPatch = authHeaderPattern + '\n                if (providerConfig.authHeader === false) {\n                    headers = { ...headers, Authorization: "" };\n                }';
    modelRegistryContent = modelRegistryContent.replace(authHeaderPattern, authHeaderPatch);

    const authHeaderPattern2 = 'if (config.authHeader && config.apiKey) {\n                    const resolvedKey = resolveConfigValue(config.apiKey);\n                    if (resolvedKey) {\n                        headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };\n                    }\n                }';
    const authHeaderPatch2 = authHeaderPattern2 + '\n                if (config.authHeader === false) {\n                    headers = { ...headers, Authorization: "" };\n                }';
    modelRegistryContent = modelRegistryContent.replace(authHeaderPattern2, authHeaderPatch2);

    fs.writeFileSync(modelRegistryPath, modelRegistryContent, 'utf8');
    console.log('Successfully patched pi-coding-agent model-registry');
} else {
    console.log('pi-coding-agent model-registry already patched');
}

console.log('All patches applied successfully');
