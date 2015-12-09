/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEventEmitter} from 'vs/base/common/eventEmitter';
import URI from 'vs/base/common/uri';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {computeLinks} from 'vs/editor/common/modes/linkComputer';
import {DiffComputer} from 'vs/editor/common/diff/diffComputer';
import {DefaultFilter, and} from 'vs/editor/common/modes/modesFilters';
import {TextModel} from 'vs/editor/common/model/textModel';
import {WorkerInplaceReplaceSupport} from 'vs/editor/common/modes/supports';
import {ValidationHelper} from 'vs/editor/common/worker/validationHelper';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {TPromise} from 'vs/base/common/winjs.base';

function isIValidateParticipant(thing:any):boolean {
	return typeof (<Modes.IValidateParticipant> thing).validate === 'function';
}

function isISuggestParticipant(thing:any):boolean {
	return typeof (<Modes.ISuggestParticipant> thing).suggest === 'function' || typeof (<Modes.ISuggestParticipant> thing).filter === 'function';
}

export class AbstractModeWorker {

	static filter: Modes.ISuggestionFilter = DefaultFilter;

	private _validationParticipants:Modes.IValidateParticipant[] = [];
	private _suggestParticipants:Modes.ISuggestParticipant[] = [];
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

		// add contributed participants
		this._validationParticipants = this._getWorkerParticipants<Modes.IValidateParticipant>(p => isIValidateParticipant(p));
		this._suggestParticipants = this._getWorkerParticipants<Modes.ISuggestParticipant>(p => isISuggestParticipant(p));

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
		for (var i = 0; i < changed.length; i++) {
			this.triggerValidateParticipation(changed[i], this._getContextForValidationParticipants(changed[i]));
		}
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

	public triggerValidateParticipation(resource:URI, context:any=null):void {

		var model = this.resourceService.get(resource);
		this._validationParticipants.forEach(participant => {
			try {
				participant.validate(model, this.markerService, context);
			} catch(e) {
				/// We should install a watch dog here. If a participant fails
				/// too often we should shut the participant down.
			}
		});
	}

	public doValidate(resource:URI): void {
		return null;
	}

	// ---- suggestion ---------------------------------------------------------------------------------------

	public suggest(resource:URI, position:EditorCommon.IPosition):TPromise<Modes.ISuggestResult[]> {

		return this._getSuggestContext(resource).then((context) => {
			var promises = [ this.doSuggest(resource, position) ];
			promises.push.apply(promises, this._participantSuggests(resource, position, context));
			return TPromise.join(promises);

		}).then((values) => {
			// filter suggestions
			var accept = this.getSuggestionFilterMain(),
				result:Modes.ISuggestResult[] = [];

			for (var i = 0, len = values.length; i < len; i++) {
				var value = values[i];
				if(!value) {
					continue;
				}
				result.push(<Modes.ISuggestResult> {
					currentWord: value.currentWord,
					suggestions: value.suggestions.filter((element) => !!accept(values[i].currentWord, element)),
					incomplete: value.incomplete,
					overwriteBefore: value.overwriteBefore,
					overwriteAfter: value.overwriteAfter
				});
			}
			return result;

		}, (error) => {
			return <Modes.ISuggestResult[]> [{
				currentWord: '',
				suggestions: []
			}];
		});
	}

	public _participantSuggests(resource:URI, position:EditorCommon.IPosition, context:any):TPromise<Modes.ISuggestResult>[] {
		return this._suggestParticipants.map((participant) => {
			try {
				return participant.suggest(resource, position, context);
			} catch(e) {
				/// We should install a watch dog here. If a participant fails
				/// too often we should shut the participant down.
			}
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

	private getSuggestionFilterMain():Modes.ISuggestionFilter {
		var filter = this.getSuggestionFilter();

		// Collect Suggestion Participants
		this._suggestParticipants.forEach((participant:any) => {
			if (typeof participant.filter === 'function') {
				filter = and(filter, (<Modes.ISuggestParticipant>participant).filter);
			}
		});

		return filter;
	}

	public getSuggestionFilter():Modes.ISuggestionFilter {
		return AbstractModeWorker.filter;
	}

	// ---- occurrences ---------------------------------------------------------------

	public findOccurrences(resource:URI, position:EditorCommon.IPosition, strict?:boolean):TPromise<Modes.IOccurence[]> {

		var model = this.resourceService.get(resource),
			wordAtPosition = model.getWordAtPosition(position),
			currentWord = (wordAtPosition ? wordAtPosition.word : ''),
			result:Modes.IOccurence[] = [];

		var words = model.getAllWordsWithRange(),
			upperBound = Math.min(1000, words.length); // Limit find occurences to 1000 occurences

		for(var i = 0; i < upperBound; i++) {
			if(words[i].text === currentWord) {
				result.push({
					range: words[i].range,
					kind: 'text'
				});
			}
		}

		return TPromise.as(result);
	}

	// ---- diff --------------------------------------------------------------------------

	public computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.ILineChange[]> {
		var originalModel = this.resourceService.get(original);
		var modifiedModel = this.resourceService.get(modified);
		if (originalModel !== null && modifiedModel !== null) {
			var originalLines = originalModel.getLinesContent();
			var modifiedLines = modifiedModel.getLinesContent();
			var diffComputer = new DiffComputer(originalLines, modifiedLines, {
				shouldPostProcessCharChanges: true,
				shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
				shouldConsiderTrimWhitespaceInEmptyCase: true
			});
			return TPromise.as(diffComputer.computeDiff());
		}
		return TPromise.as(null);
	}

	// ---- dirty diff --------------------------------------------------------------------

	public computeDirtyDiff(resource:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]> {
		var model = this.resourceService.get(resource);
		var original = <string> model.getProperty('original');

		if (original && model !== null) {
			var splitText = TextModel.toRawText(original);
			var originalLines = splitText.lines;
			var modifiedLines = model.getLinesContent();
			var diffComputer = new DiffComputer(originalLines, modifiedLines, {
				shouldPostProcessCharChanges: false,
				shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
				shouldConsiderTrimWhitespaceInEmptyCase: false
			});
			return TPromise.as(diffComputer.computeDiff());
		}
		return TPromise.as([]);
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

