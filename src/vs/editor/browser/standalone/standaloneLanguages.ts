/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IDisposable} from 'vs/base/common/lifecycle';
import {ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {Extensions, IJSONContributionRegistry} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {Registry} from 'vs/platform/platform';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {ILanguage} from 'vs/editor/common/modes/monarch/monarchTypes';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';
import {ensureStaticPlatformServices} from 'vs/editor/browser/standalone/standaloneServices';
import * as modes from 'vs/editor/common/modes';
import {startup} from './standaloneCodeEditor';
import {IRichLanguageConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';

export function setLanguageConfiguration(languageId:string, configuration:IRichLanguageConfiguration): IDisposable {
	startup.initStaticServicesIfNecessary();
	let staticPlatformServices = ensureStaticPlatformServices(null);
	return staticPlatformServices.modeService.registerRichEditSupport(languageId, configuration);
}

export function setTokensProvider(languageId:string, support:modes.TokensProvider): IDisposable {
	startup.initStaticServicesIfNecessary();
	let staticPlatformServices = ensureStaticPlatformServices(null);
	return staticPlatformServices.modeService.registerTokenizationSupport2(languageId, support);
}

export function registerReferenceProvider(languageId:string, support:modes.ReferenceProvider): IDisposable {
	return modes.ReferenceProviderRegistry.register(languageId, support);
}

export function registerRenameProvider(languageId:string, support:modes.RenameProvider): IDisposable {
	return modes.RenameProviderRegistry.register(languageId, support);
}

// export const SuggestRegistry = new LanguageFeatureRegistry<ISuggestSupport>();

export function registerSignatureHelpProvider(languageId:string, support:modes.SignatureHelpProvider): IDisposable {
	return modes.SignatureHelpProviderRegistry.register(languageId, support);
}

export function registerHoverProvider(languageId:string, support:modes.HoverProvider): IDisposable {
	return modes.HoverProviderRegistry.register(languageId, support);
}

export function registerDocumentSymbolProvider(languageId:string, support:modes.DocumentSymbolProvider): IDisposable {
	return modes.DocumentSymbolProviderRegistry.register(languageId, support);
}

export function registerDocumentHighlightProvider(languageId:string, support:modes.DocumentHighlightProvider): IDisposable {
	return modes.DocumentHighlightProviderRegistry.register(languageId, support);
}

export function registerDefinitionProvider(languageId:string, support:modes.DefinitionProvider): IDisposable {
	return modes.DefinitionProviderRegistry.register(languageId, support);
}

export function registerCodeLensProvider(languageId:string, support:modes.CodeLensProvider): IDisposable {
	return modes.CodeLensProviderRegistry.register(languageId, support);
}

export function registerCodeActionProvider(languageId:string, support:modes.CodeActionProvider): IDisposable {
	return modes.CodeActionProviderRegistry.register(languageId, support);
}

export function registerDocumentFormattingEditProvider(languageId:string, support:modes.DocumentFormattingEditProvider): IDisposable {
	return modes.DocumentFormattingEditProviderRegistry.register(languageId, support);
}

export function registerDocumentRangeFormattingEditProvider(languageId:string, support:modes.DocumentRangeFormattingEditProvider): IDisposable {
	return modes.DocumentRangeFormattingEditProviderRegistry.register(languageId, support);
}

export function registerOnTypeFormattingEditProvider(languageId:string, support:modes.OnTypeFormattingEditProvider): IDisposable {
	return modes.OnTypeFormattingEditProviderRegistry.register(languageId, support);
}

export function registerLinkProvider(languageId:string, support:modes.LinkProvider): IDisposable {
	return modes.LinkProviderRegistry.register(languageId, support);
}

export function registerMonarchStandaloneLanguage(language:ILanguageExtensionPoint, defModule:string): void {
	ModesRegistry.registerLanguage(language);

	ExtensionsRegistry.registerOneTimeActivationEventListener('onLanguage:' + language.id, () => {
		require([defModule], (value:{language:ILanguage}) => {
			if (!value.language) {
				console.error('Expected ' + defModule + ' to export a `language`');
				return;
			}

			startup.initStaticServicesIfNecessary();
			let staticPlatformServices = ensureStaticPlatformServices(null);
			let modeService = staticPlatformServices.modeService;
			let modelService = staticPlatformServices.modelService;
			let editorWorkerService = staticPlatformServices.editorWorkerService;

			modeService.registerMonarchDefinition(modelService, editorWorkerService, language.id, value.language);
		}, (err) => {
			console.error('Cannot find module ' + defModule, err);
		});
	});
}

/**
 * @internal
 */
export function registerStandaloneLanguage(language:ILanguageExtensionPoint, defModule:string): void {
	ModesRegistry.registerLanguage(language);

	ExtensionsRegistry.registerOneTimeActivationEventListener('onLanguage:' + language.id, () => {
		require([defModule], (value:{activate:()=>void}) => {
			if (!value.activate) {
				console.error('Expected ' + defModule + ' to export an `activate` function');
				return;
			}

			startup.initStaticServicesIfNecessary();
			let staticPlatformServices = ensureStaticPlatformServices(null);
			let instantiationService = staticPlatformServices.instantiationService;

			instantiationService.invokeFunction(value.activate);
		}, (err) => {
			console.error('Cannot find module ' + defModule, err);
		});
	});
}

export function register(language:ILanguageExtensionPoint): void {
	ModesRegistry.registerLanguage(language);
}

export function onLanguage(languageId:string, callback:()=>void): IDisposable {
	let isDisposed = false;
	ExtensionsRegistry.registerOneTimeActivationEventListener('onLanguage:' + languageId, () => {
		if (!isDisposed) {
			callback();
		}
	});
	return {
		dispose: () => { isDisposed = true; }
	};
}

/**
 * @internal
 */
export function registerStandaloneSchema(uri:string, schema:IJSONSchema) {
	let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);
	schemaRegistry.registerSchema(uri, schema);
}

/**
 * @internal
 */
export function createMonacoLanguagesAPI()/*: typeof monaco.languages*/ {
	return {
		// provider methods
		setLanguageConfiguration: setLanguageConfiguration,
		setTokensProvider: setTokensProvider,
		registerReferenceProvider: registerReferenceProvider,
		registerRenameProvider: registerRenameProvider,
		// SuggestRegistry: SuggestRegistry,
		registerSignatureHelpProvider: registerSignatureHelpProvider,
		registerHoverProvider: registerHoverProvider,
		registerDocumentSymbolProvider: registerDocumentSymbolProvider,
		registerDocumentHighlightProvider: registerDocumentHighlightProvider,
		registerDefinitionProvider: registerDefinitionProvider,
		registerCodeLensProvider: registerCodeLensProvider,
		registerCodeActionProvider: registerCodeActionProvider,
		registerDocumentFormattingEditProvider: registerDocumentFormattingEditProvider,
		registerDocumentRangeFormattingEditProvider: registerDocumentRangeFormattingEditProvider,
		registerOnTypeFormattingEditProvider: registerOnTypeFormattingEditProvider,
		registerLinkProvider: registerLinkProvider,

		// other methods
		registerMonarchStandaloneLanguage: registerMonarchStandaloneLanguage,
		register: register,
		onLanguage: onLanguage,

		// enums
		DocumentHighlightKind: modes.DocumentHighlightKind,
		SymbolKind: modes.SymbolKind,
		IndentAction: modes.IndentAction,

		// classes
		Location: modes.Location
	};
}
