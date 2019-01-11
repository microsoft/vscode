/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { workspace, WorkspaceFolder } from 'vscode';

interface ExperimentalConfig {
	experimental?: {
		custom?: {
			tags?: string[];
			attributes?: string[];
		}
	};
}

export function getCustomDataPathsInAllWorkspaces(workspaceFolders: WorkspaceFolder[] | undefined) {
	const tagPaths: string[] = [];
	const attributePaths: string[] = [];

	if (!workspaceFolders) {
		return {
			tagPaths,
			attributePaths
		};
	}

	workspaceFolders.forEach(wf => {
		const allHtmlConfig = workspace.getConfiguration(undefined, wf.uri);
		const wfHtmlConfig = allHtmlConfig.inspect<ExperimentalConfig>('html');

		if (
			wfHtmlConfig &&
			wfHtmlConfig.workspaceFolderValue &&
			wfHtmlConfig.workspaceFolderValue.experimental &&
			wfHtmlConfig.workspaceFolderValue.experimental.custom
		) {
			if (wfHtmlConfig.workspaceFolderValue.experimental.custom.tags) {
				wfHtmlConfig.workspaceFolderValue.experimental.custom.tags.forEach(t => {
					tagPaths.push(path.resolve(wf.uri.fsPath, t));
				});
			}
			if (wfHtmlConfig.workspaceFolderValue.experimental.custom.attributes) {
				wfHtmlConfig.workspaceFolderValue.experimental.custom.attributes.forEach(a => {
					attributePaths.push(path.resolve(wf.uri.fsPath, a));
				});
			}
		}
	});

	return {
		tagPaths,
		attributePaths
	};
}
