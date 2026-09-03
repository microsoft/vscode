/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListHeaderLink, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITabBarAction, ITabDescriptor, TabbedActionListWidget } from '../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { StateType } from '../../../../../../../platform/update/common/update.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry } from '../../../../common/languageModels.js';
import { withChatInputPickerMotion } from '../chatInputPickerActionItem.js';
import { IModelConfigurationAccess } from './modelPickerActionItem.js';
import { ModelPickerAutoRow } from './modelPickerAutoRow.js';
import { ModelCard } from './modelPickerCard.js';
import { getModelBadge } from './modelPickerBadges.js';
import { createModelAction, createUnavailableModelItem, getUnavailableReason } from './modelPickerItemPrimitives.js';
import { getModelPickerAccessibilityProvider } from './modelPickerItems.js';
import { isAutoModel } from './modelPickerPresentation.js';
import { buildModelPickerDestinations, buildModelPickerSections, getModelProviderLabel, hasPromotedModels, IModelPickerDestination, IModelPickerProviderPlaceholder, IModelPickerSections, IModelPickerUnavailableEntry, MODEL_PICKER_BUILT_IN_DESTINATION } from './modelPickerTabs.js';
import { ModelPickerWelcome } from './modelPickerWelcome.js';

/** The collapsible section holding models that are neither pinned, recommended nor recent. */
const OTHER_MODELS_SECTION = 'other';
const PICKER_WIDTH = 320;

/** Everything the picker needs for one showing, gathered by the owning widget. */
export interface ITabbedModelPickerContext {
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly selectedModelId: string | undefined;
	readonly recentModelIds: readonly string[];
	readonly pinnedModelIds: readonly string[];
	readonly controlModels: IStringDictionary<IModelControlEntry>;
	readonly configurationAccess: IModelConfigurationAccess;
	/** Whether the account is billed by credits, which is when cost numbers are shown. */
	readonly isUBB: boolean;
	readonly showManageModels: boolean;
	/**
	 * What it takes to unlock a curated model the user cannot select yet, used to
	 * offer the upgrade, admin or update path instead of simply omitting the model.
	 */
	readonly unavailableContext: {
		readonly show: boolean;
		readonly currentVSCodeVersion: string;
		readonly manageSettingsUrl: string | undefined;
		readonly updateStateType: StateType;
		readonly chatEntitlementService: IChatEntitlementService;
	};
	/** Reports a click on an upgrade or contact-admin link in an unavailable model row. */
	readonly onUnavailableLinkClick: (uri: URI) => void;
	/** Providers the user can add models from but has none from yet, e.g. one that needs signing in. */
	readonly providerPlaceholders: readonly IModelPickerProviderPlaceholder[];
	readonly onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void;
	readonly onTogglePin: ((modelIdentifier: string, pinned: boolean) => void) | undefined;
	readonly onManageModels: () => void;
	/** Reports a configuration change made from a model's detail card. */
	readonly onConfigurationChanged: (model: ILanguageModelChatMetadataAndIdentifier, group: string, key: string, fromValue: unknown, toValue: unknown) => void;
	/** Warning banner shown when switching options mid-session would reset the prompt cache. */
	readonly cacheBreakHint: { readonly text: string; readonly link: IActionListHeaderLink | undefined; readonly dismiss: () => void } | undefined;
}

/**
 * The model picker: a list of models with a detail card beside the hovered one
 * and an Auto row pinned below. Models the user added themselves get a second
 * tab; with only the built-in provider there is no tab bar at all.
 */
export class TabbedModelPicker extends Disposable {

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _widget: TabbedActionListWidget;
	private readonly _cards = this._register(new DisposableStore());
	private readonly _autoRow = this._register(new MutableDisposable<ModelPickerAutoRow>());

	private _context: ITabbedModelPickerContext | undefined;
	private _anchor: HTMLElement | undefined;
	private _activeDestination: string | undefined;
	private _searchVisible = false;
	/** The model to fall back to when Auto is switched off. */
	private _lastExplicitModelId: string | undefined;

	get isVisible(): boolean {
		return this._widget.isVisible;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();
		this._widget = this._register(instantiationService.createInstance(TabbedActionListWidget));
		this._register(this._widget.onDidChangeTab(id => { this._activeDestination = id; }));
		this._register(this._widget.onDidHide(() => this._onDidHide.fire()));
	}

	hide(): void {
		this._widget.hide();
	}

	show(anchor: HTMLElement, context: ITabbedModelPickerContext): void {
		this._anchor = anchor;
		this._context = context;
		if (context.selectedModelId && !this._isAutoSelected(context)) {
			this._lastExplicitModelId = context.selectedModelId;
		}
		this._showCurrent();
	}

