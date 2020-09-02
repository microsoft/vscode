/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/// <reference path='../../../src/vscode-dts/vscode.d.ts'/>

import * as cp from 'child_process';
import { GitpodExtensionContext, registerTasks, setupGitpodContext, registerIpcHookCli } from 'gitpod-shared';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';

let gitpodContext: GitpodExtensionContext | undefined;
export async function activate(context: vscode.ExtensionContext) {
	gitpodContext = await setupGitpodContext(context);
	if (!gitpodContext) {
		return;
	}

	if (vscode.extensions.getExtension('gitpod.gitpod')) {
		try {
			await util.promisify(cp.exec)('code --uninstall-extension gitpod.gitpod');
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		} catch (e) {
			gitpodContext.logger.error('failed to uninstall gitpod.gitpod:', e);
		}
		return;
	}
	if (openWorkspaceLocation(gitpodContext)) {
		return;
	}

	registerTasks(gitpodContext);
	installInitialExtensions(gitpodContext);
	registerHearbeat(gitpodContext);

	registerCLI(gitpodContext);
	// configure task terminals if Gitpod Code Server is running
	if (process.env.GITPOD_THEIA_PORT) {
		registerIpcHookCli(gitpodContext);
	}

	// For port tunneling we rely on Remote SSH capabilities
	// and gitpod.gitpod to disable auto tunneling from the current local machine.
	vscode.commands.executeCommand('gitpod.api.autoTunnel', gitpodContext.info.getGitpodHost(), gitpodContext.info.getInstanceId(), false);

	// For collecting logs, will be called by gitpod-desktop extension;
	context.subscriptions.push(vscode.commands.registerCommand('__gitpod.getGitpodRemoteLogsUri', () => {
		return context.logUri;
	}));

	// TODO
	// - auth?
	// - .gitpod.yml validations
	// - add to .gitpod.yml command
	// - cli integration
	//   - git credential helper
	await gitpodContext.active;
}

export function deactivate() {
	if (!gitpodContext) {
		return;
	}
	return gitpodContext.dispose();
}

/**
 * configure CLI in regular terminals
 */
export function registerCLI(context: GitpodExtensionContext): void {
	context.environmentVariableCollection.replace('EDITOR', 'code');
	context.environmentVariableCollection.replace('VISUAL', 'code');
	context.environmentVariableCollection.replace('GP_OPEN_EDITOR', 'code');
	context.environmentVariableCollection.replace('GIT_EDITOR', 'code --wait');
	context.environmentVariableCollection.replace('GP_PREVIEW_BROWSER', `${process.execPath} ${path.join(__dirname, 'cli.js')} --preview`);
	context.environmentVariableCollection.replace('GP_EXTERNAL_BROWSER', 'code --openExternal');

	const ipcHookCli = context.ipcHookCli;
	if (!ipcHookCli) {
		return;
	}
	context.environmentVariableCollection.replace('GITPOD_REMOTE_CLI_IPC', ipcHookCli);
}

export function openWorkspaceLocation(context: GitpodExtensionContext): boolean {
	if (vscode.workspace.workspaceFolders) {
		return false;
	}
	const workspaceUri = vscode.Uri.file(context.info.getWorkspaceLocationFile() || context.info.getWorkspaceLocationFolder());
	vscode.commands.executeCommand('vscode.openFolder', workspaceUri, { forceReuseWindow: true });
	return true;
}

export async function installInitialExtensions(context: GitpodExtensionContext): Promise<void> {
	context.logger.info('installing initial extensions...');
	const extensions: (vscode.Uri | string)[] = [];
	try {
		const workspaceContextUri = vscode.Uri.parse(context.info.getWorkspaceContextUrl());
		extensions.push('redhat.vscode-yaml');
		if (/github\.com/i.test(workspaceContextUri.authority)) {
			extensions.push('github.vscode-pull-request-github');
		}

		let config: { vscode?: { extensions?: string[] } } | undefined;
		try {
			const configUri = vscode.Uri.file(path.join(context.info.getCheckoutLocation(), '.gitpod.yml'));
			const buffer = await vscode.workspace.fs.readFile(configUri);
			const content = new util.TextDecoder('utf8').decode(buffer);
			const model = new context.config.GitpodPluginModel(content);
			config = model.document.toJSON();
		} catch { }
		if (config?.vscode?.extensions) {
			const extensionIdRegex = /^([^.]+\.[^@]+)(@(\d+\.\d+\.\d+(-.*)?))?$/;
			for (const extension of config.vscode.extensions) {
				let link: vscode.Uri | undefined;
				try {
					link = vscode.Uri.parse(extension.trim(), true);
					if (link.scheme !== 'http' && link.scheme !== 'https') {
						link = undefined;
					}
				} catch { }
				if (link) {
					extensions.push(link);
				} else {
					const normalizedExtension = extension.toLocaleLowerCase();
					if (extensionIdRegex.exec(normalizedExtension)) {
						extensions.push(normalizedExtension);
					}
				}
			}
		}
	} catch (e) {
		context.logger.error('failed to detect workspace context dependent extensions:', e);
		console.error('failed to detect workspace context dependent extensions:', e);
	}
	context.logger.info('initial extensions:', extensions);
	if (extensions.length) {
		let cause;
		try {
			const { stderr } = await util.promisify(cp.exec)('code ' + extensions.map(extension => '--install-extension ' + extension).join(' '));
			cause = stderr;
		} catch (e) {
			cause = e;
		}
		if (cause) {
			context.logger.error('failed to install initial extensions:', cause);
			console.error('failed to install initial extensions: ', cause);
		}
	}
	context.logger.info('initial extensions installed');
}

