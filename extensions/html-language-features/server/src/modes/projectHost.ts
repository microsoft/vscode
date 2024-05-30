/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from '@volar/language-service';
import { TypeScriptProjectHost } from '@volar/typescript';
import { JQUERY_PATH } from './javascriptLibs';
import { URI } from 'vscode-uri';
import * as ts from 'typescript';

export function createProjectHost(
	getCurrentTextDocument: () => [uri: URI, fileName: string, document: TextDocument, snapshot: ts.IScriptSnapshot],
	tsLocalized?: ts.MapLike<string>,
) {
	const libSnapshots = new Map<string, ts.IScriptSnapshot | undefined>();
	const compilerOptions: ts.CompilerOptions = { allowNonTsExtensions: true, allowJs: true, lib: ['lib.es2020.full.d.ts'], target: 99 satisfies ts.ScriptTarget.Latest, moduleResolution: 1 satisfies ts.ModuleResolutionKind.Classic, experimentalDecorators: false };
	const host: TypeScriptProjectHost = {
		getCompilationSettings: () => compilerOptions,
		getScriptFileNames: () => [getCurrentTextDocument()[1], JQUERY_PATH],
		getCurrentDirectory: () => '',
		getProjectVersion: () => getCurrentTextDocument()[1] + ',' + getCurrentTextDocument()[2].version,
		getScriptSnapshot: fileName => {
			const currentDocument = getCurrentTextDocument();
			if (fileName === currentDocument[1]) {
				return currentDocument[3];
			}
			else {
				let snapshot = libSnapshots.get(fileName);
				if (!snapshot) {
					const text = ts.sys.readFile(fileName);
					if (text !== undefined) {
						snapshot = {
							getText: (start, end) => text.substring(start, end),
							getLength: () => text.length,
							getChangeRange: () => undefined,
						};
					}
					libSnapshots.set(fileName, snapshot);
				}
				return snapshot;
			}
		},
		getLocalizedDiagnosticMessages: tsLocalized ? () => tsLocalized : undefined,
	};
	return host;
}
