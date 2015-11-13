/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as proto from '../protocol';
import {OmnisharpServer} from '../omnisharpServer';
import {Disposable, ViewColumn, commands, window} from 'vscode';
import {join, dirname, basename} from 'path';
import findLaunchTargets from '../launchTargetFinder';
import {runInTerminal} from 'run-in-terminal';

const isWin = /^win/.test(process.platform);

export default function registerCommands(server: OmnisharpServer) {
	let d1 = commands.registerCommand('o.restart', () => server.restart());
	let d2 = commands.registerCommand('o.pickProjectAndStart', () => pickProjectAndStart(server));
	let d3 = commands.registerCommand('o.restore', () => dnxRestoreForAll(server));
	let d4 = commands.registerCommand('o.execute', () => dnxExecuteCommand(server));
	let d5 = commands.registerCommand('o.execute-last-command', () => dnxExecuteLastCommand(server));
	let d6 = commands.registerCommand('o.showOutput', () => server.getChannel().show(ViewColumn.Three));
	return Disposable.from(d1, d2, d3, d4, d5, d6);
}

function pickProjectAndStart(server: OmnisharpServer) {

	return findLaunchTargets().then(targets => {

		let currentPath = server.getSolutionPathOrFolder();
		if (currentPath) {
			for (let target of targets) {
				if (target.target.fsPath === currentPath) {
					target.label = `\u2713 ${target.label}`;
				}
			}
		}

		return window.showQuickPick(targets, {
			matchOnDescription: true,
			placeHolder: `Select 1 of ${targets.length} projects`
		}).then(target => {
			if (target) {
				return server.restart(target.target.fsPath);
			}
		});
	});
}

interface Command {
	label: string;
	description: string;
	execute(): Thenable<any>;
}

let lastCommand: Command;

function dnxExecuteLastCommand(server: OmnisharpServer) {
	if (lastCommand) {
		lastCommand.execute();
	} else {
		dnxExecuteCommand(server);
	}
}

function dnxExecuteCommand(server: OmnisharpServer) {

	if (!server.isRunning()) {
		return Promise.reject('OmniSharp server is not running.');
	}

	return server.makeRequest<proto.WorkspaceInformationResponse>(proto.Projects).then(info => {

		let commands: Command[] = [];

		info.Dnx.Projects.forEach(project => {
			Object.keys(project.Commands).forEach(key => {

				commands.push({
					label: `dnx ${key} - (${project.Name || basename(project.Path)})`,
					description: dirname(project.Path),
					execute() {
						lastCommand = this;

						let command = join(info.Dnx.RuntimePath, 'bin/dnx');
						let args = [key];

						// dnx-beta[1-6] needs a leading dot, like 'dnx . run'
						if (/-beta[1-6]/.test(info.Dnx.RuntimePath)) {
							args.unshift('.');
						}

						if (isWin) {
							command += '.exe';
						}

						return runInTerminal(command, args, {
							cwd: dirname(project.Path),
							env: {
								// KRE_COMPILATION_SERVER_PORT: workspace.DesignTimeHostPort
							}
						});
					}
				});
			});
		});

		return window.showQuickPick(commands).then(command => {
			if (command) {
				return command.execute();
			}
		});
	});
}

export function dnxRestoreForAll(server: OmnisharpServer) {

	if (!server.isRunning()) {
		return Promise.reject('OmniSharp server is not running.');
	}

	return server.makeRequest<proto.WorkspaceInformationResponse>(proto.Projects).then(info => {

		let commands:Command[] = [];

		info.Dnx.Projects.forEach(project => {
			commands.push({
				label: `dnu restore - (${project.Name || basename(project.Path)})`,
				description: dirname(project.Path),
				execute() {

					let command = join(info.Dnx.RuntimePath, 'bin/dnu');
					if (isWin) {
						command += '.cmd';
					}

					return runInTerminal(command, ['restore'], {
						cwd: dirname(project.Path)
					});
				}
			});
		});

		return window.showQuickPick(commands).then(command => {
			if(command) {
				return command.execute();
			}
		});
	});
}

export function dnxRestoreForProject(server: OmnisharpServer, fileName: string) {

	return server.makeRequest<proto.WorkspaceInformationResponse>(proto.Projects).then((info):Promise<any> => {
		for(let project of info.Dnx.Projects) {
			if (project.Path === fileName) {
				let command = join(info.Dnx.RuntimePath, 'bin/dnu');
				if (isWin) {
					command += '.cmd';
				}

				return runInTerminal(command, ['restore'], {
					cwd: dirname(project.Path)
				});
			}
		}

		return Promise.reject(`Failed to execute restore, try to run 'dnu restore' manually for ${fileName}.`)
	});
}