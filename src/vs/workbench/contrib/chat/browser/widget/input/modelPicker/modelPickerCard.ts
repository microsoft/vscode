/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { IModelConfigurationAccess } from './modelPickerActionItem.js';
import { createMessageBanner } from './modelPickerHover.js';
import { getModelConfigProperty, getModelConfigValueLabel, IModelConfigProperty, isExtendedContext, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';
import { getCategoryLabel, getPriceCategoryLabel, isAutoModel, isHighCostCategory, isMultiplierPricing } from './modelPickerPresentation.js';
import { SegmentedControl } from './modelPickerSegmentedControl.js';

export interface IModelCardOptions {
	readonly model: ILanguageModelChatMetadataAndIdentifier;
	readonly configurationAccess: IModelConfigurationAccess;
	/** Whether the account is billed by credits, which is when cost numbers are shown. */
	readonly isUBB: boolean;
	readonly openerService: IOpenerService;
	/** Called after a configuration value changes so the caller can report it and refresh its own label. */
	readonly onDidChangeConfiguration?: (group: string, key: string, fromValue: unknown, toValue: unknown) => void;
	/** Whether the model is pinned, when pinning is offered here. */
	readonly isPinned?: boolean;
	readonly onTogglePin?: (pinned: boolean) => void;
}

/** One cost metric, with the value for each context tier. */
interface ICostMetric {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly standard: number | null | undefined;
	readonly extended: number | null | undefined;
}

/**
 * The detail card shown beside a model row: what the model costs, how hard it
 * thinks, and how much context it gets. Configuration changes are written
 * straight through and the card re-renders itself in place.
 */
export class ModelCard extends DisposableStore {

	readonly element = dom.$('.chat-model-card');

	private readonly _contentDisposables = this.add(new DisposableStore());

	constructor(private readonly _options: IModelCardOptions) {
		super();
		this._render();
	}

	private _configProperty(group: string): IModelConfigProperty | undefined {
		return getModelConfigProperty(this._options.model, this._options.configurationAccess, group);
	}

	private async _setValue(group: string, key: string, value: unknown): Promise<void> {
		const previous = this._configProperty(group)?.value;
		await this._options.configurationAccess.setModelConfiguration(this._options.model.identifier, { [key]: value });
		this._render();
		this._options.onDidChangeConfiguration?.(group, key, previous, value);
	}

	private _render(): void {
		this._contentDisposables.clear();
		dom.clearNode(this.element);

		const { model, isUBB, openerService } = this._options;
		const metadata = model.metadata;
		const isAuto = isAutoModel(model);

		this._renderHeader();

		if (!isAuto) {
			for (const message of Object.values(metadata.warningText ?? {})) {
				this.element.appendChild(createMessageBanner(message, 'chat-model-hover-warning-text', Codicon.warningCompact, this._contentDisposables, openerService));
			}
			for (const message of Object.values(metadata.infoText ?? {})) {
				this.element.appendChild(createMessageBanner(message, 'chat-model-hover-info-text', Codicon.info, this._contentDisposables, openerService));
			}
		}
		const promo = !isAuto && ILanguageModelChatMetadata.hasPromoDiscount(metadata) ? metadata.promo : undefined;
		if (promo) {
			const endsAtLabel = ILanguageModelChatMetadata.getPromoEndsAtLabel(promo.endsAt);
			const message = endsAtLabel ? `${promo.message} ${endsAtLabel}` : promo.message;
			this.element.appendChild(createMessageBanner(message, 'chat-model-hover-promo-text', Codicon.info, this._contentDisposables, openerService));
		}

		const effort = this._configProperty(MODEL_CONFIG_GROUP_EFFORT);
		const context = this._configProperty(MODEL_CONFIG_GROUP_CONTEXT);

		if (effort) {
			this._renderEffortSection(effort, isAuto);
		}
		if (context) {
			this._renderContextSection(context);
		} else if (!isAuto) {
			this._renderContextWindow(metadata);
		}
		if (!isAuto && isUBB) {
			this._renderCost(context);
		} else if (!isAuto && metadata.pricing && isMultiplierPricing(model)) {
			this._renderSection(localize('models.cost', "Cost: {0}", metadata.pricing));
		}
		if (!this.element.firstChild && metadata.tooltip) {
			this._renderDescription(metadata.tooltip);
		}
	}

	private _renderHeader(): void {
		const metadata = this._options.model.metadata;
		const isAuto = isAutoModel(this._options.model);
		const header = dom.append(this.element, dom.$('.chat-model-card-header'));
		dom.append(header, dom.$('.chat-model-card-name', undefined, metadata.name));

		const badgeLabel = isAuto
			? metadata.detail
			: getPriceCategoryLabel(metadata.priceCategory) ?? getCategoryLabel(metadata.category);
		if (badgeLabel) {
			const badge = dom.append(header, dom.$('span.chat-model-card-badge', undefined, badgeLabel));
			badge.classList.toggle('high-cost', !isAuto && isHighCostCategory(metadata.priceCategory));
		}

		// Pinning lives here rather than on the row: a control that only exists on hover
		// makes every row twitch as the pointer crosses the list.
		if (this._options.onTogglePin) {
			const pinned = !!this._options.isPinned;
			const label = pinned
				? localize('chat.modelPicker.unpin', "Unpin Model")
				: localize('chat.modelPicker.pin', "Pin Model");
			const button = dom.append(header, dom.$<HTMLButtonElement>('button.chat-model-card-pin'));
			button.type = 'button';
			button.classList.toggle('checked', pinned);
			button.setAttribute('aria-pressed', String(pinned));
			button.ariaLabel = label;
			button.title = label;
			dom.append(button, dom.$(`span${ThemeIcon.asCSSSelector(pinned ? Codicon.pinned : Codicon.pin)}`));
			this._contentDisposables.add(dom.addDisposableListener(button, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				this._options.onTogglePin?.(!pinned);
			}));
		}
	}

	private _renderDescription(tooltip: string): void {
		const rendered = this._contentDisposables.add(renderMarkdown(new MarkdownString(tooltip, { supportThemeIcons: true }), {
			actionHandler: link => { void this._options.openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
		}));
		rendered.element.classList.add('chat-model-card-description');
		this.element.appendChild(rendered.element);
	}

	private _renderSection(title: string, description?: string): HTMLElement {
		const section = dom.append(this.element, dom.$('.chat-model-card-section'));
		const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
		dom.append(heading, dom.$('.chat-model-card-section-title', undefined, title));
		if (description) {
			dom.append(section, dom.$('.chat-model-card-section-description', undefined, description));
		}
		return section;
	}

	private _renderEffortSection(effort: IModelConfigProperty, isAuto: boolean): void {
		this._renderChoiceSection(effort, MODEL_CONFIG_GROUP_EFFORT, effort.schema.title ?? (isAuto
			? localize('models.routingProfile', "Routing Profile")
			: localize('chat.effort.header', "Thinking Effort")));
	}

	/**
	 * The context windows the model can be given. Rendered like every other setting
	 * whether the producer offers two or five: a switch would read as off/on, but
	 * neither window is "off", and it would hide the one being chosen between.
	 */
	private _renderContextSection(context: IModelConfigProperty): void {
		// No description: a context window is fully described by its own size, which the
		// segment already states, so anything above it only repeats or pads it.
		this._renderChoiceSection(context, MODEL_CONFIG_GROUP_CONTEXT, context.schema.title ?? localize('chat.context.header', "Context"), false);
	}

	/**
	 * One setting: its name, what the producer says about the value in effect, and the
	 * choices. Every setting is built this way, so they stack without each inventing a
	 * shape of its own.
	 */
	private _renderChoiceSection(property: IModelConfigProperty, group: string, title: string, describeValue = true): void {
		const values = property.schema.enum ?? [];
		const selected = values.indexOf(property.value);
		const description = describeValue && selected >= 0 ? property.schema.enumDescriptions?.[selected] : undefined;
		const section = this._renderSection(title, description);
		const control = this._contentDisposables.add(new SegmentedControl({
			ariaLabel: title,
			options: values.map((value, index) => ({
				label: getModelConfigValueLabel(property.schema, value),
				description: property.schema.enumDescriptions?.[index],
				checked: value === property.value,
			})),
			onSelect: index => void this._setValue(group, property.key, values[index]),
		}));
		section.appendChild(control.domNode);
	}

	private _renderContextWindow(metadata: ILanguageModelChatMetadata): void {
		const total = (metadata.maxInputTokens ?? 0) + (metadata.maxOutputTokens ?? 0);
		if (!total) {
			return;
		}
		const section = dom.append(this.element, dom.$('.chat-model-card-section'));
		const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
		dom.append(heading, dom.$('.chat-model-card-section-title', undefined, localize('models.contextSize', "Max context")));
		dom.append(heading, dom.$('.chat-model-card-section-value', undefined, formatTokenCount(total)));
	}

	private _renderCost(context: IModelConfigProperty | undefined): void {
		const metadata = this._options.model.metadata;
		const metrics: ICostMetric[] = [
			{ label: localize('models.inputCostLabel', "Input"), icon: Codicon.arrowDown, standard: metadata.inputCost, extended: metadata.longContextInputCost },
			{ label: localize('models.outputCostLabel', "Output"), icon: Codicon.arrowUp, standard: metadata.outputCost, extended: metadata.longContextOutputCost },
			{ label: localize('models.cacheCostLabel', "Cache Read"), icon: Codicon.arrowCircleDown, standard: metadata.cacheCost, extended: metadata.longContextCacheCost },
			{ label: localize('models.cacheWriteCostLabel', "Cache Write"), icon: Codicon.arrowCircleUp, standard: metadata.cacheWriteCost, extended: metadata.longContextCacheWriteCost },
		].filter(metric => metric.standard !== undefined || metric.extended !== undefined);
		if (!metrics.length) {
			if (metadata.pricing) {
				this._renderSection(localize('models.cost', "Cost: {0}", metadata.pricing));
			}
			return;
		}

		const useExtended = !!context && isExtendedContext(context);
		const section = dom.append(this.element, dom.$('.chat-model-card-section.chat-model-card-cost'));
		const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
		dom.append(heading, dom.$('.chat-model-card-section-title', undefined, localize('models.creditsPerMillionTokens', "Credits Per 1M Tokens")));

		const row = dom.append(section, dom.$('.chat-model-card-cost-row'));
		for (const metric of metrics) {
			const cost = useExtended ? metric.extended ?? metric.standard : metric.standard;
			const cell = dom.append(row, dom.$('.chat-model-card-cost-metric'));
			cell.title = metric.label;
			cell.ariaLabel = localize('models.costMetricAria', "{0}: {1}", metric.label, formatCost(cost));
			dom.append(cell, dom.$(`span.chat-model-card-cost-icon${ThemeIcon.asCSSSelector(metric.icon)}`));
			dom.append(cell, dom.$('span.chat-model-card-cost-value', undefined, formatCost(cost)));
		}
	}

}

function formatCost(cost: number | null | undefined): string {
	return typeof cost === 'number' ? String(cost) : localize('models.cost.unknown', "Unknown");
}
