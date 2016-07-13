/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, empty as EmptyDisposable} from 'vs/base/common/lifecycle'; // TODO@Alex
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import {TPromise} from 'vs/base/common/winjs.base';
import mime = require('vs/base/common/mime');
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {createAsyncDescriptor1} from 'vs/platform/instantiation/common/descriptors';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IExtensionPointUser, IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import * as modes from 'vs/editor/common/modes';
import {FrankensteinMode} from 'vs/editor/common/modes/abstractMode';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {LanguagesRegistry} from 'vs/editor/common/services/languagesRegistry';
import {ILanguageExtensionPoint, IValidLanguageExtensionPoint, IModeLookupResult, IModeService} from 'vs/editor/common/services/modeService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {Token} from 'vs/editor/common/modes/supports';

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
	public _serviceBrand: any;

	private _instantiationService: IInstantiationService;
	protected _extensionService: IExtensionService;

	private _activationPromises: { [modeId: string]: TPromise<modes.IMode>; };
	private _instantiatedModes: { [modeId: string]: modes.IMode; };
	private _config: IModeConfigurationMap;

	private _registry: LanguagesRegistry;

	private _onDidAddModes: Emitter<string[]> = new Emitter<string[]>();
	public onDidAddModes: Event<string[]> = this._onDidAddModes.event;

	private _onDidCreateMode: Emitter<modes.IMode> = new Emitter<modes.IMode>();
	public onDidCreateMode: Event<modes.IMode> = this._onDidCreateMode.event;

	constructor(instantiationService:IInstantiationService, extensionService:IExtensionService) {
		this._instantiationService = instantiationService;
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

	private _createMode(modeId:string): TPromise<modes.IMode> {
		let modeDescriptor = this._createModeDescriptor(modeId);

		let compatModeData = this._registry.getCompatMode(modeId);
		if (compatModeData) {
			// This is a compatibility mode

			let resolvedDeps: TPromise<modes.IMode[]> = null;
			if (Array.isArray(compatModeData.deps)) {
				resolvedDeps = TPromise.join(compatModeData.deps.map(dep => this.getOrCreateMode(dep)));
			} else {
				resolvedDeps = TPromise.as<modes.IMode[]>(null);
			}

			return resolvedDeps.then(_ => {
				let compatModeAsyncDescriptor = createAsyncDescriptor1<modes.IModeDescriptor, modes.IMode>(compatModeData.moduleId, compatModeData.ctorName);
				return this._instantiationService.createInstance(compatModeAsyncDescriptor, modeDescriptor).then((compatMode) => {
					if (compatMode.configSupport) {
						compatMode.configSupport.configure(this.getConfigurationForMode(modeId));
					}
					return compatMode;
				});
			});
		}

		return TPromise.as<modes.IMode>(this._instantiationService.createInstance(FrankensteinMode, modeDescriptor));
	}

	private _createModeDescriptor(modeId:string): modes.IModeDescriptor {
		return {
			id: modeId
		};
	}

	private _registerTokenizationSupport<T>(mode:modes.IMode, callback: (mode: modes.IMode) => T): IDisposable {
		if (mode.setTokenizationSupport) {
			return mode.setTokenizationSupport(callback);
		} else {
			console.warn('Cannot register tokenizationSupport on mode ' + mode.getId() + ' because it does not support it.');
			return EmptyDisposable;
		}
	}

	private registerModeSupport<T>(modeId: string, callback: (mode: modes.IMode) => T): IDisposable {
		if (this._instantiatedModes.hasOwnProperty(modeId)) {
			return this._registerTokenizationSupport(this._instantiatedModes[modeId], callback);
		}

		let cc: (disposable:IDisposable)=>void;
		let promise = new TPromise<IDisposable>((c, e) => { cc = c; });

		let disposable = this.onDidCreateMode((mode) => {
			if (mode.getId() !== modeId) {
				return;
			}

			cc(this._registerTokenizationSupport(mode, callback));
			disposable.dispose();
		});

		return {
			dispose: () => {
				promise.done(disposable => disposable.dispose(), null);
			}
		};
	}

	public registerTokenizationSupport(modeId: string, callback: (mode: modes.IMode) => modes.ITokenizationSupport): IDisposable {
		return this.registerModeSupport(modeId, callback);
	}

	public registerTokenizationSupport2(modeId: string, support: modes.TokensProvider): IDisposable {
		return this.registerModeSupport(modeId, (mode) => {
			return new TokenizationSupport2Adapter(mode, support);
		});
	}
}