	private _showCurrent(): void {
		const context = this._context;
		const anchor = this._anchor;
		if (!context || !anchor) {
			return;
		}

		const destinations = buildModelPickerDestinations(context.models, this._languageModelsService, context.providerPlaceholders);
		if (!destinations.length) {
			return;
		}
		if (!this._activeDestination || !destinations.some(destination => destination.id === this._activeDestination)) {
			this._activeDestination = this._destinationForSelectedModel(destinations, context) ?? destinations[0].id;
		}

		const autoModel = context.models.find(isAutoModel);
		const autoEnabled = this._isAutoSelected(context);
		this._widget.show<IActionWidgetDropdownAction>({
			user: 'ChatTabbedModelPicker',
			anchor,
			tabs: destinations.map((destination): ITabDescriptor => ({ id: destination.id, label: destination.label, icon: destination.icon, tooltip: destination.label })),
			initialTab: this._activeDestination,
			tabBarActions: this._buildTabBarActions(context),
			tabBarClassName: 'chat-model-picker-tabbar',
			widgetClassNames: [
				'chat-model-picker-widget',
				// Auto is in charge of the choice, so the list it overrides steps back.
				...(autoEnabled ? ['auto-enabled'] : []),
				// The leftmost tab sits flush against the sheet's left edge, so the sheet's
				// rounded corner would notch out from under it. In search mode the filter
				// runs to the left edge instead, so the same applies.
				...(this._searchVisible || destinations[0].id === this._activeDestination ? ['first-tab-active'] : []),
				...(this._searchVisible ? ['search-mode'] : []),
			],
			iconOnlyTabs: true,
			filterInTabBar: true,
			width: PICKER_WIDTH,
			createActionList: activeTab => {
				// Read the latest state: the list can be rebuilt in place while the popup
				// stays open, so the context captured when it opened may be stale.
				const current = this._context ?? context;
				const destination = destinations.find(candidate => candidate.id === activeTab) ?? destinations[0];
				const sections = this._buildSections(destination, current);
				// Searching replaces the tab strip, so it searches what the strip scoped:
				// every destination at once, each model named by where it came from.
				const items = this._searchVisible
					? destinations.flatMap(candidate => this._buildSearchItems(candidate, current))
					: this._buildItems(destination, sections, current);
				return {
					items,
					// Shares the chat input's picker motion and anchoring: the chip sits at the
					// bottom of the window, so the popup has to open upward from it.
					listOptions: withChatInputPickerMotion({
						className: 'chat-model-picker-dropdown chat-model-picker-tabbed',
						showFilter: this._searchVisible,
						filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
						focusFilterOnOpen: this._searchVisible,
						headerText: current.cacheBreakHint?.text,
						headerIcon: current.cacheBreakHint ? Codicon.info : undefined,
						headerLink: current.cacheBreakHint?.link,
						headerDismiss: current.cacheBreakHint?.dismiss,
						// A tab with nothing promoted would open on an empty list, so leave it expanded.
						collapsedByDefault: hasPromotedModels(sections) ? new Set([OTHER_MODELS_SECTION]) : undefined,
						linkHandler: uri => current.onUnavailableLinkClick(uri),
						maxWidth: PICKER_WIDTH,
						hideDefaultKeybindingTooltip: true,
					}),
				};
			},
			renderEmpty: (container, activeTab) => {
				const destination = destinations.find(candidate => candidate.id === activeTab);
				if (!destination?.placeholders.length) {
					return undefined;
				}
				const welcome = new ModelPickerWelcome(destination);
				container.appendChild(welcome.element);
				return welcome;
			},
			renderFooter: autoModel ? container => this._renderAutoRow(container, autoModel, context) : undefined,
			delegate: {
				onSelect: action => {
					void action.run();
					this._widget.hide();
				},
				onHide: () => { },
			},
			accessibilityProvider: getModelPickerAccessibilityProvider(),
		});
	}

	private _isAutoSelected(context: ITabbedModelPickerContext): boolean {
		const selected = context.models.find(model => model.identifier === context.selectedModelId);
		return !!selected && isAutoModel(selected);
	}

	private _destinationForSelectedModel(destinations: readonly IModelPickerDestination[], context: ITabbedModelPickerContext): string | undefined {
		return destinations.find(destination => destination.models.some(model => model.identifier === context.selectedModelId))?.id;
	}

