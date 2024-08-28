/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { USUAL_WORD_SEPARATORS } from 'vs/editor/common/core/wordHelper';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { DocumentHighlight, DocumentHighlightKind, DocumentHighlightProvider, MultiDocumentHighlightProvider, ProviderResult } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { LanguageFilter } from 'vs/editor/common/languageSelector';


class TextualDocumentHighlightProvider implements DocumentHighlightProvider, MultiDocumentHighlightProvider {

	selector: LanguageFilter = { language: '*' };

	provideDocumentHighlights(model: ITextModel, position: Position, token: CancellationToken): ProviderResult<DocumentHighlight[]> {
		const result: DocumentHighlight[] = [];

		const word = model.getWordAtPosition({
			lineNumber: position.lineNumber,
			column: position.column
		});

		if (!word) {
			return Promise.resolve(result);
		}

		if (model.isDisposed()) {
			return;
		}

		const matches = model.findMatches(word.word, true, false, true, USUAL_WORD_SEPARATORS, false);
		return matches.map(m => ({
			range: m.range,
			kind: DocumentHighlightKind.Text
		}));
	}

	provideMultiDocumentHighlights(primaryModel: ITextModel, position: Position, otherModels: ITextModel[], token: CancellationToken): ProviderResult<ResourceMap<DocumentHighlight[]>> {

		const result = new ResourceMap<DocumentHighlight[]>();

		const word = primaryModel.getWordAtPosition({
			lineNumber: position.lineNumber,
			column: position.column
		});
		if (!word) {
			return Promise.resolve(result);
		}


		for (const model of [primaryModel, ...otherModels]) {
			if (model.isDisposed()) {
				continue;
			}

			const matches = model.findMatches(word.word, true, false, true, USUAL_WORD_SEPARATORS, false);
			const highlights = matches.map(m => ({
				range: m.range,
				kind: DocumentHighlightKind.Text
			}));

			if (highlights) {
				result.set(model.uri, highlights);
			}
		}

		return result;
	}

}

export class TextualMultiDocumentHighlightFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._register(languageFeaturesService.documentHighlightProvider.register('*', new TextualDocumentHighlightProvider()));
		this._register(languageFeaturesService.multiDocumentHighlightProvider.register('*', new TextualDocumentHighlightProvider()));
	}
}
