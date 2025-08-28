/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
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
