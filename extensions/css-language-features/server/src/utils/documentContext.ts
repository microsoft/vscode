/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentContext } from 'vscode-css-languageservice';
import { endsWith, startsWith } from '../utils/strings';
import * as url from 'url';
import { WorkspaceFolder } from 'vscode-languageserver';
import URI from 'vscode-uri';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

function getModuleNameFromPath(path: string) {
	// If a scoped module (starts with @) then get up until second instance of '/', otherwise get until first isntance of '/'
	if (path[0] === '@') {
		return path.substring(0, path.indexOf('/', path.indexOf('/') + 1));
	}
	return path.substring(0, path.indexOf('/'));
}

function resolvePathToModule(_moduleName: string, _relativeTo: string): string | undefined {
	// resolve the module relative to the document. We can't use `require` here as the code is webpacked.
	const documentFolder = dirname(URI.parse(_relativeTo).fsPath);
	const packPath = join(documentFolder, 'node_modules', _moduleName, 'package.json');
	if (existsSync(packPath)) {
		return URI.file(packPath).toString();
	}
	return undefined;
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
			// Following [css-loader](https://github.com/webpack-contrib/css-loader#url)
			// and [sass-loader's](https://github.com/webpack-contrib/sass-loader#imports)
			// convention, if an import path starts with ~ then use node module resolution
			// *unless* it starts with "~/" as this refers to the user's home directory.
			if (ref[0] === '~' && ref[1] !== '/') {
				ref = ref.substring(1);
				if (startsWith(base, 'file://')) {
					const moduleName = getModuleNameFromPath(ref);
					const modulePath = resolvePathToModule(moduleName, base);
					if (modulePath) {
						const pathWithinModule = ref.substring(moduleName.length + 1);
						return url.resolve(modulePath, pathWithinModule);
					}
				}

			}
			return url.resolve(base, ref);
		},
	};
}

