/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { getBaseLayerHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../../nls.js';
import { IImageGenerationModelChoice, IImageGenerationModelDetails, ImageGenerationCapability } from '../../../../../../../platform/agentHost/common/imageGenerationConfiguration.js';
import { IPricingDisclosure, ModelCardPricingSection } from './modelPickerCard.js';

/** What an image model can do, as its details page and its row's accessible description say it. */
export function getImageModelCapabilityLabel(capability: ImageGenerationCapability): string {
	switch (capability) {
		case 'generate': return localize('chat.modelPicker.imageModel.generate', "Generate images from a prompt");
		case 'edit': return localize('chat.modelPicker.imageModel.edit', "Edit existing images");
	}
}

const capabilityIcons: Record<ImageGenerationCapability, ThemeIcon> = {
	generate: Codicon.sparkle,
	edit: Codicon.edit,
};

/**
 * An image model's details page in the model picker: what it can do and what it costs,
 * with the same pricing section as a chat model's.
 */
export class ImageModelCard extends DisposableStore {

	readonly element = dom.$('.chat-model-card.chat-image-model-card');
	readonly headerElement = dom.$('.chat-model-card-header');

	constructor(model: IImageGenerationModelChoice, details: IImageGenerationModelDetails, pricingDisclosure: IPricingDisclosure | undefined) {
		super();
		const name = dom.append(this.headerElement, dom.$('.chat-model-card-name', undefined, model.label));
		this.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), name, model.label));

		dom.append(this.element, dom.$('.chat-model-card-description', undefined, localize('chat.modelPicker.imageModel.description', "Prompts and selected images are sent to this model. Image generation works only if your account has access to it.")));

		const capabilities = dom.append(this.element, dom.$('.chat-model-card-section'));
		const titleId = `chat-image-model-card-capabilities-${generateUuid()}`;
		const heading = dom.append(capabilities, dom.$('.chat-model-card-section-heading'));
		dom.append(heading, dom.$('.chat-model-card-section-title', { id: titleId }, localize('chat.modelPicker.imageModel.capabilities', "Capabilities")));
		const list = dom.append(capabilities, dom.$('ul.chat-image-model-card-capabilities', { 'aria-labelledby': titleId }));
		for (const capability of details.capabilities) {
			const item = dom.append(list, dom.$('li.chat-image-model-card-capability'));
			dom.append(item, dom.$(`span${ThemeIcon.asCSSSelector(capabilityIcons[capability])}`, { 'aria-hidden': 'true' }));
			dom.append(item, dom.$('span', undefined, getImageModelCapabilityLabel(capability)));
		}

		const { rates } = details;
		const pricing = new ModelCardPricingSection(this.element, {
			id: `image-${model.id}`,
			prices: [
				{ label: localize('chat.modelPicker.imageModel.textInput', "Text Input"), cost: rates.textInput },
				{ label: localize('chat.modelPicker.imageModel.textOutput', "Text Output"), cost: rates.textOutput },
				{ label: localize('chat.modelPicker.imageModel.imageInput', "Image Input"), cost: rates.imageInput },
				{ label: localize('chat.modelPicker.imageModel.imageOutput', "Image Output"), cost: rates.imageOutput },
			],
			badge: details.previewRates ? { label: localize('chat.modelPicker.imageModel.previewRates', "Preview"), highCost: false } : undefined,
			note: localize('chat.modelPicker.imageModel.pricingNote', "These charges are in addition to the conversation model. Rates may change; these are token rates, not per-image prices."),
			disclosure: pricingDisclosure,
		}, this);
		if (pricingDisclosure) {
			this.add(pricingDisclosure.onDidChange(() => pricing.update()));
		}
	}
}
