/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { toAction } from '../../../../../../base/common/actions.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../../services/chat/common/chatEntitlementService.js';
import * as semver from '../../../../../../base/common/semver/semver.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUpdateService, StateType } from '../../../../../../platform/update/common/update.js';
import { getBaseLayerHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';

function isVersionAtLeast(current: string, required: string): boolean {
	const currentSemver = semver.coerce(current);
	if (!currentSemver) {
		return false;
	}
	return semver.gte(currentSemver, required);
}

function getUpdateHoverContent(updateState: StateType): MarkdownString {
	const hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
	switch (updateState) {
		case StateType.AvailableForDownload:
			hoverContent.appendMarkdown(localize('chat.modelPicker.downloadUpdateHover', "This model requires a newer version of VS Code. [Download Update](command:update.downloadUpdate) to access it."));
			break;
		case StateType.Downloaded:
		case StateType.Ready:
			hoverContent.appendMarkdown(localize('chat.modelPicker.restartUpdateHover', "This model requires a newer version of VS Code. [Restart to Update](command:update.restartToUpdate) to access it."));
			break;
		default:
			hoverContent.appendMarkdown(localize('chat.modelPicker.checkUpdateHover', "This model requires a newer version of VS Code. [Update VS Code](command:update.checkForUpdate) to access it."));
			break;
	}
	return hoverContent;
}

/**
 * Section identifiers for collapsible groups in the model picker.
 */
const ModelPickerSection = {
	Other: 'other',
} as const;

type ChatModelChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the model picker is switched';
	fromModel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous chat model' };
	toModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new chat model' };
};

type ChatModelChangeEvent = {
	fromModel: string | TelemetryTrustedValue<string> | undefined;
	toModel: string | TelemetryTrustedValue<string>;
};

type ChatModelPickerInteraction = 'disabledModelContactAdminClicked' | 'premiumModelUpgradePlanClicked' | 'otherModelsExpanded' | 'otherModelsCollapsed';

type ChatModelPickerInteractionClassification = {
	owner: 'sandy081';
	comment: 'Reporting interactions in the chat model picker';
	interaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model picker interaction that occurred' };
};

type ChatModelPickerInteractionEvent = {
	interaction: ChatModelPickerInteraction;
};

function createModelItem(
	action: IActionWidgetDropdownAction & { section?: string },
	model?: ILanguageModelChatMetadataAndIdentifier,
): IActionListItem<IActionWidgetDropdownAction> {
	const hoverContent = model ? getModelHoverContent(model) : undefined;
	return {
		item: action,
		kind: ActionListItemKind.Action,
		label: action.label,
		description: action.description,
		group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
		hideIcon: false,
		section: action.section,
		hover: hoverContent ? { content: hoverContent } : undefined,
		tooltip: action.tooltip,
	};
}

/**
 * Returns a relative cost score for a model (0–1) based on a weighted average
 * of its per-1M-token input/output costs, normalised against the most expensive
 * model (Opus).  A typical request is assumed to be ~2 K input + ~1 K output.
 */
function getRelativeCost(modelName: string): number {
	const costInfo = getModelCostInfoByName(modelName);
	if (!costInfo) {
		return 0.5; // unknown model — place in the middle
	}
	// Weighted cost for a "typical" request (2K in, 1K out)
	const effectiveCost = (costInfo.input * 2 + costInfo.output * 1) / 1000;
	// Opus is the ceiling: (500*2 + 2500*1)/1000 = 3.5
	const maxCost = 3.5;
	return Math.min(effectiveCost / maxCost, 1);
}

function createCostBar(modelName: string): HTMLElement {
	const ratio = getRelativeCost(modelName);
	const container = dom.$('span.chat-model-cost-bar');
	const fill = dom.$('span.chat-model-cost-bar-fill');
	fill.style.width = `${Math.max(Math.round(ratio * 100), 8)}%`;
	container.appendChild(fill);
	return container;
}

function createModelAction(
	model: ILanguageModelChatMetadataAndIdentifier,
	selectedModelId: string | undefined,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	_languageModelsService: ILanguageModelsService,
	section?: string,
): IActionWidgetDropdownAction & { section?: string } {
	const wrap = dom.$('span.chat-model-3-col-desc');
	wrap.style.display = 'flex';
	wrap.style.justifyContent = 'flex-end';
	wrap.style.alignItems = 'center';
	wrap.style.flex = '0 0 auto';
	wrap.style.minWidth = '0';
	wrap.style.paddingLeft = '12px';
	wrap.style.gap = '0';

	const indicators = dom.$('span.chat-model-indicators');
	indicators.style.display = 'inline-flex';
	indicators.style.alignItems = 'center';
	indicators.style.flex = '0 0 auto';

	if (isAutoModel(model)) {
		const discountLabel = dom.$('span.chat-model-discount');
		discountLabel.textContent = localize('chat.modelPicker.autoDiscount', "10% Discount");
		indicators.appendChild(discountLabel);
	} else {
		indicators.appendChild(createCostBar(model.metadata.name));
	}

	wrap.appendChild(indicators);

	return {
		id: model.identifier,
		enabled: true,
		icon: model.metadata.statusIcon,
		checked: model.identifier === selectedModelId,
		class: undefined,
		description: wrap as HTMLElement, // Indicators column
		tooltip: model.metadata.name,
		label: model.metadata.name,
		section,
		run: () => onSelect(model),
	};
}

/**
 * Builds the grouped items for the model picker dropdown.
 *
 * Layout:
 * 1. Auto (always first)
 * 2. Promoted section (selected + recently used + featured models from control manifest)
 *    - Available models sorted alphabetically, followed by unavailable models
 *    - Unavailable models show upgrade/update/admin status
 * 3. Other Models (collapsible toggle, available first, then sorted by vendor then name)
 * 4. Optional "Manage Models..." action shown in Other Models after a separator
 */
