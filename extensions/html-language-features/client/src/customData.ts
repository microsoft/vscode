/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, extensions, Uri, EventEmitter, Disposable } from 'vscode';
import { resolvePath, joinPath, uriScheme } from './requests';


export function getCustomDataSource(toDispose: Disposable[]) {
	let pathsInWorkspace = getCustomDataPathsInAllWorkspaces();
	let pathsInExtensions = getCustomDataPathsFromAllExtensions();

	const onChange = new EventEmitter<void>();

	toDispose.push(extensions.onDidChange(_ => {
		const newPathsInExtensions = getCustomDataPathsFromAllExtensions();
		if (pathsInExtensions.size !== newPathsInExtensions.size || ![...pathsInExtensions].every(path => newPathsInExtensions.has(path))) {
			pathsInExtensions = newPathsInExtensions;
			onChange.fire();
		}
	}));
	toDispose.push(workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('html.customData')) {
			pathsInWorkspace = getCustomDataPathsInAllWorkspaces();
			onChange.fire();
		}
	}));

	toDispose.push(workspace.onDidChangeTextDocument(e => {
		const path = e.document.uri.toString();
		if (pathsInExtensions.has(path) || pathsInWorkspace.has(path)) {
			onChange.fire();
		}
	}));

	return {
		get uris() {
			return [...pathsInWorkspace].concat([...pathsInExtensions]);
		},
		get onDidChange() {
			return onChange.event;
		}
	};
}


function getCustomDataPathsInAllWorkspaces(): Set<string> {
	const workspaceFolders = workspace.workspaceFolders;

	const dataPaths = new Set<string>();

	if (!workspaceFolders) {
		return dataPaths;
	}

	const collect = (paths: string[] | undefined, rootFolder: Uri) => {
		if (Array.isArray(paths)) {
			for (const path of paths) {
				if (typeof path === 'string') {
					if (!uriScheme.test(path)) {
						// only resolve file paths relative to extension
						dataPaths.add(resolvePath(rootFolder, path).toString());
					} else {
						// others schemes
						dataPaths.add(path);
					}
				}
			}
		}
	};

	for (let i = 0; i < workspaceFolders.length; i++) {
		const folderUri = workspaceFolders[i].uri;
		const allHtmlConfig = workspace.getConfiguration('html', folderUri);
		const customDataInspect = allHtmlConfig.inspect<string[]>('customData');
		if (customDataInspect) {
			collect(customDataInspect.workspaceFolderValue, folderUri);
			if (i === 0) {
				if (workspace.workspaceFile) {
					collect(customDataInspect.workspaceValue, workspace.workspaceFile);
				}
				collect(customDataInspect.globalValue, folderUri);
			}
		}

	}
	return dataPaths;
}

function getCustomDataPathsFromAllExtensions(): Set<string> {
	const dataPaths = new Set<string>();
	for (const extension of extensions.all) {
		const customData = extension.packageJSON?.contributes?.html?.customData;
		if (Array.isArray(customData)) {
			for (const rp of customData) {
				if (!uriScheme.test(rp)) {
					// no schame -> resolve relative to extension
					dataPaths.add(joinPath(extension.extensionUri, rp).toString());
				} else {
					// actual schemes
					dataPaths.add(rp);
				}

			}
		}
	}
	return dataPaths;
}
