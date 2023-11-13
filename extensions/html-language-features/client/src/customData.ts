/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, extensions, Uri, EventEmitter, Disposable } from 'vscode';
import { Runtime } from './htmlClient';
import { Utils } from 'vscode-uri';


export function getCustomDataSource(runtime: Runtime, toDispose: Disposable[]) {
	let localExtensionUris = new Set<string>();
	let externalExtensionUris = new Set<string>();
	const workspaceUris = new Set<string>();

	collectInWorkspaces(workspaceUris);
	collectInExtensions(localExtensionUris, externalExtensionUris);

	const onChange = new EventEmitter<void>();

	toDispose.push(extensions.onDidChange(_ => {
		const newLocalExtensionUris = new Set<string>();
		const newExternalExtensionUris = new Set<string>();
		collectInExtensions(newLocalExtensionUris, newExternalExtensionUris);
		if (hasChanges(newLocalExtensionUris, localExtensionUris) || hasChanges(newExternalExtensionUris, externalExtensionUris)) {
			localExtensionUris = newLocalExtensionUris;
			externalExtensionUris = newExternalExtensionUris;
			onChange.fire();
		}
	}));
	toDispose.push(workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('html.customData')) {
			workspaceUris.clear();
			collectInWorkspaces(workspaceUris);
			onChange.fire();
		}
	}));

	toDispose.push(workspace.onDidChangeTextDocument(e => {
		const path = e.document.uri.toString();
		if (externalExtensionUris.has(path) || workspaceUris.has(path)) {
			onChange.fire();
		}
	}));

	return {
		get uris() {
			return [...localExtensionUris].concat([...externalExtensionUris], [...workspaceUris]);
		},
		get onDidChange() {
			return onChange.event;
		},
		getContent(uriString: string): Thenable<string> {
			const uri = Uri.parse(uriString);
			if (localExtensionUris.has(uriString)) {
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

function hasChanges(s1: Set<string>, s2: Set<string>) {
	if (s1.size !== s2.size) {
		return true;
	}
	for (const uri of s1) {
		if (!s2.has(uri)) {
			return true;
		}
	}
	return false;
}

function isURI(uriOrPath: string) {
	return /^(?<scheme>\w[\w\d+.-]*):/.test(uriOrPath);
}


function collectInWorkspaces(workspaceUris: Set<string>): Set<string> {
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
						workspaceUris.add(Utils.resolvePath(rootFolder, uriOrPath).toString());
					} else {
						// external uri
						workspaceUris.add(uriOrPath);
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

function collectInExtensions(localExtensionUris: Set<string>, externalUris: Set<string>): void {
	for (const extension of extensions.allAcrossExtensionHosts) {
		const customData = extension.packageJSON?.contributes?.html?.customData;
		if (Array.isArray(customData)) {
			for (const uriOrPath of customData) {
				if (!isURI(uriOrPath)) {
					// relative path in an extension
					localExtensionUris.add(Uri.joinPath(extension.extensionUri, uriOrPath).toString());
				} else {
					// external uri
					externalUris.add(uriOrPath);
				}

			}
		}
	}
}
