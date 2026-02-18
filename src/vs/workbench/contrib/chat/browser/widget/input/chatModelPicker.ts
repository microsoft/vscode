/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IActionListDropdownOptions, IActionListDropdownEntry, IActionListDropdownItem, ActionListDropdown, ActionListDropdownItemKind } from '../../../../../../platform/actionWidget/browser/actionListDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { ICuratedModel, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatEntitlementService, isProUser } from '../../../../../services/chat/common/chatEntitlementService.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as semver from '../../../../../../base/common/semver/semver.js';

function isVersionAtLeast(current: string, required: string): boolean {
	const currentSemver = semver.coerce(current);
	if (!currentSemver) {
		return false;
	}
	return semver.gte(currentSemver, required);
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
	action: IActionListDropdownItem,
): IActionListDropdownEntry {
	return {
		item: action,
		kind: ActionListDropdownItemKind.Action,
	};
}

function createModelAction(
	model: ILanguageModelChatMetadataAndIdentifier,
	selectedModelId: string | undefined,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	section?: string,
): IActionListDropdownItem {
	return {
		id: model.identifier,
		icon: model.metadata.statusIcon,
		checked: model.identifier === selectedModelId,
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
 * 2. Recently used + curated models (merged, sorted alphabetically, no header)
 * 3. Other Models (collapsible toggle, sorted alphabetically)
 *    - Last item is "Manage Models..."
 */
function buildModelPickerItems(
	models: ILanguageModelChatMetadataAndIdentifier[],
	selectedModelId: string | undefined,
	recentModelIds: string[],
	curatedModels: ICuratedModel[],
	isProUser: boolean,
	currentVSCodeVersion: string,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	commandService: ICommandService,
	openerService: IOpenerService,
	upgradePlanUrl: string | undefined,
): IActionListDropdownEntry[] {
	const items: IActionListDropdownEntry[] = [];

	// Collect all available models
	const allModelsMap = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
	for (const model of models) {
		allModelsMap.set(model.identifier, model);
	}

	// Build a secondary lookup by metadata.id for flexible matching
	const modelsByMetadataId = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
	for (const model of models) {
		modelsByMetadataId.set(model.metadata.id, model);
	}

	// Track which model IDs have been placed in the promoted group
	const placed = new Set<string>();

	// --- 1. Auto ---
	const isAutoSelected = !selectedModelId || !allModelsMap.has(selectedModelId);
	const defaultModel = models.find(m => Object.values(m.metadata.isDefaultForLocation).some(v => v));
	const autoDescription = defaultModel?.metadata.multiplier ?? defaultModel?.metadata.detail;
	items.push(createModelItem({
		id: 'auto',
		checked: isAutoSelected,
		tooltip: localize('chat.modelPicker.auto', "Auto"),
		label: localize('chat.modelPicker.auto', "Auto"),
		description: autoDescription,
		run: () => {
			if (defaultModel) {
				onSelect(defaultModel);
			}
		}
	}));

	// --- 2. Promoted models (recently used + curated, merged & sorted alphabetically) ---
	const promotedModels: ILanguageModelChatMetadataAndIdentifier[] = [];
	const unavailableCurated: { curated: ICuratedModel; reason: 'upgrade' | 'update' | 'admin' }[] = [];

	// Add recently used (skip the default model - it's already represented by "Auto")
	for (const id of recentModelIds) {
		const model = allModelsMap.get(id);
		if (model && !placed.has(model.identifier) && model !== defaultModel) {
			promotedModels.push(model);
			placed.add(model.identifier);
			placed.add(model.metadata.id);
		}
	}

	// Add curated - available ones become promoted, unavailable ones become disabled entries
	for (const curated of curatedModels) {
		const model = allModelsMap.get(curated.id) ?? modelsByMetadataId.get(curated.id);
		if (model && !placed.has(model.identifier) && !placed.has(model.metadata.id)) {
			promotedModels.push(model);
			placed.add(model.identifier);
			placed.add(model.metadata.id);
		} else if (!model) {
			// Model is not available - determine reason
			if (!isProUser) {
				unavailableCurated.push({ curated, reason: 'upgrade' });
			} else if (curated.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, curated.minVSCodeVersion)) {
				unavailableCurated.push({ curated, reason: 'update' });
			} else {
				unavailableCurated.push({ curated, reason: 'admin' });
			}
		}
	}

	// Sort alphabetically for a stable list
	promotedModels.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

	if (promotedModels.length > 0 || unavailableCurated.length > 0) {
		items.push({
			kind: ActionListDropdownItemKind.Separator,
		});
		for (const model of promotedModels) {
			const action = createModelAction(model, selectedModelId, onSelect);
			items.push(createModelItem(action));
		}

		// Unavailable curated models shown as disabled with action button
		for (const { curated, reason } of unavailableCurated) {
			const label = reason === 'upgrade'
				? localize('chat.modelPicker.upgrade', "Upgrade")
				: reason === 'update'
					? localize('chat.modelPicker.update', "Update VS Code")
					: localize('chat.modelPicker.adminEnable', "Contact Admin");
			const onButtonClick = reason === 'upgrade' && upgradePlanUrl
				? () => openerService.open(URI.parse(upgradePlanUrl))
				: reason === 'update'
					? () => commandService.executeCommand('update.checkForUpdate')
					: () => { };
			items.push({
				item: {
					id: curated.id,
					tooltip: label,
					label: curated.id,
					disabled: true,
					descriptionButton: { label, onDidClick: onButtonClick },
					className: 'unavailable-model',
					run: () => { }
				},
				kind: ActionListDropdownItemKind.Action,
			});
		}
	}

	// --- 3. Other Models (collapsible) ---
	const otherModels: ILanguageModelChatMetadataAndIdentifier[] = [];
	for (const model of models) {
		if (!placed.has(model.identifier) && !placed.has(model.metadata.id)) {
			// Skip the default model - it's already represented by the top-level "Auto" entry
			const isDefault = Object.values(model.metadata.isDefaultForLocation).some(v => v);
			if (isDefault) {
				continue;
			}
			otherModels.push(model);
		}
	}

	if (otherModels.length > 0) {
		items.push({
			kind: ActionListDropdownItemKind.Separator,
		});
		items.push({
			item: {
				id: 'otherModels',
				label: localize('chat.modelPicker.otherModels', "Other Models"),
				tooltip: localize('chat.modelPicker.otherModels', "Other Models"),
				section: ModelPickerSection.Other,
				isSectionToggle: true,
				run: () => { /* toggle handled by isSectionToggle */ }
			},
			kind: ActionListDropdownItemKind.Action,
		});
		for (const model of otherModels) {
			const action = createModelAction(model, selectedModelId, onSelect, ModelPickerSection.Other);
			items.push(createModelItem(action));
		}

		// "Manage Models..." entry inside Other Models section, styled as a link
		items.push({
			item: {
				id: 'manageModels',
				label: localize('chat.manageModels', "Manage Models..."),
				tooltip: localize('chat.manageModels.tooltip', "Manage Language Models"),
				icon: Codicon.settingsGear,
				section: ModelPickerSection.Other,
				className: 'manage-models-link',
				run: () => {
					commandService.executeCommand(MANAGE_CHAT_COMMAND_ID);
				}
			},
			kind: ActionListDropdownItemKind.Action,
		});
	}

	return items;
}

function getActionListDropdownOptions(): IActionListDropdownOptions {
	return {
		collapsedByDefault: new Set([ModelPickerSection.Other]),
		minWidth: 300,
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

	private _models: ILanguageModelChatMetadataAndIdentifier[] = [];
	private _selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	private _badge: ModelPickerBadge | undefined;

	private _domNode: HTMLElement | undefined;
	private _badgeIcon: HTMLElement | undefined;
	private readonly _dropdown: ActionListDropdown;

	get selectedModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._selectedModel;
	}

	get domNode(): HTMLElement | undefined {
		return this._domNode;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IProductService private readonly _productService: IProductService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
	) {
		super();
		this._dropdown = this._register(this._instantiationService.createInstance(ActionListDropdown));
	}

	setModels(models: ILanguageModelChatMetadataAndIdentifier[]): void {
		this._models = models;
		this._renderLabel();
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

		const isPro = isProUser(this._entitlementService.entitlement);
		const curatedModels = this._languageModelsService.getCuratedModels();
		const curatedForTier = isPro ? curatedModels.paid : curatedModels.free;

		const items = buildModelPickerItems(
			this._models,
			this._selectedModel?.identifier,
			this._languageModelsService.getRecentlyUsedModelIds(),
			curatedForTier,
			isPro,
			this._productService.version,
			onSelect,
			this._commandService,
			this._openerService,
			this._productService.defaultChatAgent?.upgradePlanUrl,
		);

		const dropdownOptions = getActionListDropdownOptions();

		const delegate = {
			onSelect: (item: IActionListDropdownItem) => {
				this._dropdown.hide();
				item.run();
			},
			onHide: () => {
				this._domNode?.setAttribute('aria-expanded', 'false');
			}
		};

		this._domNode?.setAttribute('aria-expanded', 'true');

		this._dropdown.show(items, delegate, anchorElement, dropdownOptions);
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
