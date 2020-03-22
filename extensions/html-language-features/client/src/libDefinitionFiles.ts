/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { workspace, WorkspaceFolder } from 'vscode';
import * as fs from 'fs';

interface ExperimentalConfig {
	libDefinitionFiles?: string[];
	experimental?: {
		libDefinitionFiles?: string[];
	};
}
export function getLibDefinitionFilesInAllWorkspaces(workspaceFolders: readonly WorkspaceFolder[] | undefined): string[] {
	const definiFiles: string[] = [];

	if (!workspaceFolders) {
		return definiFiles;
	}

	workspaceFolders.forEach(wf => {
		const allHtmlConfig = workspace.getConfiguration(undefined, wf.uri);
		const wfHtmlConfig = allHtmlConfig.inspect<ExperimentalConfig>('html');

		if (wfHtmlConfig && wfHtmlConfig.workspaceFolderValue && wfHtmlConfig.workspaceFolderValue.libDefinitionFiles) {
			const files = wfHtmlConfig.workspaceFolderValue.libDefinitionFiles;
			if (Array.isArray(files)) {
				files.forEach(t => {
					if (typeof t === 'string') {
						let definiFile = path.resolve(wf.uri.fsPath, t).replace(/\\/g, '/');
						if (fs.existsSync(definiFile)) {
							definiFiles.push(definiFile);
						}
					}
				});
			}
		}
	});

	return definiFiles;
}