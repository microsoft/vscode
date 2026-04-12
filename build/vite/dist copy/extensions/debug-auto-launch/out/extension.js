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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const fs_1 = require("fs");
const net_1 = require("net");
const path_1 = require("path");
const vscode = __importStar(require("vscode"));
const TEXT_STATUSBAR_LABEL = {
    ["disabled" /* State.Disabled */]: vscode.l10n.t('Auto Attach: Disabled'),
    ["always" /* State.Always */]: vscode.l10n.t('Auto Attach: Always'),
    ["smart" /* State.Smart */]: vscode.l10n.t('Auto Attach: Smart'),
    ["onlyWithFlag" /* State.OnlyWithFlag */]: vscode.l10n.t('Auto Attach: With Flag'),
};
const TEXT_STATE_LABEL = {
    ["disabled" /* State.Disabled */]: vscode.l10n.t('Disabled'),
    ["always" /* State.Always */]: vscode.l10n.t('Always'),
    ["smart" /* State.Smart */]: vscode.l10n.t('Smart'),
    ["onlyWithFlag" /* State.OnlyWithFlag */]: vscode.l10n.t('Only With Flag'),
};
const TEXT_STATE_DESCRIPTION = {
    ["disabled" /* State.Disabled */]: vscode.l10n.t('Auto attach is disabled and not shown in status bar'),
    ["always" /* State.Always */]: vscode.l10n.t('Auto attach to every Node.js process launched in the terminal'),
    ["smart" /* State.Smart */]: vscode.l10n.t("Auto attach when running scripts that aren't in a node_modules folder"),
    ["onlyWithFlag" /* State.OnlyWithFlag */]: vscode.l10n.t('Only auto attach when the `--inspect` flag is given')
};
const TEXT_TOGGLE_TITLE = vscode.l10n.t('Toggle Auto Attach');
const TEXT_TOGGLE_WORKSPACE = vscode.l10n.t('Toggle auto attach in this workspace');
const TEXT_TOGGLE_GLOBAL = vscode.l10n.t('Toggle auto attach on this machine');
const TEXT_TEMP_DISABLE = vscode.l10n.t('Temporarily disable auto attach in this session');
const TEXT_TEMP_ENABLE = vscode.l10n.t('Re-enable auto attach');
const TEXT_TEMP_DISABLE_LABEL = vscode.l10n.t('Auto Attach: Disabled');
const TOGGLE_COMMAND = 'extension.node-debug.toggleAutoAttach';
const STORAGE_IPC = 'jsDebugIpcState';
const SETTING_SECTION = 'debug.javascript';
const SETTING_STATE = 'autoAttachFilter';
/**
 * settings that, when changed, should cause us to refresh the state vars
 */
