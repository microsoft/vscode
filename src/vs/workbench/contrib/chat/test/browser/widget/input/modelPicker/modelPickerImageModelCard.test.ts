/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { imageGenerationModelChoiceList } from '../../../../../../../../platform/agentHost/common/imageGenerationConfiguration.js';
import { IPricingDisclosure } from '../../../../../browser/widget/input/modelPicker/modelPickerCard.js';
import { ImageModelCard } from '../../../../../browser/widget/input/modelPicker/modelPickerImageModelCard.js';

suite('ImageModelCard', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('lists what the model can do and its rates, folded away with every other card\'s', () => {
		const onDidChange = disposables.add(new Emitter<void>());
		let expanded = false;
		const disclosure: IPricingDisclosure = { isExpanded: () => expanded, setExpanded: next => { expanded = next; onDidChange.fire(); }, onDidChange: onDidChange.event };
		const flare = imageGenerationModelChoiceList.find(choice => choice.id === 'gpt-image-2.5-flare')!;
		const card = disposables.add(new ImageModelCard(flare, flare.details!, disclosure));
		mainWindow.document.body.append(card.headerElement, card.element);
		disposables.add(toDisposable(() => {
			card.headerElement.remove();
			card.element.remove();
		}));

		const text = (selector: string) => card.element.querySelector(selector)?.textContent;
		const capabilities = card.element.querySelector<HTMLElement>('.chat-image-model-card-capabilities')!;
		const toggle = card.element.querySelector<HTMLElement>('.chat-model-card-pricing-toggle')!;
		const body = card.element.querySelector<HTMLElement>('.chat-model-card-pricing-body')!;
		const disclosureState = () => ({ expanded: toggle.getAttribute('aria-expanded'), hidden: body.inert });
		const collapsed = disclosureState();
		toggle.click();
		const opened = disclosureState();
		// Another card folds the prices away.
		disclosure.setExpanded(false);

		assert.deepStrictEqual({
			name: card.headerElement.textContent,
			description: text('.chat-model-card-description'),
			capabilities: {
				label: mainWindow.document.getElementById(capabilities.getAttribute('aria-labelledby')!)?.textContent,
				items: [...capabilities.children].map(item => ({ text: item.textContent, iconHidden: item.firstElementChild?.getAttribute('aria-hidden') })),
			},
			pricing: {
				badge: text('.chat-model-card-pricing-toggle .chat-model-card-badge'),
				controlsPrices: toggle.getAttribute('aria-controls') === body.id,
				caption: text('.chat-model-card-pricing-caption'),
				prices: [...card.element.querySelectorAll('.chat-model-card-pricing-row')].map(row => `${row.firstElementChild?.textContent}: ${row.lastElementChild?.textContent}`),
				note: text('.chat-model-card-pricing-note'),
			},
			disclosure: { collapsed, opened, foldedByAnotherCard: disclosureState() },
		}, {
			name: 'GPT Image 2.5 Flare',
			description: 'Prompts and selected images are sent to this model. Image generation works only if your account has access to it.',
			capabilities: {
				label: 'Capabilities',
				items: [
					{ text: 'Generate images from a prompt', iconHidden: 'true' },
					{ text: 'Edit existing images', iconHidden: 'true' },
				],
			},
			pricing: {
				badge: 'Preview',
				controlsPrices: true,
				caption: 'Credits per 1M tokens',
				prices: ['Text Input: 500', 'Text Output: 0', 'Image Input: 800', 'Image Output: 3000'],
				note: 'These charges are in addition to the conversation model. Rates may change; these are token rates, not per-image prices.',
			},
			disclosure: {
				collapsed: { expanded: 'false', hidden: true },
				opened: { expanded: 'true', hidden: false },
				foldedByAnotherCard: { expanded: 'false', hidden: true },
			},
		});
	});
});
