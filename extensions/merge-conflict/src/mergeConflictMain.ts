/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MergeConflictServices from './services';

export function activate(context: vscode.ExtensionContext) {
	// Register disposables
	const services = new MergeConflictServices(context);
	services.begin();
	context.subscriptions.push(services);
}

export function deactivate() {
}