export function buildModelPickerItems(
	models: ILanguageModelChatMetadataAndIdentifier[],
	selectedModelId: string | undefined,
	recentModelIds: string[],
	controlModels: IStringDictionary<IModelControlEntry>,
	currentVSCodeVersion: string,
	updateStateType: StateType,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	manageSettingsUrl: string | undefined,
	useGroupedModelPicker: boolean,
	manageModelsAction: IActionWidgetDropdownAction | undefined,
	chatEntitlementService: IChatEntitlementService,
	showUnavailableFeatured: boolean,
	showFeatured: boolean,
	languageModelsService?: ILanguageModelsService,
	onManageModels?: () => void,
): IActionListItem<IActionWidgetDropdownAction>[] {
	const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
	if (models.length === 0) {
		items.push(createModelItem({
			id: 'auto',
			enabled: true,
			checked: true,
			class: undefined,
			tooltip: localize('chat.modelPicker.auto', "Auto"),
			label: localize('chat.modelPicker.auto', "Auto"),
			run: () => { }
		}));
	}

	if (useGroupedModelPicker) {
		let otherModels: ILanguageModelChatMetadataAndIdentifier[] = [];
		if (models.length) {
			// Filter out parenthetical variants (e.g. "Opus 4.7 (Extra high reasoning)(Internal only)")
			// These are config-level variants of a base model and clutter the picker.
			models = models.filter(m => !/\(.*\)/.test(m.metadata.name));

			// Collect all available models into lookup maps
			const allModelsMap = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
			const modelsByMetadataId = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
			for (const model of models) {
				allModelsMap.set(model.identifier, model);
				modelsByMetadataId.set(model.metadata.id, model);
			}

			const placed = new Set<string>();

			const markPlaced = (identifierOrId: string, metadataId?: string) => {
				placed.add(identifierOrId);
				if (metadataId) {
					placed.add(metadataId);
				}
			};

			const resolveModel = (id: string) => allModelsMap.get(id) ?? modelsByMetadataId.get(id);

			const getUnavailableReason = (entry: IModelControlEntry): 'upgrade' | 'update' | 'admin' => {
				const isBusinessOrEnterpriseUser = chatEntitlementService.entitlement === ChatEntitlement.Business || chatEntitlementService.entitlement === ChatEntitlement.Enterprise;
				if (!isBusinessOrEnterpriseUser) {
					return 'upgrade';
				}
				if (entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
					return 'update';
				}
				return 'admin';
			};

			// --- 1. Auto ---
			const autoModel = models.find(m => isAutoModel(m));
			if (autoModel) {
				markPlaced(autoModel.identifier, autoModel.metadata.id);
				items.push(createModelItem(createModelAction(autoModel, selectedModelId, onSelect, languageModelsService!), autoModel));
			}

			// --- 2. Promoted section (selected + recently used + featured) ---
			type PromotedItem =
				| { kind: 'available'; model: ILanguageModelChatMetadataAndIdentifier }
				| { kind: 'unavailable'; id: string; entry: IModelControlEntry; reason: 'upgrade' | 'update' | 'admin' };

			const promotedItems: PromotedItem[] = [];

			// Try to place a model by id. Returns true if handled.
			const tryPlaceModel = (id: string): boolean => {
				if (placed.has(id)) {
					return false;
				}
				const model = resolveModel(id);
				if (model && !placed.has(model.identifier)) {
					markPlaced(model.identifier, model.metadata.id);
					const entry = controlModels[model.metadata.id];
					if (entry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
						promotedItems.push({ kind: 'unavailable', id: model.metadata.id, entry, reason: 'update' });
					} else {
						promotedItems.push({ kind: 'available', model });
					}
					return true;
				}
				if (!model) {
					const entry = controlModels[id];
					if (entry && !entry.exists) {
						markPlaced(id);
						promotedItems.push({ kind: 'unavailable', id, entry, reason: getUnavailableReason(entry) });
						return true;
					}
				}
				return false;
			};

			// Selected model
			if (selectedModelId && selectedModelId !== autoModel?.identifier) {
				tryPlaceModel(selectedModelId);
			}

			// Recently used models
			for (const id of recentModelIds) {
				tryPlaceModel(id);
			}

			// Featured models from control manifest
			if (showFeatured) {
				for (const [entryId, entry] of Object.entries(controlModels)) {
					if (!entry.featured || placed.has(entryId)) {
						continue;
					}
					const model = resolveModel(entryId);
					if (model && !placed.has(model.identifier)) {
						if (entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
							if (showUnavailableFeatured) {
								markPlaced(model.identifier, model.metadata.id);
								promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: 'update' });
							}
						} else {
							markPlaced(model.identifier, model.metadata.id);
							promotedItems.push({ kind: 'available', model });
						}
					} else if (!model && !entry.exists) {
						if (showUnavailableFeatured) {
							markPlaced(entryId);
							promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: getUnavailableReason(entry) });
						}
					}
				}
			}

			// Render promoted section: available first, then sorted alphabetically by name
			if (promotedItems.length > 0) {
				promotedItems.sort((a, b) => {
					const aAvail = a.kind === 'available' ? 0 : 1;
					const bAvail = b.kind === 'available' ? 0 : 1;
					if (aAvail !== bAvail) {
						return aAvail - bAvail;
					}
					const aName = a.kind === 'available' ? a.model.metadata.name : a.entry.label;
					const bName = b.kind === 'available' ? b.model.metadata.name : b.entry.label;
					return aName.localeCompare(bName);
				});

				for (const item of promotedItems) {
					if (item.kind === 'available') {
						items.push(createModelItem(createModelAction(item.model, selectedModelId, onSelect, languageModelsService!), item.model));
					} else {
						items.push(createUnavailableModelItem(item.id, item.entry, item.reason, manageSettingsUrl, updateStateType, chatEntitlementService));
					}
				}
			}

			// --- 3. Other Models (collapsible) ---
			otherModels = models
				.filter(m => !placed.has(m.identifier) && !placed.has(m.metadata.id))
				.sort((a, b) => {
					const aEntry = controlModels[a.metadata.id] ?? controlModels[a.identifier];
					const bEntry = controlModels[b.metadata.id] ?? controlModels[b.identifier];
					const aAvail = aEntry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, aEntry.minVSCodeVersion) ? 1 : 0;
					const bAvail = bEntry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, bEntry.minVSCodeVersion) ? 1 : 0;
					if (aAvail !== bAvail) {
						return aAvail - bAvail;
					}
					const aCopilot = a.metadata.vendor === 'copilot' ? 0 : 1;
					const bCopilot = b.metadata.vendor === 'copilot' ? 0 : 1;
					if (aCopilot !== bCopilot) {
						return aCopilot - bCopilot;
					}
					const vendorCmp = a.metadata.vendor.localeCompare(b.metadata.vendor);
					return vendorCmp !== 0 ? vendorCmp : a.metadata.name.localeCompare(b.metadata.name);
				});

			if (otherModels.length > 0) {
				if (items.length > 0) {
					items.push({ kind: ActionListItemKind.Separator });
				}
				items.push({
					item: {
						id: 'otherModels',
						enabled: true,
						checked: false,
						class: undefined,
						tooltip: localize('chat.modelPicker.otherModels', "Other Models"),
						label: localize('chat.modelPicker.otherModels', "Other Models"),
						run: () => { /* toggle handled by isSectionToggle */ }
					},
					kind: ActionListItemKind.Action,
					label: localize('chat.modelPicker.otherModels', "Other Models"),
					group: { title: '', icon: Codicon.chevronDown },
					hideIcon: false,
					section: ModelPickerSection.Other,
					isSectionToggle: true,
					toolbarActions: onManageModels ? [toAction({
						id: 'workbench.action.chat.manage',
						label: localize('chat.modelPicker.manageModels', "Manage Models"),
						class: ThemeIcon.asClassName(Codicon.settingsGear),
						run: () => onManageModels(),
					})] : [],
				});
				for (const model of otherModels) {
					const entry = controlModels[model.metadata.id] ?? controlModels[model.identifier];
					if (entry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
						items.push(createUnavailableModelItem(model.metadata.id, entry, 'update', manageSettingsUrl, updateStateType, chatEntitlementService, ModelPickerSection.Other));
					} else {
						items.push(createModelItem(createModelAction(model, selectedModelId, onSelect, languageModelsService!, ModelPickerSection.Other), model));
					}
				}
			}
		}

		if (manageModelsAction) {
			items.push({ kind: ActionListItemKind.Separator, section: otherModels.length ? ModelPickerSection.Other : undefined });
			items.push({
				item: manageModelsAction,
				kind: ActionListItemKind.Action,
				label: manageModelsAction.label,
				group: { title: '', icon: Codicon.blank },
				hideIcon: false,
				section: otherModels.length ? ModelPickerSection.Other : undefined,
				showAlways: true,
			});
		}
	} else {
		// Flat list: auto first, then all models sorted alphabetically
		const autoModel = models.find(m => isAutoModel(m));
		if (autoModel) {
			items.push(createModelItem(createModelAction(autoModel, selectedModelId, onSelect, languageModelsService!), autoModel));
		}
		const sortedModels = models
			.filter(m => m !== autoModel)
			.sort((a, b) => {
				const vendorCmp = a.metadata.vendor.localeCompare(b.metadata.vendor);
				return vendorCmp !== 0 ? vendorCmp : a.metadata.name.localeCompare(b.metadata.name);
			});
		for (const model of sortedModels) {
			items.push(createModelItem(createModelAction(model, selectedModelId, onSelect, languageModelsService!), model));
		}
	}

	return items;
}

