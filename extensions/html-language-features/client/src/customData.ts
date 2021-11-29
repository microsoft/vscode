/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, extensions, Uri, EventEmitter, Disposable } from 'vscode';
import { Runtime } from './htmlClient';
import { Utils } from 'vscode-uri';


export function getCustomDataSource(runtime: Runtime, toDispose: Disposable[]) {
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
		},
		getContent(uriString: string): Thenable<string> {
			const uri = Uri.parse(uriString);
			if (pathsInExtensions.has(uriString)) {
				return workspace.fs.readFile(uri).then(buffer => {
					return new runtime.TextDecoder().decode(buffer);
				});
			}
			return workspace.openTextDocument(uri).then(doc => {
				return doc.getText();
			});
		}
	};
}

function isURI(uriOrPath: string) {
	return /^(?<scheme>\w[\w\d+.-]*):/.test(uriOrPath);
}


function getCustomDataPathsInAllWorkspaces(): Set<string> {
	const workspaceFolders = workspace.workspaceFolders;

	const dataPaths = new Set<string>();

	if (!workspaceFolders) {
		return dataPaths;
	}

	const collect = (uriOrPaths: string[] | undefined, rootFolder: Uri) => {
		if (Array.isArray(uriOrPaths)) {
			for (const uriOrPath of uriOrPaths) {
				if (typeof uriOrPath === 'string') {
					if (!isURI(uriOrPath)) {
						// path in the workspace
						dataPaths.add(Utils.resolvePath(rootFolder, uriOrPath).toString());
					} else {
						// external uri
						dataPaths.add(uriOrPath);
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
			for (const uriOrPath of customData) {
				if (!isURI(uriOrPath)) {
					// relative path in an extension
					dataPaths.add(Uri.joinPath(extension.extensionUri, uriOrPath).toString());
				} else {
					// external uri
					dataPaths.add(uriOrPath);
				}

			}
		}
	}
	return dataPaths;
}
