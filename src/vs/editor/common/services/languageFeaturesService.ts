/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { CodeLensProvider, DeclarationProvider, DefinitionProvider, DocumentFormattingEditProvider, DocumentHighlightProvider, DocumentRangeFormattingEditProvider, DocumentSymbolProvider, HoverProvider, ImplementationProvider, InlayHintsProvider, OnTypeFormattingEditProvider, ReferenceProvider, RenameProvider, SignatureHelpProvider, TypeDefinitionProvider } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class LanguageFeatureService implements ILanguageFeaturesService {

	declare _serviceBrand: undefined;

	readonly referenceProvider = new LanguageFeatureRegistry<ReferenceProvider>();

	readonly renameProvider = new LanguageFeatureRegistry<RenameProvider>();

	readonly definitionProvider = new LanguageFeatureRegistry<DefinitionProvider>();

	readonly typeDefinitionProvider = new LanguageFeatureRegistry<TypeDefinitionProvider>();

	readonly declarationProvider = new LanguageFeatureRegistry<DeclarationProvider>();

	readonly implementationProvider = new LanguageFeatureRegistry<ImplementationProvider>();

	readonly documentSymbolProvider = new LanguageFeatureRegistry<DocumentSymbolProvider>();

	readonly inlayHintsProvider = new LanguageFeatureRegistry<InlayHintsProvider>();

	readonly codeLensProvider = new LanguageFeatureRegistry<CodeLensProvider>();

	readonly documentFormattingEditProvider = new LanguageFeatureRegistry<DocumentFormattingEditProvider>();

	readonly documentRangeFormattingEditProvider = new LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>();

	readonly onTypeFormattingEditProvider = new LanguageFeatureRegistry<OnTypeFormattingEditProvider>();

	readonly signatureHelpProvider = new LanguageFeatureRegistry<SignatureHelpProvider>();

	readonly hoverProvider = new LanguageFeatureRegistry<HoverProvider>();

	readonly documentHighlightProvider = new LanguageFeatureRegistry<DocumentHighlightProvider>();

}

registerSingleton(ILanguageFeaturesService, LanguageFeatureService, true);
