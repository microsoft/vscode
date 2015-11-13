/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import {OmnisharpServer} from '../omnisharpServer';
import {dnxRestoreForProject} from './commands';
import {basename} from 'path';
import * as proto from '../protocol';


export default function reportStatus(server: OmnisharpServer) {
	return vscode.Disposable.from(
		reportServerStatus(server),
		forwardOutput(server),
		reportDocumentStatus(server));
}

// --- document status

let defaultSelector: vscode.DocumentSelector = [
	'csharp', // c#-files OR
	{ pattern: '**/project.json' }, // project.json-files OR
	{ pattern: '**/*.sln' }, // any solution file OR
	{ pattern: '**/*.csproj' } // an csproj file
];

class Status {

	selector: vscode.DocumentSelector;
	text: string;
	command: string;
	color: string;

	constructor(selector: vscode.DocumentSelector) {
		this.selector = selector;
	}
}

export function reportDocumentStatus(server: OmnisharpServer): vscode.Disposable {

	let disposables: vscode.Disposable[] = [];

	let entry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
	let defaultStatus = new Status(defaultSelector);
	let projectStatus: Status;

	function render() {

		if (!vscode.window.activeTextEditor) {
			entry.hide();
			return;
		}

		let document = vscode.window.activeTextEditor.document;
		let status: Status;

		if (projectStatus && vscode.languages.match(projectStatus.selector, document)) {
			status = projectStatus;
		} else if (defaultStatus.text && vscode.languages.match(defaultStatus.selector, document)) {
			status = defaultStatus;
		}

		if (status) {
			entry.text = status.text;
			entry.command = status.command;
			entry.color = status.color;
			entry.show();
			return;
		}

		entry.hide();
	}

	disposables.push(vscode.window.onDidChangeActiveTextEditor(render));

	disposables.push(server.onServerError(err => {
		defaultStatus.text = '$(flame) Error starting OmniSharp';
		defaultStatus.command = 'o.showOutput';
		defaultStatus.color = '';
		render();
	}));

	disposables.push(server.onMultipleLaunchTargets(targets => {
		defaultStatus.text = '$(flame) Select project';
		defaultStatus.command = 'o.pickProjectAndStart';
		defaultStatus.color = 'rgb(90, 218, 90)';
		render();
	}));

	disposables.push(server.onBeforeServerStart(path => {
		defaultStatus.text = '$(flame) Starting...';
		defaultStatus.command = 'o.showOutput';
		defaultStatus.color = '';
		render();
	}));

	disposables.push(server.onServerStop(() => {
		projectStatus = undefined;
		defaultStatus.text = undefined;
	}));

	disposables.push(server.onServerStart(path => {

		defaultStatus.text = '$(flame) Runnning';
		defaultStatus.command = 'o.pickProjectAndStart';
		defaultStatus.color = '';
		render();

		function updateProjectInfo() {
			server.makeRequest<proto.WorkspaceInformationResponse>(proto.Projects).then(info => {

				let fileNames: vscode.DocumentSelector[] = [];
				let label: string;

				// show sln-file if applicable
				if (info.MSBuild.SolutionPath) {
					label = basename(info.MSBuild.SolutionPath)//workspace.getRelativePath(info.MSBuild.SolutionPath);
					fileNames.push({ pattern: info.MSBuild.SolutionPath });

					for (let project of info.MSBuild.Projects) {
						fileNames.push({ pattern: project.Path });
						for (let sourceFile of project.SourceFiles) {
							fileNames.push({ pattern: sourceFile });
						}
					}
				}

				// show dnx projects if applicable
				let count = 0;
				for (let project of info.Dnx.Projects) {
					count += 1;

					fileNames.push({ pattern: project.Path });
					for (let sourceFile of project.SourceFiles) {
						fileNames.push({ pattern: sourceFile });
					}
				}
				if (label) {
					// we already have a message from a sln-file
				} else if (count === 1) {
					label = basename(info.Dnx.Projects[0].Path)//workspace.getRelativePath(info.Dnx.Projects[0].Path);
				} else {
					label = `${count} projects`;
				}

				// set project info
				projectStatus = new Status(fileNames);
				projectStatus.text = '$(flame) ' + label;
				projectStatus.command = 'o.pickProjectAndStart';

				// default is to change project
				defaultStatus.text = '$(flame) Switch projects';
				defaultStatus.command = 'o.pickProjectAndStart';
				render();
			});
		}

		disposables.push(server.onProjectAdded(updateProjectInfo));
		disposables.push(server.onProjectChange(updateProjectInfo));
		disposables.push(server.onProjectRemoved(updateProjectInfo));
	}));

	return vscode.Disposable.from(...disposables);
}


// ---- server status

export function reportServerStatus(server: OmnisharpServer): vscode.Disposable{

	function appendLine(value: string = '') {
		server.getChannel().appendLine(value);
	}

	let d0 = server.onServerError(err => {
		appendLine('[ERROR] ' + err);
	});

	let d1 = server.onError(message => {
		if (message.FileName) {
			appendLine(`${message.FileName}(${message.Line},${message.Column})`);
		}
		appendLine(message.Text);
		appendLine();
		showMessageSoon();
	});

	let d2 = server.onMsBuildProjectDiagnostics(message => {

		function asErrorMessage(message: proto.MSBuildDiagnosticsMessage) {
			let value = `${message.FileName}(${message.StartLine},${message.StartColumn}): Error: ${message.Text}`;
			appendLine(value);
		}

		function asWarningMessage(message: proto.MSBuildDiagnosticsMessage) {
			let value = `${message.FileName}(${message.StartLine},${message.StartColumn}): Warning: ${message.Text}`;
			appendLine(value);
		}

		if (message.Errors.length > 0 || message.Warnings.length > 0) {
			appendLine(message.FileName);
			message.Errors.forEach(error => asErrorMessage);
			message.Warnings.forEach(warning => asWarningMessage);
			appendLine();
			showMessageSoon();
		}
	});

	let d3 = server.onUnresolvedDependencies(message => {

		let info = `There are unresolved dependencies from '${vscode.workspace.asRelativePath(message.FileName) }'. Please execute the restore command to continue.`;

		return vscode.window.showInformationMessage(info, 'Restore').then(value => {
			if (value) {
				dnxRestoreForProject(server, message.FileName);
			}
		});
	});

	return vscode.Disposable.from(d0, d1, d2, d3);
}

// show user message
let _messageHandle: number;
function showMessageSoon() {
	clearTimeout(_messageHandle);
	_messageHandle = setTimeout(function() {

		let message = "Some projects have trouble loading. Please review the output for more details.";
		vscode.window.showWarningMessage(message, { title: "Show Output", command: 'o.showOutput' }).then(value => {
			if (value) {
				vscode.commands.executeCommand(value.command);
			}
		});
	}, 1500);
}

// --- mirror output in channel

function forwardOutput(server: OmnisharpServer) {

	const logChannel = server.getChannel();
	const timing200Pattern = /^\[INFORMATION:OmniSharp.Middleware.LoggingMiddleware\] \/\w+: 200 \d+ms/;

	function forward(message: string) {
		// strip stuff like: /codecheck: 200 339ms
		if(!timing200Pattern.test(message)) {
			logChannel.append(message);
		}
	}

	return vscode.Disposable.from(
		server.onStdout(forward),
		server.onStderr(forward));
}

