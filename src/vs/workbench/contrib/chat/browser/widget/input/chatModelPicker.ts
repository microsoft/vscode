/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { ICuratedModel, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatEntitlementService, isProUser } from '../../../../../services/chat/common/chatEntitlementService.js';
import * as semver from '../../../../../../base/common/semver/semver.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';

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
	upgradePlanUrl: string | undefined,
): IActionListItem<IActionWidgetDropdownAction>[] {
	const items: IActionListItem<IActionWidgetDropdownAction>[] = [];

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
	const autoModel = models.find(m => m.metadata.id === 'auto' && m.metadata.vendor === 'copilot')!;
	// Always mark the auto model as placed
	if (autoModel) {
		placed.add(autoModel.identifier);
		placed.add(autoModel.metadata.id);
		const action = createModelAction(autoModel, selectedModelId, onSelect);
		items.push(createModelItem(action, autoModel));
	}

	// --- 2. Promoted models (recently used + curated, merged & sorted alphabetically) ---
	const promotedModels: ILanguageModelChatMetadataAndIdentifier[] = [];
	const unavailableCurated: { curated: ICuratedModel; reason: 'upgrade' | 'update' | 'admin' }[] = [];

	// Always include the currently selected model in the promoted group
	if (selectedModelId && selectedModelId !== autoModel?.identifier) {
		const selectedModel = allModelsMap.get(selectedModelId);
		if (selectedModel && !placed.has(selectedModel.identifier)) {
			promotedModels.push(selectedModel);
			placed.add(selectedModel.identifier);
			placed.add(selectedModel.metadata.id);
		}
	}

	// Add recently used
	for (const id of recentModelIds) {
		const model = allModelsMap.get(id);
		if (model && !placed.has(model.identifier)) {
			promotedModels.push(model);
			placed.add(model.identifier);
			placed.add(model.metadata.id);
		}
	}

	// Add curated - available ones become promoted, unavailable ones become disabled entries
	for (const curated of curatedModels) {
		const model = allModelsMap.get(curated.id) ?? modelsByMetadataId.get(curated.id);
		if (model && !placed.has(model.identifier) && !placed.has(model.metadata.id)) {
			placed.add(model.identifier);
			placed.add(model.metadata.id);
			if (curated.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, curated.minVSCodeVersion)) {
				unavailableCurated.push({ curated, reason: 'update' });
			} else {
				promotedModels.push(model);
			}
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
			kind: ActionListItemKind.Separator,
		});
		for (const model of promotedModels) {
			const action = createModelAction(model, selectedModelId, onSelect);
			items.push(createModelItem(action, model));
		}

		// Unavailable curated models shown as disabled with action link
		for (const { curated, reason } of unavailableCurated) {
			let description: string | MarkdownString;
			if (reason === 'upgrade' && upgradePlanUrl) {
				description = new MarkdownString(localize('chat.modelPicker.upgradeLink', "[Upgrade]({0})", upgradePlanUrl), { isTrusted: true });
			} else if (reason === 'update') {
				description = new MarkdownString(localize('chat.modelPicker.updateLink', "[Update VS Code](command:update.checkForUpdate)"), { isTrusted: true });
			} else {
				description = localize('chat.modelPicker.adminEnable', "Contact Admin");
			}

			const hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
			if (reason === 'upgrade' && upgradePlanUrl) {
				hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHover', "This model requires a paid plan. [Upgrade]({0}) to access it.", upgradePlanUrl));
			} else if (reason === 'update') {
				hoverContent.appendMarkdown(localize('chat.modelPicker.updateHover', "This model requires a newer version of VS Code. [Update VS Code](command:update.checkForUpdate) to access it."));
			} else {
				hoverContent.appendMarkdown(localize('chat.modelPicker.adminHover', "This model is not available. Contact your administrator to enable it."));
			}

			items.push({
				item: {
					id: curated.id,
					enabled: false,
					checked: false,
					class: undefined,
					tooltip: curated.label,
					label: curated.label,
					description: typeof description === 'string' ? description : undefined,
					run: () => { }
				},
				kind: ActionListItemKind.Action,
				label: curated.label,
				description,
				disabled: true,
				group: { title: '', icon: Codicon.blank },
				hideIcon: false,
				hover: { content: hoverContent },
			});
		}
	}

	// --- 3. Other Models (collapsible) ---
	const otherModels: ILanguageModelChatMetadataAndIdentifier[] = [];
	for (const model of models) {
		if (!placed.has(model.identifier) && !placed.has(model.metadata.id)) {
			otherModels.push(model);
		}
	}
	// Copilot models first, then by vendor, each sub-group sorted alphabetically
	otherModels.sort((a, b) => {
		const aCopilot = a.metadata.vendor === 'copilot' ? 0 : 1;
		const bCopilot = b.metadata.vendor === 'copilot' ? 0 : 1;
		if (aCopilot !== bCopilot) {
			return aCopilot - bCopilot;
		}
		const vendorCmp = a.metadata.vendor.localeCompare(b.metadata.vendor);
		if (vendorCmp !== 0) {
			return vendorCmp;
		}
		return a.metadata.name.localeCompare(b.metadata.name);
	});

	if (otherModels.length > 0) {
		items.push({
			kind: ActionListItemKind.Separator,
		});
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
			const action = createModelAction(model, selectedModelId, onSelect, ModelPickerSection.Other);
			items.push(createModelItem(action, model));
		}

		// "Manage Models..." entry inside Other Models section, styled as a link
		items.push({
			item: {
				id: 'manageModels',
				enabled: true,
				checked: false,
				class: 'manage-models-action',
				tooltip: localize('chat.manageModels.tooltip', "Manage Language Models"),
				label: localize('chat.manageModels', "Manage Models..."),
				icon: Codicon.settingsGear,
				run: () => {
					commandService.executeCommand(MANAGE_CHAT_COMMAND_ID);
				}
			},
			kind: ActionListItemKind.Action,
			label: localize('chat.manageModels', "Manage Models..."),
			group: { title: '', icon: Codicon.settingsGear },
			hideIcon: false,
			section: ModelPickerSection.Other,
			className: 'manage-models-link',
		});
	}

	return items;
}

