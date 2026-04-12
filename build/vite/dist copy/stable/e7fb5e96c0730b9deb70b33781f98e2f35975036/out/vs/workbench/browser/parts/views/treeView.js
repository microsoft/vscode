/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TreeRenderer_1;
import { DataTransfers } from '../../../../base/browser/dnd.js';
import * as DOM from '../../../../base/browser/dom.js';
import * as cssJs from '../../../../base/browser/cssValue.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CollapseAllAction } from '../../../../base/browser/ui/tree/treeDefaults.js';
import { ActionRunner, Separator } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createMatches } from '../../../../base/common/filters.js';
import { isMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import './media/views.css';
import { VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { localize } from '../../../../nls.js';
import { createActionViewItem, getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { FileThemeIcon, FolderThemeIcon, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { fillEditorsDragData } from '../../dnd.js';
import { ResourceLabels } from '../../labels.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from '../editor/editorCommands.js';
import { getLocationBasedViewColors, ViewPane } from './viewPane.js';
import { Extensions, IViewDescriptorService, ResolvableTreeItem, TreeItemCollapsibleState } from '../../../common/views.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { CodeDataTransfers, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { toExternalVSDataTransfer } from '../../../../editor/browser/dataTransfer.js';
import { CheckboxStateHandler, TreeItemCheckbox } from './checkbox.js';
import { setTimeout0 } from '../../../../base/common/platform.js';
import { TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { ITreeViewsDnDService } from '../../../../editor/common/services/treeViewsDndService.js';
import { DraggedTreeItemsIdentifier } from '../../../../editor/common/services/treeViewsDnd.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService.js';
let TreeViewPane = class TreeViewPane extends ViewPane {
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, notificationService, hoverService, accessibleViewService) {
        super({ ...options, titleMenuId: MenuId.ViewTitle, donotForwardArgs: false }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
        const { treeView } = Registry.as(Extensions.ViewsRegistry).getView(options.id);
        this.treeView = treeView;
        this._register(this.treeView.onDidChangeActions(() => this.updateActions(), this));
        this._register(this.treeView.onDidChangeTitle((newTitle) => this.updateTitle(newTitle)));
        this._register(this.treeView.onDidChangeDescription((newDescription) => this.updateTitleDescription(newDescription)));
        this._register(toDisposable(() => {
            if (this._container && this.treeView.container && (this._container === this.treeView.container)) {
                this.treeView.setVisibility(false);
            }
        }));
        this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
        this._register(this.treeView.onDidChangeWelcomeState(() => this._onDidChangeViewWelcomeState.fire()));
        if (options.title !== this.treeView.title) {
            this.updateTitle(this.treeView.title);
        }
        if (options.titleDescription !== this.treeView.description) {
            this.updateTitleDescription(this.treeView.description);
        }
        this._actionRunner = this._register(new MultipleSelectionActionRunner(notificationService, () => this.treeView.getSelection()));
        this.updateTreeVisibility();
    }
    focus() {
        super.focus();
        this.treeView.focus();
    }
    renderBody(container) {
        this._container = container;
        super.renderBody(container);
        this.renderTreeView(container);
    }
    shouldShowWelcome() {
        return ((this.treeView.dataProvider === undefined) || !!this.treeView.dataProvider.isTreeEmpty) && ((this.treeView.message === undefined) || (this.treeView.message === ''));
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.layoutTreeView(height, width);
    }
    getOptimalWidth() {
        return this.treeView.getOptimalWidth();
    }
    renderTreeView(container) {
        this.treeView.show(container);
    }
    layoutTreeView(height, width) {
        this.treeView.layout(height, width);
    }
    updateTreeVisibility() {
        this.treeView.setVisibility(this.isBodyVisible());
    }
    getActionRunner() {
        return this._actionRunner;
    }
    getActionsContext() {
        return { $treeViewId: this.id, $focusedTreeItem: true, $selectedTreeItems: true };
    }
};
TreeViewPane = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, INotificationService),
    __param(10, IHoverService),
    __param(11, IAccessibleViewInformationService)
], TreeViewPane);
export { TreeViewPane };
class Root {
    constructor() {
        this.label = { label: 'root' };
        this.handle = '0';
        this.parentHandle = undefined;
        this.collapsibleState = TreeItemCollapsibleState.Expanded;
        this.children = undefined;
    }
}
function commandPreconditions(commandId) {
    const command = CommandsRegistry.getCommand(commandId);
    if (command) {
        const commandAction = MenuRegistry.getCommand(command.id);
        return commandAction?.precondition;
    }
    return undefined;
}
function isTreeCommandEnabled(treeCommand, contextKeyService) {
    const commandId = treeCommand.originalId ? treeCommand.originalId : treeCommand.id;
    const precondition = commandPreconditions(commandId);
    if (precondition) {
        return contextKeyService.contextMatchesRules(precondition);
    }
    return true;
}
function isRenderedMessageValue(messageValue) {
    return !!messageValue && typeof messageValue !== 'string' && !!messageValue.element && !!messageValue.disposables;
}
const noDataProviderMessage = localize('no-dataprovider', "There is no data provider registered that can provide view data.");
export const RawCustomTreeViewContextKey = new RawContextKey('customTreeView', false);
class Tree extends WorkbenchAsyncDataTree {
}
let AbstractTreeView = class AbstractTreeView extends Disposable {
    get onDidExpandItem() { return this._onDidExpandItem.event; }
    get onDidCollapseItem() { return this._onDidCollapseItem.event; }
    get onDidChangeSelectionAndFocus() { return this._onDidChangeSelectionAndFocus.event; }
    get onDidChangeVisibility() { return this._onDidChangeVisibility.event; }
    get onDidChangeActions() { return this._onDidChangeActions.event; }
    get onDidChangeWelcomeState() { return this._onDidChangeWelcomeState.event; }
    get onDidChangeTitle() { return this._onDidChangeTitle.event; }
    get onDidChangeDescription() { return this._onDidChangeDescription.event; }
    get onDidChangeCheckboxState() { return this._onDidChangeCheckboxState.event; }
    constructor(id, _title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService, openerService, markdownRendererService) {
        super();
        this.id = id;
        this._title = _title;
        this.themeService = themeService;
        this.instantiationService = instantiationService;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.progressService = progressService;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.notificationService = notificationService;
        this.viewDescriptorService = viewDescriptorService;
        this.hoverService = hoverService;
        this.contextKeyService = contextKeyService;
        this.activityService = activityService;
        this.logService = logService;
        this.openerService = openerService;
        this.markdownRendererService = markdownRendererService;
        this.isVisible = false;
        this._hasIconForParentNode = false;
        this._hasIconForLeafNode = false;
        this.focused = false;
        this._canSelectMany = false;
        this._manuallyManageCheckboxes = false;
        this.elementsToRefresh = [];
        this.lastSelection = [];
        this._onDidExpandItem = this._register(new Emitter());
        this._onDidCollapseItem = this._register(new Emitter());
        this._onDidChangeSelectionAndFocus = this._register(new Emitter());
        this._onDidChangeVisibility = this._register(new Emitter());
        this._onDidChangeActions = this._register(new Emitter());
        this._onDidChangeWelcomeState = this._register(new Emitter());
        this._onDidChangeTitle = this._register(new Emitter());
        this._onDidChangeDescription = this._register(new Emitter());
        this._onDidChangeCheckboxState = this._register(new Emitter());
        this._onDidCompleteRefresh = this._register(new Emitter());
        this._isInitialized = false;
        this._activity = this._register(new MutableDisposable());
        this.activated = false;
        this.treeDisposables = this._register(new DisposableStore());
        this._height = 0;
        this._width = 0;
        this.refreshing = false;
        this.root = new Root();
        this.lastActive = this.root;
        // Try not to add anything that could be costly to this constructor. It gets called once per tree view
        // during startup, and anything added here can affect performance.
    }
    initialize() {
        if (this._isInitialized) {
            return;
        }
        this._isInitialized = true;
        // Remember when adding to this method that it isn't called until the view is visible, meaning that
        // properties could be set and events could be fired before we're initialized and that this needs to be handled.
        this.contextKeyService.bufferChangeEvents(() => {
            this.initializeShowCollapseAllAction();
            this.initializeCollapseAllToggle();
            this.initializeShowRefreshAction();
        });
        this.treeViewDnd = this.instantiationService.createInstance(CustomTreeViewDragAndDrop, this.id);
        if (this._dragAndDropController) {
            this.treeViewDnd.controller = this._dragAndDropController;
        }
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('explorer.decorations')) {
                this.doRefresh([this.root]); /** soft refresh **/
            }
        }));
        this._register(this.viewDescriptorService.onDidChangeLocation(({ views, from, to }) => {
            if (views.some(v => v.id === this.id)) {
                this.tree?.updateOptions({ overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles });
            }
        }));
        this.registerActions();
        this.create();
    }
    get viewContainer() {
        return this.viewDescriptorService.getViewContainerByViewId(this.id);
    }
    get viewLocation() {
        return this.viewDescriptorService.getViewLocationById(this.id);
    }
    get dragAndDropController() {
        return this._dragAndDropController;
    }
    set dragAndDropController(dnd) {
        this._dragAndDropController = dnd;
        if (this.treeViewDnd) {
            this.treeViewDnd.controller = dnd;
        }
    }
    get dataProvider() {
        return this._dataProvider;
    }
    set dataProvider(dataProvider) {
        if (dataProvider) {
            if (this.visible) {
                this.activate();
            }
            const self = this;
            this._dataProvider = new class {
                constructor() {
                    this._isEmpty = true;
                    this._onDidChangeEmpty = new Emitter();
                    this.onDidChangeEmpty = this._onDidChangeEmpty.event;
                }
                get isTreeEmpty() {
                    return this._isEmpty;
                }
                async getChildren(element) {
                    const batches = await this.getChildrenBatch(element ? [element] : undefined);
                    return batches?.[0];
                }
                updateEmptyState(nodes, childrenGroups) {
                    if ((nodes.length === 1) && (nodes[0] instanceof Root)) {
                        const oldEmpty = this._isEmpty;
                        this._isEmpty = (childrenGroups.length === 0) || (childrenGroups[0].length === 0);
                        if (oldEmpty !== this._isEmpty) {
                            this._onDidChangeEmpty.fire();
                        }
                    }
                }
                findCheckboxesUpdated(nodes, childrenGroups) {
                    if (childrenGroups.length === 0) {
                        return [];
                    }
                    const checkboxesUpdated = [];
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        const children = childrenGroups[i];
                        for (const child of children) {
                            child.parent = node;
                            if (!self.manuallyManageCheckboxes && (node?.checkbox?.isChecked === true) && (child.checkbox?.isChecked === false)) {
                                child.checkbox.isChecked = true;
                                checkboxesUpdated.push(child);
                            }
                        }
                    }
                    return checkboxesUpdated;
                }
                async getChildrenBatch(nodes) {
                    let childrenGroups;
                    let checkboxesUpdated = [];
                    if (nodes?.every((node) => !!node.children)) {
                        childrenGroups = nodes.map(node => node.children);
                    }
                    else {
                        nodes = nodes ?? [self.root];
                        const batchedChildren = await (nodes.length === 1 && nodes[0] instanceof Root ? doGetChildrenOrBatch(dataProvider, undefined) : doGetChildrenOrBatch(dataProvider, nodes));
                        for (let i = 0; i < nodes.length; i++) {
                            const node = nodes[i];
                            node.children = batchedChildren ? batchedChildren[i] : undefined;
                        }
                        childrenGroups = batchedChildren ?? [];
                        checkboxesUpdated = this.findCheckboxesUpdated(nodes, childrenGroups);
                    }
                    this.updateEmptyState(nodes, childrenGroups);
                    if (checkboxesUpdated.length > 0) {
                        self._onDidChangeCheckboxState.fire(checkboxesUpdated);
                    }
                    return childrenGroups;
                }
            };
            if (this._dataProvider.onDidChangeEmpty) {
                this._register(this._dataProvider.onDidChangeEmpty(() => {
                    this.updateCollapseAllToggle();
                    this._onDidChangeWelcomeState.fire();
                }));
            }
            this.updateMessage();
            this.refresh();
        }
        else {
            this._dataProvider = undefined;
            this.treeDisposables.clear();
            this.activated = false;
            this.updateMessage();
        }
        this._onDidChangeWelcomeState.fire();
    }
    get message() {
        return this._message;
    }
    set message(message) {
        this._message = message;
        this.updateMessage();
        this._onDidChangeWelcomeState.fire();
    }
    get title() {
        return this._title;
    }
    set title(name) {
        this._title = name;
        if (this.tree) {
            this.tree.ariaLabel = this._title;
        }
        this._onDidChangeTitle.fire(this._title);
    }
    get description() {
        return this._description;
    }
    set description(description) {
        this._description = description;
        this._onDidChangeDescription.fire(this._description);
    }
    get badge() {
        return this._badge;
    }
    set badge(badge) {
        if (this._badge?.value === badge?.value &&
            this._badge?.tooltip === badge?.tooltip) {
            return;
        }
        this._badge = badge;
        if (badge) {
            const activity = {
                badge: new NumberBadge(badge.value, () => badge.tooltip),
                priority: 50
            };
            this._activity.value = this.activityService.showViewActivity(this.id, activity);
        }
        else {
            this._activity.clear();
        }
    }
    get canSelectMany() {
        return this._canSelectMany;
    }
    set canSelectMany(canSelectMany) {
        const oldCanSelectMany = this._canSelectMany;
        this._canSelectMany = canSelectMany;
        if (this._canSelectMany !== oldCanSelectMany) {
            this.tree?.updateOptions({ multipleSelectionSupport: this.canSelectMany });
        }
    }
    get manuallyManageCheckboxes() {
        return this._manuallyManageCheckboxes;
    }
    set manuallyManageCheckboxes(manuallyManageCheckboxes) {
        this._manuallyManageCheckboxes = manuallyManageCheckboxes;
    }
    get hasIconForParentNode() {
        return this._hasIconForParentNode;
    }
    get hasIconForLeafNode() {
        return this._hasIconForLeafNode;
    }
    get visible() {
        return this.isVisible;
    }
    initializeShowCollapseAllAction(startingValue = false) {
        if (!this.collapseAllContext) {
            this.collapseAllContextKey = new RawContextKey(`treeView.${this.id}.enableCollapseAll`, startingValue, localize('treeView.enableCollapseAll', "Whether the tree view with id {0} enables collapse all.", this.id));
            this.collapseAllContext = this.collapseAllContextKey.bindTo(this.contextKeyService);
        }
        return true;
    }
    get showCollapseAllAction() {
        this.initializeShowCollapseAllAction();
        return !!this.collapseAllContext?.get();
    }
    set showCollapseAllAction(showCollapseAllAction) {
        this.initializeShowCollapseAllAction(showCollapseAllAction);
        this.collapseAllContext?.set(showCollapseAllAction);
    }
    initializeShowRefreshAction(startingValue = false) {
        if (!this.refreshContext) {
            this.refreshContextKey = new RawContextKey(`treeView.${this.id}.enableRefresh`, startingValue, localize('treeView.enableRefresh', "Whether the tree view with id {0} enables refresh.", this.id));
            this.refreshContext = this.refreshContextKey.bindTo(this.contextKeyService);
        }
    }
    get showRefreshAction() {
        this.initializeShowRefreshAction();
        return !!this.refreshContext?.get();
    }
    set showRefreshAction(showRefreshAction) {
        this.initializeShowRefreshAction(showRefreshAction);
        this.refreshContext?.set(showRefreshAction);
    }
    registerActions() {
        const that = this;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.treeView.${that.id}.refresh`,
                    title: localize('refresh', "Refresh"),
                    menu: {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', that.id), that.refreshContextKey),
                        group: 'navigation',
                        order: Number.MAX_SAFE_INTEGER - 1,
                    },
                    icon: Codicon.refresh
                });
            }
            async run() {
                return that.refresh();
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.treeView.${that.id}.collapseAll`,
                    title: localize('collapseAll', "Collapse All"),
                    menu: {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', that.id), that.collapseAllContextKey),
                        group: 'navigation',
                        order: Number.MAX_SAFE_INTEGER,
                    },
                    precondition: that.collapseAllToggleContextKey,
                    icon: Codicon.collapseAll
                });
            }
            async run() {
                if (that.tree) {
                    return new CollapseAllAction(that.tree, true).run();
                }
            }
        }));
    }
    setVisibility(isVisible) {
        // Throughout setVisibility we need to check if the tree view's data provider still exists.
        // This can happen because the `getChildren` call to the extension can return
        // after the tree has been disposed.
        this.initialize();
        isVisible = !!isVisible;
        if (this.isVisible === isVisible) {
            return;
        }
        this.isVisible = isVisible;
        if (this.tree) {
            if (this.isVisible) {
                DOM.show(this.tree.getHTMLElement());
            }
            else {
                DOM.hide(this.tree.getHTMLElement()); // make sure the tree goes out of the tabindex world by hiding it
            }
            if (this.isVisible && this.elementsToRefresh.length && this.dataProvider) {
                this.doRefresh(this.elementsToRefresh);
                this.elementsToRefresh = [];
            }
        }
        setTimeout0(() => {
            if (this.dataProvider) {
                this._onDidChangeVisibility.fire(this.isVisible);
            }
        });
        if (this.visible) {
            this.activate();
        }
    }
    focus(reveal = true, revealItem) {
        if (this.tree && this.root.children && this.root.children.length > 0) {
            // Make sure the current selected element is revealed
            const element = revealItem ?? this.tree.getSelection()[0];
            if (element && reveal) {
                this.tree.reveal(element, 0.5);
            }
            // Pass Focus to Viewer
            this.tree.domFocus();
        }
        else if (this.tree && this.treeContainer && !this.treeContainer.classList.contains('hide')) {
            this.tree.domFocus();
        }
        else {
            this.domNode.focus();
        }
    }
    show(container) {
        this._container = container;
        DOM.append(container, this.domNode);
    }
    create() {
        this.domNode = DOM.$('.tree-explorer-viewlet-tree-view');
        this.messageElement = DOM.append(this.domNode, DOM.$('.message'));
        this.updateMessage();
        this.treeContainer = DOM.append(this.domNode, DOM.$('.customview-tree'));
        this.treeContainer.classList.add('file-icon-themable-tree', 'show-file-icons');
        const focusTracker = this._register(DOM.trackFocus(this.domNode));
        this._register(focusTracker.onDidFocus(() => this.focused = true));
        this._register(focusTracker.onDidBlur(() => this.focused = false));
    }
    createTree() {
        this.treeDisposables.clear();
        const actionViewItemProvider = createActionViewItem.bind(undefined, this.instantiationService);
        const treeMenus = this.treeDisposables.add(this.instantiationService.createInstance(TreeMenus, this.id));
        this.treeLabels = this.treeDisposables.add(this.instantiationService.createInstance(ResourceLabels, this));
        const dataSource = this.instantiationService.createInstance(TreeDataSource, this, (task) => this.progressService.withProgress({ location: this.id }, () => task));
        const aligner = this.treeDisposables.add(new Aligner(this.themeService, this.logService));
        const checkboxStateHandler = this.treeDisposables.add(new CheckboxStateHandler());
        const renderer = this.treeDisposables.add(this.instantiationService.createInstance(TreeRenderer, this.id, treeMenus, this.treeLabels, actionViewItemProvider, aligner, checkboxStateHandler, () => this.manuallyManageCheckboxes));
        this.treeDisposables.add(renderer.onDidChangeCheckboxState(e => this._onDidChangeCheckboxState.fire(e)));
        const widgetAriaLabel = this._title;
        this.tree = this.treeDisposables.add(this.instantiationService.createInstance(Tree, this.id, this.treeContainer, new TreeViewDelegate(), [renderer], dataSource, {
            identityProvider: new TreeViewIdentityProvider(),
            accessibilityProvider: {
                getAriaLabel(element) {
                    if (element.accessibilityInformation) {
                        return element.accessibilityInformation.label;
                    }
                    if (isString(element.tooltip)) {
                        return element.tooltip;
                    }
                    else {
                        if (element.resourceUri && !element.label) {
                            // The custom tree has no good information on what should be used for the aria label.
                            // Allow the tree widget's default aria label to be used.
                            return null;
                        }
                        let buildAriaLabel = '';
                        if (element.label) {
                            const labelText = isMarkdownString(element.label.label) ? element.label.label.value : element.label.label;
                            buildAriaLabel += labelText + ' ';
                        }
                        if (element.description) {
                            buildAriaLabel += element.description;
                        }
                        return buildAriaLabel;
                    }
                },
                getRole(element) {
                    return element.accessibilityInformation?.role ?? 'treeitem';
                },
                getWidgetAriaLabel() {
                    return widgetAriaLabel;
                }
            },
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (item) => {
                    if (item.label) {
                        return isMarkdownString(item.label.label) ? item.label.label.value : item.label.label;
                    }
                    return item.resourceUri ? basename(URI.revive(item.resourceUri)) : undefined;
                }
            },
            expandOnlyOnTwistieClick: (e) => {
                return !!e.command || !!e.checkbox || this.configurationService.getValue('workbench.tree.expandMode') === 'doubleClick';
            },
            collapseByDefault: (e) => {
                return e.collapsibleState !== TreeItemCollapsibleState.Expanded;
            },
            multipleSelectionSupport: this.canSelectMany,
            dnd: this.treeViewDnd,
            overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles
        }));
        this.treeDisposables.add(renderer.onDidChangeMenuContext(e => e.forEach(e => this.tree?.rerender(e))));
        this.treeDisposables.add(this.tree);
        treeMenus.setContextKeyService(this.tree.contextKeyService);
        aligner.tree = this.tree;
        const actionRunner = this.treeDisposables.add(new MultipleSelectionActionRunner(this.notificationService, () => this.tree.getSelection()));
        renderer.actionRunner = actionRunner;
        this.tree.contextKeyService.createKey(this.id, true);
        const customTreeKey = RawCustomTreeViewContextKey.bindTo(this.tree.contextKeyService);
        customTreeKey.set(true);
        this.treeDisposables.add(this.tree.onContextMenu(e => this.onContextMenu(treeMenus, e, actionRunner)));
        this.treeDisposables.add(this.tree.onDidChangeSelection(e => {
            this.lastSelection = e.elements;
            this.lastActive = this.tree?.getFocus()[0] ?? this.lastActive;
            this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
        }));
        this.treeDisposables.add(this.tree.onDidChangeFocus(e => {
            if (e.elements.length && (e.elements[0] !== this.lastActive)) {
                this.lastActive = e.elements[0];
                this.lastSelection = this.tree?.getSelection() ?? this.lastSelection;
                this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
            }
        }));
        this.treeDisposables.add(this.tree.onDidChangeCollapseState(e => {
            if (!e.node.element) {
                return;
            }
            const element = Array.isArray(e.node.element.element) ? e.node.element.element[0] : e.node.element.element;
            if (e.node.collapsed) {
                this._onDidCollapseItem.fire(element);
            }
            else {
                this._onDidExpandItem.fire(element);
            }
        }));
        this.tree.setInput(this.root).then(() => this.updateContentAreas());
        this.treeDisposables.add(this.tree.onDidOpen(async (e) => {
            if (!e.browserEvent) {
                return;
            }
            if (e.browserEvent.target && e.browserEvent.target.classList.contains(TreeItemCheckbox.checkboxClass)) {
                return;
            }
            const selection = this.tree.getSelection();
            const command = await this.resolveCommand(selection.length === 1 ? selection[0] : undefined);
            if (command && isTreeCommandEnabled(command, this.contextKeyService)) {
                let args = command.arguments || [];
                if (command.id === API_OPEN_EDITOR_COMMAND_ID || command.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
                    // Some commands owned by us should receive the
                    // `IOpenEvent` as context to open properly
                    args = [...args, e];
                }
                try {
                    await this.commandService.executeCommand(command.id, ...args);
                }
                catch (err) {
                    this.notificationService.error(err);
                }
            }
        }));
        this.treeDisposables.add(treeMenus.onDidChange((changed) => {
            if (this.tree?.hasNode(changed)) {
                this.tree?.rerender(changed);
            }
        }));
    }
    async resolveCommand(element) {
        let command = element?.command;
        if (element && !command) {
            if ((element instanceof ResolvableTreeItem) && element.hasResolve) {
                await element.resolve(CancellationToken.None);
                command = element.command;
            }
        }
        return command;
    }
    onContextMenu(treeMenus, treeEvent, actionRunner) {
        this.hoverService.hideHover();
        const node = treeEvent.element;
        if (node === null) {
            return;
        }
        const event = treeEvent.browserEvent;
        event.preventDefault();
        event.stopPropagation();
        this.tree.setFocus([node]);
        let selected = this.canSelectMany ? this.getSelection() : [];
        if (!selected.find(item => item.handle === node.handle)) {
            selected = [node];
        }
        const actions = treeMenus.getResourceContextActions(selected);
        if (!actions.length) {
            return;
        }
        this.contextMenuService.showContextMenu({
            getAnchor: () => treeEvent.anchor,
            getActions: () => actions,
            getActionViewItem: (action) => {
                const keybinding = this.keybindingService.lookupKeybinding(action.id);
                if (keybinding) {
                    return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
                }
                return undefined;
            },
            onHide: (wasCancelled) => {
                if (wasCancelled) {
                    this.tree.domFocus();
                }
            },
            getActionsContext: () => ({ $treeViewId: this.id, $treeItemHandle: node.handle }),
            actionRunner
        });
    }
    updateMessage() {
        if (this._message) {
            this.showMessage(this._message);
        }
        else if (!this.dataProvider) {
            this.showMessage(noDataProviderMessage);
        }
        else {
            this.hideMessage();
        }
        this.updateContentAreas();
    }
    processMessage(message, disposables) {
        const lines = message.value.split('\n');
        const result = [];
        let hasFoundButton = false;
        for (const line of lines) {
            const linkedText = parseLinkedText(line);
            if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== 'string') {
                const node = linkedText.nodes[0];
                const buttonContainer = document.createElement('div');
                buttonContainer.classList.add('button-container');
                const button = new Button(buttonContainer, { title: node.title, secondary: hasFoundButton, supportIcons: true, ...defaultButtonStyles });
                button.label = node.label;
                button.onDidClick(_ => {
                    this.openerService.open(node.href, { allowCommands: true });
                }, null, disposables);
                const href = URI.parse(node.href);
                if (href.scheme === Schemas.command) {
                    const preConditions = commandPreconditions(href.path);
                    if (preConditions) {
                        button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
                        disposables.add(this.contextKeyService.onDidChangeContext(e => {
                            if (e.affectsSome(new Set(preConditions.keys()))) {
                                button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
                            }
                        }));
                    }
                }
                disposables.add(button);
                hasFoundButton = true;
                result.push(buttonContainer);
            }
            else {
                hasFoundButton = false;
                const rendered = this.markdownRendererService.render(new MarkdownString(line, { isTrusted: message.isTrusted, supportThemeIcons: message.supportThemeIcons, supportHtml: message.supportHtml }));
                result.push(rendered.element);
                disposables.add(rendered);
            }
        }
        const container = document.createElement('div');
        container.classList.add('rendered-message');
        for (const child of result) {
            if (DOM.isHTMLElement(child)) {
                container.appendChild(child);
            }
            else {
                container.appendChild(child.element);
            }
        }
        return container;
    }
    showMessage(message) {
        if (isRenderedMessageValue(this._messageValue)) {
            this._messageValue.disposables.dispose();
        }
        if (isMarkdownString(message)) {
            const disposables = new DisposableStore();
            const renderedMessage = this.processMessage(message, disposables);
            this._messageValue = { element: renderedMessage, disposables };
        }
        else {
            this._messageValue = message;
        }
        if (!this.messageElement) {
            return;
        }
        this.messageElement.classList.remove('hide');
        this.resetMessageElement();
        if (typeof this._messageValue === 'string' && !isFalsyOrWhitespace(this._messageValue)) {
            this.messageElement.textContent = this._messageValue;
        }
        else if (isRenderedMessageValue(this._messageValue)) {
            this.messageElement.appendChild(this._messageValue.element);
        }
        this.layout(this._height, this._width);
    }
    hideMessage() {
        this.resetMessageElement();
        this.messageElement?.classList.add('hide');
        this.layout(this._height, this._width);
    }
    resetMessageElement() {
        if (this.messageElement) {
            DOM.clearNode(this.messageElement);
        }
    }
    layout(height, width) {
        if (height && width && this.messageElement && this.treeContainer) {
            this._height = height;
            this._width = width;
            const treeHeight = height - DOM.getTotalHeight(this.messageElement);
            this.treeContainer.style.height = treeHeight + 'px';
            this.tree?.layout(treeHeight, width);
        }
    }
    getOptimalWidth() {
        if (this.tree) {
            const parentNode = this.tree.getHTMLElement();
            // eslint-disable-next-line no-restricted-syntax
            const childNodes = [].slice.call(parentNode.querySelectorAll('.outline-item-label > a'));
            return DOM.getLargestChildWidth(parentNode, childNodes);
        }
        return 0;
    }
    updateCheckboxes(elements) {
        return setCascadingCheckboxUpdates(elements);
    }
    async refresh(elements, checkboxes) {
        if (this.dataProvider && this.tree) {
            if (this.refreshing) {
                await Event.toPromise(this._onDidCompleteRefresh.event);
            }
            if (!elements) {
                elements = [this.root];
                // remove all waiting elements to refresh if root is asked to refresh
                this.elementsToRefresh = [];
            }
            for (const element of elements) {
                element.children = undefined; // reset children
            }
            if (this.isVisible) {
                const affectedElements = this.updateCheckboxes(checkboxes ?? []);
                return this.doRefresh(elements.concat(affectedElements));
            }
            else {
                if (this.elementsToRefresh.length) {
                    const seen = new Set();
                    this.elementsToRefresh.forEach(element => seen.add(element.handle));
                    for (const element of elements) {
                        if (!seen.has(element.handle)) {
                            this.elementsToRefresh.push(element);
                        }
                    }
                }
                else {
                    this.elementsToRefresh.push(...elements);
                }
            }
        }
        return undefined;
    }
    async expand(itemOrItems) {
        const tree = this.tree;
        if (!tree) {
            return;
        }
        try {
            itemOrItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
            for (const element of itemOrItems) {
                await tree.expand(element, false);
            }
        }
        catch (e) {
            // The extension could have changed the tree during the reveal.
            // Because of that, we ignore errors.
        }
    }
    isCollapsed(item) {
        return !!this.tree?.isCollapsed(item);
    }
    setSelection(items) {
        this.tree?.setSelection(items);
    }
    getSelection() {
        return this.tree?.getSelection() ?? [];
    }
    setFocus(item) {
        if (this.tree) {
            if (item) {
                this.focus(true, item);
                this.tree.setFocus([item]);
            }
            else if (this.tree.getFocus().length === 0) {
                this.tree.setFocus([]);
            }
        }
    }
    async reveal(item) {
        if (this.tree) {
            return this.tree.reveal(item);
        }
    }
    async doRefresh(elements) {
        const tree = this.tree;
        if (tree && this.visible) {
            this.refreshing = true;
            const oldSelection = tree.getSelection();
            try {
                await Promise.all(elements.map(element => tree.updateChildren(element, true, true)));
            }
            catch (e) {
                // When multiple calls are made to refresh the tree in quick succession,
                // we can get a "Tree element not found" error. This is expected.
                // Ideally this is fixable, so log instead of ignoring so the error is preserved.
                this.logService.error(e);
            }
            const newSelection = tree.getSelection();
            if (oldSelection.length !== newSelection.length || oldSelection.some((value, index) => value.handle !== newSelection[index].handle)) {
                this.lastSelection = newSelection;
                this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
            }
            this.refreshing = false;
            this._onDidCompleteRefresh.fire();
            this.updateContentAreas();
            if (this.focused) {
                this.focus(false);
            }
            this.updateCollapseAllToggle();
        }
    }
    initializeCollapseAllToggle() {
        if (!this.collapseAllToggleContext) {
            this.collapseAllToggleContextKey = new RawContextKey(`treeView.${this.id}.toggleCollapseAll`, false, localize('treeView.toggleCollapseAll', "Whether collapse all is toggled for the tree view with id {0}.", this.id));
            this.collapseAllToggleContext = this.collapseAllToggleContextKey.bindTo(this.contextKeyService);
        }
    }
    updateCollapseAllToggle() {
        if (this.showCollapseAllAction) {
            this.initializeCollapseAllToggle();
            this.collapseAllToggleContext?.set(!!this.root.children && (this.root.children.length > 0) &&
                this.root.children.some(value => value.collapsibleState !== TreeItemCollapsibleState.None));
        }
    }
    updateContentAreas() {
        const isTreeEmpty = !this.root.children || this.root.children.length === 0;
        // Hide tree container only when there is a message and tree is empty and not refreshing
        if (this._messageValue && isTreeEmpty && !this.refreshing && this.treeContainer) {
            // If there's a dnd controller then hiding the tree prevents it from being dragged into.
            if (!this.dragAndDropController) {
                this.treeContainer.classList.add('hide');
            }
            this.domNode.setAttribute('tabindex', '0');
        }
        else if (this.treeContainer) {
            this.treeContainer.classList.remove('hide');
            if (this.domNode === DOM.getActiveElement()) {
                this.focus();
            }
            this.domNode.removeAttribute('tabindex');
        }
    }
    get container() {
        return this._container;
    }
};
AbstractTreeView = __decorate([
    __param(2, IThemeService),
    __param(3, IInstantiationService),
    __param(4, ICommandService),
    __param(5, IConfigurationService),
    __param(6, IProgressService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService),
    __param(9, INotificationService),
    __param(10, IViewDescriptorService),
    __param(11, IHoverService),
    __param(12, IContextKeyService),
    __param(13, IActivityService),
    __param(14, ILogService),
    __param(15, IOpenerService),
    __param(16, IMarkdownRendererService)
], AbstractTreeView);
class TreeViewIdentityProvider {
    getId(element) {
        return element.handle;
    }
}
class TreeViewDelegate {
    getHeight(element) {
        return TreeRenderer.ITEM_HEIGHT;
    }
    getTemplateId(element) {
        return TreeRenderer.TREE_TEMPLATE_ID;
    }
}
async function doGetChildrenOrBatch(dataProvider, nodes) {
    if (dataProvider.getChildrenBatch) {
        return dataProvider.getChildrenBatch(nodes);
    }
    else {
        if (nodes) {
            return Promise.all(nodes.map(node => dataProvider.getChildren(node).then(children => children ?? [])));
        }
        else {
            return [await dataProvider.getChildren()].filter(children => children !== undefined);
        }
    }
}
class TreeDataSource {
    constructor(treeView, withProgress) {
        this.treeView = treeView;
        this.withProgress = withProgress;
    }
    hasChildren(element) {
        return !!this.treeView.dataProvider && (element.collapsibleState !== TreeItemCollapsibleState.None);
    }
    async getChildren(element) {
        const dataProvider = this.treeView.dataProvider;
        if (!dataProvider) {
            return [];
        }
        if (this.batch === undefined) {
            this.batch = [element];
            this.batchPromise = undefined;
        }
        else {
            this.batch.push(element);
        }
        const indexInBatch = this.batch.length - 1;
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                const batch = this.batch;
                this.batch = undefined;
                if (!this.batchPromise) {
                    this.batchPromise = this.withProgress(doGetChildrenOrBatch(dataProvider, batch));
                }
                try {
                    const result = await this.batchPromise;
                    resolve((result && (indexInBatch < result.length)) ? result[indexInBatch] : []);
                }
                catch (e) {
                    if (!e.message.startsWith('Bad progress location:')) {
                        reject(e);
                    }
                }
            }, 0);
        });
    }
}
let TreeRenderer = class TreeRenderer extends Disposable {
    static { TreeRenderer_1 = this; }
    static { this.ITEM_HEIGHT = 22; }
    static { this.TREE_TEMPLATE_ID = 'treeExplorer'; }
    constructor(treeViewId, menus, labels, actionViewItemProvider, aligner, checkboxStateHandler, manuallyManageCheckboxes, themeService, configurationService, labelService, contextKeyService, hoverService, instantiationService) {
        super();
        this.treeViewId = treeViewId;
        this.menus = menus;
        this.labels = labels;
        this.actionViewItemProvider = actionViewItemProvider;
        this.aligner = aligner;
        this.checkboxStateHandler = checkboxStateHandler;
        this.manuallyManageCheckboxes = manuallyManageCheckboxes;
        this.themeService = themeService;
        this.configurationService = configurationService;
        this.labelService = labelService;
        this.contextKeyService = contextKeyService;
        this.hoverService = hoverService;
        this._onDidChangeCheckboxState = this._register(new Emitter());
        this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
        this._onDidChangeMenuContext = this._register(new Emitter());
        this.onDidChangeMenuContext = this._onDidChangeMenuContext.event;
        this._hasCheckbox = false;
        this._renderedElements = new Map(); // tree item handle to template data
        this._hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'mouse', undefined, {}));
        this._register(this.themeService.onDidFileIconThemeChange(() => this.rerender()));
        this._register(this.themeService.onDidColorThemeChange(() => this.rerender()));
        this._register(checkboxStateHandler.onDidChangeCheckboxState(items => {
            this.updateCheckboxes(items);
        }));
        this._register(this.contextKeyService.onDidChangeContext(e => this.onDidChangeContext(e)));
    }
    get templateId() {
        return TreeRenderer_1.TREE_TEMPLATE_ID;
    }
    set actionRunner(actionRunner) {
        this._actionRunner = actionRunner;
    }
    renderTemplate(container) {
        container.classList.add('custom-view-tree-node-item');
        const checkboxContainer = DOM.append(container, DOM.$(''));
        const resourceLabel = this.labels.create(container, { supportHighlights: true, hoverDelegate: this._hoverDelegate });
        const icon = DOM.prepend(resourceLabel.element, DOM.$('.custom-view-tree-node-item-icon'));
        const actionsContainer = DOM.append(resourceLabel.element, DOM.$('.actions'));
        const actionBar = new ActionBar(actionsContainer, {
            actionViewItemProvider: this.actionViewItemProvider
        });
        return { resourceLabel, icon, checkboxContainer, actionBar, container };
    }
    getHover(label, resource, node) {
        if (!(node instanceof ResolvableTreeItem) || !node.hasResolve) {
            if (resource && !node.tooltip) {
                return undefined;
            }
            else if (node.tooltip === undefined) {
                if (isMarkdownString(label)) {
                    return { markdown: label, markdownNotSupportedFallback: label.value };
                }
                else {
                    return label;
                }
            }
            else if (!isString(node.tooltip)) {
                return { markdown: node.tooltip, markdownNotSupportedFallback: resource ? undefined : renderAsPlaintext(node.tooltip) }; // Passing undefined as the fallback for a resource falls back to the old native hover
            }
            else if (node.tooltip !== '') {
                return node.tooltip;
            }
            else {
                return undefined;
            }
        }
        return {
            markdown: typeof node.tooltip === 'string' ? node.tooltip :
                (token) => {
                    return new Promise((resolve) => {
                        node.resolve(token).then(() => resolve(node.tooltip));
                    });
                },
            markdownNotSupportedFallback: resource ? undefined : (label ? (isMarkdownString(label) ? label.value : label) : '') // Passing undefined as the fallback for a resource falls back to the old native hover
        };
    }
    processLabel(label, matches) {
        if (!isMarkdownString(label)) {
            return { label };
        }
        let text = label.value.trim();
        let bold = false;
        let italic = false;
        let strikethrough = false;
        function moveMatches(offset) {
            if (matches) {
                for (const match of matches) {
                    match.start -= offset;
                    match.end -= offset;
                }
            }
        }
        const syntaxes = [
            { open: '~~', close: '~~', mark: () => { strikethrough = true; } },
            { open: '**', close: '**', mark: () => { bold = true; } },
            { open: '*', close: '*', mark: () => { italic = true; } },
            { open: '_', close: '_', mark: () => { italic = true; } }
        ];
        function checkSyntaxes() {
            let didChange = false;
            for (const syntax of syntaxes) {
                if (text.startsWith(syntax.open) && text.endsWith(syntax.close)) {
                    // If there is a match within the markers, stop processing
                    if (matches?.some(match => match.start < syntax.open.length || match.end > text.length - syntax.close.length)) {
                        return false;
                    }
                    syntax.mark();
                    text = text.substring(syntax.open.length, text.length - syntax.close.length);
                    moveMatches(syntax.open.length);
                    didChange = true;
                }
            }
            return didChange;
        }
        // Arbitrary max # of iterations
        for (let i = 0; i < 10; i++) {
            if (!checkSyntaxes()) {
                break;
            }
        }
        return {
            label: text,
            bold,
            italic,
            strikethrough,
            supportIcons: label.supportThemeIcons
        };
    }
    renderElement(element, index, templateData) {
        const node = element.element;
        const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
        const treeItemLabel = node.label ? node.label : (resource ? { label: basename(resource) } : undefined);
        const description = isString(node.description) ? node.description : resource && node.description === true ? this.labelService.getUriLabel(dirname(resource), { relative: true }) : undefined;
        const labelStr = treeItemLabel ? isMarkdownString(treeItemLabel.label) ? treeItemLabel.label.value : treeItemLabel.label : undefined;
        const matches = (treeItemLabel?.highlights && labelStr) ? treeItemLabel.highlights.map(([start, end]) => {
            if (start < 0) {
                start = labelStr.length + start;
            }
            if (end < 0) {
                end = labelStr.length + end;
            }
            if ((start >= labelStr.length) || (end > labelStr.length)) {
                return ({ start: 0, end: 0 });
            }
            if (start > end) {
                const swap = start;
                start = end;
                end = swap;
            }
            return ({ start, end });
        }) : undefined;
        const { label, bold, italic, strikethrough, supportIcons } = this.processLabel(treeItemLabel?.label, matches);
        const icon = !isDark(this.themeService.getColorTheme().type) ? node.icon : node.iconDark;
        const iconUrl = icon ? URI.revive(icon) : undefined;
        const title = this.getHover(treeItemLabel?.label, resource, node);
        // reset
        templateData.actionBar.clear();
        templateData.icon.style.color = '';
        let commandEnabled = true;
        if (node.command) {
            commandEnabled = isTreeCommandEnabled(node.command, this.contextKeyService);
        }
        this.renderCheckbox(node, templateData);
        if (resource) {
            const fileDecorations = this.configurationService.getValue('explorer.decorations');
            const labelResource = resource ? resource : URI.parse('missing:_icon_resource');
            templateData.resourceLabel.setResource({ name: label, description, resource: labelResource }, {
                fileKind: this.getFileKind(node),
                title,
                hideIcon: this.shouldHideResourceLabelIcon(iconUrl, node.themeIcon),
                fileDecorations,
                extraClasses: ['custom-view-tree-node-item-resourceLabel'],
                matches: matches ? matches : createMatches(element.filterData),
                bold,
                italic,
                strikethrough,
                disabledCommand: !commandEnabled,
                labelEscapeNewLines: true,
                forceLabel: !!node.label,
                supportIcons
            });
        }
        else {
            templateData.resourceLabel.setResource({ name: label, description }, {
                title,
                hideIcon: true,
                extraClasses: ['custom-view-tree-node-item-resourceLabel'],
                matches: matches ? matches : createMatches(element.filterData),
                bold,
                italic,
                strikethrough,
                disabledCommand: !commandEnabled,
                labelEscapeNewLines: true,
                supportIcons
            });
        }
        if (iconUrl) {
            templateData.icon.className = 'custom-view-tree-node-item-icon';
            templateData.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
        }
        else {
            let iconClass;
            if (this.shouldShowThemeIcon(!!resource, node.themeIcon)) {
                iconClass = ThemeIcon.asClassName(node.themeIcon);
                if (node.themeIcon.color) {
                    templateData.icon.style.color = this.themeService.getColorTheme().getColor(node.themeIcon.color.id)?.toString() ?? '';
                }
            }
            templateData.icon.className = iconClass ? `custom-view-tree-node-item-icon ${iconClass}` : '';
            templateData.icon.style.backgroundImage = '';
        }
        if (!commandEnabled) {
            templateData.icon.className = templateData.icon.className + ' disabled';
            if (templateData.container.parentElement) {
                templateData.container.parentElement.className = templateData.container.parentElement.className + ' disabled';
            }
        }
        templateData.actionBar.context = { $treeViewId: this.treeViewId, $treeItemHandle: node.handle };
        const menuActions = this.menus.getResourceActions([node]);
        templateData.actionBar.push(menuActions, { icon: true, label: false });
        if (this._actionRunner) {
            templateData.actionBar.actionRunner = this._actionRunner;
        }
        this.setAlignment(templateData.container, node);
        // remember rendered element, an element can be rendered multiple times
        const renderedItems = this._renderedElements.get(element.element.handle) ?? [];
        this._renderedElements.set(element.element.handle, [...renderedItems, { original: element, rendered: templateData }]);
    }
    rerender() {
        // As we add items to the map during this call we can't directly use the map in the for loop
        // but have to create a copy of the keys first
        const keys = new Set(this._renderedElements.keys());
        for (const key of keys) {
            const values = this._renderedElements.get(key) ?? [];
            for (const value of values) {
                this.disposeElement(value.original, 0, value.rendered);
                this.renderElement(value.original, 0, value.rendered);
            }
        }
    }
    renderCheckbox(node, templateData) {
        if (node.checkbox) {
            // The first time we find a checkbox we want to rerender the visible tree to adapt the alignment
            if (!this._hasCheckbox) {
                this._hasCheckbox = true;
                this.rerender();
            }
            if (!templateData.checkbox) {
                const checkbox = new TreeItemCheckbox(templateData.checkboxContainer, this.checkboxStateHandler, this._hoverDelegate, this.hoverService);
                templateData.checkbox = checkbox;
            }
            templateData.checkbox.render(node);
        }
        else if (templateData.checkbox) {
            templateData.checkbox.dispose();
            templateData.checkbox = undefined;
        }
    }
    setAlignment(container, treeItem) {
        container.parentElement.classList.toggle('align-icon-with-twisty', this.aligner.alignIconWithTwisty(treeItem));
    }
    shouldHideResourceLabelIcon(iconUrl, icon) {
        // We always hide the resource label in favor of the iconUrl when it's provided.
        // When `ThemeIcon` is provided, we hide the resource label icon in favor of it only if it's a not a file icon.
        return (!!iconUrl || (!!icon && !this.isFileKindThemeIcon(icon)));
    }
    shouldShowThemeIcon(hasResource, icon) {
        if (!icon) {
            return false;
        }
        // If there's a resource and the icon is a file icon, then the icon (or lack thereof) will already be coming from the
        // icon theme and should use whatever the icon theme has provided.
        return !(hasResource && this.isFileKindThemeIcon(icon));
    }
    isFileKindThemeIcon(icon) {
        return ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon);
    }
    getFileKind(node) {
        if (node.themeIcon) {
            switch (node.themeIcon.id) {
                case FileThemeIcon.id:
                    return FileKind.FILE;
                case FolderThemeIcon.id:
                    return FileKind.FOLDER;
            }
        }
        return node.collapsibleState === TreeItemCollapsibleState.Collapsed || node.collapsibleState === TreeItemCollapsibleState.Expanded ? FileKind.FOLDER : FileKind.FILE;
    }
    onDidChangeContext(e) {
        const affectsEntireMenuContexts = e.affectsSome(this.menus.getEntireMenuContexts());
        const items = [];
        for (const [_, elements] of this._renderedElements) {
            for (const element of elements) {
                if (affectsEntireMenuContexts || e.affectsSome(this.menus.getElementOverlayContexts(element.original.element))) {
                    items.push(element.original.element);
                }
            }
        }
        if (items.length) {
            this._onDidChangeMenuContext.fire(items);
        }
    }
    updateCheckboxes(items) {
        let allItems = [];
        if (!this.manuallyManageCheckboxes()) {
            allItems = setCascadingCheckboxUpdates(items);
        }
        else {
            allItems = items;
        }
        allItems.forEach(item => {
            const renderedItems = this._renderedElements.get(item.handle);
            if (renderedItems) {
                renderedItems.forEach(renderedItems => renderedItems.rendered.checkbox?.render(item));
            }
        });
        this._onDidChangeCheckboxState.fire(allItems);
    }
    disposeElement(resource, index, templateData) {
        const itemRenders = this._renderedElements.get(resource.element.handle) ?? [];
        const renderedIndex = itemRenders.findIndex(renderedItem => templateData === renderedItem.rendered);
        if (itemRenders.length === 1) {
            this._renderedElements.delete(resource.element.handle);
        }
        else if (itemRenders.length > 0) {
            itemRenders.splice(renderedIndex, 1);
        }
        templateData.checkbox?.dispose();
        templateData.checkbox = undefined;
    }
    disposeTemplate(templateData) {
        templateData.resourceLabel.dispose();
        templateData.actionBar.dispose();
    }
};
TreeRenderer = TreeRenderer_1 = __decorate([
    __param(7, IThemeService),
    __param(8, IConfigurationService),
    __param(9, ILabelService),
    __param(10, IContextKeyService),
    __param(11, IHoverService),
    __param(12, IInstantiationService)
], TreeRenderer);
class Aligner extends Disposable {
    constructor(themeService, logService) {
        super();
        this.themeService = themeService;
        this.logService = logService;
    }
    set tree(tree) {
        this._tree = tree;
    }
    alignIconWithTwisty(treeItem) {
        if (treeItem.collapsibleState !== TreeItemCollapsibleState.None) {
            return false;
        }
        if (!this.hasIconOrCheckbox(treeItem)) {
            return false;
        }
        if (this._tree) {
            const root = this._tree.getInput();
            let parent;
            try {
                parent = this._tree.getParentElement(treeItem) || root;
            }
            catch (error) {
                this.logService.error(`[TreeView] Failed to resolve parent for ${treeItem.handle}`, error);
                return false;
            }
            if (this.hasIconOrCheckbox(parent)) {
                return !!parent.children && parent.children.some(c => c.collapsibleState !== TreeItemCollapsibleState.None && !this.hasIconOrCheckbox(c));
            }
            return !!parent.children && parent.children.every(c => c.collapsibleState === TreeItemCollapsibleState.None || !this.hasIconOrCheckbox(c));
        }
        else {
            return false;
        }
    }
    hasIconOrCheckbox(node) {
        return this.hasIcon(node) || !!node.checkbox;
    }
    hasIcon(node) {
        const icon = !isDark(this.themeService.getColorTheme().type) ? node.icon : node.iconDark;
        if (icon) {
            return true;
        }
        if (node.resourceUri || node.themeIcon) {
            const fileIconTheme = this.themeService.getFileIconTheme();
            const isFolder = node.themeIcon ? node.themeIcon.id === FolderThemeIcon.id : node.collapsibleState !== TreeItemCollapsibleState.None;
            if (isFolder) {
                return fileIconTheme.hasFileIcons && fileIconTheme.hasFolderIcons;
            }
            return fileIconTheme.hasFileIcons;
        }
        return false;
    }
}
class MultipleSelectionActionRunner extends ActionRunner {
    constructor(notificationService, getSelectedResources) {
        super();
        this.getSelectedResources = getSelectedResources;
        this._register(this.onDidRun(e => {
            if (e.error && !isCancellationError(e.error)) {
                notificationService.error(localize('command-error', 'Error running command {1}: {0}. This is likely caused by the extension that contributes {1}.', e.error.message, e.action.id));
            }
        }));
    }
    async runAction(action, context) {
        const selection = this.getSelectedResources();
        let selectionHandleArgs = undefined;
        let actionInSelected = false;
        if (selection.length > 1) {
            selectionHandleArgs = selection.map(selected => {
                if ((selected.handle === context.$treeItemHandle) || context.$selectedTreeItems) {
                    actionInSelected = true;
                }
                return { $treeViewId: context.$treeViewId, $treeItemHandle: selected.handle };
            });
        }
        if (!actionInSelected && selectionHandleArgs) {
            selectionHandleArgs = undefined;
        }
        await action.run(context, selectionHandleArgs);
    }
}
let TreeMenus = class TreeMenus {
    constructor(id, menuService) {
        this.id = id;
        this.menuService = menuService;
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
    }
    /**
     * Gets only the actions that apply to all of the given elements.
     */
    getResourceActions(elements) {
        const actions = this.getActions(this.getMenuId(), elements);
        return actions.primary;
    }
    /**
     * Gets only the actions that apply to all of the given elements.
     */
    getResourceContextActions(elements) {
        return this.getActions(this.getMenuId(), elements).secondary;
    }
    setContextKeyService(service) {
        this.contextKeyService = service;
    }
    filterNonUniversalActions(groups, newActions) {
        const newActionsSet = new Set(newActions.map(a => a.id));
        for (const group of groups) {
            const actions = group.keys();
            for (const action of actions) {
                if (!newActionsSet.has(action)) {
                    group.delete(action);
                }
            }
        }
    }
    buildMenu(groups) {
        const result = [];
        for (const group of groups) {
            if (group.size > 0) {
                if (result.length) {
                    result.push(new Separator());
                }
                result.push(...group.values());
            }
        }
        return result;
    }
    createGroups(actions) {
        const groups = [];
        let group = new Map();
        for (const action of actions) {
            if (action instanceof Separator) {
                groups.push(group);
                group = new Map();
            }
            else {
                group.set(action.id, action);
            }
        }
        groups.push(group);
        return groups;
    }
    getElementOverlayContexts(element) {
        return new Map([
            ['view', this.id],
            ['viewItem', element.contextValue]
        ]);
    }
    getEntireMenuContexts() {
        return this.menuService.getMenuContexts(this.getMenuId());
    }
    getMenuId() {
        return MenuId.ViewItemContext;
    }
    getActions(menuId, elements) {
        if (!this.contextKeyService) {
            return { primary: [], secondary: [] };
        }
        let primaryGroups = [];
        let secondaryGroups = [];
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const contextKeyService = this.contextKeyService.createOverlay(this.getElementOverlayContexts(element));
            const menuData = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
            const result = getContextMenuActions(menuData, 'inline');
            if (i === 0) {
                primaryGroups = this.createGroups(result.primary);
                secondaryGroups = this.createGroups(result.secondary);
            }
            else {
                this.filterNonUniversalActions(primaryGroups, result.primary);
                this.filterNonUniversalActions(secondaryGroups, result.secondary);
            }
        }
        return { primary: this.buildMenu(primaryGroups), secondary: this.buildMenu(secondaryGroups) };
    }
    dispose() {
        this.contextKeyService = undefined;
        this._onDidChange.dispose();
    }
};
TreeMenus = __decorate([
    __param(1, IMenuService)
], TreeMenus);
let CustomTreeView = class CustomTreeView extends AbstractTreeView {
    constructor(id, title, extensionId, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, contextKeyService, hoverService, extensionService, activityService, telemetryService, logService, openerService, markdownRendererService) {
        super(id, title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService, openerService, markdownRendererService);
        this.extensionId = extensionId;
        this.extensionService = extensionService;
        this.telemetryService = telemetryService;
    }
    activate() {
        if (!this.activated) {
            this.telemetryService.publicLog2('Extension:ViewActivate', {
                extensionId: new TelemetryTrustedValue(this.extensionId),
                id: this.id,
            });
            this.createTree();
            this.progressService.withProgress({ location: this.id }, () => this.extensionService.activateByEvent(`onView:${this.id}`))
                .then(() => timeout(2000))
                .then(() => {
                this.updateMessage();
            });
            this.activated = true;
        }
    }
};
CustomTreeView = __decorate([
    __param(3, IThemeService),
    __param(4, IInstantiationService),
    __param(5, ICommandService),
    __param(6, IConfigurationService),
    __param(7, IProgressService),
    __param(8, IContextMenuService),
    __param(9, IKeybindingService),
    __param(10, INotificationService),
    __param(11, IViewDescriptorService),
    __param(12, IContextKeyService),
    __param(13, IHoverService),
    __param(14, IExtensionService),
    __param(15, IActivityService),
    __param(16, ITelemetryService),
    __param(17, ILogService),
    __param(18, IOpenerService),
    __param(19, IMarkdownRendererService)
], CustomTreeView);
export { CustomTreeView };
export class TreeView extends AbstractTreeView {
    activate() {
        if (!this.activated) {
            this.createTree();
            this.activated = true;
        }
    }
}
let CustomTreeViewDragAndDrop = class CustomTreeViewDragAndDrop {
    constructor(treeId, labelService, instantiationService, treeViewsDragAndDropService, logService) {
        this.treeId = treeId;
        this.labelService = labelService;
        this.instantiationService = instantiationService;
        this.treeViewsDragAndDropService = treeViewsDragAndDropService;
        this.logService = logService;
        this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
        this.treeMimeType = `application/vnd.code.tree.${treeId.toLowerCase()}`;
    }
    set controller(controller) {
        this.dndController = controller;
    }
    handleDragAndLog(dndController, itemHandles, uuid, dragCancellationToken) {
        return dndController.handleDrag(itemHandles, uuid, dragCancellationToken).then(additionalDataTransfer => {
            if (additionalDataTransfer) {
                const unlistedTypes = [];
                for (const item of additionalDataTransfer) {
                    if ((item[0] !== this.treeMimeType) && (dndController.dragMimeTypes.findIndex(value => value === item[0]) < 0)) {
                        unlistedTypes.push(item[0]);
                    }
                }
                if (unlistedTypes.length) {
                    this.logService.warn(`Drag and drop controller for tree ${this.treeId} adds the following data transfer types but does not declare them in dragMimeTypes: ${unlistedTypes.join(', ')}`);
                }
            }
            return additionalDataTransfer;
        });
    }
    addExtensionProvidedTransferTypes(originalEvent, itemHandles) {
        if (!originalEvent.dataTransfer || !this.dndController) {
            return;
        }
        const uuid = generateUuid();
        this.dragCancellationToken = new CancellationTokenSource();
        this.treeViewsDragAndDropService.addDragOperationTransfer(uuid, this.handleDragAndLog(this.dndController, itemHandles, uuid, this.dragCancellationToken.token));
        this.treeItemsTransfer.setData([new DraggedTreeItemsIdentifier(uuid)], DraggedTreeItemsIdentifier.prototype);
        originalEvent.dataTransfer.clearData(Mimes.text);
        if (this.dndController.dragMimeTypes.find((element) => element === Mimes.uriList)) {
            // Add the type that the editor knows
            originalEvent.dataTransfer?.setData(DataTransfers.RESOURCES, '');
        }
        this.dndController.dragMimeTypes.forEach(supportedType => {
            originalEvent.dataTransfer?.setData(supportedType, '');
        });
    }
    addResourceInfoToTransfer(originalEvent, resources) {
        if (resources.length && originalEvent.dataTransfer) {
            // Apply some datatransfer types to allow for dragging the element outside of the application
            this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, resources, originalEvent));
            // The only custom data transfer we set from the explorer is a file transfer
            // to be able to DND between multiple code file explorers across windows
            const fileResources = resources.filter(s => s.scheme === Schemas.file).map(r => r.fsPath);
            if (fileResources.length) {
                originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
            }
        }
    }
    onDragStart(data, originalEvent) {
        if (originalEvent.dataTransfer) {
            const treeItemsData = data.getData();
            const resources = [];
            const sourceInfo = {
                id: this.treeId,
                itemHandles: []
            };
            treeItemsData.forEach(item => {
                sourceInfo.itemHandles.push(item.handle);
                if (item.resourceUri) {
                    resources.push(URI.revive(item.resourceUri));
                }
            });
            this.addResourceInfoToTransfer(originalEvent, resources);
            this.addExtensionProvidedTransferTypes(originalEvent, sourceInfo.itemHandles);
            originalEvent.dataTransfer.setData(this.treeMimeType, JSON.stringify(sourceInfo));
        }
    }
    debugLog(types) {
        if (types.size) {
            this.logService.debug(`TreeView dragged mime types: ${Array.from(types).join(', ')}`);
        }
        else {
            this.logService.debug(`TreeView dragged with no supported mime types.`);
        }
    }
    onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
        const dataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer);
        const types = new Set(Array.from(dataTransfer, x => x[0]));
        if (originalEvent.dataTransfer) {
            // Also add uri-list if we have any files. At this stage we can't actually access the file itself though.
            for (const item of originalEvent.dataTransfer.items) {
                if (item.kind === 'file' || item.type === DataTransfers.RESOURCES.toLowerCase()) {
                    types.add(Mimes.uriList);
                    break;
                }
            }
        }
        this.debugLog(types);
        const dndController = this.dndController;
        if (!dndController || !originalEvent.dataTransfer || (dndController.dropMimeTypes.length === 0)) {
            return false;
        }
        const dragContainersSupportedType = Array.from(types).some((value, index) => {
            if (value === this.treeMimeType) {
                return true;
            }
            else {
                return dndController.dropMimeTypes.indexOf(value) >= 0;
            }
        });
        if (dragContainersSupportedType) {
            return { accept: true, bubble: 0 /* TreeDragOverBubble.Down */, autoExpand: true };
        }
        return false;
    }
    getDragURI(element) {
        if (!this.dndController) {
            return null;
        }
        return element.resourceUri ? URI.revive(element.resourceUri).toString() : element.handle;
    }
    getDragLabel(elements) {
        if (!this.dndController) {
            return undefined;
        }
        if (elements.length > 1) {
            return String(elements.length);
        }
        const element = elements[0];
        if (element.label) {
            return isMarkdownString(element.label.label) ? element.label.label.value : element.label.label;
        }
        return element.resourceUri ? this.labelService.getUriLabel(URI.revive(element.resourceUri)) : undefined;
    }
    async drop(data, targetNode, targetIndex, targetSector, originalEvent) {
        const dndController = this.dndController;
        if (!originalEvent.dataTransfer || !dndController) {
            return;
        }
        let treeSourceInfo;
        let willDropUuid;
        if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
            willDropUuid = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype)[0].identifier;
        }
        const originalDataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer, true);
        const outDataTransfer = new VSDataTransfer();
        for (const [type, item] of originalDataTransfer) {
            if (type === this.treeMimeType || dndController.dropMimeTypes.includes(type) || (item.asFile() && dndController.dropMimeTypes.includes(DataTransfers.FILES.toLowerCase()))) {
                outDataTransfer.append(type, item);
                if (type === this.treeMimeType) {
                    try {
                        treeSourceInfo = JSON.parse(await item.asString());
                    }
                    catch {
                        // noop
                    }
                }
            }
        }
        const additionalDataTransfer = await this.treeViewsDragAndDropService.removeDragOperationTransfer(willDropUuid);
        if (additionalDataTransfer) {
            for (const [type, item] of additionalDataTransfer) {
                outDataTransfer.append(type, item);
            }
        }
        return dndController.handleDrop(outDataTransfer, targetNode, CancellationToken.None, willDropUuid, treeSourceInfo?.id, treeSourceInfo?.itemHandles);
    }
    onDragEnd(originalEvent) {
        // Check if the drag was cancelled.
        if (originalEvent.dataTransfer?.dropEffect === 'none') {
            this.dragCancellationToken?.cancel();
        }
    }
    dispose() { }
};
CustomTreeViewDragAndDrop = __decorate([
    __param(1, ILabelService),
    __param(2, IInstantiationService),
    __param(3, ITreeViewsDnDService),
    __param(4, ILogService)
], CustomTreeViewDragAndDrop);
export { CustomTreeViewDragAndDrop };
function setCascadingCheckboxUpdates(items) {
    const additionalItems = [];
    for (const item of items) {
        if (item.checkbox !== undefined) {
            const checkChildren = (currentItem) => {
                for (const child of (currentItem.children ?? [])) {
                    if ((child.checkbox !== undefined) && (currentItem.checkbox !== undefined) && (child.checkbox.isChecked !== currentItem.checkbox.isChecked)) {
                        child.checkbox.isChecked = currentItem.checkbox.isChecked;
                        additionalItems.push(child);
                        checkChildren(child);
                    }
                }
            };
            checkChildren(item);
            const visitedParents = new Set();
            const checkParents = (currentItem) => {
                if (currentItem.parent?.checkbox !== undefined && currentItem.parent.children) {
                    if (visitedParents.has(currentItem.parent)) {
                        return;
                    }
                    else {
                        visitedParents.add(currentItem.parent);
                    }
                    let someUnchecked = false;
                    let someChecked = false;
                    for (const child of currentItem.parent.children) {
                        if (someUnchecked && someChecked) {
                            break;
                        }
                        if (child.checkbox !== undefined) {
                            if (child.checkbox.isChecked) {
                                someChecked = true;
                            }
                            else {
                                someUnchecked = true;
                            }
                        }
                    }
                    if (someChecked && !someUnchecked && (currentItem.parent.checkbox.isChecked !== true)) {
                        currentItem.parent.checkbox.isChecked = true;
                        additionalItems.push(currentItem.parent);
                        checkParents(currentItem.parent);
                    }
                    else if (someUnchecked && (currentItem.parent.checkbox.isChecked !== false)) {
                        currentItem.parent.checkbox.isChecked = false;
                        additionalItems.push(currentItem.parent);
                        checkParents(currentItem.parent);
                    }
                }
            };
            checkParents(item);
        }
    }
    return items.concat(additionalItems);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy92aWV3cy90cmVlVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBb0IsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRixPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sS0FBSyxLQUFLLE1BQU0sc0NBQXNDLENBQUM7QUFDOUQsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxTQUFTLEVBQTJCLE1BQU0sb0RBQW9ELENBQUM7QUFDeEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBSzFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxZQUFZLEVBQVcsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxhQUFhLEVBQWMsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRSxPQUFPLEVBQW1CLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzNHLE9BQU8sRUFB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