/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modelPicker.css';

import * as dom from '../../../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { localize } from '../../../../../../../nls.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { getPriceCategoryLabel, isAutoModel, isMultiplierPricing } from './modelPickerPresentation.js';

const SUPPORTED_CONFIG_GROUPS: readonly string[] = ['navigation', 'tokens'];

export interface IModelPickerHoverContent {
	readonly element: HTMLElement;
	readonly disposable: DisposableStore;
}

export function getModelHoverContent(
	model: ILanguageModelChatMetadataAndIdentifier,
	isUBB: boolean | undefined,
	onConfigure: ((group: string) => void) | undefined,
	openerService: IOpenerService,
): IModelPickerHoverContent | undefined {
	const isAuto = isAutoModel(model);
	const promo = !isAuto && ILanguageModelChatMetadata.hasPromoDiscount(model.metadata) ? model.metadata.promo : undefined;
	const container = dom.$('.chat-model-hover');
	const disposables = new DisposableStore();

	const titleRow = dom.$('.chat-model-hover-title-row');
	titleRow.appendChild(dom.$('.chat-model-hover-name', undefined, model.metadata.name));
	const tags = dom.$('.chat-model-hover-title-tags');
	const categoryLabel = !isAuto && !promo ? getCategoryLabel(model.metadata.category) : undefined;
	if (categoryLabel) {
		tags.appendChild(dom.$('span.chat-model-hover-category', undefined, categoryLabel));
	}
	const priceCategoryLabel = !isAuto ? getPriceCategoryLabel(model.metadata.priceCategory) : undefined;
	const badgeLabel = isAuto ? model.metadata.detail : priceCategoryLabel;
	if (badgeLabel) {
		const badge = dom.$('span.chat-model-hover-price-badge', undefined, badgeLabel);
		if (!isAuto && isHighCostCategory(model.metadata.priceCategory)) {
			badge.classList.add('high-cost');
		}
		tags.appendChild(badge);
	}
	if (promo) {
		const discountLabel = localize('chat.promo.discountBadge', "{0}% discount", promo.discountPercent);
		tags.appendChild(dom.$('span.chat-model-hover-price-badge', undefined, discountLabel));
	}
	if (tags.childElementCount > 0) {
		titleRow.appendChild(tags);
	}
	container.appendChild(titleRow);

	if (!isAuto && model.metadata.warningText) {
		for (const message of Object.values(model.metadata.warningText)) {
			const warningContainer = dom.$('.chat-model-hover-warning-text');
			warningContainer.appendChild(renderIcon(Codicon.warning));
			const warningMd = new MarkdownString(message, { isTrusted: false, supportThemeIcons: true });
			const rendered = disposables.add(renderMarkdown(warningMd, {
				actionHandler: link => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
			}));
			warningContainer.appendChild(rendered.element);
			container.appendChild(warningContainer);
		}
	}

	if (promo) {
		const promoContainer = dom.$('.chat-model-hover-promo-text');
		promoContainer.appendChild(renderIcon(Codicon.info));
		const endsAtDate = new Date(promo.endsAt);
		const formattedDate = endsAtDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
		const promoMessage = promo.message + ' ' + localize('chat.promo.endsAt', "Ends {0}.", formattedDate);
		const promoMd = new MarkdownString(promoMessage, { isTrusted: false, supportThemeIcons: true });
		const rendered = disposables.add(renderMarkdown(promoMd, {
			actionHandler: link => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
		}));
		promoContainer.appendChild(rendered.element);
		container.appendChild(promoContainer);
	}

	let costInfoRendered = false;
	let costTableRendered = false;
	if (!isAuto && isUBB) {
		const metrics: { label: string; def: number | null | undefined; long: number | null | undefined }[] = [
			{ label: localize('models.inputCostLabel', "Input"), def: model.metadata.inputCost, long: model.metadata.longContextInputCost },
			{ label: localize('models.outputCostLabel', "Output"), def: model.metadata.outputCost, long: model.metadata.longContextOutputCost },
			{ label: localize('models.cacheCostLabel', "Cache Read"), def: model.metadata.cacheCost, long: model.metadata.longContextCacheCost },
			{ label: localize('models.cacheWriteCostLabel', "Cache Write"), def: model.metadata.cacheWriteCost, long: model.metadata.longContextCacheWriteCost },
		].filter(metric => metric.def !== undefined || metric.long !== undefined);

		if (metrics.length > 0) {
			const hasLongContext = metrics.some(metric => metric.long !== undefined);
			const table = dom.$('.chat-model-hover-cost-table');
			if (hasLongContext) {
				container.classList.add('has-long-context');
				table.classList.add('has-long-context');
			}

			const appendValueCell = (row: HTMLElement, cost: number | null | undefined): void => {
				if (cost === undefined) {
					row.appendChild(dom.$('span.chat-model-hover-cost-value.empty'));
					return;
				}
				row.appendChild(dom.$('span.chat-model-hover-cost-value', undefined,
					dom.$('span.chat-model-hover-cost-number', undefined,
						typeof cost === 'number' ? String(cost) : localize('models.cost.unknown', "Unknown")),
				));
			};

			const headerRow = dom.$('.chat-model-hover-cost-row.header');
			headerRow.appendChild(dom.$('span.chat-model-hover-cost-heading', undefined, localize('models.creditsPerMillionTokens', "Credits Per 1M Tokens")));
			if (hasLongContext) {
				headerRow.appendChild(dom.$('span.chat-model-hover-cost-value.subheader', undefined, localize('models.defaultContext', "Default")));
				headerRow.appendChild(dom.$('span.chat-model-hover-cost-value.subheader', undefined, localize('models.longContext', "Long Context")));
			} else {
				headerRow.appendChild(dom.$('span.chat-model-hover-cost-value.subheader'));
			}
			table.appendChild(headerRow);

			for (const metric of metrics) {
				const row = dom.$('.chat-model-hover-cost-row');
				const labelCell = dom.$('.chat-model-hover-cost-label');
				labelCell.appendChild(dom.$('span.chat-model-hover-cost-label-text', undefined, metric.label));
				row.appendChild(labelCell);
				appendValueCell(row, metric.def);
				if (hasLongContext) {
					appendValueCell(row, metric.long);
				}
				table.appendChild(row);
			}

			container.appendChild(table);
			costTableRendered = true;
			costInfoRendered = true;
		} else if (model.metadata.pricing && (isMultiplierPricing(model) || !priceCategoryLabel)) {
			appendCostSection(container, model.metadata.pricing);
			costInfoRendered = true;
		}
	} else if (!isAuto && model.metadata.pricing) {
		appendCostSection(container, model.metadata.pricing);
		costInfoRendered = true;
	}

	if (!costInfoRendered && model.metadata.tooltip) {
		const descriptionMd = new MarkdownString(model.metadata.tooltip, { supportThemeIcons: true });
		const rendered = disposables.add(renderMarkdown(descriptionMd, {
			actionHandler: link => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
		}));
		rendered.element.classList.add('chat-model-hover-description');
		container.appendChild(rendered.element);
	}

	if (!isAuto && !costTableRendered && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
		const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
		const contextSection = dom.$('.chat-model-hover-context');
		contextSection.appendChild(dom.$('.chat-model-hover-context-label', undefined, localize('models.contextSize', "Max context")));
		contextSection.appendChild(dom.$('.chat-model-hover-context-value', undefined, formatTokenCount(totalTokens)));
		container.appendChild(contextSection);
	}

	if (!isAuto && model.metadata.configurationSchema?.properties) {
		const configButtons: { group: string; label: string }[] = [];
		const seenGroups = new Set<string>();
		for (const propSchema of Object.values(model.metadata.configurationSchema.properties)) {
			if (propSchema.enum && propSchema.enum.length >= 2 && propSchema.group && SUPPORTED_CONFIG_GROUPS.includes(propSchema.group) && !seenGroups.has(propSchema.group)) {
				const label = propSchema.title ?? propSchema.description;
				if (label) {
					seenGroups.add(propSchema.group);
					configButtons.push({ group: propSchema.group, label });
				}
			}
		}
		if (configButtons.length > 0) {
			const configRow = dom.$('.chat-model-hover-configurable');
			configRow.appendChild(dom.$('span.chat-model-hover-configurable-label', undefined, localize('models.configurable', "Configurable")));
			const buttonsContainer = dom.$('.chat-model-hover-configurable-buttons');
			for (const { group, label } of configButtons) {
				const button = disposables.add(new Button(buttonsContainer, {
					...defaultButtonStyles,
					secondary: true,
					title: label,
				}));
				button.label = label;
				disposables.add(button.onDidClick(() => onConfigure?.(group)));
			}
			configRow.appendChild(buttonsContainer);
			container.appendChild(configRow);
		}
	}

	return container.children.length > 0 ? { element: container, disposable: disposables } : undefined;
}

function appendCostSection(container: HTMLElement, pricing: string): void {
	const costSection = dom.$('.chat-model-hover-cost');
	costSection.appendChild(dom.$('span', undefined, localize('models.cost', "Cost: {0}", pricing)));
	container.appendChild(costSection);
}

function isHighCostCategory(priceCategory: string | undefined): boolean {
	return priceCategory === 'high' || priceCategory === 'very_high';
}

function getCategoryLabel(category: string | undefined): string | undefined {
	switch (category) {
		case undefined:
		case '':
			return undefined;
		case 'lightweight':
			return localize('chat.category.lightweight', "Lightweight");
		case 'versatile':
			return localize('chat.category.versatile', "Versatile");
		case 'powerful':
			return localize('chat.category.powerful', "Powerful");
		default:
			return typeof category === 'string'
				? category.charAt(0).toUpperCase() + category.slice(1)
				: undefined;
	}
}
