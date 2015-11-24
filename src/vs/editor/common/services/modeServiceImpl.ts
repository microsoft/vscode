/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IModeService, IModeLookupResult} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import Modes = require('vs/editor/common/modes');
import Supports = require ('vs/editor/common/modes/supports');
import {IPluginService} from 'vs/platform/plugins/common/plugins';
import {FrankensteinMode} from 'vs/editor/common/modes/abstractMode';
import {LanguageExtensions} from 'vs/editor/common/modes/languageExtensionPoint';
import Errors = require('vs/base/common/errors');
import MonarchTypes = require('vs/editor/common/modes/monarch/monarchTypes');
import {Remotable, IThreadService, ThreadAffinity} from 'vs/platform/thread/common/thread';
import Objects = require('vs/base/common/objects');
import MonarchDefinition = require('vs/editor/common/modes/monarch/monarchDefinition');
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {compile} from 'vs/editor/common/modes/monarch/monarchCompile';
import {Registry} from 'vs/platform/platform';
import {IEditorModesRegistry, Extensions} from 'vs/editor/common/modes/modesRegistry';
import MonarchCommonTypes = require('vs/editor/common/modes/monarch/monarchCommon');
import {OnEnterSupport, IOnEnterSupportOptions} from 'vs/editor/common/modes/supports/onEnter';
import {IDisposable, combinedDispose, empty as EmptyDisposable} from 'vs/base/common/lifecycle';

interface IModeConfigurationMap { [modeId: string]: any; }

export class ModeServiceImpl implements IModeService {
	public serviceId = IModeService;

	protected _threadService: IThreadService;
	private _pluginService: IPluginService;
	private _activationPromises: { [modeId: string]: TPromise<Modes.IMode>; };
	private _instantiatedModes: { [modeId: string]: Modes.IMode; };
	private _frankensteinModes: { [modeId: string]: FrankensteinMode; };
	private _config: IModeConfigurationMap;

	constructor(threadService:IThreadService, pluginService:IPluginService) {
		this._threadService = threadService;
		this._pluginService = pluginService;
		this._activationPromises = {};
		this._instantiatedModes = {};
		this._frankensteinModes = {};
		this._config = {};
	}

	public getConfigurationForMode(modeId:string): any {
		return this._config[modeId] || {};
	}

	public configureMode(mimetype: string, options: any): void {
		var modeId = this.getModeId(mimetype);
		if (modeId) {
			this.configureModeById(modeId, options);
		}
	}

	public configureModeById(modeId:string, options:any):void {
		var previousOptions = this._config[modeId] || {};
		var newOptions = Objects.mixin(Objects.clone(previousOptions), options);

		if (Objects.equals(previousOptions, newOptions)) {
			// This configure call is a no-op
			return;
		}

		this._config[modeId] = newOptions;

		var mode = this.getMode(modeId);
		if (mode && mode.configSupport) {
			mode.configSupport.configure(this.getConfigurationForMode(modeId));
		}
	}

	public configureAllModes(config:any): void {
		if (!config) {
			return;
		}
		var modeRegistry = <IEditorModesRegistry> Registry.as(Extensions.EditorModes);
		var modes = modeRegistry.getRegisteredModes();
		modes.forEach((modeIdentifier) => {
			var configuration = config[modeIdentifier];
			this.configureModeById(modeIdentifier, configuration);
		});
	}

	// --- instantiation

	public lookup(commaSeparatedMimetypesOrCommaSeparatedIds: string): IModeLookupResult[]{
		var r: IModeLookupResult[] = [];
		var modeIds = LanguageExtensions.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		for (var i = 0; i < modeIds.length; i++) {
			var modeId = modeIds[i];

			r.push({
				modeId: modeId,
				isInstantiated: this._instantiatedModes.hasOwnProperty(modeId)
			});
		}

		return r;
	}

