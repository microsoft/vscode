/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceEnvironment, TypeScriptProjectHost, resolveCommonLanguageId, TextDocument } from '@volar/language-service';
import type * as ts from 'typescript';
import { JQUERY_PATH } from './javascriptLibs';

export function createProjectHost(
	{ uriToFileName, fileNameToUri }: NonNullable<ServiceEnvironment['typescript']>,
	readFile: (fileName: string) => string | undefined,
	getCurrentTextDocument: () => TextDocument,
	getCurrentDocumentSnapshot: () => ts.IScriptSnapshot,
	tsLocalized?: ts.MapLike<string>,
) {
	const libSnapshots = new Map<string, ts.IScriptSnapshot | undefined>();
	const compilerOptions: ts.CompilerOptions = { allowNonTsExtensions: true, allowJs: true, lib: ['lib.es2020.full.d.ts'], target: 99 satisfies ts.ScriptTarget.Latest, moduleResolution: 1 satisfies ts.ModuleResolutionKind.Classic, experimentalDecorators: false };
	const host: TypeScriptProjectHost = {
		getCompilationSettings: () => compilerOptions,
		getScriptFileNames: () => [uriToFileName(getCurrentTextDocument().uri), JQUERY_PATH],
		getCurrentDirectory: () => '',
		getProjectVersion: () => getCurrentTextDocument().uri + ',' + getCurrentTextDocument().version.toString(),
		getScriptSnapshot: fileName => {
			if (fileNameToUri(fileName) === getCurrentTextDocument().uri) {
				return getCurrentDocumentSnapshot();
			}
			else {
				let snapshot = libSnapshots.get(fileName);
				if (!snapshot) {
					const text = readFile(fileName);
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
		getLanguageId: uri => {
			if (uri === getCurrentTextDocument().uri) {
				return getCurrentTextDocument().languageId;
			}
			return resolveCommonLanguageId(uri);
		},
	};
	return host;
}
