/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry, NotebookInfoResolver } from '../languageFeatureRegistry.js';
import { CodeActionProvider, CodeLensProvider, CompletionItemProvider, DeclarationProvider, DefinitionProvider, DocumentColorProvider, DocumentFormattingEditProvider, DocumentHighlightProvider, DocumentDropEditProvider, DocumentPasteEditProvider, DocumentRangeFormattingEditProvider, DocumentRangeSemanticTokensProvider, DocumentSemanticTokensProvider, DocumentSymbolProvider, EvaluatableExpressionProvider, FoldingRangeProvider, HoverProvider, ImplementationProvider, InlayHintsProvider, InlineCompletionsProvider, InlineValuesProvider, LinkedEditingRangeProvider, LinkProvider, MultiDocumentHighlightProvider, NewSymbolNamesProvider, OnTypeFormattingEditProvider, ReferenceProvider, RenameProvider, SelectionRangeProvider, SignatureHelpProvider, TypeDefinitionProvider, InlineEditProvider } from '../languages.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const ILanguageFeaturesService = createDecorator<ILanguageFeaturesService>('ILanguageFeaturesService');

export interface ILanguageFeaturesService {

	readonly _serviceBrand: undefined;

	readonly referenceProvider: LanguageFeatureRegistry<ReferenceProvider>;

	readonly definitionProvider: LanguageFeatureRegistry<DefinitionProvider>;

	readonly typeDefinitionProvider: LanguageFeatureRegistry<TypeDefinitionProvider>;

	readonly declarationProvider: LanguageFeatureRegistry<DeclarationProvider>;

	readonly implementationProvider: LanguageFeatureRegistry<ImplementationProvider>;

	readonly codeActionProvider: LanguageFeatureRegistry<CodeActionProvider>;

	readonly documentPasteEditProvider: LanguageFeatureRegistry<DocumentPasteEditProvider>;

	readonly renameProvider: LanguageFeatureRegistry<RenameProvider>;

	readonly newSymbolNamesProvider: LanguageFeatureRegistry<NewSymbolNamesProvider>;

	readonly documentFormattingEditProvider: LanguageFeatureRegistry<DocumentFormattingEditProvider>;

	readonly documentRangeFormattingEditProvider: LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>;

	readonly onTypeFormattingEditProvider: LanguageFeatureRegistry<OnTypeFormattingEditProvider>;

	readonly documentSymbolProvider: LanguageFeatureRegistry<DocumentSymbolProvider>;

	readonly inlayHintsProvider: LanguageFeatureRegistry<InlayHintsProvider>;

	readonly colorProvider: LanguageFeatureRegistry<DocumentColorProvider>;

	readonly codeLensProvider: LanguageFeatureRegistry<CodeLensProvider>;

	readonly signatureHelpProvider: LanguageFeatureRegistry<SignatureHelpProvider>;

	readonly hoverProvider: LanguageFeatureRegistry<HoverProvider>;

	readonly documentHighlightProvider: LanguageFeatureRegistry<DocumentHighlightProvider>;

	readonly multiDocumentHighlightProvider: LanguageFeatureRegistry<MultiDocumentHighlightProvider>;

	readonly documentRangeSemanticTokensProvider: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>;

	readonly documentSemanticTokensProvider: LanguageFeatureRegistry<DocumentSemanticTokensProvider>;

	readonly selectionRangeProvider: LanguageFeatureRegistry<SelectionRangeProvider>;

	readonly foldingRangeProvider: LanguageFeatureRegistry<FoldingRangeProvider>;

	readonly linkProvider: LanguageFeatureRegistry<LinkProvider>;

	readonly inlineCompletionsProvider: LanguageFeatureRegistry<InlineCompletionsProvider>;

	readonly inlineEditProvider: LanguageFeatureRegistry<InlineEditProvider>;

	readonly completionProvider: LanguageFeatureRegistry<CompletionItemProvider>;

	readonly linkedEditingRangeProvider: LanguageFeatureRegistry<LinkedEditingRangeProvider>;

	readonly inlineValuesProvider: LanguageFeatureRegistry<InlineValuesProvider>;

	readonly evaluatableExpressionProvider: LanguageFeatureRegistry<EvaluatableExpressionProvider>;

	readonly documentDropEditProvider: LanguageFeatureRegistry<DocumentDropEditProvider>;

	// --

	setNotebookTypeResolver(resolver: NotebookInfoResolver | undefined): void;
}
