/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { CodeLensProvider, DeclarationProvider, DefinitionProvider, DocumentFormattingEditProvider, DocumentHighlightProvider, DocumentRangeFormattingEditProvider, DocumentSymbolProvider, HoverProvider, ImplementationProvider, InlayHintsProvider, OnTypeFormattingEditProvider, ReferenceProvider, RenameProvider, SelectionRangeProvider, SignatureHelpProvider, TypeDefinitionProvider } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguageFeaturesService = createDecorator<ILanguageFeaturesService>('ILanguageFeaturesService');

export interface ILanguageFeaturesService {

	readonly _serviceBrand: undefined;

	// --- navigation

	readonly referenceProvider: LanguageFeatureRegistry<ReferenceProvider>;

	readonly definitionProvider: LanguageFeatureRegistry<DefinitionProvider>;

	readonly typeDefinitionProvider: LanguageFeatureRegistry<TypeDefinitionProvider>;

	readonly declarationProvider: LanguageFeatureRegistry<DeclarationProvider>;

	readonly implementationProvider: LanguageFeatureRegistry<ImplementationProvider>;

	// --- code actions

	readonly renameProvider: LanguageFeatureRegistry<RenameProvider>;

	readonly documentFormattingEditProvider: LanguageFeatureRegistry<DocumentFormattingEditProvider>;

	readonly documentRangeFormattingEditProvider: LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>;

	readonly onTypeFormattingEditProvider: LanguageFeatureRegistry<OnTypeFormattingEditProvider>;

	// --- insights

	readonly documentSymbolProvider: LanguageFeatureRegistry<DocumentSymbolProvider>;

	readonly inlayHintsProvider: LanguageFeatureRegistry<InlayHintsProvider>;

	readonly codeLensProvider: LanguageFeatureRegistry<CodeLensProvider>;

	readonly signatureHelpProvider: LanguageFeatureRegistry<SignatureHelpProvider>;

	readonly hoverProvider: LanguageFeatureRegistry<HoverProvider>;

	readonly documentHighlightProvider: LanguageFeatureRegistry<DocumentHighlightProvider>;

	// ---

	readonly selectionRangeProvider: LanguageFeatureRegistry<SelectionRangeProvider>;

}
