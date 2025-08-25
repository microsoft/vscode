/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// eslint-disable-next-line import/no-unresolved
import * as erdos from 'erdos';

import { ErdosSupervisorApi } from './erdos-supervisor';
import { KBApi } from './KernelBridgeAdapterApi';

export let API_INSTANCE: KBApi;

export function activate(context: vscode.ExtensionContext): ErdosSupervisorApi {
	const log = erdos.window.createRawLogOutputChannel('Kernel Supervisor');
	log.appendLine('Erdos Kernel Supervisor activated');

	API_INSTANCE = new KBApi(context, log);

	context.subscriptions.push(vscode.commands.registerCommand('erdos.supervisor.showKernelSupervisorLog', () => {
		log.show();
	}));

	return API_INSTANCE;
}

export function deactivate() {
	if (API_INSTANCE) {
		API_INSTANCE.dispose();
	}
}
