/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { downloadAndUnzipVSCodeServer } from './download';

let startPromise: Thenable<vscode.ResolvedAuthority> | undefined = void 0;
let extHostProcess: cp.ChildProcess | undefined;
const enum CharCode {
	Backspace = 8,
	LineFeed = 10
}

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {

	function doResolve(_authority: string, progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<vscode.ResolvedAuthority> {
		return new Promise(async (res, rej) => {
			progress.report({ message: 'Starting Test Resolver' });
			outputChannel = vscode.window.createOutputChannel('TestResolver');

			let isStarted = false;
			async function processError(message: string) {
				outputChannel.appendLine(message);
				if (!isStarted) {
					outputChannel.show();

					const result = await vscode.window.showErrorMessage(message, { modal: true }, ...getActions());
					if (result) {
						await result.execute();
					}
					rej(vscode.RemoteAuthorityResolverError.NotAvailable(message, true));
				}
			}

			let lastProgressLine = '';
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

			if (_authority === 'test+error' || vscode.workspace.getConfiguration('testresolver').get('error') === true) {
				processError('Unable to start the Test Resolver.');
				return;
			}

			const { updateUrl, commit, quality } = getProductConfiguration();
			if (!commit) { // dev mode
				const vscodePath = path.resolve(path.join(context.extensionPath, '..', '..'));
				const nodeExec = process.platform === 'win32' ? 'node.exe' : 'node';
				const nodePath = path.join(vscodePath, '.build', 'node-remote', nodeExec);

				if (!fs.existsSync(nodePath)) {
					try {
						progress.report({ message: 'Installing node' });
						outputChannel.appendLine(`Installing node at ${nodePath}`);
						cp.execSync(`node ${path.join(vscodePath, 'node_modules/gulp/bin/gulp.js')} node-remote`);
					} catch (e) {
						processError(`Problem downloading node: ${e.message}`);

					}
				}
				outputChannel.appendLine(`Using node at ${nodePath}`);

				const env = getNewEnv();
				env['PATH'] = path.join(vscodePath, 'resources', 'server', 'bin') + path.delimiter + env['PATH']; // allow calling code-dev.sh

				outputChannel.appendLine(env['PATH'] || '');

				extHostProcess = cp.spawn(nodePath, [path.join('out', 'remoteExtensionHostAgent'), '--port=0'], { cwd: vscodePath, env });
			} else {
				const serverBin = path.resolve(os.homedir(), '.vscode-remote', 'bin');
				progress.report({ message: 'Installing VSCode Server' });
				const serverLocation = await downloadAndUnzipVSCodeServer(updateUrl, commit, quality, serverBin);
				outputChannel.appendLine(`Using server build at ${serverLocation}`);

				const commandArgs = ['--port=0', '--disable-telemetry'];

				const env = getNewEnv();
				env['PATH'] = path.join(serverLocation, 'bin') + path.delimiter + env['PATH']; // code command for the terminal

				extHostProcess = cp.spawn(path.join(serverLocation, 'server.sh'), commandArgs, { env, cwd: serverLocation });
			}
			extHostProcess.stdout.on('data', (data: Buffer) => processOutput(data.toString()));
			extHostProcess.stderr.on('data', (data: Buffer) => processOutput(data.toString()));
			extHostProcess.on('error', (error: Error) => processError(`remoteExtensionHostAgent failed with error:\n${error.message}`));
			extHostProcess.on('close', (code: number) => processError(`remoteExtensionHostAgent closed unexpectedly.\nError code: ${code}`));
		});
	}

	vscode.workspace.registerRemoteAuthorityResolver('test', {
		resolve(_authority: string): Thenable<vscode.ResolvedAuthority> {
			if (!startPromise) {
				startPromise = vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Open TestResolver Remote ([details](command:remote-testresolver.showLog))',
					cancellable: false
				}, (progress) => doResolve(_authority, progress));
			}
			return startPromise;
		}
	});

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

type ActionItem = (vscode.MessageItem & { execute: () => void; });

function getActions(): ActionItem[] {
	const actions: ActionItem[] = [];
	const isDirty = vscode.workspace.textDocuments.some(d => d.isDirty) || vscode.workspace.workspaceFile && vscode.workspace.workspaceFile.scheme === 'untitled';

	actions.push({
		title: 'Retry',
		execute: async () => {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
	if (!isDirty) {
		actions.push({
			title: 'Close Remote',
			execute: async () => {
				await vscode.commands.executeCommand('vscode.newWindow', { reuseWindow: true });
			}
		});
	}
	actions.push({
		title: 'Ignore',
		isCloseAffordance: true,
		execute: async () => {
			vscode.commands.executeCommand('vscode-testresolver.showLog'); // no need to wait
		}
	});
	return actions;
}

export interface IProductConfiguration {
	updateUrl: string;
	commit: string;
	quality: string;
}

function getProductConfiguration(): IProductConfiguration {
	const content = fs.readFileSync(path.join(vscode.env.appRoot, 'product.json')).toString();
	return JSON.parse(content) as IProductConfiguration;
}

function getNewEnv(): { [x: string]: string | undefined } {
	const env = { ...process.env };
	delete env['ELECTRON_RUN_AS_NODE'];
	return env;
}

export function deactivate() {
	if (extHostProcess) {
		extHostProcess.kill();
	}
}