export function getModelPickerAccessibilityProvider() {
	return {
		isChecked(element: IActionListItem<IActionWidgetDropdownAction>) {
			if (element.isSectionToggle) {
				return undefined;
			}
			return element.kind === ActionListItemKind.Action ? !!element?.item?.checked : undefined;
		},
		getRole: (element: IActionListItem<IActionWidgetDropdownAction>) => {
			if (element.isSectionToggle) {
				return 'menuitem';
			}
			switch (element.kind) {
				case ActionListItemKind.Action: return 'menuitemradio';
				case ActionListItemKind.Separator: return 'separator';
				default: return 'separator';
			}
		},
		getWidgetRole: () => 'menu',
	} as const;
}

function createUnavailableModelItem(
	id: string,
	entry: IModelControlEntry,
	reason: 'upgrade' | 'update' | 'admin',
	manageSettingsUrl: string | undefined,
	updateStateType: StateType,
	chatEntitlementService: IChatEntitlementService,
	section?: string,
): IActionListItem<IActionWidgetDropdownAction> {
	let description: string | MarkdownString | undefined;

	if (reason === 'upgrade') {
		description = new MarkdownString(localize('chat.modelPicker.upgradeLink', "[Upgrade](command:workbench.action.chat.upgradePlan \" \")"), { isTrusted: true });
	} else if (reason === 'update') {
		description = localize('chat.modelPicker.updateDescription', "Update VS Code");
	} else {
		description = manageSettingsUrl
			? new MarkdownString(localize('chat.modelPicker.adminLink', "[Contact your admin]({0})", manageSettingsUrl), { isTrusted: true })
			: localize('chat.modelPicker.adminDescription', "Contact your admin");
	}

	let hoverContent: MarkdownString;
	if (reason === 'upgrade') {
		hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		if (chatEntitlementService.entitlement === ChatEntitlement.Pro) {
			hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHoverProPlus', "[Upgrade to GitHub Copilot Pro+](command:workbench.action.chat.upgradePlan \" \") to use the best models."));
		} else {
			hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan \" \") to use the best models."));
		}
	} else if (reason === 'update') {
		hoverContent = getUpdateHoverContent(updateStateType);
	} else {
		hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		hoverContent.appendMarkdown(localize('chat.modelPicker.adminHover', "This model is not available. Contact your administrator to enable it."));
	}

	return {
		item: {
			id,
			enabled: false,
			checked: false,
			class: undefined,
			tooltip: entry.label,
			label: entry.label,
			description: typeof description === 'string' ? description : undefined,
			run: () => { }
		},
		kind: ActionListItemKind.Action,
		label: entry.label,
		description,
		group: { title: '', icon: ThemeIcon.fromId(Codicon.blank.id) },
		disabled: true,
		hideIcon: false,
		className: 'chat-model-picker-unavailable',
		section,
		hover: { content: hoverContent },
	};
}

