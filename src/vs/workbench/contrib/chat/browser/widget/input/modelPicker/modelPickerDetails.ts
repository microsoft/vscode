/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, isHTMLAnchorElement } from '../../../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ILanguageModelChatMetadata, ILanguageModelImageModel } from '../../../../common/languageModels.js';

/** One cost metric, with the value for each context tier. */
export interface IModelCostMetric {
	readonly label: string;
	readonly standard: number | null | undefined;
	readonly extended: number | null | undefined;
}

/** Shared disclosure state keeps pricing cards in step without rebuilding them. */
export interface IPricingDisclosure {
	isExpanded(): boolean;
	setExpanded(expanded: boolean): void;
	readonly onDidChange: Event<void>;
}

export function renderModelPricing(
	container: HTMLElement,
	metrics: readonly { readonly label: string; readonly cost: number | null | undefined }[],
	identifier: string,
	store: DisposableStore,
	disclosure?: IPricingDisclosure,
): HTMLElement {
	const section = append(container, $('.chat-model-card-section.chat-model-card-pricing'));
	section.classList.toggle('collapsible', !!disclosure);
	const bodyId = `chat-model-card-pricing-${identifier.replace(/[^\w-]/g, '-')}`;
	const heading = append(section, $(disclosure ? 'button.chat-model-card-pricing-toggle' : '.chat-model-card-section-heading'));
	let chevron: HTMLElement | undefined;
	if (disclosure) {
		heading.setAttribute('type', 'button');
		heading.setAttribute('aria-controls', bodyId);
		chevron = append(heading, $('span.chat-model-card-pricing-chevron', { 'aria-hidden': 'true' }));
		store.add(addDisposableListener(heading, EventType.CLICK, e => {
			EventHelper.stop(e, true);
			disclosure.setExpanded(!disclosure.isExpanded());
			update();
		}));
	}
	append(heading, $('span.chat-model-card-section-title', undefined, localize('models.pricingDetails', "Pricing details")));
	const body = append(section, $('.chat-model-card-pricing-body'));
	body.id = bodyId;
	const clip = append(body, $('.chat-model-card-pricing-body-clip'));
	const content = append(clip, $('.chat-model-card-pricing-body-content'));
	append(content, $('.chat-model-card-pricing-caption', undefined, getCreditsPerMillionTokensLabel()));
	for (const metric of metrics) {
		const row = append(content, $('.chat-model-card-pricing-row'));
		append(row, $('span.chat-model-card-pricing-label', undefined, metric.label));
		append(row, $('span.chat-model-card-pricing-value', undefined, formatModelCost(metric.cost)));
	}
	const update = () => {
		const expanded = disclosure?.isExpanded() ?? true;
		if (disclosure) {
			heading.setAttribute('aria-expanded', String(expanded));
		}
		if (chevron) {
			chevron.className = `chat-model-card-pricing-chevron ${ThemeIcon.asClassName(expanded ? Codicon.chevronDown : Codicon.chevronRight)}`;
		}
		body.classList.toggle('expanded', expanded);
		body.inert = !expanded;
		body.setAttribute('aria-hidden', String(!expanded));
	};
	if (disclosure) {
		store.add(disclosure.onDidChange(update));
	}
	update();
	return heading;
}

/** The cost metrics a model reports, in the order they are shown. */
export function getModelCostMetrics(metadata: ILanguageModelChatMetadata): IModelCostMetric[] {
	return [
		{ label: localize('models.inputCostLabel', "Input"), standard: metadata.inputCost, extended: metadata.longContextInputCost },
		{ label: localize('models.outputCostLabel', "Output"), standard: metadata.outputCost, extended: metadata.longContextOutputCost },
		{ label: localize('models.cacheCostLabel', "Cache Read"), standard: metadata.cacheCost, extended: metadata.longContextCacheCost },
		{ label: localize('models.cacheWriteCostLabel', "Cache Write"), standard: metadata.cacheWriteCost, extended: metadata.longContextCacheWriteCost },
	].filter(metric => metric.standard !== undefined || metric.extended !== undefined);
}

export function formatModelCost(cost: number | null | undefined): string {
	return typeof cost === 'number' ? String(cost) : localize('models.cost.unknown', "Unknown");
}

