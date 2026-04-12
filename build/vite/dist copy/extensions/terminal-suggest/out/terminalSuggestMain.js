"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.availableSpecs = void 0;
exports.activate = activate;
exports.resolveCwdFromCurrentCommandString = resolveCwdFromCurrentCommandString;
exports.getCurrentCommandAndArgs = getCurrentCommandAndArgs;
exports.asArray = asArray;
exports.getCompletionItemsFromSpecs = getCompletionItemsFromSpecs;
exports.sanitizeProcessEnvironment = sanitizeProcessEnvironment;
const fs = __importStar(require("fs"));
const path_1 = require("path");
const vscode = __importStar(require("vscode"));
const azd_1 = __importDefault(require("./completions/azd"));
const cd_1 = __importDefault(require("./completions/cd"));
const code_1 = __importDefault(require("./completions/code"));
const code_insiders_1 = __importDefault(require("./completions/code-insiders"));
const code_tunnel_1 = __importDefault(require("./completions/code-tunnel"));
const code_tunnel_insiders_1 = __importDefault(require("./completions/code-tunnel-insiders"));
const copilot_1 = __importDefault(require("./completions/copilot"));
const git_1 = __importDefault(require("./completions/git"));
const gh_1 = __importDefault(require("./completions/gh"));
const npm_1 = __importDefault(require("./completions/npm"));
const npx_1 = __importDefault(require("./completions/npx"));
const pnpm_1 = __importDefault(require("./completions/pnpm"));
const set_location_1 = __importDefault(require("./completions/set-location"));
const yarn_1 = __importDefault(require("./completions/yarn"));
const upstreamSpecs = __importStar(require("./upstreamSpecs"));
const pathExecutableCache_1 = require("./env/pathExecutableCache");
const execute_1 = require("./fig/execute");
const figInterface_1 = require("./fig/figInterface");
const completionItem_1 = require("./helpers/completionItem");
const os_1 = require("./helpers/os");
const promise_1 = require("./helpers/promise");
const uri_1 = require("./helpers/uri");
const bash_1 = require("./shell/bash");
const fish_1 = require("./shell/fish");
const pwsh_1 = require("./shell/pwsh");
const zsh_1 = require("./shell/zsh");
const tokens_1 = require("./tokens");
const isWindows = (0, os_1.osIsWindows)();
const cachedGlobals = new Map();
const inflightRequests = new Map();
let pathExecutableCache;
const CACHE_KEY = 'terminalSuggestGlobalsCacheV2';
let globalStorageUri;
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
function getCacheKey(machineId, remoteAuthority, shellType) {
    return `${machineId}:${remoteAuthority ?? 'local'}:${shellType}`;
}
exports.availableSpecs = [
    azd_1.default,
    cd_1.default,
    code_insiders_1.default,
    code_1.default,
    code_tunnel_1.default,
    code_tunnel_insiders_1.default,
    copilot_1.default,
    git_1.default,
    gh_1.default,
    npm_1.default,
    npx_1.default,
    pnpm_1.default,
    set_location_1.default,
    yarn_1.default,
    ...Object.values(upstreamSpecs)
];
const getShellSpecificGlobals = new Map([
    ["bash" /* TerminalShellType.Bash */, bash_1.getBashGlobals],
    ["zsh" /* TerminalShellType.Zsh */, zsh_1.getZshGlobals],
    ["gitbash" /* TerminalShellType.GitBash */, bash_1.getBashGlobals], // Git Bash is a bash shell
    // TODO: Ghost text in the command line prevents completions from working ATM for fish
    ["fish" /* TerminalShellType.Fish */, fish_1.getFishGlobals],
    ["pwsh" /* TerminalShellType.PowerShell */, pwsh_1.getPwshGlobals],
    ["powershell" /* TerminalShellType.WindowsPowerShell */, pwsh_1.getPwshGlobals],
]);
async function getShellGlobals(shellType, existingCommands, machineId, remoteAuthority) {
    if (!machineId) {
        // fallback: don't cache
        return await fetchAndCacheShellGlobals(shellType, existingCommands, undefined, undefined);
    }
    const cacheKey = getCacheKey(machineId, remoteAuthority, shellType);
    const cached = cachedGlobals.get(cacheKey);
    const now = Date.now();
    const existingCommandsArr = existingCommands ? Array.from(existingCommands) : undefined;
    let shouldRefresh = false;
    if (cached) {
        // Evict if too old
        if (now - cached.timestamp > CACHE_MAX_AGE_MS) {
            cachedGlobals.delete(cacheKey);
            await writeGlobalsCache();
        }
        else {
            if (existingCommandsArr && cached.existingCommands) {
                if (existingCommandsArr.length !== cached.existingCommands.length) {
                    shouldRefresh = true;
                }
            }
            else if (existingCommandsArr || cached.existingCommands) {
                shouldRefresh = true;
            }
            if (!shouldRefresh && cached.commands) {
                // NOTE: This used to trigger a background refresh in order to ensure all commands
                // are up to date, but this ends up launching way too many processes. Especially on
                // Windows where this caused significant performance issues as processes can block
                // the extension host for several seconds
                // (https://github.com/microsoft/vscode/issues/259343).
                return cached.commands;
            }
        }
    }
    // No cache or should refresh
    return await fetchAndCacheShellGlobals(shellType, existingCommands, machineId, remoteAuthority);
}
async function fetchAndCacheShellGlobals(shellType, existingCommands, machineId, remoteAuthority, background) {
    const cacheKey = getCacheKey(machineId ?? 'no-machine-id', remoteAuthority, shellType);
    // Check if there's a cached entry
    const cached = cachedGlobals.get(cacheKey);
    if (cached) {
        return cached.commands;
    }
    // Check if there's already an in-flight request for this cache key
    const existingRequest = inflightRequests.get(cacheKey);
    if (existingRequest) {
        // Wait for the existing request to complete rather than spawning a new process
        return existingRequest;
    }
    // Create a new request and store it in the inflight map
    const requestPromise = (async () => {
        try {
            let execShellType = shellType;
            if (shellType === "gitbash" /* TerminalShellType.GitBash */) {
                execShellType = "bash" /* TerminalShellType.Bash */; // Git Bash is a bash shell
            }
            const options = { encoding: 'utf-8', shell: execShellType, windowsHide: true };
            const mixedCommands = await getShellSpecificGlobals.get(shellType)?.(options, existingCommands);
            const normalizedCommands = mixedCommands?.map(command => typeof command === 'string' ? ({ label: command }) : command);
            if (machineId) {
                const cacheKey = getCacheKey(machineId, remoteAuthority, shellType);
                cachedGlobals.set(cacheKey, {
                    commands: normalizedCommands,
                    existingCommands: existingCommands ? Array.from(existingCommands) : undefined,
                    timestamp: Date.now()
                });
                await writeGlobalsCache();
            }
            return normalizedCommands;
        }
        catch (error) {
            if (!background) {
                console.error('Error fetching builtin commands:', error);
            }
            return;
        }
        finally {
            // Always remove the promise from inflight requests when done
            inflightRequests.delete(cacheKey);
        }
    })();
    // Store the promise in the inflight map
    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
}
async function writeGlobalsCache() {
    if (!globalStorageUri) {
        return;
    }
    // Remove old entries
    const now = Date.now();
    for (const [key, value] of cachedGlobals.entries()) {
        if (now - value.timestamp > CACHE_MAX_AGE_MS) {
            cachedGlobals.delete(key);
        }
    }
    const obj = {};
    for (const [key, value] of cachedGlobals.entries()) {
        obj[key] = value;
    }
    try {
        // Ensure the directory exists
        const terminalSuggestDir = vscode.Uri.joinPath(globalStorageUri, 'terminal-suggest');
        await vscode.workspace.fs.createDirectory(terminalSuggestDir);
        const cacheFile = vscode.Uri.joinPath(terminalSuggestDir, `${CACHE_KEY}.json`);
        const data = Buffer.from(JSON.stringify(obj), 'utf8');
        await vscode.workspace.fs.writeFile(cacheFile, data);
    }
    catch (err) {
        console.error('Failed to write terminal suggest globals cache:', err);
    }
}
async function readGlobalsCache() {
    if (!globalStorageUri) {
        return;
    }
    try {
        const terminalSuggestDir = vscode.Uri.joinPath(globalStorageUri, 'terminal-suggest');
        const cacheFile = vscode.Uri.joinPath(terminalSuggestDir, `${CACHE_KEY}.json`);
        const data = await vscode.workspace.fs.readFile(cacheFile);
        const obj = JSON.parse(data.toString());
        if (obj) {
            for (const key of Object.keys(obj)) {
                cachedGlobals.set(key, obj[key]);
            }
        }
    }
    catch (err) {
        // File might not exist yet, which is expected on first run
        if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
            // This is expected on first run
            return;
        }
        console.error('Failed to read terminal suggest globals cache:', err);
    }
}
async function activate(context) {
    pathExecutableCache = new pathExecutableCache_1.PathExecutableCache();
    context.subscriptions.push(pathExecutableCache);
    let currentTerminalEnv = process.env;
    globalStorageUri = context.globalStorageUri;
    await readGlobalsCache();
    // Get a machineId for this install (persisted per machine, not synced)
    const machineId = await vscode.env.machineId;
    const remoteAuthority = vscode.env.remoteName;
    context.subscriptions.push(vscode.window.registerTerminalCompletionProvider({
        async provideTerminalCompletions(terminal, terminalContext, token) {
            currentTerminalEnv = terminal.shellIntegration?.env?.value ?? process.env;
            if (token.isCancellationRequested) {
                console.debug('#terminalCompletions token cancellation requested');
                return;
            }
            const shellType = Object.hasOwn(terminal.state, 'shell') ? terminal.state.shell : undefined;
            const terminalShellType = getTerminalShellType(shellType);
            if (!terminalShellType) {
                console.debug(`#terminalCompletions Shell type ${shellType} not supported`);
                return;
            }
            const commandsInPath = await pathExecutableCache.getExecutablesInPath(terminal.shellIntegration?.env?.value, terminalShellType);
            const shellGlobals = await getShellGlobals(terminalShellType, commandsInPath?.labels, machineId, remoteAuthority) ?? [];
            if (!commandsInPath?.completionResources) {
                console.debug('#terminalCompletions No commands found in path');
                return;
            }
            // Order is important here, add shell globals first so they are prioritized over path commands
            const commands = [...shellGlobals, ...commandsInPath.completionResources];
            const currentCommandString = getCurrentCommandAndArgs(terminalContext.commandLine, terminalContext.cursorIndex, terminalShellType);
            const pathSeparator = isWindows ? '\\' : '/';
            const tokenType = (0, tokens_1.getTokenType)(terminalContext, terminalShellType);
            const result = await Promise.race([
                getCompletionItemsFromSpecs(exports.availableSpecs, terminalContext, commands, currentCommandString, tokenType, terminal.shellIntegration?.cwd, getEnvAsRecord(currentTerminalEnv), terminal.name, token),
                (0, promise_1.createTimeoutPromise)(5000, undefined)
            ]);
            if (!result) {
                console.debug('#terminalCompletions Timed out fetching completions from specs');
                return;
            }
            if (terminal.shellIntegration?.env) {
                const homeDirCompletion = result.items.find(i => i.label === '~');
                if (homeDirCompletion && terminal.shellIntegration.env?.value?.HOME) {
                    homeDirCompletion.documentation = (0, uri_1.getFriendlyResourcePath)(vscode.Uri.file(terminal.shellIntegration.env.value.HOME), pathSeparator, vscode.TerminalCompletionItemKind.Folder);
                    homeDirCompletion.kind = vscode.TerminalCompletionItemKind.Folder;
                }
            }
            const cwd = result.cwd ?? terminal.shellIntegration?.cwd;
            if (cwd && (result.showFiles || result.showDirectories)) {
                const globPattern = createFileGlobPattern(result.fileExtensions);
                return new vscode.TerminalCompletionList(result.items, {
                    showFiles: result.showFiles,
                    showDirectories: result.showDirectories,
                    globPattern,
                    cwd,
                });
            }
            return result.items;
        }
    }, '/', '\\'));
    watchPathDirectories(context, currentTerminalEnv, pathExecutableCache);
    context.subscriptions.push(vscode.commands.registerCommand('terminal.integrated.suggest.clearCachedGlobals', () => {
        cachedGlobals.clear();
    }));
}
async function watchPathDirectories(context, env, pathExecutableCache) {
    const pathDirectories = new Set();
    const envPath = env.PATH;
    if (envPath) {
        envPath.split(path_1.delimiter).forEach(p => pathDirectories.add(p));
    }
    const activeWatchers = new Set();
    let debounceTimer; // debounce in case many file events fire at once
    function handleChange() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            pathExecutableCache?.refresh();
            debounceTimer = undefined;
        }, 300);
    }
    // Watch each directory
    for (const dir of pathDirectories) {
        if (activeWatchers.has(dir)) {
            // Skip if already watching this directory
            continue;
        }
        try {
            const stat = await fs.promises.stat(dir);
            if (!stat.isDirectory()) {
                continue;
            }
        }
        catch {
            // File not found
            continue;
        }
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir), '*'));
        context.subscriptions.push(watcher, watcher.onDidCreate(() => handleChange()), watcher.onDidChange(() => handleChange()), watcher.onDidDelete(() => handleChange()));
        activeWatchers.add(dir);
    }
}
/**
 * Adjusts the current working directory based on a given current command string if it is a folder.
 * @param currentCommandString - The current command string, which might contain a folder path prefix.
 * @param currentCwd - The current working directory.
 * @returns The new working directory.
 */
