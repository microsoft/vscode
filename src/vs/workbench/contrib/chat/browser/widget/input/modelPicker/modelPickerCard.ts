/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { getBaseLayerHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IRadioOptionItem, Radio } from '../../../../../../../base/browser/ui/radio/radio.js';
import { Action } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { getModelContextWindowTotal, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { formatModelCost, getCreditsPerMillionTokensLabel, getMaxContextLabel, getModelCostMetrics, renderModelDescription } from './modelPickerDetails.js';
import { createMessageBanner, HYDRA_FUSION_LEARN_MORE_URL } from './modelPickerHover.js';
import { getChangedModelConfigProperties, getModelConfigChoices, getModelConfigProperty, IModelConfigProperty, IModelConfigurationAccess, isExtendedContext, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT, ModelConfigChangeListener, setModelConfigValues } from './modelPickerModelConfig.js';
import { getCategoryLabel, getPriceCategoryLabel, isAutoModel, isHighCostCategory, isHydraFusionModel, isMultiplierPricing } from './modelPickerPresentation.js';
import { IModelSpeedVariants } from './modelPickerVariants.js';
import { getOrganizationDefaultDescription } from './modelPickerBadges.js';

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

/** One choice of a setting on a model's details page. */
export interface IModelCardChoice {
	readonly label: string;
	readonly description?: string;
	readonly checked: boolean;
	readonly readOnly?: boolean;
}

/** A segmented control for one setting on an on-device model's details page; arrow keys move focus without choosing, and descriptions are tooltips and accessible names. */
export function createModelCardChoiceControl(title: string, choices: readonly IModelCardChoice[]): Radio {
	return new Radio({
		ariaLabel: title,
		className: 'segmented',
		arrowKeyBehavior: 'focus',
		items: choices.map(({ label, description, checked, readOnly }) => ({
			text: label,
			tooltip: description,
			ariaLabel: description ? localize('chat.modelPicker.optionDescription', "{0}, {1}", label, description) : label,
			isActive: checked,
			disabled: readOnly,
		})),
	});
}

export interface IModelCardOptions {
	readonly model: ILanguageModelChatMetadataAndIdentifier;
	readonly configurationAccess: IModelConfigurationAccess;
	/** Whether the account is billed by credits, which is when cost numbers are shown. */
	readonly isUBB: boolean;
	readonly openerService: IOpenerService;
	/** Called after a configuration value changes so the caller can report it and refresh its own label. */
	readonly onDidChangeConfiguration?: ModelConfigChangeListener;
	/** Whether the model is pinned, when pinning is offered here. */
	readonly isPinned?: boolean;
	/** The organization default represented by this card, including either speed variant. */
	readonly organizationDefaultModel?: ILanguageModelChatMetadataAndIdentifier;
	/** The caller mounts the header separately from the scrollable card body. */
	readonly externalHeader?: boolean;
	readonly onTogglePin?: (pinned: boolean) => void;
	readonly pricingDisclosure?: IPricingDisclosure;
	/** The faster twin of this model, when the provider offers one. */
	readonly speedVariants?: IModelSpeedVariants;
	/** Separate models offered as tiers of one, such as HydraFusion's Default and Max. Choosing one selects that model. */
	readonly modelChoices?: IModelCardModelChoices;
	/** The name shown in the header when it differs from the model's, e.g. HydraFusion for its Max tier. */
	readonly name?: string;
	/** The description shown when it differs from the model's, e.g. HydraFusion's for its Max tier. */
	readonly description?: string;
	/** Separate routing models offered among Auto's tiers, such as HydraFusion and HydraFusion Max. */
	readonly routingAlternatives?: readonly IModelCardRoutingAlternative[];
	/** Marks the start of a model-affecting interaction, before an asynchronous save. */
	readonly onWillSelect?: () => void;
	/** Selects the model for the latest saved configuration or speed choice. */
	readonly onSelect?: (model: ILanguageModelChatMetadataAndIdentifier) => void;
	/** Whether saving configuration selects the configured model. Defaults to true. */
	readonly selectModelOnConfigurationChange?: boolean;
	/** Called once the selection settles so the picker can refresh its rows. */
	readonly onDidAccept?: () => void;
}

/**
 * A routing model listed after Auto's own tiers. Choosing it selects that model
 * rather than saving a tier, and reveals what it is.
 */
export interface IModelCardRoutingAlternative {
	readonly model: ILanguageModelChatMetadataAndIdentifier;
	readonly label?: string;
	/** The tier this alternative takes the place of; otherwise it follows the tiers. */
	readonly replacesTier?: unknown;
	/** Shown below the tiers while the alternative is chosen. */
	readonly description: string;
	/** Describes the routing feature in the option's hover. */
	readonly tooltip?: string;
	readonly learnMoreUrl?: URI;
	/** Whether the alternative is the model in use, rather than one of Auto's tiers. */
	readonly selected: boolean;
}

/** Separate models offered as tiers of one, shown without a heading as one choice per model. */
export interface IModelCardModelChoices {
	/** Names the choices for assistive technology, since no heading is shown. */
	readonly ariaLabel: string;
	readonly choices: readonly { readonly label: string; readonly model: ILanguageModelChatMetadataAndIdentifier }[];
}

function modelChoicesEqual(a: IModelCardModelChoices | undefined, b: IModelCardModelChoices | undefined): boolean {
	return a?.ariaLabel === b?.ariaLabel && (a?.choices.length ?? 0) === (b?.choices.length ?? 0)
		&& (a?.choices ?? []).every((choice, index) => choice.model === b?.choices[index].model && choice.label === b.choices[index].label);
}

function routingAlternativesEqual(a: readonly IModelCardRoutingAlternative[] | undefined, b: readonly IModelCardRoutingAlternative[] | undefined): boolean {
	return (a?.length ?? 0) === (b?.length ?? 0)
		&& (a ?? []).every((alternative, index) => alternative.model === b?.[index].model && alternative.selected === b[index].selected
			&& alternative.label === b[index].label && alternative.replacesTier === b[index].replacesTier);
}

/**
 * Model information and configuration, shared by the picker's details page and fixtures.
 * Configuration changes are written through and preserve keyboard focus.
 */
export class ModelCard extends DisposableStore {

	readonly element = dom.$('.chat-model-card');
	readonly headerElement = dom.$('.chat-model-card-header');

	private readonly _contentDisposables = this.add(new DisposableStore());
	private readonly _groupControls = new Map<string, Radio>();
	private readonly _pricingDisclosureListener = this.add(new MutableDisposable());
	private _configurationChangeVersion = 0;
	private _headerActions: ActionBar | undefined;
	private _routingBadge: HTMLElement | undefined;
	/** The pricing disclosure's button, rebuilt with the rest of the card on each render. */
	private _pricingToggle: HTMLElement | undefined;
	private _pricingChevron: HTMLElement | undefined;
	private _pricingBody: HTMLElement | undefined;

	constructor(private _options: IModelCardOptions) {
		super();
		this._pricingDisclosureListener.value = _options.pricingDisclosure?.onDidChange(() => this._updatePricingDisclosure());
		this._render();
	}

	/** Refreshes model, pin, and policy state without replacing the card or moving keyboard focus. */
	update(options: IModelCardOptions): void {
		const disclosureChanged = options.pricingDisclosure !== this._options.pricingDisclosure;
		const alternativeChanged = !routingAlternativesEqual(options.routingAlternatives, this._options.routingAlternatives);
		const choicesChanged = !modelChoicesEqual(options.modelChoices, this._options.modelChoices) || options.name !== this._options.name || options.description !== this._options.description;
		const changed = options.model !== this._options.model || options.isPinned !== this._options.isPinned || options.organizationDefaultModel !== this._options.organizationDefaultModel || options.externalHeader !== this._options.externalHeader || disclosureChanged || alternativeChanged || choicesChanged;
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

	refresh(): void {
		this._renderPreservingFocus();
	}

	focus(): void {
		const control = this._groupControls.get(MODEL_CONFIG_GROUP_EFFORT) ?? this._groupControls.get(MODEL_CONFIG_GROUP_CONTEXT);
		if (control) {
			control.focusActiveItem();
		} else {
			this._restoreFocus();
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
			await setModelConfigValues(options.model, options.configurationAccess, values, options.onDidChangeConfiguration);
			if (!this.isDisposed && version === this._configurationChangeVersion) {
				if (options.selectModelOnConfigurationChange !== false) {
					options.onSelect?.(options.model);
				}
				this._setSelectedRoutingAlternative(undefined);
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
		const hadFocus = this.element.contains(dom.getActiveElement()) || this.headerElement.contains(dom.getActiveElement());
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
			const control = this._groupControls.values().next().value;
			if (control) {
				control.focusActiveItem();
			} else {
				this.element.tabIndex = -1;
				this.element.focus();
			}
		}
	}

	private _render(): void {
		this._contentDisposables.clear();
		dom.clearNode(this.element);
		dom.clearNode(this.headerElement);
		this._pricingToggle = undefined;
		this._pricingChevron = undefined;
		this._pricingBody = undefined;
		this._headerActions = undefined;
		this._routingBadge = undefined;
		this._groupControls.clear();

		const { model, isUBB, openerService } = this._options;
		const metadata = model.metadata;
		const isAuto = isAutoModel(model);
		const isRoutingModel = isAuto || isHydraFusionModel(model);
		const effort = this._configProperty(MODEL_CONFIG_GROUP_EFFORT);
		const context = this._configProperty(MODEL_CONFIG_GROUP_CONTEXT);

		this._renderHeader();
		if (this._options.organizationDefaultModel) {
			dom.append(this.element, dom.$('.chat-model-card-description.chat-model-card-org-default', undefined, getOrganizationDefaultDescription(this._options.organizationDefaultModel.metadata.name)));
		}
		const description = this._options.description ?? metadata.tooltip;
		if (description) {
			this._renderDescription(description, isHydraFusionModel(model) ? HYDRA_FUSION_LEARN_MORE_URL : undefined);
		}
		// Without tiers to sit below, Auto's discount follows its description.
		if (isAuto && !effort && metadata.autoModelDiscountPercent !== undefined) {
			this._renderDescription(ILanguageModelChatMetadata.getAutoModelDiscountDescription(metadata.autoModelDiscountPercent, undefined, !!metadata.autoModelEnsemble));
		}

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

		if (effort) {
			this._renderEffortSection(effort, isAuto);
		} else if (this._options.modelChoices) {
			// Tiers that are separate models take the place of the thinking effort setting.
			this._renderModelChoiceSection(this._options.modelChoices.ariaLabel, this._options.modelChoices.choices, MODEL_CONFIG_GROUP_EFFORT);
		}
		if (context) {
			this._renderContextSection(context);
		} else if (!isRoutingModel) {
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
	}

	private _renderHeader(): void {
		const metadata = this._options.model.metadata;
		const isRoutingModel = isAutoModel(this._options.model) || isHydraFusionModel(this._options.model);
		const header = this.headerElement;
		if (!this._options.externalHeader) {
			this.element.appendChild(header);
		}
		const displayName = this._options.name ?? metadata.name;
		const name = dom.append(header, dom.$('.chat-model-card-name', undefined, displayName));
		this._contentDisposables.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), name, displayName));

		if (this._options.routingAlternatives?.length) {
			this._routingBadge = this._renderBadge(header, '', false);
			this._updateRoutingBadge();
		} else {
			const badgeLabel = isRoutingModel
				? metadata.detail
				: this._showsPriceBadgeInPricing()
					? undefined
					: getPriceCategoryLabel(metadata.priceCategory) ?? getCategoryLabel(metadata.category);
			if (badgeLabel) {
				this._renderBadge(header, badgeLabel, !isRoutingModel && isHighCostCategory(metadata.priceCategory));
			}
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
			return property && !property.schema.readOnly ? [[property.key, property.schema.default]] : [];
		}));
		await this._setValues(values);
	}

	private _showsPriceBadgeInPricing(): boolean {
		const metadata = this._options.model.metadata;
		return this._options.isUBB && !!getPriceCategoryLabel(metadata.priceCategory) && getModelCostMetrics(metadata).length > 0;
	}

	private _renderBadge(container: HTMLElement, label: string, highCost: boolean): HTMLElement {
		const badge = dom.append(container, dom.$('span.chat-model-card-badge', undefined, label));
		badge.classList.toggle('high-cost', highCost);
		return badge;
	}

	private _renderDescription(tooltip: string, learnMoreUrl?: URI): void {
		const { element } = renderModelDescription(tooltip, this._options.openerService, this._contentDisposables, learnMoreUrl);
		element.classList.add('chat-model-card-description');
		this.element.appendChild(element);
	}

	private _renderSection(title: string | undefined): HTMLElement {
		const section = dom.append(this.element, dom.$('.chat-model-card-section'));
		if (title) {
			const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
			dom.append(heading, dom.$('.chat-model-card-section-title', undefined, title));
		}
		return section;
	}

	private _renderEffortSection(effort: IModelConfigProperty, isAuto: boolean): void {
		this._renderChoiceSection(effort, MODEL_CONFIG_GROUP_EFFORT, effort.schema.title ?? (isAuto
			? localize('models.optimizeFor', "Optimize for")
			: localize('chat.effort.header', "Effort Level")));
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
	 * Auto's tiers end with its routing alternatives, each described once chosen.
	 */
	private _renderChoiceSection(property: IModelConfigProperty, group: string, title: string): void {
		const choices = getModelConfigChoices(property);
		const isAuto = isAutoModel(this._options.model);
		const alternatives = isAuto && group === MODEL_CONFIG_GROUP_EFFORT ? this._options.routingAlternatives ?? [] : [];
		const selectedAlternative = alternatives.find(alternative => alternative.selected);
		const replaces = (alternative: IModelCardRoutingAlternative, choice: typeof choices[number]) => alternative.replacesTier !== undefined && alternative.replacesTier === choice.value;
		const entries: { readonly choice?: typeof choices[number]; readonly alternative?: IModelCardRoutingAlternative }[] = [
			...choices.map(choice => ({ choice, alternative: alternatives.find(alternative => replaces(alternative, choice)) })),
			...alternatives.filter(alternative => !choices.some(choice => replaces(alternative, choice))).map(alternative => ({ alternative })),
		];
		const followingAlternatives = entries.length - choices.length;
		const ensemble = !!this._options.model.metadata.autoModelEnsemble;
		// Ensemble's tiers describe themselves below the control, so a hover would only repeat it.
		const tooltip = (description: string | undefined) => isAuto && ensemble && group === MODEL_CONFIG_GROUP_EFFORT ? undefined : description;
		const items = entries.map(({ choice, alternative }, index): IRadioOptionItem => {
			if (!alternative) {
				const { label, description, checked, readOnly } = choice!;
				return {
					text: label,
					tooltip: tooltip(description),
					ariaLabel: description ? localize('chat.modelPicker.optionDescription', "{0}, {1}", label, description) : label,
					isActive: checked && !selectedAlternative,
					disabled: readOnly,
				};
			}
			const label = alternative.label ?? choice?.label ?? alternative.model.metadata.name;
			// Until the alternative is chosen, a tier saved before it took the tier's place describes that tier.
			const describesTier = !!choice && !alternative.selected && choice.checked && !selectedAlternative;
			if (describesTier) {
				return {
					text: label,
					tooltip: tooltip(choice.description),
					ariaLabel: choice.description ? localize('chat.modelPicker.optionDescription', "{0}, {1}", label, choice.description) : label,
					isActive: true,
					disabled: choice.readOnly,
				};
			}
			return {
				text: label,
				tooltip: tooltip(alternative.tooltip ?? alternative.description),
				ariaLabel: alternative.tooltip
					? localize('chat.modelPicker.alternativeDescription', "{0}, {1} {2}", label, alternative.description, alternative.tooltip)
					: localize('chat.modelPicker.optionDescription', "{0}, {1}", label, alternative.description),
				isActive: alternative.selected,
				disabled: !!choice?.readOnly,
				// More than one alternative won't fit beside the tiers, so they start a row of their own.
				startsRow: index === choices.length && followingAlternatives > 1,
			};
		});
		const section = this._renderSection(title);
		const control = this._contentDisposables.add(new Radio({
			ariaLabel: title,
			className: 'segmented',
			// Arrow keys move focus without changing the model's configuration.
			arrowKeyBehavior: 'focus',
			items,
		}));
		const alternativeDescriptions = new Map<IModelCardRoutingAlternative, HTMLElement>();
		const discountPercent = isAuto && group === MODEL_CONFIG_GROUP_EFFORT ? this._options.model.metadata.autoModelDiscountPercent : undefined;
		let discountDescription: HTMLElement | undefined;
		let discountTierLabel: string | undefined;
		const discountStore = this._contentDisposables.add(new MutableDisposable<DisposableStore>());
		// Names the tier shown as selected, which a click changes before its value saves.
		// A failed save re-renders the card, which puts back the saved tier.
		const renderDiscountDescription = (tierLabel: string | undefined, hidden: boolean) => {
			if (discountPercent === undefined) {
				return;
			}
			if (discountDescription && tierLabel === discountTierLabel) {
				discountDescription.hidden = hidden;
				return;
			}
			const store = new DisposableStore();
			const next = renderModelDescription(ILanguageModelChatMetadata.getAutoModelDiscountDescription(discountPercent, tierLabel, ensemble), this._options.openerService, store).element;
			next.classList.add('chat-model-card-description', 'chat-model-card-discount-description');
			next.hidden = hidden;
			if (discountDescription) {
				discountDescription.replaceWith(next);
			} else {
				section.appendChild(next);
			}
			discountDescription = next;
			discountTierLabel = tierLabel;
			discountStore.value = store;
		};
		const onDidChoose = isAuto ? control.onDidActivate : control.onDidSelect;
		this._contentDisposables.add(onDidChoose(index => {
			const { choice, alternative } = entries[index] ?? {};
			if (alternative) {
				this._selectVariant(alternative.model, control).catch(onUnexpectedError);
			} else if (choice) {
				this._setValues({ [property.key]: choice.value }, group).catch(onUnexpectedError);
			}
			for (const [candidate, element] of alternativeDescriptions) {
				element.hidden = candidate !== alternative;
			}
			if (choice && !alternative) {
				renderDiscountDescription(choice.label, false);
			} else if (discountDescription) {
				discountDescription.hidden = true;
			}
		}));
		this._groupControls.set(group, control);
		section.appendChild(control.domNode);
		renderDiscountDescription(choices.find(choice => choice.checked)?.label, !!selectedAlternative);
		for (const alternative of alternatives) {
			const element = renderModelDescription(alternative.description, this._options.openerService, this._contentDisposables, alternative.learnMoreUrl).element;
			element.classList.add('chat-model-card-description', 'chat-model-card-alternative-description');
			element.hidden = !alternative.selected;
			section.appendChild(element);
			alternativeDescriptions.set(alternative, element);
		}
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
		const speed = localize('models.speed', "Speed");
		this._renderModelChoiceSection(speed, [
			{ label: localize('models.speed.standard', "Standard"), model: variants.standard },
			{ label: localize('models.speed.fast', "Fast"), model: variants.fast },
		], 'speed', speed);
	}

	/** A setting whose choices are separate models. Picking one selects that model. Without a title, it shows no heading. */
	private _renderModelChoiceSection(ariaLabel: string, choices: IModelCardModelChoices['choices'], group: string, title?: string): void {
		const section = this._renderSection(title);
		const control = this._contentDisposables.add(new Radio({
			ariaLabel,
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
		this._groupControls.set(group, control);
		section.appendChild(control.domNode);
	}

	/** Selects a separate model: a faster twin, a tier that is a model of its own, or one of Auto's routing alternatives. */
	private async _selectVariant(model: ILanguageModelChatMetadataAndIdentifier, control: Radio): Promise<void> {
		const options = this._options;
		const version = ++this._configurationChangeVersion;
		options.onWillSelect?.();
		options.onSelect?.(model);
		if (options.routingAlternatives?.some(alternative => alternative.model === model)) {
			this._setSelectedRoutingAlternative(model);
		}
		await control.whenSelectionAnimationSettles();
		if (!this.isDisposed && version === this._configurationChangeVersion) {
			options.onDidAccept?.();
		}
	}

	/** Keeps the alternatives' state in step with a choice made here until the caller next updates the card. */
	private _setSelectedRoutingAlternative(model: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		const alternatives = this._options.routingAlternatives;
		if (alternatives?.some(alternative => alternative.selected !== (alternative.model === model))) {
			this._options = { ...this._options, routingAlternatives: alternatives.map(alternative => ({ ...alternative, selected: alternative.model === model })) };
			this._updateRoutingBadge();
		}
	}

	/** Shows the chosen alternative's badge, otherwise the routing model's own. */
	private _updateRoutingBadge(): void {
		const alternatives = this._options.routingAlternatives;
		const badge = this._routingBadge;
		if (alternatives?.length && badge) {
			const label = (alternatives.find(alternative => alternative.selected)?.model ?? this._options.model).metadata.detail;
			badge.textContent = label ?? '';
			badge.hidden = !label;
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
