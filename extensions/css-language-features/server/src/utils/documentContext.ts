/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentContext } from 'vscode-css-languageservice';
import { endsWith, startsWith } from '../utils/strings';
import { WorkspaceFolder } from 'vscode-languageserver';
import { Utils, URI } from 'vscode-uri';

function isBareModuleSpecifier(ref: string): boolean {
	// A bare module specifier doesn't start with '.', '..', '/', '~', or a protocol
	return !/^(\.\.?\/|\/|~|[a-z][a-z0-9+\-.]*:)/i.test(ref);
}

export function getDocumentContext(documentUri: string, workspaceFolders: WorkspaceFolder[]): DocumentContext {
	function getRootFolder(): string | undefined {
		for (const folder of workspaceFolders) {
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
		resolveReference: (ref: string, base = documentUri) => {
			if (ref[0] === '/') { // resolve absolute path against the current workspace folder
				const folderUri = getRootFolder();
				if (folderUri) {
					return folderUri + ref.substring(1);
				}
			}
			// For bare module specifiers (e.g., "some-module/style.css"),
			// resolve against node_modules in the workspace root as a
			// fallback, similar to how bundlers like Vite resolve imports.
			if (isBareModuleSpecifier(ref)) {
				const folderUri = getRootFolder();
				if (folderUri) {
					return Utils.resolvePath(URI.parse(folderUri), 'node_modules', ref).toString(true);
				}
			}
			const baseUri = URI.parse(base);
			const baseUriDir = baseUri.path.endsWith('/') ? baseUri : Utils.dirname(baseUri);
			return Utils.resolvePath(baseUriDir, ref).toString(true);
		},
	};
}

