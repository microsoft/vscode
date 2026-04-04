/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Manages the agent host process lifecycle. Desktop-only — starts the
 * agent host server via a terminal running `scripts/code-agent-host.sh`.
 */
export class AgentHostManager implements vscode.Disposable {

	private _terminal: vscode.Terminal | undefined;
	private _port: number | undefined;
	private _connectionToken: string | undefined;
	private readonly _disposables: vscode.Disposable[] = [];

	constructor() {
		this._disposables.push(
			vscode.window.onDidCloseTerminal(t => {
				if (t === this._terminal) {
					this._terminal = undefined;
					this._port = undefined;
					this._connectionToken = undefined;
				}
			})
		);
	}

	get port(): number | undefined {
		return this._port;
	}

	get connectionToken(): string | undefined {
		return this._connectionToken;
	}

	get isRunning(): boolean {
		return this._terminal !== undefined;
	}

	/**
	 * Start the agent host server in a VS Code terminal.
	 *
	 * @param rootPath The workspace root path used to locate the launch script.
	 * @param registryUrl The Codamente host registry URL.
	 * @param githubToken GitHub token for registry authentication.
	 * @param hostName A friendly name for this host.
	 * @returns The port the agent host is listening on.
	 */
	async start(rootPath: string, registryUrl: string, githubToken: string, hostName: string): Promise<{ port: number; connectionToken: string }> {
		if (this._terminal) {
			throw new Error('Agent host is already running');
		}

		const port = 8081;
		const connectionToken = generateUUID();

		this._port = port;
		this._connectionToken = connectionToken;

		const scriptPath = `${rootPath}/scripts/code-agent-host.sh`;
		const command = [
			'VSCODE_SKIP_PRELAUNCH=1',
			scriptPath,
			'--port', String(port),
			'--connection-token', `'${connectionToken}'`,
			'--registry-url', `'${registryUrl}'`,
			'--github-token', `'${githubToken}'`,
			'--host-name', `'${hostName}'`,
		].join(' ');

		this._terminal = vscode.window.createTerminal({
			name: 'Codamente Agent Host',
		});
		this._terminal.sendText(command, true);

		return { port, connectionToken };
	}

	/**
	 * Stop the agent host server.
	 */
	stop(): void {
		if (this._terminal) {
			this._terminal.dispose();
			this._terminal = undefined;
			this._port = undefined;
			this._connectionToken = undefined;
		}
	}

	dispose(): void {
		this.stop();
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}

function generateUUID(): string {
	// Simple UUID v4 generator
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}
