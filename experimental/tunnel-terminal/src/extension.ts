/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir, userInfo } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { BridgeConnection } from './bridge';
import { spawnPtyHost } from './ptyHostClient';
import { RemoteRelay } from './remoteRelay';
import { maxTerminalSessions, relayCommands, relayVersion, type RelayEndpoint, validateSessionId } from './relayProtocol';
import { RemoteTerminalPool, TerminalApprovalGate } from './remoteTerminalPool';

class BridgeController implements vscode.Disposable {
	private active: { bridgeId: string; pool: RemoteTerminalPool; connection?: BridgeConnection } | undefined;
	private readonly approvalGate = new TerminalApprovalGate();
	private starting = false;
	private disposed = false;
	private startCancellation: vscode.CancellationTokenSource | undefined;

	constructor(private readonly output: vscode.LogOutputChannel) { }

	async start(): Promise<void> {
		if (this.starting || this.active) {
			await vscode.window.showWarningMessage(vscode.l10n.t("A terminal bridge is already active or starting. Reuse its connection URL for another shell."));
			return;
		}
		if (!vscode.workspace.isTrusted || !vscode.env.remoteName || vscode.env.uiKind !== vscode.UIKind.Desktop) {
			throw new Error(vscode.l10n.t("Open a trusted remote workspace in desktop VS Code before starting a terminal bridge."));
		}
		this.starting = true;
		const cancellation = new vscode.CancellationTokenSource();
		this.startCancellation = cancellation;
		try {
			try {
				const version = await withTimeout(vscode.commands.executeCommand<number>(relayCommands.localVersion), 10_000);
				if (version !== relayVersion) {
					throw new Error(vscode.l10n.t("The local companion version is incompatible. Update both extensions."));
				}
			} catch (error) {
				throw new Error(vscode.l10n.t("The local Tunnel Terminal companion is unavailable. Install its VSIX under Local - Installed in this remote-connected window, then reload the window. {0}", error instanceof Error ? error.message : String(error)));
			}
			if (cancellation.token.isCancellationRequested || this.disposed) {
				return;
			}
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
			const bridgeId = randomUUID();
			const pool = new RemoteTerminalPool({
				approvalGate: this.approvalGate,
				approve: async code => {
					const allow = vscode.l10n.t("Allow");
					const answer = await vscode.window.showWarningMessage(
						vscode.l10n.t("Allow Remote Terminal Connection?"),
						{
							modal: true,
							detail: vscode.l10n.t("Pairing code: {0}\n\nCompare this entire code with the code shown in your local terminal. Choose Allow only if they match and you started this connection. This grants shell access with your remote account's permissions.\n\nThe request expires after one minute.", code),
						},
						allow,
					);
					return answer === allow;
				},
				spawn: (cols, rows) => spawnPtyHost({
					executable: shell.trim(),
					args: [],
					cols,
					rows,
					cwd: folder?.uri.fsPath ?? homedir(),
					env: shellEnvironment(),
				}),
				onError: error => this.reportError(error),
				onSessionClose: reason => {
					if (!this.disposed) {
						this.output.info(`Terminal session closed: ${reason}`);
					}
				},
			});
			this.active = { bridgeId, pool };
			try {
				const create = Promise.resolve(vscode.commands.executeCommand<RelayEndpoint>(relayCommands.localCreate, { version: relayVersion, bridgeId })).then(endpoint => {
					if (this.active?.pool !== pool || this.disposed) {
						this.stopLocalRelay(bridgeId);
					}
					return endpoint;
				});
				const resolved = await withTimeout(create, 15_000);
				if (this.active?.pool !== pool || this.disposed) {
					return;
				}
				if (!resolved || resolved.version !== relayVersion || typeof resolved.url !== 'string') {
					throw new Error(vscode.l10n.t("The local companion returned an incompatible response."));
				}
				const localUrl = new URL(resolved.url);
				if (localUrl.protocol !== 'http:' || localUrl.hostname !== '127.0.0.1' || localUrl.pathname !== '/terminal' || localUrl.username || localUrl.password || localUrl.search || localUrl.hash) {
					throw new Error(vscode.l10n.t("The local companion did not return a loopback terminal URL."));
				}
				this.active.connection = { url: resolved.url };
				void this.showReady(bridgeId).catch(error => this.reportError(error));
			} catch (error) {
				pool.dispose();
				this.stopLocalRelay(bridgeId);
				if (this.active?.pool === pool) {
					this.active = undefined;
				}
				throw error;
			}
		} finally {
			this.startCancellation = undefined;
			cancellation.dispose();
			this.starting = false;
		}
	}