const SETTINGS_CAUSE_REFRESH = new Set(['autoAttachSmartPattern', SETTING_STATE].map(s => `${SETTING_SECTION}.${s}`));
let currentState;
let statusItem; // and there is no status bar item
let server; // auto attach server
let isTemporarilyDisabled = false; // whether the auto attach server is disabled temporarily, reset whenever the state changes
function activate(context) {
    currentState = Promise.resolve({ context, state: null });
    context.subscriptions.push(vscode.commands.registerCommand(TOGGLE_COMMAND, toggleAutoAttachSetting.bind(null, context)));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        // Whenever a setting is changed, disable auto attach, and re-enable
        // it (if necessary) to refresh variables.
        if (e.affectsConfiguration(`${SETTING_SECTION}.${SETTING_STATE}`) ||
            [...SETTINGS_CAUSE_REFRESH].some(setting => e.affectsConfiguration(setting))) {
            refreshAutoAttachVars();
        }
    }));
    updateAutoAttach(readCurrentState());
}
async function deactivate() {
    await destroyAttachServer();
}
function refreshAutoAttachVars() {
    updateAutoAttach("disabled" /* State.Disabled */);
    updateAutoAttach(readCurrentState());
}
function getDefaultScope(info) {
    if (!info) {
        return vscode.ConfigurationTarget.Global;
    }
    else if (info.workspaceFolderValue) {
        return vscode.ConfigurationTarget.WorkspaceFolder;
    }
    else if (info.workspaceValue) {
        return vscode.ConfigurationTarget.Workspace;
    }
    else if (info.globalValue) {
        return vscode.ConfigurationTarget.Global;
    }
    return vscode.ConfigurationTarget.Global;
}
async function toggleAutoAttachSetting(context, scope) {
    const section = vscode.workspace.getConfiguration(SETTING_SECTION);
    scope = scope || getDefaultScope(section.inspect(SETTING_STATE));
    const isGlobalScope = scope === vscode.ConfigurationTarget.Global;
    const quickPick = vscode.window.createQuickPick();
    const current = readCurrentState();
    const items = ["always" /* State.Always */, "smart" /* State.Smart */, "onlyWithFlag" /* State.OnlyWithFlag */, "disabled" /* State.Disabled */].map(state => ({
        state,
        label: TEXT_STATE_LABEL[state],
        description: TEXT_STATE_DESCRIPTION[state],
        alwaysShow: true,
    }));
    if (current !== "disabled" /* State.Disabled */) {
        items.unshift({
            setTempDisabled: !isTemporarilyDisabled,
            label: isTemporarilyDisabled ? TEXT_TEMP_ENABLE : TEXT_TEMP_DISABLE,
            alwaysShow: true,
        });
    }
    quickPick.items = items;
    quickPick.activeItems = isTemporarilyDisabled
        ? [items[0]]
        : quickPick.items.filter(i => 'state' in i && i.state === current);
    quickPick.title = TEXT_TOGGLE_TITLE;
    quickPick.placeholder = isGlobalScope ? TEXT_TOGGLE_GLOBAL : TEXT_TOGGLE_WORKSPACE;
    quickPick.buttons = [
        {
            iconPath: new vscode.ThemeIcon(isGlobalScope ? 'folder' : 'globe'),
            tooltip: isGlobalScope ? TEXT_TOGGLE_WORKSPACE : TEXT_TOGGLE_GLOBAL,
        },
    ];
    quickPick.show();
    let result = await new Promise(resolve => {
        quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]));
        quickPick.onDidHide(() => resolve(undefined));
        quickPick.onDidTriggerButton(() => {
            resolve({
                scope: isGlobalScope
                    ? vscode.ConfigurationTarget.Workspace
                    : vscode.ConfigurationTarget.Global,
            });
        });
    });
    quickPick.dispose();
    if (!result) {
        return;
    }
    if ('scope' in result) {
        return await toggleAutoAttachSetting(context, result.scope);
    }
    if ('state' in result) {
        if (result.state !== current) {
            section.update(SETTING_STATE, result.state, scope);
        }
        else if (isTemporarilyDisabled) {
            result = { setTempDisabled: false };
        }
    }
    if ('setTempDisabled' in result) {
        updateStatusBar(context, current, true);
        isTemporarilyDisabled = result.setTempDisabled;
        if (result.setTempDisabled) {
            await destroyAttachServer();
        }
        else {
            await createAttachServer(context); // unsets temp disabled var internally
        }
        updateStatusBar(context, current, false);
    }
}
function readCurrentState() {
    const section = vscode.workspace.getConfiguration(SETTING_SECTION);
    return section.get(SETTING_STATE) ?? "disabled" /* State.Disabled */;
}
async function clearJsDebugAttachState(context) {
    if (server || await context.workspaceState.get(STORAGE_IPC)) {
        await context.workspaceState.update(STORAGE_IPC, undefined);
        await vscode.commands.executeCommand('extension.js-debug.clearAutoAttachVariables');
        await destroyAttachServer();
    }
}
/**
 * Turns auto attach on, and returns the server auto attach is listening on
 * if it's successful.
 */
async function createAttachServer(context) {
    const ipcAddress = await getIpcAddress(context);
    if (!ipcAddress) {
        return undefined;
    }
    server = createServerInner(ipcAddress).catch(async (err) => {
        console.error('[debug-auto-launch] Error creating auto attach server: ', err);
        if (process.platform !== 'win32') {
            // On macOS, and perhaps some Linux distros, the temporary directory can
            // sometimes change. If it looks like that's the cause of a listener
            // error, automatically refresh the auto attach vars.
            try {
                await fs_1.promises.access((0, path_1.dirname)(ipcAddress));
            }
            catch {
                console.error('[debug-auto-launch] Refreshing variables from error');
                refreshAutoAttachVars();
                return undefined;
            }
        }
        return undefined;
    });
    return await server;
}
const createServerInner = async (ipcAddress) => {
    try {
        return await createServerInstance(ipcAddress);
    }
    catch (e) {
        // On unix/linux, the file can 'leak' if the process exits unexpectedly.
        // If we see this, try to delete the file and then listen again.
        await fs_1.promises.unlink(ipcAddress).catch(() => undefined);
        return await createServerInstance(ipcAddress);
    }
};
const createServerInstance = (ipcAddress) => new Promise((resolve, reject) => {
    const s = (0, net_1.createServer)(socket => {
        const data = [];
        socket.on('data', async (chunk) => {
            if (chunk[chunk.length - 1] !== 0) {
                // terminated with NUL byte
                data.push(chunk);
                return;
            }
            data.push(chunk.slice(0, -1));
            try {
                await vscode.commands.executeCommand('extension.js-debug.autoAttachToProcess', JSON.parse(Buffer.concat(data).toString()));
                socket.write(Buffer.from([0]));
            }
            catch (err) {
                socket.write(Buffer.from([1]));
                console.error(err);
            }
        });
    })
        .on('error', reject)
        .listen(ipcAddress, () => resolve(s));
});
/**
 * Destroys the auto-attach server, if it's running.
 */
