/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { USUAL_WORD_SEPARATORS } from '../../../common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { DocumentHighlight, DocumentHighlightKind, DocumentHighlightProvider, MultiDocumentHighlightProvider, ProviderResult } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { Position } from '../../../common/core/position.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { LanguageFilter } from '../../../common/languageSelector.js';


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
