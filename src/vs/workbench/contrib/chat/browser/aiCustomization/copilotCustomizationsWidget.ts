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
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, mapObservableArrayCached, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { dirname, isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { AgentExtensionMode, IAgentExtensionInfo, IAgentExtensionInventory } from '../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { Schemas } from '../../../../../base/common/network.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { canvasOwnerKey, type CanvasDefinitionSnapshot, getCanvasDefinitionInstanceId, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasService, isCanvasOwner, isOpenableExtensionCanvasDefinition } from '../../../canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../canvases/common/canvasDefinitionStore.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { extensionIcon, pluginIcon, userIcon, workspaceIcon } from './aiCustomizationIcons.js';
import { IAICustomizationManagementSectionWidget } from './aiCustomizationManagementSectionRegistry.js';
import { setVirtualizedRowActionsTabbable } from './customizationCardList.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeAriaLabel, getCustomizationTreeContentHeight, ICustomizationTreeGroup } from './customizationTree.js';
import { CustomizationToggle } from './customizationToggle.js';
import { ICopilotExtensionsService } from './copilotExtensionsService.js';
import { createInstalledPluginItem } from './mcpListWidget.js';

const $ = DOM.$;
const COPILOT_CANVAS_ITEM_HEIGHT = 48;
const COPILOT_CANVAS_TEMPLATE_ID = 'copilotCanvasItem';

type CopilotCanvasGroupKey = 'user' | 'workspace' | 'session' | 'plugin' | 'other';

interface ICopilotCanvasItem {
	readonly context: ICanvasContext;
	readonly canvas: ICanvasDefinition;
	readonly extension: IAgentExtensionInfo | undefined;
	readonly inventoryMode: AgentExtensionMode;
}

interface ICopilotCanvasGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly groupKey: CopilotCanvasGroupKey;
	readonly transient: boolean;
}

interface ICopilotCanvasItemEntry {
	readonly type: 'item';
	readonly item: ICopilotCanvasItem;
}

type CopilotCanvasTreeEntry = ICopilotCanvasGroupEntry | ICopilotCanvasItemEntry;

interface ICopilotCanvasTreeGroup extends ICustomizationTreeGroup<CopilotCanvasTreeEntry> {
	readonly id: CopilotCanvasGroupKey;
	readonly element: ICopilotCanvasGroupEntry;
	readonly children: readonly ICopilotCanvasItemEntry[];
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

class CopilotCanvasTreeDelegate implements IListVirtualDelegate<CopilotCanvasTreeEntry> {
	getHeight(entry: CopilotCanvasTreeEntry): number {
		if (entry.type === 'group-header') {
			return entry.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		return COPILOT_CANVAS_ITEM_HEIGHT;
	}

	getTemplateId(entry: CopilotCanvasTreeEntry): string {
		return entry.type === 'group-header' ? 'copilotCanvasGroupHeader' : COPILOT_CANVAS_TEMPLATE_ID;
	}
}

interface ICopilotCanvasTemplateData {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly detail: HTMLElement;
	readonly actions: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly moreButton: Button;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentItemKey: string | undefined;
}

class CopilotCanvasRenderer implements IListRenderer<ICopilotCanvasItemEntry, ICopilotCanvasTemplateData> {
	readonly templateId = COPILOT_CANVAS_TEMPLATE_ID;
	private readonly templates = new Set<ICopilotCanvasTemplateData>();
	private focusedItemKey: string | undefined;

