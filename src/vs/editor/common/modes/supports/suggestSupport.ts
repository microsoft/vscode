/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {ILineContext, IMode, ISuggestResult, ISuggestSupport, ISuggestion, ISuggestionFilter} from 'vs/editor/common/modes';
import {DefaultFilter, StrictPrefix} from 'vs/editor/common/modes/modesFilters';
import {handleEvent, isLineToken} from 'vs/editor/common/modes/supports';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IModelService} from 'vs/editor/common/services/modelService';

export interface ISuggestContribution {
	triggerCharacters: string[];
	disableAutoTrigger?: boolean;
	excludeTokens: string[];
	suggest: (resource: URI, position: IPosition) => TPromise<ISuggestResult[]>;
	getSuggestionDetails? : (resource:URI, position:IPosition, suggestion:ISuggestion) => TPromise<ISuggestion>;
}

export class SuggestSupport implements ISuggestSupport {

	private _modeId: string;
	private contribution: ISuggestContribution;

	public suggest : (resource:URI, position:IPosition) => TPromise<ISuggestResult[]>;
	public getSuggestionDetails : (resource:URI, position:IPosition, suggestion:ISuggestion) => TPromise<ISuggestion>;

	constructor(modeId: string, contribution : ISuggestContribution){
		this._modeId = modeId;
		this.contribution = contribution;
		this.suggest = (resource, position) => contribution.suggest(resource, position);

		if (typeof contribution.getSuggestionDetails === 'function') {
			this.getSuggestionDetails = (resource, position, suggestion) => contribution.getSuggestionDetails(resource, position, suggestion);
		}
	}

	shouldAutotriggerSuggest(context: ILineContext, offset: number, triggeredByCharacter: string): boolean {
		return handleEvent(context, offset, (nestedMode:IMode, context:ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				if (this.contribution.disableAutoTrigger) {
					return false;
				}
				if (!Array.isArray(this.contribution.excludeTokens)) {
					return true;
				}
				if (this.contribution.excludeTokens.length === 1 && this.contribution.excludeTokens[0] === '*') {
					return false;
				}
				return  !isLineToken(context, offset-1, this.contribution.excludeTokens, true);
			} else if (nestedMode.suggestSupport) {
				return nestedMode.suggestSupport.shouldAutotriggerSuggest(context, offset, triggeredByCharacter);
			} else {
				return false;
			}
		});
	}

	public getFilter(): ISuggestionFilter {
		return DefaultFilter;
	}

	public getTriggerCharacters(): string[] {
		return this.contribution.triggerCharacters;
	}

	public shouldShowEmptySuggestionList(): boolean	{
		return true;
	}
}

export class TextualSuggestSupport implements ISuggestSupport {

	private _modeId: string;
	private _editorWorkerService: IEditorWorkerService;

	constructor(modeId: string, editorWorkerService: IEditorWorkerService) {
		this._modeId = modeId;
		this._editorWorkerService = editorWorkerService;
	}

	public suggest(resource: URI, position: IPosition, triggerCharacter?: string): TPromise<ISuggestResult[]> {
		return this._editorWorkerService.textualSuggest(resource, position);
	}

	public getFilter(): ISuggestionFilter {
		return StrictPrefix;
	}

	public getTriggerCharacters(): string[] {
		return [];
	}

	public shouldShowEmptySuggestionList(): boolean {
		return true;
	}

	public shouldAutotriggerSuggest(context: ILineContext, offset: number, triggeredByCharacter: string): boolean {
		return handleEvent(context, offset, (nestedMode:IMode, context:ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return true;
			} else if (nestedMode.suggestSupport) {
				return nestedMode.suggestSupport.shouldAutotriggerSuggest(context, offset, triggeredByCharacter);
			} else {
				return false;
			}
		});
	}

}

export class PredefinedResultSuggestSupport extends SuggestSupport {

	constructor(modeId:string, modelService: IModelService, predefined:ISuggestion[], triggerCharacters: string[], disableAutoTrigger?: boolean) {
		super(modeId, {
			triggerCharacters: triggerCharacters,
			disableAutoTrigger: disableAutoTrigger,
			excludeTokens: [],
			suggest: (resource, position) => {
				let model = modelService.getModel(resource);
				let result = _addSuggestionsAtPosition(model, position, predefined, null);
				return TPromise.as(result);
			}
		});
	}

}

export class TextualAndPredefinedResultSuggestSupport extends SuggestSupport {

	constructor(modeId:string, modelService: IModelService, editorWorkerService: IEditorWorkerService, predefined:ISuggestion[], triggerCharacters: string[], disableAutoTrigger?: boolean) {
		super(modeId, {
			triggerCharacters: triggerCharacters,
			disableAutoTrigger: disableAutoTrigger,
			excludeTokens: [],
			suggest: (resource, position) => {
				return editorWorkerService.textualSuggest(resource, position).then((textualSuggestions) => {
					let model = modelService.getModel(resource);
					let result = _addSuggestionsAtPosition(model, position, predefined, textualSuggestions);
					return result;
				});
			}
		});
	}

}

function _addSuggestionsAtPosition(model: IModel, position:IPosition, predefined:ISuggestion[], superSuggestions:ISuggestResult[]): ISuggestResult[] {
	if (!predefined || predefined.length === 0) {
		return superSuggestions;
	}

	if (!superSuggestions) {
		superSuggestions = [];
	}

	superSuggestions.push({
		currentWord: model.getWordUntilPosition(position).word,
		suggestions: predefined.slice(0)
	});

	return superSuggestions;
}

export function filterSuggestions(value: ISuggestResult): ISuggestResult[] {
	if (!value) {
		return;
	}
	// filter suggestions
	var accept = DefaultFilter,
		result: ISuggestResult[] = [];

	result.push({
		currentWord: value.currentWord,
		suggestions: value.suggestions.filter((element) => !!accept(value.currentWord, element)),
		incomplete: value.incomplete
	});

	return result;
}