export function registerHearbeat(context: GitpodExtensionContext): void {
	let lastActivity = 0;
	const updateLastActivitiy = () => {
		lastActivity = new Date().getTime();
	};
	const sendHeartBeat = async (wasClosed?: true) => {
		const suffix = wasClosed ? 'was closed heartbeat' : 'heartbeat';
		if (wasClosed) {
			context.logger.trace('sending ' + suffix);
		}
		try {
			await context.gitpod.server.sendHeartBeat({ instanceId: context.info.getInstanceId(), wasClosed });
		} catch (err) {
			context.logger.error(`failed to send ${suffix}:`, err);
			console.error(`failed to send ${suffix}`, err);
		}
	};
	sendHeartBeat();
	if (!context.devMode) {
		context.pendingWillCloseSocket.push(() => sendHeartBeat(true));
	}

	const activityInterval = 10000;
	const heartBeatHandle = setInterval(() => {
		if (lastActivity + activityInterval < new Date().getTime()) {
			// no activity, no heartbeat
			return;
		}
		sendHeartBeat();
	}, activityInterval);
	context.subscriptions.push(
		{
			dispose: () => {
				clearInterval(heartBeatHandle);
			}
		},
		vscode.window.onDidChangeActiveTextEditor(updateLastActivitiy),
		vscode.window.onDidChangeVisibleTextEditors(updateLastActivitiy),
		vscode.window.onDidChangeTextEditorSelection(updateLastActivitiy),
		vscode.window.onDidChangeTextEditorVisibleRanges(updateLastActivitiy),
		vscode.window.onDidChangeTextEditorOptions(updateLastActivitiy),
		vscode.window.onDidChangeTextEditorViewColumn(updateLastActivitiy),
		vscode.window.onDidChangeActiveTerminal(updateLastActivitiy),
		vscode.window.onDidOpenTerminal(updateLastActivitiy),
		vscode.window.onDidCloseTerminal(updateLastActivitiy),
		vscode.window.onDidChangeTerminalState(updateLastActivitiy),
		vscode.window.onDidChangeWindowState(updateLastActivitiy),
		vscode.window.onDidChangeActiveColorTheme(updateLastActivitiy),
		vscode.authentication.onDidChangeSessions(updateLastActivitiy),
		vscode.debug.onDidChangeActiveDebugSession(updateLastActivitiy),
		vscode.debug.onDidStartDebugSession(updateLastActivitiy),
		vscode.debug.onDidReceiveDebugSessionCustomEvent(updateLastActivitiy),
		vscode.debug.onDidTerminateDebugSession(updateLastActivitiy),
		vscode.debug.onDidChangeBreakpoints(updateLastActivitiy),
		vscode.extensions.onDidChange(updateLastActivitiy),
		vscode.languages.onDidChangeDiagnostics(updateLastActivitiy),
		vscode.tasks.onDidStartTask(updateLastActivitiy),
		vscode.tasks.onDidStartTaskProcess(updateLastActivitiy),
		vscode.tasks.onDidEndTask(updateLastActivitiy),
		vscode.tasks.onDidEndTaskProcess(updateLastActivitiy),
		vscode.workspace.onDidChangeWorkspaceFolders(updateLastActivitiy),
		vscode.workspace.onDidOpenTextDocument(updateLastActivitiy),
		vscode.workspace.onDidCloseTextDocument(updateLastActivitiy),
		vscode.workspace.onDidChangeTextDocument(updateLastActivitiy),
		vscode.workspace.onDidSaveTextDocument(updateLastActivitiy),
		vscode.workspace.onDidChangeNotebookDocument(updateLastActivitiy),
		vscode.workspace.onDidSaveNotebookDocument(updateLastActivitiy),
		vscode.workspace.onDidOpenNotebookDocument(updateLastActivitiy),
		vscode.workspace.onDidCloseNotebookDocument(updateLastActivitiy),
		vscode.workspace.onWillCreateFiles(updateLastActivitiy),
		vscode.workspace.onDidCreateFiles(updateLastActivitiy),
		vscode.workspace.onWillDeleteFiles(updateLastActivitiy),
		vscode.workspace.onDidDeleteFiles(updateLastActivitiy),
		vscode.workspace.onWillRenameFiles(updateLastActivitiy),
		vscode.workspace.onDidRenameFiles(updateLastActivitiy),
		vscode.workspace.onDidChangeConfiguration(updateLastActivitiy),
		vscode.languages.registerHoverProvider('*', {
			provideHover: () => {
				updateLastActivitiy();
				return null;
			}
		})
	);
}
