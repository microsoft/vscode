/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IReadOnlyModel} from 'vs/editor/common/editorCommon';
import {ISuggestResult, ISuggestSupport} from 'vs/editor/common/modes';
import {IFilter, matchesPrefix, fuzzyContiguousFilter} from 'vs/base/common/filters';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {Registry} from 'vs/platform/platform';
import {localize} from 'vs/nls';
import {CancellationToken} from 'vs/base/common/cancellation';
import {wireCancellationToken} from 'vs/base/common/async';
import {Position} from 'vs/editor/common/core/position';

export class TextualSuggestSupport implements ISuggestSupport {

	/* tslint:disable */
	private static _c = Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
		type: 'object',
		order: 5.1,
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
		return matchesPrefix;
	}

	private _editorWorkerService: IEditorWorkerService;
	private _configurationService: IConfigurationService;

	constructor(editorWorkerService: IEditorWorkerService, configurationService: IConfigurationService) {
		this._editorWorkerService = editorWorkerService;
		this._configurationService = configurationService;
	}

	public provideCompletionItems(model:IReadOnlyModel, position:Position, token:CancellationToken): ISuggestResult[] | Thenable<ISuggestResult[]> {
		let config = this._configurationService.getConfiguration<{ wordBasedSuggestions: boolean }>('editor');
		if (!config || config.wordBasedSuggestions) {
			return wireCancellationToken(token, this._editorWorkerService.textualSuggest(model.uri, position));
		}
		return <ISuggestResult[]>[];
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
