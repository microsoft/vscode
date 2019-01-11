/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { workspace, WorkspaceFolder } from 'vscode';

interface ExperimentalConfig {
	experimental?: {
		customData?: string[]
	};
}

export function getCustomDataPathsInAllWorkspaces(workspaceFolders: WorkspaceFolder[] | undefined): string[] {
	const dataPaths: string[] = [];

	if (!workspaceFolders) {
		return dataPaths;
	}

	workspaceFolders.forEach(wf => {
		const allCssConfig = workspace.getConfiguration(undefined, wf.uri);
		const wfCSSConfig = allCssConfig.inspect<ExperimentalConfig>('css');
		if (
			wfCSSConfig &&
			wfCSSConfig.workspaceFolderValue &&
			wfCSSConfig.workspaceFolderValue.experimental &&
			wfCSSConfig.workspaceFolderValue.experimental.customData
		) {

			wfCSSConfig.workspaceFolderValue.experimental.customData.forEach(p => [
				dataPaths.push(path.resolve(wf.uri.fsPath, p))
			]);
		}
	});

	return dataPaths;
}
