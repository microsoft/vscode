/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Radio } from '../../../../../../../base/browser/ui/radio/radio.js';
import { Action } from '../../../../../../../base/common/actions.js';
import { Sequencer } from '../../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { formatModelCost, getCreditsPerMillionTokensLabel, getMaxContextLabel, getModelContextWindowTotal, getModelCostMetrics, renderModelDescription } from './modelPickerDetails.js';
import { createMessageBanner } from './modelPickerHover.js';
import { getChangedModelConfigProperties, getModelConfigProperty, getModelConfigValueLabel, IModelConfigProperty, IModelConfigurationAccess, isExtendedContext, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';
import { getCategoryLabel, getPriceCategoryLabel, isAutoModel, isHighCostCategory, isMultiplierPricing } from './modelPickerPresentation.js';
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
	/** Marks the start of a model-affecting interaction, before an asynchronous save. */
	readonly onWillSelect?: () => void;
	/** Selects the model for the latest saved configuration or speed choice. */
	readonly onSelect?: (model: ILanguageModelChatMetadataAndIdentifier) => void;
	/** Called once the selection settles so the picker can refresh its rows. */
	readonly onDidAccept?: () => void;
}

/**
 * The detail card shown beside a model row: what the model costs, how hard it
 * thinks, and how much context it gets. Configuration changes are written
 * straight through and the card re-renders itself in place.
 */
export class ModelCard extends DisposableStore {

	readonly element = dom.$('.chat-model-card');

	private readonly _contentDisposables = this.add(new DisposableStore());
	private readonly _configurationChanges = new Sequencer();
	private readonly _groupControls = new Map<string, Radio>();
	private readonly _pricingDisclosureListener = this.add(new MutableDisposable());
	private _configurationChangeVersion = 0;
	private _headerActions: ActionBar | undefined;
	/** The pricing disclosure's button, rebuilt with the rest of the card on each render. */
	private _pricingToggle: HTMLElement | undefined;
	private _pricingChevron: HTMLElement | undefined;
	private _pricingBody: HTMLElement | undefined;

	constructor(private _options: IModelCardOptions) {
		super();
		this._pricingDisclosureListener.value = _options.pricingDisclosure?.onDidChange(() => this._updatePricingDisclosure());
		this._render();
	}

	/** Refreshes model and pin state without replacing the card or moving keyboard focus. */
	update(options: IModelCardOptions): void {
		const disclosureChanged = options.pricingDisclosure !== this._options.pricingDisclosure;
		const changed = options.model !== this._options.model || options.isPinned !== this._options.isPinned || disclosureChanged;
		if (options.model.identifier !== this._options.model.identifier) {
			this._configurationChangeVersion++;
		}
		this._options = options;
		if (disclosureChanged) {
			this._pricingDisclosureListener.value = options.pricingDisclosure?.onDidChange(() => this._updatePricingDisclosure());
		}
		if (changed) {
			this._renderPreservingFocus();
		}
	}

	private _configProperty(group: string): IModelConfigProperty | undefined {
		return getModelConfigProperty(this._options.model, this._options.configurationAccess, group);
	}

	private async _setValues(values: IStringDictionary<unknown>, focusedGroup?: string): Promise<void> {
		const options = this._options;
		const version = ++this._configurationChangeVersion;
		options.onWillSelect?.();
		for (const [group, control] of this._groupControls) {
			const property = getModelConfigProperty(options.model, options.configurationAccess, group);
			if (property && Object.hasOwn(values, property.key)) {
				control.setActiveItem(Math.max(0, property.schema.enum?.indexOf(values[property.key]) ?? -1));
			}
		}
		try {
			const changes = await this._configurationChanges.queue(async () => {
				const changes = [MODEL_CONFIG_GROUP_EFFORT, MODEL_CONFIG_GROUP_CONTEXT].flatMap(group => {
					const property = getModelConfigProperty(options.model, options.configurationAccess, group);
					return property && Object.hasOwn(values, property.key) && property.value !== values[property.key]
						? [{ group, key: property.key, fromValue: property.value, toValue: values[property.key] }]
						: [];
				});
				await options.configurationAccess.setModelConfiguration(options.model.identifier, values);
				return changes;
			});
			for (const change of changes) {
				options.onDidChangeConfiguration?.(change.group, change.key, change.fromValue, change.toValue);
			}
			if (!this.isDisposed && version === this._configurationChangeVersion) {
				options.onSelect?.(options.model);
			}
			await Promise.all([...this._groupControls.values()].map(control => control.whenSelectionAnimationSettles()));
		} finally {
			if (!this.isDisposed && version === this._configurationChangeVersion) {
				this._renderPreservingFocus(focusedGroup);
			}
		}
		if (!this.isDisposed && version === this._configurationChangeVersion) {
			options.onDidAccept?.();
		}
	}

