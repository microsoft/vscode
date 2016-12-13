/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import Event, { Emitter } from 'vs/base/common/event';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import mime = require('vs/base/common/mime');
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IExtensionPoint, IExtensionPointUser, ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as modes from 'vs/editor/common/modes';
import { FrankensteinMode } from 'vs/editor/common/modes/abstractMode';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { LanguagesRegistry } from 'vs/editor/common/services/languagesRegistry';
import { ILanguageExtensionPoint, IValidLanguageExtensionPoint, IModeLookupResult, IModeService } from 'vs/editor/common/services/modeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { AbstractState } from 'vs/editor/common/modes/abstractState';
import { Token } from 'vs/editor/common/core/token';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';

export const languagesExtPoint: IExtensionPoint<ILanguageExtensionPoint[]> = ExtensionsRegistry.registerExtensionPoint<ILanguageExtensionPoint[]>('languages', [], {
	description: nls.localize('vscode.extension.contributes.languages', 'Contributes language declarations.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { id: '${1:languageId}', aliases: ['${2:label}'], extensions: ['${3:extension}'], configuration: './language-configuration.json' } }],
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
				type: 'string',
				default: './language-configuration.json'
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

function isValidLanguageExtensionPoint(value: ILanguageExtensionPoint, collector: ExtensionMessageCollector): boolean {
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

	private _instantiatedModes: { [modeId: string]: modes.IMode; };

	private _registry: LanguagesRegistry;

	private _onDidAddModes: Emitter<string[]> = new Emitter<string[]>();
	public onDidAddModes: Event<string[]> = this._onDidAddModes.event;

	private _onDidCreateMode: Emitter<modes.IMode> = new Emitter<modes.IMode>();
	public onDidCreateMode: Event<modes.IMode> = this._onDidCreateMode.event;

	constructor(
		instantiationService: IInstantiationService,
		extensionService: IExtensionService
	) {
		this._instantiationService = instantiationService;
		this._extensionService = extensionService;

		this._instantiatedModes = {};

		this._registry = new LanguagesRegistry();
		this._registry.onDidAddModes((modes) => this._onDidAddModes.fire(modes));
	}

	public isRegisteredMode(mimetypeOrModeId: string): boolean {
		return this._registry.isRegisteredMode(mimetypeOrModeId);
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

	public getFilenames(alias: string): string[] {
		return this._registry.getFilenames(alias);
	}

	public getMimeForMode(modeId: string): string {
		return this._registry.getMimeForMode(modeId);
	}

	public getLanguageName(modeId: string): string {
		return this._registry.getLanguageName(modeId);
	}

	public getModeIdForLanguageName(alias: string): string {
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

	public lookup(commaSeparatedMimetypesOrCommaSeparatedIds: string): IModeLookupResult[] {
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

	public getModeIdByFilenameOrFirstLine(filename: string, firstLine?: string): string {
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

	public getOrCreateModeByFilenameOrFirstLine(filename: string, firstLine?: string): TPromise<modes.IMode> {
		return this.onReady().then(() => {
			var modeId = this.getModeIdByFilenameOrFirstLine(filename, firstLine);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	private _getOrCreateMode(modeId: string): modes.IMode {
		if (!this._instantiatedModes.hasOwnProperty(modeId)) {
			this._instantiatedModes[modeId] = this._instantiationService.createInstance(FrankensteinMode, {
				id: modeId
			});

			this._onDidCreateMode.fire(this._instantiatedModes[modeId]);

			this._extensionService.activateByEvent(`onLanguage:${modeId}`).done(null, onUnexpectedError);
		}
		return this._instantiatedModes[modeId];
	}
}

export class TokenizationState2Adapter implements modes.IState {

	private _modeId: string;
	private _actual: modes.IState2;
	private _stateData: modes.IState;

	constructor(modeId: string, actual: modes.IState2, stateData: modes.IState) {
		this._modeId = modeId;
		this._actual = actual;
		this._stateData = stateData;
	}

	public get actual(): modes.IState2 { return this._actual; }

	public clone(): TokenizationState2Adapter {
		return new TokenizationState2Adapter(this._modeId, this._actual.clone(), AbstractState.safeClone(this._stateData));
	}

	public equals(other: modes.IState): boolean {
		if (other instanceof TokenizationState2Adapter) {
			if (!this._actual.equals(other._actual)) {
				return false;
			}
			return AbstractState.safeEquals(this._stateData, other._stateData);
		}
		return false;
	}

	public getModeId(): string {
		return this._modeId;
	}

	public tokenize(stream: any): any {
		throw new Error('Unexpected tokenize call!');
	}

	public getStateData(): modes.IState {
		return this._stateData;
	}

	public setStateData(stateData: modes.IState): void {
		this._stateData = stateData;
	}
}

export class TokenizationSupport2Adapter implements modes.ITokenizationSupport {

	private _modeId: string;
	private _actual: modes.TokensProvider;

	constructor(modeId: string, actual: modes.TokensProvider) {
		this._modeId = modeId;
		this._actual = actual;
	}

	public getInitialState(): modes.IState {
		return new TokenizationState2Adapter(this._modeId, this._actual.getInitialState(), null);
	}

	public tokenize(line: string, state: modes.IState, offsetDelta: number = 0, stopAtOffset?: number): modes.ILineTokens {
		if (state instanceof TokenizationState2Adapter) {
			let actualResult = this._actual.tokenize(line, state.actual);
			let tokens: Token[] = [];
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
				endState: new TokenizationState2Adapter(state.getModeId(), actualResult.endState, state.getStateData()),
				modeTransitions: [new ModeTransition(offsetDelta, state.getModeId())],
			};
		}
		throw new Error('Unexpected state to tokenize with!');
	}

}

export class MainThreadModeServiceImpl extends ModeServiceImpl {
	private _configurationService: IConfigurationService;
	private _onReadyPromise: TPromise<boolean>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(instantiationService, extensionService);
		this._configurationService = configurationService;

		languagesExtPoint.setHandler((extensions: IExtensionPointUser<ILanguageExtensionPoint[]>[]) => {
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
				const langId = configuration.files.associations[pattern];
				const mimetype = this.getMimeForMode(langId) || `text/x-${langId}`;

				mime.registerTextMime({ id: langId, mime: mimetype, filepattern: pattern, userConfigured: true });
			});
		}
	}
}
