/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { getModelHoverContent } from '../../../../../browser/widget/input/modelPicker/modelPickerHover.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function createModel(id: string, name: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `copilot-${id}`,
		metadata: {
			id,
			name,
			vendor: 'copilot',
			version: id,
			family: 'copilot',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
		} as ILanguageModelChatMetadata,
	};
}

suite('ModelPickerHover', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('non-positive promo models have no promo hover presentation', () => {
		const results = [0, -10].map(discountPercent => {
			const model = createModel(`discount-${discountPercent}`, `Discount ${discountPercent}`);
			model.metadata = {
				...model.metadata,
				category: 'powerful',
				priceCategory: 'high',
				promo: { id: `test-promo-${discountPercent}`, discountPercent, endsAt: '2026-07-20T23:59:59Z', message: 'Do not render this text' },
			} as ILanguageModelChatMetadata;
			const hover = getModelHoverContent(model, false, undefined, NullOpenerService);
			assert.ok(hover);
			disposables.add(hover.disposable);
			return {
				discountPercent,
				category: hover.element.querySelector('.chat-model-hover-category')?.textContent,
				badges: Array.from(hover.element.querySelectorAll('.chat-model-hover-price-badge'), element => element.textContent),
				promoText: hover.element.querySelector('.chat-model-hover-promo-text')?.textContent,
			};
		});

		assert.deepStrictEqual(results, [
			{ discountPercent: 0, category: 'Powerful', badges: ['High cost'], promoText: undefined },
			{ discountPercent: -10, category: 'Powerful', badges: ['High cost'], promoText: undefined },
		]);
	});
});
