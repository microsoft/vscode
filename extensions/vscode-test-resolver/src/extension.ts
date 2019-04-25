/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let startPromise: Promise<vscode.ResolvedAuthority> | undefined = void 0;
let extHostProcess: cp.ChildProcess | undefined;
const enum CharCode {
	Backspace = 8,
	LineFeed = 10
}

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	const resolver: vscode.RemoteAuthorityResolver = {
		resolve(_authority: string): Thenable<vscode.ResolvedAuthority> {
			if (!startPromise) {
				startPromise = new Promise((res, rej) => {
					outputChannel = vscode.window.createOutputChannel('RemoteTest');
					let isStarted = false;

					async function processError(message: string) {
						outputChannel.appendLine(message);
						if (!isStarted) {
							outputChannel.show();
							const result = await vscode.window.showErrorMessage(message, { modal: true }, retryAction, showLogAction);
							if (result) {
								await result.execute();
							} else {
								await defaultAction.execute();
							}

							rej(vscode.RemoteAuthorityResolverError.NotAvailable(message, result !== showLogAction));
						}
					}

					if (_authority === 'test+error') {
						processError('Unable to start the Test Resolver');
						return;
					}

					const vscodePath = path.resolve(path.join(context.extensionPath, '..', '..'));
					const nodeExec = process.platform === 'win32' ? 'node.exe' : 'node';
					const nodePath = path.join(vscodePath, '.build', 'node-remote', nodeExec);

					if (!fs.existsSync(nodePath)) {
						try {
							outputChannel.appendLine(`Installing node at ${nodePath}`);
							cp.execSync(`node ${path.join(vscodePath, 'node_modules/gulp/bin/gulp.js')} node-remote`);
						} catch (e) {
							processError(`Problem downloading node: ${e.message}`);

						}
					}
					outputChannel.appendLine(`Using node at ${nodePath}`);

					const env = { ...process.env };
					delete env['ELECTRON_RUN_AS_NODE'];

					env['PATH'] = path.join(vscodePath, 'scripts') + path.delimiter + env['PATH']; // allow calling code-headless-dev.sh

					outputChannel.appendLine(env['PATH'] || '');

					extHostProcess = cp.spawn(nodePath, [path.join('out', 'remoteExtensionHostAgent'), '--port=0'], { cwd: vscodePath, env });

					let lastProgressLine = '';
					extHostProcess.stdout.on('data', (data: Buffer) => processOutput(data.toString()));
					extHostProcess.stderr.on('data', (data: Buffer) => processOutput(data.toString()));
					extHostProcess.on('error', (error: Error) => processError(`remoteExtensionHostAgent failed with error:\n${error.message}`));
					extHostProcess.on('close', (code: number) => processError(`remoteExtensionHostAgent closed unexpectedly.\nError code: ${code}`));

					function processOutput(output: string) {
						outputChannel.append(output);
						for (let i = 0; i < output.length; i++) {
							const chr = output.charCodeAt(i);
							if (chr === CharCode.LineFeed) {
								const match = lastProgressLine.match(/Extension host agent listening on (\d+)/);
								if (match) {
									isStarted = true;
									res(new vscode.ResolvedAuthority('localhost', parseInt(match[1], 10))); // success!
								}
								lastProgressLine = '';
							} else if (chr === CharCode.Backspace) {
								lastProgressLine = lastProgressLine.substr(0, lastProgressLine.length - 1);
							} else {
								lastProgressLine += output.charAt(i);
							}
						}
					}

				});
			}
			return startPromise;
		}
	};
	vscode.workspace.registerRemoteAuthorityResolver('test', resolver);

	vscode.commands.registerCommand('vscode-testresolver.newWindow', () => {
		return vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: 'test+test' });
	});
	vscode.commands.registerCommand('vscode-testresolver.newWindowWithError', () => {
		return vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: 'test+error' });
	});
	vscode.commands.registerCommand('vscode-testresolver.showLog', () => {
		if (outputChannel) {
			outputChannel.show();
		}
	});
}
const retryAction = {
	title: 'Retry',
	execute: async () => {
		await vscode.commands.executeCommand('workbench.action.reloadWindow');
	}
};
const showLogAction = {
	title: 'Show Log',
	execute: async () => {
		await vscode.commands.executeCommand('vscode-testresolver.showLog');
	}
};
const defaultAction = {
	title: 'Abort',
	execute: async () => {
		await vscode.commands.executeCommand('vscode.newWindow', { reuseWindow: true });
	}
};


export function deactivate() {
	if (extHostProcess) {
		extHostProcess.kill();
	}
}
