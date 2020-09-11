/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServer, Server } from 'net';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
const TEXT_ALWAYS = localize('status.text.auto.attach.always', 'Auto Attach: Always');
const TEXT_SMART = localize('status.text.auto.attach.smart', 'Auto Attach: Smart');
const TEXT_WITH_FLAG = localize('status.text.auto.attach.withFlag', 'Auto Attach: With Flag');
const TEXT_STATE_DESCRIPTION = {
	[State.Disabled]: localize(
		'debug.javascript.autoAttach.disabled.description',
		'Auto attach is disabled and not shown in status bar',
	),
	[State.Always]: localize(
		'debug.javascript.autoAttach.always.description',
		'Auto attach to every Node.js process launched in the terminal',
	),
	[State.Smart]: localize(
		'debug.javascript.autoAttach.smart.description',
		"Auto attach when running scripts that aren't in a node_modules folder",
	),
	[State.OnlyWithFlag]: localize(
		'debug.javascript.autoAttach.onlyWithFlag.description',
		'Only auto attach when the `--inspect` flag is given',
	),
};

const TOGGLE_COMMAND = 'extension.node-debug.toggleAutoAttach';
const STORAGE_IPC = 'jsDebugIpcState';

const SETTING_SECTION = 'debug.javascript';
const SETTING_STATE = 'autoAttachFilter';

/**
 * settings that, when changed, should cause us to refresh the state vars
 */
const SETTINGS_CAUSE_REFRESH = new Set(
	['autoAttachSmartPattern', SETTING_STATE].map(s => `${SETTING_SECTION}.${s}`),
);

const enum State {
	Disabled = 'disabled',
	OnlyWithFlag = 'onlyWithFlag',
	Smart = 'smart',
	Always = 'always',
}

let currentState: Promise<{ context: vscode.ExtensionContext; state: State | null }>;
let statusItem: vscode.StatusBarItem | undefined; // and there is no status bar item
let server: Promise<Server | undefined> | undefined; // auto attach server

export function activate(context: vscode.ExtensionContext): void {
	currentState = Promise.resolve({ context, state: null });

	context.subscriptions.push(
		vscode.commands.registerCommand(TOGGLE_COMMAND, toggleAutoAttachSetting),
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			// Whenever a setting is changed, disable auto attach, and re-enable
			// it (if necessary) to refresh variables.
			if (
				e.affectsConfiguration(`${SETTING_SECTION}.${SETTING_STATE}`) ||
				[...SETTINGS_CAUSE_REFRESH].some(setting => e.affectsConfiguration(setting))
			) {
				updateAutoAttach(State.Disabled);
				updateAutoAttach(readCurrentState());
			}
		}),
	);

	updateAutoAttach(readCurrentState());
}

export async function deactivate(): Promise<void> {
	await destroyAttachServer();
}

type StatePickItem =
	| (vscode.QuickPickItem & { state: State })
	| (vscode.QuickPickItem & { scope: vscode.ConfigurationTarget })
	| (vscode.QuickPickItem & { type: 'separator' });

function getDefaultScope(info: ReturnType<vscode.WorkspaceConfiguration['inspect']>) {
	if (!info) {
		return vscode.ConfigurationTarget.Global;
	} else if (info.workspaceFolderValue) {
		return vscode.ConfigurationTarget.WorkspaceFolder;
	} else if (info.workspaceValue) {
		return vscode.ConfigurationTarget.Workspace;
	} else if (info.globalValue) {
		return vscode.ConfigurationTarget.Global;
	}

	return vscode.ConfigurationTarget.Global;
}

async function toggleAutoAttachSetting(scope?: vscode.ConfigurationTarget): Promise<void> {
	const section = vscode.workspace.getConfiguration(SETTING_SECTION);
	scope = scope || getDefaultScope(section.inspect(SETTING_STATE));

	const stateItems = [State.Always, State.Smart, State.OnlyWithFlag, State.Disabled].map(state => ({
		state,
		label: state.slice(0, 1).toUpperCase() + state.slice(1),
		description: TEXT_STATE_DESCRIPTION[state],
		alwaysShow: true,
	}));

	const scopeItem =
		scope === vscode.ConfigurationTarget.Global
			? {
				label: localize('scope.workspace', 'Toggle in this workspace $(arrow-right)'),
				scope: vscode.ConfigurationTarget.Workspace,
			}
			: {
				label: localize('scope.global', 'Toggle for this machine $(arrow-right)'),
				scope: vscode.ConfigurationTarget.Global,
			};

	const quickPick = vscode.window.createQuickPick<StatePickItem>();
	// todo: have a separator here, see https://github.com/microsoft/vscode/issues/74967
	quickPick.items = [...stateItems, scopeItem];

	quickPick.show();
	const current = readCurrentState();
	quickPick.activeItems = stateItems.filter(i => i.state === current);

	const result = await new Promise<StatePickItem | undefined>(resolve => {
		quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]));
		quickPick.onDidHide(() => resolve());
	});

	quickPick.dispose();

	if (!result) {
		return;
	}

	if ('scope' in result) {
		return await toggleAutoAttachSetting(result.scope);
	}

	if ('state' in result) {
		section.update(SETTING_STATE, result.state, scope);
	}
}

function readCurrentState(): State {
	const section = vscode.workspace.getConfiguration(SETTING_SECTION);
	return section.get<State>(SETTING_STATE) ?? State.Disabled;
}