type ModelPickerBadge = 'info' | 'warning';

/**
 * A model selection dropdown widget.
 *
 * Renders a button showing the currently selected model name.
 * On click, opens a grouped picker popup with:
 * Auto → Promoted (recently used + curated) → Other Models (collapsed with search).
 *
 * The widget owns its state - set models, selection, and curated IDs via setters.
 * Listen for selection changes via `onDidChangeSelection`.
 */
export class ModelPickerWidget extends Disposable {

	private readonly _onDidChangeSelection = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeSelection: Event<ILanguageModelChatMetadataAndIdentifier> = this._onDidChangeSelection.event;

	private _selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	private _badge: ModelPickerBadge | undefined;
	private _hideChevrons: IObservable<boolean> | undefined;
	private readonly _contextWindowExpanded = new Map<string, boolean>();
	private readonly _configHoverStore = this._register(new DisposableStore());

	private _domNode: HTMLElement | undefined;
	private _badgeIcon: HTMLElement | undefined;

	get selectedModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._selectedModel;
	}

	get domNode(): HTMLElement | undefined {
		return this._domNode;
	}

	constructor(
		private readonly _delegate: IModelPickerDelegate,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IProductService private readonly _productService: IProductService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILayoutService private readonly _layoutService: ILayoutService,
	) {
		super();

		this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
			this._renderLabel();
		}));
	}

	setHideChevrons(hideChevrons: IObservable<boolean>): void {
		this._hideChevrons = hideChevrons;
		this._register(autorun(reader => {
			const hide = hideChevrons.read(reader);
			if (this._domNode) {
				this._domNode.classList.toggle('hide-chevrons', hide);
			}
			this._renderLabel();
		}));
	}

	setSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		this._selectedModel = model;
		this._renderLabel();
	}

	setEnabled(enabled: boolean): void {
		if (this._domNode) {
			this._domNode.classList.toggle('disabled', !enabled);
			this._domNode.setAttribute('aria-disabled', String(!enabled));
		}
	}

	setBadge(badge: ModelPickerBadge | undefined): void {
		this._badge = badge;
		this._updateBadge();
	}

	render(container: HTMLElement): void {
		this._domNode = dom.append(container, dom.$('a.action-label'));
		this._domNode.tabIndex = 0;
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('aria-haspopup', 'true');
		this._domNode.setAttribute('aria-expanded', 'false');

		// Apply initial collapsed state now that _domNode exists
		if (this._hideChevrons?.get()) {
			this._domNode.classList.toggle('hide-chevrons', true);
		}

		this._badgeIcon = dom.append(this._domNode, dom.$('span.model-picker-badge'));
		this._updateBadge();

		this._renderLabel();

		// Route clicks to the appropriate dropdown based on which segment was clicked
		this._register(dom.addDisposableGenericMouseDownListener(this._domNode, e => {
			if (e.button !== 0) {
				return; // only left click
			}
			dom.EventHelper.stop(e, true);
			const target = e.target as HTMLElement;
			if (target.classList.contains('chat-model-picker-config-thinking') || target.closest('.chat-model-picker-config-thinking')) {
				this._showConfigDropdown('thinking', target);
			} else if (target.classList.contains('chat-model-picker-config-context') || target.closest('.chat-model-picker-config-context')) {
				this._toggleContextWindow();
			} else {
				this.show();
			}
		}));

		// Open picker on Enter/Space
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				this.show();
			}
		}));
	}

	show(anchor?: HTMLElement): void {
		const anchorElement = anchor ?? this._domNode;
		if (!anchorElement || this._domNode?.classList.contains('disabled')) {
			return;
		}

		const previousModel = this._selectedModel;

		const onSelect = (model: ILanguageModelChatMetadataAndIdentifier) => {
			this._telemetryService.publicLog2<ChatModelChangeEvent, ChatModelChangeClassification>('chat.modelChange', {
				fromModel: previousModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(previousModel.identifier) : 'unknown',
				toModel: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(model.identifier) : 'unknown'
			});
			this._selectedModel = model;
			this._renderLabel();
			this._onDidChangeSelection.fire(model);
		};

		const models = this._delegate.getModels();
		const showFilter = models.length >= 10;
		const isPro = isProUser(this._entitlementService.entitlement);
		const manifest = this._languageModelsService.getModelsControlManifest();
		const controlModelsForTier = isPro ? manifest.paid : manifest.free;
		const logModelPickerInteraction = (interaction: ChatModelPickerInteraction) => {
			this._telemetryService.publicLog2<ChatModelPickerInteractionEvent, ChatModelPickerInteractionClassification>('chat.modelPickerInteraction', { interaction });
		};
		const manageSettingsUrl = this._productService.defaultChatAgent?.manageSettingsUrl;
		const items = buildModelPickerItems(
			models,
			this._selectedModel?.identifier,
			this._languageModelsService.getRecentlyUsedModelIds(),
			controlModelsForTier,
			this._productService.version,
			this._updateService.state.type,
			onSelect,
			manageSettingsUrl,
			this._delegate.useGroupedModelPicker(),
			undefined,
			this._entitlementService,
			this._delegate.showUnavailableFeatured(),
			this._delegate.showFeatured(),
			this._languageModelsService,
			() => {
				this._actionWidgetService.hide();
				this._openerService.open(URI.parse('command:workbench.action.chat.manage'), { allowCommands: true });
			},
		);

		const listOptions = {
			showFilter,
			filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
			filterTrailingLabel: localize('chat.modelPicker.costHeader', "Relative cost"),
			focusFilterOnOpen: true,
			collapsedByDefault: new Set([ModelPickerSection.Other]),
			onDidToggleSection: (section: string, collapsed: boolean) => {
				if (section === ModelPickerSection.Other) {
					logModelPickerInteraction(collapsed ? 'otherModelsCollapsed' : 'otherModelsExpanded');
				}
			},
			linkHandler: (uri: URI) => {
				if (uri.scheme === 'command' && uri.path === 'workbench.action.chat.upgradePlan') {
					logModelPickerInteraction('premiumModelUpgradePlanClicked');
				} else if (manageSettingsUrl && this._uriIdentityService.extUri.isEqual(uri, URI.parse(manageSettingsUrl))) {
					logModelPickerInteraction('disabledModelContactAdminClicked');
				}
				void this._openerService.open(uri, { allowCommands: true });
			},
			minWidth: 340,
		};
		const previouslyFocusedElement = dom.getActiveElement();

		const delegate = {
			onSelect: (action: IActionWidgetDropdownAction) => {
				this._actionWidgetService.hide();
				action.run();
			},
			onHide: () => {
				this._domNode?.setAttribute('aria-expanded', 'false');
				if (dom.isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
			}
		};

		this._domNode?.setAttribute('aria-expanded', 'true');

		this._actionWidgetService.show(
			'ChatModelPicker',
			false,
			items,
			delegate,
			anchorElement,
			undefined,
			[],
			getModelPickerAccessibilityProvider(),
			listOptions
		);

		const activeElement = dom.getActiveElement();
		if (dom.isHTMLInputElement(activeElement) && activeElement.classList.contains('action-list-filter-input')) {
			activeElement.classList.add('chat-model-picker-filter-input');
		}
	}

	private _toggleContextWindow(): void {
		const model = this._selectedModel;
		if (!model) {
			return;
		}

		const schema = model.metadata.configurationSchema;
		const contextSchema = schema?.properties?.['contextWindow'];
		if (contextSchema?.enum && contextSchema.enum.length >= 2) {
			const config = this._languageModelsService.getModelConfiguration(model.identifier);
			const currentValue = config?.['contextWindow'] ?? contextSchema.default;
			const defaultOption = contextSchema.default ?? contextSchema.enum[0];
			const maxOption = contextSchema.enum[contextSchema.enum.length - 1];
			const newValue = currentValue === maxOption ? defaultOption : maxOption;
			const expanding = newValue === maxOption;
			const defaultLabel = formatContextLabel(typeof defaultOption === 'number' ? defaultOption : model.metadata.maxInputTokens);
			const maxLabel = formatContextLabel(typeof maxOption === 'number' ? maxOption : 1_000_000);
			if (!expanding) {
				// Shrinking — show compaction warning with accept
				this._showContextWindowBanner(false, defaultLabel, maxLabel, () => {
					void this._languageModelsService.setModelConfiguration(model.identifier, { contextWindow: newValue });
					this._renderLabel();
				});
			} else {
				// Expanding — show confirmation with accept
				this._showContextWindowBanner(true, defaultLabel, maxLabel, () => {
					void this._languageModelsService.setModelConfiguration(model.identifier, { contextWindow: newValue });
					this._renderLabel();
				});
			}
		} else {
			const current = this._contextWindowExpanded.get(model.identifier) ?? false;
			const expanding = !current;
			const defaultLabel = formatContextLabel(model.metadata.maxInputTokens);
			const maxLabel = '1M';
			if (!expanding) {
				this._showContextWindowBanner(false, defaultLabel, maxLabel, () => {
					this._contextWindowExpanded.set(model.identifier, false);
					this._renderLabel();
				});
			} else {
				this._showContextWindowBanner(true, defaultLabel, maxLabel, () => {
					this._contextWindowExpanded.set(model.identifier, true);
					this._renderLabel();
				});
			}
		}
	}

	private _contextBannerElement: HTMLElement | undefined;

	private _showContextWindowBanner(expanding: boolean, defaultLabel: string, maxLabel: string, onAccept?: () => void): void {
		// Find the input part to insert the banner
		const container = this._layoutService.getContainer(dom.getWindow(this._domNode!));
		const inputParts = container.querySelectorAll('.part.auxiliarybar .interactive-input-part, .part.chatbar .interactive-input-part, .part.chatbar .new-chat-input-container'); // eslint-disable-line no-restricted-syntax
		let inputPart: HTMLElement | null = null;
		for (const part of inputParts) {
			if ((part as HTMLElement).offsetParent !== null) {
				inputPart = part as HTMLElement;
				break;
			}
		}
		if (!inputPart && inputParts.length > 0) {
			inputPart = inputParts[0] as HTMLElement;
		}
		if (!inputPart) {
			return;
		}

		// Remove existing banner if any
		this._clearContextWindowBanner();

		const banner = document.createElement('div');
		banner.className = 'copilot-prototype-chat-banner info simple compact-single-row';
		this._contextBannerElement = banner;

		const row = document.createElement('div');
		row.className = 'copilot-prototype-chat-banner-top';

		const icon = document.createElement('span');
		icon.className = 'copilot-prototype-chat-banner-icon';
		icon.append(...renderLabelWithIcons('$(info)'));
		row.appendChild(icon);

		const titleText = document.createElement('span');
		titleText.className = 'copilot-prototype-chat-banner-title';

		if (expanding) {
			titleText.textContent = localize('chat.contextBanner.expandTitle', "Increase to {0} context window?", maxLabel);
		} else {
			titleText.textContent = localize('chat.contextBanner.compactTitle', "Reduce to {0} context window?", defaultLabel);
		}
		row.appendChild(titleText);

		const desc = document.createElement('span');
		desc.className = 'copilot-prototype-chat-banner-inline-desc';
		if (expanding) {
			desc.textContent = localize('chat.contextBanner.expandDescShort', "Uses more tokens per request.");
		} else {
			desc.textContent = localize('chat.contextBanner.compactDescShort', "May compact earlier context.");
		}
		row.appendChild(desc);

		const actions = document.createElement('span');
		actions.className = 'copilot-prototype-chat-banner-actions';

		if (onAccept) {
			const accept = document.createElement('span');
			accept.className = 'copilot-prototype-chat-banner-action-btn';
			accept.append(...renderLabelWithIcons('$(check)'));
			accept.tabIndex = 0;
			accept.role = 'button';
			accept.title = localize('chat.contextBanner.accept', "Confirm");
			accept.addEventListener('click', () => {
				onAccept();
				this._clearContextWindowBanner();
			});
			actions.appendChild(accept);
		}

		const dismiss = document.createElement('span');
		dismiss.className = 'copilot-prototype-chat-banner-action-btn';
		dismiss.append(...renderLabelWithIcons('$(close)'));
		dismiss.tabIndex = 0;
		dismiss.role = 'button';
		dismiss.title = localize('dismiss', "Dismiss");
		dismiss.addEventListener('click', () => this._clearContextWindowBanner());
		actions.appendChild(dismiss);

		row.appendChild(actions);
		banner.appendChild(row);

		// Find or create the banner container
		let bannerContainer = inputPart.querySelector('.copilot-prototype-banner-container') as HTMLElement | null; // eslint-disable-line no-restricted-syntax
		if (!bannerContainer) {
			bannerContainer = document.createElement('div');
			bannerContainer.className = 'copilot-prototype-banner-container';
			inputPart.insertBefore(bannerContainer, inputPart.firstChild);
		}
		bannerContainer.style.display = '';
		bannerContainer.appendChild(banner);
	}

	private _clearContextWindowBanner(): void {
		if (this._contextBannerElement) {
			const container = this._contextBannerElement.parentElement;
			this._contextBannerElement.remove();
			this._contextBannerElement = undefined;
			if (container && container.children.length === 0) {
				container.style.display = 'none';
			}
		}
	}

	private _showConfigDropdown(kind: 'thinking' | 'context', anchor: HTMLElement): void {
		const model = this._selectedModel;
		if (!model) {
			return;
		}

		const schema = model.metadata.configurationSchema;
		if (!schema?.properties) {
			return;
		}

		const propKey = kind === 'thinking'
			? (schema.properties['thinkingLevel'] ? 'thinkingLevel' : 'reasoningEffort')
			: 'contextWindow';
		const propSchema = schema.properties[propKey];
		if (!propSchema?.enum || !Array.isArray(propSchema.enum)) {
			return;
		}

		const config = this._languageModelsService.getModelConfiguration(model.identifier);
		const currentValue = config?.[propKey] ?? propSchema.default;
		const enumLabels = propSchema.enumItemLabels;
		const enumDescriptions = propSchema.enumDescriptions as string[] | undefined;

		// Fallback descriptions for thinking effort levels when none provided
		const fallbackThinkingDescriptions: Record<string, string> = {
			'low': localize('chat.modelPicker.thinkingLow', "Faster responses with less reasoning"),
			'medium': localize('chat.modelPicker.thinkingMedium', "Balanced reasoning and speed"),
			'high': localize('chat.modelPicker.thinkingHigh', "Greater reasoning depth but slower"),
		};

		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		for (let i = 0; i < propSchema.enum.length; i++) {
			const value = propSchema.enum[i] as string;
			const label = enumLabels?.[i] ?? String(value);
			const isDefault = value === propSchema.default;
			const displayLabel = isDefault ? `${label} (${localize('chat.modelPicker.default', "default")})` : label;
			const description = enumDescriptions?.[i] ?? (kind === 'thinking' ? fallbackThinkingDescriptions[value.toLowerCase()] : undefined);
			items.push({
				item: {
					id: `config-${propKey}-${value}`,
					enabled: true,
					checked: value === currentValue,
					class: undefined,
					tooltip: displayLabel,
					label: displayLabel,
					description,
					run: () => {
						void this._languageModelsService.setModelConfiguration(model.identifier, { [propKey]: value });
						this._renderLabel();
					}
				},
				kind: ActionListItemKind.Action,
				label: displayLabel,
				description,
				group: { title: '', icon: ThemeIcon.fromId(value === currentValue ? Codicon.check.id : Codicon.blank.id) },
				hideIcon: false,
			});
		}

		const title = kind === 'thinking'
			? (typeof propSchema.title === 'string' ? propSchema.title : localize('chat.modelPicker.thinkingEffort', "Thinking effort"))
			: (typeof propSchema.title === 'string' ? propSchema.title : localize('chat.modelPicker.contextWindow', "Context window"));

		// Add header
		items.unshift({
			kind: ActionListItemKind.Header,
			group: { title },
			label: title,
		});

		const previouslyFocusedElement = dom.getActiveElement();
		const delegate = {
			onSelect: (action: IActionWidgetDropdownAction) => {
				this._actionWidgetService.hide();
				action.run();
			},
			onHide: () => {
				if (dom.isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
			}
		};

		this._actionWidgetService.show(
			`ChatModelConfig_${propKey}`,
			false,
			items,
			delegate,
			anchor,
			undefined,
			[],
			{
				getRole: () => 'menuitemradio',
				getWidgetRole: () => 'menu',
			},
			{ minWidth: 340 }
		);
	}

	private _updateBadge(): void {
		if (this._badgeIcon) {
			if (this._badge) {
				const icon = this._badge === 'info' ? Codicon.info : Codicon.warning;
				dom.reset(this._badgeIcon, renderIcon(icon));
				this._badgeIcon.style.display = '';
				this._badgeIcon.classList.toggle('info', this._badge === 'info');
				this._badgeIcon.classList.toggle('warning', this._badge === 'warning');
			} else {
				this._badgeIcon.style.display = 'none';
			}
		}
	}

	private _renderLabel(): void {
		if (!this._domNode) {
			return;
		}

		this._configHoverStore.clear();

		const { name, statusIcon, configurationSchema } = this._selectedModel?.metadata || {};
		const domChildren: (HTMLElement | string)[] = [];

		if (statusIcon) {
			const iconElement = renderIcon(statusIcon);
			domChildren.push(iconElement);
		}

		const modelLabel = name ?? localize('chat.modelPicker.auto', "Auto");
		const modelLabelEl = dom.$('span.chat-input-picker-label', undefined, modelLabel);

		// Show thinking effort and context window labels when configured
		if (this._selectedModel && configurationSchema?.properties) {
			const config = this._languageModelsService.getModelConfiguration(this._selectedModel.identifier);
			const thinkingSchema = configurationSchema.properties['thinkingLevel'] ?? configurationSchema.properties['reasoningEffort'];
			const thinkingKey = configurationSchema.properties['thinkingLevel'] ? 'thinkingLevel' : 'reasoningEffort';

			const configItems: HTMLElement[] = [];

			if (thinkingSchema) {
				const thinkingValue = config?.[thinkingKey] ?? thinkingSchema.default;
				if (thinkingValue && thinkingSchema.enum && thinkingSchema.enumItemLabels) {
					const idx = thinkingSchema.enum.indexOf(thinkingValue);
					const fullLabel = idx >= 0 && thinkingSchema.enumItemLabels[idx] ? thinkingSchema.enumItemLabels[idx] : String(thinkingValue);
					const shortLabel = getShortThinkingLabel(fullLabel);
					configItems.push(dom.$('span.chat-model-picker-config-label.chat-model-picker-config-thinking', undefined, shortLabel));
				}
			}

			const contextSchema = configurationSchema.properties['contextWindow'];
			if (contextSchema) {
				const contextValue = config?.['contextWindow'] ?? contextSchema.default;
				const maxOption = contextSchema.enum?.[contextSchema.enum.length - 1];
				const isExpanded = maxOption !== undefined && contextValue === maxOption;
				const maxLabel = typeof maxOption === 'number' ? formatContextLabel(maxOption) : '1M';
				const contextLabel = isExpanded ? maxLabel : formatContextLabel(this._selectedModel.metadata.maxInputTokens);
				const contextEl = dom.$('span.chat-model-picker-config-label.chat-model-picker-config-context', undefined, contextLabel);
				contextEl.classList.toggle('context-enabled', isExpanded);
				const contextTooltip = isExpanded
					? localize('chat.modelPicker.contextWindowEnabledTooltip', "{0} context window enabled. Click to use the default context window. Larger context uses more tokens per request.", maxLabel)
					: localize('chat.modelPicker.contextWindowDisabledTooltip', "Using default context window. Click to enable {0} context for longer conversations and larger codebases.", maxLabel);
				this._configHoverStore.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), contextEl, contextTooltip));
				configItems.push(contextEl);
			} else if (thinkingSchema) {
				const isExpanded = this._contextWindowExpanded.get(this._selectedModel.identifier) ?? false;
				const contextLabel = isExpanded ? '1M' : formatContextLabel(this._selectedModel.metadata.maxInputTokens);
				const contextEl = dom.$('span.chat-model-picker-config-label.chat-model-picker-config-context', undefined, contextLabel);
				contextEl.classList.toggle('context-enabled', isExpanded);
				const contextTooltip = isExpanded
					? localize('chat.modelPicker.contextWindowEnabledTooltip', "{0} context window enabled. Click to use the default context window. Larger context uses more tokens per request.", '1M')
					: localize('chat.modelPicker.contextWindowDisabledTooltip', "Using default context window. Click to enable {0} context for longer conversations and larger codebases.", '1M');
				this._configHoverStore.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), contextEl, contextTooltip));
				configItems.push(contextEl);
			}

			if (configItems.length > 0) {
				const group = dom.$('span.chat-model-picker-config-group');
				group.appendChild(modelLabelEl);
				for (const item of configItems) {
					group.appendChild(item);
				}
				domChildren.push(group);
			} else {
				domChildren.push(modelLabelEl);
			}
		} else {
			domChildren.push(modelLabelEl);
		}

		// Badge icon between label and chevron
		if (this._badgeIcon) {
			domChildren.push(this._badgeIcon);
		}

		dom.reset(this._domNode, ...domChildren);

		// Aria
		this._domNode.ariaLabel = localize('chat.modelPicker.ariaLabel', "Pick Model, {0}", modelLabel);
	}
}


