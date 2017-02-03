/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { parse } from 'vs/base/common/json';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import { readFile } from 'vs/base/node/pfs';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { ISnippetsRegistry, Extensions, ISnippet } from 'vs/editor/common/modes/snippetsRegistry';
import { IModeService } from 'vs/editor/common/services/modeService';
import platform = require('vs/platform/platform');
import { languagesExtPoint } from 'vs/editor/common/services/modeServiceImpl';
import { LanguageIdentifier } from 'vs/editor/common/modes';

export interface ISnippetsExtensionPoint {
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

export class MainProcessTextMateSnippet {
	private _modeService: IModeService;

	constructor( @IModeService modeService: IModeService) {
		this._modeService = modeService;

		snippetsExtensionPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let tmSnippets = extensions[i].value;
				for (let j = 0; j < tmSnippets.length; j++) {
					this._withSnippetContribution(extensions[i].description.name, extensions[i].description.extensionFolderPath, tmSnippets[j], extensions[i].collector);
				}
			}
		});
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
		let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, snippet.path));

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", snippetsExtensionPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		let modeId = snippet.language;
		let languageIdentifier = this._modeService.getLanguageIdentifier(modeId);
		if (languageIdentifier) {
			let disposable = this._modeService.onDidCreateMode(mode => {
				if (mode.getId() !== modeId) {
					return;
				}
				readAndRegisterSnippets(languageIdentifier, normalizedAbsolutePath, extensionName);
				disposable.dispose();
			});
		}
	}
}

let snippetsRegistry = <ISnippetsRegistry>platform.Registry.as(Extensions.Snippets);

export function readAndRegisterSnippets(languageIdentifier: LanguageIdentifier, filePath: string, ownerName: string): TPromise<void> {
	return readFile(filePath).then(fileContents => {
		let snippets = parseSnippetFile(fileContents.toString(), ownerName);
		snippetsRegistry.registerSnippets(languageIdentifier, snippets, filePath);
	});
}

function parseSnippetFile(snippetFileContent: string, owner: string): ISnippet[] {
	let snippetsObj = parse(snippetFileContent);
	if (!snippetsObj || typeof snippetsObj !== 'object') {
		return [];
	}

	let topLevelProperties = Object.keys(snippetsObj);
	let result: ISnippet[] = [];

	let processSnippet = (snippet: any, name: string) => {
		let prefix = snippet['prefix'];
		let bodyStringOrArray = snippet['body'];

		if (Array.isArray(bodyStringOrArray)) {
			bodyStringOrArray = bodyStringOrArray.join('\n');
		}

		if (typeof prefix === 'string' && typeof bodyStringOrArray === 'string') {
			result.push({
				name,
				owner,
				prefix,
				description: snippet['description'] || name,
				codeSnippet: bodyStringOrArray
			});
		}
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
