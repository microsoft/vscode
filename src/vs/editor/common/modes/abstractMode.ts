/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter} from 'vs/base/common/eventEmitter';
import {StrictPrefix} from 'vs/editor/common/modes/modesFilters';
import {NullMode} from 'vs/editor/common/modes/nullMode';
import {handleEvent} from 'vs/editor/common/modes/supports';
import {AbstractModeWorker} from 'vs/editor/common/modes/abstractModeWorker';
import Modes = require('vs/editor/common/modes');
import EditorCommon = require('vs/editor/common/editorCommon');
import {URL} from 'vs/base/common/network';
import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {AsyncDescriptor0, AsyncDescriptor2, createAsyncDescriptor2} from 'vs/platform/instantiation/common/descriptors';

export function createWordRegExp(allowInWords:string = ''): RegExp {
	return NullMode.createWordRegExp(allowInWords);
}

export class AbstractMode<W extends AbstractModeWorker> implements Modes.IMode {

	_instantiationService:IInstantiationService;
	_threadService:IThreadService;
	private _descriptor:Modes.IModeDescriptor;

	private _workerPiecePromise:TPromise<W>;

	_options:any;

	// adapters start
	public autoValidateDelay:number;
	public occurrencesSupport:Modes.IOccurrencesSupport;
	public suggestSupport:Modes.ISuggestSupport;
	public inplaceReplaceSupport:Modes.IInplaceReplaceSupport;
	public diffSupport:Modes.IDiffSupport;
	public dirtyDiffSupport:Modes.IDirtyDiffSupport;
	public linkSupport:Modes.ILinkSupport;
	public configSupport:Modes.IConfigurationSupport;
	public commentsSupport:Modes.ICommentsSupport;
	public tokenTypeClassificationSupport:Modes.ITokenTypeClassificationSupport;
	public codeLensSupport:Modes.ICodeLensSupport;

	// adapters end

	private _eventEmitter = new EventEmitter();
	private _simplifiedMode: Modes.IMode;

	constructor(
		descriptor:Modes.IModeDescriptor,
		instantiationService: IInstantiationService,
		threadService: IThreadService
	) {
		this._instantiationService = instantiationService;
		this._threadService = threadService;
		this._descriptor = descriptor;

		this._options = null;

		this.autoValidateDelay = 500;
		this.occurrencesSupport = this;
		this.suggestSupport = this;
		this.inplaceReplaceSupport = this;
		this.diffSupport = this;
		this.dirtyDiffSupport = this;
		this.linkSupport = this;
		this.configSupport = this;
		this.commentsSupport = this;
		this.tokenTypeClassificationSupport = this;

		this._workerPiecePromise = null;
		this._simplifiedMode = null;
	}

	public getId(): string {
		return this._descriptor.id;
	}

	public creationDone(): void {
		if (this._threadService.isInMainThread) {
			// Pick a worker to do validation
			this._pickAWorkerToValidate();
		}
	}

	public toSimplifiedMode(): Modes.IMode {
		if (!this._simplifiedMode) {
			this._simplifiedMode = new SimplifiedMode(this);
		}
		return this._simplifiedMode;
	}

	private _getOrCreateWorker(): TPromise<W> {
		if (!this._workerPiecePromise) {
			var workerDescriptor: AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], W> = this._getWorkerDescriptor();
			// First, load the code of the worker (without instantiating it)
			this._workerPiecePromise = AbstractMode._loadModule(workerDescriptor.moduleName).then(() => {
				// Then, load & instantiate all the participants
				var participants = this._descriptor.workerParticipants;
				return TPromise.join<Modes.IWorkerParticipant>(participants.map((participant) => {
					return this._instantiationService.createInstance(participant);
				}));
			}).then((participants:Modes.IWorkerParticipant[]) => {
				return this._instantiationService.createInstance<Modes.IMode, Modes.IWorkerParticipant[], W>(workerDescriptor, this, participants);
			});
		}