	public getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): Modes.IMode {
		var modeIds = LanguageExtensions.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		var isPlainText = false;
		for (var i = 0; i < modeIds.length; i++) {
			if (this._instantiatedModes.hasOwnProperty(modeIds[i])) {
				return this._instantiatedModes[modeIds[i]];
			}
			isPlainText = isPlainText || (modeIds[i] === 'plaintext');
		}

		if (isPlainText) {
			// Try to do it synchronously
			var r: Modes.IMode = null;
			this.getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds).then((mode) => {
				r = mode;
			}).done(null, Errors.onUnexpectedError);
			return r;
		}
	}

	public getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string {
		var modeIds = LanguageExtensions.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getModeIdByLanguageName(languageName: string): string {
		var modeIds = LanguageExtensions.getModeIdsFromLanguageName(languageName);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getModeIdByFilenameOrFirstLine(filename: string, firstLine?:string): string {
		var modeIds = LanguageExtensions.getModeIdsFromFilenameOrFirstLine(filename, firstLine);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): TPromise<Modes.IMode> {
		return this._pluginService.onReady().then(() => {
			var modeId = this.getModeId(commaSeparatedMimetypesOrCommaSeparatedIds);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	public getOrCreateModeByLanguageName(languageName: string): TPromise<Modes.IMode> {
		return this._pluginService.onReady().then(() => {
			var modeId = this.getModeIdByLanguageName(languageName);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	public getOrCreateModeByFilenameOrFirstLine(filename: string, firstLine?:string): TPromise<Modes.IMode> {
		return this._pluginService.onReady().then(() => {
			var modeId = this.getModeIdByFilenameOrFirstLine(filename, firstLine);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	private _getOrCreateMode(modeId: string): TPromise<Modes.IMode> {
		if (this._instantiatedModes.hasOwnProperty(modeId)) {
			return TPromise.as(this._instantiatedModes[modeId]);
		}

		if (this._activationPromises.hasOwnProperty(modeId)) {
			return this._activationPromises[modeId];
		}
		var c, e;
		var promise = new TPromise((cc,ee,pp) => { c = cc; e = ee; });
		this._activationPromises[modeId] = promise;
		
		this._createMode(modeId).then((mode) => {
			this._instantiatedModes[modeId] = mode;
			delete this._activationPromises[modeId];
			return this._instantiatedModes[modeId];
		}).then(c, e);

		return promise;
	}

	protected _createMode(modeId:string): TPromise<Modes.IMode> {
		let activationEvent = 'onLanguage:' + modeId;

		let compatModeAsyncDescriptor = LanguageExtensions.getCompatMode(modeId);

		if (compatModeAsyncDescriptor) {
			return this._pluginService.activateByEvent(activationEvent).then((_) => {
				var modeDescriptor = this._createModeDescriptor(modeId);
				return this._threadService.createInstance(compatModeAsyncDescriptor, modeDescriptor);
			}).then((compatMode) => {
				if (compatMode.configSupport) {
					compatMode.configSupport.configure(this.getConfigurationForMode(modeId));
				}
				return compatMode;
			});
		} else {
			let frankensteinMode = this._getOrCreateFrankensteinMode(modeId);
			this._pluginService.activateByEvent(activationEvent).done(null, Errors.onUnexpectedError);
			return TPromise.as(frankensteinMode);
		}
	}

	private _getOrCreateFrankensteinMode(modeId:string): FrankensteinMode {
		if (!this._frankensteinModes.hasOwnProperty(modeId)) {
			var modeDescriptor = this._createModeDescriptor(modeId);
			this._frankensteinModes[modeId] = this._threadService.createInstance(FrankensteinMode, modeDescriptor);
		}
		return this._frankensteinModes[modeId];
	}

	private _createModeDescriptor(modeId:string): Modes.IModeDescriptor {
		var modesRegistry = <IEditorModesRegistry>Registry.as(Extensions.EditorModes);
		var workerParticipants = modesRegistry.getWorkerParticipants(modeId);
		return {
			id: modeId,
			workerParticipants: workerParticipants
		};
	}

	protected registerModeSupport<T>(modeId: string, support: string, callback: (mode: Modes.IMode) => T): IDisposable {
		var promise = this._getOrCreateMode(modeId).then(mode => {
			if (mode.registerSupport) {
				return mode.registerSupport(support, callback);
			} else {
				console.warn('Cannot register support ' + support + ' on mode ' + modeId + ' because it is not a Frankenstein mode');
				return EmptyDisposable;
			}
		});
		return {
			dispose: () => {
				promise.done(disposable => disposable.dispose(), null);
			}
		}
	}

	protected doRegisterMonarchDefinition(modeId:string, lexer: MonarchCommonTypes.ILexer): IDisposable {
		return combinedDispose(
			this.registerTokenizationSupport(modeId, (mode: Modes.IMode) => {
				return createTokenizationSupport(this, mode, lexer);
			}),

			this.registerDeclarativeCommentsSupport(modeId, MonarchDefinition.createCommentsSupport(lexer)),

			this.registerDeclarativeElectricCharacterSupport(modeId, MonarchDefinition.createBracketElectricCharacterContribution(lexer)),

			this.registerDeclarativeTokenTypeClassificationSupport(modeId, MonarchDefinition.createTokenTypeClassificationSupportContribution(lexer)),

			this.registerDeclarativeCharacterPairSupport(modeId, MonarchDefinition.createCharacterPairContribution(lexer)),

			this.registerDeclarativeOnEnterSupport(modeId, MonarchDefinition.createOnEnterSupportOptions(lexer))
		);
	}

	public registerMonarchDefinition(modeId:string, language:MonarchTypes.ILanguage): IDisposable {
		var lexer = compile(Objects.clone(language));
		return this.doRegisterMonarchDefinition(modeId, lexer);
	}

	public registerDeclarativeCharacterPairSupport(modeId: string, support: Modes.ICharacterPairContribution): IDisposable {
		return this.registerModeSupport(modeId, 'characterPairSupport', (mode) => new Supports.CharacterPairSupport(mode, support));
	}

	public registerCodeLensSupport(modeId: string, support: Modes.ICodeLensSupport): IDisposable {
		return this.registerModeSupport(modeId, 'codeLensSupport', (mode) => support);
	}

	public registerDeclarativeCommentsSupport(modeId: string, support: Supports.ICommentsSupportContribution): IDisposable {
		return this.registerModeSupport(modeId, 'commentsSupport', (mode) => new Supports.CommentsSupport(support));
	}

	public registerDeclarativeDeclarationSupport(modeId: string, contribution: Supports.IDeclarationContribution): IDisposable {
		return this.registerModeSupport(modeId, 'declarationSupport', (mode) => new Supports.DeclarationSupport(mode, contribution));
	}

	public registerDeclarativeElectricCharacterSupport(modeId: string, support: Supports.IBracketElectricCharacterContribution): IDisposable {
		return this.registerModeSupport(modeId, 'electricCharacterSupport', (mode) => new Supports.BracketElectricCharacterSupport(mode, support));
	}

	public registerExtraInfoSupport(modeId: string, support: Modes.IExtraInfoSupport): IDisposable {
		return this.registerModeSupport(modeId, 'extraInfoSupport', (mode) => support);
	}

	public registerFormattingSupport(modeId: string, support: Modes.IFormattingSupport): IDisposable {
		return this.registerModeSupport(modeId, 'formattingSupport', (mode) => support);
	}

	public registerInplaceReplaceSupport(modeId: string, support: Modes.IInplaceReplaceSupport): IDisposable {
		return this.registerModeSupport(modeId, 'inplaceReplaceSupport',(mode) => support);
	}

	public registerOccurrencesSupport(modeId: string, support: Modes.IOccurrencesSupport): IDisposable {
		return this.registerModeSupport(modeId, 'occurrencesSupport', (mode) => support);
	}

	public registerOutlineSupport(modeId: string, support: Modes.IOutlineSupport): IDisposable {
		return this.registerModeSupport(modeId, 'outlineSupport', (mode) => support);
	}

	public registerDeclarativeParameterHintsSupport(modeId: string, support: Modes.IParameterHintsContribution): IDisposable {
		return this.registerModeSupport(modeId, 'parameterHintsSupport', (mode) => new Supports.ParameterHintsSupport(mode, support));
	}

	public registerQuickFixSupport(modeId: string, support: Modes.IQuickFixSupport): IDisposable {
		return this.registerModeSupport(modeId, 'quickFixSupport', (mode) => support);
	}

	public registerDeclarativeReferenceSupport(modeId: string, contribution: Supports.IReferenceContribution): IDisposable {
		return this.registerModeSupport(modeId, 'referenceSupport', (mode) => new Supports.ReferenceSupport(mode, contribution));
	}

	public registerRenameSupport(modeId: string, support: Modes.IRenameSupport): IDisposable {
		return this.registerModeSupport(modeId, 'renameSupport', (mode) => support);
	}

	public registerDeclarativeSuggestSupport(modeId: string, declaration: Supports.ISuggestContribution): IDisposable {
		return this.registerModeSupport(modeId, 'suggestSupport', (mode) => new Supports.SuggestSupport(mode, declaration));
	}

	public registerTokenizationSupport(modeId: string, callback: (mode: Modes.IMode) => Modes.ITokenizationSupport): IDisposable {
		return this.registerModeSupport(modeId, 'tokenizationSupport', callback);
	}

	public registerDeclarativeTokenTypeClassificationSupport(modeId: string, support: Supports.ITokenTypeClassificationSupportContribution): IDisposable {
		return this.registerModeSupport(modeId, 'tokenTypeClassificationSupport', (mode) => new Supports.TokenTypeClassificationSupport(support));
	}

	public registerDeclarativeOnEnterSupport(modeId: string, opts: IOnEnterSupportOptions): IDisposable {
		return this.registerModeSupport(modeId, 'onEnterSupport', (mode) => new OnEnterSupport(modeId, opts));
	}
}

export class MainThreadModeServiceImpl extends ModeServiceImpl {
	private _modelService: IModelService;
	private _hasInitialized: boolean;

	constructor(threadService:IThreadService, pluginService:IPluginService, modelService:IModelService) {
		super(threadService, pluginService);
		this._modelService = modelService;
		this._hasInitialized = false;
	}

	private _getModeServiceWorkerHelper(): ModeServiceWorkerHelper {
		let r = this._threadService.getRemotable(ModeServiceWorkerHelper);
		if (!this._hasInitialized) {
			this._hasInitialized = true;
			let modeRegistry = <IEditorModesRegistry> Registry.as(Extensions.EditorModes);
			r.initialize(modeRegistry._getAllWorkerParticipants());
		}
		return r;
	}

	public configureModeById(modeId:string, options:any):void {
		this._getModeServiceWorkerHelper().configureModeById(modeId, options);
		super.configureModeById(modeId, options);
	}

	protected _createMode(modeId:string): TPromise<Modes.IMode> {
		// Instantiate mode also in worker
		this._getModeServiceWorkerHelper().instantiateMode(modeId);
		return super._createMode(modeId);
	}

	protected registerModeSupport<T>(modeId: string, support: string, callback: (mode: Modes.IMode) => T): IDisposable {
		// Since there is a code path that leads to Frankenstein mode instantiation, instantiate mode also in worker
		this._getModeServiceWorkerHelper().instantiateMode(modeId);
		return super.registerModeSupport(modeId, support, callback);
	}

	public registerMonarchDefinition(modeId:string, language:MonarchTypes.ILanguage): IDisposable {
		this._getModeServiceWorkerHelper().registerMonarchDefinition(modeId, language);
		var lexer = compile(Objects.clone(language));
		return combinedDispose(
			super.doRegisterMonarchDefinition(modeId, lexer),

			this.registerModeSupport(modeId, 'suggestSupport', (mode) => {
				return new Supports.ComposableSuggestSupport(mode, MonarchDefinition.createSuggestSupport(this._modelService, mode, lexer));
			})
		);
	}
}

@Remotable.WorkerContext('ModeServiceWorkerHelper', ThreadAffinity.All)
export class ModeServiceWorkerHelper {
	private _modeService:IModeService;

	constructor(@IModeService modeService:IModeService) {
		this._modeService = modeService;
	}

	public initialize(workerParticipants:Modes.IWorkerParticipantDescriptor[]): void {
		var modeRegistry = <IEditorModesRegistry> Registry.as(Extensions.EditorModes);
		modeRegistry._setWorkerParticipants(workerParticipants);
	}

	public instantiateMode(modeId:string): void {
		this._modeService.getOrCreateMode(modeId).done(null, Errors.onUnexpectedError);
	}

	public configureModeById(modeId:string, options:any):void {
		this._modeService.configureMode(modeId, options);
	}

	public registerMonarchDefinition(modeId:string, language:MonarchTypes.ILanguage): void {
		this._modeService.registerMonarchDefinition(modeId, language);
	}
}