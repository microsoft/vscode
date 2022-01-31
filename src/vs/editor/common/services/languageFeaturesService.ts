/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { CodeLensProvider, DocumentSymbolProvider, InlayHintsProvider, ReferenceProvider, RenameProvider } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class LanguageFeatureService implements ILanguageFeaturesService {

	declare _serviceBrand: undefined;

	readonly referenceProvider = new LanguageFeatureRegistry<ReferenceProvider>();

	readonly renameProvider = new LanguageFeatureRegistry<RenameProvider>();

	readonly documentSymbolProvider = new LanguageFeatureRegistry<DocumentSymbolProvider>();

	readonly inlayHintsProvider = new LanguageFeatureRegistry<InlayHintsProvider>();

	readonly codeLensProvider = new LanguageFeatureRegistry<CodeLensProvider>();
}

registerSingleton(ILanguageFeaturesService, LanguageFeatureService, true);