function getModelHoverContent(model: ILanguageModelChatMetadataAndIdentifier): MarkdownString | undefined {
	const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true, supportHtml: true });
	let hasContent = false;

// Title — strip parenthetical suffixes for a clean title
	const displayName = model.metadata.name.replace(/\s*\(.*\)\s*/g, '').trim() || model.metadata.name;
	markdown.appendMarkdown(`${displayName}`);
	hasContent = true;

	// Description
	if (model.metadata.tooltip) {
		// Strip multiplier-related sentences from tooltip
		const cleanTooltip = model.metadata.tooltip.replace(/\s*Rate is counted at \d+(\.\d+)?x\.?/gi, '').replace(/\s*Counted at \d+(\.\d+)?x\.?/gi, '').trim();
		if (cleanTooltip) {
			markdown.appendMarkdown('\n\n---\n\n');
			markdown.appendMarkdown(cleanTooltip);
		}
	}

	// Cost and context window info
	const costInfo = getModelCostInfoByName(model.metadata.name);
	if (costInfo) {
		markdown.appendMarkdown('\n\n---\n\n');
		markdown.appendMarkdown(`**${localize('chat.modelPicker.costPer1M', "Cost (per 1M tokens)")}**\n\n`);

		// Relative cost label above the per-token breakdown
		const ratio = getRelativeCost(model.metadata.name);
		let costLabel: string;
		if (ratio <= 0.15) {
			costLabel = localize('chat.modelPicker.relativeCostLowest', "Lower than most models");
		} else if (ratio <= 0.30) {
			costLabel = localize('chat.modelPicker.relativeCostLow', "Lower than most models");
		} else if (ratio <= 0.55) {
			costLabel = localize('chat.modelPicker.relativeCostMed', "About average");
		} else if (ratio <= 0.80) {
			costLabel = localize('chat.modelPicker.relativeCostHigh', "Higher than most models");
		} else {
			costLabel = localize('chat.modelPicker.relativeCostHighest', "Higher than most models");
		}
		markdown.appendMarkdown(`${localize('chat.modelPicker.relativeCostLabel', "Relative cost")}: ${costLabel}\n\n`);

		markdown.appendMarkdown(`${localize('chat.modelPicker.input', "Input")}: ${costInfo.input} ${localize('chat.modelPicker.credits', "credits")}\n\n`);
		markdown.appendMarkdown(`${localize('chat.modelPicker.cachedInput', "Cached input")}: ${costInfo.cachedInput} ${localize('chat.modelPicker.credits2', "credits")}\n\n`);
		markdown.appendMarkdown(`${localize('chat.modelPicker.output', "Output")}: ${costInfo.output} ${localize('chat.modelPicker.credits3', "credits")}`);
	}

	// Max context
	if (model.metadata.maxInputTokens) {
		markdown.appendMarkdown('\n\n');
		markdown.appendMarkdown(`**${localize('chat.modelPicker.maxContext', "Max context")}**\n\n`);
		markdown.appendMarkdown(formatContextLabel(model.metadata.maxInputTokens));
	}

	// Configurable tags — only for models with configurable thinking
	const schema = model.metadata.configurationSchema;
	const hasThinking = schema?.properties?.['thinkingLevel'] || schema?.properties?.['reasoningEffort'];
	if (hasThinking) {
		const tags: string[] = [];
		tags.push(localize('chat.modelPicker.thinkingEffort', "Thinking effort"));
		tags.push(localize('chat.modelPicker.contextWindow', "Context window"));
		markdown.appendMarkdown('\n\n---\n\n');
		markdown.appendMarkdown(localize('chat.modelPicker.configurable', "Configurable:") + ' ' + tags.map(t => `\`${t}\``).join(' '));
	}

	return hasContent ? markdown : undefined;
}