async function destroyAttachServer() {
    const instance = await server;
    if (instance) {
        await new Promise(r => instance.close(r));
    }
}
/**
 * Map of logic that happens when auto attach states are entered and exited.
 * All state transitions are queued and run in order; promises are awaited.
 */
const transitions = {
    async ["disabled" /* State.Disabled */](context) {
        await clearJsDebugAttachState(context);
    },
    async ["onlyWithFlag" /* State.OnlyWithFlag */](context) {
        await createAttachServer(context);
    },
    async ["smart" /* State.Smart */](context) {
        await createAttachServer(context);
    },
    async ["always" /* State.Always */](context) {
        await createAttachServer(context);
    },
};
/**
 * Ensures the status bar text reflects the current state.
 */
function updateStatusBar(context, state, busy = false) {
    if (state === "disabled" /* State.Disabled */ && !busy) {
        statusItem?.hide();
        return;
    }
    if (!statusItem) {
        statusItem = vscode.window.createStatusBarItem('status.debug.autoAttach', vscode.StatusBarAlignment.Left);
        statusItem.name = vscode.l10n.t("Debug Auto Attach");
        statusItem.command = TOGGLE_COMMAND;
        statusItem.tooltip = vscode.l10n.t("Automatically attach to node.js processes in debug mode");
        context.subscriptions.push(statusItem);
    }
    let text = busy ? '$(loading) ' : '';
    text += isTemporarilyDisabled ? TEXT_TEMP_DISABLE_LABEL : TEXT_STATUSBAR_LABEL[state];
    statusItem.text = text;
    statusItem.show();
}
/**
 * Updates the auto attach feature based on the user or workspace setting
 */
function updateAutoAttach(newState) {
    currentState = currentState.then(async ({ context, state: oldState }) => {
        if (newState === oldState) {
            return { context, state: oldState };
        }
        if (oldState !== null) {
            updateStatusBar(context, oldState, true);
        }
        await transitions[newState](context);
        isTemporarilyDisabled = false;
        updateStatusBar(context, newState, false);
        return { context, state: newState };
    });
}
/**
 * Gets the IPC address for the server to listen on for js-debug sessions. This
 * is cached such that we can reuse the address of previous activations.
 */
async function getIpcAddress(context) {
    // Iff the `cachedData` is present, the js-debug registered environment
    // variables for this workspace--cachedData is set after successfully
    // invoking the attachment command.
    const cachedIpc = context.workspaceState.get(STORAGE_IPC);
    // We invalidate the IPC data if the js-debug path changes, since that
    // indicates the extension was updated or reinstalled and the
    // environment variables will have been lost.
    // todo: make a way in the API to read environment data directly without activating js-debug?
    const jsDebugPath = vscode.extensions.getExtension('ms-vscode.js-debug-nightly')?.extensionPath ||
        vscode.extensions.getExtension('ms-vscode.js-debug')?.extensionPath;
    const settingsValue = getJsDebugSettingKey();
    if (cachedIpc?.jsDebugPath === jsDebugPath && cachedIpc?.settingsValue === settingsValue) {
        return cachedIpc.ipcAddress;
    }
    const result = await vscode.commands.executeCommand('extension.js-debug.setAutoAttachVariables', cachedIpc?.ipcAddress);
    if (!result) {
        return;
    }
    const ipcAddress = result.ipcAddress;
    await context.workspaceState.update(STORAGE_IPC, {
        ipcAddress,
        jsDebugPath,
        settingsValue,
    });
    return ipcAddress;
}
function getJsDebugSettingKey() {
    const o = {};
    const config = vscode.workspace.getConfiguration(SETTING_SECTION);
    for (const setting of SETTINGS_CAUSE_REFRESH) {
        o[setting] = config.get(setting);
    }
    return JSON.stringify(o);
}
//# sourceMappingURL=extension.js.map