	private _renderPreservingFocus(fallbackGroup?: string): void {
		const hadFocus = this.element.contains(dom.getActiveElement());
		const focusedControl = [...this._groupControls].find(([, control]) => dom.isAncestorOfActiveElement(control.domNode));
		const group = focusedControl?.[0] ?? fallbackGroup;
		const optionIndex = focusedControl?.[1].optionElements.findIndex(element => dom.isActiveElement(element));
		const actionId = this._headerActions?.viewItems.find((_, index) => this._headerActions?.isFocused(index))?.action.id;
		const pricingFocused = this._pricingToggle && dom.isActiveElement(this._pricingToggle);
		this._render();
		if (!hadFocus) {
			return;
		}
		const actionIndex = this._headerActions?.viewItems.findIndex(item => item.action.id === actionId) ?? -1;
		if (pricingFocused) {
			this._pricingToggle?.focus();
		} else if (actionIndex >= 0) {
			this._headerActions?.focus(actionIndex);
		} else {
			this._restoreFocus(group, optionIndex);
		}
	}

	private _restoreFocus(group?: string, optionIndex?: number): void {
		const control = group ? this._groupControls.get(group) : undefined;
		if (control) {
			if (optionIndex !== undefined && control.optionElements[optionIndex]) {
				control.focusItem(optionIndex);
			} else {
				control.focusActiveItem();
			}
		} else if (this._headerActions) {
			this._headerActions.focus();
		} else {
			this._groupControls.values().next().value?.focusActiveItem();
		}
	}

	private _render(): void {
		this._contentDisposables.clear();
		dom.clearNode(this.element);
		this._pricingToggle = undefined;
		this._pricingChevron = undefined;
		this._pricingBody = undefined;
		this._headerActions = undefined;
		this._groupControls.clear();

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
			: this._showsPriceBadgeInPricing()
				? undefined
				: getPriceCategoryLabel(metadata.priceCategory) ?? getCategoryLabel(metadata.category);
		if (badgeLabel) {
			this._renderBadge(header, badgeLabel, !isAuto && isHighCostCategory(metadata.priceCategory));
		}

		const changed = getChangedModelConfigProperties(this._options.model, this._options.configurationAccess);
		if (!changed.length && !this._options.onTogglePin) {
			return;
		}
		const container = dom.append(header, dom.$('.chat-model-card-actions'));
		const actions = this._contentDisposables.add(new ActionBar(container, {
			ariaLabel: localize('chat.modelPicker.modelActions', "Model Actions"),
		}));
		this._headerActions = actions;
		this._contentDisposables.add(actions.onDidRun(event => {
			if (event.error) {
				onUnexpectedError(event.error);
			}
		}));
		if (changed.length) {
			const reset = this._contentDisposables.add(new Action(
				'chat.modelPicker.resetToDefault',
				localize('chat.modelPicker.resetToDefault', "Reset to Default"),
				ThemeIcon.asClassName(Codicon.discard),
				true,
				() => this._resetToDefaults().catch(onUnexpectedError),
			));
			actions.push(reset, { icon: true, label: false });
		}
		if (this._options.onTogglePin) {
			const pinned = !!this._options.isPinned;
			const label = pinned
				? localize('chat.modelPicker.unpin', "Unpin Model")
				: localize('chat.modelPicker.pin', "Pin Model");
			const pin = this._contentDisposables.add(new Action(
				'chat.modelPicker.pin',
				label,
				ThemeIcon.asClassName(pinned ? Codicon.pinned : Codicon.pin),
				true,
				async () => this._options.onTogglePin?.(!pinned),
			));
			pin.checked = pinned;
			actions.push(pin, { icon: true, label: false });
		}
	}

