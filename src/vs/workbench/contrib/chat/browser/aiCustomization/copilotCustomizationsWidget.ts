/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, derived, mapObservableArrayCached, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { AgentExtensionMode, IAgentExtensionInfo, IAgentExtensionInventory } from '../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { defaultInputBoxStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { canvasOwnerKey, type CanvasDefinitionSnapshot, getCanvasDefinitionInstanceId, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasService, isCanvasOwner, isOpenableExtensionCanvasDefinition } from '../../../canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../canvases/common/canvasDefinitionStore.js';
import { AICustomizationManagementCommands } from '../../common/aiCustomizationWorkspaceService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { extensionIcon, pluginIcon, userIcon, workspaceIcon } from './aiCustomizationIcons.js';
import { IAICustomizationManagementSectionWidget } from './aiCustomizationManagementSectionRegistry.js';
import { setVirtualizedRowActionsTabbable } from './customizationCardList.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeAriaLabel, getCustomizationTreeContentHeight, ICustomizationTreeGroup } from './customizationTree.js';
import { CustomizationToggle } from './customizationToggle.js';
import { ICopilotExtensionsService } from './copilotExtensionsService.js';

const $ = DOM.$;
const COPILOT_EXTENSION_ITEM_HEIGHT = 48;
const COPILOT_CANVAS_ITEM_HEIGHT = 44;
const COPILOT_CANVAS_GROUP_TEMPLATE_ID = 'copilotCanvasGroupHeader';
const COPILOT_EXTENSION_TEMPLATE_ID = 'copilotCanvasExtensionItem';
const COPILOT_CANVAS_TEMPLATE_ID = 'copilotCanvasItem';
const COPILOT_CANVAS_DEFINITION_CACHE_KEY = 'chat.customizations.canvases.knownDefinitions.v1';
const MAX_CACHED_CANVAS_EXTENSIONS = 200;

interface ICopilotCanvasItem {
	readonly context: ICanvasContext;
	readonly canvas: ICanvasDefinition;
	readonly extension: IAgentExtensionInfo | undefined;
	readonly inventoryMode: AgentExtensionMode;
	readonly cached: boolean;
}

interface ICopilotCanvasExtensionItem {
	readonly context: ICanvasContext;
	readonly extension: IAgentExtensionInfo | undefined;
	readonly extensionId: string;
	readonly extensionName: string;
	readonly extensionSource: ICanvasDefinition['extensionSource'];
	readonly inventoryMode: AgentExtensionMode;
	readonly canvases: readonly ICopilotCanvasItem[];
}

type CopilotCanvasGroupKey = 'user' | 'workspace' | 'plugin' | 'other';

interface ICopilotCanvasGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly groupKey: CopilotCanvasGroupKey;
	readonly transient: boolean;
}

interface ICopilotCanvasExtensionEntry {
	readonly type: 'extension';
	readonly item: ICopilotCanvasExtensionItem;
}

interface ICopilotCanvasEntry {
	readonly type: 'canvas';
	readonly item: ICopilotCanvasItem;
}

type CopilotCanvasTreeEntry = ICopilotCanvasGroupEntry | ICopilotCanvasExtensionEntry | ICopilotCanvasEntry;

interface ICopilotCanvasTreeGroup extends ICustomizationTreeGroup<CopilotCanvasTreeEntry> {
	readonly id: CopilotCanvasGroupKey;
	readonly element: ICopilotCanvasGroupEntry;
	readonly children: readonly ICopilotCanvasExtensionEntry[];
}

interface ICanvasRefreshBatch {
	readonly generation: number;
	readonly pendingOwnerKeys: Set<string>;
	errorMessage?: string;
}

interface ICanvasStoreLifetime {
	readonly ownerKey: string;
	disposed: boolean;
	request: object | undefined;
}

interface IFocusedCanvasAction {
	readonly itemKey: string;
	readonly actionId: 'toggle' | 'more';
}

interface ICachedCanvasDefinitionsState {
	readonly entries: readonly ICachedCanvasDefinitionsEntry[];
}

interface ICachedCanvasDefinitionsEntry {
	readonly key: string;
	readonly definitions: readonly ICanvasDefinition[];
	readonly updatedAt: number;
}

function isStoredCanvasDefinition(value: ICanvasDefinition): boolean {
	return typeof value.canvasId === 'string'
		&& typeof value.extensionId === 'string'
		&& (value.extensionSource === 'user' || value.extensionSource === 'project' || value.extensionSource === 'plugin' || value.extensionSource === 'unknown')
		&& (value.extensionName === undefined || typeof value.extensionName === 'string')
		&& typeof value.displayName === 'string'
		&& typeof value.description === 'string'
		&& typeof value.requiresInput === 'boolean';
}

class CopilotCanvasTreeDelegate implements IListVirtualDelegate<CopilotCanvasTreeEntry> {
	getHeight(entry: CopilotCanvasTreeEntry): number {
		if (entry.type === 'group-header') {
			return entry.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		return entry.type === 'extension' ? COPILOT_EXTENSION_ITEM_HEIGHT : COPILOT_CANVAS_ITEM_HEIGHT;
	}

	getTemplateId(entry: CopilotCanvasTreeEntry): string {
		if (entry.type === 'group-header') {
			return COPILOT_CANVAS_GROUP_TEMPLATE_ID;
		}
		return entry.type === 'extension' ? COPILOT_EXTENSION_TEMPLATE_ID : COPILOT_CANVAS_TEMPLATE_ID;
	}
}

interface ICopilotCanvasExtensionTemplateData {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly detail: HTMLElement;
	readonly pluginLink: HTMLAnchorElement;
	readonly detailSeparator: HTMLElement;
	readonly detailText: HTMLElement;
	readonly actions: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly moreButton: Button;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentItemKey: string | undefined;
}

class CopilotCanvasExtensionRenderer implements IListRenderer<ICopilotCanvasExtensionEntry, ICopilotCanvasExtensionTemplateData> {
	readonly templateId = COPILOT_EXTENSION_TEMPLATE_ID;
	private readonly templates = new Set<ICopilotCanvasExtensionTemplateData>();
	private focusedItemKey: string | undefined;

	constructor(
		private readonly getItemKey: (item: ICopilotCanvasExtensionItem) => string,
		private readonly getDetail: (item: ICopilotCanvasExtensionItem) => string,
		private readonly isEnabled: (item: ICopilotCanvasExtensionItem) => boolean,
		private readonly canToggle: (item: ICopilotCanvasExtensionItem) => boolean,
		private readonly getToggleUnavailableMessage: (item: ICopilotCanvasExtensionItem) => string,
		private readonly isMutationPending: (item: ICopilotCanvasExtensionItem) => boolean,
		private readonly hasMenuActions: (item: ICopilotCanvasExtensionItem) => boolean,
		private readonly onToggle: (item: ICopilotCanvasExtensionItem, enabled: boolean) => void,
		private readonly onOpenPlugin: (item: ICopilotCanvasExtensionItem) => void,
		private readonly onShowMenu: (item: ICopilotCanvasExtensionItem, anchor: HTMLElement) => void,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ICopilotCanvasExtensionTemplateData {
		const templateDisposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('copilot-customization-tree-item', 'copilot-canvas-extension-tree-item');
		const text = DOM.append(container, $('.copilot-customization-tree-text'));
		const label = DOM.append(text, $('.copilot-customization-tree-label'));
		const detail = DOM.append(text, $('.copilot-customization-tree-detail'));
		const pluginLink = DOM.append(detail, $<HTMLAnchorElement>('a.copilot-customization-tree-source-link.source-link'));
		const detailSeparator = DOM.append(detail, $('.copilot-customization-tree-detail-separator'));
		const detailText = DOM.append(detail, $('.copilot-customization-tree-detail-text'));
		const actions = DOM.append(container, $('.copilot-customization-tree-actions'));
		const toggle = templateDisposables.add(new CustomizationToggle({ ariaLabel: '' }));
		actions.appendChild(toggle.domNode);
		toggle.domNode.dataset.customizationAction = 'toggle';
		const moreButton = templateDisposables.add(new Button(actions, {
			...getButtonStyles({
				buttonSecondaryBackground: undefined,
				buttonSecondaryForeground: undefined,
				buttonSecondaryHoverBackground: undefined,
				buttonSecondaryBorder: undefined,
			}),
			secondary: true,
		}));
		moreButton.icon = Codicon.ellipsis;
		moreButton.element.classList.add('plugin-card-icon-button');
		moreButton.element.dataset.customizationAction = 'more';
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.CLICK, event => event.stopPropagation()));
		const template = { container, label, detail, pluginLink, detailSeparator, detailText, actions, toggle, moreButton, templateDisposables, elementDisposables, currentItemKey: undefined };
		this.templates.add(template);
		return template;
	}

