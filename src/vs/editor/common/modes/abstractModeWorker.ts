/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {computeLinks} from 'vs/editor/common/modes/linkComputer';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import {ValidationHelper} from 'vs/editor/common/worker/validationHelper';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {TPromise} from 'vs/base/common/winjs.base';
import {WorkerInplaceReplaceSupport} from 'vs/editor/common/modes/supports/inplaceReplaceSupport';

export class AbstractModeWorker {

	static filter: Modes.ISuggestionFilter = DefaultFilter;

	private _participants:Modes.IWorkerParticipant[] = [];

	public resourceService:IResourceService;
	public markerService: IMarkerService;

	public inplaceReplaceSupport: Modes.IInplaceReplaceSupport;

	private _mode:Modes.IMode;

	_validationHelper: ValidationHelper;

	constructor(mode: Modes.IMode, participants: Modes.IWorkerParticipant[], @IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService) {

		this._mode = mode;
		this._participants = participants;
		this.resourceService = resourceService;
		this.markerService = markerService;

		this._validationHelper = new ValidationHelper(
			this.resourceService,
			(changed, notChanged, dueToConfigurationChange) => this._newValidate(changed, notChanged, dueToConfigurationChange),
			(resource) => this._shouldIncludeModelInValidation(resource),
			500
		);

		this.inplaceReplaceSupport = this._createInPlaceReplaceSupport();
	}

	protected _createInPlaceReplaceSupport(): Modes.IInplaceReplaceSupport {
		return new WorkerInplaceReplaceSupport(this.resourceService);
	}

	_getMode():Modes.IMode {
		return this._mode;
	}

	_getWorkerParticipants<T extends Modes.IWorkerParticipant>(select:(p:Modes.IWorkerParticipant)=>boolean):T[] {
		return <T[]> this._participants.filter(select);
	}

	// ---- validation -----------------------------------------

	_shouldIncludeModelInValidation(resource:EditorCommon.IMirrorModel): boolean {
		return resource.getMode().getId() === this._mode.getId();
	}

	public enableValidator(): TPromise<void> {
		this._validationHelper.enable();
		return TPromise.as(null);
	}

	private _newValidate(changed:URI[], notChanged:URI[], dueToConfigurationChange:boolean): void {
		this.doValidateOnChange(changed, notChanged, dueToConfigurationChange);
	}

	public _getContextForValidationParticipants(resource:URI):any {
		return null;
	}

	public doValidateOnChange(changed:URI[], notChanged:URI[], dueToConfigurationChange:boolean): void {
		if (dueToConfigurationChange) {
			for (var i = 0; i < changed.length; i++) {
				this.doValidate(changed[i]);
			}
			for (var i = 0; i < notChanged.length; i++) {
				this.doValidate(notChanged[i]);
			}
		} else {
			for (var i = 0; i < changed.length; i++) {
				this.doValidate(changed[i]);
			}
		}
	}

	public doValidate(resource:URI): void {
		return null;
	}

	// ---- suggestion ---------------------------------------------------------------------------------------

	public suggest(resource: URI, position: EditorCommon.IPosition): TPromise<Modes.ISuggestResult[]> {

		return this.doSuggest(resource, position).then(value => {

			if (!value) {
				return;
			}
			// filter suggestions
			var accept = this.getSuggestionFilter(),
				result: Modes.ISuggestResult[] = [];

			result.push(<Modes.ISuggestResult>{
				currentWord: value.currentWord,
				suggestions: value.suggestions.filter((element) => !!accept(value.currentWord, element)),
				incomplete: value.incomplete
			});
			return result;

		}, (error) => {
			return <Modes.ISuggestResult[]>[{
				currentWord: '',
				suggestions: []
			}];
		});
	}

	public _getSuggestContext(resource:URI):TPromise<any> {
		return TPromise.as(undefined);
	}

	public doSuggest(resource:URI, position:EditorCommon.IPosition):TPromise<Modes.ISuggestResult> {

		var model = this.resourceService.get(resource),
			currentWord = model.getWordUntilPosition(position).word;

		var result:Modes.ISuggestResult = {
			currentWord: currentWord,
			suggestions: []
		};

		result.suggestions.push.apply(result.suggestions, this.suggestWords(resource, position, false));
		result.suggestions.push.apply(result.suggestions, this.suggestSnippets(resource, position));
		return TPromise.as(result);
	}

	public suggestWords(resource:URI, position:EditorCommon.IPosition, mustHaveCurrentWord:boolean):Modes.ISuggestion[] {
		var modelMirror = this.resourceService.get(resource);
		var currentWord = modelMirror.getWordUntilPosition(position).word;
		var allWords = modelMirror.getAllUniqueWords(currentWord);

		if (mustHaveCurrentWord && !currentWord) {
			return [];
		}

		return allWords.filter((word) => {
			return !(/^-?\d*\.?\d/.test(word)); // filter out numbers
		}).map((word) => {
			return <Modes.ISuggestion> {
				type: 'text',
				label: word,
				codeSnippet: word,
				noAutoAccept: true
			};
		});
	}

	public suggestSnippets(resource:URI, position:EditorCommon.IPosition):Modes.ISuggestion[] {
		return [];
	}

	public getSuggestionFilter():Modes.ISuggestionFilter {
		return AbstractModeWorker.filter;
	}

	// ---- link detection ------------------------------------------------------------------

	public computeLinks(resource:URI):TPromise<Modes.ILink[]> {
		var model = this.resourceService.get(resource),
			links = computeLinks(model);

		return TPromise.as(links);
	}

	public configure(options:any): TPromise<boolean> {
		var p = this._doConfigure(options);
		if (p) {
			return p.then(shouldRevalidate => {
				if (shouldRevalidate) {
					this._validationHelper.triggerDueToConfigurationChange();
				}
				return true;
			});
		}
	}

	/**
	 * @return true if you want to revalidate your models
	 */
	_doConfigure(options:any): TPromise<boolean> {
		return TPromise.as(true);
	}
}