	private async _resetToDefaults(): Promise<void> {
		const values = Object.fromEntries([...this._groupControls.keys()].flatMap(group => {
			const property = this._configProperty(group);
			return property ? [[property.key, property.schema.default]] : [];
		}));
		await this._setValues(values);
	}

	private _showsPriceBadgeInPricing(): boolean {
		const metadata = this._options.model.metadata;
		return this._options.isUBB && !!getPriceCategoryLabel(metadata.priceCategory) && getModelCostMetrics(metadata).length > 0;
	}

	private _renderBadge(container: HTMLElement, label: string, highCost: boolean): void {
		const badge = dom.append(container, dom.$('span.chat-model-card-badge', undefined, label));
		badge.classList.toggle('high-cost', highCost);
	}

	private _renderDescription(tooltip: string): void {
		const element = renderModelDescription(tooltip, this._options.openerService, this._contentDisposables);
		element.classList.add('chat-model-card-description');
		this.element.appendChild(element);
	}

	private _renderSection(title: string): HTMLElement {
		const section = dom.append(this.element, dom.$('.chat-model-card-section'));
		const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
		dom.append(heading, dom.$('.chat-model-card-section-title', undefined, title));
		return section;
	}

	private _renderEffortSection(effort: IModelConfigProperty, isAuto: boolean): void {
		this._renderChoiceSection(effort, MODEL_CONFIG_GROUP_EFFORT, effort.schema.title ?? (isAuto
			? localize('models.optimizeFor', "Optimize for")
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
	 * One setting: its name and the choices. The value is not described above the
	 * control, since these are ordered scales whose labels already say what they mean.
	 */
	private _renderChoiceSection(property: IModelConfigProperty, group: string, title: string): void {
		const values = property.schema.enum ?? [];
		const section = this._renderSection(title);
		const control = this._contentDisposables.add(new Radio({
			ariaLabel: title,
			className: 'segmented',
			// Arrow keys move focus without changing the model's configuration.
			arrowKeyBehavior: 'focus',
			items: values.map((value, index) => ({
				text: getModelConfigValueLabel(property.schema, value),
				tooltip: property.schema.enumDescriptions?.[index],
				isActive: value === property.value,
			})),
		}));
		this._contentDisposables.add(control.onDidSelect(index => {
			this._setValues({ [property.key]: values[index] }, group).catch(onUnexpectedError);
		}));
		this._groupControls.set(group, control);
		section.appendChild(control.domNode);
	}

	/**
	 * The two speeds the provider offers the same model at. Picking one selects that
	 * model, since the twins are separate models with their own prices.
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
		const control = this._contentDisposables.add(new Radio({
			ariaLabel: title,
			className: 'segmented',
			arrowKeyBehavior: 'focus',
			items: choices.map(choice => ({
				text: choice.label,
				isActive: choice.model.identifier === this._options.model.identifier,
			})),
		}));
		this._contentDisposables.add(control.onDidSelect(index => {
			this._selectVariant(choices[index].model, control).catch(onUnexpectedError);
		}));
		this._groupControls.set('speed', control);
		section.appendChild(control.domNode);
	}

	private async _selectVariant(model: ILanguageModelChatMetadataAndIdentifier, control: Radio): Promise<void> {
		const options = this._options;
		const version = ++this._configurationChangeVersion;
		options.onWillSelect?.();
		options.onSelect?.(model);
		await control.whenSelectionAnimationSettles();
		if (!this.isDisposed && version === this._configurationChangeVersion) {
			options.onDidAccept?.();
		}
	}

	private _renderContextWindow(metadata: ILanguageModelChatMetadata): void {
		const total = getModelContextWindowTotal(metadata);
		if (!total) {
			return;
		}
		const section = dom.append(this.element, dom.$('.chat-model-card-section'));
		const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
		dom.append(heading, dom.$('.chat-model-card-section-title', undefined, getMaxContextLabel()));
		dom.append(heading, dom.$('.chat-model-card-section-value', undefined, formatTokenCount(total)));
	}

	private _renderCost(context: IModelConfigProperty | undefined): void {
		const metadata = this._options.model.metadata;
		const metrics = getModelCostMetrics(metadata);
		if (!metrics.length) {
			if (metadata.pricing) {
				this._renderSection(localize('models.cost', "Cost: {0}", metadata.pricing));
			}
			return;
		}

		const useExtended = !!context && isExtendedContext(context);
		const disclosure = this._options.pricingDisclosure;
		const section = dom.append(this.element, dom.$('.chat-model-card-section.chat-model-card-pricing'));
		section.classList.toggle('collapsible', !!disclosure);
		const bodyId = `chat-model-card-pricing-${this._options.model.identifier.replace(/[^\w-]/g, '-')}`;
		const heading = dom.append(section, dom.$(disclosure ? 'button.chat-model-card-pricing-toggle' : '.chat-model-card-section-heading'));

		// Folded away by default: the numbers only matter to the people who go looking
		// for them, and they are the last thing most people need to read.
		if (disclosure) {
			heading.setAttribute('type', 'button');
			heading.setAttribute('aria-controls', bodyId);
			this._pricingChevron = dom.append(heading, dom.$('span.chat-model-card-pricing-chevron', { 'aria-hidden': 'true' }));
			this._pricingToggle = heading;
			this._contentDisposables.add(dom.addDisposableListener(heading, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				disclosure.setExpanded(!disclosure.isExpanded());
			}));
		}
		dom.append(heading, dom.$('span.chat-model-card-section-title', undefined, localize('models.pricingDetails', "Pricing details")));
		const priceBadgeLabel = getPriceCategoryLabel(metadata.priceCategory);
		if (priceBadgeLabel) {
			this._renderBadge(heading, priceBadgeLabel, isHighCostCategory(metadata.priceCategory));
		}
		const body = dom.append(section, dom.$('.chat-model-card-pricing-body'));
		this._pricingBody = body;
		body.id = bodyId;
		const clip = dom.append(body, dom.$('.chat-model-card-pricing-body-clip'));
		const content = dom.append(clip, dom.$('.chat-model-card-pricing-body-content'));
		// The unit is stated once, so each row can be read as a plain name and number.
		dom.append(content, dom.$('.chat-model-card-pricing-caption', undefined, getCreditsPerMillionTokensLabel()));
		for (const metric of metrics) {
			const cost = useExtended ? metric.extended ?? metric.standard : metric.standard;
			const row = dom.append(content, dom.$('.chat-model-card-pricing-row'));
			dom.append(row, dom.$('span.chat-model-card-pricing-label', undefined, metric.label));
			dom.append(row, dom.$('span.chat-model-card-pricing-value', undefined, formatModelCost(cost)));
		}
		this._updatePricingDisclosure();
	}

	private _updatePricingDisclosure(): void {
		const expanded = this._options.pricingDisclosure?.isExpanded() ?? true;
		this._pricingToggle?.setAttribute('aria-expanded', String(expanded));
		if (this._pricingChevron) {
			this._pricingChevron.className = `chat-model-card-pricing-chevron ${ThemeIcon.asClassName(expanded ? Codicon.chevronDown : Codicon.chevronRight)}`;
		}
		if (this._pricingBody) {
			this._pricingBody.classList.toggle('expanded', expanded);
			this._pricingBody.inert = !expanded;
			this._pricingBody.setAttribute('aria-hidden', String(!expanded));
		}
	}

}
