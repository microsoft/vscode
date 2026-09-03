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
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { formatModelCost, getCreditsPerMillionTokensLabel, getMaxContextLabel, getModelContextWindowTotal, getModelCostMetrics, renderModelDescription } from './modelPickerDetails.js';
import { MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';
import { getCategoryLabel, getPriceCategoryLabel, isAutoModel, isHighCostCategory, isMultiplierPricing } from './modelPickerPresentation.js';

const SUPPORTED_CONFIG_GROUPS: readonly string[] = [MODEL_CONFIG_GROUP_EFFORT, MODEL_CONFIG_GROUP_CONTEXT];

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
			container.appendChild(createMessageBanner(message, 'chat-model-hover-warning-text', Codicon.warningCompact, disposables, openerService));
		}
	}

	if (!isAuto && model.metadata.infoText) {
		for (const message of Object.values(model.metadata.infoText)) {
			container.appendChild(createMessageBanner(message, 'chat-model-hover-info-text', Codicon.info, disposables, openerService));
		}
	}

	if (promo) {
		const endsAtLabel = ILanguageModelChatMetadata.getPromoEndsAtLabel(promo.endsAt);
		const promoMessage = endsAtLabel ? promo.message + ' ' + endsAtLabel : promo.message;
		container.appendChild(createMessageBanner(promoMessage, 'chat-model-hover-promo-text', Codicon.info, disposables, openerService));
	}

	let costInfoRendered = false;
	let costTableRendered = false;
	if (!isAuto && isUBB) {
		const metrics = getModelCostMetrics(model.metadata);

		if (metrics.length > 0) {
			const hasLongContext = metrics.some(metric => metric.extended !== undefined);
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
					dom.$('span.chat-model-hover-cost-number', undefined, formatModelCost(cost)),
				));
			};

			const headerRow = dom.$('.chat-model-hover-cost-row.header');
			headerRow.appendChild(dom.$('span.chat-model-hover-cost-heading', undefined, getCreditsPerMillionTokensLabel()));
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
				appendValueCell(row, metric.standard);
				if (hasLongContext) {
					appendValueCell(row, metric.extended);
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
		const element = renderModelDescription(model.metadata.tooltip, openerService, disposables);
		element.classList.add('chat-model-hover-description');
		container.appendChild(element);
	}

	if (!isAuto && !costTableRendered && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
		const totalTokens = getModelContextWindowTotal(model.metadata);
		const contextSection = dom.$('.chat-model-hover-context');
		contextSection.appendChild(dom.$('.chat-model-hover-context-label', undefined, getMaxContextLabel()));
		contextSection.appendChild(dom.$('.chat-model-hover-context-value', undefined, formatTokenCount(totalTokens)));
		container.appendChild(contextSection);
	}

	// Auto has no per-model pricing to show, but it does expose a routing tier,
	// so the configurable section is not gated on `isAuto`.
	if (model.metadata.configurationSchema?.properties) {
		const configButtons: { group: string; label: string }[] = [];
		const seenGroups = new Set<string>();
		for (const propSchema of Object.values(model.metadata.configurationSchema.properties)) {
			if (propSchema.enum && propSchema.enum.length >= 2 && propSchema.group && SUPPORTED_CONFIG_GROUPS.includes(propSchema.group) && !seenGroups.has(propSchema.group)) {
				// Auto's navigation option is its routing tier; the menu keeps the producer's "Optimize for…" title.
				const label = isAuto && propSchema.group === MODEL_CONFIG_GROUP_EFFORT ? localize('models.routingProfile', "Routing Profile") : propSchema.title ?? propSchema.description;
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

/**
 * Builds one bordered message banner (an icon plus a rendered markdown message)
 * for the warning, info and promo notices shown at the top of the hover.
 */
export function createMessageBanner(message: string, className: string, icon: ThemeIcon, disposables: DisposableStore, openerService: IOpenerService): HTMLElement {
	const banner = dom.$(`.${className}`);
	banner.appendChild(renderIcon(icon));
	const markdown = new MarkdownString(message, { isTrusted: false, supportThemeIcons: true });
	const rendered = disposables.add(renderMarkdown(markdown, {
		actionHandler: link => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
	}));
	banner.appendChild(rendered.element);
	return banner;
}

function appendCostSection(container: HTMLElement, pricing: string): void {
	const costSection = dom.$('.chat-model-hover-cost');
	costSection.appendChild(dom.$('span', undefined, localize('models.cost', "Cost: {0}", pricing)));
	container.appendChild(costSection);
}