	constructor(
		private readonly getItemKey: (item: ICopilotCanvasItem) => string,
		private readonly getDetail: (item: ICopilotCanvasItem) => string,
		private readonly isEnabled: (item: ICopilotCanvasItem) => boolean,
		private readonly canToggle: (item: ICopilotCanvasItem) => boolean,
		private readonly getToggleUnavailableMessage: (item: ICopilotCanvasItem) => string,
		private readonly isMutationPending: (item: ICopilotCanvasItem) => boolean,
		private readonly hasMenuActions: (item: ICopilotCanvasItem) => boolean,
		private readonly onToggle: (item: ICopilotCanvasItem, enabled: boolean) => void,
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
		const toggle = templateDisposables.add(new CustomizationToggle({ ariaLabel: '' }));
		actions.appendChild(toggle.domNode);
		toggle.domNode.dataset.customizationAction = 'toggle';
		const moreButton = templateDisposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
		}));
		moreButton.icon = Codicon.ellipsis;
		moreButton.element.classList.add('copilot-canvas-more-button');
		moreButton.element.dataset.customizationAction = 'more';
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.CLICK, event => event.stopPropagation()));
		const template = { container, label, detail, actions, toggle, moreButton, templateDisposables, elementDisposables, currentItemKey: undefined };
		this.templates.add(template);
		return template;
	}

	renderElement(entry: ICopilotCanvasItemEntry, _index: number, templateData: ICopilotCanvasTemplateData): void {
		templateData.elementDisposables.clear();
		const item = entry.item;
		const itemKey = this.getItemKey(item);
		const enabled = this.isEnabled(item);
		const canToggle = this.canToggle(item);
		const mutationPending = this.isMutationPending(item);
		templateData.currentItemKey = itemKey;
		templateData.container.dataset.customizationKey = itemKey;
		templateData.container.classList.toggle('disabled', !enabled);
		templateData.container.classList.toggle('readonly', !enabled || !isOpenableExtensionCanvasDefinition(item.canvas));
		templateData.label.textContent = item.canvas.displayName;
		const detail = this.getDetail(item);
		templateData.detail.textContent = detail;
		templateData.toggle.checked = enabled;
		templateData.toggle.disabled = !canToggle || mutationPending;
		const toggleLabel = enabled
			? localize('copilotCanvases.disableLabel', "Disable canvas {0}", item.canvas.displayName)
			: localize('copilotCanvases.enableLabel', "Enable canvas {0}", item.canvas.displayName);
		templateData.toggle.setAriaLabel(toggleLabel, canToggle ? toggleLabel : this.getToggleUnavailableMessage(item));
		templateData.elementDisposables.add(templateData.toggle.onChange(value => this.onToggle(item, value)));
		const showMenu = this.hasMenuActions(item);
		templateData.moreButton.element.style.display = showMenu ? '' : 'none';
		const moreLabel = localize('copilotCanvases.moreActions', "More Actions for {0}", item.canvas.displayName);
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
	private readonly _onDidRequestShowPlugin = this._register(new Emitter<IAgentPluginItem>());
	readonly onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;

	private readonly searchInput: InputBox;
	private readonly refreshButton: Button;
	private readonly treeContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<CopilotCanvasTreeEntry>;
	private readonly canvasRenderer: CopilotCanvasRenderer;
	private readonly emptyContainer: HTMLElement;
	private readonly emptyText: HTMLElement;
	private readonly emptySubtext: HTMLElement;
	private readonly canvasRefreshGeneration = observableValue(this, 0);
	private readonly canvasVisibilityChanged = observableSignal(this);
	private readonly activeCanvasOwnerKeys = new Set<string>();
	private readonly loadingCanvasOwnerKeys = new Set<string>();
	private readonly canvasErrors = new Map<string, string>();
	private readonly canvasStoreLifetimes = new Map<string, ICanvasStoreLifetime>();
	private readonly extensionInventories = new Map<string, IAgentExtensionInventory>();
	private readonly retainedCanvases = new Map<string, ICopilotCanvasItem>();
	private readonly pendingExtensionMutations = new Set<string>();
	private readonly collapsedGroups = new Set<CopilotCanvasGroupKey>();
	private canvasRefreshBatch: ICanvasRefreshBatch | undefined;

	private sessionResource: URI;
	private canvases: readonly ICopilotCanvasItem[] = [];
	private visible = false;
	private lastHeight = 0;
	private lastWidth = 0;
	private lastItemCount = -1;
	private updatingTree = false;

	constructor(
		container: HTMLElement,
		@ICopilotExtensionsService private readonly extensionsService: ICopilotExtensionsService,
		@ICanvasContextService private readonly canvasContextService: ICanvasContextService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IContextViewService contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHoverService hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.sessionResource = this.harnessService.activeSessionResource.get();
		this.element = DOM.append(container, $('.tools-list-widget.copilot-customizations-widget'));

		const header = DOM.append(this.element, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		DOM.append(titleRow, $('h2.section-title')).textContent = localize('copilotCanvases.title', "Canvases");
		const titleActions = DOM.append(titleRow, $('.section-title-actions'));
		const refreshLabel = localize('copilotCanvases.refresh', "Refresh");
		this.refreshButton = this._register(new Button(titleActions, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			title: refreshLabel,
			ariaLabel: localize('copilotCanvases.refreshLabel', "Refresh Registered Canvases"),
		}));
		this.refreshButton.label = refreshLabel;
		this._register(this.refreshButton.onDidClick(() => this.refreshCanvases()));
		DOM.append(header, $('p.section-title-description')).textContent = localize('copilotCanvases.description', "Interactive panels that Copilot can open beside a chat.");

		const searchRow = DOM.append(this.element, $('.tools-list-search-and-button-container'));
		const searchContainer = DOM.append(searchRow, $('.tools-list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: localize('copilotCanvases.search', "Type to search..."),
			ariaLabel: localize('copilotCanvases.searchAriaLabel', "Search Canvases"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(() => this.render()));

		this.treeContainer = DOM.append(this.element, $('.tools-list-tree.customization-tree-container.copilot-customizations-tree'));
		this.canvasRenderer = new CopilotCanvasRenderer(
			item => this.getItemKey(item),
			item => this.getCanvasDetail(item),
			item => this.isCanvasEnabled(item),
			item => this.canToggleCanvas(item),
			item => this.getToggleUnavailableMessage(item),
			item => this.pendingExtensionMutations.has(this.getExtensionScopeKey(item)),
			item => this.hasRowActions(item),
			(item, enabled) => void this.setCanvasEnabled(item, enabled),
			(item, anchor) => this.showRowMenu(item, anchor),
			hoverService,
		);
		const groupRenderer = new CustomizationGroupHeaderRenderer<ICopilotCanvasGroupEntry>(
			'copilotCanvasGroupHeader',
			hoverService,
		);
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<CopilotCanvasTreeEntry>,
			'CopilotCanvasesManagementTree',
			this.treeContainer,
			new CopilotCanvasTreeDelegate(),
			[
				asTreeRenderer(groupRenderer),
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
				openOnSingleClick: true,
				identityProvider: { getId: entry => this.getTreeEntryId(entry) },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('copilotCanvases.listLabel', "Available Canvases"),
					getAriaLabel: entry => this.getTreeEntryAriaLabel(entry),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.type === 'group-header' ? entry.label : entry.item.canvas.displayName,
				},
			},
		));
		this._register(this.tree.onDidOpen(event => {
			if (event.element?.type === 'item') {
				this.activateItem(event.element.item);
			}
		}));
		this._register(this.tree.onContextMenu(event => {
			if (event.element?.type === 'item') {
				this.showRowMenu(event.element.item, event.anchor);
			}
		}));
		this._register(this.tree.onDidChangeFocus(event => {
			const entry = event.elements[0];
			this.canvasRenderer.setFocusedItemKey(entry?.type === 'item' ? this.getItemKey(entry.item) : undefined);
		}));
		this._register(this.tree.onDidChangeCollapseState(event => {
			if (this.updatingTree) {
				return;
			}
			const entry = event.node.element;
			if (!entry || entry.type !== 'group-header' || entry.transient) {
				return;
			}
			entry.collapsed = event.node.collapsed;
			if (event.node.collapsed) {
				this.collapsedGroups.add(entry.groupKey);
			} else {
				this.collapsedGroups.delete(entry.groupKey);
			}
		}));
		this._register(DOM.addStandardDisposableListener(this.tree.getHTMLElement(), DOM.EventType.KEY_DOWN, event => {
			if (event.keyCode !== KeyCode.Space || event.target.closest('[data-customization-action]')) {
				return;
			}
			const entry = this.tree.getFocus()[0];
			if (entry?.type !== 'item' || !this.canToggleCanvas(entry.item)) {
				return;
			}
			void this.setCanvasEnabled(entry.item, !this.isCanvasEnabled(entry.item));
			event.preventDefault();
			event.stopPropagation();
		}));

		this.emptyContainer = DOM.append(this.element, $('.list-empty-state'));
		this.emptyText = DOM.append(this.emptyContainer, $('.empty-state-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-state-subtext'));
		this.emptyContainer.style.display = 'none';

		this._register(autorun(reader => {
			const sessionResource = this.harnessService.activeSessionResource.read(reader);
			if (!isEqual(sessionResource, this.sessionResource)) {
				this.sessionResource = sessionResource;
			}
		}));

		const visibleCanvasContexts = derived(this, reader => {
			this.canvasVisibilityChanged.read(reader);
			if (!this.visible || !this.canvasService.enabled.read(reader)) {
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
				const current = this.canvasContextService.contexts.read(reader)
					.find(candidate => isCanvasOwner(candidate.owner, owner));
				const definitionProvider = current?.definitionProvider;
				if (!current || !definitionProvider || !this.canvasContextService.isOwnerVisible(current.owner, reader)) {
					return undefined;
				}
				observableSignalFromEvent(reader.store, definitionProvider.onDidChangeDefinitions).read(reader);
				return {
					owner: current.owner,
					includeDefinition: () => true,
					listCanvases: () => this.listCanvasDefinitions(current, lifetime, refreshGeneration, () => definitionProvider.listCanvases()),
				};
			}, `[CopilotCanvasesWidget:${ownerKey}]`, this.logService)).definitions;
			return { owner, definitions };
		}, context => canvasOwnerKey(context.owner));
		const liveCanvasItems = derived(this, reader => canvasStores.read(reader).flatMap(entry => {
			const context = this.canvasContextService.contexts.read(reader)
				.find(candidate => isCanvasOwner(candidate.owner, entry.owner));
			if (!context) {
				return [];
			}
			const inventory = this.extensionInventories.get(canvasOwnerKey(entry.owner));
			return entry.definitions.read(reader).map(canvas => ({
				context,
				canvas,
				extension: inventory?.extensions.find(extension => extension.id === canvas.extensionId),
				inventoryMode: inventory?.mode ?? 'unknown',
			}));
		}));
		this._register(autorun(reader => {
			const activeOwnerKeys = new Set(visibleCanvasContexts.read(reader).map(context => canvasOwnerKey(context.owner)));
			this.updateActiveOwners(activeOwnerKeys);
			this.updateRetainedCanvases(activeOwnerKeys, liveCanvasItems.read(reader));
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
		const groups = this.getTreeGroups();
		const description = localize('copilotCanvases.availableDescription', "Canvas availability follows the chats currently visible in this window.");
		if (groups.length === 0) {
			return [localize('copilotCanvases.title', "Canvases"), description, this.emptyText.textContent, this.emptySubtext.textContent].filter(Boolean).join('\n\n');
		}
		return [
			localize('copilotCanvases.title', "Canvases"),
			description,
			...groups.flatMap(group => [
				group.label,
				...group.children.map(entry => localize(
					'copilotCanvases.accessibleItem',
					"{0}. {1}. {2}. {3}",
					entry.item.canvas.displayName,
					entry.item.canvas.description,
					this.getCanvasSource(entry.item),
					this.getCanvasStateLabel(entry.item),
				)),
			]),
		].join('\n\n');
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.canvasVisibilityChanged.trigger(undefined);
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

	private updateRetainedCanvases(activeOwnerKeys: Set<string>, liveItems: readonly ICopilotCanvasItem[]): void {
		const liveKeys = new Set<string>();
		for (const item of liveItems) {
			const key = this.getItemKey(item);
			liveKeys.add(key);
			this.retainedCanvases.set(key, item);
		}
		for (const [key, item] of this.retainedCanvases) {
			const ownerKey = canvasOwnerKey(item.context.owner);
			if (!activeOwnerKeys.has(ownerKey)) {
				this.retainedCanvases.delete(key);
				continue;
			}
			if (liveKeys.has(key)) {
				continue;
			}
			const inventory = this.extensionInventories.get(ownerKey);
			const extension = inventory?.extensions.find(candidate => candidate.id === item.canvas.extensionId);
			if (!extension || extension.status === 'running') {
				this.retainedCanvases.delete(key);
				continue;
			}
			this.retainedCanvases.set(key, {
				...item,
				extension,
				inventoryMode: inventory?.mode ?? 'unknown',
			});
		}
		this.canvases = [...this.retainedCanvases.values()];
		if (this.lastItemCount !== this.canvases.length) {
			this.lastItemCount = this.canvases.length;
			this._onDidChangeItemCount.fire(this.lastItemCount);
		}
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
		const focusedAction = this.captureFocusedAction();
		const groups = this.getTreeGroups();
		const query = this.searchInput.value.trim();
		const loading = this.loadingCanvasOwnerKeys.size > 0 || this.pendingExtensionMutations.size > 0;
		const showEmpty = groups.length === 0;
		this.emptyContainer.style.display = showEmpty ? 'flex' : 'none';
		this.treeContainer.style.display = showEmpty ? 'none' : '';
		this.refreshButton.enabled = !loading;
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
					collapsed: query
						? ObjectTreeElementCollapseState.Expanded
						: this.collapsedGroups.has(group.element.groupKey)
							? ObjectTreeElementCollapseState.PreserveOrCollapsed
							: ObjectTreeElementCollapseState.PreserveOrExpanded,
					children: group.children.map(element => ({ element })),
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
		if (this.loadingCanvasOwnerKeys.size > 0 && this.canvases.length === 0) {
			this.emptyText.textContent = localize('copilotCanvases.loading', "Loading Canvases...");
			this.emptySubtext.textContent = '';
			return;
		}
		const errorMessage = this.canvases.length === 0 ? this.canvasErrors.values().next().value : undefined;
		if (errorMessage) {
			this.emptyText.textContent = localize('copilotCanvases.unavailable', "Canvases Unavailable");
			this.emptySubtext.textContent = errorMessage;
			return;
		}
		if (this.searchInput.value.trim()) {
			this.emptyText.textContent = localize('copilotCanvases.noMatches', "No Matching Canvases");
			this.emptySubtext.textContent = localize('copilotCanvases.noMatchesDescription', "Try a different search.");
			return;
		}
		this.emptyText.textContent = localize('copilotCanvases.empty', "No Canvases Found");
		this.emptySubtext.textContent = localize('copilotCanvases.emptyDescription', "Open or resume a Copilot chat with Canvas support in this window.");
	}

	private async setCanvasEnabled(item: ICopilotCanvasItem, enabled: boolean): Promise<void> {
		if (!item.extension || !this.canToggleCanvas(item)) {
			this.render();
			return;
		}
		if (!enabled && !await this.confirmDisable(item)) {
			this.render();
			return;
		}
		const sessionResource = this.canvasContextService.getFrontendSessionResource(item.context.owner);
		if (!sessionResource) {
			this.notificationService.error(localize('copilotCanvases.targetUnavailable', "The chat that owns {0} is no longer available.", item.canvas.displayName));
			return;
		}
		const mutationKey = this.getExtensionScopeKey(item);
		const focusedAction = this.captureFocusedAction();
		this.pendingExtensionMutations.add(mutationKey);
		this.render();
		try {
			await this.extensionsService.setExtensionEnabled(sessionResource, item.canvas.extensionId, enabled);
			this.updateExtensionState(item, enabled);
			status(enabled
				? localize('copilotCanvases.enabledAnnouncement', "Enabled canvas {0}.", item.canvas.displayName)
				: localize('copilotCanvases.disabledAnnouncement', "Disabled canvas {0}.", item.canvas.displayName));
			this.refreshCanvases();
		} catch (error) {
			this.notificationService.error(enabled
				? localize('copilotCanvases.enableFailed', "Could not enable canvas {0}. {1}", item.canvas.displayName, getErrorMessage(error))
				: localize('copilotCanvases.disableFailed', "Could not disable canvas {0}. {1}", item.canvas.displayName, getErrorMessage(error)));
		} finally {
			this.pendingExtensionMutations.delete(mutationKey);
			this.render();
			this.restoreFocusedAction(focusedAction);
		}
	}

	private updateExtensionState(item: ICopilotCanvasItem, enabled: boolean): void {
		const ownerKey = canvasOwnerKey(item.context.owner);
		const global = item.canvas.extensionSource === 'user' || item.canvas.extensionSource === 'plugin';
		for (const [candidateOwnerKey, inventory] of this.extensionInventories) {
			if (!global && candidateOwnerKey !== ownerKey) {
				continue;
			}
			const extensionIndex = inventory.extensions.findIndex(extension => extension.id === item.canvas.extensionId);
			if (extensionIndex === -1) {
				continue;
			}
			const extensions = [...inventory.extensions];
			extensions[extensionIndex] = {
				...extensions[extensionIndex],
				status: enabled ? 'starting' : 'disabled',
				enabled,
			};
			this.extensionInventories.set(candidateOwnerKey, { ...inventory, extensions });
		}
		for (const [key, candidate] of this.retainedCanvases) {
			if (candidate.canvas.extensionId !== item.canvas.extensionId || !global && canvasOwnerKey(candidate.context.owner) !== ownerKey) {
				continue;
			}
			this.retainedCanvases.set(key, {
				...candidate,
				extension: candidate.extension ? {
					...candidate.extension,
					status: enabled ? 'starting' : 'disabled',
					enabled,
				} : undefined,
			});
		}
	}

	private async confirmDisable(item: ICopilotCanvasItem): Promise<boolean> {
		const siblingNames = new Set(this.canvases
			.filter(candidate => this.getExtensionScopeKey(candidate) === this.getExtensionScopeKey(item)
				&& this.getItemKey(candidate) !== this.getItemKey(item))
			.map(candidate => candidate.canvas.displayName));
		if (siblingNames.size === 0) {
			return true;
		}
		const names = [...siblingNames];
		const extensionName = item.extension?.name ?? item.canvas.extensionName ?? item.canvas.extensionId;
		const detail = names.length === 1
			? localize('copilotCanvases.disableDetailOneSibling', "This also disables {0}, because both canvases come from the Copilot extension '{1}'.", names[0], extensionName)
			: localize('copilotCanvases.disableDetailSiblings', "This also disables {0} other canvases from the Copilot extension '{1}': {2}.", names.length, extensionName, names.join(', '));
		const result = await this.dialogService.confirm({
			type: 'warning',
			message: localize('copilotCanvases.disableTitle', "Disable '{0}'?", item.canvas.displayName),
			detail,
			primaryButton: localize({ key: 'copilotCanvases.disableButton', comment: ['&& denotes a mnemonic'] }, "&&Disable"),
		});
		return result.confirmed;
	}

	private showRowMenu(item: ICopilotCanvasItem, anchor: ReturnType<IContextMenuDelegate['getAnchor']>): void {
		const disposables = new DisposableStore();
		const actions = this.getRowActions(item, disposables);
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

	private hasRowActions(item: ICopilotCanvasItem): boolean {
		return this.isCanvasEnabled(item) && isOpenableExtensionCanvasDefinition(item.canvas)
			|| item.canvas.extensionSource === 'plugin'
			|| !!item.extension?.resource
			|| this.canToggleCanvas(item);
	}

	private getRowActions(item: ICopilotCanvasItem, disposables: DisposableStore): IAction[] {
		const action = (id: string, label: string, run: () => unknown): IAction => {
			const result = new Action(id, label, undefined, true, async () => { await run(); });
			return disposables.add(result);
		};
		const groups: IAction[][] = [[], [], []];
		if (this.isCanvasEnabled(item) && isOpenableExtensionCanvasDefinition(item.canvas)) {
			groups[0].push(action('canvas.show', localize('copilotCanvases.showCanvas', "Show Canvas"), () => this.openCanvas(item)));
		}
		if (item.canvas.extensionSource === 'plugin') {
			groups[1].push(action('canvas.showPlugin', localize('copilotCanvases.showPlugin', "Show Plugin"), () => this.openCanvasProvider(item)));
		} else if (item.extension?.resource) {
			groups[1].push(action('canvas.openExtensionFile', localize('copilotCanvases.openExtensionFile', "Open Extension File"), () => this.editorService.openEditor({ resource: item.extension!.resource!, options: { pinned: true } })));
			if (item.extension.resource.scheme === Schemas.file) {
				const revealLabel = isWindows
					? localize('copilotCanvases.revealWindows', "Reveal in File Explorer")
					: isMacintosh
						? localize('copilotCanvases.revealMac', "Reveal in Finder")
						: localize('copilotCanvases.revealLinux', "Open Containing Folder");
				groups[1].push(action('canvas.revealExtensionFile', revealLabel, () => this.commandService.executeCommand('revealFileInOS', item.extension!.resource)));
			}
		}
		if (this.canToggleCanvas(item)) {
			groups[2].push(this.isCanvasEnabled(item)
				? action('canvas.disable', localize('copilotCanvases.disable', "Disable"), () => this.setCanvasEnabled(item, false))
				: action('canvas.enable', localize('copilotCanvases.enable', "Enable"), () => this.setCanvasEnabled(item, true)));
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

	private async openCanvas(item: ICopilotCanvasItem): Promise<void> {
		if (!this.canvasService.enabled.get() || !this.isCanvasEnabled(item)) {
			return;
		}
		try {
			const instanceId = getCanvasDefinitionInstanceId(item.canvas);
			const existing = item.context.canvases.get()?.find(candidate => candidate.instanceId === instanceId);
			if (existing) {
				await this.canvasService.revealCanvas({ ...item.context.owner, canvas: existing.resource });
				if (existing.source) {
					return;
				}
			}
			await item.context.definitionProvider!.openCanvas(item.canvas, instanceId);
		} catch (error) {
			this.notificationService.error(localize('copilotCanvases.openFailed', "Unable to open canvas {0}. {1}", item.canvas.displayName, getErrorMessage(error)));
		}
	}

	private activateItem(item: ICopilotCanvasItem): void {
		if (!this.isCanvasEnabled(item)) {
			return;
		}
		if (isOpenableExtensionCanvasDefinition(item.canvas)) {
			void this.openCanvas(item);
		} else {
			this.openCanvasProvider(item);
		}
	}

	private openCanvasProvider(item: ICopilotCanvasItem): void {
		if (item.canvas.extensionSource === 'plugin') {
			const pluginName = item.extension?.pluginName ?? item.canvas.extensionName;
			const plugin = this.agentPluginService.plugins.get().find(candidate => candidate.label === pluginName);
			if (plugin) {
				this._onDidRequestShowPlugin.fire(createInstalledPluginItem(plugin));
				return;
			}
			void this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
				section: AICustomizationManagementSection.Plugins,
				sessionResource: this.canvasContextService.getFrontendSessionResource(item.context.owner) ?? this.sessionResource,
			});
		}
	}

	private getTreeGroups(): readonly ICopilotCanvasTreeGroup[] {
		const query = this.searchInput.value.trim();
		const items = this.getFilteredItems();
		const grouped = new Map<CopilotCanvasGroupKey, ICopilotCanvasItemEntry[]>();
		for (const item of items) {
			const key = this.getItemGroupKey(item);
			const group = grouped.get(key) ?? [];
			group.push({ type: 'item', item });
			grouped.set(key, group);
		}
		const definitions = this.getGroupDefinitions();
		const groups: ICopilotCanvasTreeGroup[] = [];
		for (const definition of definitions) {
			const children = grouped.get(definition.key) ?? [];
			if (children.length === 0 && (query || !definition.alwaysShow || items.length === 0)) {
				continue;
			}
			const collapsed = !query && this.collapsedGroups.has(definition.key);
			const element: ICopilotCanvasGroupEntry = {
				type: 'group-header',
				id: `copilot-canvas-group:${query ? 'search:' : ''}${definition.key}`,
				groupKey: definition.key,
				transient: !!query,
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
			{ key: 'user', label: localize('copilotCanvases.userGroup', "User"), description: localize('copilotCanvases.userGroupDescription', "Canvases available in every workspace."), icon: userIcon, alwaysShow: true },
			{ key: 'workspace', label: localize('copilotCanvases.workspaceGroup', "Workspace"), description: localize('copilotCanvases.workspaceGroupDescription', "Canvases provided by this workspace."), icon: workspaceIcon, alwaysShow: true },
			{ key: 'session', label: localize('copilotCanvases.sessionGroup', "Session"), description: localize('copilotCanvases.sessionGroupDescription', "Canvases provided only for the current session."), icon: extensionIcon, alwaysShow: false },
			{ key: 'plugin', label: localize('copilotCanvases.pluginGroup', "Plugins"), description: localize('copilotCanvases.pluginGroupDescription', "Canvases provided by installed plugins."), icon: pluginIcon, alwaysShow: false },
			{ key: 'other', label: localize('copilotCanvases.otherGroup', "Other"), description: localize('copilotCanvases.otherGroupDescription', "Canvases provided by another runtime source."), icon: extensionIcon, alwaysShow: false },
		];
	}

	private getItemGroupKey(item: ICopilotCanvasItem): CopilotCanvasGroupKey {
		switch (item.canvas.extensionSource) {
			case 'user': return 'user';
			case 'project': return 'workspace';
			case 'session': return 'session';
			case 'plugin': return 'plugin';
			default: return 'other';
		}
	}

	private getTreeEntryId(entry: CopilotCanvasTreeEntry): string {
		return entry.type === 'group-header' ? entry.id : this.getItemKey(entry.item);
	}

	private getTreeEntryAriaLabel(entry: CopilotCanvasTreeEntry): string {
		if (entry.type === 'group-header') {
			return getCustomizationTreeAriaLabel(entry.label, entry.count, entry.collapsed);
		}
		return localize(
			'copilotCanvases.rowAriaLabel',
			"{0}. {1}. {2}.",
			entry.item.canvas.displayName,
			this.getCanvasStateLabel(entry.item),
			this.getCanvasSource(entry.item),
		);
	}

	private getItemKey(item: ICopilotCanvasItem): string {
		return `canvas:${canvasOwnerKey(item.context.owner)}\u0000${item.canvas.extensionId}\u0000${item.canvas.canvasId}`;
	}

	private getExtensionScopeKey(item: ICopilotCanvasItem): string {
		return item.canvas.extensionSource === 'user' || item.canvas.extensionSource === 'plugin'
			? item.canvas.extensionId
			: `${canvasOwnerKey(item.context.owner)}\u0000${item.canvas.extensionId}`;
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
		this.canvasRenderer.focusAction(focusedAction.itemKey, focusedAction.actionId);
	}

	private getFilteredItems(): readonly ICopilotCanvasItem[] {
		const query = this.searchInput.value.trim().toLowerCase();
		return this.canvases
			.filter(item => {
				if (!query) {
					return true;
				}
				return [
					item.canvas.displayName,
					item.canvas.description,
					item.canvas.canvasId,
					item.canvas.extensionId,
					item.canvas.extensionName,
					item.extension?.name,
					item.extension?.pluginName,
					this.getCanvasSource(item),
				].some(value => value?.toLowerCase().includes(query));
			})
			.sort((left, right) => left.canvas.displayName.localeCompare(right.canvas.displayName));
	}

	private isCanvasEnabled(item: ICopilotCanvasItem): boolean {
		return item.extension ? item.extension.status !== 'disabled' : true;
	}

	private canToggleCanvas(item: ICopilotCanvasItem): boolean {
		return !!item.extension
			&& item.inventoryMode === 'load_and_augment'
			&& item.extension.status !== 'starting'
			&& !this.pendingExtensionMutations.has(this.getExtensionScopeKey(item));
	}

	private getToggleUnavailableMessage(item: ICopilotCanvasItem): string {
		if (!item.extension) {
			return localize('copilotCanvases.extensionStateUnavailable', "Extension state is unavailable for this Canvas.");
		}
		if (item.inventoryMode === 'load_only') {
			return localize('copilotCanvases.loadOnlyActionUnavailable', "This runtime loads extensions but does not allow changing their enablement.");
		}
		if (item.inventoryMode === 'disabled') {
			return localize('copilotCanvases.disabledActionUnavailable', "Extension management is disabled by the runtime.");
		}
		if (item.extension.status === 'starting') {
			return localize('copilotCanvases.startingActionUnavailable', "This Canvas is still starting.");
		}
		return localize('copilotCanvases.managementUnavailable', "Canvas enablement is unavailable.");
	}

	private getCanvasStateLabel(item: ICopilotCanvasItem): string {
		switch (item.extension?.status) {
			case 'disabled': return localize('copilotCanvases.disabledStatus', "Disabled");
			case 'failed': return localize('copilotCanvases.failedStatus', "Failed");
			case 'starting': return localize('copilotCanvases.startingStatus', "Starting");
			default: return item.canvas.requiresInput
				? localize('copilotCanvases.requiresInput', "Requires Input")
				: localize('copilotCanvases.readyToOpen', "Ready to Open");
		}
	}

	private getCanvasDetail(item: ICopilotCanvasItem): string {
		const extension = item.extension;
		if (item.canvas.extensionSource === 'plugin') {
			return localize('copilotCanvases.pluginSource', "Plugin: {0}", extension?.pluginName ?? item.canvas.extensionName ?? extension?.name ?? item.canvas.extensionId);
		}
		if (extension?.resource) {
			return this.labelService.getUriLabel(dirname(extension.resource), { relative: true });
		}
		return this.getCanvasSource(item);
	}

	private getCanvasSource(item: ICopilotCanvasItem): string {
		const provider = item.canvas.extensionName ?? item.extension?.name ?? item.canvas.extensionId;
		switch (item.canvas.extensionSource) {
			case 'plugin': return localize('copilotCanvases.pluginSource', "Plugin: {0}", item.extension?.pluginName ?? provider);
			case 'project': return localize('copilotCanvases.workspaceSource', "Workspace Extension: {0}", provider);
			case 'user': return localize('copilotCanvases.userSource', "User Extension: {0}", provider);
			case 'session': return localize('copilotCanvases.sessionSource', "Session Extension: {0}", provider);
			default: return localize('copilotCanvases.providerSource', "Provider: {0}", provider);
		}
	}
}
