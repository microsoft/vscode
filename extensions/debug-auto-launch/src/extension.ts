/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
const ON_TEXT = localize('status.text.auto.attach.on', "Auto Attach: On");
const OFF_TEXT = localize('status.text.auto.attach.off', "Auto Attach: Off");

const TOGGLE_COMMAND = 'extension.node-debug.toggleAutoAttach';

let currentState: string;
let autoAttachStarted = false;
let statusItem: vscode.StatusBarItem | undefined = undefined;

export function activate(context: vscode.ExtensionContext): void {

	context.subscriptions.push(vscode.commands.registerCommand(TOGGLE_COMMAND, toggleAutoAttach));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('debug.node.autoAttach')) {
			updateAutoAttachInStatus(context);
		}
	}));

	updateAutoAttachInStatus(context);
}

export function deactivate(): void {
}


function toggleAutoAttach(context: vscode.ExtensionContext) {

	const conf = vscode.workspace.getConfiguration('debug.node');

	let value = conf.get('autoAttach');
	if (value === 'on') {
		value = 'off';
	} else {
		value = 'on';
	}

	const info = conf.inspect('autoAttach');
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
	conf.update('autoAttach', value, target);

	updateAutoAttachInStatus(context);
}

function updateAutoAttachInStatus(context: vscode.ExtensionContext) {

	const newState = <string>vscode.workspace.getConfiguration('debug.node').get('autoAttach');

	if (newState !== currentState) {

		currentState = newState;

		if (newState === 'disabled') {

			// turn everything off
			if (statusItem) {
				statusItem.hide();
				statusItem.text = OFF_TEXT;
			}
			if (autoAttachStarted) {
				autoAttachStarted = false;
				vscode.commands.executeCommand('extension.node-debug.stopAutoAttach');
			}

		} else {	// 'on' or 'off'

			// make sure status bar item exists and is visible
			if (!statusItem) {
				statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
				statusItem.command = TOGGLE_COMMAND;
				statusItem.text = OFF_TEXT;
				statusItem.tooltip = localize('status.tooltip.auto.attach', "Automatically attach to node.js processes in debug mode");
				statusItem.show();
				context.subscriptions.push(statusItem);
			} else {
				statusItem.show();
			}

			if (newState === 'off') {
				statusItem.text = OFF_TEXT;
				if (autoAttachStarted) {
					autoAttachStarted = false;
					vscode.commands.executeCommand('extension.node-debug.stopAutoAttach');
				}

			} else if (newState === 'on') {
				statusItem.text = ON_TEXT;
				const vscode_pid = process.env['VSCODE_PID'];
				const rootPid = vscode_pid ? parseInt(vscode_pid) : 0;
				vscode.commands.executeCommand('extension.node-debug.startAutoAttach', rootPid);
				autoAttachStarted = true;
			}
		}
	}
}
