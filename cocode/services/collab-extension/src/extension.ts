import * as vscode from 'vscode';
import { setupCollaboration } from './yjs/binding';

const CONFIG_SECTION = 'cocodeCollab';

let collabDisposable: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('[CoCode Collab] Extension activating...');

	if (vscode.env.uiKind !== vscode.UIKind.Web) {
		console.warn('[CoCode Collab] Not running in web UI host; skipping activation.');
		return;
	}

	const toggleCommand = vscode.commands.registerCommand('cocode.toggleCollaboration', () => {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		const enabled = config.get<boolean>('enabled', true);
		config.update('enabled', !enabled, vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage(`Collaboration ${!enabled ? 'enabled' : 'disabled'}`);
	});

	context.subscriptions.push(toggleCommand);

	if (isCollabEnabled()) {
		startCollaboration(context);
	}

	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(`${CONFIG_SECTION}.enabled`)) {
			const enabled = isCollabEnabled();
			if (enabled) {
				startCollaboration(context);
			} else {
				stopCollaboration();
			}
			return;
		}

		if (e.affectsConfiguration(`${CONFIG_SECTION}.yjsUrl`) && collabDisposable) {
			stopCollaboration();
			startCollaboration(context);
		}
	});

	context.subscriptions.push(configListener);

	console.log('[CoCode Collab] Extension activated');
}

function startCollaboration(context: vscode.ExtensionContext) {
	if (collabDisposable) {
		return;
	}

	console.log('[CoCode Collab] Starting collaboration...');

	try {
		const wsUrl = resolveYjsWsUrl();
		console.log('[CoCode Collab] Connecting to Yjs server:', wsUrl);

		collabDisposable = setupCollaboration(context, wsUrl);

		if (collabDisposable) {
			context.subscriptions.push(collabDisposable);
		}
	} catch (error) {
		console.error('[CoCode Collab] Failed to start collaboration:', error);
		vscode.window.showErrorMessage(`Failed to start collaboration: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function stopCollaboration() {
	if (collabDisposable) {
		console.log('[CoCode Collab] Stopping collaboration...');
		collabDisposable.dispose();
		collabDisposable = undefined;
	}
}

function resolveYjsWsUrl(): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const configured = config.get<string>('yjsUrl', '').trim();

	if (configured.length > 0) {
		return configured;
	}

	const locationLike = typeof globalThis !== 'undefined' && typeof (globalThis as any).location !== 'undefined'
		? (globalThis as { location?: { protocol?: string; host?: string } }).location
		: undefined;

	if (locationLike?.protocol && locationLike?.host) {
		const wsProtocol = locationLike.protocol === 'https:' ? 'wss:' : 'ws:';
		return `${wsProtocol}//${locationLike.host}/yjs`;
	}

	console.warn('[CoCode Collab] Unable to infer host from location; falling back to ws://localhost:1234/yjs');
	return 'ws://localhost:1234/yjs';
}

function isCollabEnabled(): boolean {
	return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>('enabled', true);
}

export function deactivate() {
	stopCollaboration();
	console.log('[CoCode Collab] Extension deactivated');
}
