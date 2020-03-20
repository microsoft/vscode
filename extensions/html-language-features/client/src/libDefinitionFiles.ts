import * as path from 'path';
import { workspace, WorkspaceFolder } from 'vscode';
import * as ts from 'typescript';

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
						if (ts.sys.fileExists(definiFile))
							definiFiles.push(definiFile);
					}
				});
			}
		}
	});

	return definiFiles;
}