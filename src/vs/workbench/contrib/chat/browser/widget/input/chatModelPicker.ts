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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../../services/chat/common/chatEntitlementService.js';
import * as semver from '../../../../../../base/common/semver/semver.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUpdateService, StateType } from '../../../../../../platform/update/common/update.js';

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
	return {
		item: action,
		kind: ActionListItemKind.Action,
		label: action.label,
		description: action.description,
		group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
		hideIcon: false,
		section: action.section,
		hover: model ? { content: getModelHoverContent(model) } : undefined,
		submenuActions: action.toolbarActions,
	};
}

/**
 * Returns a short description summarizing the model's current configuration values
 * for properties marked with group 'navigation' (e.g., "High", "Medium").
 */
function getModelConfigurationDescription(model: ILanguageModelChatMetadataAndIdentifier, languageModelsService: ILanguageModelsService): string | undefined {
	const schema = model.metadata.configurationSchema;
	if (!schema?.properties) {
		return undefined;
	}

	const currentConfig = languageModelsService.getModelConfiguration(model.identifier) ?? {};
	const parts: string[] = [];

	for (const [key, propSchema] of Object.entries(schema.properties)) {
		if (propSchema.group !== 'navigation') {
			continue;
		}
		if (!propSchema.enum || propSchema.enum.length < 2) {
			continue;
		}
		const value = currentConfig[key] ?? propSchema.default;
		if (value === undefined) {
			continue;
		}
		const enumItemLabels = propSchema.enumItemLabels;
		const enumIndex = propSchema.enum?.indexOf(value) ?? -1;
		const label = enumItemLabels?.[enumIndex] ?? String(value);
		parts.push(label);
	}

	return parts.length > 0 ? parts.join(', ') : undefined;
}

function createModelAction(
	model: ILanguageModelChatMetadataAndIdentifier,
	selectedModelId: string | undefined,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	languageModelsService: ILanguageModelsService,
	section?: string,
): IActionWidgetDropdownAction & { section?: string } {
	const toolbarActions = languageModelsService.getModelConfigurationActions(model.identifier);
	const configDescription = getModelConfigurationDescription(model, languageModelsService);
	const baseDescription = model.metadata.multiplier ?? model.metadata.detail;
	const description = configDescription && baseDescription
		? `${configDescription} · ${baseDescription}`
		: configDescription ?? baseDescription;
	return {
		id: model.identifier,
		enabled: true,
		icon: model.metadata.statusIcon,
		checked: model.identifier === selectedModelId,
		class: undefined,
		description,
		tooltip: model.metadata.name,
		label: model.metadata.name,
		section,
		toolbarActions: toolbarActions && toolbarActions.length > 0 ? toolbarActions : undefined,
		run: () => onSelect(model),
	};
}

function shouldShowManageModelsAction(chatEntitlementService: IChatEntitlementService): boolean {
	return chatEntitlementService.entitlement === ChatEntitlement.Free ||
		chatEntitlementService.entitlement === ChatEntitlement.EDU ||
		chatEntitlementService.entitlement === ChatEntitlement.Pro ||
		chatEntitlementService.entitlement === ChatEntitlement.ProPlus ||
		chatEntitlementService.entitlement === ChatEntitlement.Business ||
		chatEntitlementService.entitlement === ChatEntitlement.Enterprise ||
		chatEntitlementService.isInternal;
}

function createManageModelsAction(commandService: ICommandService): IActionWidgetDropdownAction {
	return {
		id: 'manageModels',
		enabled: true,
		checked: false,
		class: ThemeIcon.asClassName(Codicon.gear),
		tooltip: localize('chat.manageModels.tooltip', "Manage Language Models"),
		label: localize('chat.manageModels', "Manage Models..."),
		run: () => { commandService.executeCommand(MANAGE_CHAT_COMMAND_ID); }
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
			const autoModel = models.find(m => m.metadata.id === 'auto' && m.metadata.vendor === 'copilot');
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
						items.push(createUnavailableModelItem(item.id, item.entry, item.reason, manageSettingsUrl, updateStateType));
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
				});
				for (const model of otherModels) {
					const entry = controlModels[model.metadata.id] ?? controlModels[model.identifier];
					if (entry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
						items.push(createUnavailableModelItem(model.metadata.id, entry, 'update', manageSettingsUrl, updateStateType, ModelPickerSection.Other));
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
		const autoModel = models.find(m => m.metadata.id === 'auto' && m.metadata.vendor === 'copilot');
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
		hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan \" \") to use the best models."));
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
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IProductService private readonly _productService: IProductService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
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

		// Open picker on click (uses pointerdown on iOS where mousedown is unreliable)
		this._register(dom.addDisposableGenericMouseDownListener(this._domNode, e => {
			if (e.button !== 0) {
				return; // only left click
			}
			dom.EventHelper.stop(e, true);
			this.show();
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
		const canShowManageModelsAction = this._delegate.showManageModelsAction() && shouldShowManageModelsAction(this._entitlementService);
		const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService) : undefined;
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
			!showFilter ? manageModelsAction : undefined,
			this._entitlementService,
			this._delegate.showUnavailableFeatured(),
			this._delegate.showFeatured(),
			this._languageModelsService,
		);

		const listOptions = {
			showFilter,
			filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
			filterActions: showFilter && manageModelsAction ? [manageModelsAction] : undefined,
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
			minWidth: 200,
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

		const { name, statusIcon } = this._selectedModel?.metadata || {};
		const domChildren: (HTMLElement | string)[] = [];

		if (statusIcon) {
			const iconElement = renderIcon(statusIcon);
			domChildren.push(iconElement);
		}

		const modelLabel = name ?? localize('chat.modelPicker.auto', "Auto");
		const configDescription = this._selectedModel
			? getModelConfigurationDescription(this._selectedModel, this._languageModelsService)
			: undefined;
		const fullLabel = configDescription
			? `${modelLabel} · ${configDescription}`
			: modelLabel;
		domChildren.push(dom.$('span.chat-input-picker-label', undefined, fullLabel));

		// Badge icon between label and chevron
		if (this._badgeIcon) {
			domChildren.push(this._badgeIcon);
		}

		domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(this._domNode, ...domChildren);

		// Aria
		this._domNode.ariaLabel = localize('chat.modelPicker.ariaLabel', "Pick Model, {0}", fullLabel);
	}
}


function getModelHoverContent(model: ILanguageModelChatMetadataAndIdentifier): MarkdownString {
	const isAuto = model.metadata.id === 'auto' && model.metadata.vendor === 'copilot';
	const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
	markdown.appendMarkdown(`**${model.metadata.name}**`);

	if (model.metadata.tooltip) {
		markdown.appendMarkdown(`\n\n`);
		if (model.metadata.statusIcon) {
			markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
		}
		markdown.appendMarkdown(`${model.metadata.tooltip}`);
	}

	if (!isAuto && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
		markdown.appendMarkdown(`\n\n`);
		const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
		markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
		markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
	}

	return markdown;
}


function formatTokenCount(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	} else if (count >= 1000) {
		return `${(count / 1000).toFixed(0)}K`;
	}
	return count.toString();
}
