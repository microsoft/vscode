/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { RSessionManager } from './session-manager';
import { EnvVar, RSession } from './session';

export async function registerUriHandler() {
	vscode.window.registerUriHandler({ handleUri });
}

function handleUri(uri: vscode.Uri): void {
	if (uri.path !== '/cli') {
		return;
	}

	const query = new URLSearchParams(uri.query);
	const command = query.get('command');
	if (!command) {
		return;
	}

	const commandRegex = /^(x-r-(help|run|vignette)):(.+)$/;
	if (!commandRegex.test(command)) {
		return;
	}

	const session = RSessionManager.instance.getConsoleSession();
	if (!session) {
		return;
	}

	session.openResource(command);
	vscode.commands.executeCommand('workbench.panel.erdosConsole.focus');
}

export async function prepCliEnvVars(session?: RSession): Promise<EnvVar> {
	session = session || RSessionManager.instance.getConsoleSession();
	if (!session) {
		return {};
	}

	const cliPkg = await session.packageVersion('cli', '3.6.3.9002');
	const cliSupportsHyperlinks = cliPkg?.compatible ?? false;

	if (!cliSupportsHyperlinks) {
		return { R_CLI_HYPERLINKS: 'FALSE' };
	}

	return {
		R_CLI_HYPERLINKS: 'TRUE',
		R_CLI_HYPERLINK_FILE_URL_FORMAT: 'erdos://file{path}:{line}:{column}',
		R_CLI_HYPERLINK_RUN: 'TRUE',
		R_CLI_HYPERLINK_RUN_URL_FORMAT: 'erdos://erdos.erdos-r/cli?command=x-r-run:{code}',
		R_CLI_HYPERLINK_HELP: 'TRUE',
		R_CLI_HYPERLINK_HELP_URL_FORMAT: 'erdos://erdos.erdos-r/cli?command=x-r-help:{topic}',
		R_CLI_HYPERLINK_VIGNETTE: 'TRUE',
		R_CLI_HYPERLINK_VIGNETTE_URL_FORMAT: 'erdos://erdos.erdos-r/cli?command=x-r-vignette:{vignette}'
	};
}
