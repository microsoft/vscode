/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {parse} from 'vs/base/common/json';
import * as paths from 'vs/base/common/paths';
import {TPromise} from 'vs/base/common/winjs.base';
import {readFile} from 'vs/base/node/pfs';
import {IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {ISuggestion} from 'vs/editor/common/modes';
import {SnippetsRegistry} from 'vs/editor/common/modes/supports';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {CodeSnippet, ExternalSnippetType} from 'vs/editor/contrib/snippet/common/snippet';

export interface ITMSnippetsExtensionPoint {
	language: string;
	path: string;
}

export function snippetUpdated(modeId: string, filePath: string): TPromise<void> {
	return readFile(filePath).then((fileContents) => {
		var errors: string[] = [];
		var snippetsObj = parse(fileContents.toString(), errors);
		var adaptedSnippets = TMSnippetsAdaptor.adapt(snippetsObj);
		SnippetsRegistry.registerSnippets(modeId, filePath, adaptedSnippets);
	});
}

let snippetsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ITMSnippetsExtensionPoint[]>('snippets', {
	description: nls.localize('vscode.extension.contributes.snippets', 'Contributes TextMate snippets.'),
	type: 'array',
	defaultSnippets: [ { body: [{ language: '', path: '' }] }],
	items: {
		type: 'object',
		defaultSnippets: [ { body: { language: '{{id}}', path: './snippets/{{id}}.json.'} }] ,
		properties: {
			language: {
				description: nls.localize('vscode.extension.contributes.snippets-language', 'Language id for which this snippet is contributed to.'),
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
	private _modelService: IModelService;
	private _modeService: IModeService;

	constructor(
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService
	) {
		this._modelService = modelService;
		this._modeService = modeService;

		snippetsExtensionPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let tmSnippets = extensions[i].value;
				for (let j = 0; j < tmSnippets.length; j++) {
					this._withTMSnippetContribution(extensions[i].description.extensionFolderPath, tmSnippets[j], extensions[i].collector);
				}
			}
		});
	}

	private _withTMSnippetContribution(extensionFolderPath:string, snippet:ITMSnippetsExtensionPoint, collector:IExtensionMessageCollector): void {
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
		let disposable = this._modeService.onDidCreateMode((mode) => {
			if (mode.getId() !== modeId) {
				return;
			}
			this.registerDefinition(modeId, normalizedAbsolutePath);
			disposable.dispose();
		});
	}

	public registerDefinition(modeId: string, filePath: string): void {
		readFile(filePath).then((fileContents) => {
			var errors: string[] = [];
			var snippetsObj = parse(fileContents.toString(), errors);
			var adaptedSnippets = TMSnippetsAdaptor.adapt(snippetsObj);
			SnippetsRegistry.registerDefaultSnippets(modeId, adaptedSnippets);
		});
	}
}

class TMSnippetsAdaptor {

	public static adapt(snippetsObj: any): ISuggestion[]{
		var topLevelProperties = Object.keys(snippetsObj),
			result: ISuggestion[] = [];

		var processSnippet = (snippet: any, description: string) => {
			var prefix = snippet['prefix'];
			var bodyStringOrArray = snippet['body'];

			if (Array.isArray(bodyStringOrArray)) {
				bodyStringOrArray = bodyStringOrArray.join('\n');
			}

			if (typeof prefix === 'string' && typeof bodyStringOrArray === 'string') {
				var convertedSnippet = TMSnippetsAdaptor.convertSnippet(bodyStringOrArray);
				if (convertedSnippet !== null) {
					result.push({
						type: 'snippet',
						label: prefix,
						documentationLabel: snippet['description'] || description,
						codeSnippet: convertedSnippet,
						noAutoAccept: true
					});
				}
			}
		};

		topLevelProperties.forEach(topLevelProperty => {
			var scopeOrTemplate = snippetsObj[topLevelProperty];
			if (scopeOrTemplate['body'] && scopeOrTemplate['prefix']) {
				processSnippet(scopeOrTemplate, topLevelProperty);
			} else {
				var snippetNames = Object.keys(scopeOrTemplate);
				snippetNames.forEach(name => {
					processSnippet(scopeOrTemplate[name], name);
				});
			}
		});
		return result;
	}

	private static convertSnippet(textMateSnippet: string): string {
		return CodeSnippet.convertExternalSnippet(textMateSnippet, ExternalSnippetType.TextMateSnippet);
	}
}