/**
 * Returns the ActionList options for the model picker (filter + collapsed sections).
 */
function getModelPickerListOptions(): IActionListOptions {
	return {
		showFilter: true,
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

		const isPro = isProUser(this._entitlementService.entitlement);
		const curatedModels = this._languageModelsService.getCuratedModels();
		const curatedForTier = isPro ? curatedModels.paid : curatedModels.free;

		const items = buildModelPickerItems(
			this._delegate.getModels(),
			this._selectedModel?.identifier,
			this._languageModelsService.getRecentlyUsedModelIds(),
			curatedForTier,
			isPro,
			this._productService.version,
			onSelect,
			this._commandService,
			this._productService.defaultChatAgent?.upgradePlanUrl,
		);

		const listOptions = getModelPickerListOptions();
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
	const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
	markdown.appendMarkdown(`**${model.metadata.name}**`);
	if (model.metadata.id !== model.metadata.version) {
		markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}@${model.metadata.version}_&nbsp;</span>`);
	} else {
		markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}_&nbsp;</span>`);
	}
	markdown.appendText(`\n`);

	if (model.metadata.statusIcon && model.metadata.tooltip) {
		if (model.metadata.statusIcon) {
			markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
		}
		markdown.appendMarkdown(`${model.metadata.tooltip}`);
		markdown.appendText(`\n`);
	}

	if (model.metadata.multiplier) {
		markdown.appendMarkdown(`${localize('models.cost', 'Multiplier')}: `);
		markdown.appendMarkdown(model.metadata.multiplier);
		markdown.appendMarkdown(` - ${localize('multiplier.tooltip', "Every chat message counts {0} towards your premium model request quota", model.metadata.multiplier)}`);
		markdown.appendText(`\n`);
	}

	if (model.metadata.maxInputTokens || model.metadata.maxOutputTokens) {
		const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
		markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
		markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
		markdown.appendText(`\n`);
	}

	if (model.metadata.capabilities) {
		markdown.appendMarkdown(`${localize('models.capabilities', 'Capabilities')}: `);
		if (model.metadata.capabilities?.toolCalling) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.toolCalling', 'Tools')}_&nbsp;</span>`);
		}
		if (model.metadata.capabilities?.vision) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.vision', 'Vision')}_&nbsp;</span>`);
		}
		if (model.metadata.capabilities?.agentMode) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.agentMode', 'Agent Mode')}_&nbsp;</span>`);
		}
		for (const editTool of model.metadata.capabilities.editTools ?? []) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${editTool}_&nbsp;</span>`);
		}
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