	private _buildSections(destination: IModelPickerDestination, context: ITabbedModelPickerContext): IModelPickerSections {
		const isBuiltIn = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION;
		return buildModelPickerSections({
			models: destination.models,
			selectedModelId: context.selectedModelId,
			recentModelIds: context.recentModelIds,
			pinnedModelIds: context.pinnedModelIds,
			controlModels: context.controlModels,
			// Only the built-in provider curates a shortlist. Models the user added are
			// organized by which provider they came from, which is their own shortlist.
			showSuggested: isBuiltIn,
			getProviderLabel: isBuiltIn ? undefined : model => getModelProviderLabel(model, this._languageModelsService),
			// Only the built-in provider has a curated catalogue to compare against.
			showUnavailable: isBuiltIn && context.unavailableContext.show,
			currentVSCodeVersion: context.unavailableContext.currentVSCodeVersion,
		});
	}

	private _buildTabBarActions(context: ITabbedModelPickerContext): ITabBarAction[] {
		const actions: ITabBarAction[] = [];
		// Sits with the tabs, right after the last one: adding a provider adds a tab, so
		// the action belongs beside the thing it extends. Hidden while searching, when
		// the strip it lives in gives way to the filter.
		if (context.showManageModels && !this._searchVisible) {
			actions.push({
				id: 'addProvider',
				icon: Codicon.add,
				tooltip: localize('chat.modelPicker.addProvider', "Add Models..."),
				run: () => {
					this._widget.hide();
					context.onManageModels();
				},
			});
		}
		actions.push({
			id: 'search',
			icon: Codicon.search,
			tooltip: localize('chat.modelPicker.searchToggle', "Search Models"),
			alignEnd: true,
			checked: this._searchVisible,
			run: () => {
				this._searchVisible = !this._searchVisible;
				this._showCurrent();
			},
		});
		return actions;
	}

	private _buildItems(destination: IModelPickerDestination, sections: IModelPickerSections, context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		this._cards.clear();
		// A plan that grants only Auto still lists the models it could unlock, so the
		// welcome body is reserved for having genuinely nothing to say.
		if (!destination.models.length && !sections.unavailable.length) {
			return [];
		}
		// Pinned models sit above the provider groups, so they name their provider
		// themselves rather than losing it on the way up.
		const namesProviders = destination.id !== MODEL_PICKER_BUILT_IN_DESTINATION;
		const providerLabelFor = (model: ILanguageModelChatMetadataAndIdentifier) =>
			namesProviders ? getModelProviderLabel(model, this._languageModelsService) : undefined;

		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const appendSection = (
			label: string | undefined,
			models: readonly ILanguageModelChatMetadataAndIdentifier[],
			unavailable: readonly IModelPickerUnavailableEntry[] = [],
		) => {
			if (!models.length && !unavailable.length) {
				return;
			}
			// An unlabelled run still needs a rule when something precedes it.
			if (label || items.length) {
				items.push({ kind: ActionListItemKind.Separator, label });
			}
			for (const model of models) {
				items.push(this._createModelItem(model, context, undefined, providerLabelFor(model)));
			}
			// Listed after the models that can be picked, so the section leads with what works.
			for (const { id, entry, needsUpdate } of unavailable) {
				const { unavailableContext } = context;
				const reason = needsUpdate ? 'update' : getUnavailableReason(entry, unavailableContext.chatEntitlementService, unavailableContext.currentVSCodeVersion);
				items.push(createUnavailableModelItem(
					id,
					entry,
					reason,
					unavailableContext.manageSettingsUrl,
					unavailableContext.updateStateType,
					unavailableContext.chatEntitlementService,
				));
			}
		};

		appendSection(localize('chat.modelPicker.pinned', "Pinned"), sections.pinned);
		// The shortlist is just the list: naming it would label the default state, which
		// no other heading here does.
		appendSection(undefined, sections.suggested, sections.unavailable);

		if (sections.otherGroups.length) {
			// The toggle only earns its row when it folds away models that would
			// otherwise crowd out the promoted ones above it.
			const collapsible = hasPromotedModels(sections);
			const section = collapsible ? OTHER_MODELS_SECTION : undefined;
			if (collapsible) {
				const label = localize('chat.modelPicker.otherModels', "Other Models");
				const count = sections.otherGroups.reduce((total, group) => total + group.models.length, 0);
				items.push({
					item: { id: 'otherModels', enabled: true, checked: false, class: undefined, tooltip: label, label, run: () => { } },
					kind: ActionListItemKind.Action,
					label,
					// Says how many are folded away, so the row is worth finding.
					badge: String(count),
					ariaDescription: localize('chat.modelPicker.otherModelsCount', "{0} more models", count),
					group: { title: '', icon: Codicon.chevronDown },
					hideIcon: false,
					section: OTHER_MODELS_SECTION,
					isSectionToggle: true,
					className: 'chat-model-picker-section-toggle',
				});
			}
			for (const group of sections.otherGroups) {
				if (group.label) {
					items.push({ kind: ActionListItemKind.Separator, label: group.label, section });
				}
				for (const model of group.models) {
					items.push(this._createModelItem(model, context, section));
				}
			}
		}
		return items;
	}

