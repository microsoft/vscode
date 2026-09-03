/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../../base/common/event.js';
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
import { IModelSpeedVariants } from './modelPickerVariants.js';

/**
 * Whether the pricing breakdown is open, shared by every card. Most people never need
 * the numbers, and the ones who do should not have to open them on each model.
 */
export interface IPricingDisclosure {
	isExpanded(): boolean;
	setExpanded(expanded: boolean): void;
	/** Fires when the state changes, so cards already built stay in step. */
	readonly onDidChange: Event<void>;
}

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
	readonly pricingDisclosure?: IPricingDisclosure;
	/** The faster twin of this model, when the provider offers one. */
	readonly speedVariants?: IModelSpeedVariants;
	/** Called with the twin the user picked, which becomes the selected model. */
	readonly onSelectVariant?: (model: ILanguageModelChatMetadataAndIdentifier) => void;
}

/** One cost metric, with the value for each context tier. */
interface ICostMetric {
	readonly label: string;
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
	/** The pricing disclosure's button, rebuilt with the rest of the card on each render. */
	private _pricingToggle: HTMLElement | undefined;

	constructor(private readonly _options: IModelCardOptions) {
		super();
		if (_options.pricingDisclosure) {
			// Opening the breakdown on one model opens it on the rest, so cards built
			// earlier are re-rendered rather than left showing the old state.
			this.add(_options.pricingDisclosure.onDidChange(() => this._render()));
		}
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
		this._pricingToggle = undefined;

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
		// After the settings every model has, so those keep one position whether or not
		// this model happens to have a faster twin.
		if (!isAuto) {
			this._renderSpeedSection();
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

	private _renderSection(title: string): HTMLElement {
		const section = dom.append(this.element, dom.$('.chat-model-card-section'));
		const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
		dom.append(heading, dom.$('.chat-model-card-section-title', undefined, title));
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
		this._renderChoiceSection(context, MODEL_CONFIG_GROUP_CONTEXT, context.schema.title ?? localize('chat.context.header', "Context"));
	}

	/**
	 * One setting: its name and the choices. Every setting is built this way, so they
	 * stack without each inventing a shape of its own.
	 *
	 * The value is not described above the control: these are ordered scales whose
	 * labels already say what they mean, so a line restating "Max" as "absolute maximum
	 * capability" only pads the card. The producer's wording stays on each segment's
	 * own tooltip for anyone who wants it.
	 */
	private _renderChoiceSection(property: IModelConfigProperty, group: string, title: string): void {
		const values = property.schema.enum ?? [];
		const section = this._renderSection(title);
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

	/**
	 * The two speeds the provider offers the same model at. Picking one selects that
	 * model, the same way changing any other setting here does, since the twins are
	 * separate models with their own prices. Placed last so the settings every model
	 * has keep one position whether or not this one has a twin.
	 */
	private _renderSpeedSection(): void {
		const variants = this._options.speedVariants;
		if (!variants) {
			return;
		}
		const choices = [
			{ label: localize('models.speed.standard', "Standard"), model: variants.standard },
			{ label: localize('models.speed.fast', "Fast"), model: variants.fast },
		];
		const title = localize('models.speed', "Speed");
		const section = this._renderSection(title);
		const control = this._contentDisposables.add(new SegmentedControl({
			ariaLabel: title,
			options: choices.map(choice => ({
				label: choice.label,
				checked: choice.model.identifier === this._options.model.identifier,
			})),
			onSelect: index => {
				const next = choices[index].model;
				if (next.identifier !== this._options.model.identifier) {
					this._options.onSelectVariant?.(next);
				}
			},
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
			{ label: localize('models.inputCostLabel', "Input"), standard: metadata.inputCost, extended: metadata.longContextInputCost },
			{ label: localize('models.outputCostLabel', "Output"), standard: metadata.outputCost, extended: metadata.longContextOutputCost },
			{ label: localize('models.cacheCostLabel', "Cache Read"), standard: metadata.cacheCost, extended: metadata.longContextCacheCost },
			{ label: localize('models.cacheWriteCostLabel', "Cache Write"), standard: metadata.cacheWriteCost, extended: metadata.longContextCacheWriteCost },
		].filter(metric => metric.standard !== undefined || metric.extended !== undefined);
		if (!metrics.length) {
			if (metadata.pricing) {
				this._renderSection(localize('models.cost', "Cost: {0}", metadata.pricing));
			}
			return;
		}

		const useExtended = !!context && isExtendedContext(context);
		const disclosure = this._options.pricingDisclosure;
		const expanded = disclosure ? disclosure.isExpanded() : true;
		const section = dom.append(this.element, dom.$('.chat-model-card-section.chat-model-card-pricing'));
		const bodyId = `chat-model-card-pricing-${this._options.model.identifier.replace(/[^\w-]/g, '-')}`;

		// Folded away by default: the numbers only matter to the people who go looking
		// for them, and they are the last thing most people need to read.
		if (disclosure) {
			const title = localize('models.pricingDetails', "Pricing details");
			const toggle = dom.append(section, dom.$<HTMLButtonElement>('button.chat-model-card-pricing-toggle'));
			toggle.type = 'button';
			toggle.setAttribute('aria-expanded', String(expanded));
			toggle.setAttribute('aria-controls', bodyId);
			dom.append(toggle, dom.$('span.chat-model-card-section-title', undefined, title));
			dom.append(toggle, dom.$(`span.chat-model-card-pricing-chevron${ThemeIcon.asCSSSelector(expanded ? Codicon.chevronDown : Codicon.chevronRight)}`));
			this._pricingToggle = toggle;
			this._contentDisposables.add(dom.addDisposableListener(toggle, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				const hadFocus = dom.isActiveElement(toggle);
				disclosure.setExpanded(!expanded);
				// The click rebuilt this card, so focus has to land on the button that
				// replaced the one that was pressed.
				if (hadFocus) {
					this._pricingToggle?.focus();
				}
			}));
		}
		if (!expanded) {
			return;
		}

		const body = dom.append(section, dom.$('.chat-model-card-pricing-body'));
		body.id = bodyId;
		// The unit is stated once, so each row can be read as a plain name and number.
		dom.append(body, dom.$('.chat-model-card-pricing-caption', undefined, localize('models.creditsPerMillionTokens', "Credits per 1M tokens")));
		for (const metric of metrics) {
			const cost = useExtended ? metric.extended ?? metric.standard : metric.standard;
			const row = dom.append(body, dom.$('.chat-model-card-pricing-row'));
			dom.append(row, dom.$('span.chat-model-card-pricing-label', undefined, metric.label));
			dom.append(row, dom.$('span.chat-model-card-pricing-value', undefined, formatCost(cost)));
		}
	}

}

function formatCost(cost: number | null | undefined): string {
	return typeof cost === 'number' ? String(cost) : localize('models.cost.unknown', "Unknown");
}