	renderElement(entry: ICopilotCanvasExtensionEntry, _index: number, templateData: ICopilotCanvasExtensionTemplateData): void {
		templateData.elementDisposables.clear();
		const item = entry.item;
		const itemKey = this.getItemKey(item);
		const enabled = this.isEnabled(item);
		const canToggle = this.canToggle(item);
		const mutationPending = this.isMutationPending(item);
		templateData.currentItemKey = itemKey;
		templateData.container.dataset.customizationKey = itemKey;
		templateData.container.classList.toggle('disabled', !enabled);
		templateData.label.textContent = item.extensionName;
		const detailText = this.getDetail(item);
		const isPlugin = item.extensionSource === 'plugin';
		templateData.pluginLink.style.display = isPlugin ? '' : 'none';
		templateData.pluginLink.textContent = isPlugin
			? localize('copilotCanvases.pluginSource', "Plugin: {0}", item.extension?.pluginName ?? item.extensionName)
			: '';
		templateData.detailSeparator.style.display = isPlugin && detailText ? '' : 'none';
		templateData.detailSeparator.textContent = isPlugin && detailText ? '·' : '';
		templateData.detailText.textContent = detailText;
		if (isPlugin) {
			const openPluginLabel = localize('copilotCanvases.openPluginDetails', "Open plugin details for {0}", item.extension?.pluginName ?? item.extensionName);
			templateData.pluginLink.setAttribute('href', '#');
			templateData.pluginLink.setAttribute('aria-label', openPluginLabel);
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.pluginLink, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
			templateData.elementDisposables.add(DOM.addStandardDisposableListener(templateData.pluginLink, DOM.EventType.KEY_DOWN, event => {
				if (event.keyCode === KeyCode.Enter) {
					event.stopPropagation();
				}
			}));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.pluginLink, DOM.EventType.CLICK, event => {
				event.preventDefault();
				event.stopPropagation();
				this.onOpenPlugin(item);
			}));
		} else {
			templateData.pluginLink.removeAttribute('href');
			templateData.pluginLink.removeAttribute('aria-label');
		}
		templateData.toggle.domNode.style.display = item.extensionSource === 'project' ? 'none' : '';
		templateData.toggle.checked = enabled;
		templateData.toggle.disabled = !canToggle || mutationPending;
		const toggleLabel = enabled
			? localize('copilotCanvases.disableExtensionLabel', "Disable canvas extension '{0}'", item.extensionName)
			: localize('copilotCanvases.enableExtensionLabel', "Enable canvas extension '{0}'", item.extensionName);
		templateData.toggle.setAriaLabel(toggleLabel, canToggle ? toggleLabel : this.getToggleUnavailableMessage(item));
		templateData.elementDisposables.add(templateData.toggle.onChange(value => this.onToggle(item, value)));
		const showMenu = this.hasMenuActions(item);
		templateData.moreButton.element.style.display = showMenu ? '' : 'none';
		const moreLabel = localize('copilotCanvases.extensionMoreActions', "More Actions for Canvas Extension '{0}'", item.extensionName);
		templateData.moreButton.setTitle(moreLabel);
		templateData.moreButton.element.setAttribute('aria-label', moreLabel);
		if (showMenu) {
			templateData.elementDisposables.add(templateData.moreButton.onDidClick(event => {
				event?.stopPropagation();
				this.onShowMenu(item, templateData.moreButton.element);
			}));
		}
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.label, { content: item.extensionName }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.detail, { content: [templateData.pluginLink.textContent, detailText].filter(Boolean).join(' · ') }));
		this.updateActionsTabbability(templateData);
	}

	setFocusedItemKey(itemKey: string | undefined): void {
		this.focusedItemKey = itemKey;
		for (const template of this.templates) {
			this.updateActionsTabbability(template);
		}
	}

	focusAction(itemKey: string, actionId: IFocusedCanvasAction['actionId']): boolean {
		for (const template of this.templates) {
			if (template.currentItemKey !== itemKey) {
				continue;
			}
			if (actionId === 'toggle') {
				template.toggle.focus();
			} else {
				template.moreButton.element.focus();
			}
			return true;
		}
		return false;
	}

	private updateActionsTabbability(templateData: ICopilotCanvasExtensionTemplateData): void {
		const focused = templateData.currentItemKey === this.focusedItemKey;
		setVirtualizedRowActionsTabbable(templateData.actions, focused);
		templateData.pluginLink.tabIndex = focused && templateData.pluginLink.style.display !== 'none' ? 0 : -1;
	}

	disposeTemplate(templateData: ICopilotCanvasExtensionTemplateData): void {
		this.templates.delete(templateData);
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

interface ICopilotCanvasTemplateData {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly detail: HTMLElement;
	readonly actions: HTMLElement;
	readonly moreButton: Button;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentItemKey: string | undefined;
}

class CopilotCanvasRenderer implements IListRenderer<ICopilotCanvasEntry, ICopilotCanvasTemplateData> {
	readonly templateId = COPILOT_CANVAS_TEMPLATE_ID;
	private readonly templates = new Set<ICopilotCanvasTemplateData>();
	private focusedItemKey: string | undefined;

	constructor(
		private readonly getItemKey: (item: ICopilotCanvasItem) => string,
		private readonly getDetail: (item: ICopilotCanvasItem) => string,
		private readonly isEnabled: (item: ICopilotCanvasItem) => boolean,
		private readonly hasMenuActions: (item: ICopilotCanvasItem) => boolean,
		private readonly onShowMenu: (item: ICopilotCanvasItem, anchor: HTMLElement) => void,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ICopilotCanvasTemplateData {
		const templateDisposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('copilot-customization-tree-item', 'copilot-canvas-tree-item');
		const text = DOM.append(container, $('.copilot-customization-tree-text'));
		const label = DOM.append(text, $('.copilot-customization-tree-label'));
		const detail = DOM.append(text, $('.copilot-customization-tree-detail'));
		const actions = DOM.append(container, $('.copilot-customization-tree-actions'));
		const moreButton = templateDisposables.add(new Button(actions, {
			...getButtonStyles({
				buttonSecondaryBackground: undefined,
				buttonSecondaryForeground: undefined,
				buttonSecondaryHoverBackground: undefined,
				buttonSecondaryBorder: undefined,
			}),
			secondary: true,
		}));
		moreButton.icon = Codicon.ellipsis;
		moreButton.element.classList.add('plugin-card-icon-button');
		moreButton.element.dataset.customizationAction = 'more';
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.CLICK, event => event.stopPropagation()));
		const template = { container, label, detail, actions, moreButton, templateDisposables, elementDisposables, currentItemKey: undefined };
		this.templates.add(template);
		return template;
	}

	renderElement(entry: ICopilotCanvasEntry, _index: number, templateData: ICopilotCanvasTemplateData): void {
		templateData.elementDisposables.clear();
		const item = entry.item;
		const itemKey = this.getItemKey(item);
		const enabled = this.isEnabled(item);
		templateData.currentItemKey = itemKey;
		templateData.container.dataset.customizationKey = itemKey;
		templateData.container.classList.toggle('disabled', !enabled);
		templateData.container.classList.toggle('readonly', !enabled || !isOpenableExtensionCanvasDefinition(item.canvas));
		templateData.label.textContent = item.canvas.displayName;
		const detail = this.getDetail(item);
		templateData.detail.textContent = detail;
		const showMenu = this.hasMenuActions(item);
		templateData.moreButton.element.style.display = showMenu ? '' : 'none';
		const moreLabel = localize('copilotCanvases.canvasMoreActions', "More Actions for Canvas {0}", item.canvas.displayName);
		templateData.moreButton.setTitle(moreLabel);
		templateData.moreButton.element.setAttribute('aria-label', moreLabel);
		if (showMenu) {
			templateData.elementDisposables.add(templateData.moreButton.onDidClick(event => {
				event?.stopPropagation();
				this.onShowMenu(item, templateData.moreButton.element);
			}));
		}
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.label, { content: item.canvas.description || item.canvas.displayName }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.detail, { content: detail }));
		this.updateActionsTabbability(templateData);
	}

	setFocusedItemKey(itemKey: string | undefined): void {
		this.focusedItemKey = itemKey;
		for (const template of this.templates) {
			this.updateActionsTabbability(template);
		}
	}

	focusAction(itemKey: string): boolean {
		for (const template of this.templates) {
			if (template.currentItemKey === itemKey) {
				template.moreButton.element.focus();
				return true;
			}
		}
		return false;
	}

	private updateActionsTabbability(templateData: ICopilotCanvasTemplateData): void {
		setVirtualizedRowActionsTabbable(templateData.actions, templateData.currentItemKey === this.focusedItemKey);
	}

	disposeTemplate(templateData: ICopilotCanvasTemplateData): void {
		this.templates.delete(templateData);
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

export class CopilotCanvasesWidget extends Disposable implements IAICustomizationManagementSectionWidget {
	readonly element: HTMLElement;
	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly searchInput: InputBox;
	private readonly treeContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<CopilotCanvasTreeEntry>;
	private readonly extensionRenderer: CopilotCanvasExtensionRenderer;
	private readonly canvasRenderer: CopilotCanvasRenderer;
	private readonly emptyContainer: HTMLElement;
	private readonly emptyText: HTMLElement;
	private readonly emptySubtext: HTMLElement;
	private readonly canvasRefreshGeneration = observableValue(this, 0);
	private readonly extensionInventoriesChanged = observableSignal(this);
	private readonly activeCanvasOwnerKeys = new Set<string>();
	private readonly loadingCanvasOwnerKeys = new Set<string>();
	private readonly canvasErrors = new Map<string, string>();
	private readonly canvasStoreLifetimes = new Map<string, ICanvasStoreLifetime>();
	private readonly extensionInventories = new Map<string, IAgentExtensionInventory>();
	private readonly cachedDefinitions = new Map<string, ICachedCanvasDefinitionsEntry>();
	private readonly pendingExtensionMutations = new Set<string>();
	private readonly collapsedGroups = new Set<CopilotCanvasGroupKey>();
	private readonly collapsedExtensions = new Set<string>();
	private canvasRefreshBatch: ICanvasRefreshBatch | undefined;

	private extensions: readonly ICopilotCanvasExtensionItem[] = [];
	private lastHeight = 0;
	private lastWidth = 0;
	private lastItemCount = -1;
	private visible = false;
	private needsRender = false;
	private updatingTree = false;
	private closeCustomizationEditor: () => Promise<boolean> = () => Promise.resolve(true);

	constructor(
		container: HTMLElement,
		@ICopilotExtensionsService private readonly extensionsService: ICopilotExtensionsService,
		@ICanvasContextService private readonly canvasContextService: ICanvasContextService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IContextViewService contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.loadCachedDefinitions();
		this.element = DOM.append(container, $('.tools-list-widget.copilot-customizations-widget'));

		const header = DOM.append(this.element, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		DOM.append(titleRow, $('h2.section-title')).textContent = localize('copilotCanvases.title', "Canvases");
		const description = DOM.append(header, $('p.section-title-description'));
		DOM.append(description, $('span.section-title-description-text')).textContent = localize('copilotCanvases.description', "Canvases are interactive visual surfaces shared by you and the agent.");
		description.appendChild(document.createTextNode(' '));
		const learnMore = DOM.append(description, $<HTMLAnchorElement>('a.section-title-link'));
		learnMore.textContent = localize('copilotCanvases.learnMore', "Learn more about canvases");
		learnMore.href = 'https://code.visualstudio.com/docs/agents/run/agent-harnesses#_use-canvases-with-the-copilot-harness';
		this._register(DOM.addDisposableListener(learnMore, DOM.EventType.CLICK, event => {
			event.preventDefault();
			void openerService.open(URI.parse(learnMore.href));
		}));

		const searchRow = DOM.append(this.element, $('.tools-list-search-and-button-container'));
		const searchContainer = DOM.append(searchRow, $('.tools-list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: localize('copilotCanvases.search', "Type to search..."),
			ariaLabel: localize('copilotCanvases.searchAriaLabel', "Search Canvases"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(() => this.render()));

		this.treeContainer = DOM.append(this.element, $('.tools-list-tree.customization-tree-container.copilot-customizations-tree'));
		this.extensionRenderer = new CopilotCanvasExtensionRenderer(
			item => this.getExtensionItemKey(item),
			item => this.getExtensionDetail(item),
			item => this.isExtensionEnabled(item),
			item => this.canToggleExtension(item),
			item => this.getToggleUnavailableMessage(item),
			item => this.pendingExtensionMutations.has(this.getExtensionScopeKey(item)),
			item => this.hasExtensionActions(item),
			(item, enabled) => void this.setExtensionEnabled(item, enabled),
			item => void this.openExtensionProvider(item),
			(item, anchor) => this.showExtensionMenu(item, anchor),
			hoverService,
		);
		const groupRenderer = new CustomizationGroupHeaderRenderer<ICopilotCanvasGroupEntry>(
			COPILOT_CANVAS_GROUP_TEMPLATE_ID,
			hoverService,
		);
		this.canvasRenderer = new CopilotCanvasRenderer(
			item => this.getItemKey(item),
			item => this.getCanvasDetail(item),
			item => this.isCanvasEnabled(item),
			item => this.hasCanvasActions(item),
			(item, anchor) => this.showCanvasMenu(item, anchor),
			hoverService,
		);
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<CopilotCanvasTreeEntry>,
			'CopilotCanvasesManagementTree',
			this.treeContainer,
			new CopilotCanvasTreeDelegate(),
			[
				asTreeRenderer(groupRenderer),
				asTreeRenderer(this.extensionRenderer),
				asTreeRenderer(this.canvasRenderer),
			],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				hideTwistiesOfChildlessElements: false,
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				openOnSingleClick: false,
				identityProvider: { getId: entry => this.getTreeEntryId(entry) },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('copilotCanvases.listLabel', "Available Canvases"),
					getAriaLabel: entry => this.getTreeEntryAriaLabel(entry),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.type === 'group-header'
						? entry.label
						: entry.type === 'extension'
							? entry.item.extensionName
							: entry.item.canvas.displayName,
				},
			},
		));
		this._register(this.tree.onDidOpen(event => {
			if (event.element?.type === 'canvas') {
				this.activateCanvas(event.element.item);
			}
		}));
		this._register(this.tree.onContextMenu(event => {
			if (event.element?.type === 'extension') {
				this.showExtensionMenu(event.element.item, event.anchor);
			} else if (event.element?.type === 'canvas') {
				this.showCanvasMenu(event.element.item, event.anchor);
			}
		}));
		this._register(this.tree.onDidChangeFocus(event => {
			this.tree.setSelection([...event.elements]);
			const entry = event.elements[0];
			this.extensionRenderer.setFocusedItemKey(entry?.type === 'extension' ? this.getExtensionItemKey(entry.item) : undefined);
			this.canvasRenderer.setFocusedItemKey(entry?.type === 'canvas' ? this.getItemKey(entry.item) : undefined);
		}));
		this._register(this.tree.onDidChangeCollapseState(event => {
			if (this.updatingTree) {
				return;
			}
			const entry = event.node.element;
			if (!entry) {
				return;
			}
			if (entry.type === 'group-header') {
				entry.collapsed = event.node.collapsed;
				if (!entry.transient) {
					if (event.node.collapsed) {
						this.collapsedGroups.add(entry.groupKey);
					} else {
						this.collapsedGroups.delete(entry.groupKey);
					}
				}
				return;
			}
			if (entry.type !== 'extension') {
				return;
			}
			const key = this.getExtensionItemKey(entry.item);
			if (event.node.collapsed) {
				this.collapsedExtensions.add(key);
			} else {
				this.collapsedExtensions.delete(key);
			}
		}));
		this.emptyContainer = DOM.append(this.element, $('.list-empty-state'));
		this.emptyText = DOM.append(this.emptyContainer, $('.empty-state-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-state-subtext'));
		this.emptyContainer.style.display = 'none';

		const visibleCanvasContexts = derived(this, reader => {
			if (!this.canvasService.enabled.read(reader)) {
				return [];
			}
			return this.canvasContextService.contexts.read(reader)
				.filter(context => context.definitionProvider && this.canvasContextService.isOwnerVisible(context.owner, reader));
		});
		const canvasStores = mapObservableArrayCached(this, visibleCanvasContexts, (context, store) => {
			const owner = context.owner;
			const ownerKey = canvasOwnerKey(owner);
			const lifetime: ICanvasStoreLifetime = { ownerKey, disposed: false, request: undefined };
			this.canvasStoreLifetimes.set(ownerKey, lifetime);
			store.add(toDisposable(() => {
				lifetime.disposed = true;
				if (this.canvasStoreLifetimes.get(ownerKey) === lifetime) {
					this.canvasStoreLifetimes.delete(ownerKey);
					this.loadingCanvasOwnerKeys.delete(ownerKey);
					this.canvasErrors.delete(ownerKey);
					this.extensionInventories.delete(ownerKey);
				}
			}));
			const definitions = store.add(new CanvasDefinitionStore(reader => {
				const refreshGeneration = this.canvasRefreshGeneration.read(reader);
				const definitionProvider = context.definitionProvider;
				if (!definitionProvider || !this.canvasContextService.isOwnerVisible(owner, reader)) {
					return undefined;
				}
				observableSignalFromEvent(reader.store, definitionProvider.onDidChangeDefinitions).read(reader);
				return {
					owner,
					includeDefinition: () => true,
					listCanvases: () => this.listCanvasDefinitions(context, lifetime, refreshGeneration, () => definitionProvider.listCanvases()),
				};
			}, `[CopilotCanvasesWidget:${ownerKey}]`, this.logService)).definitions;
			return { owner, definitions };
		}, context => canvasOwnerKey(context.owner));
		const canvasExtensions = derived(this, reader => canvasStores.read(reader).flatMap(entry => {
			this.extensionInventoriesChanged.read(reader);
			const context = this.canvasContextService.contexts.read(reader)
				.find(candidate => isCanvasOwner(candidate.owner, entry.owner));
			if (!context) {
				return [];
			}
			const inventory = this.extensionInventories.get(canvasOwnerKey(entry.owner));
			return this.createExtensionItems(context, inventory, entry.definitions.read(reader));
		}));
		this._register(autorun(reader => {
			const activeOwnerKeys = new Set(visibleCanvasContexts.read(reader).map(context => canvasOwnerKey(context.owner)));
			this.updateActiveOwners(activeOwnerKeys);
			this.extensions = canvasExtensions.read(reader);
			this.updateItemCount();
			this.render();
		}));
		this.render();
	}

	layout(dimension: DOM.Dimension): void {
		this.lastHeight = dimension.height;
		this.lastWidth = dimension.width;
		if (this.element.parentElement?.style.display === 'none') {
			return;
		}
		this.searchInput.layout();
		const treeHeight = getCustomizationTreeContentHeight(this.element, this.treeContainer, dimension.height);
		this.treeContainer.style.height = `${treeHeight}px`;
		this.tree.layout(treeHeight, dimension.width);
	}

	focus(): void {
		this.searchInput.focus();
	}

	getAccessibilityContent(): string {
		const extensions = this.getFilteredExtensions();
		const groups = this.getExtensionGroups(extensions, !!this.searchInput.value.trim());
		const description = localize('copilotCanvases.availableDescription', "Canvas availability follows the chats currently visible in this window.");
		if (extensions.length === 0) {
			return [localize('copilotCanvases.title', "Canvases"), description, this.emptyText.textContent, this.emptySubtext.textContent].filter(Boolean).join('\n\n');
		}
		return [
			localize('copilotCanvases.title', "Canvases"),
			description,
			...groups.flatMap(group => [
				localize('copilotCanvases.accessibleGroup', "{0}. {1} canvas extensions.", group.label, group.count),
				...group.children.flatMap(({ item: extension }) => [
					localize(
						'copilotCanvases.accessibleExtension',
						"{0}. {1}. {2} Canvases. {3}",
						extension.extensionName,
						this.getExtensionStateLabel(extension),
						extension.canvases.length,
						this.canToggleExtension(extension) ? '' : this.getToggleUnavailableMessage(extension),
					),
					...extension.canvases.map(item => localize(
						'copilotCanvases.accessibleItem',
						"{0}. {1}. {2}.",
						item.canvas.displayName,
						this.getCanvasDetail(item),
						this.getCanvasStateLabel(item),
					)),
				]),
			]),
		].join('\n\n');
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible && this.needsRender) {
			this.render();
		}
		if (visible && this.lastHeight > 0) {
			this.layout(new DOM.Dimension(this.lastWidth, this.lastHeight));
		}
	}

	fireItemCount(): void {
		this._onDidChangeItemCount.fire(Math.max(0, this.lastItemCount));
	}

	setCloseCustomizationEditor(closeCustomizationEditor: () => Promise<boolean>): void {
		this.closeCustomizationEditor = closeCustomizationEditor;
	}

	private updateActiveOwners(activeOwnerKeys: Set<string>): void {
		this.activeCanvasOwnerKeys.clear();
		for (const ownerKey of activeOwnerKeys) {
			this.activeCanvasOwnerKeys.add(ownerKey);
		}
		for (const ownerKey of this.loadingCanvasOwnerKeys) {
			if (!activeOwnerKeys.has(ownerKey)) {
				this.loadingCanvasOwnerKeys.delete(ownerKey);
			}
		}
		for (const ownerKey of this.canvasErrors.keys()) {
			if (!activeOwnerKeys.has(ownerKey)) {
				this.canvasErrors.delete(ownerKey);
			}
		}
		for (const ownerKey of this.extensionInventories.keys()) {
			if (!activeOwnerKeys.has(ownerKey)) {
				this.extensionInventories.delete(ownerKey);
			}
		}
		if (this.canvasRefreshBatch) {
			for (const ownerKey of this.canvasRefreshBatch.pendingOwnerKeys) {
				if (!activeOwnerKeys.has(ownerKey)) {
					this.canvasRefreshBatch.pendingOwnerKeys.delete(ownerKey);
				}
			}
			this.completeCanvasRefreshIfReady();
		}
	}

	private createExtensionItems(context: ICanvasContext, inventory: IAgentExtensionInventory | undefined, liveDefinitions: readonly ICanvasDefinition[]): readonly ICopilotCanvasExtensionItem[] {
		const inventoryMode = inventory?.mode ?? 'unknown';
		const definitionsByExtension = new Map<string, ICanvasDefinition[]>();
		for (const canvas of liveDefinitions) {
			if (canvas.extensionSource === 'session') {
				continue;
			}
			const extension = this.findCanvasExtension(inventory, canvas);
			const key = extension?.id ?? canvas.extensionId;
			const definitions = definitionsByExtension.get(key) ?? [];
			definitions.push(canvas);
			definitionsByExtension.set(key, definitions);
		}

		const result: ICopilotCanvasExtensionItem[] = [];
		const handledExtensionIds = new Set<string>();
		for (const extension of inventory?.extensions ?? []) {
			const cachedDefinitions = this.cachedDefinitions.get(this.getCanvasCacheKey(context, extension.id, extension.source))?.definitions ?? [];
			const liveDefinitions = definitionsByExtension.get(extension.id);
			const definitions = liveDefinitions ?? cachedDefinitions;
			handledExtensionIds.add(extension.id);
			result.push(this.createExtensionItem(context, extension, inventoryMode, definitions, liveDefinitions === undefined && cachedDefinitions.length > 0));
		}
		for (const [extensionId, definitions] of definitionsByExtension) {
			if (handledExtensionIds.has(extensionId)) {
				continue;
			}
			result.push(this.createExtensionItem(context, undefined, inventoryMode, definitions, false));
		}
		return result.sort((left, right) => left.extensionName.localeCompare(right.extensionName));
	}

	private createExtensionItem(context: ICanvasContext, extension: IAgentExtensionInfo | undefined, inventoryMode: AgentExtensionMode, definitions: readonly ICanvasDefinition[], cached: boolean): ICopilotCanvasExtensionItem {
		const first = definitions[0];
		const extensionId = extension?.id ?? first?.extensionId;
		if (!extensionId) {
			throw new Error('A Canvas extension item requires an extension identity.');
		}
		const extensionName = extension?.source === 'plugin' && extension.pluginName && extension.name.startsWith(`${extension.pluginName}:`)
			? extension.name.slice(extension.pluginName.length + 1)
			: extension?.name ?? first?.extensionName ?? extensionId;
		const extensionSource = !first || first.extensionSource === 'unknown' && extension
			? extension?.source ?? 'unknown'
			: first.extensionSource;
		return {
			context,
			extension,
			extensionId,
			extensionName,
			extensionSource,
			inventoryMode,
			canvases: definitions
				.map(canvas => ({ context, canvas, extension, inventoryMode, cached }))
				.sort((left, right) => left.canvas.displayName.localeCompare(right.canvas.displayName)),
		};
	}

	private updateItemCount(): void {
		const count = this.extensions.reduce((total, extension) => total + extension.canvases.length, 0);
		if (this.lastItemCount !== count) {
			this.lastItemCount = count;
			this._onDidChangeItemCount.fire(this.lastItemCount);
		}
	}

	private loadCachedDefinitions(): void {
		const state = this.storageService.getObject<ICachedCanvasDefinitionsState>(
			COPILOT_CANVAS_DEFINITION_CACHE_KEY,
			StorageScope.PROFILE,
		);
		for (const entry of state?.entries ?? []) {
			if (typeof entry.key !== 'string' || typeof entry.updatedAt !== 'number' || !Array.isArray(entry.definitions)) {
				continue;
			}
			const definitions = entry.definitions.filter(isStoredCanvasDefinition);
			if (definitions.length > 0) {
				this.cachedDefinitions.set(entry.key, { key: entry.key, definitions, updatedAt: entry.updatedAt });
			}
		}
	}

	private updateCachedDefinitions(context: ICanvasContext, inventory: IAgentExtensionInventory | undefined, definitions: readonly ICanvasDefinition[]): void {
		const now = Date.now();
		let changed = false;
		const liveByExtension = new Map<string, ICanvasDefinition[]>();
		for (const canvas of definitions) {
			const extension = this.findCanvasExtension(inventory, canvas);
			const extensionId = extension?.id ?? canvas.extensionId;
			const source = extension?.source ?? canvas.extensionSource;
			const key = this.getCanvasCacheKey(context, extensionId, source);
			const values = liveByExtension.get(key) ?? [];
			values.push(canvas);
			liveByExtension.set(key, values);
		}
		for (const [key, values] of liveByExtension) {
			if (!structuralEquals(this.cachedDefinitions.get(key)?.definitions, values)) {
				this.cachedDefinitions.set(key, { key, definitions: values, updatedAt: now });
				changed = true;
			}
		}
		for (const extension of inventory?.extensions ?? []) {
			if (extension.status !== 'running') {
				continue;
			}
			const key = this.getCanvasCacheKey(context, extension.id, extension.source);
			if (!liveByExtension.has(key)) {
				changed = this.cachedDefinitions.delete(key) || changed;
			}
		}
		const entries = [...this.cachedDefinitions.values()]
			.sort((left, right) => right.updatedAt - left.updatedAt)
			.slice(0, MAX_CACHED_CANVAS_EXTENSIONS);
		changed = entries.length !== this.cachedDefinitions.size || changed;
		this.cachedDefinitions.clear();
		for (const entry of entries) {
			this.cachedDefinitions.set(entry.key, entry);
		}
		if (changed) {
			this.storageService.store(
				COPILOT_CANVAS_DEFINITION_CACHE_KEY,
				JSON.stringify({ entries } satisfies ICachedCanvasDefinitionsState),
				StorageScope.PROFILE,
				StorageTarget.MACHINE,
			);
		}
	}

	private getCanvasCacheKey(context: ICanvasContext, extensionId: string, source: IAgentExtensionInfo['source'] | ICanvasDefinition['extensionSource']): string {
		return `${canvasOwnerKey(context.owner)}\u0000${source}\u0000${extensionId}`;
	}

	private refreshCanvases(): void {
		this.canvasErrors.clear();
		const generation = this.canvasRefreshGeneration.get() + 1;
		this.canvasRefreshBatch = {
			generation,
			pendingOwnerKeys: new Set(this.activeCanvasOwnerKeys),
		};
		this.canvasRefreshGeneration.set(generation, undefined);
		status(localize('copilotCanvases.refreshing', "Refreshing Canvases."));
		this.completeCanvasRefreshIfReady();
		this.render();
	}

	private async listCanvasDefinitions(context: ICanvasContext, lifetime: ICanvasStoreLifetime, refreshGeneration: number, listCanvases: () => Promise<CanvasDefinitionSnapshot>): Promise<CanvasDefinitionSnapshot> {
		const request = {};
		lifetime.request = request;
		const isCurrent = () => !this._store.isDisposed
			&& !lifetime.disposed
			&& lifetime.request === request
			&& this.canvasStoreLifetimes.get(lifetime.ownerKey) === lifetime;
		if (!isCurrent()) {
			return undefined;
		}
		const ownerKey = lifetime.ownerKey;
		this.loadingCanvasOwnerKeys.add(ownerKey);
		this.canvasErrors.delete(ownerKey);
		this.render();
		try {
			const frontendSessionResource = this.canvasContextService.getFrontendSessionResource(context.owner);
			const inventoryPromise = frontendSessionResource
				? this.extensionsService.listExtensions(frontendSessionResource, CancellationToken.None).catch(error => {
					this.logService.warn(`[CopilotCanvasesWidget] Could not list extensions for ${ownerKey}: ${getErrorMessage(error)}`);
					return undefined;
				})
				: Promise.resolve(undefined);
			const [definitions, inventory] = await Promise.all([listCanvases(), inventoryPromise]);
			if (isCurrent() && inventory) {
				this.extensionInventories.set(ownerKey, inventory);
			}
			if (isCurrent() && definitions !== undefined) {
				this.updateCachedDefinitions(context, inventory, definitions);
			}
			if (isCurrent() && (inventory || definitions !== undefined)) {
				this.extensionInventoriesChanged.trigger(undefined);
			}
			return definitions;
		} catch (error) {
			if (isCurrent()) {
				const errorMessage = getErrorMessage(error);
				this.canvasErrors.set(ownerKey, errorMessage);
				if (this.canvasRefreshBatch?.generation === refreshGeneration) {
					this.canvasRefreshBatch.errorMessage ??= errorMessage;
				}
			}
			throw error;
		} finally {
			if (isCurrent()) {
				this.loadingCanvasOwnerKeys.delete(ownerKey);
				if (this.canvasRefreshBatch?.generation === refreshGeneration) {
					this.canvasRefreshBatch.pendingOwnerKeys.delete(ownerKey);
					this.completeCanvasRefreshIfReady();
				}
				this.render();
			}
		}
	}

	private completeCanvasRefreshIfReady(): void {
		const refresh = this.canvasRefreshBatch;
		if (!refresh || refresh.pendingOwnerKeys.size > 0) {
			return;
		}
		this.canvasRefreshBatch = undefined;
		if (refresh.errorMessage) {
			this.notificationService.error(localize('copilotCanvases.refreshFailed', "Unable to refresh Canvases. {0}", refresh.errorMessage));
		} else {
			status(localize('copilotCanvases.refreshed', "Canvases refreshed."));
		}
	}

	private render(): void {
		if (this._store.isDisposed) {
			return;
		}
		if (!this.visible) {
			this.needsRender = true;
			return;
		}
		this.needsRender = false;
		const focusedAction = this.captureFocusedAction();
		const extensions = this.getFilteredExtensions();
		const query = this.searchInput.value.trim();
		const groups = this.getExtensionGroups(extensions, !!query);
		const loading = this.loadingCanvasOwnerKeys.size > 0 || this.pendingExtensionMutations.size > 0;
		const showEmpty = extensions.length === 0;
		this.emptyContainer.style.display = showEmpty ? 'flex' : 'none';
		this.treeContainer.style.display = showEmpty ? 'none' : '';
		this.element.setAttribute('aria-busy', String(loading));

		this.updatingTree = true;
		try {
			if (showEmpty) {
				this.tree.setChildren(null);
				this.renderEmptyState();
			} else {
				const children: IObjectTreeElement<CopilotCanvasTreeEntry>[] = groups.map(group => ({
					element: group.element,
					collapsible: true,
					collapsed: group.element.collapsed
						? ObjectTreeElementCollapseState.PreserveOrCollapsed
						: ObjectTreeElementCollapseState.PreserveOrExpanded,
					children: group.children.map(({ item }) => {
						const key = this.getExtensionItemKey(item);
						return {
							element: { type: 'extension', item },
							collapsible: item.canvases.length > 0,
							collapsed: query
								? ObjectTreeElementCollapseState.Expanded
								: this.collapsedExtensions.has(key)
									? ObjectTreeElementCollapseState.PreserveOrCollapsed
									: ObjectTreeElementCollapseState.PreserveOrExpanded,
							children: item.canvases.map(canvas => ({ element: { type: 'canvas', item: canvas } })),
						};
					}),
				}));
				this.tree.setChildren(null, children);
			}
		} finally {
			this.updatingTree = false;
		}
		this.restoreFocusedAction(focusedAction);
		if (this.lastHeight > 0) {
			this.layout(new DOM.Dimension(this.lastWidth, this.lastHeight));
		}
	}

	private renderEmptyState(): void {
		if (this.loadingCanvasOwnerKeys.size > 0 && this.extensions.length === 0) {
			this.emptyText.textContent = localize('copilotCanvases.loading', "Loading Canvases...");
			this.emptySubtext.textContent = '';
			return;
		}
		const errorMessage = this.extensions.length === 0 ? this.canvasErrors.values().next().value : undefined;
		if (errorMessage) {
			this.emptyText.textContent = localize('copilotCanvases.unavailable', "Canvases Unavailable");
			this.emptySubtext.textContent = errorMessage;
			return;
		}
		if (this.activeCanvasOwnerKeys.size === 0) {
			this.emptyText.textContent = localize('copilotCanvases.noCompatibleChat', "Canvases are only available inside a session");
			this.emptySubtext.textContent = localize('copilotCanvases.noCompatibleChatDescription', "Select an active Copilot session and then open this Customizations menu again");
			return;
		}
		if (this.searchInput.value.trim()) {
			this.emptyText.textContent = localize('copilotCanvases.noMatches', "No Matching Canvases");
			this.emptySubtext.textContent = localize('copilotCanvases.noMatchesDescription', "Try a different search.");
			return;
		}
		this.emptyText.textContent = localize('copilotCanvases.empty', "No Canvases Available");
		this.emptySubtext.textContent = localize('copilotCanvases.emptyDescription', "None of the current Copilot chats provide any Canvases.");
	}

	private async setExtensionEnabled(item: ICopilotCanvasExtensionItem, enabled: boolean): Promise<void> {
		const currentItem = this.extensions.find(candidate => this.getExtensionItemKey(candidate) === this.getExtensionItemKey(item));
		if (!currentItem?.extension || !this.canToggleExtension(currentItem)) {
			this.render();
			return;
		}
		const sessionResource = this.canvasContextService.getFrontendSessionResource(currentItem.context.owner);
		if (!sessionResource) {
			this.notificationService.error(localize('copilotCanvases.targetUnavailable', "The chat that owns canvas extension '{0}' is no longer available.", currentItem.extensionName));
			return;
		}
		const mutationKey = this.getExtensionScopeKey(currentItem);
		const focusedAction = this.captureFocusedAction();
		this.pendingExtensionMutations.add(mutationKey);
		this.render();
		this.restoreFocusedAction(focusedAction);
		const focusedMutationAction = DOM.getActiveElement();
		try {
			await this.extensionsService.setExtensionEnabled(sessionResource, currentItem.extension.id, enabled);
			this.updateExtensionState(currentItem, enabled);
			status(enabled
				? localize('copilotCanvases.extensionEnabledAnnouncement', "Enabled canvas extension '{0}'.", currentItem.extensionName)
				: localize('copilotCanvases.extensionDisabledAnnouncement', "Disabled canvas extension '{0}'.", currentItem.extensionName));
			this.refreshCanvases();
		} catch (error) {
			this.notificationService.error(enabled
				? localize('copilotCanvases.extensionEnableFailed', "Could not enable canvas extension '{0}'. {1}", currentItem.extensionName, getErrorMessage(error))
				: localize('copilotCanvases.extensionDisableFailed', "Could not disable canvas extension '{0}'. {1}", currentItem.extensionName, getErrorMessage(error)));
		} finally {
			const shouldRestoreFocus = DOM.getActiveElement() === focusedMutationAction;
			this.pendingExtensionMutations.delete(mutationKey);
			this.render();
			if (shouldRestoreFocus) {
				this.restoreFocusedAction(focusedAction);
			}
		}
	}

	private updateExtensionState(item: ICopilotCanvasExtensionItem, enabled: boolean): void {
		const ownerKey = canvasOwnerKey(item.context.owner);
		const extensionId = item.extension?.id ?? item.extensionId;
		for (const [candidateOwnerKey, inventory] of this.extensionInventories) {
			if (candidateOwnerKey !== ownerKey) {
				continue;
			}
			const extensionIndex = inventory.extensions.findIndex(extension => extension.id === extensionId);
			if (extensionIndex === -1) {
				continue;
			}
			const extensions = [...inventory.extensions];
			extensions[extensionIndex] = {
				...extensions[extensionIndex],
				status: enabled ? 'starting' : 'disabled',
			};
			this.extensionInventories.set(candidateOwnerKey, { ...inventory, extensions });
		}
		this.extensionInventoriesChanged.trigger(undefined);
	}

	private showExtensionMenu(item: ICopilotCanvasExtensionItem, anchor: ReturnType<IContextMenuDelegate['getAnchor']>): void {
		const disposables = new DisposableStore();
		const actions = this.getExtensionActions(item, disposables);
		if (actions.length === 0) {
			disposables.dispose();
			return;
		}
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose(),
		});
	}

	private hasExtensionActions(item: ICopilotCanvasExtensionItem): boolean {
		return item.extensionSource === 'plugin'
			|| this.canRevealExtensionFolder(item)
			|| this.canToggleExtension(item);
	}

	private getExtensionActions(item: ICopilotCanvasExtensionItem, disposables: DisposableStore): IAction[] {
		const action = (id: string, label: string, run: () => unknown): IAction => {
			const result = new Action(id, label, undefined, true, async () => { await run(); });
			return disposables.add(result);
		};
		const groups: IAction[][] = [[], []];
		if (this.canToggleExtension(item)) {
			groups[0].push(this.isExtensionEnabled(item)
				? action('canvas.disableExtension', localize('copilotCanvases.disableExtension', "Disable Canvas Extension"), () => this.setExtensionEnabled(item, false))
				: action('canvas.enableExtension', localize('copilotCanvases.enableExtension', "Enable Canvas Extension"), () => this.setExtensionEnabled(item, true)));
		}
		if (item.extensionSource === 'plugin') {
			groups[1].push(action('canvas.showPlugin', localize('copilotCanvases.showPlugin', "Show Plugin"), () => this.openExtensionProvider(item)));
		} else if (this.canRevealExtensionFolder(item)) {
			groups[1].push(action(
				'canvas.openExtensionFolder',
				localize('copilotCanvases.openExtensionFolder', "Open Canvas Extension Folder"),
				() => this.commandService.executeCommand('revealFileInOS', dirname(item.extension!.resource!)),
			));
		}
		const actions: IAction[] = [];
		for (const group of groups.filter(group => group.length > 0)) {
			if (actions.length > 0) {
				actions.push(new Separator());
			}
			actions.push(...group);
		}
		return actions;
	}

	private canRevealExtensionFolder(item: ICopilotCanvasExtensionItem): boolean {
		const scheme = item.extension?.resource?.scheme;
		return scheme === Schemas.file || scheme === Schemas.vscodeUserData;
	}

	private showCanvasMenu(item: ICopilotCanvasItem, anchor: ReturnType<IContextMenuDelegate['getAnchor']>): void {
		const disposables = new DisposableStore();
		const actions = this.getCanvasActions(item, disposables);
		if (actions.length === 0) {
			disposables.dispose();
			return;
		}
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose(),
		});
	}

	private hasCanvasActions(item: ICopilotCanvasItem): boolean {
		return this.isCanvasEnabled(item) && isOpenableExtensionCanvasDefinition(item.canvas);
	}

	private getCanvasActions(item: ICopilotCanvasItem, disposables: DisposableStore): IAction[] {
		if (!this.hasCanvasActions(item)) {
			return [];
		}
		return [disposables.add(new Action(
			'canvas.show',
			localize('copilotCanvases.showCanvas', "Open Canvas"),
			undefined,
			true,
			() => this.openCanvas(item),
		))];
	}

	private async openCanvas(item: ICopilotCanvasItem): Promise<void> {
		const currentItem = this.extensions.flatMap(extension => extension.canvases)
			.find(candidate => this.getItemKey(candidate) === this.getItemKey(item));
		if (!currentItem || !this.canvasService.enabled.get() || !this.isCanvasEnabled(currentItem)) {
			return;
		}
		try {
			if (!await this.closeCustomizationEditor()) {
				return;
			}
			const instanceId = getCanvasDefinitionInstanceId(currentItem.canvas);
			const existing = currentItem.context.canvases.get()?.find(candidate => candidate.instanceId === instanceId);
			if (existing) {
				await this.canvasService.revealCanvas({ ...currentItem.context.owner, canvas: existing.resource });
				if (existing.source) {
					return;
				}
			}
			await currentItem.context.definitionProvider!.openCanvas(currentItem.canvas, instanceId);
		} catch (error) {
			this.notificationService.error(localize('copilotCanvases.openFailed', "Unable to open canvas {0}. {1}", currentItem.canvas.displayName, getErrorMessage(error)));
		}
	}

	private activateCanvas(item: ICopilotCanvasItem): void {
		const currentItem = this.extensions.flatMap(extension => extension.canvases)
			.find(candidate => this.getItemKey(candidate) === this.getItemKey(item));
		if (!currentItem || !this.isCanvasEnabled(currentItem)) {
			return;
		}
		if (isOpenableExtensionCanvasDefinition(currentItem.canvas)) {
			void this.openCanvas(currentItem);
		} else {
			void this.openExtensionProvider(this.getExtensionForCanvas(currentItem));
		}
	}

	private async openExtensionProvider(item: ICopilotCanvasExtensionItem): Promise<void> {
		if (item.extensionSource !== 'plugin') {
			return;
		}
		const currentItem = this.extensions.find(candidate => this.getExtensionItemKey(candidate) === this.getExtensionItemKey(item));
		const resource = currentItem?.extension?.resource;
		const plugin = resource && this.agentPluginService.plugins.get()
			.filter(candidate => isEqualOrParent(resource, candidate.uri))
			.sort((a, b) => b.uri.path.length - a.uri.path.length)[0];
		if (!plugin) {
			this.notificationService.info(localize('copilotCanvases.pluginUnavailable', "Plugin details for {0} are not available in this window.", item.extension?.pluginName ?? item.extensionName));
			return;
		}
		try {
			await this.commandService.executeCommand(AICustomizationManagementCommands.ShowPlugin, { pluginUri: plugin.uri });
		} catch (error) {
			this.notificationService.error(localize('copilotCanvases.showPluginFailed', "Unable to show plugin {0}. {1}", plugin.label, getErrorMessage(error)));
		}
	}

	private getExtensionForCanvas(item: ICopilotCanvasItem): ICopilotCanvasExtensionItem {
		return this.extensions.find(extension => extension.context === item.context && extension.canvases.includes(item))
			?? this.createExtensionItem(item.context, item.extension, item.inventoryMode, [item.canvas], item.cached);
	}

	private getExtensionGroups(extensions: readonly ICopilotCanvasExtensionItem[], transient: boolean): readonly ICopilotCanvasTreeGroup[] {
		const grouped = new Map<CopilotCanvasGroupKey, ICopilotCanvasExtensionEntry[]>();
		for (const item of extensions) {
			const key = this.getExtensionGroupKey(item);
			const group = grouped.get(key) ?? [];
			group.push({ type: 'extension', item });
			grouped.set(key, group);
		}

		const groups: ICopilotCanvasTreeGroup[] = [];
		for (const definition of this.getGroupDefinitions()) {
			const children = grouped.get(definition.key) ?? [];
			if (children.length === 0 && (transient || !definition.alwaysShow || extensions.length === 0)) {
				continue;
			}
			const collapsed = !transient && this.collapsedGroups.has(definition.key);
			const element: ICopilotCanvasGroupEntry = {
				type: 'group-header',
				id: `copilot-canvas-group:${transient ? 'search:' : ''}${definition.key}`,
				groupKey: definition.key,
				transient,
				label: definition.label,
				icon: definition.icon,
				count: children.length,
				isFirst: groups.length === 0,
				description: definition.description,
				collapsed,
			};
			groups.push({
				id: definition.key,
				label: definition.label,
				description: definition.description,
				count: children.length,
				element,
				children,
			});
		}
		return groups;
	}

	private getGroupDefinitions(): readonly { key: CopilotCanvasGroupKey; label: string; description: string; icon: ThemeIcon; alwaysShow: boolean }[] {
		return [
			{ key: 'user', label: localize('copilotCanvases.userGroup', "User"), description: localize('copilotCanvases.userGroupDescription', "Canvas extensions available in every workspace."), icon: userIcon, alwaysShow: true },
			{ key: 'workspace', label: localize('copilotCanvases.workspaceGroup', "Workspace"), description: localize('copilotCanvases.workspaceGroupDescription', "Canvas extensions provided by this workspace."), icon: workspaceIcon, alwaysShow: true },
			{ key: 'plugin', label: localize('copilotCanvases.pluginGroup', "Plugins"), description: localize('copilotCanvases.pluginGroupDescription', "Canvas extensions provided by installed plugins."), icon: pluginIcon, alwaysShow: false },
			{ key: 'other', label: localize('copilotCanvases.otherGroup', "Other"), description: localize('copilotCanvases.otherGroupDescription', "Canvas extensions provided by another runtime source."), icon: extensionIcon, alwaysShow: false },
		];
	}

	private getExtensionGroupKey(item: ICopilotCanvasExtensionItem): CopilotCanvasGroupKey {
		switch (item.extensionSource) {
			case 'user': return 'user';
			case 'project': return 'workspace';
			case 'plugin': return 'plugin';
			default: return 'other';
		}
	}

	private getTreeEntryId(entry: CopilotCanvasTreeEntry): string {
		if (entry.type === 'group-header') {
			return entry.id;
		}
		return entry.type === 'extension' ? this.getExtensionItemKey(entry.item) : this.getItemKey(entry.item);
	}

	private getTreeEntryAriaLabel(entry: CopilotCanvasTreeEntry): string {
		if (entry.type === 'group-header') {
			return getCustomizationTreeAriaLabel(entry.label, entry.count, entry.collapsed);
		}
		if (entry.type === 'extension') {
			return localize(
				'copilotCanvases.extensionRowAriaLabel',
				"{0}. {1}. {2}. {3} Canvases. {4}",
				entry.item.extensionName,
				this.getExtensionSource(entry.item),
				this.getExtensionStateLabel(entry.item),
				entry.item.canvases.length,
				this.canToggleExtension(entry.item) ? '' : this.getToggleUnavailableMessage(entry.item),
			);
		}
		return localize(
			'copilotCanvases.rowAriaLabel',
			"{0}. {1}.",
			entry.item.canvas.displayName,
			this.getCanvasStateLabel(entry.item),
		);
	}

	private getExtensionItemKey(item: ICopilotCanvasExtensionItem): string {
		return `extension:${canvasOwnerKey(item.context.owner)}\u0000${item.extension?.id ?? item.extensionId}`;
	}

	private getItemKey(item: ICopilotCanvasItem): string {
		return `canvas:${canvasOwnerKey(item.context.owner)}\u0000${item.canvas.extensionId}\u0000${item.canvas.canvasId}`;
	}

	private getExtensionScopeKey(item: ICopilotCanvasExtensionItem): string {
		const extensionId = item.extension?.id ?? item.extensionId;
		return `${canvasOwnerKey(item.context.owner)}\u0000${extensionId}`;
	}

	private findCanvasExtension(inventory: IAgentExtensionInventory | undefined, canvas: ICanvasDefinition): IAgentExtensionInfo | undefined {
		if (!inventory) {
			return undefined;
		}
		return inventory.extensions.find(extension => extension.id === canvas.extensionId);
	}

	private captureFocusedAction(): IFocusedCanvasAction | undefined {
		const activeElement = DOM.getActiveElement();
		if (!DOM.isHTMLElement(activeElement) || !this.treeContainer.contains(activeElement)) {
			return undefined;
		}
		const row = activeElement.closest<HTMLElement>('[data-customization-key]');
		const action = activeElement.closest<HTMLElement>('[data-customization-action]');
		const itemKey = row?.dataset.customizationKey;
		const actionId = action?.dataset.customizationAction;
		return itemKey && (actionId === 'toggle' || actionId === 'more') ? { itemKey, actionId } : undefined;
	}

	private restoreFocusedAction(focusedAction: IFocusedCanvasAction | undefined): void {
		if (!focusedAction) {
			return;
		}
		const activeElement = DOM.getActiveElement();
		const activeRow = DOM.isHTMLElement(activeElement) ? activeElement.closest<HTMLElement>('[data-customization-key]') : undefined;
		const activeAction = DOM.isHTMLElement(activeElement) ? activeElement.closest<HTMLElement>('[data-customization-action]') : undefined;
		if (activeRow?.dataset.customizationKey === focusedAction.itemKey && activeAction?.dataset.customizationAction === focusedAction.actionId) {
			return;
		}
		if (!this.extensionRenderer.focusAction(focusedAction.itemKey, focusedAction.actionId)) {
			this.canvasRenderer.focusAction(focusedAction.itemKey);
		}
	}

	private getFilteredExtensions(): readonly ICopilotCanvasExtensionItem[] {
		const query = this.searchInput.value.trim().toLowerCase();
		if (!query) {
			return this.extensions;
		}
		return this.extensions.flatMap(extension => {
			const extensionMatches = [
				extension.extensionName,
				extension.extensionId,
				extension.extension?.pluginName,
				this.getExtensionSource(extension),
			].some(value => value?.toLowerCase().includes(query));
			const canvases = extensionMatches
				? extension.canvases
				: extension.canvases.filter(item => [
					item.canvas.displayName,
					item.canvas.description,
					item.canvas.canvasId,
				].some(value => value.toLowerCase().includes(query)));
			return extensionMatches || canvases.length > 0 ? [{ ...extension, canvases }] : [];
		});
	}

	private isCanvasEnabled(item: ICopilotCanvasItem): boolean {
		return item.extension ? item.extension.status !== 'disabled' : true;
	}

	private isExtensionEnabled(item: ICopilotCanvasExtensionItem): boolean {
		return item.extension ? item.extension.status !== 'disabled' : true;
	}

	private canToggleExtension(item: ICopilotCanvasExtensionItem): boolean {
		return !!item.extension
			&& item.extension.source !== 'project'
			&& item.inventoryMode === 'load_and_augment'
			&& item.extension.status !== 'starting'
			&& !this.pendingExtensionMutations.has(this.getExtensionScopeKey(item));
	}

	private getToggleUnavailableMessage(item: ICopilotCanvasExtensionItem): string {
		if (!item.extension) {
			return localize('copilotCanvases.extensionStateUnavailable', "Canvas extension state is unavailable.");
		}
		if (item.extension.source === 'project') {
			return localize('copilotCanvases.workspaceActionUnavailable', "Workspace canvas extension enablement is not available.");
		}
		if (item.inventoryMode === 'load_only') {
			return localize('copilotCanvases.loadOnlyActionUnavailable', "This runtime loads canvas extensions but does not allow changing their enablement.");
		}
		if (item.inventoryMode === 'disabled') {
			return localize('copilotCanvases.disabledActionUnavailable', "Canvas extension management is disabled by the runtime.");
		}
		if (item.extension.status === 'starting') {
			return localize('copilotCanvases.startingActionUnavailable', "This canvas extension is still starting.");
		}
		return localize('copilotCanvases.managementUnavailable', "Canvas extension enablement is unavailable.");
	}

	private getExtensionStateLabel(item: ICopilotCanvasExtensionItem): string {
		switch (item.extension?.status) {
			case 'disabled': return localize('copilotCanvases.disabledStatus', "Disabled");
			case 'failed': return localize('copilotCanvases.failedStatus', "Failed");
			case 'starting': return localize('copilotCanvases.startingStatus', "Starting");
			case 'unknown': return localize('copilotCanvases.notActiveStatus', "Not Active");
			default: return localize('copilotCanvases.enabledStatus', "Enabled");
		}
	}

	private getCanvasStateLabel(item: ICopilotCanvasItem): string {
		switch (item.extension?.status) {
			case 'disabled': return localize('copilotCanvases.disabledStatus', "Disabled");
			case 'failed': return localize('copilotCanvases.failedStatus', "Failed");
			case 'starting': return localize('copilotCanvases.startingStatus', "Starting");
			case 'unknown': return localize('copilotCanvases.notActiveStatus', "Not Active");
			default: return item.canvas.requiresInput
				? localize('copilotCanvases.requiresInput', "Requires Input")
				: localize('copilotCanvases.readyToOpen', "Ready to Open");
		}
	}

	private getCanvasDetail(item: ICopilotCanvasItem): string {
		if (item.cached) {
			return item.canvas.description
				? localize('copilotCanvases.lastKnownDescription', "Last known: {0}", item.canvas.description)
				: localize('copilotCanvases.lastKnown', "Last known Canvas");
		}
		return item.canvas.description || this.getCanvasStateLabel(item);
	}

	private getExtensionDetail(item: ICopilotCanvasExtensionItem): string {
		if (item.canvases.length === 0 && this.isExtensionEnabled(item)) {
			return localize('copilotCanvases.noCanvasesReported', "No Canvases Reported");
		}
		if (item.extensionSource === 'project') {
			return this.getExtensionSource(item);
		}
		if (item.extensionSource === 'plugin') {
			return '';
		}
		if (item.extension?.resource) {
			return this.labelService.getUriLabel(dirname(item.extension.resource), { relative: true });
		}
		return this.getExtensionSource(item);
	}

	private getExtensionSource(item: ICopilotCanvasExtensionItem): string {
		switch (item.extensionSource) {
			case 'plugin': return this.getPluginLabel(item);
			case 'project': return localize('copilotCanvases.workspaceExtension', "Workspace Canvas Extension");
			case 'user': return localize('copilotCanvases.userExtension', "User Canvas Extension");
			default: return localize('copilotCanvases.otherExtension', "Canvas Provider");
		}
	}

	private getPluginLabel(item: ICopilotCanvasExtensionItem): string {
		return localize('copilotCanvases.pluginSource', "Plugin: {0}", item.extension?.pluginName ?? item.extensionName);
	}
}
