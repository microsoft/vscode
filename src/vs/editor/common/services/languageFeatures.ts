/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { CodeLensProvider, DefinitionProvider, DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider, DocumentSymbolProvider, InlayHintsProvider, OnTypeFormattingEditProvider, ReferenceProvider, RenameProvider, TypeDefinitionProvider } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguageFeaturesService = createDecorator<ILanguageFeaturesService>('ILanguageFeaturesService');

export interface ILanguageFeaturesService {

	readonly _serviceBrand: undefined;

	readonly referenceProvider: LanguageFeatureRegistry<ReferenceProvider>;

	readonly definitionProvider: LanguageFeatureRegistry<DefinitionProvider>;

	readonly typeDefinitionProvider: LanguageFeatureRegistry<TypeDefinitionProvider>;

	readonly renameProvider: LanguageFeatureRegistry<RenameProvider>;

	readonly documentSymbolProvider: LanguageFeatureRegistry<DocumentSymbolProvider>;

	readonly inlayHintsProvider: LanguageFeatureRegistry<InlayHintsProvider>;

	readonly codeLensProvider: LanguageFeatureRegistry<CodeLensProvider>;

	readonly documentFormattingEditProvider: LanguageFeatureRegistry<DocumentFormattingEditProvider>;

	readonly documentRangeFormattingEditProvider: LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>;

	readonly onTypeFormattingEditProvider: LanguageFeatureRegistry<OnTypeFormattingEditProvider>;
}
