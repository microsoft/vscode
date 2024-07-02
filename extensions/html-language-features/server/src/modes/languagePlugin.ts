/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { forEachEmbeddedCode } from '@volar/language-core';
import type { LanguagePlugin } from '@volar/language-server';
import type { TypeScriptExtraServiceScript } from '@volar/typescript';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { HTMLVirtualCode } from './virtualCode';

export const htmlLanguagePlugin: LanguagePlugin<URI> = {
	getLanguageId(uri) {
		if (uri.toString().endsWith('.html')) {
			return 'html';
		}
		return undefined;
	},
	createVirtualCode(_uri, languageId, snapshot) {
		if (languageId !== 'typescript' && languageId !== 'javascript' && languageId !== 'typescriptreact' && languageId !== 'javascriptreact' && languageId !== 'json') {
			return new HTMLVirtualCode(snapshot);
		}
		return undefined;
	},
	typescript: {
		extraFileExtensions: [],
		getServiceScript(rootCode) {
			for (const code of forEachEmbeddedCode(rootCode)) {
				if (code.id === 'global_script') {
					return {
						code,
						extension: '.js',
						scriptKind: 1,
					};
				}
			}
			return undefined;
		},
		getExtraServiceScripts(fileName, rootCode) {
			const extraScripts: TypeScriptExtraServiceScript[] = [];
			for (const code of forEachEmbeddedCode(rootCode)) {
				if (code.id.startsWith('script_')) {
					const ext = code.languageId === 'typescript' ? '.ts' : '.js';
					extraScripts.push({
						fileName: `${fileName}.embedded_${code.id}${ext}`,
						code,
						extension: ext,
						scriptKind: ext === '.ts'
							? 3 satisfies ts.ScriptKind.TS
							: 1 satisfies ts.ScriptKind.JS,
					});
				}
			}
			return extraScripts;
		},
	},
};
