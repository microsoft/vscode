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
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../../services/chat/common/chatEntitlementService.js';
import * as semver from '../../../../../../base/common/semver/semver.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';
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
	};
}

function createModelAction(
	model: ILanguageModelChatMetadataAndIdentifier,
	selectedModelId: string | undefined,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	section?: string,
): IActionWidgetDropdownAction & { section?: string } {
	return {
		id: model.identifier,
		enabled: true,
		icon: model.metadata.statusIcon,
		checked: model.identifier === selectedModelId,
		class: undefined,
		description: model.metadata.multiplier ?? model.metadata.detail,
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
 * 3. Other Models (collapsible toggle, sorted by vendor then name)
 *    - Last item is "Manage Models..." (always visible during filtering)
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
	commandService: ICommandService,
	chatEntitlementService: IChatEntitlementService,
): IActionListItem<IActionWidgetDropdownAction>[] {
	const isPro = isProUser(chatEntitlementService.entitlement);
	const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
	let otherModels: ILanguageModelChatMetadataAndIdentifier[] = [];
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
	} else {
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
			if (!isPro) {
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
			items.push(createModelItem(createModelAction(autoModel, selectedModelId, onSelect), autoModel));
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
		for (const [entryId, entry] of Object.entries(controlModels)) {
			if (!entry.featured || placed.has(entryId)) {
				continue;
			}
			const model = resolveModel(entryId);
			if (model && !placed.has(model.identifier)) {
				markPlaced(model.identifier, model.metadata.id);
				if (entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
					promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: 'update' });
				} else {
					promotedItems.push({ kind: 'available', model });
				}
			} else if (!model && !entry.exists) {
				markPlaced(entryId);
				promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: getUnavailableReason(entry) });
			}
		}

		// Render promoted section: sorted alphabetically by name
		let hasShownActionLink = false;
		if (promotedItems.length > 0) {
			promotedItems.sort((a, b) => {
				const aName = a.kind === 'available' ? a.model.metadata.name : a.entry.label;
				const bName = b.kind === 'available' ? b.model.metadata.name : b.entry.label;
				return aName.localeCompare(bName);
			});

			for (const item of promotedItems) {
				if (item.kind === 'available') {
					items.push(createModelItem(createModelAction(item.model, selectedModelId, onSelect), item.model));
				} else {
					const showActionLink = item.reason === 'upgrade' ? !hasShownActionLink : true;
					if (showActionLink && item.reason === 'upgrade') {
						hasShownActionLink = true;
					}
					items.push(createUnavailableModelItem(item.id, item.entry, item.reason, manageSettingsUrl, updateStateType, undefined, showActionLink));
				}
			}
		}

		// --- 3. Other Models (collapsible) ---
		otherModels = models
			.filter(m => !placed.has(m.identifier) && !placed.has(m.metadata.id))
			.sort((a, b) => {
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
					items.push(createUnavailableModelItem(model.metadata.id, entry, 'update', manageSettingsUrl, updateStateType, ModelPickerSection.Other, true));
				} else {
					items.push(createModelItem(createModelAction(model, selectedModelId, onSelect, ModelPickerSection.Other), model));
				}
			}
		}
	}

	if (
		chatEntitlementService.entitlement === ChatEntitlement.Free ||
		chatEntitlementService.entitlement === ChatEntitlement.Pro ||
		chatEntitlementService.entitlement === ChatEntitlement.ProPlus ||
		chatEntitlementService.entitlement === ChatEntitlement.Business ||
		chatEntitlementService.entitlement === ChatEntitlement.Enterprise ||
		chatEntitlementService.isInternal
	) {
		items.push({ kind: ActionListItemKind.Separator, section: otherModels.length ? ModelPickerSection.Other : undefined });
		items.push({
			item: {
				id: 'manageModels',
				enabled: true,
				checked: false,
				class: undefined,
				tooltip: localize('chat.manageModels.tooltip', "Manage Language Models"),
				label: localize('chat.manageModels', "Manage Models..."),
				run: () => { commandService.executeCommand(MANAGE_CHAT_COMMAND_ID); }
			},
			kind: ActionListItemKind.Action,
			label: localize('chat.manageModels', "Manage Models..."),
			group: { title: '', icon: Codicon.blank },
			hideIcon: false,
			section: otherModels.length ? ModelPickerSection.Other : undefined,
			showAlways: true,
		});
	}

	return items;
}

