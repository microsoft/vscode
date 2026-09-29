/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
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

	test('promo hover text omits the end date when the promo has none', () => {
		const results = ['2026-07-20T23:59:59Z', 'not a date', undefined].map(endsAt => {
			const model = createModel(`promo-${endsAt}`, `Promo ${endsAt}`);
			model.metadata = {
				...model.metadata,
				promo: { id: `test-promo-${endsAt}`, discountPercent: 20, endsAt, message: 'Limited time offer' },
			} as ILanguageModelChatMetadata;
			const hover = getModelHoverContent(model, false, undefined, NullOpenerService);
			assert.ok(hover);
			disposables.add(hover.disposable);
			const promoText = hover.element.querySelector('.chat-model-hover-promo-text')?.textContent?.trim();
			// The formatted date is locale/timezone dependent, so only assert on the sentence around it.
			return promoText?.replace(/Ends .+\.$/, 'Ends <date>.');
		});

		assert.deepStrictEqual(results, [
			'Limited time offer Ends <date>.',
			'Limited time offer',
			'Limited time offer',
		]);
	});

	test('HydraFusion presents like Auto: its detail as the badge and its description instead of a category', () => {
		const model = createModel('hydrafusion', 'HydraFusion');
		const opened: { url: string; options: Parameters<IOpenerService['open']>[1] }[] = [];
		const openerService = upcastPartial<IOpenerService>({
			open: async (resource, options) => {
				opened.push({ url: resource.toString(), options });
				return true;
			},
		});
		model.metadata = {
			...model.metadata,
			category: 'powerful',
			detail: 'Research preview',
			tooltip: 'HydraFusion routes the first eligible turn and may use multiple models. Premium usage varies with the selected route.',
		} as ILanguageModelChatMetadata;
		const hover = getModelHoverContent(model, true, undefined, openerService);
		assert.ok(hover);
		disposables.add(hover.disposable);
		hover.element.querySelector<HTMLAnchorElement>('a')?.click();

		assert.deepStrictEqual({
			category: hover.element.querySelector('.chat-model-hover-category')?.textContent,
			badges: Array.from(hover.element.querySelectorAll('.chat-model-hover-price-badge'), element => element.textContent),
			description: hover.element.querySelector('.chat-model-hover-description p')?.textContent?.trim(),
			paragraphCount: hover.element.querySelectorAll('.chat-model-hover-description p').length,
			linkInline: hover.element.querySelector('.chat-model-hover-description a')?.parentElement === hover.element.querySelector('.chat-model-hover-description p'),
			learnMore: hover.element.querySelector<HTMLAnchorElement>('.chat-model-hover-description a')?.getAttribute('href'),
			opened,
			context: hover.element.querySelector('.chat-model-hover-context') !== null,
		}, {
			category: undefined,
			badges: ['Research preview'],
			description: 'HydraFusion routes the first eligible turn and may use multiple models. Premium usage varies with the selected route. Learn more',
			paragraphCount: 1,
			linkInline: true,
			learnMore: 'https://aka.ms/hydrafusion-blog',
			opened: [{ url: 'https://aka.ms/hydrafusion-blog', options: { allowCommands: false, fromUserGesture: true } }],
			context: false,
		});
	});

	test('info text renders as its own banner alongside warnings', () => {
		const model = createModel('gpt-4.1', 'GPT-4.1');
		model.metadata = {
			...model.metadata,
			warningText: { degradation: 'Currently degraded' },
			infoText: { model_relocated: 'GPT-4.1 now serves from a new region.' },
		} as ILanguageModelChatMetadata;

		const hover = getModelHoverContent(model, false, undefined, NullOpenerService);
		assert.ok(hover);
		disposables.add(hover.disposable);

		assert.deepStrictEqual({
			warnings: Array.from(hover.element.querySelectorAll('.chat-model-hover-warning-text'), element => element.textContent?.trim()),
			infos: Array.from(hover.element.querySelectorAll('.chat-model-hover-info-text'), element => element.textContent?.trim()),
		}, {
			warnings: ['Currently degraded'],
			infos: ['GPT-4.1 now serves from a new region.'],
		});
	});

	test('auto names its navigation option Optimize for, other models keep the schema title', () => {
		const results = ['auto', 'gpt-5'].map(id => {
			const model = createModel(id, id);
			model.metadata = {
				...model.metadata,
				configurationSchema: {
					properties: {
						navigationOption: {
							type: 'string',
							title: id === 'auto' ? undefined : 'Thinking Effort',
							enum: ['efficiency', 'intelligence'],
							group: 'navigation',
						},
						contextSize: {
							type: 'string',
							title: 'Context Size',
							enum: ['128000', '256000'],
							group: 'tokens',
						},
					},
				},
			} as ILanguageModelChatMetadata;

			const hover = getModelHoverContent(model, false, () => { }, NullOpenerService);
			assert.ok(hover);
			disposables.add(hover.disposable);
			return Array.from(hover.element.querySelectorAll('.chat-model-hover-configurable-buttons .monaco-button'), element => element.textContent?.trim());
		});

		assert.deepStrictEqual(results, [
			['Optimize for', 'Context Size'],
			['Thinking Effort', 'Context Size'],
		]);
	});
});