/** The unit the cost numbers are given in, stated once above them. */
export function getCreditsPerMillionTokensLabel(): string {
	return localize('models.creditsPerMillionTokens', "Credits per 1M tokens");
}

export function getMaxContextLabel(): string {
	return localize('models.contextSize', "Max context");
}

export function getImageModelOperationsLabel(model: ILanguageModelImageModel): string {
	const generates = model.supportedOperations.includes('generate');
	const edits = model.supportedOperations.includes('edit');
	return generates && edits ? localize('models.imageGenerationAndEditing', "Generate and edit images")
		: generates ? localize('models.imageGeneration', "Generate images")
			: edits ? localize('models.imageEditing', "Edit images") : '';
}

/** Catalog details deliberately have no chat-model selection or context-window controls. */
export function renderImageModelDetails(model: ILanguageModelImageModel, providerLabel: string, disclosure?: IPricingDisclosure): IDisposable & { readonly header: HTMLElement; readonly content: HTMLElement } {
	const store = new DisposableStore();
	const header = $('.chat-model-card-header');
	append(header, $('.chat-model-card-name', undefined, model.name));
	if (model.availability === 'unavailable') {
		append(header, $('.chat-model-card-badge', undefined, localize('models.imageUnavailable', "Not Available")));
	} else {
		append(header, $('.chat-model-card-badge', undefined, localize('models.imagePreview', "Preview")));
	}
	const content = $('.chat-model-card.chat-image-model-details');
	const identity = append(content, $('.chat-model-card-section'));
	append(identity, $('.chat-model-card-section-title', undefined, providerLabel));
	append(identity, $('code.chat-image-model-id', undefined, model.id));
	if (model.availability === 'unavailable') {
		append(content, $('p', undefined, localize('models.imageUnavailableDescription', "The runtime default image model is not available to this account. Enabling image generation does not grant access.")));
	} else {
		const operations = append(content, $('.chat-model-card-section'));
		append(operations, $('.chat-model-card-section-title', undefined, localize('models.imageOperations', "Supported Operations")));
		append(operations, $('p', undefined, getImageModelOperationsLabel(model)));
	}
	if (!model.isDefault) {
		append(content, $('p', undefined, localize('models.imageSwitchingUnavailable', "Available from the image service. This runtime does not yet support switching image models.")));
	}
	const prices = model.pricing;
	if (prices && (prices.textInputPrice !== undefined || prices.textOutputPrice !== undefined)) {
		let expanded = false;
		const metrics = [
			[localize('models.imageTextInputCost', "Text Input"), prices.textInputPrice],
			[localize('models.imageTextOutputCost', "Text Output"), prices.textOutputPrice],
		] as const;
		renderModelPricing(content, metrics.flatMap(([label, price]) => price === undefined ? [] : [{ label, cost: price / prices.batchSize * 1_000_000 }]),
			`image-${model.id}`, store, disclosure ?? {
				isExpanded: () => expanded,
				setExpanded: value => { expanded = value; },
				onDidChange: Event.None,
			});
	}
	append(content, $('p.chat-model-card-section', undefined, localize('models.imageActualUsage', "Actual usage and cost are shown after each image tool call.")));
	return { header, content, dispose: () => store.dispose() };
}

/** Renders a model's description markdown. The caller places and classes the element. */
export function renderModelDescription(tooltip: string, openerService: IOpenerService, store: DisposableStore, learnMoreUrl?: URI): { readonly element: HTMLElement; readonly learnMoreLink: HTMLAnchorElement | undefined } {
	const content = new MarkdownString(tooltip, { supportThemeIcons: true });
	if (learnMoreUrl) {
		content.appendMarkdown(tooltip ? ' ' : '').appendLink(learnMoreUrl, localize('chat.modelPicker.learnMore', "Learn more"));
	}
	const rendered = store.add(renderMarkdown(content, {
		actionHandler: link => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
	}));
	const possibleLearnMoreLink = learnMoreUrl ? rendered.element.lastElementChild?.lastElementChild : undefined;
	return {
		element: rendered.element,
		learnMoreLink: isHTMLAnchorElement(possibleLearnMoreLink) ? possibleLearnMoreLink : undefined,
	};
}
