/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, mapObservableArrayCached, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { IAgentExtensionInfo, IAgentExtensionInventory } from '../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { canvasOwnerKey, getCanvasDefinitionInstanceId, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasService, isCanvasOwner, isOpenableExtensionCanvasDefinition } from '../../../canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../canvases/common/canvasDefinitionStore.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { extensionIcon, pluginIcon, userIcon, workspaceIcon } from './aiCustomizationIcons.js';
import { IAICustomizationManagementSectionWidget } from './aiCustomizationManagementSectionRegistry.js';
import { setVirtualizedRowActionsTabbable } from './customizationCardList.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeAriaLabel, getCustomizationTreeContentHeight, ICustomizationTreeGroup } from './customizationTree.js';
import { CustomizationToggle } from './customizationToggle.js';
import { ICopilotExtensionsService } from './copilotExtensionsService.js';

const $ = DOM.$;
const COPILOT_CUSTOMIZATION_ITEM_HEIGHT = 48;
const COPILOT_EXTENSION_TEMPLATE_ID = 'copilotExtensionItem';
const COPILOT_CANVAS_TEMPLATE_ID = 'copilotCanvasItem';

export type CopilotCustomizationsWidgetKind = 'extensions' | 'canvases';

interface ICopilotCanvasItem {
	readonly context: ICanvasContext;
	readonly canvas: ICanvasDefinition;
}

type CopilotCustomizationItem =
	| { readonly kind: 'extension'; readonly extension: IAgentExtensionInfo }
	| { readonly kind: 'canvas'; readonly item: ICopilotCanvasItem };

type CopilotCustomizationGroupKey = 'user' | 'project' | 'session' | 'plugin' | 'other';

interface ICopilotCustomizationGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly groupKey: CopilotCustomizationGroupKey;
	readonly transient: boolean;
}

interface ICopilotCustomizationItemEntry {
	readonly type: 'item';
	readonly item: CopilotCustomizationItem;
}

type CopilotCustomizationTreeEntry = ICopilotCustomizationGroupEntry | ICopilotCustomizationItemEntry;

interface ICopilotCustomizationTreeGroup extends ICustomizationTreeGroup<CopilotCustomizationTreeEntry> {
	readonly id: CopilotCustomizationGroupKey;
	readonly element: ICopilotCustomizationGroupEntry;
	readonly children: readonly ICopilotCustomizationItemEntry[];
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

interface IFocusedCustomizationAction {
	readonly itemKey: string;
	readonly actionId: string;
}

class CopilotCustomizationTreeDelegate implements IListVirtualDelegate<CopilotCustomizationTreeEntry> {
	getHeight(entry: CopilotCustomizationTreeEntry): number {
		if (entry.type === 'group-header') {
			return entry.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		return COPILOT_CUSTOMIZATION_ITEM_HEIGHT;
	}

	getTemplateId(entry: CopilotCustomizationTreeEntry): string {
		if (entry.type === 'group-header') {
			return 'copilotCustomizationGroupHeader';
		}
		return entry.item.kind === 'extension' ? COPILOT_EXTENSION_TEMPLATE_ID : COPILOT_CANVAS_TEMPLATE_ID;
	}
}

interface ICopilotExtensionTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly detail: HTMLElement;
	readonly actions: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentItemKey: string | undefined;
}

class CopilotExtensionRenderer implements IListRenderer<ICopilotCustomizationItemEntry, ICopilotExtensionTemplateData> {
	readonly templateId = COPILOT_EXTENSION_TEMPLATE_ID;
	private readonly templates = new Set<ICopilotExtensionTemplateData>();
	private focusedItemKey: string | undefined;

	constructor(
		private readonly getItemKey: (item: CopilotCustomizationItem) => string,
		private readonly getSource: (extension: IAgentExtensionInfo) => string,
		private readonly canToggle: () => boolean,
		private readonly getToggleUnavailableMessage: () => string,
		private readonly onToggle: (extension: IAgentExtensionInfo, enabled: boolean) => void,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ICopilotExtensionTemplateData {
		const templateDisposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('copilot-customization-tree-item');
		const icon = DOM.append(container, $('.copilot-customization-tree-icon'));
		const text = DOM.append(container, $('.copilot-customization-tree-text'));
		const label = DOM.append(text, $('.copilot-customization-tree-label'));
		const detail = DOM.append(text, $('.copilot-customization-tree-detail'));
		const actions = DOM.append(container, $('.copilot-customization-tree-actions'));
		const toggle = templateDisposables.add(new CustomizationToggle({ ariaLabel: '' }));
		actions.appendChild(toggle.domNode);
		toggle.domNode.dataset.customizationAction = 'toggle';
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.CLICK, event => event.stopPropagation()));
		const template = { container, icon, label, detail, actions, toggle, templateDisposables, elementDisposables, currentItemKey: undefined };
		this.templates.add(template);
		return template;
	}