function createUnavailableModelItem(
	id: string,
	entry: IModelControlEntry,
	reason: 'upgrade' | 'update' | 'admin',
	manageSettingsUrl: string | undefined,
	updateStateType: StateType,
	section?: string,
	showActionLink: boolean = true,
): IActionListItem<IActionWidgetDropdownAction> {
	let description: string | MarkdownString | undefined;

	if (reason === 'upgrade') {
		description = showActionLink
			? new MarkdownString(localize('chat.modelPicker.upgradeLink', "[Upgrade your plan](command:workbench.action.chat.upgradePlan \" \")"), { isTrusted: true })
			: undefined;
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
		hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHover', "[Upgrade your plan](command:workbench.action.chat.upgradePlan \" \") to use this model."));
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

export type ModelPickerBadge = 'info' | 'warning';

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
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IProductService private readonly _productService: IProductService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IUpdateService private readonly _updateService: IUpdateService,
	) {
		super();
	}

	setSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		this._selectedModel = model;
		this._renderLabel();
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

		this._badgeIcon = dom.append(this._domNode, dom.$('span.model-picker-badge'));
		this._updateBadge();

		this._renderLabel();

		// Open picker on click
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_DOWN, (e) => {
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
		if (!anchorElement) {
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
		const showCuratedModels = this._delegate.showCuratedModels?.() ?? true;
		const isPro = isProUser(this._entitlementService.entitlement);
		let controlModelsForTier: IStringDictionary<IModelControlEntry> = {};
		if (showCuratedModels) {
			const manifest = this._languageModelsService.getModelsControlManifest();
			controlModelsForTier = isPro ? manifest.paid : manifest.free;
		}
		const items = buildModelPickerItems(
			models,
			this._selectedModel?.identifier,
			this._languageModelsService.getRecentlyUsedModelIds(),
			controlModelsForTier,
			this._productService.version,
			this._updateService.state.type,
			onSelect,
			this._productService.defaultChatAgent?.manageSettingsUrl,
			this._commandService,
			this._entitlementService
		);

		const listOptions = {
			showFilter: models.length >= 10,
			filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
			focusFilterOnOpen: true,
			collapsedByDefault: new Set([ModelPickerSection.Other]),
			minWidth: 300,
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
			{
				isChecked(element) {
					return element.kind === 'action' && !!element?.item?.checked;
				},
				getRole: (e) => {
					switch (e.kind) {
						case 'action': return 'menuitemcheckbox';
						case 'separator': return 'separator';
						default: return 'separator';
					}
				},
				getWidgetRole: () => 'menu',
			},
			listOptions
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

		const { name, statusIcon } = this._selectedModel?.metadata || {};
		const domChildren: (HTMLElement | string)[] = [];

		if (statusIcon) {
			const iconElement = renderIcon(statusIcon);
			domChildren.push(iconElement);
		}

		domChildren.push(dom.$('span.chat-input-picker-label', undefined, name ?? localize('chat.modelPicker.auto', "Auto")));

		// Badge icon between label and chevron
		if (this._badgeIcon) {
			domChildren.push(this._badgeIcon);
		}

		domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(this._domNode, ...domChildren);

		// Aria
		const modelName = this._selectedModel?.metadata.name ?? localize('chat.modelPicker.auto', "Auto");
		this._domNode.ariaLabel = localize('chat.modelPicker.ariaLabel', "Pick Model, {0}", modelName);
	}
}


function getModelHoverContent(model: ILanguageModelChatMetadataAndIdentifier): MarkdownString {
	const isAuto = model.metadata.id === 'auto' && model.metadata.vendor === 'copilot';
	const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
	markdown.appendMarkdown(`**${model.metadata.name}**`);
	markdown.appendText(`\n`);

	if (model.metadata.statusIcon && model.metadata.tooltip) {
		if (model.metadata.statusIcon) {
			markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
		}
		markdown.appendMarkdown(`${model.metadata.tooltip}`);
		markdown.appendText(`\n`);
	}

	if (model.metadata.multiplier) {
		markdown.appendMarkdown(`${localize('multiplier.tooltip', "Each chat message counts {0} toward your premium request quota", model.metadata.multiplier)}`);
		markdown.appendText(`\n`);
	}

	if (!isAuto && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
		const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
		markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
		markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
		markdown.appendText(`\n`);
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
