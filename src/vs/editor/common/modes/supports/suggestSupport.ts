/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IPosition} from 'vs/editor/common/editorCommon';
import {ILineContext, ISuggestResult, ISuggestSupport, ISuggestion} from 'vs/editor/common/modes';
import {IFilter, matchesStrictPrefix, fuzzyContiguousFilter} from 'vs/base/common/filters';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {Registry} from 'vs/platform/platform';
import {localize} from 'vs/nls';

export interface ISuggestContribution {
	triggerCharacters: string[];
	disableAutoTrigger?: boolean;
	suggest: (resource: URI, position: IPosition) => TPromise<ISuggestResult[]>;
	getSuggestionDetails? : (resource:URI, position:IPosition, suggestion:ISuggestion) => TPromise<ISuggestion>;
}

export class SuggestSupport implements ISuggestSupport {

	public triggerCharacters: string[];
	public getSuggestionDetails : (resource:URI, position:IPosition, suggestion:ISuggestion) => TPromise<ISuggestion>;

	private _modeId: string;
	private _contribution: ISuggestContribution;

	constructor(modeId: string, contribution : ISuggestContribution){
		this._modeId = modeId;
		this._contribution = contribution;

		this.triggerCharacters = this._contribution.triggerCharacters;

		if (typeof contribution.getSuggestionDetails === 'function') {
			this.getSuggestionDetails = (resource, position, suggestion) => contribution.getSuggestionDetails(resource, position, suggestion);
		}
	}

	public suggest(resource:URI, position:IPosition): TPromise<ISuggestResult[]> {
		return this._contribution.suggest(resource, position);
	}

	shouldAutotriggerSuggest(context: ILineContext, offset: number, triggeredByCharacter: string): boolean {
		if (this._contribution.disableAutoTrigger) {
			return false;
		}
		return true;
	}
}

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

	public triggerCharacters: string[] = [];

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

	public get filter(): IFilter {
		return matchesStrictPrefix;
	}

	public shouldAutotriggerSuggest(context: ILineContext, offset: number, triggeredByCharacter: string): boolean {
		return true;
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