	renderElement(entry: ICopilotCustomizationItemEntry, _index: number, templateData: ICopilotExtensionTemplateData): void {
		if (entry.item.kind !== 'extension') {
			return;
		}
		templateData.elementDisposables.clear();
		const extension = entry.item.extension;
		const itemKey = this.getItemKey(entry.item);
		templateData.currentItemKey = itemKey;
		templateData.container.dataset.customizationKey = itemKey;
		templateData.container.classList.toggle('disabled', !extension.enabled);
		templateData.icon.className = 'copilot-customization-tree-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.extensions));
		templateData.label.textContent = extension.name;
		const source = this.getSource(extension);
		templateData.detail.textContent = source;
		const toggleEnabled = this.canToggle();
		const ariaLabel = extension.enabled
			? localize('copilotExtensions.disableLabel', "Disable extension {0}", extension.name)
			: localize('copilotExtensions.enableLabel', "Enable extension {0}", extension.name);
		templateData.toggle.checked = extension.enabled;
		templateData.toggle.disabled = !toggleEnabled;
		templateData.toggle.setAriaLabel(ariaLabel, toggleEnabled ? ariaLabel : this.getToggleUnavailableMessage());
		templateData.elementDisposables.add(templateData.toggle.onChange(enabled => this.onToggle(extension, enabled)));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.label, { content: extension.name }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.detail, { content: source }));
		this.updateActionsTabbability(templateData);
	}

	setFocusedItemKey(itemKey: string | undefined): void {
		this.focusedItemKey = itemKey;
		for (const template of this.templates) {
			this.updateActionsTabbability(template);
		}
	}

	focusAction(itemKey: string, actionId: string): boolean {
		if (actionId !== 'toggle') {
			return false;
		}
		for (const template of this.templates) {
			if (template.currentItemKey === itemKey) {
				template.toggle.focus();
				return true;
			}
		}
		return false;
	}

	private updateActionsTabbability(templateData: ICopilotExtensionTemplateData): void {
		setVirtualizedRowActionsTabbable(templateData.actions, templateData.currentItemKey === this.focusedItemKey);
	}

	disposeTemplate(templateData: ICopilotExtensionTemplateData): void {
		this.templates.delete(templateData);
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

interface ICopilotCanvasTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly detail: HTMLElement;
	readonly actions: HTMLElement;
	readonly manageButton: Button;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentItemKey: string | undefined;
}

class CopilotCanvasRenderer implements IListRenderer<ICopilotCustomizationItemEntry, ICopilotCanvasTemplateData> {
	readonly templateId = COPILOT_CANVAS_TEMPLATE_ID;
	private readonly templates = new Set<ICopilotCanvasTemplateData>();
	private focusedItemKey: string | undefined;

