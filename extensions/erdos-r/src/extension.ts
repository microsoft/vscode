/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as erdos from 'erdos';

import { registerCommands } from './commands';
import { providePackageTasks } from './tasks';
import { setContexts } from './contexts';
import { RRuntimeManager } from './runtime-manager';
import { registerUriHandler } from './uri-handler';
import { registerFileAssociations } from './file-associations';

export const LOGGER = vscode.window.createOutputChannel('R Language Pack', { log: true });
export function activate(context: vscode.ExtensionContext) {
	const onDidChangeLogLevel = (logLevel: vscode.LogLevel) => {
		LOGGER.appendLine(vscode.l10n.t('Log level: {0}', vscode.LogLevel[logLevel]));
	};
	context.subscriptions.push(LOGGER.onDidChangeLogLevel(onDidChangeLogLevel));
	onDidChangeLogLevel(LOGGER.logLevel);

	const rRuntimeManager = new RRuntimeManager(context);
	erdos.runtime.registerLanguageRuntimeManager('r', rRuntimeManager);

	setContexts(context);

	registerCommands(context, rRuntimeManager);

	providePackageTasks(context);

	registerFileAssociations();

	registerUriHandler();
}