export class TokenizationState2Adapter implements modes.IState {

	private _mode: modes.IMode;
	private _actual: modes.IState2;
	private _stateData: modes.IState;

	constructor(mode: modes.IMode, actual: modes.IState2, stateData: modes.IState) {
		this._mode = mode;
		this._actual = actual;
		this._stateData = stateData;
	}

	public get actual(): modes.IState2 { return this._actual; }

	public clone(): TokenizationState2Adapter {
		return new TokenizationState2Adapter(this._mode, this._actual.clone(), AbstractState.safeClone(this._stateData));
	}

	public equals(other:modes.IState): boolean {
		if (other instanceof TokenizationState2Adapter) {
			if (!this._actual.equals(other._actual)) {
				return false;
			}
			return AbstractState.safeEquals(this._stateData, other._stateData);
		}
		return false;
	}

	public getMode(): modes.IMode {
		return this._mode;
	}

	public tokenize(stream:any): any {
		throw new Error('Unexpected tokenize call!');
	}

	public getStateData(): modes.IState {
		return this._stateData;
	}

	public setStateData(stateData:modes.IState): void {
		this._stateData = stateData;
	}
}

export class TokenizationSupport2Adapter implements modes.ITokenizationSupport {

	private _mode: modes.IMode;
	private _actual: modes.TokensProvider;

	constructor(mode: modes.IMode, actual: modes.TokensProvider) {
		this._mode = mode;
		this._actual = actual;
	}

	public getInitialState(): modes.IState {
		return new TokenizationState2Adapter(this._mode, this._actual.getInitialState(), null);
	}

	public tokenize(line:string, state:modes.IState, offsetDelta: number = 0, stopAtOffset?: number): modes.ILineTokens {
		if (state instanceof TokenizationState2Adapter) {
			let actualResult = this._actual.tokenize(line, state.actual);
			let tokens: modes.IToken[] = [];
			actualResult.tokens.forEach((t) => {
				if (typeof t.scopes === 'string') {
					tokens.push(new Token(t.startIndex + offsetDelta, <string>t.scopes));
				} else if (Array.isArray(t.scopes) && t.scopes.length === 1) {
					tokens.push(new Token(t.startIndex + offsetDelta, t.scopes[0]));
				} else {
					throw new Error('Only token scopes as strings or of precisely 1 length are supported at this time!');
				}
			});
			return {
				tokens: tokens,
				actualStopOffset: offsetDelta + line.length,
				endState: new TokenizationState2Adapter(state.getMode(), actualResult.endState, state.getStateData()),
				modeTransitions: [{ startIndex: offsetDelta, mode: state.getMode() }],
			};
		}
		throw new Error('Unexpected state to tokenize with!');
	}

}

export class MainThreadModeServiceImpl extends ModeServiceImpl {
	private _configurationService: IConfigurationService;
	private _onReadyPromise: TPromise<boolean>;

	constructor(
		@IInstantiationService instantiationService:IInstantiationService,
		@IExtensionService extensionService:IExtensionService,
		@IConfigurationService configurationService:IConfigurationService
	) {
		super(instantiationService, extensionService);
		this._configurationService = configurationService;

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

		this._configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config));
	}

	public onReady(): TPromise<boolean> {
		if (!this._onReadyPromise) {
			const configuration = this._configurationService.getConfiguration<IFilesConfiguration>();
			this._onReadyPromise = this._extensionService.onReady().then(() => {
				this.onConfigurationChange(configuration);

				return true;
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
}
