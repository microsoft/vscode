/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function registerFileAssociations(): void {
	const config = vscode.workspace.getConfiguration();
	const fileAssociations = config.get('files.associations') as Record<string, string> || {};

	if (!fileAssociations['renv.lock']) {
		fileAssociations['renv.lock'] = 'json';
		config.update('files.associations', fileAssociations, vscode.ConfigurationTarget.Global);
	}
}
