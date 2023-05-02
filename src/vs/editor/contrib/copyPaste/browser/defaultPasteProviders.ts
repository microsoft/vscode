/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Mimes } from 'vs/base/common/mime';
import { IRange } from 'vs/editor/common/core/range';
import { DocumentPasteEdit, DocumentPasteEditProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';

class DefaultTextPasteProvider implements DocumentPasteEditProvider {

	readonly id = 'text';
	readonly pasteMimeTypes = [Mimes.text, 'text'];

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
		const textEntry = dataTransfer.get('text') ?? dataTransfer.get(Mimes.text);
		if (!textEntry) {
			return;
		}

		const text = await textEntry.asString();
		return {
			label: localize('defaultPasteProvider.text.label', "Insert Plain Text"),
			insertText: text
		};
	}
}


let registeredDefaultProviders = false;

export function registerDefaultPasteProviders(
	languageFeaturesService: ILanguageFeaturesService
) {
	if (!registeredDefaultProviders) {
		registeredDefaultProviders = true;

		languageFeaturesService.documentPasteEditProvider.register('*', new DefaultTextPasteProvider());
	}
}
