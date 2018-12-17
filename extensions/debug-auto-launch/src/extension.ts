/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
const ON_TEXT = localize('status.text.auto.attach.on', "Auto Attach: On");
const OFF_TEXT = localize('status.text.auto.attach.off', "Auto Attach: Off");

const TOGGLE_COMMAND = 'extension.node-debug.toggleAutoAttach';
const DEBUG_SETTINGS = 'debug.node';
const AUTO_ATTACH_SETTING = 'autoAttach';

type AUTO_ATTACH_VALUES = 'disabled' | 'on' | 'off';

let currentState: AUTO_ATTACH_VALUES = 'disabled';	// on activation this feature is always disabled and
let statusItem: vscode.StatusBarItem | undefined;	// there is no status bar item
let autoAttachStarted = false;

export function activate(context: vscode.ExtensionContext): void {

	context.subscriptions.push(vscode.commands.registerCommand(TOGGLE_COMMAND, toggleAutoAttachSetting));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(DEBUG_SETTINGS + '.' + AUTO_ATTACH_SETTING)) {
			updateAutoAttach(context);
		}
	}));

	updateAutoAttach(context);
}

export function deactivate(): void {
}


function toggleAutoAttachSetting() {

	const conf = vscode.workspace.getConfiguration(DEBUG_SETTINGS);
	if (conf) {
		let value = <AUTO_ATTACH_VALUES>conf.get(AUTO_ATTACH_SETTING);
		if (value === 'on') {
			value = 'off';
		} else {
			value = 'on';
		}

		const info = conf.inspect(AUTO_ATTACH_SETTING);
		let target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global;
		if (info) {
			if (info.workspaceFolderValue) {
				target = vscode.ConfigurationTarget.WorkspaceFolder;
			} else if (info.workspaceValue) {
				target = vscode.ConfigurationTarget.Workspace;
			} else if (info.globalValue) {
				target = vscode.ConfigurationTarget.Global;
			} else if (info.defaultValue) {
				// setting not yet used: store setting in workspace
				if (vscode.workspace.workspaceFolders) {
					target = vscode.ConfigurationTarget.Workspace;
				}
			}
		}
		conf.update(AUTO_ATTACH_SETTING, value, target);
	}
}

/**
 * Updates the auto attach feature based on the user or workspace setting
 */
function updateAutoAttach(context: vscode.ExtensionContext) {

	const newState = <AUTO_ATTACH_VALUES>vscode.workspace.getConfiguration(DEBUG_SETTINGS).get(AUTO_ATTACH_SETTING);

	if (newState !== currentState) {

		if (newState === 'disabled') {

			// turn everything off
			if (statusItem) {
				statusItem.hide();
				statusItem.text = OFF_TEXT;
			}
			if (autoAttachStarted) {
				vscode.commands.executeCommand('extension.node-debug.stopAutoAttach').then(_ => {
					currentState = newState;
					autoAttachStarted = false;
				});
			}

		} else {	// 'on' or 'off'

			// make sure status bar item exists and is visible
			if (!statusItem) {
				statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
				statusItem.command = TOGGLE_COMMAND;
				statusItem.tooltip = localize('status.tooltip.auto.attach', "Automatically attach to node.js processes in debug mode");
				statusItem.show();
				context.subscriptions.push(statusItem);
			} else {
				statusItem.show();
			}

			if (newState === 'off') {
				if (autoAttachStarted) {
					vscode.commands.executeCommand('extension.node-debug.stopAutoAttach').then(_ => {
						currentState = newState;
						if (statusItem) {
							statusItem.text = OFF_TEXT;
						}
						autoAttachStarted = false;
					});
				}

			} else if (newState === 'on') {

				const vscode_pid = process.env['VSCODE_PID'];
				const rootPid = vscode_pid ? parseInt(vscode_pid) : 0;
				vscode.commands.executeCommand('extension.node-debug.startAutoAttach', rootPid).then(_ => {
					if (statusItem) {
						statusItem.text = ON_TEXT;
					}
					currentState = newState;
					autoAttachStarted = true;
				});
			}
		}
	}
}
