/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir, userInfo } from 'node:os';
import * as vscode from 'vscode';
import { TerminalBridge, type BridgeCloseReason, type BridgeConnection } from './bridge';
import { spawnPtyHost } from './ptyHostClient';

class BridgeController implements vscode.Disposable {
	private bridge: TerminalBridge | undefined;
	private connection: BridgeConnection | undefined;
	private starting = false;
	private disposed = false;
	private startCancellation: vscode.CancellationTokenSource | undefined;

	constructor(private readonly output: vscode.LogOutputChannel) { }

	async start(): Promise<void> {
		if (this.starting || this.bridge) {
			await vscode.window.showWarningMessage(vscode.l10n.t("A terminal bridge is already active or starting. Stop it before starting another."));
			return;
		}
		if (!vscode.workspace.isTrusted || !vscode.env.remoteName || vscode.env.uiKind !== vscode.UIKind.Desktop) {
			throw new Error(vscode.l10n.t("Open a trusted remote workspace in desktop VS Code before starting a terminal bridge."));
		}
		this.starting = true;
		const cancellation = new vscode.CancellationTokenSource();
		this.startCancellation = cancellation;
		try {
			const folders = vscode.workspace.workspaceFolders;
			const folder = folders && folders.length > 1
				? await vscode.window.showWorkspaceFolderPick({ placeHolder: vscode.l10n.t("Choose the starting directory for the remote shell") })
				: folders?.[0];
			if (cancellation.token.isCancellationRequested || (folders && folders.length > 1 && !folder)) {
				return;
			}
			const shell = await vscode.window.showInputBox({
				title: vscode.l10n.t("Start Remote Terminal Bridge"),
				prompt: vscode.l10n.t("Remote shell executable (not a command line). The connecting client will run with your remote account's permissions."),
				value: process.platform === 'win32' ? 'powershell.exe' : userInfo().shell || '/bin/sh',
				ignoreFocusOut: true,
				validateInput: value => !value.trim() || /[\r\n\0]/.test(value) ? vscode.l10n.t("Enter a shell executable name or path, without arguments.") : undefined,
			}, cancellation.token);
			if (shell === undefined || this.disposed || cancellation.token.isCancellationRequested) {
				return;
			}
			const bridge = new TerminalBridge({
				spawn: (cols, rows) => spawnPtyHost({
					executable: shell.trim(),
					args: [],
					cols,
					rows,
					cwd: folder?.uri.fsPath ?? homedir(),
					env: shellEnvironment(),
				}),
				onError: error => this.reportError(error),
				onClose: reason => {
					if (this.bridge === bridge) {
						this.bridge = undefined;
						this.connection = undefined;
						this.reportClosed(reason);
					}
				},
			});
			this.bridge = bridge;
			try {
				const connection = await bridge.start();
				const resolved = await vscode.env.asExternalUri(vscode.Uri.parse(connection.url));
				if (this.bridge !== bridge || this.disposed) {
					return;
				}
				if (resolved.scheme !== 'http' && resolved.scheme !== 'https') {
					throw new Error(vscode.l10n.t("The remote provider did not return an HTTP connection URL."));
				}
				this.connection = { url: resolved.toString(true), token: connection.token };
				void this.showReady(bridge).catch(error => this.reportError(error));
			} catch (error) {
				bridge.dispose('error');
				throw error;
			}
		} finally {
			this.startCancellation = undefined;
			cancellation.dispose();
			this.starting = false;
		}
	}

	private async showReady(bridge: TerminalBridge): Promise<void> {
		const copy = vscode.l10n.t("Copy Connection URL");
		const action = await vscode.window.showInformationMessage(
			vscode.l10n.t("Terminal bridge ready for one connection. It expires in five minutes. Run the local client, then use Copy Connection URL and Copy Connection Token from the Command Palette. Keep this VS Code window connected."),
			copy,
		);
		if (action === copy && this.bridge === bridge) {
			await this.copy('url');
		}
	}

	async copy(part: keyof BridgeConnection): Promise<void> {
		if (!this.connection) {
			await vscode.window.showWarningMessage(vscode.l10n.t("No terminal bridge is ready. Run Start Bridge first."));
			return;
		}
		await vscode.env.clipboard.writeText(this.connection[part]);
		await vscode.window.showInformationMessage(part === 'url'
			? vscode.l10n.t("Connection URL copied. Paste it at the local client's URL prompt.")
			: vscode.l10n.t("Connection token copied. Paste it at the local client's hidden token prompt. Treat it as a password."));
	}

	stop(): void {
		this.startCancellation?.cancel();
		if (!this.bridge) {
			void vscode.window.showInformationMessage(this.starting
				? vscode.l10n.t("Terminal bridge startup cancelled.")
				: vscode.l10n.t("No terminal bridge is running."));
			return;
		}
		this.bridge.dispose();
	}

	reportError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		this.output.error(message);
		void vscode.window.showErrorMessage(vscode.l10n.t("Remote terminal bridge: {0}", message));
	}

	private reportClosed(reason: BridgeCloseReason): void {
		this.output.info(`Bridge closed: ${reason}`);
		if (this.disposed || reason === 'error') {
			return;
		}
		const messages: Record<Exclude<BridgeCloseReason, 'error'>, string> = {
			stopped: vscode.l10n.t("Terminal bridge stopped. Its shell has been terminated."),
			expired: vscode.l10n.t("The unused terminal bridge expired. Run Start Bridge to create a new connection."),
			disconnected: vscode.l10n.t("The terminal client disconnected. Its shell has been terminated. Run Start Bridge for a new session."),
			exited: vscode.l10n.t("The remote shell exited and its terminal bridge closed."),
		};
		void vscode.window.showInformationMessage(messages[reason]);
	}

	dispose(): void {
		this.disposed = true;
		this.startCancellation?.cancel();
		this.bridge?.dispose();
	}
}

function shellEnvironment(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	// The new shell has no integrated-terminal IPC or shell-integration owner.
	for (const key of Object.keys(env)) {
		if (key.startsWith('VSCODE_') || key === 'ELECTRON_RUN_AS_NODE' || key === 'NODE_OPTIONS') {
			delete env[key];
		}
	}
	env.TERM_PROGRAM = 'tunnel-terminal';
	delete env.TERM_PROGRAM_VERSION;
	return env;
}

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel(vscode.l10n.t("Tunnel Terminal (Experimental)"), { log: true });
	context.subscriptions.push(output);
	const controller = new BridgeController(output);
	context.subscriptions.push(controller);
	const commands: Record<string, () => void | Promise<void>> = {
		start: () => controller.start(),
		copyUrl: () => controller.copy('url'),
		copyToken: () => controller.copy('token'),
		stop: () => controller.stop(),
	};
	for (const [name, run] of Object.entries(commands)) {
		context.subscriptions.push(vscode.commands.registerCommand(`experimentalTunnelTerminal.${name}`, async () => {
			try {
				await run();
			} catch (error) {
				controller.reportError(error);
			}
		}));
	}
}
