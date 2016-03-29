/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, combinedDispose, empty as EmptyDisposable} from 'vs/base/common/lifecycle'; // TODO@Alex
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import {TPromise} from 'vs/base/common/winjs.base';
import mime = require('vs/base/common/mime');
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {createAsyncDescriptor0, createAsyncDescriptor1} from 'vs/platform/instantiation/common/descriptors';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IExtensionPointUser, IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {IThreadService, Remotable, ThreadAffinity} from 'vs/platform/thread/common/thread';
import * as modes from 'vs/editor/common/modes';
import {FrankensteinMode} from 'vs/editor/common/modes/abstractMode';
import {ILegacyLanguageDefinition, ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {ILexer} from 'vs/editor/common/modes/monarch/monarchCommon';
import {compile} from 'vs/editor/common/modes/monarch/monarchCompile';
import {createRichEditSupport, createSuggestSupport} from 'vs/editor/common/modes/monarch/monarchDefinition';
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {ILanguage} from 'vs/editor/common/modes/monarch/monarchTypes';
import {DeclarationSupport, IDeclarationContribution} from 'vs/editor/common/modes/supports/declarationSupport';
import {IParameterHintsContribution, ParameterHintsSupport} from 'vs/editor/common/modes/supports/parameterHintsSupport';
import {IReferenceContribution, ReferenceSupport} from 'vs/editor/common/modes/supports/referenceSupport';
import {IRichEditConfiguration, RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {ISuggestContribution, SuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {LanguagesRegistry} from 'vs/editor/common/services/languagesRegistry';
import {ILanguageExtensionPoint, IValidLanguageExtensionPoint, IModeLookupResult, IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';

interface IModeConfigurationMap { [modeId: string]: any; }

let languagesExtPoint = ExtensionsRegistry.registerExtensionPoint<ILanguageExtensionPoint[]>('languages', {
	description: nls.localize('vscode.extension.contributes.languages', 'Contributes language declarations.'),
	type: 'array',
	defaultSnippets: [{ body: [{ id: '', aliases: [], extensions: [] }] }],
	items: {
		type: 'object',
		defaultSnippets: [{ body: { id: '', extensions: [] } }],
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.languages.id', 'ID of the language.'),
				type: 'string'
			},
			aliases: {
				description: nls.localize('vscode.extension.contributes.languages.aliases', 'Name aliases for the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			extensions: {
				description: nls.localize('vscode.extension.contributes.languages.extensions', 'File extensions associated to the language.'),
				default: ['.foo'],
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenames: {
				description: nls.localize('vscode.extension.contributes.languages.filenames', 'File names associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenamePatterns: {
				description: nls.localize('vscode.extension.contributes.languages.filenamePatterns', 'File name glob patterns associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			mimetypes: {
				description: nls.localize('vscode.extension.contributes.languages.mimetypes', 'Mime types associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			firstLine: {
				description: nls.localize('vscode.extension.contributes.languages.firstLine', 'A regular expression matching the first line of a file of the language.'),
				type: 'string'
			},
			configuration: {
				description: nls.localize('vscode.extension.contributes.languages.configuration', 'A relative path to a file containing configuration options for the language.'),
				type: 'string'
			}
		}
	}
});

function isUndefinedOrStringArray(value: string[]): boolean {
	if (typeof value === 'undefined') {
		return true;
	}
	if (!Array.isArray(value)) {
		return false;
	}
	return value.every(item => typeof item === 'string');
}

function isValidLanguageExtensionPoint(value:ILanguageExtensionPoint, collector:IExtensionMessageCollector): boolean {
	if (!value) {
		collector.error(nls.localize('invalid.empty', "Empty value for `contributes.{0}`", languagesExtPoint.name));
		return false;
	}
	if (typeof value.id !== 'string') {
		collector.error(nls.localize('require.id', "property `{0}` is mandatory and must be of type `string`", 'id'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.extensions)) {
		collector.error(nls.localize('opt.extensions', "property `{0}` can be omitted and must be of type `string[]`", 'extensions'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.filenames)) {
		collector.error(nls.localize('opt.filenames', "property `{0}` can be omitted and must be of type `string[]`", 'filenames'));
		return false;
	}
	if (typeof value.firstLine !== 'undefined' && typeof value.firstLine !== 'string') {
		collector.error(nls.localize('opt.firstLine', "property `{0}` can be omitted and must be of type `string`", 'firstLine'));
		return false;
	}
	if (typeof value.configuration !== 'undefined' && typeof value.configuration !== 'string') {
		collector.error(nls.localize('opt.configuration', "property `{0}` can be omitted and must be of type `string`", 'configuration'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.aliases)) {
		collector.error(nls.localize('opt.aliases', "property `{0}` can be omitted and must be of type `string[]`", 'aliases'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.mimetypes)) {
		collector.error(nls.localize('opt.mimetypes', "property `{0}` can be omitted and must be of type `string[]`", 'mimetypes'));
		return false;
	}
	return true;
}

export class ModeServiceImpl implements IModeService {
	public serviceId = IModeService;

	protected _threadService: IThreadService;
	protected _extensionService: IExtensionService;

	private _activationPromises: { [modeId: string]: TPromise<modes.IMode>; };
	private _instantiatedModes: { [modeId: string]: modes.IMode; };
	private _config: IModeConfigurationMap;

	private _registry: LanguagesRegistry;

	private _onDidAddModes: Emitter<string[]> = new Emitter<string[]>();
	public onDidAddModes: Event<string[]> = this._onDidAddModes.event;

	private _onDidCreateMode: Emitter<modes.IMode> = new Emitter<modes.IMode>();
	public onDidCreateMode: Event<modes.IMode> = this._onDidCreateMode.event;

	constructor(threadService:IThreadService, extensionService:IExtensionService) {
		this._threadService = threadService;
		this._extensionService = extensionService;

		this._activationPromises = {};
		this._instantiatedModes = {};
		this._config = {};

		this._registry = new LanguagesRegistry();
		this._registry.onDidAddModes((modes) => this._onDidAddModes.fire(modes));
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
		var newOptions = objects.mixin(objects.clone(previousOptions), options);

		if (objects.equals(previousOptions, newOptions)) {
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
		var modes = this._registry.getRegisteredModes();
		modes.forEach((modeIdentifier) => {
			var configuration = config[modeIdentifier];
			this.configureModeById(modeIdentifier, configuration);
		});
	}

	public isRegisteredMode(mimetypeOrModeId: string): boolean {
		return this._registry.isRegisteredMode(mimetypeOrModeId);
	}

	public isCompatMode(modeId:string): boolean {
		let compatModeData = this._registry.getCompatMode(modeId);
		return (compatModeData ? true : false);
	}

	public getRegisteredModes(): string[] {
		return this._registry.getRegisteredModes();
	}

	public getRegisteredLanguageNames(): string[] {
		return this._registry.getRegisteredLanguageNames();
	}

	public getExtensions(alias: string): string[] {
		return this._registry.getExtensions(alias);
	}

	public getMimeForMode(modeId: string): string {
		return this._registry.getMimeForMode(modeId);
	}

	public getLanguageName(modeId: string): string {
		return this._registry.getLanguageName(modeId);
	}

	public getModeIdForLanguageName(alias:string): string {
		return this._registry.getModeIdForLanguageNameLowercase(alias);
	}

	public getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string {
		var modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getConfigurationFiles(modeId: string): string[] {
		return this._registry.getConfigurationFiles(modeId);
	}

	// --- instantiation

	public lookup(commaSeparatedMimetypesOrCommaSeparatedIds: string): IModeLookupResult[]{
		var r: IModeLookupResult[] = [];
		var modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		for (var i = 0; i < modeIds.length; i++) {
			var modeId = modeIds[i];

			r.push({
				modeId: modeId,
				isInstantiated: this._instantiatedModes.hasOwnProperty(modeId)
			});
		}

		return r;
	}

	public getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): modes.IMode {
		var modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		var isPlainText = false;
		for (var i = 0; i < modeIds.length; i++) {
			if (this._instantiatedModes.hasOwnProperty(modeIds[i])) {
				return this._instantiatedModes[modeIds[i]];
			}
			isPlainText = isPlainText || (modeIds[i] === 'plaintext');
		}

		if (isPlainText) {
			// Try to do it synchronously
			var r: modes.IMode = null;
			this.getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds).then((mode) => {
				r = mode;
			}).done(null, onUnexpectedError);
			return r;
		}
	}

	public getModeIdByLanguageName(languageName: string): string {
		var modeIds = this._registry.getModeIdsFromLanguageName(languageName);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getModeIdByFilenameOrFirstLine(filename: string, firstLine?:string): string {
		var modeIds = this._registry.getModeIdsFromFilenameOrFirstLine(filename, firstLine);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public onReady(): TPromise<boolean> {
		return this._extensionService.onReady();
	}

	public getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): TPromise<modes.IMode> {
		return this.onReady().then(() => {
			var modeId = this.getModeId(commaSeparatedMimetypesOrCommaSeparatedIds);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	public getOrCreateModeByLanguageName(languageName: string): TPromise<modes.IMode> {
		return this.onReady().then(() => {
			var modeId = this.getModeIdByLanguageName(languageName);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	public getOrCreateModeByFilenameOrFirstLine(filename: string, firstLine?:string): TPromise<modes.IMode> {
		return this.onReady().then(() => {
			var modeId = this.getModeIdByFilenameOrFirstLine(filename, firstLine);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	private _getOrCreateMode(modeId: string): TPromise<modes.IMode> {
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

			this._onDidCreateMode.fire(mode);

			this._extensionService.activateByEvent(`onLanguage:${modeId}`).done(null, onUnexpectedError);

			return this._instantiatedModes[modeId];
		}).then(c, e);

		return promise;
	}

	protected _createMode(modeId:string): TPromise<modes.IMode> {
		let modeDescriptor = this._createModeDescriptor(modeId);

		let compatModeData = this._registry.getCompatMode(modeId);
		if (compatModeData) {
			// This is a compatibility mode
			let compatModeAsyncDescriptor = createAsyncDescriptor1<modes.IModeDescriptor, modes.IMode>(compatModeData.moduleId, compatModeData.ctorName);
			return this._threadService.createInstance(compatModeAsyncDescriptor, modeDescriptor).then((compatMode) => {
				if (compatMode.configSupport) {
					compatMode.configSupport.configure(this.getConfigurationForMode(modeId));
				}
				return compatMode;
			});
		}

		return TPromise.as<modes.IMode>(this._threadService.createInstance(FrankensteinMode, modeDescriptor));
	}

	private _createModeDescriptor(modeId:string): modes.IModeDescriptor {
		var workerParticipants = ModesRegistry.getWorkerParticipantsForMode(modeId);
		return {
			id: modeId,
			workerParticipants: workerParticipants.map(p => createAsyncDescriptor0(p.moduleId, p.ctorName))
		};
	}

	private _registerModeSupport<T>(mode:modes.IMode, support: string, callback: (mode: modes.IMode) => T): IDisposable {
		if (mode.registerSupport) {
			return mode.registerSupport(support, callback);
		} else {
			console.warn('Cannot register support ' + support + ' on mode ' + mode.getId() + ' because it does not support it.');
			return EmptyDisposable;
		}
	}

	protected registerModeSupport<T>(modeId: string, support: string, callback: (mode: modes.IMode) => T): IDisposable {
		if (this._instantiatedModes.hasOwnProperty(modeId)) {
			return this._registerModeSupport(this._instantiatedModes[modeId], support, callback);
		}

		let cc: (disposable:IDisposable)=>void;
		let promise = new TPromise<IDisposable>((c, e) => { cc = c; });

		let disposable = this.onDidCreateMode((mode) => {
			if (mode.getId() !== modeId) {
				return;
			}

			cc(this._registerModeSupport(mode, support, callback));
			disposable.dispose();
		});

		return {
			dispose: () => {
				promise.done(disposable => disposable.dispose(), null);
			}
		};
	}

	protected doRegisterMonarchDefinition(modeId:string, lexer: ILexer): IDisposable {
		return combinedDispose(
			this.registerTokenizationSupport(modeId, (mode: modes.IMode) => {
				return createTokenizationSupport(this, mode, lexer);
			}),

			this.registerRichEditSupport(modeId, createRichEditSupport(lexer))
		);
	}

	public registerMonarchDefinition(modelService: IModelService, editorWorkerService:IEditorWorkerService, modeId:string, language:ILanguage): IDisposable {
		var lexer = compile(objects.clone(language));
		return this.doRegisterMonarchDefinition(modeId, lexer);
	}

	public registerCodeLensSupport(modeId: string, support: modes.ICodeLensSupport): IDisposable {
		return this.registerModeSupport(modeId, 'codeLensSupport', (mode) => support);
	}

	public registerRichEditSupport(modeId: string, support: IRichEditConfiguration): IDisposable {
		return this.registerModeSupport(modeId, 'richEditSupport', (mode) => new RichEditSupport(modeId, mode.richEditSupport, support));
	}

	public registerDeclarativeDeclarationSupport(modeId: string, contribution: IDeclarationContribution): IDisposable {
		return this.registerModeSupport(modeId, 'declarationSupport', (mode) => new DeclarationSupport(modeId, contribution));
	}

	public registerExtraInfoSupport(modeId: string, support: modes.IExtraInfoSupport): IDisposable {
		return this.registerModeSupport(modeId, 'extraInfoSupport', (mode) => support);
	}

	public registerFormattingSupport(modeId: string, support: modes.IFormattingSupport): IDisposable {
		return this.registerModeSupport(modeId, 'formattingSupport', (mode) => support);
	}

	public registerInplaceReplaceSupport(modeId: string, support: modes.IInplaceReplaceSupport): IDisposable {
		return this.registerModeSupport(modeId, 'inplaceReplaceSupport',(mode) => support);
	}

	public registerOccurrencesSupport(modeId: string, support: modes.IOccurrencesSupport): IDisposable {
		return this.registerModeSupport(modeId, 'occurrencesSupport', (mode) => support);
	}

	public registerOutlineSupport(modeId: string, support: modes.IOutlineSupport): IDisposable {
		return this.registerModeSupport(modeId, 'outlineSupport', (mode) => support);
	}

	public registerDeclarativeParameterHintsSupport(modeId: string, support: IParameterHintsContribution): IDisposable {
		return this.registerModeSupport(modeId, 'parameterHintsSupport', (mode) => new ParameterHintsSupport(modeId, support));
	}

	public registerQuickFixSupport(modeId: string, support: modes.IQuickFixSupport): IDisposable {
		return this.registerModeSupport(modeId, 'quickFixSupport', (mode) => support);
	}

	public registerDeclarativeReferenceSupport(modeId: string, contribution: IReferenceContribution): IDisposable {
		return this.registerModeSupport(modeId, 'referenceSupport', (mode) => new ReferenceSupport(modeId, contribution));
	}

	public registerRenameSupport(modeId: string, support: modes.IRenameSupport): IDisposable {
		return this.registerModeSupport(modeId, 'renameSupport', (mode) => support);
	}

	public registerDeclarativeSuggestSupport(modeId: string, declaration: ISuggestContribution): IDisposable {
		return this.registerModeSupport(modeId, 'suggestSupport', (mode) => new SuggestSupport(modeId, declaration));
	}

	public registerTokenizationSupport(modeId: string, callback: (mode: modes.IMode) => modes.ITokenizationSupport): IDisposable {
		return this.registerModeSupport(modeId, 'tokenizationSupport', callback);
	}
}

export class MainThreadModeServiceImpl extends ModeServiceImpl {
	private _hasInitialized: boolean;
	private _configurationService: IConfigurationService;
	private _onReadyPromise: TPromise<boolean>;

	constructor(
		threadService:IThreadService,
		extensionService:IExtensionService,
		configurationService: IConfigurationService
	) {
		super(threadService, extensionService);
		this._configurationService = configurationService;
		this._hasInitialized = false;

		languagesExtPoint.setHandler((extensions:IExtensionPointUser<ILanguageExtensionPoint[]>[]) => {
			let allValidLanguages: IValidLanguageExtensionPoint[] = [];

			for (let i = 0, len = extensions.length; i < len; i++) {
				let extension = extensions[i];

				if (!Array.isArray(extension.value)) {
					extension.collector.error(nls.localize('invalid', "Invalid `contributes.{0}`. Expected an array.", languagesExtPoint.name));
					continue;
				}

				for (let j = 0, lenJ = extension.value.length; j < lenJ; j++) {
					let ext = extension.value[j];
					if (isValidLanguageExtensionPoint(ext, extension.collector)) {
						let configuration = (ext.configuration ? paths.join(extension.description.extensionFolderPath, ext.configuration) : ext.configuration);
						allValidLanguages.push({
							id: ext.id,
							extensions: ext.extensions,
							filenames: ext.filenames,
							filenamePatterns: ext.filenamePatterns,
							firstLine: ext.firstLine,
							aliases: ext.aliases,
							mimetypes: ext.mimetypes,
							configuration: configuration
						});
					}
				}
			}

			ModesRegistry.registerLanguages(allValidLanguages);

		});

		this._configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.onConfigurationChange(e.config));
	}

	public onReady(): TPromise<boolean> {
		if (!this._onReadyPromise) {
			this._onReadyPromise = this._configurationService.loadConfiguration().then((configuration: IFilesConfiguration) => {
				return this._extensionService.onReady().then(() => {
					this.onConfigurationChange(configuration);

					return true;
				});
			});
		}

		return this._onReadyPromise;
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {

		// Clear user configured mime associations
		mime.clearTextMimes(true /* user configured */);

		// Register based on settings
		if (configuration.files && configuration.files.associations) {
			Object.keys(configuration.files.associations).forEach(pattern => {
				mime.registerTextMime({ mime: this.getMimeForMode(configuration.files.associations[pattern]), filepattern: pattern, userConfigured: true });
			});
		}
	}

	private _getModeServiceWorkerHelper(): ModeServiceWorkerHelper {
		let r = this._threadService.getRemotable(ModeServiceWorkerHelper);
		if (!this._hasInitialized) {
			this._hasInitialized = true;

			let initData = {
				compatModes: ModesRegistry.getCompatModes(),
				languages: ModesRegistry.getLanguages(),
				workerParticipants: ModesRegistry.getWorkerParticipants()
			};

			r._initialize(initData);

			ModesRegistry.onDidAddCompatModes((m) => r._acceptCompatModes(m));
			ModesRegistry.onDidAddLanguages((m) => r._acceptLanguages(m));
		}
		return r;
	}

	public configureModeById(modeId:string, options:any):void {
		this._getModeServiceWorkerHelper().configureModeById(modeId, options);
		super.configureModeById(modeId, options);
	}

	protected _createMode(modeId:string): TPromise<modes.IMode> {
		// Instantiate mode also in worker
		this._getModeServiceWorkerHelper().instantiateMode(modeId);
		return super._createMode(modeId);
	}

	public registerMonarchDefinition(modelService: IModelService, editorWorkerService:IEditorWorkerService, modeId:string, language:ILanguage): IDisposable {
		this._getModeServiceWorkerHelper().registerMonarchDefinition(modeId, language);
		var lexer = compile(objects.clone(language));
		return combinedDispose(
			super.doRegisterMonarchDefinition(modeId, lexer),

			this.registerModeSupport(modeId, 'suggestSupport', (mode) => {
				return createSuggestSupport(modelService, editorWorkerService, modeId, lexer);
			})
		);
	}
}

export interface IWorkerInitData {
	compatModes: ILegacyLanguageDefinition[];
	languages: ILanguageExtensionPoint[];
	workerParticipants: modes.IWorkerParticipantDescriptor[];
}

@Remotable.WorkerContext('ModeServiceWorkerHelper', ThreadAffinity.All)
export class ModeServiceWorkerHelper {
	private _modeService:IModeService;

	constructor(@IModeService modeService:IModeService) {
		this._modeService = modeService;
	}

	public _initialize(initData:IWorkerInitData): void {
		ModesRegistry.registerCompatModes(initData.compatModes);
		ModesRegistry.registerLanguages(initData.languages);
		ModesRegistry.registerWorkerParticipants(initData.workerParticipants);
	}

	public _acceptCompatModes(modes:ILegacyLanguageDefinition[]): void {
		ModesRegistry.registerCompatModes(modes);
	}

	public _acceptLanguages(languages:ILanguageExtensionPoint[]): void {
		ModesRegistry.registerLanguages(languages);
	}

	public instantiateMode(modeId:string): void {
		this._modeService.getOrCreateMode(modeId).done(null, onUnexpectedError);
	}

	public configureModeById(modeId:string, options:any):void {
		this._modeService.configureMode(modeId, options);
	}

	public registerMonarchDefinition(modeId:string, language:ILanguage): void {
		this._modeService.registerMonarchDefinition(null, null, modeId, language);
	}
}