async function resolveCwdFromCurrentCommandString(currentCommandString, currentCwd) {
    const prefix = currentCommandString.split(/\s+/).pop()?.trim() ?? '';
    if (!currentCwd) {
        return;
    }
    try {
        // Get the nearest folder path from the prefix. This ignores everything after the `/` as
        // they are what triggers changes in the directory.
        let lastSlashIndex;
        if (isWindows) {
            // TODO: This support is very basic, ideally the slashes supported would depend upon the
            //       shell type. For example git bash under Windows does not allow using \ as a path
            //       separator.
            lastSlashIndex = prefix.lastIndexOf('\\');
            if (lastSlashIndex === -1) {
                lastSlashIndex = prefix.lastIndexOf('/');
            }
        }
        else {
            lastSlashIndex = prefix.lastIndexOf('/');
        }
        const relativeFolder = lastSlashIndex === -1 ? '' : prefix.slice(0, lastSlashIndex);
        // Don't pre-resolve paths with .. segments - let the completion service handle those
        // to avoid double-navigation (e.g., typing ../ would resolve cwd to parent here,
        // then completion service would navigate up again from the already-parent cwd)
        if (relativeFolder.includes('..')) {
            return undefined;
        }
        // Use vscode.Uri.joinPath for path resolution
        const resolvedUri = vscode.Uri.joinPath(currentCwd, relativeFolder);
        const stat = await vscode.workspace.fs.stat(resolvedUri);
        if (stat.type & vscode.FileType.Directory) {
            return resolvedUri;
        }
    }
    catch {
        // Ignore errors
    }
    // No valid path found
    return undefined;
}
// Retrurns the string that represents the current command and its arguments up to the cursor position.
// Uses shell specific separators to determine the current command and its arguments.
function getCurrentCommandAndArgs(commandLine, cursorIndex, shellType) {
    // Return an empty string if the command line is empty after trimming
    if (commandLine.trim() === '') {
        return '';
    }
    // Check if cursor is not at the end and there's non-whitespace after the cursor
    if (cursorIndex < commandLine.length && /\S/.test(commandLine[cursorIndex])) {
        return '';
    }
    // Extract the part of the line up to the cursor position
    const beforeCursor = commandLine.slice(0, cursorIndex);
    const resetChars = shellType ? tokens_1.shellTypeResetChars.get(shellType) ?? tokens_1.defaultShellTypeResetChars : tokens_1.defaultShellTypeResetChars;
    // Find the last reset character before the cursor
    let lastResetIndex = -1;
    for (const char of resetChars) {
        const idx = beforeCursor.lastIndexOf(char);
        if (idx > lastResetIndex) {
            lastResetIndex = idx;
        }
    }
    // The start of the current command string is after the last reset char (plus one for the char itself)
    const currentCommandStart = lastResetIndex + 1;
    const currentCommandString = beforeCursor.slice(currentCommandStart).replace(/^\s+/, '');
    return currentCommandString;
}
function asArray(x) {
    return Array.isArray(x) ? x : [x];
}
async function getCompletionItemsFromSpecs(specs, terminalContext, availableCommands, currentCommandString, tokenType, shellIntegrationCwd, env, name, token, executeExternals) {
    let items = [];
    let showFiles = false;
    let showDirectories = false;
    let hasCurrentArg = false;
    let fileExtensions;
    if (isWindows) {
        const spaceIndex = currentCommandString.indexOf(' ');
        const commandEndIndex = spaceIndex === -1 ? currentCommandString.length : spaceIndex;
        const lastDotIndex = currentCommandString.lastIndexOf('.', commandEndIndex);
        if (lastDotIndex > 0) { // Don't treat dotfiles as extensions
            currentCommandString = currentCommandString.substring(0, lastDotIndex) + currentCommandString.substring(spaceIndex);
        }
    }
    let executeExternalsFallbackCwd = shellIntegrationCwd?.fsPath;
    if (!executeExternalsFallbackCwd) {
        console.error('No shellIntegrationCwd set, falling back to process.cwd()');
        executeExternalsFallbackCwd = process.cwd();
    }
    const executeExternalsFallbacks = {
        cwd: executeExternalsFallbackCwd,
        env,
    };
    const executeExternalsWithFallback = executeExternals ?? {
        executeCommand: execute_1.executeCommand.bind(execute_1.executeCommand, executeExternalsFallbacks),
        executeCommandTimeout: execute_1.executeCommandTimeout.bind(execute_1.executeCommandTimeout, executeExternalsFallbacks),
    };
    const result = await (0, figInterface_1.getFigSuggestions)(specs, terminalContext, availableCommands, currentCommandString, tokenType, shellIntegrationCwd, env, name, executeExternalsWithFallback, token);
    if (result) {
        hasCurrentArg ||= result.hasCurrentArg;
        showFiles ||= result.showFiles;
        showDirectories ||= result.showDirectories;
        fileExtensions = result.fileExtensions;
        if (result.items) {
            items = items.concat(result.items);
        }
    }
    if (tokenType === 0 /* TokenType.Command */) {
        // Include builitin/available commands in the results
        const labels = new Set(items.map((i) => typeof i.label === 'string' ? i.label : i.label.label));
        for (const command of availableCommands) {
            const commandTextLabel = typeof command.label === 'string' ? command.label : command.label.label;
            // Remove any file extension for matching on Windows
            const labelWithoutExtension = isWindows ? commandTextLabel.replace(/\.[^ ]+$/, '') : commandTextLabel;
            if (!labels.has(labelWithoutExtension)) {
                items.push((0, completionItem_1.createCompletionItem)(terminalContext.cursorIndex, currentCommandString, command, command.detail, command.documentation, vscode.TerminalCompletionItemKind.Method));
                labels.add(commandTextLabel);
            }
            else {
                const existingItem = items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === commandTextLabel);
                if (!existingItem) {
                    continue;
                }
                existingItem.documentation ??= command.documentation;
                existingItem.detail ??= command.detail;
            }
        }
        showFiles = true;
        showDirectories = true;
    }
    else if (!items.length && !showFiles && !showDirectories && !hasCurrentArg) {
        showFiles = true;
        showDirectories = true;
    }
    let cwd;
    if (shellIntegrationCwd && (showFiles || showDirectories)) {
        cwd = await resolveCwdFromCurrentCommandString(currentCommandString, shellIntegrationCwd);
    }
    return { items, showFiles, showDirectories, fileExtensions, cwd };
}
function getEnvAsRecord(shellIntegrationEnv) {
    const env = {};
    for (const [key, value] of Object.entries(shellIntegrationEnv ?? process.env)) {
        if (typeof value === 'string') {
            env[key] = value;
        }
    }
    if (!shellIntegrationEnv) {
        sanitizeProcessEnvironment(env);
    }
    return env;
}
function getTerminalShellType(shellType) {
    switch (shellType) {
        case 'bash':
            return "bash" /* TerminalShellType.Bash */;
        case 'gitbash':
            return "gitbash" /* TerminalShellType.GitBash */;
        case 'zsh':
            return "zsh" /* TerminalShellType.Zsh */;
        case 'pwsh':
            return (0, path_1.basename)(vscode.env.shell, '.exe') === 'powershell' ? "powershell" /* TerminalShellType.WindowsPowerShell */ : "pwsh" /* TerminalShellType.PowerShell */;
        case 'fish':
            return "fish" /* TerminalShellType.Fish */;
        default:
            return undefined;
    }
}
function sanitizeProcessEnvironment(env, ...preserve) {
    const set = preserve.reduce((set, key) => {
        set[key] = true;
        return set;
    }, {});
    const keysToRemove = [
        /^ELECTRON_.$/,
        /^VSCODE_(?!(PORTABLE|SHELL_LOGIN|ENV_REPLACE|ENV_APPEND|ENV_PREPEND)).+$/,
        /^SNAP(|_.*)$/,
        /^GDK_PIXBUF_.$/,
    ];
    const envKeys = Object.keys(env);
    envKeys
        .filter(key => !set[key])
        .forEach(envKey => {
        for (let i = 0; i < keysToRemove.length; i++) {
            if (envKey.search(keysToRemove[i]) !== -1) {
                delete env[envKey];
                break;
            }
        }
    });
}
function createFileGlobPattern(fileExtensions) {
    if (!fileExtensions || fileExtensions.length === 0) {
        return undefined;
    }
    const exts = fileExtensions.map(ext => ext.startsWith('.') ? ext.slice(1) : ext);
    if (exts.length === 1) {
        return `**/*.${exts[0]}`;
    }
    return `**/*.{${exts.join(',')}}`;
}
//# sourceMappingURL=terminalSuggestMain.js.map