	constructor(
		private readonly getItemKey: (item: CopilotCustomizationItem) => string,
		private readonly getDetail: (item: ICopilotCanvasItem) => string,
		private readonly canManage: (item: ICopilotCanvasItem) => boolean,
		private readonly onManage: (item: ICopilotCanvasItem) => void,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ICopilotCanvasTemplateData {
		const templateDisposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('copilot-customization-tree-item');
		const icon = DOM.append(container, $('.copilot-customization-tree-icon'));
		const text = DOM.append(container, $('.copilot-customization-tree-text'));
		const label = DOM.append(text, $('.copilot-customization-tree-label'));
		const detail = DOM.append(text, $('.copilot-customization-tree-detail'));
		const actions = DOM.append(container, $('.copilot-customization-tree-actions'));
		const manageButton = templateDisposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
		}));
		manageButton.label = localize('copilotCanvases.manage', "Manage Provider");
		manageButton.element.classList.add('copilot-customization-manage-button');
		manageButton.element.dataset.customizationAction = 'manage';
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.CLICK, event => event.stopPropagation()));
		const template = { container, icon, label, detail, actions, manageButton, templateDisposables, elementDisposables, currentItemKey: undefined };
		this.templates.add(template);
		return template;
	}

	renderElement(entry: ICopilotCustomizationItemEntry, _index: number, templateData: ICopilotCanvasTemplateData): void {
		if (entry.item.kind !== 'canvas') {
			return;
		}
		templateData.elementDisposables.clear();
		const item = entry.item.item;
		const itemKey = this.getItemKey(entry.item);
		templateData.currentItemKey = itemKey;
		templateData.container.dataset.customizationKey = itemKey;
		templateData.container.classList.toggle('readonly', !isOpenableExtensionCanvasDefinition(item.canvas) && !this.canManage(item));
		templateData.icon.className = 'copilot-customization-tree-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.preview));
		templateData.label.textContent = item.canvas.displayName;
		const detail = this.getDetail(item);
		templateData.detail.textContent = detail;
		const manageable = this.canManage(item);
		templateData.actions.style.display = manageable ? '' : 'none';
		templateData.manageButton.setAriaLabel(localize('copilotCanvases.manageLabel', "Manage the provider for canvas {0}", item.canvas.displayName));
		if (manageable) {
			templateData.elementDisposables.add(templateData.manageButton.onDidClick(() => this.onManage(item)));
		}
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.label, { content: item.canvas.displayName }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.detail, { content: detail }));
		this.updateActionsTabbability(templateData);
	}

	setFocusedItemKey(itemKey: string | undefined): void {
		this.focusedItemKey = itemKey;
		for (const template of this.templates) {
			this.updateActionsTabbability(template);
		}
	}

	focusAction(itemKey: string, actionId: string): boolean {
		if (actionId !== 'manage') {
			return false;
		}
		for (const template of this.templates) {
			if (template.currentItemKey === itemKey) {
				template.manageButton.element.focus();
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

class CopilotCustomizationsWidget extends Disposable implements IAICustomizationManagementSectionWidget {
	readonly element: HTMLElement;

	private readonly searchInput: InputBox;
	private readonly refreshButton: Button;
	private readonly treeContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<CopilotCustomizationTreeEntry>;
	private readonly extensionRenderer: CopilotExtensionRenderer;
	private readonly canvasRenderer: CopilotCanvasRenderer;
	private readonly emptyContainer: HTMLElement;
	private readonly emptyText: HTMLElement;
	private readonly emptySubtext: HTMLElement;
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly canvasRefreshGeneration = observableValue(this, 0);
	private readonly canvasVisibilityChanged = observableSignal(this);
	private readonly activeCanvasOwnerKeys = new Set<string>();
	private readonly loadingCanvasOwnerKeys = new Set<string>();
	private readonly canvasErrors = new Map<string, string>();
	private readonly canvasStoreLifetimes = new Map<string, ICanvasStoreLifetime>();
	private readonly collapsedGroups = new Set<CopilotCustomizationGroupKey>();
	private canvasRefreshBatch: ICanvasRefreshBatch | undefined;

	private sessionResource: URI;
	private extensionInventory: IAgentExtensionInventory | undefined;
	private canvases: readonly ICopilotCanvasItem[] = [];
	private errorMessage: string | undefined;
	private visible = false;
	private loading = false;
	private extensionMutationPending = false;
	private requestSequence = 0;
	private lastHeight = 0;
	private lastWidth = 0;
	private updatingTree = false;

	protected constructor(
		private readonly kind: CopilotCustomizationsWidgetKind,
		container: HTMLElement,
		private readonly extensionsService: ICopilotExtensionsService | undefined,
		private readonly canvasContextService: ICanvasContextService | undefined,
		private readonly canvasService: ICanvasService | undefined,
		private readonly harnessService: ICustomizationHarnessService,
		contextViewService: IContextViewService,
		private readonly hoverService: IHoverService,
		private readonly notificationService: INotificationService,
		private readonly editorService: IEditorService,
		private readonly commandService: ICommandService,
		private readonly logService: ILogService,
		instantiationService: IInstantiationService,
	) {
		super();
		this.sessionResource = this.harnessService.activeSessionResource.get();
		this.element = DOM.append(container, $('.tools-list-widget.copilot-customizations-widget'));

		const header = DOM.append(this.element, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		DOM.append(titleRow, $('h2.section-title')).textContent = kind === 'extensions'
			? localize('copilotExtensions.title', "Extensions")
			: localize('copilotCanvases.title', "Canvases");
		const titleActions = DOM.append(titleRow, $('.section-title-actions'));
		const refreshLabel = localize('copilotCustomizations.refresh', "Refresh");
		this.refreshButton = this._register(new Button(titleActions, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			title: refreshLabel,
			ariaLabel: kind === 'extensions'
				? localize('copilotExtensions.refreshLabel', "Refresh Copilot extensions")
				: localize('copilotCanvases.refreshLabel', "Refresh registered Copilot canvases"),
		}));
		this.refreshButton.label = refreshLabel;
		this._register(this.refreshButton.onDidClick(() => {
			if (this.kind === 'extensions') {
				void this.refreshExtensions(true);
			} else {
				this.refreshCanvases();
			}
		}));
		DOM.append(header, $('p.section-title-description')).textContent = kind === 'extensions'
			? localize('copilotExtensions.description', "Manage executable Copilot extensions discovered from your profile and installed plugins.")
			: localize('copilotCanvases.description', "Review and open canvases registered for chats that are visible in this window.");

		const searchRow = DOM.append(this.element, $('.tools-list-search-and-button-container'));
		const searchContainer = DOM.append(searchRow, $('.tools-list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: kind === 'extensions'
				? localize('copilotExtensions.search', "Search extensions...")
				: localize('copilotCanvases.search', "Search canvases..."),
			ariaLabel: kind === 'extensions'
				? localize('copilotExtensions.searchAriaLabel', "Search Copilot extensions")
				: localize('copilotCanvases.searchAriaLabel', "Search Copilot canvases"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(() => this.render()));

		this.treeContainer = DOM.append(this.element, $('.tools-list-tree.customization-tree-container.copilot-customizations-tree'));
		this.extensionRenderer = new CopilotExtensionRenderer(
			item => this.getItemKey(item),
			extension => this.getExtensionSource(extension),
			() => this.extensionInventory?.mode === 'load_and_augment',
			() => this.extensionInventory?.mode === 'load_only'
				? localize('copilotExtensions.loadOnlyActionUnavailable', "This runtime loads extensions but does not allow changing their enablement.")
				: localize('copilotExtensions.disabledActionUnavailable', "Extension management is unavailable while extensions are disabled."),
			(extension, enabled) => void this.setExtensionEnabled(extension, enabled),
			this.hoverService,
		);
		this.canvasRenderer = new CopilotCanvasRenderer(
			item => this.getItemKey(item),
			item => this.getCanvasDetail(item),
			item => this.getCanvasManagementSection(item.canvas) !== undefined,
			item => this.openCanvasProvider(item),
			this.hoverService,
		);
		const groupRenderer = new CustomizationGroupHeaderRenderer<ICopilotCustomizationGroupEntry>(
			'copilotCustomizationGroupHeader',
			this.hoverService,
		);
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<CopilotCustomizationTreeEntry>,
			kind === 'extensions' ? 'CopilotExtensionsManagementTree' : 'CopilotCanvasesManagementTree',
			this.treeContainer,
			new CopilotCustomizationTreeDelegate(),
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
				openOnSingleClick: true,
				identityProvider: { getId: entry => this.getTreeEntryId(entry) },
				accessibilityProvider: {
					getWidgetAriaLabel: () => kind === 'extensions'
						? localize('copilotExtensions.listLabel', "Installed Copilot extensions")
						: localize('copilotCanvases.listLabel', "Available Copilot canvases"),
					getAriaLabel: entry => this.getTreeEntryAriaLabel(entry),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.type === 'group-header' ? entry.label : this.getItemName(entry.item),
				},
			},
		));
		this._register(this.tree.onDidOpen(event => {
			if (event.element?.type === 'item') {
				this.activateItem(event.element.item);
			}
		}));
		this._register(this.tree.onDidChangeFocus(event => {
			const entry = event.elements[0];
			const itemKey = entry?.type === 'item' ? this.getItemKey(entry.item) : undefined;
			this.extensionRenderer.setFocusedItemKey(itemKey);
			this.canvasRenderer.setFocusedItemKey(itemKey);
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
			if (entry?.type !== 'item' || entry.item.kind !== 'extension' || this.extensionInventory?.mode !== 'load_and_augment' || this.extensionMutationPending) {
				return;
			}
			void this.setExtensionEnabled(entry.item.extension, !entry.item.extension.enabled);
			event.preventDefault();
			event.stopPropagation();
		}));

		this.emptyContainer = DOM.append(this.element, $('.list-empty-state'));
		this.emptyText = DOM.append(this.emptyContainer, $('.empty-state-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-state-subtext'));
		this.emptyContainer.style.display = 'none';

		this._register(autorun(reader => {
			const sessionResource = this.harnessService.activeSessionResource.read(reader);
			if (isEqual(sessionResource, this.sessionResource)) {
				return;
			}
			this.sessionResource = sessionResource;
			this.extensionInventory = undefined;
			if (this.visible && this.kind === 'extensions') {
				void this.refreshExtensions(false);
			}
		}));
		if (this.extensionsService) {
			this._register(this.extensionsService.onDidChange(() => {
				if (this.visible) {
					void this.refreshExtensions(false);
				} else {
					this.extensionInventory = undefined;
				}
			}));
		}

		const canvasContexts = this.canvasContextService;
		const canvasPresentationService = this.canvasService;
		const visibleCanvasContexts = derived(this, reader => {
			this.canvasVisibilityChanged.read(reader);
			if (this.kind !== 'canvases' || !this.visible || !canvasContexts || !canvasPresentationService?.enabled.read(reader)) {
				return [];
			}
			return canvasContexts.contexts.read(reader)
				.filter(context => context.definitionProvider && canvasContexts.isOwnerVisible(context.owner, reader));
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
				}
			}));
			const definitions = store.add(new CanvasDefinitionStore(reader => {
				const refreshGeneration = this.canvasRefreshGeneration.read(reader);
				const current = canvasContexts?.contexts.read(reader)
					.find(candidate => isCanvasOwner(candidate.owner, owner));
				const definitionProvider = current?.definitionProvider;
				if (!current || !definitionProvider || !canvasContexts?.isOwnerVisible(current.owner, reader)) {
					return undefined;
				}
				observableSignalFromEvent(reader.store, definitionProvider.onDidChangeDefinitions).read(reader);
				return {
					owner: current.owner,
					includeDefinition: () => true,
					listCanvases: () => this.listCanvasDefinitions(lifetime, refreshGeneration, () => definitionProvider.listCanvases()),
				};
			}, `[CopilotCustomizationsWidget:${ownerKey}]`, this.logService)).definitions;
			return { owner, definitions };
		}, context => canvasOwnerKey(context.owner));
		const canvasItems = derived(this, reader => canvasStores.read(reader).flatMap(entry => {
			const context = canvasContexts?.contexts.read(reader)
				.find(candidate => isCanvasOwner(candidate.owner, entry.owner));
			return context
				? entry.definitions.read(reader).map(canvas => ({ context, canvas }))
				: [];
		}));
		this._register(autorun(reader => {
			const activeOwnerKeys = new Set(visibleCanvasContexts.read(reader).map(context => canvasOwnerKey(context.owner)));
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
			if (this.canvasRefreshBatch) {
				for (const ownerKey of this.canvasRefreshBatch.pendingOwnerKeys) {
					if (!activeOwnerKeys.has(ownerKey)) {
						this.canvasRefreshBatch.pendingOwnerKeys.delete(ownerKey);
					}
				}
				this.completeCanvasRefreshIfReady();
			}
			this.canvases = canvasItems.read(reader);
			if (this.kind === 'canvases') {
				this.render();
			}
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

	override dispose(): void {
		this.request.value?.cancel();
		super.dispose();
	}

	getAccessibilityContent(): string {
		const title = this.kind === 'extensions'
			? localize('copilotExtensions.title', "Extensions")
			: localize('copilotCanvases.title', "Canvases");
		const description = this.kind === 'extensions'
			? this.getExtensionModeDescription()
			: localize('copilotCanvases.availableDescription', "Canvas availability follows the chats currently visible in this window.");
		const groups = this.getTreeGroups();
		if (groups.length === 0) {
			return [title, description, this.emptyText.textContent, this.emptySubtext.textContent].filter(Boolean).join('\n\n');
		}
		return [
			title,
			description,
			...groups.flatMap(group => [
				group.label,
				...group.children.map(entry => {
					const item = entry.type === 'item' ? entry.item : undefined;
					if (!item) {
						return '';
					}
					if (item.kind === 'extension') {
						return localize(
							'copilotExtensions.accessibleItem',
							"{0}. {1}. {2}. Executable Copilot extension.",
							item.extension.name,
							item.extension.enabled ? localize('copilotExtensions.enabled', "Enabled") : localize('copilotExtensions.disabledStatus', "Disabled"),
							this.getExtensionSource(item.extension),
						);
					}
					return localize(
						'copilotCanvases.accessibleItem',
						"{0}. {1}. {2}. {3}",
						item.item.canvas.displayName,
						item.item.canvas.description,
						this.getCanvasSource(item.item.canvas),
						item.item.canvas.requiresInput ? localize('copilotCanvases.requiresInput', "Requires input") : localize('copilotCanvases.readyToOpen', "Ready to open"),
					);
				}),
			]),
		].filter(Boolean).join('\n\n');
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (this.kind === 'canvases') {
			this.canvasVisibilityChanged.trigger(undefined);
			return;
		}
		if (!visible) {
			this.request.value?.cancel();
			return;
		}
		if (!this.loading && !this.extensionInventory) {
			void this.refreshExtensions(false);
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
		status(localize('copilotCanvases.refreshing', "Refreshing Copilot canvases."));
		this.completeCanvasRefreshIfReady();
		this.render();
	}

	private async refreshExtensions(userInitiated: boolean): Promise<void> {
		const extensionsService = this.extensionsService;
		if (!extensionsService) {
			return;
		}
		const sequence = ++this.requestSequence;
		this.request.value?.cancel();
		const request = new CancellationTokenSource();
		this.request.value = request;
		this.loading = true;
		this.errorMessage = undefined;
		this.render();
		try {
			const inventory = await extensionsService.listExtensions(this.sessionResource, request.token);
			if (this._store.isDisposed || sequence !== this.requestSequence || request.token.isCancellationRequested) {
				return;
			}
			this.extensionInventory = inventory;
			if (userInitiated) {
				status(localize('copilotExtensions.refreshed', "Copilot extensions refreshed."));
			}
		} catch (error) {
			if (this._store.isDisposed || sequence !== this.requestSequence || isCancellationError(error)) {
				return;
			}
			this.errorMessage = getErrorMessage(error);
			if (userInitiated) {
				this.notificationService.error(localize('copilotExtensions.refreshFailed', "Unable to refresh Copilot extensions. {0}", this.errorMessage));
			}
		} finally {
			if (!this._store.isDisposed && sequence === this.requestSequence) {
				this.loading = false;
				this.request.clear();
				this.render();
			}
		}
	}

	private async listCanvasDefinitions(lifetime: ICanvasStoreLifetime, refreshGeneration: number, listCanvases: () => Promise<readonly ICanvasDefinition[]>): Promise<readonly ICanvasDefinition[]> {
		const request = {};
		lifetime.request = request;
		const isCurrent = () => !this._store.isDisposed
			&& !lifetime.disposed
			&& lifetime.request === request
			&& this.canvasStoreLifetimes.get(lifetime.ownerKey) === lifetime;
		if (!isCurrent()) {
			return [];
		}
		const ownerKey = lifetime.ownerKey;
		this.loadingCanvasOwnerKeys.add(ownerKey);
		this.canvasErrors.delete(ownerKey);
		this.render();
		try {
			return await listCanvases();
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
			this.notificationService.error(localize('copilotCanvases.refreshFailed', "Unable to refresh Copilot canvases. {0}", refresh.errorMessage));
		} else {
			status(localize('copilotCanvases.refreshed', "Copilot canvases refreshed."));
		}
	}

	private render(): void {
		if (this._store.isDisposed) {
			return;
		}
		const focusedAction = this.captureFocusedAction();
		const groups = this.getTreeGroups();
		const query = this.searchInput.value.trim();
		const loading = this.isBusy();
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
				const children: IObjectTreeElement<CopilotCustomizationTreeEntry>[] = groups.map(group => ({
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
		if (this.isEmptyLoading()) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.loading', "Loading Extensions...")
				: localize('copilotCanvases.loading', "Loading Canvases...");
			this.emptySubtext.textContent = '';
			return;
		}
		const errorMessage = this.getCurrentErrorMessage();
		if (errorMessage) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.unavailable', "Extensions Unavailable")
				: localize('copilotCanvases.unavailable', "Canvases Unavailable");
			this.emptySubtext.textContent = errorMessage;
			return;
		}
		if (this.kind === 'extensions' && this.extensionInventory?.mode === 'disabled') {
			this.emptyText.textContent = localize('copilotExtensions.disabled', "Extensions Are Disabled");
			this.emptySubtext.textContent = localize('copilotExtensions.disabledDescription', "The Copilot runtime is not loading extensions.");
			return;
		}
		if (this.searchInput.value.trim()) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.noMatches', "No Matching Extensions")
				: localize('copilotCanvases.noMatches', "No Matching Canvases");
			this.emptySubtext.textContent = localize('copilotCustomizations.noMatchesDescription', "Try a different search.");
			return;
		}
		this.emptyText.textContent = this.kind === 'extensions'
			? localize('copilotExtensions.empty', "No Extensions Found")
			: localize('copilotCanvases.empty', "No Canvases Found");
		this.emptySubtext.textContent = this.kind === 'extensions'
			? localize('copilotExtensions.emptyDescription', "Install a user extension or a plugin that contributes one, then refresh this page.")
			: localize('copilotCanvases.emptyDescription', "Open or resume a Copilot chat with Canvas support in this window.");
	}

	private isBusy(): boolean {
		return this.kind === 'extensions' ? this.loading || this.extensionMutationPending : this.loadingCanvasOwnerKeys.size > 0;
	}

	private isEmptyLoading(): boolean {
		return this.isBusy() && (this.kind === 'extensions' || this.canvases.length === 0);
	}

	private getCurrentErrorMessage(): string | undefined {
		return this.kind === 'extensions'
			? this.errorMessage
			: this.canvases.length === 0
				? this.canvasErrors.values().next().value
				: undefined;
	}

	private async setExtensionEnabled(extension: IAgentExtensionInfo, enabled: boolean): Promise<void> {
		const extensionsService = this.extensionsService;
		if (!extensionsService) {
			return;
		}
		if (this.extensionMutationPending) {
			this.render();
			return;
		}
		const focusedAction = this.captureFocusedAction();
		this.extensionMutationPending = true;
		this.render();
		try {
			await extensionsService.setExtensionEnabled(this.sessionResource, extension.id, enabled);
			status(enabled
				? localize('copilotExtensions.enabledAnnouncement', "Enabled extension {0}.", extension.name)
				: localize('copilotExtensions.disabledAnnouncement', "Disabled extension {0}.", extension.name));
		} catch (error) {
			this.notificationService.error(enabled
				? localize('copilotExtensions.enableFailed', "Could not finish enabling extension {0}. {1}", extension.name, getErrorMessage(error))
				: localize('copilotExtensions.disableFailed', "Could not finish disabling extension {0}. {1}", extension.name, getErrorMessage(error)));
		} finally {
			this.extensionMutationPending = false;
			this.render();
			this.restoreFocusedAction(focusedAction);
		}
	}

	private async openCanvas(item: ICopilotCanvasItem): Promise<void> {
		const canvasService = this.canvasService;
		if (!canvasService?.enabled.get()) {
			return;
		}
		try {
			const instanceId = getCanvasDefinitionInstanceId(item.canvas);
			const existing = item.context.canvases.get()?.find(candidate => candidate.instanceId === instanceId);
			if (existing) {
				await canvasService.revealCanvas({ ...item.context.owner, canvas: existing.resource });
				if (existing.source) {
					return;
				}
			}
			await item.context.definitionProvider!.openCanvas(item.canvas, instanceId);
		} catch (error) {
			this.notificationService.error(localize('copilotCanvases.openFailed', "Unable to open canvas {0}. {1}", item.canvas.displayName, getErrorMessage(error)));
		}
	}

	private activateItem(item: CopilotCustomizationItem): void {
		if (item.kind === 'extension') {
			if (item.extension.source === 'plugin') {
				this.openSection(AICustomizationManagementSection.Plugins);
			} else {
				void this.editorService.openEditor({ resource: item.extension.resource });
			}
			return;
		}
		if (isOpenableExtensionCanvasDefinition(item.item.canvas)) {
			void this.openCanvas(item.item);
			return;
		}
		this.openCanvasProvider(item.item);
	}

	private openCanvasProvider(item: ICopilotCanvasItem): void {
		const section = this.getCanvasManagementSection(item.canvas);
		if (section) {
			this.openSection(section, this.canvasContextService?.getFrontendSessionResource(item.context.owner) ?? this.sessionResource);
		}
	}

	private getCanvasManagementSection(canvas: ICanvasDefinition): AICustomizationManagementSection | undefined {
		switch (canvas.extensionSource) {
			case 'plugin': return AICustomizationManagementSection.Plugins;
			case 'user': return AICustomizationManagementSection.Extensions;
			default: return undefined;
		}
	}

	private openSection(section: AICustomizationManagementSection, sessionResource = this.sessionResource): void {
		void this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
			section,
			sessionResource,
		});
	}

	private getTreeGroups(): readonly ICopilotCustomizationTreeGroup[] {
		const query = this.searchInput.value.trim();
		const items = this.getFilteredItems();
		const grouped = new Map<CopilotCustomizationGroupKey, ICopilotCustomizationItemEntry[]>();
		for (const item of items) {
			const key = this.getItemGroupKey(item);
			const group = grouped.get(key) ?? [];
			group.push({ type: 'item', item });
			grouped.set(key, group);
		}
		const definitions = this.getGroupDefinitions();
		const groups: ICopilotCustomizationTreeGroup[] = [];
		for (const definition of definitions) {
			const children = grouped.get(definition.key) ?? [];
			if (children.length === 0) {
				continue;
			}
			const collapsed = !query && this.collapsedGroups.has(definition.key);
			const element: ICopilotCustomizationGroupEntry = {
				type: 'group-header',
				id: `copilot-customization-group:${query ? 'search:' : ''}${definition.key}`,
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

	private getGroupDefinitions(): readonly { key: CopilotCustomizationGroupKey; label: string; description: string; icon: ThemeIcon }[] {
		if (this.kind === 'extensions') {
			return [
				{ key: 'user', label: localize('copilotExtensions.userGroup', "User"), description: localize('copilotExtensions.userGroupDescription', "Extensions installed in your Copilot profile."), icon: userIcon },
				{ key: 'plugin', label: localize('copilotExtensions.pluginGroup', "Plugins"), description: localize('copilotExtensions.pluginGroupDescription', "Extensions contributed by installed plugins."), icon: pluginIcon },
			];
		}
		return [
			{ key: 'user', label: localize('copilotCanvases.userGroup', "User"), description: localize('copilotCanvases.userGroupDescription', "Canvases provided by user extensions."), icon: userIcon },
			{ key: 'project', label: localize('copilotCanvases.projectGroup', "Project"), description: localize('copilotCanvases.projectGroupDescription', "Canvases provided by project extensions."), icon: workspaceIcon },
			{ key: 'session', label: localize('copilotCanvases.sessionGroup', "Session"), description: localize('copilotCanvases.sessionGroupDescription', "Canvases provided for the current session."), icon: extensionIcon },
			{ key: 'plugin', label: localize('copilotCanvases.pluginGroup', "Plugins"), description: localize('copilotCanvases.pluginGroupDescription', "Canvases provided by installed plugins."), icon: pluginIcon },
			{ key: 'other', label: localize('copilotCanvases.otherGroup', "Other"), description: localize('copilotCanvases.otherGroupDescription', "Canvases provided by another runtime source."), icon: extensionIcon },
		];
	}

	private getItemGroupKey(item: CopilotCustomizationItem): CopilotCustomizationGroupKey {
		if (item.kind === 'extension') {
			return item.extension.source === 'plugin' ? 'plugin' : 'user';
		}
		switch (item.item.canvas.extensionSource) {
			case 'user': return 'user';
			case 'project': return 'project';
			case 'session': return 'session';
			case 'plugin': return 'plugin';
			default: return 'other';
		}
	}

	private getTreeEntryId(entry: CopilotCustomizationTreeEntry): string {
		return entry.type === 'group-header' ? entry.id : this.getItemKey(entry.item);
	}

	private getTreeEntryAriaLabel(entry: CopilotCustomizationTreeEntry): string {
		if (entry.type === 'group-header') {
			return getCustomizationTreeAriaLabel(entry.label, entry.count, entry.collapsed);
		}
		if (entry.item.kind === 'extension') {
			return localize(
				'copilotExtensions.rowAriaLabel',
				"{0}. {1}. {2}.",
				entry.item.extension.name,
				entry.item.extension.enabled ? localize('copilotExtensions.enabled', "Enabled") : localize('copilotExtensions.disabledStatus', "Disabled"),
				this.getExtensionSource(entry.item.extension),
			);
		}
		return localize(
			'copilotCanvases.rowAriaLabel',
			"{0}. {1}. {2}.",
			entry.item.item.canvas.displayName,
			entry.item.item.canvas.requiresInput ? localize('copilotCanvases.requiresInput', "Requires input") : localize('copilotCanvases.readyToOpen', "Ready to open"),
			this.getCanvasSource(entry.item.item.canvas),
		);
	}

	private getItemKey(item: CopilotCustomizationItem): string {
		return item.kind === 'extension'
			? `extension:${item.extension.id}`
			: `canvas:${canvasOwnerKey(item.item.context.owner)}\u0000${item.item.canvas.extensionId}\u0000${item.item.canvas.canvasId}`;
	}

	private captureFocusedAction(): IFocusedCustomizationAction | undefined {
		const activeElement = DOM.getActiveElement();
		if (!DOM.isHTMLElement(activeElement) || !this.treeContainer.contains(activeElement)) {
			return undefined;
		}
		const row = activeElement.closest<HTMLElement>('[data-customization-key]');
		const action = activeElement.closest<HTMLElement>('[data-customization-action]');
		const itemKey = row?.dataset.customizationKey;
		const actionId = action?.dataset.customizationAction;
		return itemKey && actionId ? { itemKey, actionId } : undefined;
	}

	private restoreFocusedAction(focusedAction: IFocusedCustomizationAction | undefined): void {
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
			this.canvasRenderer.focusAction(focusedAction.itemKey, focusedAction.actionId);
		}
	}

	private getItemName(item: CopilotCustomizationItem): string {
		return item.kind === 'extension' ? item.extension.name : item.item.canvas.displayName;
	}

	private getFilteredItems(): readonly CopilotCustomizationItem[] {
		const query = this.searchInput.value.trim().toLowerCase();
		const items: CopilotCustomizationItem[] = this.kind === 'extensions'
			? (this.extensionInventory?.extensions ?? []).map(extension => ({ kind: 'extension', extension }))
			: this.canvases.map(item => ({ kind: 'canvas', item }));
		return items
			.filter(item => {
				if (!query) {
					return true;
				}
				const values = item.kind === 'extension'
					? [item.extension.name, item.extension.id, item.extension.pluginName, this.getExtensionSource(item.extension)]
					: [item.item.canvas.displayName, item.item.canvas.description, item.item.canvas.canvasId, item.item.canvas.extensionId, item.item.canvas.extensionName, this.getCanvasSource(item.item.canvas)];
				return values.some(value => value?.toLowerCase().includes(query));
			})
			.sort((left, right) => this.getItemName(left).localeCompare(this.getItemName(right)));
	}

	private getExtensionModeDescription(): string {
		switch (this.extensionInventory?.mode) {
			case 'disabled':
				return localize('copilotExtensions.disabledInventoryDescription', "Extensions are installed but are not loaded by the active runtime.");
			case 'load_only':
				return localize('copilotExtensions.loadOnlyDescription', "Extensions are loaded by the runtime, but enablement changes are unavailable.");
			case 'load_and_augment':
				return localize('copilotExtensions.manageableDescription', "Preferences apply to future sessions and reconcile the selected live chat when available.");
			default:
				return localize('copilotExtensions.inventoryDescription', "Extensions are discovered from your profile and enabled installed plugins.");
		}
	}

	private getExtensionSource(extension: IAgentExtensionInfo): string {
		return extension.source === 'plugin'
			? extension.pluginName
				? localize('copilotExtensions.pluginSource', "Plugin: {0}", extension.pluginName)
				: localize('copilotExtensions.plugin', "Plugin Extension")
			: localize('copilotExtensions.user', "User Extension");
	}

	private getCanvasDetail(item: ICopilotCanvasItem): string {
		const source = this.getCanvasSource(item.canvas);
		return item.canvas.description
			? localize('copilotCanvases.detail', "{0} · {1}", item.canvas.description, source)
			: source;
	}

	private getCanvasSource(canvas: ICanvasDefinition): string {
		const provider = canvas.extensionName ?? canvas.extensionId;
		switch (canvas.extensionSource) {
			case 'plugin': return localize('copilotCanvases.pluginSource', "Plugin: {0}", provider);
			case 'project': return localize('copilotCanvases.projectSource', "Project Extension: {0}", provider);
			case 'user': return localize('copilotCanvases.userSource', "User Extension: {0}", provider);
			case 'session': return localize('copilotCanvases.sessionSource', "Session Extension: {0}", provider);
			default: return localize('copilotCanvases.providerSource', "Provider: {0}", provider);
		}
	}
}

export class CopilotExtensionsWidget extends CopilotCustomizationsWidget {

	constructor(
		container: HTMLElement,
		@ICopilotExtensionsService extensionsService: ICopilotExtensionsService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@INotificationService notificationService: INotificationService,
		@IEditorService editorService: IEditorService,
		@ICommandService commandService: ICommandService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super('extensions', container, extensionsService, undefined, undefined, harnessService, contextViewService, hoverService, notificationService, editorService, commandService, logService, instantiationService);
	}
}

export class CopilotCanvasesWidget extends CopilotCustomizationsWidget {

	constructor(
		container: HTMLElement,
		@ICanvasContextService canvasContextService: ICanvasContextService,
		@ICanvasService canvasService: ICanvasService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@INotificationService notificationService: INotificationService,
		@IEditorService editorService: IEditorService,
		@ICommandService commandService: ICommandService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super('canvases', container, undefined, canvasContextService, canvasService, harnessService, contextViewService, hoverService, notificationService, editorService, commandService, logService, instantiationService);
	}
}
