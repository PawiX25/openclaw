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