	/**
	 * Every model in one destination as flat rows, for searching. Sections would only
	 * get in the way of a result list, but each row still names its provider.
	 */
	private _buildSearchItems(destination: IModelPickerDestination, context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		return destination.models
			.slice()
			.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
			.map(model => this._createModelItem(model, context, undefined, getModelProviderLabel(model, this._languageModelsService)));
	}

	private _createModelItem(
		model: ILanguageModelChatMetadataAndIdentifier,
		context: ITabbedModelPickerContext,
		section?: string,
		providerLabel?: string,
	): IActionListItem<IActionWidgetDropdownAction> {
		const { action, ariaDescription } = createModelAction(model, context.selectedModelId, context.onSelect, section, true);
		const badge = getModelBadge(model, { configurationAccess: context.configurationAccess, providerLabel });
		// While Auto is choosing, a model's settings do not apply, so the card that edits
		// them stays shut. The row is still selectable, which is what turns Auto off.
		const autoEnabled = this._isAutoSelected(context);
		const card = autoEnabled ? undefined : this._cards.add(new ModelCard({
			model,
			configurationAccess: context.configurationAccess,
			isUBB: context.isUBB,
			openerService: this._openerService,
			isPinned: context.pinnedModelIds.includes(model.identifier),
			onTogglePin: context.onTogglePin
				? pinned => {
					context.onTogglePin?.(model.identifier, pinned);
					// Closes like every other action in the card, so the card is not left
					// open over a list that has since reordered itself.
					this._widget.hide();
				}
				: undefined,
			onDidChangeConfiguration: (group, key, fromValue, toValue) => {
				context.onConfigurationChanged(model, group, key, fromValue, toValue);
				// Configuring a model is a choice of it: the settings only take effect on the
				// model they belong to, so tuning one and leaving another selected would
				// discard the change the user just made.
				if (model.identifier !== context.selectedModelId) {
					context.onSelect(model);
				}
				this._widget.hide();
			},
		}));
		return {
			item: action,
			kind: ActionListItemKind.Action,
			label: action.label,
			description: badge ? undefined : action.description,
			badge: badge?.text,
			ariaDescription,
			group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
			hideIcon: false,
			section,
			className: badge ? `chat-model-picker-badge-${badge.tone}` : undefined,
			hover: card ? { content: card.element, expandable: true, panelClassName: 'chat-model-card-panel' } : undefined,
			tooltip: action.tooltip,
		};
	}

	private _renderAutoRow(container: HTMLElement, autoModel: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): IDisposable {
		const row = new ModelPickerAutoRow({
			autoModel,
			configurationAccess: context.configurationAccess,
			isEnabled: () => this._isAutoSelected(this._context ?? context),
			onToggle: enabled => this._toggleAuto(enabled, autoModel),
		});
		this._autoRow.value = row;
		container.appendChild(row.element);
		return row;
	}

	private _toggleAuto(enabled: boolean, autoModel: ILanguageModelChatMetadataAndIdentifier): void {
		const context = this._context;
		if (!context) {
			return;
		}
		const next = enabled ? autoModel : this._fallbackModel(context);
		if (!next) {
			// Auto is the only model, so there is nothing to switch back to.
			this._autoRow.value?.render();
			return;
		}
		context.onSelect(next);
		this._context = { ...context, selectedModelId: next.identifier };
		// Updated in place rather than re-shown: rebuilding the popup would move focus
		// off the switch the user just clicked, and can dismiss it outright.
		this._widget.toggleClassName('auto-enabled', enabled);
		this._widget.refreshActiveList();
		this._autoRow.value?.render();
	}

	/** The model to select when Auto is switched off: the last explicit pick, else the most recent one. */
	private _fallbackModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const candidates = [this._lastExplicitModelId, ...context.recentModelIds, ...context.pinnedModelIds];
		for (const id of candidates) {
			const model = context.models.find(candidate => candidate.identifier === id);
			if (model && !isAutoModel(model)) {
				return model;
			}
		}
		return context.models.find(model => !isAutoModel(model));
	}
}
