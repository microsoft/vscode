/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry, NotebookInfoResolver } from 'vs/editor/common/languageFeatureRegistry';
import { CodeActionProvider, CodeLensProvider, CompletionItemProvider, DeclarationProvider, DefinitionProvider, DocumentColorProvider, DocumentFormattingEditProvider, DocumentHighlightProvider, DocumentOnDropEditProvider, DocumentPasteEditProvider, DocumentRangeFormattingEditProvider, DocumentRangeSemanticTokensProvider, DocumentSemanticTokensProvider, DocumentSymbolProvider, EvaluatableExpressionProvider, FoldingRangeProvider, HoverProvider, ImplementationProvider, InlayHintsProvider, InlineCompletionsProvider, InlineValuesProvider, LinkedEditingRangeProvider, LinkProvider, MappedEditsProvider, OnTypeFormattingEditProvider, ReferenceProvider, RenameProvider, SelectionRangeProvider, SignatureHelpProvider, TypeDefinitionProvider } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

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

	readonly documentRangeSemanticTokensProvider: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>;

	readonly documentSemanticTokensProvider: LanguageFeatureRegistry<DocumentSemanticTokensProvider>;

	readonly selectionRangeProvider: LanguageFeatureRegistry<SelectionRangeProvider>;

	readonly foldingRangeProvider: LanguageFeatureRegistry<FoldingRangeProvider>;

	readonly linkProvider: LanguageFeatureRegistry<LinkProvider>;

	readonly inlineCompletionsProvider: LanguageFeatureRegistry<InlineCompletionsProvider>;

	readonly completionProvider: LanguageFeatureRegistry<CompletionItemProvider>;

	readonly linkedEditingRangeProvider: LanguageFeatureRegistry<LinkedEditingRangeProvider>;

	readonly inlineValuesProvider: LanguageFeatureRegistry<InlineValuesProvider>;

	readonly evaluatableExpressionProvider: LanguageFeatureRegistry<EvaluatableExpressionProvider>;

	readonly documentOnDropEditProvider: LanguageFeatureRegistry<DocumentOnDropEditProvider>;

	readonly mappedEditsProvider: LanguageFeatureRegistry<MappedEditsProvider>;

	// --

	setNotebookTypeResolver(resolver: NotebookInfoResolver | undefined): void;
}