interface ModelCostInfo {
	input: number;
	cachedInput: number;
	output: number;
}

function getModelCostInfoByName(modelName: string): ModelCostInfo | undefined {
	const name = modelName.toLowerCase();

	// Claude models — ordered specific-first to avoid substring collisions
	if (name.includes('haiku')) {
		return { input: 30, cachedInput: 3, output: 150 };
	}
	if (name.includes('sonnet')) {
		return { input: 120, cachedInput: 12, output: 600 };
	}
	if (name.includes('opus 4.5')) {
		return { input: 300, cachedInput: 30, output: 1500 };
	}
	if (name.includes('opus 4.6')) {
		return { input: 400, cachedInput: 40, output: 2000 };
	}
	if (name.includes('opus')) {
		return { input: 500, cachedInput: 50, output: 2500 };
	}

	// GPT models — ordered specific-first
	if (name.includes('5 mini') || name.includes('5.4 mini')) {
		return { input: 25, cachedInput: 5, output: 120 };
	}
	if (name.includes('codex')) {
		return { input: 100, cachedInput: 25, output: 400 };
	}
	if (name.includes('4o')) {
		return { input: 80, cachedInput: 16, output: 320 };
	}
	if (name.includes('gpt-4.1')) {
		return { input: 60, cachedInput: 12, output: 240 };
	}
	if (name.includes('gpt-5.2')) {
		return { input: 150, cachedInput: 30, output: 600 };
	}
	if (name.includes('gpt-5.4')) {
		return { input: 200, cachedInput: 40, output: 800 };
	}
	if (name.includes('gpt-5')) {
		return { input: 150, cachedInput: 30, output: 600 };
	}

	// Gemini models
	if (name.includes('flash')) {
		return { input: 15, cachedInput: 3, output: 75 };
	}
	if (name.includes('gemini 3.1') || name.includes('gemini-3.1')) {
		return { input: 100, cachedInput: 20, output: 400 };
	}
	if (name.includes('gemini 2.5') || name.includes('gemini-2.5')) {
		return { input: 80, cachedInput: 16, output: 320 };
	}
	if (name.includes('gemini')) {
		return { input: 60, cachedInput: 12, output: 240 };
	}

	return undefined;
}


function isAutoModel(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.id === 'auto' && (model.metadata.vendor === 'copilot' || model.metadata.vendor === 'copilotcli');
}

const SHORT_THINKING_LABELS: Record<string, string> = {
	'Low': 'Low',
	'Medium': 'Med',
	'High': 'High',
	'Extra High': 'xHigh',
};

function getShortThinkingLabel(fullLabel: string): string {
	return SHORT_THINKING_LABELS[fullLabel] ?? fullLabel;
}

function formatContextLabel(maxInputTokens: number): string {
	if (maxInputTokens >= 1_000_000) {
		const m = maxInputTokens / 1_000_000;
		return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
	}
	if (maxInputTokens >= 1_000) {
		// Round up to nearest 50K for a clean display label
		const k = Math.ceil(maxInputTokens / 50_000) * 50;
		return `${k}K`;
	}
	return String(maxInputTokens);
}
