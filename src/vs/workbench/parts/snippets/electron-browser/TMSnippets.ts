/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { parse } from 'vs/base/common/json';
import { join } from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { readFile } from 'vs/base/node/pfs';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { ISnippetsService, ISnippet } from 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { languagesExtPoint } from 'vs/workbench/services/mode/common/workbenchModeService';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { SnippetParser, Placeholder, Variable, Text } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { EditorSnippetVariableResolver } from 'vs/editor/contrib/snippet/browser/snippetVariables';

interface ISnippetsExtensionPoint {
	language: string;
	path: string;
}

let snippetsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ISnippetsExtensionPoint[]>('snippets', [languagesExtPoint], {
	description: nls.localize('vscode.extension.contributes.snippets', 'Contributes snippets.'),
	type: 'array',
	defaultSnippets: [{ body: [{ language: '', path: '' }] }],
	items: {
		type: 'object',
		defaultSnippets: [{ body: { language: '${1:id}', path: './snippets/${2:id}.json.' } }],
		properties: {
			language: {
				description: nls.localize('vscode.extension.contributes.snippets-language', 'Language identifier for which this snippet is contributed to.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.snippets-path', 'Path of the snippets file. The path is relative to the extension folder and typically starts with \'./snippets/\'.'),
				type: 'string'
			}
		}
	}
});

export class MainProcessTextMateSnippet implements IWorkbenchContribution {

	constructor(
		@IModeService private _modeService: IModeService,
		@ISnippetsService private _snippetService: ISnippetsService
	) {
		snippetsExtensionPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let tmSnippets = extensions[i].value;
				for (let j = 0; j < tmSnippets.length; j++) {
					this._withSnippetContribution(extensions[i].description.name, extensions[i].description.extensionFolderPath, tmSnippets[j], extensions[i].collector);
				}
			}
		});
	}

	getId() {
		return 'tmSnippetExtension';
	}

	private _withSnippetContribution(extensionName: string, extensionFolderPath: string, snippet: ISnippetsExtensionPoint, collector: ExtensionMessageCollector): void {
		if (!snippet.language || (typeof snippet.language !== 'string') || !this._modeService.isRegisteredMode(snippet.language)) {
			collector.error(nls.localize('invalid.language', "Unknown language in `contributes.{0}.language`. Provided value: {1}", snippetsExtensionPoint.name, String(snippet.language)));
			return;
		}
		if (!snippet.path || (typeof snippet.path !== 'string')) {
			collector.error(nls.localize('invalid.path.0', "Expected string in `contributes.{0}.path`. Provided value: {1}", snippetsExtensionPoint.name, String(snippet.path)));
			return;
		}
		let normalizedAbsolutePath = join(extensionFolderPath, snippet.path);

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", snippetsExtensionPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		let modeId = snippet.language;
		let languageIdentifier = this._modeService.getLanguageIdentifier(modeId);
		if (languageIdentifier) {
			readAndRegisterSnippets(this._snippetService, languageIdentifier, normalizedAbsolutePath, extensionName, collector);
		}
	}
}

export function readAndRegisterSnippets(
	snippetService: ISnippetsService, languageIdentifier: LanguageIdentifier, filePath: string,
	extensionName?: string, collector?: ExtensionMessageCollector
): TPromise<void> {

	return readFile(filePath).then(fileContents => {
		let snippets = parseSnippetFile(fileContents.toString(), extensionName, collector);
		snippetService.registerSnippets(languageIdentifier.id, snippets, filePath);
	}, err => {
		if (err && err.code === 'ENOENT') {
			snippetService.registerSnippets(languageIdentifier.id, [], filePath);
		} else {
			throw err;
		}
	});
}

function parseSnippetFile(snippetFileContent: string, extensionName?: string, collector?: ExtensionMessageCollector): ISnippet[] {
	let snippetsObj = parse(snippetFileContent);
	if (!snippetsObj || typeof snippetsObj !== 'object') {
		return [];
	}

	let topLevelProperties = Object.keys(snippetsObj);
	let result: ISnippet[] = [];

	let processSnippet = (snippet: any, name: string) => {
		let prefix = snippet['prefix'];
		let body = <string | string[]>snippet['body'];

		if (Array.isArray(body)) {
			body = body.join('\n');
		}

		if (typeof prefix !== 'string' || typeof body !== 'string') {
			return;
		}

		snippet = {
			name,
			extensionName,
			prefix,
			description: snippet['description'] || name,
			codeSnippet: body
		};

		const didRewrite = _rewriteBogousVariables(snippet);
		if (didRewrite && collector) {
			collector.warn(nls.localize(
				'badVariableUse',
				"The \"{0}\"-snippet very likely confuses snippet-variables and snippet-placeholders. See https://code.visualstudio.com/docs/editor/userdefinedsnippets#_snippet-syntax for more details.",
				name
			));
		}

		result.push(snippet);
	};

	topLevelProperties.forEach(topLevelProperty => {
		let scopeOrTemplate = snippetsObj[topLevelProperty];
		if (scopeOrTemplate['body'] && scopeOrTemplate['prefix']) {
			processSnippet(scopeOrTemplate, topLevelProperty);
		} else {
			let snippetNames = Object.keys(scopeOrTemplate);
			snippetNames.forEach(name => {
				processSnippet(scopeOrTemplate[name], name);
			});
		}
	});
	return result;
}

export function _rewriteBogousVariables(snippet: ISnippet): boolean {
	const textmateSnippet = new SnippetParser().parse(snippet.codeSnippet, false);

	let placeholders = new Map<string, number>();
	let placeholderMax = 0;
	for (const placeholder of textmateSnippet.placeholders) {
		placeholderMax = Math.max(placeholderMax, placeholder.index);
	}

	let didChange = false;
	let stack = [...textmateSnippet.children];

	while (stack.length > 0) {
		let marker = stack.shift();

		if (
			marker instanceof Variable
			&& marker.children.length === 0
			&& !EditorSnippetVariableResolver.VariableNames[marker.name]
		) {
			// a 'variable' without a default value and not being one of our supported
			// variables is automatically turing into a placeholder. This is to restore
			// a bug we had before. So `${foo}` becomes `${N:foo}`
			const index = placeholders.has(marker.name) ? placeholders.get(marker.name) : ++placeholderMax;
			placeholders.set(marker.name, index);

			const synthetic = new Placeholder(index).appendChild(new Text(marker.name));
			textmateSnippet.replace(marker, [synthetic]);
			didChange = true;

		} else {
			// recurse
			stack.push(...marker.children);
		}
	}

	snippet.codeSnippet = textmateSnippet.toTextmateString();
	return didChange;
}
