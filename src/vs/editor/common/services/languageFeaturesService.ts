/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { CodeActionProvider, CodeLensProvider, CompletionItemProvider, DeclarationProvider, DefinitionProvider, DocumentColorProvider, DocumentFormattingEditProvider, DocumentHighlightProvider, DocumentRangeFormattingEditProvider, DocumentRangeSemanticTokensProvider, DocumentSemanticTokensProvider, DocumentSymbolProvider, EvaluatableExpressionProvider, FoldingRangeProvider, HoverProvider, ImplementationProvider, InlayHintsProvider, InlineCompletionsProvider, InlineValuesProvider, LinkedEditingRangeProvider, LinkProvider, OnTypeFormattingEditProvider, ReferenceProvider, RenameProvider, SelectionRangeProvider, SignatureHelpProvider, TypeDefinitionProvider } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class LanguageFeaturesService implements ILanguageFeaturesService {

	declare _serviceBrand: undefined;

	readonly referenceProvider = new LanguageFeatureRegistry<ReferenceProvider>();

	readonly renameProvider = new LanguageFeatureRegistry<RenameProvider>();

	readonly codeActionProvider = new LanguageFeatureRegistry<CodeActionProvider>();

	readonly definitionProvider = new LanguageFeatureRegistry<DefinitionProvider>();

	readonly typeDefinitionProvider = new LanguageFeatureRegistry<TypeDefinitionProvider>();

	readonly declarationProvider = new LanguageFeatureRegistry<DeclarationProvider>();

	readonly implementationProvider = new LanguageFeatureRegistry<ImplementationProvider>();

	readonly documentSymbolProvider = new LanguageFeatureRegistry<DocumentSymbolProvider>();

	readonly inlayHintsProvider = new LanguageFeatureRegistry<InlayHintsProvider>();

	readonly colorProvider = new LanguageFeatureRegistry<DocumentColorProvider>();

	readonly codeLensProvider = new LanguageFeatureRegistry<CodeLensProvider>();

	readonly documentFormattingEditProvider = new LanguageFeatureRegistry<DocumentFormattingEditProvider>();

	readonly documentRangeFormattingEditProvider = new LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>();

	readonly onTypeFormattingEditProvider = new LanguageFeatureRegistry<OnTypeFormattingEditProvider>();

	readonly signatureHelpProvider = new LanguageFeatureRegistry<SignatureHelpProvider>();

	readonly hoverProvider = new LanguageFeatureRegistry<HoverProvider>();

	readonly documentHighlightProvider = new LanguageFeatureRegistry<DocumentHighlightProvider>();

	readonly selectionRangeProvider = new LanguageFeatureRegistry<SelectionRangeProvider>();

	readonly foldingRangeProvider = new LanguageFeatureRegistry<FoldingRangeProvider>();

	readonly linkProvider = new LanguageFeatureRegistry<LinkProvider>();

	readonly inlineCompletionsProvider = new LanguageFeatureRegistry<InlineCompletionsProvider>();

	readonly completionProvider = new LanguageFeatureRegistry<CompletionItemProvider>();

	readonly linkedEditingRangeProvider = new LanguageFeatureRegistry<LinkedEditingRangeProvider>();

	readonly inlineValuesProvider = new LanguageFeatureRegistry<InlineValuesProvider>();

	readonly evaluatableExpressionProvider = new LanguageFeatureRegistry<EvaluatableExpressionProvider>();

	readonly documentRangeSemanticTokensProvider = new LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>();

	readonly documentSemanticTokensProvider = new LanguageFeatureRegistry<DocumentSemanticTokensProvider>();
}

registerSingleton(ILanguageFeaturesService, LanguageFeaturesService, true);