/**
 * Makes sure the status bar exists and is visible.
 */
function ensureStatusBarExists(context: vscode.ExtensionContext) {
	if (!statusItem) {
		statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		statusItem.command = TOGGLE_COMMAND;
		statusItem.tooltip = localize(
			'status.tooltip.auto.attach',
			'Automatically attach to node.js processes in debug mode',
		);
		statusItem.show();
		context.subscriptions.push(statusItem);
	} else {
		statusItem.show();
	}

	return statusItem;
}

async function clearJsDebugAttachState(context: vscode.ExtensionContext) {
	await context.workspaceState.update(STORAGE_IPC, undefined);
	await vscode.commands.executeCommand('extension.js-debug.clearAutoAttachVariables');
	await destroyAttachServer();
}

/**
 * Turns auto attach on, and returns the server auto attach is listening on
 * if it's successful.
 */
async function createAttachServer(context: vscode.ExtensionContext) {
	const ipcAddress = await getIpcAddress(context);
	if (!ipcAddress) {
		return undefined;
	}

	server = new Promise<Server>((resolve, reject) => {
		const s = createServer(socket => {
			let data: Buffer[] = [];
			socket.on('data', async chunk => {
				if (chunk[chunk.length - 1] !== 0) {
					// terminated with NUL byte
					data.push(chunk);
					return;
				}

				data.push(chunk.slice(0, -1));

				try {
					await vscode.commands.executeCommand(
						'extension.js-debug.autoAttachToProcess',
						JSON.parse(Buffer.concat(data).toString()),
					);
					socket.write(Buffer.from([0]));
				} catch (err) {
					socket.write(Buffer.from([1]));
					console.error(err);
				}
			});
		})
			.on('error', reject)
			.listen(ipcAddress, () => resolve(s));
	}).catch(err => {
		console.error(err);
		return undefined;
	});

	return await server;
}

/**
 * Destroys the auto-attach server, if it's running.
 */
async function destroyAttachServer() {
	const instance = await server;
	if (instance) {
		await new Promise(r => instance.close(r));
	}
}

interface CachedIpcState {
	ipcAddress: string;
	jsDebugPath: string;
	settingsValue: string;
}

/**
 * Map of logic that happens when auto attach states are entered and exited.
 * All state transitions are queued and run in order; promises are awaited.
 */
const transitions: { [S in State]: (context: vscode.ExtensionContext) => Promise<void> } = {
	async [State.Disabled](context) {
		await clearJsDebugAttachState(context);
		statusItem?.hide();
	},

	async [State.OnlyWithFlag](context) {
		await createAttachServer(context);
		const statusItem = ensureStatusBarExists(context);
		statusItem.text = TEXT_WITH_FLAG;
	},

	async [State.Smart](context) {
		await createAttachServer(context);
		const statusItem = ensureStatusBarExists(context);
		statusItem.text = TEXT_SMART;
	},

	async [State.Always](context) {
		await createAttachServer(context);
		const statusItem = ensureStatusBarExists(context);
		statusItem.text = TEXT_ALWAYS;
	},
};

/**
 * Updates the auto attach feature based on the user or workspace setting
 */
function updateAutoAttach(newState: State) {
	currentState = currentState.then(async ({ context, state: oldState }) => {
		if (newState === oldState) {
			return { context, state: oldState };
		}

		await transitions[newState](context);
		return { context, state: newState };
	});
}

/**
 * Gets the IPC address for the server to listen on for js-debug sessions. This
 * is cached such that we can reuse the address of previous activations.
 */
async function getIpcAddress(context: vscode.ExtensionContext) {
	// Iff the `cachedData` is present, the js-debug registered environment
	// variables for this workspace--cachedData is set after successfully
	// invoking the attachment command.
	const cachedIpc = context.workspaceState.get<CachedIpcState>(STORAGE_IPC);

	// We invalidate the IPC data if the js-debug path changes, since that
	// indicates the extension was updated or reinstalled and the
	// environment variables will have been lost.
	// todo: make a way in the API to read environment data directly without activating js-debug?
	const jsDebugPath =
		vscode.extensions.getExtension('ms-vscode.js-debug-nightly')?.extensionPath ||
		vscode.extensions.getExtension('ms-vscode.js-debug')?.extensionPath;

	const settingsValue = getJsDebugSettingKey();
	if (cachedIpc?.jsDebugPath === jsDebugPath && cachedIpc?.settingsValue === settingsValue) {
		return cachedIpc.ipcAddress;
	}

	const result = await vscode.commands.executeCommand<{ ipcAddress: string }>(
		'extension.js-debug.setAutoAttachVariables',
		cachedIpc?.ipcAddress,
	);
	if (!result) {
		return;
	}

	const ipcAddress = result.ipcAddress;
	await context.workspaceState.update(STORAGE_IPC, {
		ipcAddress,
		jsDebugPath,
		settingsValue,
	} as CachedIpcState);

	return ipcAddress;
}

function getJsDebugSettingKey() {
	let o: { [key: string]: unknown } = {};
	const config = vscode.workspace.getConfiguration(SETTING_SECTION);
	for (const setting of SETTINGS_CAUSE_REFRESH) {
		o[setting] = config.get(setting);
	}

	return JSON.stringify(o);
}
