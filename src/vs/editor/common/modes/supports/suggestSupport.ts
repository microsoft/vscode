/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import {ISuggestResult, ISuggestSupport, ISuggestion, ILineContext, IMode, ISuggestionFilter} from 'vs/editor/common/modes';
import {IPosition} from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import {handleEvent, isLineToken} from 'vs/editor/common/modes/supports';

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

export interface IComposableSuggestContribution extends ISuggestContribution {
	composeSuggest(resource:URI, position:IPosition, superSuggestions:ISuggestResult[]): TPromise<ISuggestResult[]>;
}

export class ComposableSuggestSupport extends SuggestSupport {

	constructor(modeId: string, contribution: IComposableSuggestContribution) {
		super(modeId, contribution);

		this.suggest = (resource, position) => {
			return (
				contribution.suggest(resource, position)
					.then(superSuggestions => contribution.composeSuggest(resource, position, superSuggestions))
			);
		};
	}

}