	getPool(bridgeId: string): RemoteTerminalPool {
		validateSessionId(bridgeId);
		if (bridgeId !== this.active?.bridgeId) {
			throw new Error(vscode.l10n.t("The remote terminal bridge has expired. Run Start Bridge again."));
		}
		return this.active.pool;
	}

	getRelay(bridgeId: string, sessionId: string): RemoteRelay {
		return this.getPool(bridgeId).getRelay(sessionId);
	}

	closeRelay(bridgeId: string, sessionId: string): void {
		validateSessionId(bridgeId);
		validateSessionId(sessionId);
		if (bridgeId === this.active?.bridgeId) {
			this.active.pool.close(sessionId);
		}
	}

	stopBridge(bridgeId: string): void {
		validateSessionId(bridgeId);
		if (bridgeId === this.active?.bridgeId) {
			this.stop();
		}
	}

	private stopLocalRelay(bridgeId: string): void {
		void withTimeout(vscode.commands.executeCommand(relayCommands.localStop, bridgeId), 5_000).catch(error => {
			if (!this.disposed) {
				this.output.warn(vscode.l10n.t("Could not notify the local companion to stop: {0}", error instanceof Error ? error.message : String(error)));
			}
		});
	}

	private async showReady(bridgeId: string): Promise<void> {
		const copy = vscode.l10n.t("Copy Connection URL");
		const action = await vscode.window.showInformationMessage(
			vscode.l10n.t("Terminal bridge ready. Reuse its URL for up to {0} independent shells. Approve each matching pairing code before connecting the next client. Stop Bridge closes all sessions. Keep this window connected.", maxTerminalSessions),
			copy,
		);
		if (action === copy && this.active?.bridgeId === bridgeId) {
			await this.copyUrl();
		}
	}

	async copyUrl(): Promise<void> {
		if (!this.active?.connection) {
			await vscode.window.showWarningMessage(vscode.l10n.t("No terminal bridge is ready. Run Start Bridge first."));
			return;
		}
		await vscode.env.clipboard.writeText(this.active.connection.url);
		await vscode.window.showInformationMessage(vscode.l10n.t("Connection URL copied. Paste it at the local client's URL prompt, then compare the pairing codes before allowing the connection."));
	}

	stop(): void {
		this.startCancellation?.cancel();
		const active = this.active;
		if (!active) {
			void vscode.window.showInformationMessage(this.starting
				? vscode.l10n.t("Terminal bridge startup cancelled.")
				: vscode.l10n.t("No terminal bridge is running."));
			return;
		}
		this.active = undefined;
		active.pool.dispose();
		this.stopLocalRelay(active.bridgeId);
		if (!this.disposed) {
			void vscode.window.showInformationMessage(vscode.l10n.t("Terminal bridge stopped. All of its shell sessions have been terminated."));
		}
	}

	reportError(error: unknown): void {
		if (this.disposed) {
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		this.output.error(message);
		void vscode.window.showErrorMessage(vscode.l10n.t("Remote terminal bridge: {0}", message));
	}

	dispose(): void {
		this.disposed = true;
		this.startCancellation?.cancel();
		if (this.active) {
			this.stop();
		}
	}
}

async function withTimeout<T>(operation: Thenable<T>, timeoutMs: number): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(vscode.l10n.t("The VS Code relay request timed out."))), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timer);
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
	context.subscriptions.push(
		vscode.commands.registerCommand(relayCommands.remoteOpen, (bridgeId: string, sessionId: string) => controller.getPool(bridgeId).open(sessionId)),
		vscode.commands.registerCommand(relayCommands.remoteRead, (bridgeId: string, sessionId: string) => controller.getRelay(bridgeId, sessionId).read()),
		vscode.commands.registerCommand(relayCommands.remoteWrite, (bridgeId: string, sessionId: string, messages: string[]) => controller.getRelay(bridgeId, sessionId).write(messages)),
		vscode.commands.registerCommand(relayCommands.remoteClose, (bridgeId: string, sessionId: string) => controller.closeRelay(bridgeId, sessionId)),
		vscode.commands.registerCommand(relayCommands.remoteStop, (bridgeId: string) => controller.stopBridge(bridgeId)),
	);
	const commands: Record<string, () => void | Promise<void>> = {
		start: () => controller.start(),
		copyUrl: () => controller.copyUrl(),
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
