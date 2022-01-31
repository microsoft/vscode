/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { DocumentSymbolProvider, InlayHintsProvider, ReferenceProvider, RenameProvider } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguageFeaturesService = createDecorator<ILanguageFeaturesService>('ILanguageFeaturesService');

export interface ILanguageFeaturesService {

	readonly _serviceBrand: undefined;

	readonly referenceProvider: LanguageFeatureRegistry<ReferenceProvider>;

	readonly renameProvider: LanguageFeatureRegistry<RenameProvider>;

	readonly documentSymbolProvider: LanguageFeatureRegistry<DocumentSymbolProvider>;

	readonly inlayHintsProvider: LanguageFeatureRegistry<InlayHintsProvider>;
}
