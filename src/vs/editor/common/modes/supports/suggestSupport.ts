/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IPosition} from 'vs/editor/common/editorCommon';
import {ISuggestResult, ISuggestSupport} from 'vs/editor/common/modes';
import {IFilter, matchesStrictPrefix, fuzzyContiguousFilter} from 'vs/base/common/filters';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {Registry} from 'vs/platform/platform';
import {localize} from 'vs/nls';

export class TextualSuggestSupport implements ISuggestSupport {

	/* tslint:disable */
	private static _c = Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
		type: 'object',
		properties: {
			'editor.wordBasedSuggestions': {
				'type': 'boolean',
				'description': localize('editor.wordBasedSuggestions', "Enable word based suggestions."),
				'default': true
			}
		}
	});
	/* tslint:enable */

	public get triggerCharacters(): string[] {
		return [];
	}

	public get shouldAutotriggerSuggest(): boolean {
		return true;
	}

	public get filter(): IFilter {
		return matchesStrictPrefix;
	}

	private _modeId: string;
	private _editorWorkerService: IEditorWorkerService;
	private _configurationService: IConfigurationService;

	constructor(modeId: string, editorWorkerService: IEditorWorkerService, configurationService: IConfigurationService) {
		this._modeId = modeId;
		this._editorWorkerService = editorWorkerService;
		this._configurationService = configurationService;
	}

	public suggest(resource: URI, position: IPosition, triggerCharacter?: string): TPromise<ISuggestResult[]> {
		let config = this._configurationService.getConfiguration<{ wordBasedSuggestions: boolean }>('editor');
		return (!config || config.wordBasedSuggestions)
			? this._editorWorkerService.textualSuggest(resource, position)
			: TPromise.as([]);
	}
}

export function filterSuggestions(value: ISuggestResult): ISuggestResult[] {
	if (!value) {
		return;
	}
	// filter suggestions
	var accept = fuzzyContiguousFilter,
		result: ISuggestResult[] = [];

	result.push({
		currentWord: value.currentWord,
		suggestions: value.suggestions.filter((element) => !!accept(value.currentWord, element.label)),
		incomplete: value.incomplete
	});

	return result;
}