		return this._workerPiecePromise;
	}

	private static _loadModule(moduleName:string): TPromise<any> {
		return new TPromise((c, e, p) => {
			require([moduleName], c, e);
		}, () => {
			// Cannot cancel loading code
		});
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], W> {
		return createAsyncDescriptor2('vs/editor/common/modes/nullWorker', 'NullWorker');
	}

	_worker<T>(runner:(worker:W)=>TPromise<T>): TPromise<T>;
	_worker<T>(runner:(worker:W)=>T): TPromise<T>;
	_worker<T>(runner:(worker:W)=>any): TPromise<T> {
		return this._getOrCreateWorker().then(runner);
	}

	// START mics interface implementations

	static $_pickAWorkerToValidate = OneWorkerAttr(AbstractMode, AbstractMode.prototype._pickAWorkerToValidate, ThreadAffinity.Group1);
	public _pickAWorkerToValidate(): TPromise<void> {
		return this._worker((w) => w.enableValidator());
	}

	public getFilter(): Modes.IFilter {
		return StrictPrefix;
	}

	public addSupportChangedListener(callback: (e: EditorCommon.IModeSupportChangedEvent) => void) : IDisposable {
		return this._eventEmitter.addListener2('modeSupportChanged', callback);
	}

	public registerSupport<T>(support:string, callback:(mode:Modes.IMode) => T) : IDisposable {
		var supportImpl = callback(this);
		this[support] = supportImpl;
		this._eventEmitter.emit('modeSupportChanged', _createModeSupportChangedEvent(support));

		return {
			dispose: () => {
				if (this[support] === supportImpl) {
					delete this[support];
					this._eventEmitter.emit('modeSupportChanged', _createModeSupportChangedEvent(support));
				}
			}
		};
	}

	static $suggest = OneWorkerAttr(AbstractMode, AbstractMode.prototype.suggest);
	public suggest(resource:URL, position:EditorCommon.IPosition):TPromise<Modes.ISuggestions[]> {
		return this._worker((w) => w.suggest(resource, position));
	}

	public getTriggerCharacters():string[] {
		return [];
	}

	public shouldAutotriggerSuggest(context:Modes.ILineContext, offset:number, triggeredByCharacter:string): boolean {
		return handleEvent(context, offset, (mode:Modes.IMode, context:Modes.ILineContext, offset:number) => {

			if (!mode.suggestSupport) {
				// Hit an inner mode without suggest support
				return false;
			}

			if (mode instanceof AbstractMode) {
				return (<AbstractMode<any>> mode).shouldAutotriggerSuggestImpl(context, offset, triggeredByCharacter);
			}

			return mode.suggestSupport.shouldAutotriggerSuggest(context, offset, triggeredByCharacter);
		});
	}

	public shouldAutotriggerSuggestImpl(context:Modes.ILineContext, offset:number, triggeredByCharacter:string):boolean {
		return true;
	}

	public shouldShowEmptySuggestionList():boolean {
		return true;
	}

	static $findOccurrences = OneWorkerAttr(AbstractMode, AbstractMode.prototype.findOccurrences);
	public findOccurrences(resource:URL, position:EditorCommon.IPosition, strict:boolean = false): TPromise<Modes.IOccurence[]> {
		return this._worker((w) => w.findOccurrences(resource, position, strict));
	}

	static $navigateValueSet = OneWorkerAttr(AbstractMode, AbstractMode.prototype.navigateValueSet);
	public navigateValueSet(resource:URL, position:EditorCommon.IRange, up:boolean):TPromise<Modes.IInplaceReplaceSupportResult> {
		return this._worker((w) => w.inplaceReplaceSupport.navigateValueSet(resource, position, up));
	}

	static $computeDiff = OneWorkerAttr(AbstractMode, AbstractMode.prototype.computeDiff);
	public computeDiff(original:URL, modified:URL, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.ILineChange[]> {
		return this._worker((w) => w.computeDiff(original, modified, ignoreTrimWhitespace));
	}

	static $computeDirtyDiff = OneWorkerAttr(AbstractMode, AbstractMode.prototype.computeDirtyDiff);
	public computeDirtyDiff(resource:URL, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]> {
		return this._worker((w) => w.computeDirtyDiff(resource, ignoreTrimWhitespace));
	}

	static $computeLinks = OneWorkerAttr(AbstractMode, AbstractMode.prototype.computeLinks);
	public computeLinks(resource:URL):TPromise<Modes.ILink[]> {
		return this._worker((w) => w.computeLinks(resource));
	}

	public configure(options:any): TPromise<boolean> {
		this._options = options;

		if (this._threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w.configure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(AbstractMode, AbstractMode.prototype._configureWorkers);
	private _configureWorkers(options:any): TPromise<boolean> {
		return this._worker((w) => w.configure(options));
	}

	// END

	public getWordDefinition():RegExp {
		return NullMode.DEFAULT_WORD_REGEXP;
	}

	public getCommentsConfiguration():Modes.ICommentsConfiguration {
		return null;
	}
}

class SimplifiedMode implements Modes.IMode {

	tokenizationSupport: Modes.ITokenizationSupport;
	electricCharacterSupport: Modes.IElectricCharacterSupport;
	commentsSupport: Modes.ICommentsSupport;
	characterPairSupport: Modes.ICharacterPairSupport;
	tokenTypeClassificationSupport: Modes.ITokenTypeClassificationSupport;
	onEnterSupport: Modes.IOnEnterSupport;

	private _sourceMode: Modes.IMode;
	private _eventEmitter: EventEmitter;
	private _id: string;

	constructor(sourceMode: Modes.IMode) {
		this._sourceMode = sourceMode;
		this._eventEmitter = new EventEmitter();
		this._id = 'vs.editor.modes.simplifiedMode:' + sourceMode.getId();
		this._assignSupports();

		if (this._sourceMode.addSupportChangedListener) {
			this._sourceMode.addSupportChangedListener((e) => {
				if (e.tokenizationSupport || e.electricCharacterSupport || e.commentsSupport || e.characterPairSupport || e.tokenTypeClassificationSupport || e.onEnterSupport) {
					this._assignSupports();
					let newEvent = SimplifiedMode._createModeSupportChangedEvent(e);
					this._eventEmitter.emit('modeSupportChanged', newEvent);
				}
			})
		}
	}

	public getId(): string {
		return this._id;
	}

	public toSimplifiedMode(): Modes.IMode {
		return this;
	}

	private _assignSupports(): void {
		this.tokenizationSupport = this._sourceMode.tokenizationSupport;
		this.electricCharacterSupport = this._sourceMode.electricCharacterSupport;
		this.commentsSupport = this._sourceMode.commentsSupport;
		this.characterPairSupport = this._sourceMode.characterPairSupport;
		this.tokenTypeClassificationSupport = this._sourceMode.tokenTypeClassificationSupport;
		this.onEnterSupport = this._sourceMode.onEnterSupport;
	}

	private static _createModeSupportChangedEvent(originalModeEvent:EditorCommon.IModeSupportChangedEvent): EditorCommon.IModeSupportChangedEvent {
		var event = {
			codeLensSupport: false,
			tokenizationSupport: originalModeEvent.tokenizationSupport,
			occurrencesSupport:false,
			declarationSupport:false,
			typeDeclarationSupport:false,
			navigateTypesSupport:false,
			referenceSupport:false,
			suggestSupport:false,
			parameterHintsSupport:false,
			extraInfoSupport:false,
			outlineSupport:false,
			logicalSelectionSupport:false,
			formattingSupport:false,
			inplaceReplaceSupport:false,
			diffSupport:false,
			dirtyDiffSupport:false,
			emitOutputSupport:false,
			linkSupport:false,
			configSupport:false,
			electricCharacterSupport: originalModeEvent.electricCharacterSupport,
			commentsSupport: originalModeEvent.commentsSupport,
			characterPairSupport: originalModeEvent.characterPairSupport,
			tokenTypeClassificationSupport: originalModeEvent.tokenTypeClassificationSupport,
			quickFixSupport:false,
			onEnterSupport: originalModeEvent.onEnterSupport
		};
		return event;
	}
}

export var isDigit:(character:string, base:number)=>boolean = (function () {

	var _0 = '0'.charCodeAt(0),
		_1 = '1'.charCodeAt(0),
		_2 = '2'.charCodeAt(0),
		_3 = '3'.charCodeAt(0),
		_4 = '4'.charCodeAt(0),
		_5 = '5'.charCodeAt(0),
		_6 = '6'.charCodeAt(0),
		_7 = '7'.charCodeAt(0),
		_8 = '8'.charCodeAt(0),
		_9 = '9'.charCodeAt(0),
		_a = 'a'.charCodeAt(0),
		_b = 'b'.charCodeAt(0),
		_c = 'c'.charCodeAt(0),
		_d = 'd'.charCodeAt(0),
		_e = 'e'.charCodeAt(0),
		_f = 'f'.charCodeAt(0),
		_A = 'A'.charCodeAt(0),
		_B = 'B'.charCodeAt(0),
		_C = 'C'.charCodeAt(0),
		_D = 'D'.charCodeAt(0),
		_E = 'E'.charCodeAt(0),
		_F = 'F'.charCodeAt(0);

	return function isDigit(character:string, base:number):boolean {
		var c = character.charCodeAt(0);
		switch (base) {
			case 1:
				return c === _0;
			case 2:
				return c >= _0 && c <= _1;
			case 3:
				return c >= _0 && c <= _2;
			case 4:
				return c >= _0 && c <= _3;
			case 5:
				return c >= _0 && c <= _4;
			case 6:
				return c >= _0 && c <= _5;
			case 7:
				return c >= _0 && c <= _6;
			case 8:
				return c >= _0 && c <= _7;
			case 9:
				return c >= _0 && c <= _8;
			case 10:
				return c >= _0 && c <= _9;
			case 11:
				return (c >= _0 && c <= _9) || (c === _a) || (c === _A);
			case 12:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _b) || (c >= _A && c <= _B);
			case 13:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _c) || (c >= _A && c <= _C);
			case 14:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _d) || (c >= _A && c <= _D);
			case 15:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _e) || (c >= _A && c <= _E);
			default:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _f) || (c >= _A && c <= _F);
		}
	};
})();

export class FrankensteinMode extends AbstractMode<AbstractModeWorker> {
	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor, instantiationService, threadService);
	}
}

function _createModeSupportChangedEvent(...changedSupports: string[]): EditorCommon.IModeSupportChangedEvent {
	var event = {
		codeLensSupport: false,
		tokenizationSupport:false,
		occurrencesSupport:false,
		declarationSupport:false,
		typeDeclarationSupport:false,
		navigateTypesSupport:false,
		referenceSupport:false,
		suggestSupport:false,
		parameterHintsSupport:false,
		extraInfoSupport:false,
		outlineSupport:false,
		logicalSelectionSupport:false,
		formattingSupport:false,
		inplaceReplaceSupport:false,
		diffSupport:false,
		dirtyDiffSupport:false,
		emitOutputSupport:false,
		linkSupport:false,
		configSupport:false,
		electricCharacterSupport:false,
		commentsSupport:false,
		characterPairSupport:false,
		tokenTypeClassificationSupport:false,
		quickFixSupport:false,
		onEnterSupport: false
	};
	changedSupports.forEach(support => event[support] = true);
	return event;
}