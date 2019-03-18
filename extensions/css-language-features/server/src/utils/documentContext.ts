/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentContext } from 'vscode-css-languageservice';
import { endsWith, startsWith } from '../utils/strings';
import * as url from 'url';
import { WorkspaceFolder } from 'vscode-languageserver';

function getModuleNameFromPath(path: string) {
	// If a scoped module (starts with @) then get up until second instance of '/', otherwise get until first isntance of '/'
	if (path[0] === '@') {
		return path.substring(0, path.indexOf('/', path.indexOf('/') + 1));
	}
	return path.substring(0, path.indexOf('/'));
}

export function getDocumentContext(documentUri: string, workspaceFolders: WorkspaceFolder[]): DocumentContext {
	function getRootFolder(): string | undefined {
		for (let folder of workspaceFolders) {
			let folderURI = folder.uri;
			if (!endsWith(folderURI, '/')) {
				folderURI = folderURI + '/';
			}
			if (startsWith(documentUri, folderURI)) {
				return folderURI;
			}
		}
		return undefined;
	}

	return {
		resolveReference: (ref, base = documentUri) => {
			if (ref[0] === '/') { // resolve absolute path against the current workspace folder
				if (startsWith(base, 'file://')) {
					let folderUri = getRootFolder();
					if (folderUri) {
						return folderUri + ref.substr(1);
					}
				}
			}
			if (ref[0] === '~' && ref[1] !== '/') {
				const moduleName = getModuleNameFromPath(ref.substring(1));
				const modulePath = require.resolve(moduleName, { paths: [base] });
				const pathInModule = ref.substring(moduleName.length + 2);
				return url.resolve(modulePath, pathInModule);
			}
			return url.resolve(base, ref);
		},
	};
}

