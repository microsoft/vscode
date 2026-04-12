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
var HistoryItemRenderer_1, HistoryItemChangeRenderer_1, HistoryItemLoadMoreRenderer_1;
import './media/scm.css';
import { $, append, h, reset } from '../../../../base/browser/dom.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { createMatches } from '../../../../base/common/filters.js';
import { combinedDisposable, Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue, waitForState, constObservable, latestChangedValue, observableFromEvent, runOnChange, observableSignal } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { asCssVariable, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewAction, ViewPane, ViewPaneShowActions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { renderSCMHistoryItemGraph, toISCMHistoryItemViewModelArray, SWIMLANE_WIDTH, renderSCMHistoryGraphPlaceholder, historyItemHoverLabelForeground, historyItemHoverDefaultLabelBackground, getHistoryItemIndex, toHistoryItemHoverContent } from './scmHistory.js';
import { getHistoryItemEditorTitle, getProviderKey, isSCMHistoryItemChangeNode, isSCMHistoryItemChangeViewModelTreeElement, isSCMHistoryItemLoadMoreTreeElement, isSCMHistoryItemViewModelTreeElement, isSCMRepository } from './util.js';
import { SCMIncomingHistoryItemId, SCMOutgoingHistoryItemId } from '../common/history.js';
import { HISTORY_VIEW_PANE_ID, ISCMService, ISCMViewService } from '../common/scm.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Action2, IMenuService, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Sequencer, Throttler } from '../../../../base/common/async.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { delta, groupBy } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { ContextKeys } from './scmViewPane.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { clamp } from '../../../../base/common/numbers.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { compare } from '../../../../base/common/strings.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { groupBy as groupBy2 } from '../../../../base/common/collections.js';
import { getActionBarActions, getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { basename } from '../../../../base/common/path.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ScmHistoryItemResolver } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { URI } from '../../../../base/common/uri.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { CodeDataTransfers } from '../../../../platform/dnd/browser/dnd.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
const PICK_REPOSITORY_ACTION_ID = 'workbench.scm.action.graph.pickRepository';
const PICK_HISTORY_ITEM_REFS_ACTION_ID = 'workbench.scm.action.graph.pickHistoryItemRefs';
class SCMRepositoryActionViewItem extends ActionViewItem {
    constructor(_repository, action, options) {
        super(null, action, { ...options, icon: false, label: true });
        this._repository = _repository;
    }
    updateLabel() {
        if (this.options.label && this.label) {
            this.label.classList.add('scm-graph-repository-picker');
            const icon = $('.icon');
            const iconClassNameArray = ThemeIcon.isThemeIcon(this._repository.provider.iconPath)
                ? ThemeIcon.asClassNameArray(this._repository.provider.iconPath)
                : ThemeIcon.asClassNameArray(Codicon.repo);
            icon.classList.add(...iconClassNameArray);
            const name = $('.name');
            name.textContent = this._repository.provider.name;
            reset(this.label, icon, name);
        }
    }
    getTooltip() {
        return this._repository.provider.name;
    }
}
class SCMHistoryItemRefsActionViewItem extends ActionViewItem {
    constructor(_repository, _historyItemsFilter, action, options) {
        super(null, action, { ...options, icon: false, label: true });
        this._repository = _repository;
        this._historyItemsFilter = _historyItemsFilter;
    }
    updateLabel() {
        if (this.options.label && this.label) {
            this.label.classList.add('scm-graph-history-item-picker');
            const icon = $('.icon');
            icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitBranch));
            const name = $('.name');
            if (this._historyItemsFilter === 'all') {
                name.textContent = localize('all', "All");
            }
            else if (this._historyItemsFilter === 'auto') {
                name.textContent = localize('auto', "Auto");
            }
            else if (this._historyItemsFilter.length === 1) {
                name.textContent = this._historyItemsFilter[0].name;
            }
            else {
                name.textContent = localize('items', "{0} Items", this._historyItemsFilter.length);
            }
            reset(this.label, icon, name);
        }
    }
    getTooltip() {
        if (this._historyItemsFilter === 'all') {
            return localize('allHistoryItemRefs', "All history item references");
        }
        else if (this._historyItemsFilter === 'auto') {
            const historyProvider = this._repository.provider.historyProvider.get();
            return [
                historyProvider?.historyItemRef.get()?.name,
                historyProvider?.historyItemRemoteRef.get()?.name,
                historyProvider?.historyItemBaseRef.get()?.name
            ].filter(ref => !!ref).join(', ');
        }
        else if (this._historyItemsFilter.length === 1) {
            return this._historyItemsFilter[0].name;
        }
        else {
            return this._historyItemsFilter.map(ref => ref.name).join(', ');
        }
    }
}
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: PICK_REPOSITORY_ACTION_ID,
            title: localize('repositoryPicker', "Repository Picker"),
            viewId: HISTORY_VIEW_PANE_ID,
            f1: false,
            menu: {
                id: MenuId.SCMHistoryTitle,
                when: ContextKeyExpr.and(ContextKeyExpr.has('scm.providerCount'), ContextKeyExpr.greater('scm.providerCount', 1), ContextKeyExpr.equals('config.scm.repositories.selectionMode', 'multiple')),
                group: 'navigation',
                order: 0
            }
        });
    }
    async runInView(_, view) {
        view.pickRepository();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: PICK_HISTORY_ITEM_REFS_ACTION_ID,
            title: localize('referencePicker', "History Item Reference Picker"),
            icon: Codicon.gitBranch,
            viewId: HISTORY_VIEW_PANE_ID,
            precondition: ContextKeys.SCMHistoryItemCount.notEqualsTo(0),
            f1: false,
            menu: {
                id: MenuId.SCMHistoryTitle,
                group: 'navigation',
                order: 1
            }
        });
    }
    async runInView(_, view) {
        view.pickHistoryItemRef();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.revealCurrentHistoryItem',
            title: localize('goToCurrentHistoryItem', "Go to Current History Item"),
            icon: Codicon.target,
            viewId: HISTORY_VIEW_PANE_ID,
            precondition: ContextKeyExpr.and(ContextKeys.SCMHistoryItemCount.notEqualsTo(0), ContextKeys.SCMCurrentHistoryItemRefInFilter.isEqualTo(true)),
            f1: false,
            menu: {
                id: MenuId.SCMHistoryTitle,
                group: 'navigation',
                order: 2
            }
        });
    }
    async runInView(_, view) {
        view.revealCurrentHistoryItem();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.refresh',
            title: localize('refreshGraph', "Refresh"),
            viewId: HISTORY_VIEW_PANE_ID,
            f1: false,
            icon: Codicon.refresh,
            menu: {
                id: MenuId.SCMHistoryTitle,
                group: 'navigation',
                order: 1000
            }
        });
    }
    async runInView(_, view) {
        view.refresh();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.setListViewMode',
            title: localize('setListViewMode', "View as List"),
            viewId: HISTORY_VIEW_PANE_ID,
            toggled: ContextKeys.SCMHistoryViewMode.isEqualTo("list" /* ViewMode.List */),
            menu: { id: MenuId.SCMHistoryTitle, group: '9_viewmode', order: 1 },
            f1: false
        });
    }
    async runInView(_, view) {
        view.setViewMode("list" /* ViewMode.List */);
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.setTreeViewMode',
            title: localize('setTreeViewMode', "View as Tree"),
            viewId: HISTORY_VIEW_PANE_ID,
            toggled: ContextKeys.SCMHistoryViewMode.isEqualTo("tree" /* ViewMode.Tree */),
            menu: { id: MenuId.SCMHistoryTitle, group: '9_viewmode', order: 2 },
            f1: false
        });
    }
    async runInView(_, view) {
        view.setViewMode("tree" /* ViewMode.Tree */);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.viewChanges',
            title: localize('openChanges', "Open Changes"),
            icon: Codicon.diffMultiple,
            f1: false,
            menu: [
                {
                    id: MenuId.SCMHistoryItemContext,
                    group: 'inline',
                    order: 1
                },
                {
                    id: MenuId.SCMHistoryItemContext,
                    group: '0_view',
                    order: 1
                }
            ]
        });
    }
    async run(accessor, provider, ...historyItems) {
        const commandService = accessor.get(ICommandService);
        const historyProvider = provider.historyProvider.get();
        const historyItemRef = historyProvider?.historyItemRef.get();
        const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
        if (!provider || !historyProvider || !historyItemRef || historyItems.length === 0) {
            return;
        }
        const historyItem = historyItems[0];
        let title, historyItemId, historyItemParentId;
        if (historyItemRemoteRef && (historyItem.id === SCMIncomingHistoryItemId || historyItem.id === SCMOutgoingHistoryItemId)) {
            // Incoming/Outgoing changes history item
            const mergeBase = await historyProvider.resolveHistoryItemRefsCommonAncestor([
                historyItemRef.name,
                historyItemRemoteRef.name
            ]);
            if (mergeBase && historyItem.id === SCMIncomingHistoryItemId) {
                // Incoming changes history item
                title = `${historyItem.subject} - ${historyItemRef.name} \u2194 ${historyItemRemoteRef.name}`;
                historyItemId = historyItemRemoteRef.id;
                historyItemParentId = mergeBase;
            }
            else if (mergeBase && historyItem.id === SCMOutgoingHistoryItemId) {
                // Outgoing changes history item
                title = `${historyItem.subject} - ${historyItemRemoteRef.name} \u2194 ${historyItemRef.name}`;
                historyItemId = historyItemRef.id;
                historyItemParentId = mergeBase;
            }
        }
        else {
            title = getHistoryItemEditorTitle(historyItem);
            historyItemId = historyItem.id;
            if (historyItem.parentIds.length > 0) {
                // History item right above the incoming changes history item
                if (historyItem.parentIds[0] === SCMIncomingHistoryItemId && historyItemRemoteRef) {
                    historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
                        historyItemRef.name,
                        historyItemRemoteRef.name
                    ]);
                }
                else {
                    historyItemParentId = historyItem.parentIds[0];
                }
            }
        }
        if (!title || !historyItemId || !historyItemParentId) {
            return;
        }
        const multiDiffSourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItemId, historyItemParentId, '');
        commandService.executeCommand('_workbench.openMultiDiffEditor', { title, multiDiffSourceUri });
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.openFile',
            title: localize('openFile', "Open File"),
            icon: Codicon.goToFile,
            f1: false,
            menu: [
                {
                    id: MenuId.SCMHistoryItemChangeContext,
                    group: 'inline',
                    order: 1
                },
                {
                    id: MenuId.SCMHistoryItemChangeContext,
                    group: '0_view',
                    order: 1
                }
            ]
        });
    }
    async run(accessor, historyItem, historyItemChange) {
        const editorService = accessor.get(IEditorService);
        if (!historyItem || !historyItemChange.modifiedUri) {
            return;
        }
        let version;
        if (historyItem.id === SCMIncomingHistoryItemId) {
            version = localize('incomingChanges', "Incoming Changes");
        }
        else if (historyItem.id === SCMOutgoingHistoryItemId) {
            version = localize('outgoingChanges', "Outgoing Changes");
        }
        else {
            version = historyItem.displayId ?? historyItem.id;
        }
        const name = basename(historyItemChange.modifiedUri.fsPath);
        await editorService.openEditor({ resource: historyItemChange.modifiedUri, label: `${name} (${version})` });
    }
});
class ListDelegate {
    getHeight() {
        return 22;
    }
    getTemplateId(element) {
        if (isSCMHistoryItemViewModelTreeElement(element)) {
            return HistoryItemRenderer.TEMPLATE_ID;
        }
        else if (isSCMHistoryItemChangeViewModelTreeElement(element) || isSCMHistoryItemChangeNode(element)) {
            return HistoryItemChangeRenderer.TEMPLATE_ID;
        }
        else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
            return HistoryItemLoadMoreRenderer.TEMPLATE_ID;
        }
        else {
            throw new Error('Unknown element');
        }
    }
}
let HistoryItemRenderer = class HistoryItemRenderer {
    static { HistoryItemRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'history-item'; }
    get templateId() { return HistoryItemRenderer_1.TEMPLATE_ID; }
    constructor(_viewContainerLocation, _commandService, _configurationService, _contextKeyService, _contextMenuService, _hoverService, _keybindingService, _markdownRendererService, _menuService, _telemetryService) {
        this._viewContainerLocation = _viewContainerLocation;
        this._commandService = _commandService;
        this._configurationService = _configurationService;
        this._contextKeyService = _contextKeyService;
        this._contextMenuService = _contextMenuService;
        this._hoverService = _hoverService;
        this._keybindingService = _keybindingService;
        this._markdownRendererService = _markdownRendererService;
        this._menuService = _menuService;
        this._telemetryService = _telemetryService;
        this._badgesConfig = observableConfigValue('scm.graph.badges', 'filter', this._configurationService);
    }
    renderTemplate(container) {
        const element = append(container, $('.history-item'));
        const graphContainer = append(element, $('.graph-container'));
        const iconLabel = new IconLabel(element, {
            supportIcons: true, supportHighlights: true, supportDescriptionHighlights: true
        });
        const labelContainer = append(element, $('.label-container'));
        const actionsContainer = append(element, $('.actions'));
        const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
        return { element, graphContainer, label: iconLabel, labelContainer, actionBar, elementDisposables: new DisposableStore(), disposables: combinedDisposable(iconLabel, actionBar) };
    }
    renderElement(node, index, templateData) {
        const provider = node.element.repository.provider;
        const historyItemViewModel = node.element.historyItemViewModel;
        const historyItem = historyItemViewModel.historyItem;
        const { content, disposables } = toHistoryItemHoverContent(this._markdownRendererService, historyItem, true);
        const { hoverOptions, hoverLifecycleOptions } = this._getHoverOptions();
        const historyItemHover = this._hoverService.setupDelayedHover(templateData.element, { ...hoverOptions, content }, hoverLifecycleOptions);
        templateData.elementDisposables.add(historyItemHover);
        templateData.elementDisposables.add(disposables);
        templateData.graphContainer.textContent = '';
        templateData.graphContainer.classList.toggle('current', historyItemViewModel.kind === 'HEAD');
        templateData.graphContainer.classList.toggle('incoming-changes', historyItemViewModel.kind === 'incoming-changes');
        templateData.graphContainer.classList.toggle('outgoing-changes', historyItemViewModel.kind === 'outgoing-changes');
        templateData.graphContainer.appendChild(renderSCMHistoryItemGraph(historyItemViewModel));
        const historyItemRef = provider.historyProvider.get()?.historyItemRef?.get();
        const extraClasses = historyItemRef?.revision === historyItem.id ? ['history-item-current'] : [];
        const [matches, descriptionMatches] = this._processMatches(historyItemViewModel, node.filterData);
        templateData.label.setLabel(historyItem.subject, historyItem.author, { matches, descriptionMatches, extraClasses });
        this._renderBadges(historyItem, templateData);
        const actions = this._menuService.getMenuActions(MenuId.SCMHistoryItemContext, this._contextKeyService, { arg: provider, shouldForwardArgs: true });
        templateData.actionBar.context = historyItem;
        templateData.actionBar.setActions(getActionBarActions(actions, 'inline').primary);
    }
    renderCompressedElements(node, index, templateData) {
        throw new Error('Should never happen since node is incompressible');
    }
    _renderBadges(historyItem, templateData) {
        templateData.elementDisposables.add(autorun(reader => {
            const labelConfig = this._badgesConfig.read(reader);
            templateData.labelContainer.replaceChildren();
            const references = historyItem.references ?
                historyItem.references.slice(0) : [];
            // If the first reference is colored, we render it
            // separately since we have to show the description
            // for the first colored reference.
            if (references.length > 0 && references[0].color) {
                this._renderBadge([references[0]], true, templateData);
                // Remove the rendered reference from the collection
                references.splice(0, 1);
            }
            // Group history item references by color
            const historyItemRefsByColor = groupBy2(references, ref => ref.color ? ref.color : '');
            for (const [key, historyItemRefs] of Object.entries(historyItemRefsByColor)) {
                // If needed skip badges without a color
                if (key === '' && labelConfig !== 'all') {
                    continue;
                }
                if (!historyItemRefs) {
                    continue;
                }
                // Group history item references by icon
                const historyItemRefByIconId = groupBy2(historyItemRefs, ref => ThemeIcon.isThemeIcon(ref.icon) ? ref.icon.id : '');
                for (const [key, historyItemRefs] of Object.entries(historyItemRefByIconId)) {
                    // Skip badges without an icon
                    if (key === '' || !historyItemRefs) {
                        continue;
                    }
                    this._renderBadge(historyItemRefs, false, templateData);
                }
            }
        }));
    }
    _renderBadge(historyItemRefs, showDescription, templateData) {
        if (historyItemRefs.length === 0 || !ThemeIcon.isThemeIcon(historyItemRefs[0].icon)) {
            return;
        }
        const elements = h('div.label', {
            style: {
                color: historyItemRefs[0].color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(foreground),
                backgroundColor: historyItemRefs[0].color ? asCssVariable(historyItemRefs[0].color) : asCssVariable(historyItemHoverDefaultLabelBackground)
            }
        }, [
            h('div.count@count', {
                style: {
                    display: historyItemRefs.length > 1 ? '' : 'none'
                }
            }),
            h('div.icon@icon'),
            h('div.description@description', {
                style: {
                    display: showDescription ? '' : 'none'
                }
            })
        ]);
        elements.count.textContent = historyItemRefs.length > 1 ? historyItemRefs.length.toString() : '';
        elements.icon.classList.add(...ThemeIcon.asClassNameArray(historyItemRefs[0].icon));
        elements.description.textContent = showDescription ? historyItemRefs[0].name : '';
        append(templateData.labelContainer, elements.root);
    }
    _getHoverOptions() {
        // Source Control Graph view in the panel
        if (this._viewContainerLocation === 1 /* ViewContainerLocation.Panel */) {
            return {
                hoverOptions: {
                    additionalClasses: ['history-item-hover'],
                    appearance: {
                        compact: true
                    },
                    position: {
                        hoverPosition: 1 /* HoverPosition.RIGHT */
                    },
                    style: 2 /* HoverStyle.Mouse */
                },
                hoverLifecycleOptions: undefined
            };
        }
        return {
            hoverOptions: {
                additionalClasses: ['history-item-hover'],
                appearance: {
                    compact: true,
                    showPointer: true
                },
                position: {
                    hoverPosition: 1 /* HoverPosition.RIGHT */
                },
                style: 1 /* HoverStyle.Pointer */
            },
            hoverLifecycleOptions: {
                groupId: 'scm-history-item'
            }
        };
    }
    _processMatches(historyItemViewModel, filterData) {
        if (!filterData) {
            return [undefined, undefined];
        }
        return [
            historyItemViewModel.historyItem.message === filterData.label ? createMatches(filterData.score) : undefined,
            historyItemViewModel.historyItem.author === filterData.label ? createMatches(filterData.score) : undefined
        ];
    }
    disposeElement(element, index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.disposables.dispose();
    }
};
HistoryItemRenderer = HistoryItemRenderer_1 = __decorate([
    __param(1, ICommandService),
    __param(2, IConfigurationService),
    __param(3, IContextKeyService),
    __param(4, IContextMenuService),
    __param(5, IHoverService),
    __param(6, IKeybindingService),
    __param(7, IMarkdownRendererService),
    __param(8, IMenuService),
    __param(9, ITelemetryService)
], HistoryItemRenderer);
let HistoryItemChangeRenderer = class HistoryItemChangeRenderer {
    static { HistoryItemChangeRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'history-item-change'; }
    get templateId() { return HistoryItemChangeRenderer_1.TEMPLATE_ID; }
    constructor(viewMode, resourceLabels, _commandService, _contextKeyService, _contextMenuService, _keybindingService, _labelService, _menuService, _telemetryService) {
        this.viewMode = viewMode;
        this.resourceLabels = resourceLabels;
        this._commandService = _commandService;
        this._contextKeyService = _contextKeyService;
        this._contextMenuService = _contextMenuService;
        this._keybindingService = _keybindingService;
        this._labelService = _labelService;
        this._menuService = _menuService;
        this._telemetryService = _telemetryService;
    }
    renderTemplate(container) {
        const rowElement = container.parentElement;
        const element = append(container, $('.history-item-change'));
        const graphPlaceholder = append(element, $('.graph-placeholder'));
        const labelContainer = append(element, $('.label-container'));
        const resourceLabel = this.resourceLabels.create(labelContainer, {
            supportDescriptionHighlights: true, supportHighlights: true
        });
        const disposables = new DisposableStore();
        const actionsContainer = append(resourceLabel.element, $('.actions'));
        const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
        disposables.add(actionBar);
        return { rowElement, element, graphPlaceholder, resourceLabel, actionBar, disposables };
    }
    renderElement(elementOrNode, index, templateData, details) {
        const historyItemViewModel = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemViewModel : elementOrNode.element.context.historyItemViewModel;
        const historyItemChange = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemChange : elementOrNode.element;
        const graphColumns = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.graphColumns : elementOrNode.element.context.historyItemViewModel.outputSwimlanes;
        this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);
        const hidePath = this.viewMode() === "tree" /* ViewMode.Tree */;
        const fileKind = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? FileKind.FILE : FileKind.FOLDER;
        templateData.resourceLabel.setFile(historyItemChange.uri, { fileDecorations: { colors: false, badges: true }, fileKind, hidePath });
        if (fileKind === FileKind.FILE) {
            const actions = this._menuService.getMenuActions(MenuId.SCMHistoryItemChangeContext, this._contextKeyService, { arg: historyItemViewModel.historyItem, shouldForwardArgs: true });
            templateData.actionBar.context = historyItemChange;
            templateData.actionBar.setActions(getActionBarActions(actions, 'inline').primary);
        }
        else {
            templateData.actionBar.context = undefined;
            templateData.actionBar.setActions([]);
        }
    }
    renderCompressedElements(node, index, templateData, details) {
        const compressed = node.element;
        const historyItemViewModel = compressed.elements[0].context.historyItemViewModel;
        const graphColumns = compressed.elements[0].context.historyItemViewModel.outputSwimlanes;
        this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);
        const label = compressed.elements.map(e => e.name);
        const folder = compressed.elements[compressed.elements.length - 1];
        templateData.resourceLabel.setResource({ resource: folder.uri, name: label }, {
            fileDecorations: { colors: false, badges: true },
            fileKind: FileKind.FOLDER,
            separator: this._labelService.getSeparator(folder.uri.scheme)
        });
        templateData.actionBar.context = undefined;
        templateData.actionBar.setActions([]);
    }
    _renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns) {
        const graphPlaceholderSvgWidth = SWIMLANE_WIDTH * (graphColumns.length + 1);
        const marginLeft = graphPlaceholderSvgWidth - 16 /* .monaco-tl-indent left */;
        templateData.rowElement.style.marginLeft = `${marginLeft}px`;
        templateData.graphPlaceholder.textContent = '';
        templateData.graphPlaceholder.style.left = `${-1 * marginLeft}px`;
        templateData.graphPlaceholder.style.width = `${graphPlaceholderSvgWidth}px`;
        templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(graphColumns, getHistoryItemIndex(historyItemViewModel)));
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
};
HistoryItemChangeRenderer = HistoryItemChangeRenderer_1 = __decorate([
    __param(2, ICommandService),
    __param(3, IContextKeyService),
    __param(4, IContextMenuService),
    __param(5, IKeybindingService),
    __param(6, ILabelService),
    __param(7, IMenuService),
    __param(8, ITelemetryService)
], HistoryItemChangeRenderer);
let HistoryItemLoadMoreRenderer = class HistoryItemLoadMoreRenderer {
    static { HistoryItemLoadMoreRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'historyItemLoadMore'; }
    get templateId() { return HistoryItemLoadMoreRenderer_1.TEMPLATE_ID; }
    constructor(_isLoadingMore, _loadMoreCallback, _configurationService) {
        this._isLoadingMore = _isLoadingMore;
        this._loadMoreCallback = _loadMoreCallback;
        this._configurationService = _configurationService;
    }
    renderTemplate(container) {
        const element = append(container, $('.history-item-load-more'));
        const graphPlaceholder = append(element, $('.graph-placeholder'));
        const historyItemPlaceholderContainer = append(element, $('.history-item-placeholder'));
        const historyItemPlaceholderLabel = new IconLabel(historyItemPlaceholderContainer, { supportIcons: true });
        return { element, graphPlaceholder, historyItemPlaceholderContainer, historyItemPlaceholderLabel, elementDisposables: new DisposableStore(), disposables: historyItemPlaceholderLabel };
    }
    renderElement(element, index, templateData) {
        templateData.graphPlaceholder.textContent = '';
        templateData.graphPlaceholder.style.width = `${SWIMLANE_WIDTH * (element.element.graphColumns.length + 1)}px`;
        templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(element.element.graphColumns));
        const pageOnScroll = this._configurationService.getValue('scm.graph.pageOnScroll') === true;
        templateData.historyItemPlaceholderContainer.classList.toggle('shimmer', pageOnScroll);
        if (pageOnScroll) {
            templateData.historyItemPlaceholderLabel.setLabel('');
            this._loadMoreCallback();
        }
        else {
            templateData.elementDisposables.add(autorun(reader => {
                const isLoadingMore = this._isLoadingMore.read(reader);
                const icon = `$(${isLoadingMore ? 'loading~spin' : 'fold-down'})`;
                templateData.historyItemPlaceholderLabel.setLabel(localize('loadMore', "{0} Load More...", icon));
            }));
        }
    }
    renderCompressedElements(node, index, templateData) {
        throw new Error('Should never happen since node is incompressible');
    }
    disposeElement(element, index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.disposables.dispose();
    }
};
HistoryItemLoadMoreRenderer = HistoryItemLoadMoreRenderer_1 = __decorate([
    __param(2, IConfigurationService)
], HistoryItemLoadMoreRenderer);
let SCMHistoryViewPaneActionRunner = class SCMHistoryViewPaneActionRunner extends ActionRunner {
    constructor(_progressService) {
        super();
        this._progressService = _progressService;
    }
    runAction(action, context) {
        return this._progressService.withProgress({ location: HISTORY_VIEW_PANE_ID }, async () => await super.runAction(action, context));
    }
};
SCMHistoryViewPaneActionRunner = __decorate([
    __param(0, IProgressService)
], SCMHistoryViewPaneActionRunner);
class SCMHistoryTreeAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('scm history', "Source Control History");
    }
    getAriaLabel(element) {
        if (isSCMRepository(element)) {
            return `${element.provider.name} ${element.provider.label}`;
        }
        else if (isSCMHistoryItemViewModelTreeElement(element)) {
            const historyItem = element.historyItemViewModel.historyItem;
            return `${stripIcons(historyItem.message).trim()}${historyItem.author ? `, ${historyItem.author}` : ''}`;
        }
        else {
            return '';
        }
    }
}
class SCMHistoryTreeIdentityProvider {
    getId(element) {
        if (isSCMRepository(element)) {
            const provider = element.provider;
            return `repo:${provider.id}`;
        }
        else if (isSCMHistoryItemViewModelTreeElement(element)) {
            const provider = element.repository.provider;
            const historyItem = element.historyItemViewModel.historyItem;
            return `historyItem:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(',')}`;
        }
        else if (isSCMHistoryItemChangeViewModelTreeElement(element)) {
            const provider = element.repository.provider;
            const historyItem = element.historyItemViewModel.historyItem;
            return `historyItemChange:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(',')}/${element.historyItemChange.uri.fsPath}`;
        }
        else if (isSCMHistoryItemChangeNode(element)) {
            const provider = element.context.repository.provider;
            const historyItem = element.context.historyItemViewModel.historyItem;
            return `historyItemChangeFolder:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(',')}/${element.uri.fsPath}`;
        }
        else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
            const provider = element.repository.provider;
            return `historyItemLoadMore:${provider.id}`;
        }
        else {
            throw new Error('Invalid tree element');
        }
    }
}
class SCMHistoryTreeKeyboardNavigationLabelProvider {
    getKeyboardNavigationLabel(element) {
        if (isSCMRepository(element)) {
            return undefined;
        }
        else if (isSCMHistoryItemViewModelTreeElement(element)) {
            // For a history item we want to match both the message and
            // the author. A match in the message takes precedence over
            // a match in the author.
            return [element.historyItemViewModel.historyItem.message, element.historyItemViewModel.historyItem.author];
        }
        else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
            // We don't want to match the load more element
            return '';
        }
        else {
            throw new Error('Invalid tree element');
        }
    }
    getCompressedNodeKeyboardNavigationLabel(elements) {
        const folders = elements;
        return folders.map(e => e.name).join('/');
    }
}
class SCMHistoryTreeCompressionDelegate {
    isIncompressible(element) {
        if (ResourceTree.isResourceNode(element)) {
            return element.childrenCount === 0 || !element.parent || !element.parent.parent;
        }
        return true;
    }
}
class SCMHistoryTreeDataSource extends Disposable {
    constructor(viewMode) {
        super();
        this.viewMode = viewMode;
    }
    async getChildren(inputOrElement) {
        const children = [];
        if (inputOrElement instanceof SCMHistoryViewModel) {
            // History items
            const historyItems = await inputOrElement.getHistoryItems();
            children.push(...historyItems);
            // Load More element
            const repository = inputOrElement.repository.get();
            const lastHistoryItem = historyItems.at(-1);
            if (repository && lastHistoryItem && lastHistoryItem.historyItemViewModel.outputSwimlanes.length > 0) {
                children.push({
                    repository,
                    graphColumns: lastHistoryItem.historyItemViewModel.outputSwimlanes,
                    type: 'historyItemLoadMore'
                });
            }
        }
        else if (isSCMHistoryItemViewModelTreeElement(inputOrElement)) {
            // History item changes
            const historyProvider = inputOrElement.repository.provider.historyProvider.get();
            const historyItemViewModel = inputOrElement.historyItemViewModel;
            const historyItem = historyItemViewModel.historyItem;
            let historyItemId, historyItemParentId;
            if (historyItemViewModel.kind === 'incoming-changes' ||
                historyItemViewModel.kind === 'outgoing-changes') {
                // Incoming/Outgoing changes history item
                const historyItemRef = historyProvider?.historyItemRef.get();
                const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
                if (!historyProvider || !historyItemRef || !historyItemRemoteRef) {
                    return [];
                }
                historyItemId = historyItemViewModel.kind === 'incoming-changes'
                    ? historyItemRemoteRef.id
                    : historyItemRef.id;
                historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
                    historyItemRef.name,
                    historyItemRemoteRef.name
                ]);
            }
            else {
                // History item
                historyItemId = historyItem.id;
                if (historyItem.parentIds.length > 0) {
                    // History item right above the incoming changes history item
                    if (historyItem.parentIds[0] === SCMIncomingHistoryItemId) {
                        const historyItemRef = historyProvider?.historyItemRef.get();
                        const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
                        if (!historyProvider || !historyItemRef || !historyItemRemoteRef) {
                            return [];
                        }
                        historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
                            historyItemRef.name,
                            historyItemRemoteRef.name
                        ]);
                    }
                    else {
                        historyItemParentId = historyItem.parentIds[0];
                    }
                }
            }
            const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItemId, historyItemParentId) ?? [];
            if (this.viewMode() === "list" /* ViewMode.List */) {
                // List
                children.push(...historyItemChanges.map(change => ({
                    repository: inputOrElement.repository,
                    historyItemViewModel: inputOrElement.historyItemViewModel,
                    historyItemChange: change,
                    graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
                    type: 'historyItemChangeViewModel'
                })));
            }
            else if (this.viewMode() === "tree" /* ViewMode.Tree */) {
                // Tree
                const rootUri = inputOrElement.repository.provider.rootUri ?? URI.file('/');
                const historyItemChangesTree = new ResourceTree(inputOrElement, rootUri);
                for (const change of historyItemChanges) {
                    historyItemChangesTree.add(change.uri, {
                        repository: inputOrElement.repository,
                        historyItemViewModel: inputOrElement.historyItemViewModel,
                        historyItemChange: change,
                        graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
                        type: 'historyItemChangeViewModel'
                    });
                }
                for (const node of historyItemChangesTree.root.children) {
                    children.push(node.element ?? node);
                }
            }
        }
        else if (ResourceTree.isResourceNode(inputOrElement) && isSCMHistoryItemChangeNode(inputOrElement)) {
            // Tree
            for (const node of inputOrElement.children) {
                children.push(node.element && node.childrenCount === 0 ? node.element : node);
            }
        }
        return children;
    }
    hasChildren(inputOrElement) {
        return inputOrElement instanceof SCMHistoryViewModel ||
            isSCMHistoryItemViewModelTreeElement(inputOrElement) ||
            (isSCMHistoryItemChangeNode(inputOrElement) && inputOrElement.childrenCount > 0);
    }
}
class SCMHistoryTreeDragAndDrop {
    getDragURI(element) {
        const uri = this._getTreeElementUri(element);
        return uri ? uri.toString() : null;
    }
    onDragStart(data, originalEvent) {
        if (!originalEvent.dataTransfer) {
            return;
        }
        const historyItems = this._getDragAndDropData(data);
        if (historyItems.length === 0) {
            return;
        }
        originalEvent.dataTransfer.setData(CodeDataTransfers.SCM_HISTORY_ITEM, JSON.stringify(historyItems));
    }
    getDragLabel(elements, originalEvent) {
        if (elements.length === 1) {
            const element = elements[0];
            return this._getTreeElementLabel(element);
        }
        return String(elements.length);
    }
    onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
        return false;
    }
    drop(data, targetElement, targetIndex, targetSector, originalEvent) { }
    _getDragAndDropData(data) {
        const historyItems = [];
        for (const element of [...data.context ?? [], ...data.elements]) {
            if (!isSCMHistoryItemViewModelTreeElement(element)) {
                continue;
            }
            const provider = element.repository.provider;
            const historyItem = element.historyItemViewModel.historyItem;
            const attachmentName = `$(${Codicon.repo.id})\u00A0${provider.name}\u00A0$(${Codicon.gitCommit.id})\u00A0${historyItem.displayId ?? historyItem.id}`;
            const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;
            historyItems.push({
                name: attachmentName,
                resource: ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem.id, historyItemParentId, historyItem.displayId),
                historyItem: historyItem
            });
        }
        return historyItems;
    }
    _getTreeElementLabel(element) {
        if (isSCMHistoryItemViewModelTreeElement(element)) {
            const historyItem = element.historyItemViewModel.historyItem;
            return historyItem.displayId ?? historyItem.id;
        }
        return undefined;
    }
    _getTreeElementUri(element) {
        if (isSCMHistoryItemViewModelTreeElement(element)) {
            const provider = element.repository.provider;
            const historyItem = element.historyItemViewModel.historyItem;
            const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;
            return ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem.id, historyItemParentId, historyItem.displayId);
        }
        return undefined;
    }
    dispose() { }
}
let SCMHistoryViewModel = class SCMHistoryViewModel extends Disposable {
    constructor(_configurationService, _contextKeyService, _extensionService, _scmService, _scmViewService, _storageService) {
        super();
        this._configurationService = _configurationService;
        this._contextKeyService = _contextKeyService;
        this._extensionService = _extensionService;
        this._scmService = _scmService;
        this._scmViewService = _scmViewService;
        this._storageService = _storageService;
        this._selectedRepository = observableValue(this, 'auto');
        this.onDidChangeHistoryItemsFilter = observableSignal(this);
        this.isViewModelEmpty = observableValue(this, false);
        this._repositoryState = new Map();
        this._repositoryFilterState = new Map();
        this._repositoryFilterState = this._loadHistoryItemsFilterState();
        this.viewMode = observableValue(this, this._getViewMode());
        this._extensionService.onWillStop(this._saveHistoryItemsFilterState, this, this._store);
        this._storageService.onWillSaveState(this._saveHistoryItemsFilterState, this, this._store);
        this._scmHistoryItemCountCtx = ContextKeys.SCMHistoryItemCount.bindTo(this._contextKeyService);
        this._scmHistoryViewModeCtx = ContextKeys.SCMHistoryViewMode.bindTo(this._contextKeyService);
        this._scmHistoryViewModeCtx.set(this.viewMode.get());
        const firstRepository = this._scmService.repositoryCount > 0
            ? constObservable(Iterable.first(this._scmService.repositories))
            : observableFromEvent(this, Event.once(this._scmService.onDidAddRepository), repository => repository);
        const graphRepository = derived(reader => {
            const selectedRepository = this._selectedRepository.read(reader);
            if (selectedRepository !== 'auto') {
                return selectedRepository;
            }
            return this._scmViewService.activeRepository.read(reader)?.repository;
        });
        this.repository = latestChangedValue(this, [firstRepository, graphRepository]);
        const closedRepository = observableFromEvent(this, this._scmService.onDidRemoveRepository, repository => repository);
        // Closed repository cleanup
        this._register(autorun(reader => {
            const repository = closedRepository.read(reader);
            if (!repository) {
                return;
            }
            if (this.repository.read(undefined) === repository) {
                this._selectedRepository.set(Iterable.first(this._scmService.repositories) ?? 'auto', undefined);
            }
            this._repositoryState.delete(repository);
        }));
    }
    clearRepositoryState() {
        const repository = this.repository.get();
        if (!repository) {
            return;
        }
        this._repositoryState.delete(repository);
    }
    getHistoryItemsFilter() {
        const repository = this.repository.get();
        if (!repository) {
            return;
        }
        const filterState = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? 'auto';
        if (filterState === 'all' || filterState === 'auto') {
            return filterState;
        }
        const repositoryState = this._repositoryState.get(repository);
        return repositoryState?.historyItemsFilter;
    }
    getCurrentHistoryItemTreeElement() {
        const repository = this.repository.get();
        if (!repository) {
            return undefined;
        }
        const state = this._repositoryState.get(repository);
        if (!state) {
            return undefined;
        }
        const historyProvider = repository?.provider.historyProvider.get();
        const historyItemRef = historyProvider?.historyItemRef.get();
        return state.viewModels
            .find(viewModel => viewModel.historyItemViewModel.historyItem.id === historyItemRef?.revision);
    }
    loadMore(cursor) {
        const repository = this.repository.get();
        if (!repository) {
            return;
        }
        const state = this._repositoryState.get(repository);
        if (!state) {
            return;
        }
        this._repositoryState.set(repository, { ...state, loadMore: cursor ?? true });
    }
    async getHistoryItems() {
        const repository = this.repository.get();
        const historyProvider = repository?.provider.historyProvider.get();
        const historyItemRef = historyProvider?.historyItemRef.get();
        const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
        if (!repository || !historyProvider) {
            this._scmHistoryItemCountCtx.set(0);
            this.isViewModelEmpty.set(true, undefined);
            return [];
        }
        let state = this._repositoryState.get(repository);
        if (!state || state.loadMore !== false) {
            const historyItems = state?.viewModels
                .filter(vm => vm.historyItemViewModel.kind !== 'incoming-changes' &&
                vm.historyItemViewModel.kind !== 'outgoing-changes')
                .map(vm => vm.historyItemViewModel.historyItem) ?? [];
            const historyItemRefs = state?.historyItemsFilter ??
                await this._resolveHistoryItemFilter(repository, historyProvider);
            const limit = clamp(this._configurationService.getValue('scm.graph.pageSize'), 1, 1000);
            const historyItemRefIds = historyItemRefs.map(ref => ref.revision ?? ref.id);
            do {
                // Fetch the next page of history items
                historyItems.push(...(await historyProvider.provideHistoryItems({
                    historyItemRefs: historyItemRefIds, limit, skip: historyItems.length
                }) ?? []));
            } while (typeof state?.loadMore === 'string' && !historyItems.find(item => item.id === state?.loadMore));
            // Compute the merge base
            const mergeBase = historyItemRef && historyItemRemoteRef && state?.mergeBase === undefined
                ? await historyProvider.resolveHistoryItemRefsCommonAncestor([
                    historyItemRef.name,
                    historyItemRemoteRef.name
                ])
                : state?.mergeBase;
            // Create the color map
            const colorMap = this._getGraphColorMap(historyItemRefs);
            // Only show incoming changes node if the remote history item reference is part of the graph
            const addIncomingChangesNode = this._scmViewService.graphShowIncomingChangesConfig.get()
                && historyItemRefs.some(ref => ref.id === historyItemRemoteRef?.id);
            // Only show outgoing changes node if the history item reference is part of the graph
            const addOutgoingChangesNode = this._scmViewService.graphShowOutgoingChangesConfig.get()
                && historyItemRefs.some(ref => ref.id === historyItemRef?.id);
            const viewModels = toISCMHistoryItemViewModelArray(historyItems, colorMap, historyProvider.historyItemRef.get(), historyProvider.historyItemRemoteRef.get(), historyProvider.historyItemBaseRef.get(), addIncomingChangesNode, addOutgoingChangesNode, mergeBase)
                .map(historyItemViewModel => ({
                repository,
                historyItemViewModel,
                type: 'historyItemViewModel'
            }));
            state = { historyItemsFilter: historyItemRefs, viewModels, mergeBase, loadMore: false };
            this._repositoryState.set(repository, state);
            this._scmHistoryItemCountCtx.set(viewModels.length);
            this.isViewModelEmpty.set(viewModels.length === 0, undefined);
        }
        return state.viewModels;
    }
    setRepository(repository) {
        this._selectedRepository.set(repository, undefined);
    }
    setHistoryItemsFilter(filter) {
        const repository = this.repository.get();
        if (!repository) {
            return;
        }
        if (filter !== 'auto') {
            this._repositoryFilterState.set(getProviderKey(repository.provider), filter);
        }
        else {
            this._repositoryFilterState.delete(getProviderKey(repository.provider));
        }
        this._saveHistoryItemsFilterState();
        this.onDidChangeHistoryItemsFilter.trigger(undefined);
    }
    setViewMode(viewMode) {
        if (viewMode === this.viewMode.get()) {
            return;
        }
        this.viewMode.set(viewMode, undefined);
        this._scmHistoryViewModeCtx.set(viewMode);
        this._storageService.store('scm.graphView.viewMode', viewMode, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    }
    _getViewMode() {
        let mode = this._configurationService.getValue('scm.defaultViewMode') === 'list' ? "list" /* ViewMode.List */ : "tree" /* ViewMode.Tree */;
        const storageMode = this._storageService.get('scm.graphView.viewMode', 1 /* StorageScope.WORKSPACE */);
        if (typeof storageMode === 'string') {
            mode = storageMode;
        }
        return mode;
    }
    _getGraphColorMap(historyItemRefs) {
        const repository = this.repository.get();
        const historyProvider = repository?.provider.historyProvider.get();
        const historyItemRef = historyProvider?.historyItemRef.get();
        const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
        const historyItemBaseRef = historyProvider?.historyItemBaseRef.get();
        const colorMap = new Map();
        if (historyItemRef) {
            colorMap.set(historyItemRef.id, historyItemRef.color);
            if (historyItemRemoteRef) {
                colorMap.set(historyItemRemoteRef.id, historyItemRemoteRef.color);
            }
            if (historyItemBaseRef) {
                colorMap.set(historyItemBaseRef.id, historyItemBaseRef.color);
            }
        }
        // Add the remaining history item references to the color map
        // if not already present. These history item references will
        // be colored using the color of the history item to which they
        // point to.
        for (const ref of historyItemRefs) {
            if (!colorMap.has(ref.id)) {
                colorMap.set(ref.id, undefined);
            }
        }
        return colorMap;
    }
    async _resolveHistoryItemFilter(repository, historyProvider) {
        const historyItemRefs = [];
        const historyItemsFilter = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? 'auto';
        switch (historyItemsFilter) {
            case 'all':
                historyItemRefs.push(...(await historyProvider.provideHistoryItemRefs() ?? []));
                break;
            case 'auto':
                historyItemRefs.push(...[
                    historyProvider.historyItemRef.get(),
                    historyProvider.historyItemRemoteRef.get(),
                    historyProvider.historyItemBaseRef.get(),
                ].filter(ref => !!ref));
                break;
            default: {
                // Get the latest revisions for the history items references in the filer
                const refs = (await historyProvider.provideHistoryItemRefs(historyItemsFilter) ?? [])
                    .filter(ref => historyItemsFilter.some(filter => filter === ref.id));
                if (refs.length === 0) {
                    // Reset the filter
                    historyItemRefs.push(...[
                        historyProvider.historyItemRef.get(),
                        historyProvider.historyItemRemoteRef.get(),
                        historyProvider.historyItemBaseRef.get(),
                    ].filter(ref => !!ref));
                    this._repositoryFilterState.delete(getProviderKey(repository.provider));
                }
                else {
                    // Update filter
                    historyItemRefs.push(...refs);
                    this._repositoryFilterState.set(getProviderKey(repository.provider), refs.map(ref => ref.id));
                }
                this._saveHistoryItemsFilterState();
                break;
            }
        }
        return historyItemRefs;
    }
    _loadHistoryItemsFilterState() {
        try {
            const filterData = this._storageService.get('scm.graphView.referencesFilter', 1 /* StorageScope.WORKSPACE */);
            if (filterData) {
                return new Map(JSON.parse(filterData));
            }
        }
        catch { }
        return new Map();
    }
    _saveHistoryItemsFilterState() {
        const filter = Array.from(this._repositoryFilterState.entries());
        this._storageService.store('scm.graphView.referencesFilter', JSON.stringify(filter), 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    }
    dispose() {
        this._repositoryState.clear();
        super.dispose();
    }
};
SCMHistoryViewModel = __decorate([
    __param(0, IConfigurationService),
    __param(1, IContextKeyService),
    __param(2, IExtensionService),
    __param(3, ISCMService),
    __param(4, ISCMViewService),
    __param(5, IStorageService)
], SCMHistoryViewModel);
let RepositoryPicker = class RepositoryPicker {
    constructor(_quickInputService, _scmViewService) {
        this._quickInputService = _quickInputService;
        this._scmViewService = _scmViewService;
        this._autoQuickPickItem = {
            label: localize('auto', "Auto"),
            description: localize('activeRepository', "Show the source control graph for the active repository"),
            repository: 'auto'
        };
    }
    async pickRepository() {
        const picks = [
            this._autoQuickPickItem,
            { type: 'separator' }
        ];
        picks.push(...this._scmViewService.repositories.map(r => ({
            label: r.provider.name,
            description: r.provider.rootUri?.fsPath,
            iconClass: ThemeIcon.isThemeIcon(r.provider.iconPath)
                ? ThemeIcon.asClassName(r.provider.iconPath)
                : ThemeIcon.asClassName(Codicon.repo),
            repository: r
        })));
        return this._quickInputService.pick(picks, {
            placeHolder: localize('scmGraphRepository', "Select the repository to view, type to filter all repositories")
        });
    }
};
RepositoryPicker = __decorate([
    __param(0, IQuickInputService),
    __param(1, ISCMViewService)
], RepositoryPicker);
let HistoryItemRefPicker = class HistoryItemRefPicker extends Disposable {
    constructor(_historyProvider, _historyItemsFilter, _quickInputService) {
        super();
        this._historyProvider = _historyProvider;
        this._historyItemsFilter = _historyItemsFilter;
        this._quickInputService = _quickInputService;
        this._allQuickPickItem = {
            id: 'all',
            label: localize('all', "All"),
            description: localize('allHistoryItemRefs', "All history item references"),
            historyItemRef: 'all'
        };
        this._autoQuickPickItem = {
            id: 'auto',
            label: localize('auto', "Auto"),
            description: localize('currentHistoryItemRef', "Current history item reference(s)"),
            historyItemRef: 'auto'
        };
    }
    async pickHistoryItemRef() {
        const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
        this._store.add(quickPick);
        quickPick.placeholder = localize('scmGraphHistoryItemRef', "Select one/more history item references to view, type to filter");
        quickPick.canSelectMany = true;
        quickPick.hideCheckAll = true;
        quickPick.busy = true;
        quickPick.show();
        const items = await this._createQuickPickItems();
        // Set initial selection
        let selectedItems = [];
        if (this._historyItemsFilter === 'all') {
            selectedItems.push(this._allQuickPickItem);
        }
        else if (this._historyItemsFilter === 'auto') {
            selectedItems.push(this._autoQuickPickItem);
        }
        else {
            let index = 0;
            while (index < items.length) {
                if (items[index].type === 'separator') {
                    index++;
                    continue;
                }
                if (this._historyItemsFilter.some(ref => ref.id === items[index].id)) {
                    const item = items.splice(index, 1);
                    selectedItems.push(...item);
                }
                else {
                    index++;
                }
            }
            // Insert the selected items after `All` and `Auto`
            items.splice(2, 0, { type: 'separator' }, ...selectedItems);
        }
        quickPick.items = items;
        quickPick.selectedItems = selectedItems;
        quickPick.busy = false;
        return new Promise(resolve => {
            this._store.add(quickPick.onDidChangeSelection(items => {
                const { added } = delta(selectedItems, items, (a, b) => compare(a.id ?? '', b.id ?? ''));
                if (added.length > 0) {
                    if (added[0].historyItemRef === 'all' || added[0].historyItemRef === 'auto') {
                        quickPick.selectedItems = [added[0]];
                    }
                    else {
                        // Remove 'all' and 'auto' items if present
                        quickPick.selectedItems = [...quickPick.selectedItems
                                .filter(i => i.historyItemRef !== 'all' && i.historyItemRef !== 'auto')];
                    }
                }
                selectedItems = [...quickPick.selectedItems];
            }));
            this._store.add(quickPick.onDidAccept(() => {
                if (selectedItems.length === 0) {
                    resolve(undefined);
                }
                else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === 'all') {
                    resolve('all');
                }
                else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === 'auto') {
                    resolve('auto');
                }
                else {
                    resolve(selectedItems.map(item => item.historyItemRef.id));
                }
                quickPick.hide();
            }));
            this._store.add(quickPick.onDidHide(() => {
                resolve(undefined);
                this.dispose();
            }));
        });
    }
    async _createQuickPickItems() {
        const picks = [
            this._allQuickPickItem, this._autoQuickPickItem
        ];
        const historyItemRefs = await this._historyProvider.provideHistoryItemRefs() ?? [];
        const historyItemRefsByCategory = groupBy(historyItemRefs, (a, b) => compare(a.category ?? '', b.category ?? ''));
        for (const refs of historyItemRefsByCategory) {
            if (refs.length === 0) {
                continue;
            }
            picks.push({ type: 'separator', label: refs[0].category });
            picks.push(...refs.map(ref => {
                return {
                    id: ref.id,
                    label: ref.name,
                    description: ref.description,
                    iconClass: ThemeIcon.isThemeIcon(ref.icon) ?
                        ThemeIcon.asClassName(ref.icon) : undefined,
                    historyItemRef: ref
                };
            }));
        }
        return picks;
    }
};
HistoryItemRefPicker = __decorate([
    __param(2, IQuickInputService)
], HistoryItemRefPicker);
let SCMHistoryViewPane = class SCMHistoryViewPane extends ViewPane {
    constructor(options, _editorService, _instantiationService, _menuService, _progressService, _scmViewService, configurationService, contextMenuService, keybindingService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, hoverService) {
        super({
            ...options,
            titleMenuId: MenuId.SCMHistoryTitle,
            showActions: ViewPaneShowActions.WhenExpanded
        }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._menuService = _menuService;
        this._progressService = _progressService;
        this._scmViewService = _scmViewService;
        this._repositoryIsLoadingMore = observableValue(this, false);
        this._repositoryOutdated = observableValue(this, false);
        this._visibilityDisposables = new DisposableStore();
        this._treeOperationSequencer = new Sequencer();
        this._treeLoadMoreSequencer = new Sequencer();
        this._refreshThrottler = new Throttler();
        this._updateChildrenThrottler = new Throttler();
        this._contextMenuDisposables = new MutableDisposable();
        this._scmProviderCtx = ContextKeys.SCMProvider.bindTo(this.scopedContextKeyService);
        this._scmCurrentHistoryItemRefHasRemote = ContextKeys.SCMCurrentHistoryItemRefHasRemote.bindTo(this.scopedContextKeyService);
        this._scmCurrentHistoryItemRefHasBase = ContextKeys.SCMCurrentHistoryItemRefHasBase.bindTo(this.scopedContextKeyService);
        this._scmCurrentHistoryItemRefInFilter = ContextKeys.SCMCurrentHistoryItemRefInFilter.bindTo(this.scopedContextKeyService);
        this._actionRunner = this.instantiationService.createInstance(SCMHistoryViewPaneActionRunner);
        this._register(this._actionRunner);
        this._register(this._refreshThrottler);
        this._register(this._updateChildrenThrottler);
    }
    renderHeaderTitle(container) {
        super.renderHeaderTitle(container, this.title);
        const element = h('div.scm-graph-view-badge-container', [
            h('div.scm-graph-view-badge.monaco-count-badge.long@badge')
        ]);
        element.badge.textContent = 'Outdated';
        container.appendChild(element.root);
        this._register(autorun(reader => {
            const outdated = this._repositoryOutdated.read(reader);
            element.root.style.display = outdated ? '' : 'none';
            if (outdated) {
                reader.store.add(this.hoverService.setupDelayedHover(element.root, {
                    appearance: {
                        compact: true,
                        showPointer: true
                    },
                    content: new MarkdownString(localize('scmGraphViewOutdated', "Please refresh the graph using the refresh action ({0}).", '$(refresh)'), { supportThemeIcons: true }),
                    position: {
                        hoverPosition: 2 /* HoverPosition.BELOW */
                    }
                }));
            }
        }));
    }
    renderBody(container) {
        super.renderBody(container);
        this._treeContainer = append(container, $('.scm-view.scm-history-view.show-file-icons'));
        this._treeContainer.classList.add('file-icon-themable-tree');
        this._createTree(this._treeContainer);
        this.onDidChangeBodyVisibility(async (visible) => {
            if (!visible) {
                this._visibilityDisposables.clear();
                return;
            }
            // Create view model
            this._treeViewModel = this.instantiationService.createInstance(SCMHistoryViewModel);
            this._visibilityDisposables.add(this._treeViewModel);
            // Wait for first repository to be initialized
            const firstRepositoryInitialized = derived(this, reader => {
                const repository = this._treeViewModel.repository.read(reader);
                const historyProvider = repository?.provider.historyProvider.read(reader);
                const historyItemRef = historyProvider?.historyItemRef.read(reader);
                return historyItemRef !== undefined ? true : undefined;
            });
            await waitForState(firstRepositoryInitialized);
            // Initial rendering
            await this._progressService.withProgress({ location: this.id }, async () => {
                await this._treeOperationSequencer.queue(async () => {
                    await this._tree.setInput(this._treeViewModel);
                    this._tree.scrollTop = 0;
                });
            });
            this._visibilityDisposables.add(autorun(reader => {
                this._treeViewModel.isViewModelEmpty.read(reader);
                this._onDidChangeViewWelcomeState.fire();
            }));
            // Settings change
            this._visibilityDisposables.add(runOnChange(this._scmViewService.graphShowIncomingChangesConfig, async () => {
                await this.refresh();
            }));
            this._visibilityDisposables.add(runOnChange(this._scmViewService.graphShowOutgoingChangesConfig, async () => {
                await this.refresh();
            }));
            // Repository change
            let isFirstRun = true;
            this._visibilityDisposables.add(autorun(reader => {
                const repository = this._treeViewModel.repository.read(reader);
                const historyProvider = repository?.provider.historyProvider.read(reader);
                if (!repository || !historyProvider) {
                    return;
                }
                // HistoryItemId changed (checkout)
                const historyItemRefId = derived(reader => {
                    return historyProvider.historyItemRef.read(reader)?.id;
                });
                reader.store.add(runOnChange(historyItemRefId, async (historyItemRefIdValue) => {
                    await this.refresh();
                    // Update context key (needs to be done after the refresh call)
                    this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefIdValue));
                }));
                // HistoryItemRefs changed
                reader.store.add(runOnChange(historyProvider.historyItemRefChanges, changes => {
                    if (changes.silent) {
                        // The history item reference changes occurred in the background (ex: Auto Fetch)
                        // If tree is scrolled to the top, we can safely refresh the tree, otherwise we
                        // will show a visual cue that the view is outdated.
                        if (this._tree.scrollTop === 0) {
                            this.refresh();
                            return;
                        }
                        // Show the "Outdated" badge on the view
                        this._repositoryOutdated.set(true, undefined);
                        return;
                    }
                    this.refresh();
                }));
                // HistoryItemRefs filter changed
                reader.store.add(runOnChange(this._treeViewModel.onDidChangeHistoryItemsFilter, async () => {
                    await this.refresh();
                    // Update context key (needs to be done after the refresh call)
                    this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.read(undefined)));
                }));
                // HistoryItemRemoteRef changed
                reader.store.add(autorun(reader => {
                    this._scmCurrentHistoryItemRefHasRemote.set(!!historyProvider.historyItemRemoteRef.read(reader));
                }));
                // HistoryItemBaseRef changed
                reader.store.add(autorun(reader => {
                    this._scmCurrentHistoryItemRefHasBase.set(!!historyProvider.historyItemBaseRef.read(reader));
                }));
                // ViewMode changed
                reader.store.add(runOnChange(this._treeViewModel.viewMode, async () => {
                    await this._updateChildren();
                }));
                // Update context
                this._scmProviderCtx.set(repository.provider.providerId);
                this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.read(undefined)));
                // We skip refreshing the graph on the first execution of the autorun
                // since the graph for the first repository is rendered when the tree
                // input is set.
                if (!isFirstRun) {
                    this.refresh();
                }
                isFirstRun = false;
            }));
            // FileIconTheme & viewMode change
            const fileIconThemeObs = observableFromEvent(this.themeService.onDidFileIconThemeChange, () => this.themeService.getFileIconTheme());
            this._visibilityDisposables.add(autorun(reader => {
                const fileIconTheme = fileIconThemeObs.read(reader);
                const viewMode = this._treeViewModel.viewMode.read(reader);
                this._updateIndentStyles(fileIconTheme, viewMode);
            }));
        }, this, this._store);
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this._tree.layout(height, width);
    }
    getActionRunner() {
        return this._actionRunner;
    }
    getActionsContext() {
        return this._treeViewModel?.repository.get()?.provider;
    }
    createActionViewItem(action, options) {
        if (action.id === PICK_REPOSITORY_ACTION_ID) {
            const repository = this._treeViewModel?.repository.get();
            if (repository) {
                return new SCMRepositoryActionViewItem(repository, action, options);
            }
        }
        else if (action.id === PICK_HISTORY_ITEM_REFS_ACTION_ID) {
            const repository = this._treeViewModel?.repository.get();
            const historyItemsFilter = this._treeViewModel?.getHistoryItemsFilter();
            if (repository && historyItemsFilter) {
                return new SCMHistoryItemRefsActionViewItem(repository, historyItemsFilter, action, options);
            }
        }
        return super.createActionViewItem(action, options);
    }
    focus() {
        super.focus();
        const fakeKeyboardEvent = new KeyboardEvent('keydown');
        this._tree.focusFirst(fakeKeyboardEvent);
        this._tree.domFocus();
    }
    shouldShowWelcome() {
        return this._treeViewModel?.isViewModelEmpty.get() === true;
    }
    async refresh() {
        return this._refreshThrottler.queue(token => this._refresh(token));
    }
    async _refresh(token) {
        if (token.isCancellationRequested) {
            return;
        }
        this._treeViewModel.clearRepositoryState();
        await this._updateChildren();
        if (token.isCancellationRequested) {
            return;
        }
        this.updateActions();
        this._repositoryOutdated.set(false, undefined);
        this._tree.scrollTop = 0;
    }
    async pickRepository() {
        const picker = this._instantiationService.createInstance(RepositoryPicker);
        const result = await picker.pickRepository();
        if (result) {
            this._treeViewModel.setRepository(result.repository);
        }
    }
    async pickHistoryItemRef() {
        const repository = this._treeViewModel.repository.get();
        const historyProvider = repository?.provider.historyProvider.get();
        const historyItemsFilter = this._treeViewModel.getHistoryItemsFilter();
        if (!historyProvider || !historyItemsFilter) {
            return;
        }
        const picker = this._instantiationService.createInstance(HistoryItemRefPicker, historyProvider, historyItemsFilter);
        const result = await picker.pickHistoryItemRef();
        if (result) {
            this._treeViewModel.setHistoryItemsFilter(result);
        }
    }
    async revealCurrentHistoryItem() {
        const repository = this._treeViewModel.repository.get();
        const historyProvider = repository?.provider.historyProvider.get();
        const historyItemRef = historyProvider?.historyItemRef.get();
        if (!repository || !historyItemRef?.id || !historyItemRef?.revision) {
            return;
        }
        if (!this._isCurrentHistoryItemInFilter(historyItemRef.id)) {
            return;
        }
        const revealTreeNode = () => {
            const historyItemTreeElement = this._treeViewModel.getCurrentHistoryItemTreeElement();
            if (historyItemTreeElement && this._tree.hasNode(historyItemTreeElement)) {
                this._tree.reveal(historyItemTreeElement, 0.5);
                this._tree.setSelection([historyItemTreeElement]);
                this._tree.setFocus([historyItemTreeElement]);
                return true;
            }
            return false;
        };
        if (revealTreeNode()) {
            return;
        }
        // Fetch current history item
        await this._loadMore(historyItemRef.revision);
        // Reveal node
        revealTreeNode();
    }
    setViewMode(viewMode) {
        this._treeViewModel.setViewMode(viewMode);
    }
    _createTree(container) {
        this._treeIdentityProvider = new SCMHistoryTreeIdentityProvider();
        const resourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
        this._register(resourceLabels);
        this._treeDataSource = this.instantiationService.createInstance(SCMHistoryTreeDataSource, () => this._treeViewModel.viewMode.get());
        this._register(this._treeDataSource);
        const compressionEnabled = observableConfigValue('scm.compactFolders', true, this.configurationService);
        this._tree = this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, 'SCM History Tree', container, new ListDelegate(), new SCMHistoryTreeCompressionDelegate(), [
            this.instantiationService.createInstance(HistoryItemRenderer, this.viewDescriptorService.getViewLocationById(this.id)),
            this.instantiationService.createInstance(HistoryItemChangeRenderer, () => this._treeViewModel.viewMode.get(), resourceLabels),
            this.instantiationService.createInstance(HistoryItemLoadMoreRenderer, this._repositoryIsLoadingMore, () => this._loadMore()),
        ], this._treeDataSource, {
            accessibilityProvider: new SCMHistoryTreeAccessibilityProvider(),
            identityProvider: this._treeIdentityProvider,
            collapseByDefault: (e) => !isSCMHistoryItemChangeNode(e),
            compressionEnabled: compressionEnabled.get(),
            dnd: new SCMHistoryTreeDragAndDrop(),
            keyboardNavigationLabelProvider: new SCMHistoryTreeKeyboardNavigationLabelProvider(),
            horizontalScrolling: false,
            multipleSelectionSupport: false,
            twistieAdditionalCssClass: (e) => {
                return isSCMHistoryItemViewModelTreeElement(e) || isSCMHistoryItemLoadMoreTreeElement(e)
                    ? 'force-no-twistie'
                    : undefined;
            }
        });
        this._register(this._tree);
        this._tree.onDidOpen(this._onDidOpen, this, this._store);
        this._tree.onContextMenu(this._onContextMenu, this, this._store);
    }
    _isCurrentHistoryItemInFilter(historyItemRefId) {
        if (!historyItemRefId) {
            return false;
        }
        const historyItemFilter = this._treeViewModel.getHistoryItemsFilter();
        if (historyItemFilter === 'all' || historyItemFilter === 'auto') {
            return true;
        }
        return Array.isArray(historyItemFilter) && !!historyItemFilter.find(ref => ref.id === historyItemRefId);
    }
    async _onDidOpen(e) {
        if (!e.element) {
            return;
        }
        else if (isSCMHistoryItemChangeViewModelTreeElement(e.element)) {
            const historyItemChange = e.element.historyItemChange;
            const historyItem = e.element.historyItemViewModel.historyItem;
            const historyItemDisplayId = historyItem.id === SCMIncomingHistoryItemId
                ? localize('incomingChanges', "Incoming Changes")
                : historyItem.id === SCMOutgoingHistoryItemId
                    ? localize('outgoingChanges', "Outgoing Changes")
                    : historyItem.displayId ?? historyItem.id;
            const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;
            const historyItemParentDisplayId = historyItemParentId && historyItem.displayId
                ? historyItemParentId.substring(0, historyItem.displayId.length)
                : historyItemParentId;
            if (historyItemChange.originalUri && historyItemChange.modifiedUri) {
                // Diff Editor
                const originalUriTitle = `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`;
                const modifiedUriTitle = `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`;
                const title = `${originalUriTitle} \u2194 ${modifiedUriTitle}`;
                await this._editorService.openEditor({
                    label: title,
                    original: { resource: historyItemChange.originalUri },
                    modified: { resource: historyItemChange.modifiedUri },
                    options: e.editorOptions
                });
            }
            else if (historyItemChange.modifiedUri) {
                await this._editorService.openEditor({
                    label: `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`,
                    resource: historyItemChange.modifiedUri,
                    options: e.editorOptions
                });
            }
            else if (historyItemChange.originalUri) {
                // Editor (Deleted)
                await this._editorService.openEditor({
                    label: `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`,
                    resource: historyItemChange.originalUri,
                    options: e.editorOptions
                });
            }
        }
        else if (isSCMHistoryItemLoadMoreTreeElement(e.element)) {
            const pageOnScroll = this.configurationService.getValue('scm.graph.pageOnScroll') === true;
            if (!pageOnScroll) {
                this._loadMore();
                this._tree.setSelection([]);
            }
        }
    }
    _onContextMenu(e) {
        const element = e.element;
        if (isSCMHistoryItemViewModelTreeElement(element)) {
            // HistoryItem
            if (element.historyItemViewModel.kind === 'incoming-changes' || element.historyItemViewModel.kind === 'outgoing-changes') {
                // Incoming/Outgoing changes node does not support any context menu actions
                return;
            }
            this._contextMenuDisposables.value = new DisposableStore();
            const historyProvider = element.repository.provider.historyProvider.get();
            const historyItemRef = historyProvider?.historyItemRef.get();
            const historyItem = element.historyItemViewModel.historyItem;
            const historyItemRefMenuItems = MenuRegistry.getMenuItems(MenuId.SCMHistoryItemRefContext).filter(item => isIMenuItem(item));
            // If there are any history item references we have to add a submenu item for each orignal action,
            // and a menu item for each history item ref that matches the `when` clause of the original action.
            if (historyItemRefMenuItems.length > 0 && element.historyItemViewModel.historyItem.references?.length) {
                const historyItemRefActions = new Map();
                for (const ref of element.historyItemViewModel.historyItem.references) {
                    const contextKeyService = this.scopedContextKeyService.createOverlay([
                        ['scmHistoryItemRef', ref.id]
                    ]);
                    const menuActions = this._menuService.getMenuActions(MenuId.SCMHistoryItemRefContext, contextKeyService);
                    for (const action of menuActions.flatMap(a => a[1])) {
                        if (!historyItemRefActions.has(action.id)) {
                            historyItemRefActions.set(action.id, []);
                        }
                        historyItemRefActions.get(action.id).push(ref);
                    }
                }
                // Register submenu, menu items
                for (const historyItemRefMenuItem of historyItemRefMenuItems) {
                    const actionId = historyItemRefMenuItem.command.id;
                    if (!historyItemRefActions.has(actionId)) {
                        continue;
                    }
                    // Register the submenu for the original action
                    this._contextMenuDisposables.value.add(MenuRegistry.appendMenuItem(MenuId.SCMHistoryItemContext, {
                        title: historyItemRefMenuItem.command.title,
                        submenu: MenuId.for(actionId),
                        group: historyItemRefMenuItem?.group,
                        order: historyItemRefMenuItem?.order
                    }));
                    // Register the action for the history item ref
                    for (const historyItemRef of historyItemRefActions.get(actionId) ?? []) {
                        this._contextMenuDisposables.value.add(registerAction2(class extends Action2 {
                            constructor() {
                                super({
                                    id: `${actionId}.${historyItemRef.id}`,
                                    title: historyItemRef.name,
                                    menu: {
                                        id: MenuId.for(actionId),
                                        group: historyItemRef.category
                                    }
                                });
                            }
                            run(accessor, ...args) {
                                const commandService = accessor.get(ICommandService);
                                commandService.executeCommand(actionId, ...args, historyItemRef.id);
                            }
                        }));
                    }
                }
            }
            const contextKeyService = this.scopedContextKeyService.createOverlay([
                ['scmHistoryItemHasCurrentHistoryItemRef', historyItem.references?.find(ref => ref.id === historyItemRef?.id) !== undefined]
            ]);
            const menuActions = this._menuService.getMenuActions(MenuId.SCMHistoryItemContext, contextKeyService, {
                arg: element.repository.provider,
                shouldForwardArgs: true
            }).filter(group => group[0] !== 'inline');
            this.contextMenuService.showContextMenu({
                contextKeyService: this.scopedContextKeyService,
                getAnchor: () => e.anchor,
                getActions: () => getFlatContextMenuActions(menuActions),
                getActionsContext: () => element.historyItemViewModel.historyItem
            });
        }
        else if (isSCMHistoryItemChangeViewModelTreeElement(element)) {
            // HistoryItemChange
            const menuActions = this._menuService.getMenuActions(MenuId.SCMHistoryItemChangeContext, this.scopedContextKeyService, {
                arg: element.historyItemViewModel.historyItem,
                shouldForwardArgs: true
            }).filter(group => group[0] !== 'inline');
            this.contextMenuService.showContextMenu({
                contextKeyService: this.scopedContextKeyService,
                getAnchor: () => e.anchor,
                getActions: () => getFlatContextMenuActions(menuActions),
                getActionsContext: () => element.historyItemChange
            });
        }
    }
    async _loadMore(cursor) {
        return this._treeLoadMoreSequencer.queue(async () => {
            if (this._repositoryIsLoadingMore.get()) {
                return;
            }
            this._repositoryIsLoadingMore.set(true, undefined);
            this._treeViewModel.loadMore(cursor);
            await this._updateChildren();
            this._repositoryIsLoadingMore.set(false, undefined);
        });
    }
    _updateChildren() {
        return this._updateChildrenThrottler.queue(() => this._treeOperationSequencer.queue(async () => {
            await this._progressService.withProgress({ location: this.id, delay: 100 }, async () => {
                await this._tree.updateChildren(undefined, undefined, undefined, {
                // diffIdentityProvider: this._treeIdentityProvider
                });
            });
        }));
    }
    _updateIndentStyles(theme, viewMode) {
        this._treeContainer.classList.toggle('list-view-mode', viewMode === "list" /* ViewMode.List */);
        this._treeContainer.classList.toggle('tree-view-mode', viewMode === "tree" /* ViewMode.Tree */);
        this._treeContainer.classList.toggle('align-icons-and-twisties', (viewMode === "list" /* ViewMode.List */ && theme.hasFileIcons) || (theme.hasFileIcons && !theme.hasFolderIcons));
        this._treeContainer.classList.toggle('hide-arrows', viewMode === "tree" /* ViewMode.Tree */ && theme.hidesExplorerArrows === true);
    }
    dispose() {
        this._contextMenuDisposables.dispose();
        this._visibilityDisposables.dispose();
        super.dispose();
    }
};
SCMHistoryViewPane = __decorate([
    __param(1, IEditorService),
    __param(2, IInstantiationService),
    __param(3, IMenuService),
    __param(4, IProgressService),
    __param(5, ISCMViewService),
    __param(6, IConfigurationService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService),
    __param(9, IInstantiationService),
    __param(10, IViewDescriptorService),
    __param(11, IContextKeyService),
    __param(12, IOpenerService),
    __param(13, IThemeService),
    __param(14, IHoverService)
], SCMHistoryViewPane);
export { SCMHistoryViewPane };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtSGlzdG9yeVZpZXdQYW5lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2NtL2Jyb3dzZXIvc2NtSGlzdG9yeVZpZXdQYW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLGlCQUFpQixDQUFDO0FBQ3pCLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFJL0UsT0FBTyxFQUFFLGFBQWEsRUFBc0IsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFlLGVBQWUsRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLGtCQUFrQixFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBdUIsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuTyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBYyxrQ0FBa0MsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsYUFBYSxFQUFtQixVQUFVLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNoSCxPQUFPLEVBQWtCLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xHLE9BQU8sRUFBb0IsVUFBVSxFQUFFLFFBQVEsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxzQkFBc0IsRUFBeUIsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RixPQUFPLEVBQUUseUJBQXlCLEVBQUUsK0JBQStCLEVBQUUsY0FBYyxFQUFFLGdDQUFnQyxFQUFFLCtCQUErQixFQUFFLHNDQUFzQyxFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDeFEsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGNBQWMsRUFBRSwwQkFBMEIsRUFBRSwwQ0FBMEMsRUFBRSxtQ0FBbUMsRUFBRSxvQ0FBb0MsRUFBRSxlQUFlLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDMU8sT0FBTyxFQUF3UCx3QkFBd0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ2hWLE9BQU8sRUFBRSxvQkFBb0IsRUFBZ0MsV0FBVyxFQUFFLGVBQWUsRUFBWSxNQUFNLGtCQUFrQixDQUFDO0FBRTlILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMzSSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsWUFBWSxFQUEwQixNQUFNLG9DQUFvQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUcvQyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLGtCQUFrQixFQUF1QyxNQUFNLHNEQUFzRCxDQUFDO0FBQy9ILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxPQUFPLElBQUksUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDN0UsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDakksT0FBTyxFQUFrQixjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNyRyxPQUFPLEVBQWlCLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUlyRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHM0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHNUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDckcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXhFLE1BQU0seUJBQXlCLEdBQUcsMkNBQTJDLENBQUM7QUFDOUUsTUFBTSxnQ0FBZ0MsR0FBRyxnREFBZ0QsQ0FBQztBQUkxRixNQUFNLDJCQUE0QixTQUFRLGNBQWM7SUFDdkQsWUFBNkIsV0FBMkIsRUFBRSxNQUFlLEVBQUUsT0FBNEM7UUFDdEgsS0FBSyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxHQUFHLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRGxDLGdCQUFXLEdBQVgsV0FBVyxDQUFnQjtJQUV4RCxDQUFDO0lBRWtCLFdBQVc7UUFDN0IsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFFeEQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hCLE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7Z0JBQ25GLENBQUMsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO2dCQUNoRSxDQUFDLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLGtCQUFrQixDQUFDLENBQUM7WUFFMUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBR2xELEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvQixDQUFDO0lBQ0YsQ0FBQztJQUVrQixVQUFVO1FBQzVCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO0lBQ3ZDLENBQUM7Q0FDRDtBQUVELE1BQU0sZ0NBQWlDLFNBQVEsY0FBYztJQUM1RCxZQUNrQixXQUEyQixFQUMzQixtQkFBMEQsRUFDM0UsTUFBZSxFQUNmLE9BQTRDO1FBRTVDLEtBQUssQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUUsR0FBRyxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUw3QyxnQkFBVyxHQUFYLFdBQVcsQ0FBZ0I7UUFDM0Isd0JBQW1CLEdBQW5CLG1CQUFtQixDQUF1QztJQUs1RSxDQUFDO0lBRWtCLFdBQVc7UUFDN0IsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUM7WUFFMUQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hCLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBRXJFLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN4QixJQUFJLElBQUksQ0FBQyxtQkFBbUIsS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNDLENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsbUJBQW1CLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ2hELElBQUksQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM3QyxDQUFDO2lCQUFNLElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDbEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ3JELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyxPQUFPLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwRixDQUFDO1lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBRWtCLFVBQVU7UUFDNUIsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDeEMsT0FBTyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztRQUN0RSxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsbUJBQW1CLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDaEQsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBRXhFLE9BQU87Z0JBQ04sZUFBZSxFQUFFLGNBQWMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJO2dCQUMzQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSTtnQkFDakQsZUFBZSxFQUFFLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUk7YUFDL0MsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25DLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbEQsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ3pDLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRSxDQUFDO0lBQ0YsQ0FBQztDQUNEO0FBRUQsZUFBZSxDQUFDLEtBQU0sU0FBUSxVQUE4QjtJQUMzRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSx5QkFBeUI7WUFDN0IsS0FBSyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxtQkFBbUIsQ0FBQztZQUN4RCxNQUFNLEVBQUUsb0JBQW9CO1lBQzVCLEVBQUUsRUFBRSxLQUFLO1lBQ1QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsZUFBZTtnQkFDMUIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQ3ZCLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFDdkMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsRUFDOUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyx1Q0FBdUMsRUFBRSxVQUFVLENBQUMsQ0FBQztnQkFDNUUsS0FBSyxFQUFFLFlBQVk7Z0JBQ25CLEtBQUssRUFBRSxDQUFDO2FBQ1I7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFtQixFQUFFLElBQXdCO1FBQzVELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUN2QixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLEtBQU0sU0FBUSxVQUE4QjtJQUMzRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxnQ0FBZ0M7WUFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSwrQkFBK0IsQ0FBQztZQUNuRSxJQUFJLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDdkIsTUFBTSxFQUFFLG9CQUFvQjtZQUM1QixZQUFZLEVBQUUsV0FBVyxDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDNUQsRUFBRSxFQUFFLEtBQUs7WUFDVCxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO2dCQUMxQixLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLENBQW1CLEVBQUUsSUFBd0I7UUFDNUQsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFDM0IsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxLQUFNLFNBQVEsVUFBOEI7SUFDM0Q7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUscURBQXFEO1lBQ3pELEtBQUssRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsNEJBQTRCLENBQUM7WUFDdkUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxNQUFNO1lBQ3BCLE1BQU0sRUFBRSxvQkFBb0I7WUFDNUIsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQy9CLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQzlDLFdBQVcsQ0FBQyxnQ0FBZ0MsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUQsRUFBRSxFQUFFLEtBQUs7WUFDVCxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO2dCQUMxQixLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLENBQW1CLEVBQUUsSUFBd0I7UUFDNUQsSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7SUFDakMsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxLQUFNLFNBQVEsVUFBOEI7SUFDM0Q7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsb0NBQW9DO1lBQ3hDLEtBQUssRUFBRSxRQUFRLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQztZQUMxQyxNQUFNLEVBQUUsb0JBQW9CO1lBQzVCLEVBQUUsRUFBRSxLQUFLO1lBQ1QsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPO1lBQ3JCLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGVBQWU7Z0JBQzFCLEtBQUssRUFBRSxZQUFZO2dCQUNuQixLQUFLLEVBQUUsSUFBSTthQUNYO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBbUIsRUFBRSxJQUF3QjtRQUM1RCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEIsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxLQUFNLFNBQVEsVUFBOEI7SUFDM0Q7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsNENBQTRDO1lBQ2hELEtBQUssRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsY0FBYyxDQUFDO1lBQ2xELE1BQU0sRUFBRSxvQkFBb0I7WUFDNUIsT0FBTyxFQUFFLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLDRCQUFlO1lBQ2hFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxNQUFNLENBQUMsZUFBZSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRTtZQUNuRSxFQUFFLEVBQUUsS0FBSztTQUNULENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLENBQW1CLEVBQUUsSUFBd0I7UUFDNUQsSUFBSSxDQUFDLFdBQVcsNEJBQWUsQ0FBQztJQUNqQyxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLEtBQU0sU0FBUSxVQUE4QjtJQUMzRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSw0Q0FBNEM7WUFDaEQsS0FBSyxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxjQUFjLENBQUM7WUFDbEQsTUFBTSxFQUFFLG9CQUFvQjtZQUM1QixPQUFPLEVBQUUsV0FBVyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsNEJBQWU7WUFDaEUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFO1lBQ25FLEVBQUUsRUFBRSxLQUFLO1NBQ1QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBbUIsRUFBRSxJQUF3QjtRQUM1RCxJQUFJLENBQUMsV0FBVyw0QkFBZSxDQUFDO0lBQ2pDLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87SUFDcEM7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsd0NBQXdDO1lBQzVDLEtBQUssRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLGNBQWMsQ0FBQztZQUM5QyxJQUFJLEVBQUUsT0FBTyxDQUFDLFlBQVk7WUFDMUIsRUFBRSxFQUFFLEtBQUs7WUFDVCxJQUFJLEVBQUU7Z0JBQ0w7b0JBQ0MsRUFBRSxFQUFFLE1BQU0sQ0FBQyxxQkFBcUI7b0JBQ2hDLEtBQUssRUFBRSxRQUFRO29CQUNmLEtBQUssRUFBRSxDQUFDO2lCQUNSO2dCQUNEO29CQUNDLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO29CQUNoQyxLQUFLLEVBQUUsUUFBUTtvQkFDZixLQUFLLEVBQUUsQ0FBQztpQkFDUjthQUNEO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxRQUFzQixFQUFFLEdBQUcsWUFBK0I7UUFDeEcsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3ZELE1BQU0sY0FBYyxHQUFHLGVBQWUsRUFBRSxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0QsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFekUsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLGNBQWMsSUFBSSxZQUFZLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ25GLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLElBQUksS0FBeUIsRUFBRSxhQUFpQyxFQUFFLG1CQUF1QyxDQUFDO1FBRTFHLElBQUksb0JBQW9CLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxLQUFLLHdCQUF3QixJQUFJLFdBQVcsQ0FBQyxFQUFFLEtBQUssd0JBQXdCLENBQUMsRUFBRSxDQUFDO1lBQzFILHlDQUF5QztZQUN6QyxNQUFNLFNBQVMsR0FBRyxNQUFNLGVBQWUsQ0FBQyxvQ0FBb0MsQ0FBQztnQkFDNUUsY0FBYyxDQUFDLElBQUk7Z0JBQ25CLG9CQUFvQixDQUFDLElBQUk7YUFDekIsQ0FBQyxDQUFDO1lBRUgsSUFBSSxTQUFTLElBQUksV0FBVyxDQUFDLEVBQUUsS0FBSyx3QkFBd0IsRUFBRSxDQUFDO2dCQUM5RCxnQ0FBZ0M7Z0JBQ2hDLEtBQUssR0FBRyxHQUFHLFdBQVcsQ0FBQyxPQUFPLE1BQU0sY0FBYyxDQUFDLElBQUksV0FBVyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDOUYsYUFBYSxHQUFHLG9CQUFvQixDQUFDLEVBQUUsQ0FBQztnQkFDeEMsbUJBQW1CLEdBQUcsU0FBUyxDQUFDO1lBQ2pDLENBQUM7aUJBQU0sSUFBSSxTQUFTLElBQUksV0FBVyxDQUFDLEVBQUUsS0FBSyx3QkFBd0IsRUFBRSxDQUFDO2dCQUNyRSxnQ0FBZ0M7Z0JBQ2hDLEtBQUssR0FBRyxHQUFHLFdBQVcsQ0FBQyxPQUFPLE1BQU0sb0JBQW9CLENBQUMsSUFBSSxXQUFXLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDOUYsYUFBYSxHQUFHLGNBQWMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLG1CQUFtQixHQUFHLFNBQVMsQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLEdBQUcseUJBQXlCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDL0MsYUFBYSxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFFL0IsSUFBSSxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDdEMsNkRBQTZEO2dCQUM3RCxJQUFJLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssd0JBQXdCLElBQUksb0JBQW9CLEVBQUUsQ0FBQztvQkFDbkYsbUJBQW1CLEdBQUcsTUFBTSxlQUFlLENBQUMsb0NBQW9DLENBQUM7d0JBQ2hGLGNBQWMsQ0FBQyxJQUFJO3dCQUNuQixvQkFBb0IsQ0FBQyxJQUFJO3FCQUN6QixDQUFDLENBQUM7Z0JBQ0osQ0FBQztxQkFBTSxDQUFDO29CQUNQLG1CQUFtQixHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hELENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxhQUFhLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ3RELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxrQkFBa0IsR0FBRyxzQkFBc0IsQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzFILGNBQWMsQ0FBQyxjQUFjLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87SUFDcEM7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUscUNBQXFDO1lBQ3pDLEtBQUssRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQztZQUN4QyxJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVE7WUFDdEIsRUFBRSxFQUFFLEtBQUs7WUFDVCxJQUFJLEVBQUU7Z0JBQ0w7b0JBQ0MsRUFBRSxFQUFFLE1BQU0sQ0FBQywyQkFBMkI7b0JBQ3RDLEtBQUssRUFBRSxRQUFRO29CQUNmLEtBQUssRUFBRSxDQUFDO2lCQUNSO2dCQUNEO29CQUNDLEVBQUUsRUFBRSxNQUFNLENBQUMsMkJBQTJCO29CQUN0QyxLQUFLLEVBQUUsUUFBUTtvQkFDZixLQUFLLEVBQUUsQ0FBQztpQkFDUjthQUNEO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxXQUE0QixFQUFFLGlCQUF3QztRQUNwSCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRW5ELElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNwRCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksT0FBZSxDQUFDO1FBQ3BCLElBQUksV0FBVyxDQUFDLEVBQUUsS0FBSyx3QkFBd0IsRUFBRSxDQUFDO1lBQ2pELE9BQU8sR0FBRyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUMzRCxDQUFDO2FBQU0sSUFBSSxXQUFXLENBQUMsRUFBRSxLQUFLLHdCQUF3QixFQUFFLENBQUM7WUFDeEQsT0FBTyxHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxHQUFHLFdBQVcsQ0FBQyxTQUFTLElBQUksV0FBVyxDQUFDLEVBQUUsQ0FBQztRQUNuRCxDQUFDO1FBRUQsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1RCxNQUFNLGFBQWEsQ0FBQyxVQUFVLENBQUMsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUMsV0FBVyxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksS0FBSyxPQUFPLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDNUcsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILE1BQU0sWUFBWTtJQUVqQixTQUFTO1FBQ1IsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQW9CO1FBQ2pDLElBQUksb0NBQW9DLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNuRCxPQUFPLG1CQUFtQixDQUFDLFdBQVcsQ0FBQztRQUN4QyxDQUFDO2FBQU0sSUFBSSwwQ0FBMEMsQ0FBQyxPQUFPLENBQUMsSUFBSSwwQkFBMEIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZHLE9BQU8seUJBQXlCLENBQUMsV0FBVyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLG1DQUFtQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDekQsT0FBTywyQkFBMkIsQ0FBQyxXQUFXLENBQUM7UUFDaEQsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQVlELElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW1COzthQUVSLGdCQUFXLEdBQUcsY0FBYyxBQUFqQixDQUFrQjtJQUM3QyxJQUFJLFVBQVUsS0FBYSxPQUFPLHFCQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFJcEUsWUFDa0Isc0JBQW9ELEVBQ25DLGVBQWdDLEVBQzFCLHFCQUE0QyxFQUMvQyxrQkFBc0MsRUFDckMsbUJBQXdDLEVBQzlDLGFBQTRCLEVBQ3ZCLGtCQUFzQyxFQUNoQyx3QkFBa0QsRUFDOUQsWUFBMEIsRUFDckIsaUJBQW9DO1FBVHZELDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBOEI7UUFDbkMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzFCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDL0MsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUNyQyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXFCO1FBQzlDLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBQ3ZCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDaEMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQUM5RCxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUNyQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBRXhFLElBQUksQ0FBQyxhQUFhLEdBQUcscUJBQXFCLENBQW1CLGtCQUFrQixFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUN4SCxDQUFDO0lBRUQsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDdEQsTUFBTSxjQUFjLEdBQUcsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLE9BQU8sRUFBRTtZQUN4QyxZQUFZLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSw0QkFBNEIsRUFBRSxJQUFJO1NBQy9FLENBQUMsQ0FBQztRQUVILE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUU5RCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDeEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRWpOLE9BQU8sRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLGVBQWUsRUFBRSxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztJQUNuTCxDQUFDO0lBRUQsYUFBYSxDQUFDLElBQW9FLEVBQUUsS0FBYSxFQUFFLFlBQWlDO1FBQ25JLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztRQUNsRCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUM7UUFDL0QsTUFBTSxXQUFXLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxDQUFDO1FBRXJELE1BQU0sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RyxNQUFNLEVBQUUsWUFBWSxFQUFFLHFCQUFxQixFQUFFLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEUsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsRUFBRSxHQUFHLFlBQVksRUFBRSxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3pJLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN0RCxZQUFZLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRWpELFlBQVksQ0FBQyxjQUFjLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUM3QyxZQUFZLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLG9CQUFvQixDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQztRQUM5RixZQUFZLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUMsSUFBSSxLQUFLLGtCQUFrQixDQUFDLENBQUM7UUFDbkgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLG9CQUFvQixDQUFDLElBQUksS0FBSyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ25ILFlBQVksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUV6RixNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUM3RSxNQUFNLFlBQVksR0FBRyxjQUFjLEVBQUUsUUFBUSxLQUFLLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ2pHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsRyxZQUFZLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUVwSCxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUU5QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FDL0MsTUFBTSxDQUFDLHFCQUFxQixFQUM1QixJQUFJLENBQUMsa0JBQWtCLEVBQ3ZCLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHLFdBQVcsQ0FBQztRQUM3QyxZQUFZLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVELHdCQUF3QixDQUFDLElBQXlGLEVBQUUsS0FBYSxFQUFFLFlBQWlDO1FBQ25LLE1BQU0sSUFBSSxLQUFLLENBQUMsa0RBQWtELENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRU8sYUFBYSxDQUFDLFdBQTRCLEVBQUUsWUFBaUM7UUFDcEYsWUFBWSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDcEQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFcEQsWUFBWSxDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUU5QyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQzFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFFdEMsa0RBQWtEO1lBQ2xELG1EQUFtRDtZQUNuRCxtQ0FBbUM7WUFDbkMsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBRXZELG9EQUFvRDtnQkFDcEQsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDekIsQ0FBQztZQUVELHlDQUF5QztZQUN6QyxNQUFNLHNCQUFzQixHQUFHLFFBQVEsQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2RixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsZUFBZSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7Z0JBQzdFLHdDQUF3QztnQkFDeEMsSUFBSSxHQUFHLEtBQUssRUFBRSxJQUFJLFdBQVcsS0FBSyxLQUFLLEVBQUUsQ0FBQztvQkFDekMsU0FBUztnQkFDVixDQUFDO2dCQUVELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDdEIsU0FBUztnQkFDVixDQUFDO2dCQUVELHdDQUF3QztnQkFDeEMsTUFBTSxzQkFBc0IsR0FBRyxRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEgsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLGVBQWUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDO29CQUM3RSw4QkFBOEI7b0JBQzlCLElBQUksR0FBRyxLQUFLLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO3dCQUNwQyxTQUFTO29CQUNWLENBQUM7b0JBRUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxlQUFlLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sWUFBWSxDQUFDLGVBQXFDLEVBQUUsZUFBd0IsRUFBRSxZQUFpQztRQUN0SCxJQUFJLGVBQWUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNyRixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUU7WUFDL0IsS0FBSyxFQUFFO2dCQUNOLEtBQUssRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQztnQkFDNUcsZUFBZSxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxzQ0FBc0MsQ0FBQzthQUMzSTtTQUNELEVBQUU7WUFDRixDQUFDLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ3BCLEtBQUssRUFBRTtvQkFDTixPQUFPLEVBQUUsZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTTtpQkFDakQ7YUFDRCxDQUFDO1lBQ0YsQ0FBQyxDQUFDLGVBQWUsQ0FBQztZQUNsQixDQUFDLENBQUMsNkJBQTZCLEVBQUU7Z0JBQ2hDLEtBQUssRUFBRTtvQkFDTixPQUFPLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU07aUJBQ3RDO2FBQ0QsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUVILFFBQVEsQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDakcsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLFFBQVEsQ0FBQyxXQUFXLENBQUMsV0FBVyxHQUFHLGVBQWUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBRWxGLE1BQU0sQ0FBQyxZQUFZLENBQUMsY0FBYyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRU8sZ0JBQWdCO1FBSXZCLHlDQUF5QztRQUN6QyxJQUFJLElBQUksQ0FBQyxzQkFBc0Isd0NBQWdDLEVBQUUsQ0FBQztZQUNqRSxPQUFPO2dCQUNOLFlBQVksRUFBRTtvQkFDYixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixDQUFDO29CQUN6QyxVQUFVLEVBQUU7d0JBQ1gsT0FBTyxFQUFFLElBQUk7cUJBQ2I7b0JBQ0QsUUFBUSxFQUFFO3dCQUNULGFBQWEsNkJBQXFCO3FCQUNsQztvQkFDRCxLQUFLLDBCQUFrQjtpQkFDdkI7Z0JBQ0QscUJBQXFCLEVBQUUsU0FBUzthQUNoQyxDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU87WUFDTixZQUFZLEVBQUU7Z0JBQ2IsaUJBQWlCLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztnQkFDekMsVUFBVSxFQUFFO29CQUNYLE9BQU8sRUFBRSxJQUFJO29CQUNiLFdBQVcsRUFBRSxJQUFJO2lCQUNqQjtnQkFDRCxRQUFRLEVBQUU7b0JBQ1QsYUFBYSw2QkFBcUI7aUJBQ2xDO2dCQUNELEtBQUssNEJBQW9CO2FBQ3pCO1lBQ0QscUJBQXFCLEVBQUU7Z0JBQ3RCLE9BQU8sRUFBRSxrQkFBa0I7YUFDM0I7U0FDRCxDQUFDO0lBQ0gsQ0FBQztJQUVPLGVBQWUsQ0FBQyxvQkFBOEMsRUFBRSxVQUF1QztRQUM5RyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQsT0FBTztZQUNOLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxPQUFPLEtBQUssVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUMzRyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsTUFBTSxLQUFLLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDMUcsQ0FBQztJQUNILENBQUM7SUFFRCxjQUFjLENBQUMsT0FBdUUsRUFBRSxLQUFhLEVBQUUsWUFBaUM7UUFDdkksWUFBWSxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3pDLENBQUM7SUFFRCxlQUFlLENBQUMsWUFBaUM7UUFDaEQsWUFBWSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzFDLFlBQVksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEMsQ0FBQzs7QUEvTUksbUJBQW1CO0lBU3RCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLGlCQUFpQixDQUFBO0dBakJkLG1CQUFtQixDQWdOeEI7QUFXRCxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUF5Qjs7YUFDZCxnQkFBVyxHQUFHLHFCQUFxQixBQUF4QixDQUF5QjtJQUNwRCxJQUFJLFVBQVUsS0FBYSxPQUFPLDJCQUF5QixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFFMUUsWUFDa0IsUUFBd0IsRUFDeEIsY0FBOEIsRUFDYixlQUFnQyxFQUM3QixrQkFBc0MsRUFDckMsbUJBQXdDLEVBQ3pDLGtCQUFzQyxFQUMzQyxhQUE0QixFQUM3QixZQUEwQixFQUNyQixpQkFBb0M7UUFSdkQsYUFBUSxHQUFSLFFBQVEsQ0FBZ0I7UUFDeEIsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQ2Isb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzdCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDckMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUN6Qyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQzNDLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBQzdCLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQ3JCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7SUFDckUsQ0FBQztJQUVMLGNBQWMsQ0FBQyxTQUFzQjtRQUNwQyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsYUFBNkIsQ0FBQztRQUMzRCxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDN0QsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFbEUsTUFBTSxjQUFjLEdBQUcsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRTtZQUNoRSw0QkFBNEIsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsSUFBSTtTQUMzRCxDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDdEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2pOLFdBQVcsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFM0IsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUN6RixDQUFDO0lBRUQsYUFBYSxDQUFDLGFBQXNLLEVBQUUsS0FBYSxFQUFFLFlBQXVDLEVBQUUsT0FBK0M7UUFDNVIsTUFBTSxvQkFBb0IsR0FBRywwQ0FBMEMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDO1FBQ2pNLE1BQU0saUJBQWlCLEdBQUcsMENBQTBDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1FBQzlKLE1BQU0sWUFBWSxHQUFHLDBDQUEwQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLGVBQWUsQ0FBQztRQUVqTSxJQUFJLENBQUMsdUJBQXVCLENBQUMsWUFBWSxFQUFFLG9CQUFvQixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRS9FLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsK0JBQWtCLENBQUM7UUFDbkQsTUFBTSxRQUFRLEdBQUcsMENBQTBDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQ3JILFlBQVksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxFQUFFLGVBQWUsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBRXBJLElBQUksUUFBUSxLQUFLLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FDL0MsTUFBTSxDQUFDLDJCQUEyQixFQUNsQyxJQUFJLENBQUMsa0JBQWtCLEVBQ3ZCLEVBQUUsR0FBRyxFQUFFLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBRXJFLFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHLGlCQUFpQixDQUFDO1lBQ25ELFlBQVksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuRixDQUFDO2FBQU0sQ0FBQztZQUNQLFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQztZQUMzQyxZQUFZLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2QyxDQUFDO0lBQ0YsQ0FBQztJQUVELHdCQUF3QixDQUFDLElBQWtMLEVBQUUsS0FBYSxFQUFFLFlBQXVDLEVBQUUsT0FBK0M7UUFDblQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQTJILENBQUM7UUFDcEosTUFBTSxvQkFBb0IsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQztRQUNqRixNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxlQUFlLENBQUM7UUFFekYsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUUvRSxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuRCxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ25FLFlBQVksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQzdFLGVBQWUsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTtZQUNoRCxRQUFRLEVBQUUsUUFBUSxDQUFDLE1BQU07WUFDekIsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO1NBQzdELENBQUMsQ0FBQztRQUVILFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQztRQUMzQyxZQUFZLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRU8sdUJBQXVCLENBQUMsWUFBdUMsRUFBRSxvQkFBOEMsRUFBRSxZQUF3QztRQUNoSyxNQUFNLHdCQUF3QixHQUFHLGNBQWMsR0FBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxVQUFVLEdBQUcsd0JBQXdCLEdBQUcsRUFBRSxDQUFDLDRCQUE0QixDQUFDO1FBQzlFLFlBQVksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxHQUFHLFVBQVUsSUFBSSxDQUFDO1FBRTdELFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQy9DLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsVUFBVSxJQUFJLENBQUM7UUFDbEUsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyx3QkFBd0IsSUFBSSxDQUFDO1FBQzVFLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsZ0NBQWdDLENBQUMsWUFBWSxFQUFFLG1CQUFtQixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RJLENBQUM7SUFFRCxlQUFlLENBQUMsWUFBdUM7UUFDdEQsWUFBWSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNwQyxDQUFDOztBQTNGSSx5QkFBeUI7SUFPNUIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxpQkFBaUIsQ0FBQTtHQWJkLHlCQUF5QixDQTRGOUI7QUFXRCxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUEyQjs7YUFFaEIsZ0JBQVcsR0FBRyxxQkFBcUIsQUFBeEIsQ0FBeUI7SUFDcEQsSUFBSSxVQUFVLEtBQWEsT0FBTyw2QkFBMkIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBRTVFLFlBQ2tCLGNBQW9DLEVBQ3BDLGlCQUE2QixFQUNOLHFCQUE0QztRQUZuRSxtQkFBYyxHQUFkLGNBQWMsQ0FBc0I7UUFDcEMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFZO1FBQ04sMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtJQUNqRixDQUFDO0lBRUwsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztRQUNoRSxNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUNsRSxNQUFNLCtCQUErQixHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztRQUN4RixNQUFNLDJCQUEyQixHQUFHLElBQUksU0FBUyxDQUFDLCtCQUErQixFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFFM0csT0FBTyxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSwrQkFBK0IsRUFBRSwyQkFBMkIsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLGVBQWUsRUFBRSxFQUFFLFdBQVcsRUFBRSwyQkFBMkIsRUFBRSxDQUFDO0lBQ3pMLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBMkQsRUFBRSxLQUFhLEVBQUUsWUFBOEI7UUFDdkgsWUFBWSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUM7UUFDL0MsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxjQUFjLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUM5RyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLGdDQUFnQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUUxRyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFVLHdCQUF3QixDQUFDLEtBQUssSUFBSSxDQUFDO1FBQ3JHLFlBQVksQ0FBQywrQkFBK0IsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUV2RixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLFlBQVksQ0FBQywyQkFBMkIsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEQsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDMUIsQ0FBQzthQUFNLENBQUM7WUFDUCxZQUFZLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDcEQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3ZELE1BQU0sSUFBSSxHQUFHLEtBQUssYUFBYSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFdBQVcsR0FBRyxDQUFDO2dCQUVsRSxZQUFZLENBQUMsMkJBQTJCLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNuRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNGLENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxJQUE2RSxFQUFFLEtBQWEsRUFBRSxZQUE4QjtRQUNwSixNQUFNLElBQUksS0FBSyxDQUFDLGtEQUFrRCxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVELGNBQWMsQ0FBQyxPQUEyRCxFQUFFLEtBQWEsRUFBRSxZQUE4QjtRQUN4SCxZQUFZLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDekMsQ0FBQztJQUVELGVBQWUsQ0FBQyxZQUE4QjtRQUM3QyxZQUFZLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDMUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNwQyxDQUFDOztBQXBESSwyQkFBMkI7SUFROUIsV0FBQSxxQkFBcUIsQ0FBQTtHQVJsQiwyQkFBMkIsQ0FxRGhDO0FBRUQsSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBK0IsU0FBUSxZQUFZO0lBQ3hELFlBQStDLGdCQUFrQztRQUNoRixLQUFLLEVBQUUsQ0FBQztRQURzQyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWtCO0lBRWpGLENBQUM7SUFFa0IsU0FBUyxDQUFDLE1BQWUsRUFBRSxPQUFpQjtRQUM5RCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLEVBQUUsb0JBQW9CLEVBQUUsRUFDM0UsS0FBSyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQztDQUNELENBQUE7QUFUSyw4QkFBOEI7SUFDdEIsV0FBQSxnQkFBZ0IsQ0FBQTtHQUR4Qiw4QkFBOEIsQ0FTbkM7QUFFRCxNQUFNLG1DQUFtQztJQUV4QyxrQkFBa0I7UUFDakIsT0FBTyxRQUFRLENBQUMsYUFBYSxFQUFFLHdCQUF3QixDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVELFlBQVksQ0FBQyxPQUFvQjtRQUNoQyxJQUFJLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzlCLE9BQU8sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzdELENBQUM7YUFBTSxJQUFJLG9DQUFvQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDMUQsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQztZQUM3RCxPQUFPLEdBQUcsVUFBVSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDMUcsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFFRCxNQUFNLDhCQUE4QjtJQUVuQyxLQUFLLENBQUMsT0FBb0I7UUFDekIsSUFBSSxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM5QixNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDO1lBQ2xDLE9BQU8sUUFBUSxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDOUIsQ0FBQzthQUFNLElBQUksb0NBQW9DLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMxRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztZQUM3QyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDO1lBQzdELE9BQU8sZUFBZSxRQUFRLENBQUMsRUFBRSxJQUFJLFdBQVcsQ0FBQyxFQUFFLElBQUksV0FBVyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMxRixDQUFDO2FBQU0sSUFBSSwwQ0FBMEMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDO1lBQzdDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUM7WUFDN0QsT0FBTyxxQkFBcUIsUUFBUSxDQUFDLEVBQUUsSUFBSSxXQUFXLENBQUMsRUFBRSxJQUFJLFdBQVcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDeEksQ0FBQzthQUFNLElBQUksMEJBQTBCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNoRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7WUFDckQsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUM7WUFDckUsT0FBTywyQkFBMkIsUUFBUSxDQUFDLEVBQUUsSUFBSSxXQUFXLENBQUMsRUFBRSxJQUFJLFdBQVcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDNUgsQ0FBQzthQUFNLElBQUksbUNBQW1DLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN6RCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztZQUM3QyxPQUFPLHVCQUF1QixRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDN0MsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDekMsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sNkNBQTZDO0lBQ2xELDBCQUEwQixDQUFDLE9BQW9CO1FBQzlDLElBQUksZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDOUIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQzthQUFNLElBQUksb0NBQW9DLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMxRCwyREFBMkQ7WUFDM0QsMkRBQTJEO1lBQzNELHlCQUF5QjtZQUN6QixPQUFPLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1RyxDQUFDO2FBQU0sSUFBSSxtQ0FBbUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3pELCtDQUErQztZQUMvQyxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3pDLENBQUM7SUFDRixDQUFDO0lBRUQsd0NBQXdDLENBQUMsUUFBdUI7UUFDL0QsTUFBTSxPQUFPLEdBQUcsUUFBeUcsQ0FBQztRQUMxSCxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzNDLENBQUM7Q0FDRDtBQUVELE1BQU0saUNBQWlDO0lBRXRDLGdCQUFnQixDQUFDLE9BQW9CO1FBQ3BDLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzFDLE9BQU8sT0FBTyxDQUFDLGFBQWEsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDakYsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNEO0FBRUQsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBQ2hELFlBQTZCLFFBQXdCO1FBQ3BELEtBQUssRUFBRSxDQUFDO1FBRG9CLGFBQVEsR0FBUixRQUFRLENBQWdCO0lBRXJELENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDLGNBQWlEO1FBQ2xFLE1BQU0sUUFBUSxHQUFrQixFQUFFLENBQUM7UUFFbkMsSUFBSSxjQUFjLFlBQVksbUJBQW1CLEVBQUUsQ0FBQztZQUNuRCxnQkFBZ0I7WUFDaEIsTUFBTSxZQUFZLEdBQUcsTUFBTSxjQUFjLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDNUQsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLFlBQVksQ0FBQyxDQUFDO1lBRS9CLG9CQUFvQjtZQUNwQixNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ25ELE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QyxJQUFJLFVBQVUsSUFBSSxlQUFlLElBQUksZUFBZSxDQUFDLG9CQUFvQixDQUFDLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RHLFFBQVEsQ0FBQyxJQUFJLENBQUM7b0JBQ2IsVUFBVTtvQkFDVixZQUFZLEVBQUUsZUFBZSxDQUFDLG9CQUFvQixDQUFDLGVBQWU7b0JBQ2xFLElBQUksRUFBRSxxQkFBcUI7aUJBQ2lCLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0YsQ0FBQzthQUFNLElBQUksb0NBQW9DLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNqRSx1QkFBdUI7WUFDdkIsTUFBTSxlQUFlLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2pGLE1BQU0sb0JBQW9CLEdBQUcsY0FBYyxDQUFDLG9CQUFvQixDQUFDO1lBQ2pFLE1BQU0sV0FBVyxHQUFHLG9CQUFvQixDQUFDLFdBQVcsQ0FBQztZQUVyRCxJQUFJLGFBQXFCLEVBQUUsbUJBQXVDLENBQUM7WUFFbkUsSUFDQyxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssa0JBQWtCO2dCQUNoRCxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssa0JBQWtCLEVBQy9DLENBQUM7Z0JBQ0YseUNBQXlDO2dCQUN6QyxNQUFNLGNBQWMsR0FBRyxlQUFlLEVBQUUsY0FBYyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUM3RCxNQUFNLG9CQUFvQixHQUFHLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFFekUsSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7b0JBQ2xFLE9BQU8sRUFBRSxDQUFDO2dCQUNYLENBQUM7Z0JBRUQsYUFBYSxHQUFHLG9CQUFvQixDQUFDLElBQUksS0FBSyxrQkFBa0I7b0JBQy9ELENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFO29CQUN6QixDQUFDLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztnQkFFckIsbUJBQW1CLEdBQUcsTUFBTSxlQUFlLENBQUMsb0NBQW9DLENBQUM7b0JBQ2hGLGNBQWMsQ0FBQyxJQUFJO29CQUNuQixvQkFBb0IsQ0FBQyxJQUFJO2lCQUFDLENBQUMsQ0FBQztZQUM5QixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsZUFBZTtnQkFDZixhQUFhLEdBQUcsV0FBVyxDQUFDLEVBQUUsQ0FBQztnQkFFL0IsSUFBSSxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDdEMsNkRBQTZEO29CQUM3RCxJQUFJLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssd0JBQXdCLEVBQUUsQ0FBQzt3QkFDM0QsTUFBTSxjQUFjLEdBQUcsZUFBZSxFQUFFLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQzt3QkFDN0QsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxFQUFFLENBQUM7d0JBRXpFLElBQUksQ0FBQyxlQUFlLElBQUksQ0FBQyxjQUFjLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDOzRCQUNsRSxPQUFPLEVBQUUsQ0FBQzt3QkFDWCxDQUFDO3dCQUVELG1CQUFtQixHQUFHLE1BQU0sZUFBZSxDQUFDLG9DQUFvQyxDQUFDOzRCQUNoRixjQUFjLENBQUMsSUFBSTs0QkFDbkIsb0JBQW9CLENBQUMsSUFBSTt5QkFBQyxDQUFDLENBQUM7b0JBQzlCLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxtQkFBbUIsR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNoRCxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1lBRUQsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLGVBQWUsRUFBRSx5QkFBeUIsQ0FBQyxhQUFhLEVBQUUsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFdEgsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLCtCQUFrQixFQUFFLENBQUM7Z0JBQ3ZDLE9BQU87Z0JBQ1AsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ2xELFVBQVUsRUFBRSxjQUFjLENBQUMsVUFBVTtvQkFDckMsb0JBQW9CLEVBQUUsY0FBYyxDQUFDLG9CQUFvQjtvQkFDekQsaUJBQWlCLEVBQUUsTUFBTTtvQkFDekIsWUFBWSxFQUFFLGNBQWMsQ0FBQyxvQkFBb0IsQ0FBQyxlQUFlO29CQUNqRSxJQUFJLEVBQUUsNEJBQTRCO2lCQUNrQixDQUFBLENBQUMsQ0FBQyxDQUFDO1lBQ3pELENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLCtCQUFrQixFQUFFLENBQUM7Z0JBQzlDLE9BQU87Z0JBQ1AsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzVFLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxZQUFZLENBQStFLGNBQWMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDdkosS0FBSyxNQUFNLE1BQU0sSUFBSSxrQkFBa0IsRUFBRSxDQUFDO29CQUN6QyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRTt3QkFDdEMsVUFBVSxFQUFFLGNBQWMsQ0FBQyxVQUFVO3dCQUNyQyxvQkFBb0IsRUFBRSxjQUFjLENBQUMsb0JBQW9CO3dCQUN6RCxpQkFBaUIsRUFBRSxNQUFNO3dCQUN6QixZQUFZLEVBQUUsY0FBYyxDQUFDLG9CQUFvQixDQUFDLGVBQWU7d0JBQ2pFLElBQUksRUFBRSw0QkFBNEI7cUJBQ2xDLENBQUMsQ0FBQztnQkFDSixDQUFDO2dCQUNELEtBQUssTUFBTSxJQUFJLElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUN6RCxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLENBQUM7Z0JBQ3JDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQzthQUFNLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsSUFBSSwwQkFBMEIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ3RHLE9BQU87WUFDUCxLQUFLLE1BQU0sSUFBSSxJQUFJLGNBQWMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDNUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxhQUFhLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMvRSxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxXQUFXLENBQUMsY0FBaUQ7UUFDNUQsT0FBTyxjQUFjLFlBQVksbUJBQW1CO1lBQ25ELG9DQUFvQyxDQUFDLGNBQWMsQ0FBQztZQUNwRCxDQUFDLDBCQUEwQixDQUFDLGNBQWMsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbkYsQ0FBQztDQUNEO0FBRUQsTUFBTSx5QkFBeUI7SUFDOUIsVUFBVSxDQUFDLE9BQW9CO1FBQzlCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM3QyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDcEMsQ0FBQztJQUVELFdBQVcsQ0FBQyxJQUFzQixFQUFFLGFBQXdCO1FBQzNELElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBMkQsQ0FBQyxDQUFDO1FBQzNHLElBQUksWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMvQixPQUFPO1FBQ1IsQ0FBQztRQUVELGFBQWEsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUN0RyxDQUFDO0lBRUQsWUFBWSxDQUFDLFFBQXVCLEVBQUUsYUFBd0I7UUFDN0QsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QixPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxVQUFVLENBQUMsSUFBc0IsRUFBRSxhQUFzQyxFQUFFLFdBQStCLEVBQUUsWUFBOEMsRUFBRSxhQUF3QjtRQUNuTCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxJQUFJLENBQUMsSUFBc0IsRUFBRSxhQUFzQyxFQUFFLFdBQStCLEVBQUUsWUFBOEMsRUFBRSxhQUF3QixJQUFVLENBQUM7SUFFakwsbUJBQW1CLENBQUMsSUFBeUQ7UUFDcEYsTUFBTSxZQUFZLEdBQWlDLEVBQUUsQ0FBQztRQUN0RCxLQUFLLE1BQU0sT0FBTyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxJQUFJLEVBQUUsRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ2pFLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNwRCxTQUFTO1lBQ1YsQ0FBQztZQUVELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDO1lBQzdDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUM7WUFDN0QsTUFBTSxjQUFjLEdBQUcsS0FBSyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxRQUFRLENBQUMsSUFBSSxXQUFXLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxVQUFVLFdBQVcsQ0FBQyxTQUFTLElBQUksV0FBVyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3JKLE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFFcEcsWUFBWSxDQUFDLElBQUksQ0FBQztnQkFDakIsSUFBSSxFQUFFLGNBQWM7Z0JBQ3BCLFFBQVEsRUFBRSxzQkFBc0IsQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxXQUFXLENBQUMsU0FBUyxDQUFDO2dCQUM1SCxXQUFXLEVBQUUsV0FBVzthQUN4QixDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsT0FBTyxZQUFZLENBQUM7SUFDckIsQ0FBQztJQUVPLG9CQUFvQixDQUFDLE9BQW9CO1FBQ2hELElBQUksb0NBQW9DLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNuRCxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDO1lBQzdELE9BQU8sV0FBVyxDQUFDLFNBQVMsSUFBSSxXQUFXLENBQUMsRUFBRSxDQUFDO1FBQ2hELENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8sa0JBQWtCLENBQUMsT0FBb0I7UUFDOUMsSUFBSSxvQ0FBb0MsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ25ELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDO1lBQzdDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUM7WUFDN0QsTUFBTSxtQkFBbUIsR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUVwRyxPQUFPLHNCQUFzQixDQUFDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsRUFBRSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMzSCxDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELE9BQU8sS0FBVyxDQUFDO0NBQ25CO0FBV0QsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBbUIzQyxZQUN3QixxQkFBNkQsRUFDaEUsa0JBQXVELEVBQ3hELGlCQUFxRCxFQUMzRCxXQUF5QyxFQUNyQyxlQUFpRCxFQUNqRCxlQUFpRDtRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQVBnQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQy9DLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDdkMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQUMxQyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUNwQixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDaEMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBakJsRCx3QkFBbUIsR0FBRyxlQUFlLENBQTBCLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVyRixrQ0FBNkIsR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxxQkFBZ0IsR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhDLHFCQUFnQixHQUFHLElBQUksR0FBRyxFQUFtQyxDQUFDO1FBQzlELDJCQUFzQixHQUFHLElBQUksR0FBRyxFQUFpQyxDQUFDO1FBZWxGLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztRQUNsRSxJQUFJLENBQUMsUUFBUSxHQUFHLGVBQWUsQ0FBVyxJQUFJLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7UUFFckUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUzRixJQUFJLENBQUMsdUJBQXVCLEdBQUcsV0FBVyxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMvRixJQUFJLENBQUMsc0JBQXNCLEdBQUcsV0FBVyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUM3RixJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUVyRCxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsR0FBRyxDQUFDO1lBQzNELENBQUMsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ2hFLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQ3pCLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUMvQyxVQUFVLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTVCLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN4QyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakUsSUFBSSxrQkFBa0IsS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxrQkFBa0IsQ0FBQztZQUMzQixDQUFDO1lBRUQsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxVQUFVLENBQUM7UUFDdkUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxHQUFHLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBRS9FLE1BQU0sZ0JBQWdCLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxFQUNoRCxJQUFJLENBQUMsV0FBVyxDQUFDLHFCQUFxQixFQUN0QyxVQUFVLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTNCLDRCQUE0QjtRQUM1QixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMvQixNQUFNLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNqQixPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ3BELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxJQUFJLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNsRyxDQUFDO1lBRUQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELG9CQUFvQjtRQUNuQixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVELHFCQUFxQjtRQUNwQixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQztRQUNuRyxJQUFJLFdBQVcsS0FBSyxLQUFLLElBQUksV0FBVyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3JELE9BQU8sV0FBVyxDQUFDO1FBQ3BCLENBQUM7UUFFRCxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzlELE9BQU8sZUFBZSxFQUFFLGtCQUFrQixDQUFDO0lBQzVDLENBQUM7SUFFRCxnQ0FBZ0M7UUFDL0IsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sZUFBZSxHQUFHLFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ25FLE1BQU0sY0FBYyxHQUFHLGVBQWUsRUFBRSxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFN0QsT0FBTyxLQUFLLENBQUMsVUFBVTthQUNyQixJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLEVBQUUsS0FBSyxjQUFjLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDakcsQ0FBQztJQUVELFFBQVEsQ0FBQyxNQUFlO1FBQ3ZCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLEVBQUUsR0FBRyxLQUFLLEVBQUUsUUFBUSxFQUFFLE1BQU0sSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZTtRQUNwQixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3pDLE1BQU0sZUFBZSxHQUFHLFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ25FLE1BQU0sY0FBYyxHQUFHLGVBQWUsRUFBRSxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0QsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFekUsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3JDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0MsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBRUQsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUVsRCxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxRQUFRLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDeEMsTUFBTSxZQUFZLEdBQUcsS0FBSyxFQUFFLFVBQVU7aUJBQ3BDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUNaLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssa0JBQWtCO2dCQUNuRCxFQUFFLENBQUMsb0JBQW9CLENBQUMsSUFBSSxLQUFLLGtCQUFrQixDQUFDO2lCQUNwRCxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO1lBRXZELE1BQU0sZUFBZSxHQUFHLEtBQUssRUFBRSxrQkFBa0I7Z0JBQ2hELE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUVuRSxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBUyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNoRyxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUU3RSxHQUFHLENBQUM7Z0JBQ0gsdUNBQXVDO2dCQUN2QyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQztvQkFDL0QsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsWUFBWSxDQUFDLE1BQU07aUJBQ3BFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxRQUFRLE9BQU8sS0FBSyxFQUFFLFFBQVEsS0FBSyxRQUFRLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxLQUFLLEVBQUUsUUFBUSxDQUFDLEVBQUU7WUFFekcseUJBQXlCO1lBQ3pCLE1BQU0sU0FBUyxHQUFHLGNBQWMsSUFBSSxvQkFBb0IsSUFBSSxLQUFLLEVBQUUsU0FBUyxLQUFLLFNBQVM7Z0JBQ3pGLENBQUMsQ0FBQyxNQUFNLGVBQWUsQ0FBQyxvQ0FBb0MsQ0FBQztvQkFDNUQsY0FBYyxDQUFDLElBQUk7b0JBQ25CLG9CQUFvQixDQUFDLElBQUk7aUJBQUMsQ0FBQztnQkFDNUIsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUM7WUFFcEIsdUJBQXVCO1lBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUV6RCw0RkFBNEY7WUFDNUYsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLDhCQUE4QixDQUFDLEdBQUcsRUFBRTttQkFDcEYsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssb0JBQW9CLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFckUscUZBQXFGO1lBQ3JGLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyw4QkFBOEIsQ0FBQyxHQUFHLEVBQUU7bUJBQ3BGLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLGNBQWMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUUvRCxNQUFNLFVBQVUsR0FBRywrQkFBK0IsQ0FDakQsWUFBWSxFQUNaLFFBQVEsRUFDUixlQUFlLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxFQUNwQyxlQUFlLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFLEVBQzFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsRUFDeEMsc0JBQXNCLEVBQ3RCLHNCQUFzQixFQUN0QixTQUFTLENBQUM7aUJBQ1QsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixVQUFVO2dCQUNWLG9CQUFvQjtnQkFDcEIsSUFBSSxFQUFFLHNCQUFzQjthQUM1QixDQUE4QyxDQUFDLENBQUM7WUFFbEQsS0FBSyxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQ3hGLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTdDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDLFVBQVUsQ0FBQztJQUN6QixDQUFDO0lBRUQsYUFBYSxDQUFDLFVBQW1DO1FBQ2hELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxNQUE2QjtRQUNsRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM5RSxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7UUFDRCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztRQUVwQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCxXQUFXLENBQUMsUUFBa0I7UUFDN0IsSUFBSSxRQUFRLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsUUFBUSw2REFBNkMsQ0FBQztJQUM1RyxDQUFDO0lBRU8sWUFBWTtRQUNuQixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFrQixxQkFBcUIsQ0FBQyxLQUFLLE1BQU0sQ0FBQyxDQUFDLDRCQUFlLENBQUMsMkJBQWMsQ0FBQztRQUNsSSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsaUNBQXFDLENBQUM7UUFDM0csSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNyQyxJQUFJLEdBQUcsV0FBVyxDQUFDO1FBQ3BCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxlQUFxQztRQUM5RCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3pDLE1BQU0sZUFBZSxHQUFHLFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ25FLE1BQU0sY0FBYyxHQUFHLGVBQWUsRUFBRSxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0QsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekUsTUFBTSxrQkFBa0IsR0FBRyxlQUFlLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFckUsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQXVDLENBQUM7UUFFaEUsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQixRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxFQUFFLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXRELElBQUksb0JBQW9CLEVBQUUsQ0FBQztnQkFDMUIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbkUsQ0FBQztZQUNELElBQUksa0JBQWtCLEVBQUUsQ0FBQztnQkFDeEIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEVBQUUsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDL0QsQ0FBQztRQUNGLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsNkRBQTZEO1FBQzdELCtEQUErRDtRQUMvRCxZQUFZO1FBQ1osS0FBSyxNQUFNLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDM0IsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVPLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxVQUEwQixFQUFFLGVBQW9DO1FBQ3ZHLE1BQU0sZUFBZSxHQUF5QixFQUFFLENBQUM7UUFDakQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUM7UUFFMUcsUUFBUSxrQkFBa0IsRUFBRSxDQUFDO1lBQzVCLEtBQUssS0FBSztnQkFDVCxlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLGVBQWUsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hGLE1BQU07WUFDUCxLQUFLLE1BQU07Z0JBQ1YsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHO29CQUN2QixlQUFlLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRTtvQkFDcEMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRTtvQkFDMUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRTtpQkFDeEMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsTUFBTTtZQUNQLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ1QseUVBQXlFO2dCQUN6RSxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sZUFBZSxDQUFDLHNCQUFzQixDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDO3FCQUNuRixNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBRXRFLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDdkIsbUJBQW1CO29CQUNuQixlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUc7d0JBQ3ZCLGVBQWUsQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFO3dCQUNwQyxlQUFlLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFO3dCQUMxQyxlQUFlLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO3FCQUN4QyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUN4QixJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDekUsQ0FBQztxQkFBTSxDQUFDO29CQUNQLGdCQUFnQjtvQkFDaEIsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO29CQUM5QixJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMvRixDQUFDO2dCQUVELElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO2dCQUVwQyxNQUFNO1lBQ1AsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLGVBQWUsQ0FBQztJQUN4QixDQUFDO0lBRU8sNEJBQTRCO1FBQ25DLElBQUksQ0FBQztZQUNKLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxpQ0FBeUIsQ0FBQztZQUN0RyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixPQUFPLElBQUksR0FBRyxDQUFnQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkUsQ0FBQztRQUNGLENBQUM7UUFBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBRVgsT0FBTyxJQUFJLEdBQUcsRUFBaUMsQ0FBQztJQUNqRCxDQUFDO0lBRU8sNEJBQTRCO1FBQ25DLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsNkRBQTZDLENBQUM7SUFDbEksQ0FBQztJQUVRLE9BQU87UUFDZixJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7Q0FDRCxDQUFBO0FBeFZLLG1CQUFtQjtJQW9CdEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsZUFBZSxDQUFBO0dBekJaLG1CQUFtQixDQXdWeEI7QUFJRCxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFnQjtJQU9yQixZQUNxQixrQkFBdUQsRUFDMUQsZUFBaUQ7UUFEN0IsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN6QyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFSbEQsdUJBQWtCLEdBQTRCO1lBQzlELEtBQUssRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUMvQixXQUFXLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixFQUFFLHlEQUF5RCxDQUFDO1lBQ3BHLFVBQVUsRUFBRSxNQUFNO1NBQ2xCLENBQUM7SUFLRSxDQUFDO0lBRUwsS0FBSyxDQUFDLGNBQWM7UUFDbkIsTUFBTSxLQUFLLEdBQXNEO1lBQ2hFLElBQUksQ0FBQyxrQkFBa0I7WUFDdkIsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFO1NBQUMsQ0FBQztRQUV4QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN6RCxLQUFLLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJO1lBQ3RCLFdBQVcsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxNQUFNO1lBQ3ZDLFNBQVMsRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO2dCQUNwRCxDQUFDLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDNUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztZQUN0QyxVQUFVLEVBQUUsQ0FBQztTQUNiLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFTCxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQzFDLFdBQVcsRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsZ0VBQWdFLENBQUM7U0FDN0csQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUE7QUE5QkssZ0JBQWdCO0lBUW5CLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxlQUFlLENBQUE7R0FUWixnQkFBZ0IsQ0E4QnJCO0FBSUQsSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBcUIsU0FBUSxVQUFVO0lBZTVDLFlBQ2tCLGdCQUFxQyxFQUNyQyxtQkFBMEQsRUFDdkQsa0JBQXVEO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBSlMscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFxQjtRQUNyQyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXVDO1FBQ3RDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFqQjNELHNCQUFpQixHQUFnQztZQUNqRSxFQUFFLEVBQUUsS0FBSztZQUNULEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQztZQUM3QixXQUFXLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLDZCQUE2QixDQUFDO1lBQzFFLGNBQWMsRUFBRSxLQUFLO1NBQ3JCLENBQUM7UUFFZSx1QkFBa0IsR0FBZ0M7WUFDbEUsRUFBRSxFQUFFLE1BQU07WUFDVixLQUFLLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7WUFDL0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxtQ0FBbUMsQ0FBQztZQUNuRixjQUFjLEVBQUUsTUFBTTtTQUN0QixDQUFDO0lBUUYsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0I7UUFDdkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBOEIsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNoSCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUzQixTQUFTLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxpRUFBaUUsQ0FBQyxDQUFDO1FBQzlILFNBQVMsQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBQy9CLFNBQVMsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQzlCLFNBQVMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ3RCLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVqQixNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBRWpELHdCQUF3QjtRQUN4QixJQUFJLGFBQWEsR0FBa0MsRUFBRSxDQUFDO1FBQ3RELElBQUksSUFBSSxDQUFDLG1CQUFtQixLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3hDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDNUMsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLG1CQUFtQixLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ2hELGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDN0MsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7WUFDZCxPQUFPLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzdCLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksS0FBSyxXQUFXLEVBQUUsQ0FBQztvQkFDdkMsS0FBSyxFQUFFLENBQUM7b0JBQ1IsU0FBUztnQkFDVixDQUFDO2dCQUVELElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0JBQ3RFLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBa0MsQ0FBQztvQkFDckUsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUM3QixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsS0FBSyxFQUFFLENBQUM7Z0JBQ1QsQ0FBQztZQUNGLENBQUM7WUFFRCxtREFBbUQ7WUFDbkQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxFQUFFLEdBQUcsYUFBYSxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUVELFNBQVMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLFNBQVMsQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1FBQ3hDLFNBQVMsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO1FBRXZCLE9BQU8sSUFBSSxPQUFPLENBQW9DLE9BQU8sQ0FBQyxFQUFFO1lBQy9ELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDdEQsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEtBQUssQ0FBQyxhQUFhLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDekYsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUN0QixJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLEtBQUssS0FBSyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLEtBQUssTUFBTSxFQUFFLENBQUM7d0JBQzdFLFNBQVMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdEMsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLDJDQUEyQzt3QkFDM0MsU0FBUyxDQUFDLGFBQWEsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLGFBQWE7aUNBQ25ELE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQyxjQUFjLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDM0UsQ0FBQztnQkFDRixDQUFDO2dCQUVELGFBQWEsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQzlDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtnQkFDMUMsSUFBSSxhQUFhLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNoQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3BCLENBQUM7cUJBQU0sSUFBSSxhQUFhLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxLQUFLLEtBQUssRUFBRSxDQUFDO29CQUNwRixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2hCLENBQUM7cUJBQU0sSUFBSSxhQUFhLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxLQUFLLE1BQU0sRUFBRSxDQUFDO29CQUNyRixPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2pCLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFFLElBQUksQ0FBQyxjQUFxQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BGLENBQUM7Z0JBRUQsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRTtnQkFDeEMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNuQixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLEtBQUssQ0FBQyxxQkFBcUI7UUFDbEMsTUFBTSxLQUFLLEdBQTBEO1lBQ3BFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsa0JBQWtCO1NBQy9DLENBQUM7UUFFRixNQUFNLGVBQWUsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUNuRixNQUFNLHlCQUF5QixHQUFHLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWxILEtBQUssTUFBTSxJQUFJLElBQUkseUJBQXlCLEVBQUUsQ0FBQztZQUM5QyxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZCLFNBQVM7WUFDVixDQUFDO1lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBRTNELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO2dCQUM1QixPQUFPO29CQUNOLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRTtvQkFDVixLQUFLLEVBQUUsR0FBRyxDQUFDLElBQUk7b0JBQ2YsV0FBVyxFQUFFLEdBQUcsQ0FBQyxXQUFXO29CQUM1QixTQUFTLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDM0MsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7b0JBQzVDLGNBQWMsRUFBRSxHQUFHO2lCQUNuQixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRCxDQUFBO0FBbklLLG9CQUFvQjtJQWtCdkIsV0FBQSxrQkFBa0IsQ0FBQTtHQWxCZixvQkFBb0IsQ0FtSXpCO0FBRU0sSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxRQUFRO0lBMEIvQyxZQUNDLE9BQXlCLEVBQ1QsY0FBK0MsRUFDeEMscUJBQTZELEVBQ3RFLFlBQTJDLEVBQ3ZDLGdCQUFtRCxFQUNwRCxlQUFpRCxFQUMzQyxvQkFBMkMsRUFDN0Msa0JBQXVDLEVBQ3hDLGlCQUFxQyxFQUNsQyxvQkFBMkMsRUFDMUMscUJBQTZDLEVBQ2pELGlCQUFxQyxFQUN6QyxhQUE2QixFQUM5QixZQUEyQixFQUMzQixZQUEyQjtRQUUxQyxLQUFLLENBQUM7WUFDTCxHQUFHLE9BQU87WUFDVixXQUFXLEVBQUUsTUFBTSxDQUFDLGVBQWU7WUFDbkMsV0FBVyxFQUFFLG1CQUFtQixDQUFDLFlBQVk7U0FDN0MsRUFBRSxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxvQkFBb0IsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBbkIxSSxtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFDdkIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUNyRCxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUN0QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWtCO1FBQ25DLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQXhCbEQsNkJBQXdCLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4RCx3QkFBbUIsR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBR25ELDJCQUFzQixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFL0MsNEJBQXVCLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUMxQywyQkFBc0IsR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ3pDLHNCQUFpQixHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7UUFDcEMsNkJBQXdCLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQU8zQyw0QkFBdUIsR0FBRyxJQUFJLGlCQUFpQixFQUFtQixDQUFDO1FBeUJuRixJQUFJLENBQUMsZUFBZSxHQUFHLFdBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3BGLElBQUksQ0FBQyxrQ0FBa0MsR0FBRyxXQUFXLENBQUMsaUNBQWlDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQzdILElBQUksQ0FBQyxnQ0FBZ0MsR0FBRyxXQUFXLENBQUMsK0JBQStCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3pILElBQUksQ0FBQyxpQ0FBaUMsR0FBRyxXQUFXLENBQUMsZ0NBQWdDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBRTNILElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQzlGLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRW5DLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRWtCLGlCQUFpQixDQUFDLFNBQXNCO1FBQzFELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRS9DLE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQyxvQ0FBb0MsRUFBRTtZQUN2RCxDQUFDLENBQUMsd0RBQXdELENBQUM7U0FDM0QsQ0FBQyxDQUFDO1FBRUgsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO1FBQ3ZDLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXBDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQy9CLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkQsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFFcEQsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUU7b0JBQ2xFLFVBQVUsRUFBRTt3QkFDWCxPQUFPLEVBQUUsSUFBSTt3QkFDYixXQUFXLEVBQUUsSUFBSTtxQkFDakI7b0JBQ0QsT0FBTyxFQUFFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSwwREFBMEQsRUFBRSxZQUFZLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDO29CQUNwSyxRQUFRLEVBQUU7d0JBQ1QsYUFBYSw2QkFBcUI7cUJBQ2xDO2lCQUNELENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRWtCLFVBQVUsQ0FBQyxTQUFzQjtRQUNuRCxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTVCLElBQUksQ0FBQyxjQUFjLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsNENBQTRDLENBQUMsQ0FBQyxDQUFDO1FBQ3pGLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBRTdELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRXRDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLEVBQUMsT0FBTyxFQUFDLEVBQUU7WUFDOUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNkLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDcEMsT0FBTztZQUNSLENBQUM7WUFFRCxvQkFBb0I7WUFDcEIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDcEYsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFFckQsOENBQThDO1lBQzlDLE1BQU0sMEJBQTBCLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRTtnQkFDekQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMvRCxNQUFNLGVBQWUsR0FBRyxVQUFVLEVBQUUsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzFFLE1BQU0sY0FBYyxHQUFHLGVBQWUsRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUVwRSxPQUFPLGNBQWMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ3hELENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxZQUFZLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUUvQyxvQkFBb0I7WUFDcEIsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDMUUsTUFBTSxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO29CQUNuRCxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztvQkFDL0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO2dCQUMxQixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ2hELElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNsRCxJQUFJLENBQUMsNEJBQTRCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDMUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLGtCQUFrQjtZQUNsQixJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLDhCQUE4QixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUMzRyxNQUFNLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN0QixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0osSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDM0csTUFBTSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLG9CQUFvQjtZQUNwQixJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFDdEIsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ2hELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDL0QsTUFBTSxlQUFlLEdBQUcsVUFBVSxFQUFFLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMxRSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ3JDLE9BQU87Z0JBQ1IsQ0FBQztnQkFFRCxtQ0FBbUM7Z0JBQ25DLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUN6QyxPQUFPLGVBQWUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDeEQsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLEtBQUssRUFBQyxxQkFBcUIsRUFBQyxFQUFFO29CQUM1RSxNQUFNLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFFckIsK0RBQStEO29CQUMvRCxJQUFJLENBQUMsaUNBQWlDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRUosMEJBQTBCO2dCQUMxQixNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxFQUFFO29CQUM3RSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDcEIsaUZBQWlGO3dCQUNqRiwrRUFBK0U7d0JBQy9FLG9EQUFvRDt3QkFDcEQsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsS0FBSyxDQUFDLEVBQUUsQ0FBQzs0QkFDaEMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDOzRCQUNmLE9BQU87d0JBQ1IsQ0FBQzt3QkFFRCx3Q0FBd0M7d0JBQ3hDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO3dCQUM5QyxPQUFPO29CQUNSLENBQUM7b0JBRUQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNoQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVKLGlDQUFpQztnQkFDakMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQzFGLE1BQU0sSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUVyQiwrREFBK0Q7b0JBQy9ELElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xILENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRUosK0JBQStCO2dCQUMvQixNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7b0JBQ2pDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDbEcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFSiw2QkFBNkI7Z0JBQzdCLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtvQkFDakMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUM5RixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVKLG1CQUFtQjtnQkFDbkIsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUNyRSxNQUFNLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDOUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFSixpQkFBaUI7Z0JBQ2pCLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3pELElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRWpILHFFQUFxRTtnQkFDckUscUVBQXFFO2dCQUNyRSxnQkFBZ0I7Z0JBQ2hCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDakIsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNoQixDQUFDO2dCQUNELFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLGtDQUFrQztZQUNsQyxNQUFNLGdCQUFnQixHQUFHLG1CQUFtQixDQUMzQyxJQUFJLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUMxQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQztZQUU3QyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDaEQsTUFBTSxhQUFhLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNwRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBRTNELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDbkQsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFa0IsVUFBVSxDQUFDLE1BQWMsRUFBRSxLQUFhO1FBQzFELEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRVEsZUFBZTtRQUN2QixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDM0IsQ0FBQztJQUVRLGlCQUFpQjtRQUN6QixPQUFPLElBQUksQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLEdBQUcsRUFBRSxFQUFFLFFBQVEsQ0FBQztJQUN4RCxDQUFDO0lBRVEsb0JBQW9CLENBQUMsTUFBZSxFQUFFLE9BQTRDO1FBQzFGLElBQUksTUFBTSxDQUFDLEVBQUUsS0FBSyx5QkFBeUIsRUFBRSxDQUFDO1lBQzdDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3pELElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLE9BQU8sSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3JFLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSxNQUFNLENBQUMsRUFBRSxLQUFLLGdDQUFnQyxFQUFFLENBQUM7WUFDM0QsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDekQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLHFCQUFxQixFQUFFLENBQUM7WUFDeEUsSUFBSSxVQUFVLElBQUksa0JBQWtCLEVBQUUsQ0FBQztnQkFDdEMsT0FBTyxJQUFJLGdDQUFnQyxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDOUYsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVRLEtBQUs7UUFDYixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFZCxNQUFNLGlCQUFpQixHQUFHLElBQUksYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRVEsaUJBQWlCO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsS0FBSyxJQUFJLENBQUM7SUFDN0QsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPO1FBQ1osT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFTyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQXdCO1FBQzlDLElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDbkMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDM0MsTUFBTSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFFN0IsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUNuQyxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNyQixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjO1FBQ25CLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMzRSxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUU3QyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RELENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLGtCQUFrQjtRQUN2QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN4RCxNQUFNLGVBQWUsR0FBRyxVQUFVLEVBQUUsUUFBUSxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNuRSxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUV2RSxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUM3QyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDcEgsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUVqRCxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuRCxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyx3QkFBd0I7UUFDN0IsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDeEQsTUFBTSxlQUFlLEdBQUcsVUFBVSxFQUFFLFFBQVEsQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDbkUsTUFBTSxjQUFjLEdBQUcsZUFBZSxFQUFFLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUM3RCxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxRQUFRLEVBQUUsQ0FBQztZQUNyRSxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDNUQsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxHQUFZLEVBQUU7WUFDcEMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGdDQUFnQyxFQUFFLENBQUM7WUFFdEYsSUFBSSxzQkFBc0IsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7Z0JBQzFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUUvQyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztnQkFDbEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUVELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQyxDQUFDO1FBRUYsSUFBSSxjQUFjLEVBQUUsRUFBRSxDQUFDO1lBQ3RCLE9BQU87UUFDUixDQUFDO1FBRUQsNkJBQTZCO1FBQzdCLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFOUMsY0FBYztRQUNkLGNBQWMsRUFBRSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxXQUFXLENBQUMsUUFBa0I7UUFDN0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVPLFdBQVcsQ0FBQyxTQUFzQjtRQUN6QyxJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFBSSw4QkFBOEIsRUFBRSxDQUFDO1FBRWxFLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsY0FBYyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUMsQ0FBQztRQUMzSSxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRS9CLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3BJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRXJDLE1BQU0sa0JBQWtCLEdBQUcscUJBQXFCLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRXhHLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FDcEQsa0NBQWtDLEVBQ2xDLGtCQUFrQixFQUNsQixTQUFTLEVBQ1QsSUFBSSxZQUFZLEVBQUUsRUFDbEIsSUFBSSxpQ0FBaUMsRUFBRSxFQUN2QztZQUNDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN0SCxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsQ0FBQztZQUM3SCxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixFQUFFLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7U0FDNUgsRUFDRCxJQUFJLENBQUMsZUFBZSxFQUNwQjtZQUNDLHFCQUFxQixFQUFFLElBQUksbUNBQW1DLEVBQUU7WUFDaEUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQjtZQUM1QyxpQkFBaUIsRUFBRSxDQUFDLENBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7WUFDakUsa0JBQWtCLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxFQUFFO1lBQzVDLEdBQUcsRUFBRSxJQUFJLHlCQUF5QixFQUFFO1lBQ3BDLCtCQUErQixFQUFFLElBQUksNkNBQTZDLEVBQUU7WUFDcEYsbUJBQW1CLEVBQUUsS0FBSztZQUMxQix3QkFBd0IsRUFBRSxLQUFLO1lBQy9CLHlCQUF5QixFQUFFLENBQUMsQ0FBVSxFQUFFLEVBQUU7Z0JBQ3pDLE9BQU8sb0NBQW9DLENBQUMsQ0FBQyxDQUFDLElBQUksbUNBQW1DLENBQUMsQ0FBQyxDQUFDO29CQUN2RixDQUFDLENBQUMsa0JBQWtCO29CQUNwQixDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ2QsQ0FBQztTQUNELENBQ21GLENBQUM7UUFDdEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFM0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRU8sNkJBQTZCLENBQUMsZ0JBQW9DO1FBQ3pFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQ3RFLElBQUksaUJBQWlCLEtBQUssS0FBSyxJQUFJLGlCQUFpQixLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ2pFLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLGdCQUFnQixDQUFDLENBQUM7SUFDekcsQ0FBQztJQUVPLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBc0M7UUFDOUQsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNoQixPQUFPO1FBQ1IsQ0FBQzthQUFNLElBQUksMENBQTBDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDbEUsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDO1lBQ3RELE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDO1lBQy9ELE1BQU0sb0JBQW9CLEdBQUcsV0FBVyxDQUFDLEVBQUUsS0FBSyx3QkFBd0I7Z0JBQ3ZFLENBQUMsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsa0JBQWtCLENBQUM7Z0JBQ2pELENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxLQUFLLHdCQUF3QjtvQkFDNUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxrQkFBa0IsQ0FBQztvQkFDakQsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxTQUFTLElBQUksV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUU1QyxNQUFNLG1CQUFtQixHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ3BHLE1BQU0sMEJBQTBCLEdBQUcsbUJBQW1CLElBQUksV0FBVyxDQUFDLFNBQVM7Z0JBQzlFLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO2dCQUNoRSxDQUFDLENBQUMsbUJBQW1CLENBQUM7WUFFdkIsSUFBSSxpQkFBaUIsQ0FBQyxXQUFXLElBQUksaUJBQWlCLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3BFLGNBQWM7Z0JBQ2QsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssMEJBQTBCLEdBQUcsQ0FBQztnQkFDN0csTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssb0JBQW9CLEdBQUcsQ0FBQztnQkFFdkcsTUFBTSxLQUFLLEdBQUcsR0FBRyxnQkFBZ0IsV0FBVyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUMvRCxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDO29CQUNwQyxLQUFLLEVBQUUsS0FBSztvQkFDWixRQUFRLEVBQUUsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUMsV0FBVyxFQUFFO29CQUNyRCxRQUFRLEVBQUUsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUMsV0FBVyxFQUFFO29CQUNyRCxPQUFPLEVBQUUsQ0FBQyxDQUFDLGFBQWE7aUJBQ3hCLENBQUMsQ0FBQztZQUNKLENBQUM7aUJBQU0sSUFBSSxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDMUMsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQztvQkFDcEMsS0FBSyxFQUFFLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxvQkFBb0IsR0FBRztvQkFDcEYsUUFBUSxFQUFFLGlCQUFpQixDQUFDLFdBQVc7b0JBQ3ZDLE9BQU8sRUFBRSxDQUFDLENBQUMsYUFBYTtpQkFDeEIsQ0FBQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxJQUFJLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUMxQyxtQkFBbUI7Z0JBQ25CLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUM7b0JBQ3BDLEtBQUssRUFBRSxHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssMEJBQTBCLEdBQUc7b0JBQzFGLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxXQUFXO29CQUN2QyxPQUFPLEVBQUUsQ0FBQyxDQUFDLGFBQWE7aUJBQ3hCLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSxtQ0FBbUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMzRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFVLHdCQUF3QixDQUFDLEtBQUssSUFBSSxDQUFDO1lBQ3BHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNqQixJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM3QixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxjQUFjLENBQUMsQ0FBNEM7UUFDbEUsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUUxQixJQUFJLG9DQUFvQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDbkQsY0FBYztZQUNkLElBQUksT0FBTyxDQUFDLG9CQUFvQixDQUFDLElBQUksS0FBSyxrQkFBa0IsSUFBSSxPQUFPLENBQUMsb0JBQW9CLENBQUMsSUFBSSxLQUFLLGtCQUFrQixFQUFFLENBQUM7Z0JBQzFILDJFQUEyRTtnQkFDM0UsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7WUFFM0QsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzFFLE1BQU0sY0FBYyxHQUFHLGVBQWUsRUFBRSxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDN0QsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQztZQUU3RCxNQUFNLHVCQUF1QixHQUFHLFlBQVksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFFN0gsa0dBQWtHO1lBQ2xHLG1HQUFtRztZQUNuRyxJQUFJLHVCQUF1QixDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksT0FBTyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUM7Z0JBQ3ZHLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxHQUFHLEVBQWdDLENBQUM7Z0JBRXRFLEtBQUssTUFBTSxHQUFHLElBQUksT0FBTyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDdkUsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsYUFBYSxDQUFDO3dCQUNwRSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7cUJBQzdCLENBQUMsQ0FBQztvQkFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FDbkQsTUFBTSxDQUFDLHdCQUF3QixFQUFFLGlCQUFpQixDQUFDLENBQUM7b0JBRXJELEtBQUssTUFBTSxNQUFNLElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQ3JELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7NEJBQzNDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUMxQyxDQUFDO3dCQUVELHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNqRCxDQUFDO2dCQUNGLENBQUM7Z0JBRUQsK0JBQStCO2dCQUMvQixLQUFLLE1BQU0sc0JBQXNCLElBQUksdUJBQXVCLEVBQUUsQ0FBQztvQkFDOUQsTUFBTSxRQUFRLEdBQUcsc0JBQXNCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFFbkQsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO3dCQUMxQyxTQUFTO29CQUNWLENBQUM7b0JBRUQsK0NBQStDO29CQUMvQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRTt3QkFDaEcsS0FBSyxFQUFFLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxLQUFLO3dCQUMzQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUM7d0JBQzdCLEtBQUssRUFBRSxzQkFBc0IsRUFBRSxLQUFLO3dCQUNwQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsS0FBSztxQkFDcEMsQ0FBQyxDQUFDLENBQUM7b0JBRUosK0NBQStDO29CQUMvQyxLQUFLLE1BQU0sY0FBYyxJQUFJLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQzt3QkFDeEUsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPOzRCQUMzRTtnQ0FDQyxLQUFLLENBQUM7b0NBQ0wsRUFBRSxFQUFFLEdBQUcsUUFBUSxJQUFJLGNBQWMsQ0FBQyxFQUFFLEVBQUU7b0NBQ3RDLEtBQUssRUFBRSxjQUFjLENBQUMsSUFBSTtvQ0FDMUIsSUFBSSxFQUFFO3dDQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQzt3Q0FDeEIsS0FBSyxFQUFFLGNBQWMsQ0FBQyxRQUFRO3FDQUM5QjtpQ0FDRCxDQUFDLENBQUM7NEJBQ0osQ0FBQzs0QkFDUSxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUFHLElBQWU7Z0NBQzFELE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7Z0NBQ3JELGNBQWMsQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLEdBQUcsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQzs0QkFDckUsQ0FBQzt5QkFDRCxDQUFDLENBQUMsQ0FBQztvQkFDTCxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1lBRUQsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsYUFBYSxDQUFDO2dCQUNwRSxDQUFDLHdDQUF3QyxFQUFFLFdBQVcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxjQUFjLEVBQUUsRUFBRSxDQUFDLEtBQUssU0FBUyxDQUFDO2FBQzVILENBQUMsQ0FBQztZQUVILE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUNuRCxNQUFNLENBQUMscUJBQXFCLEVBQzVCLGlCQUFpQixFQUFFO2dCQUNuQixHQUFHLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRO2dCQUNoQyxpQkFBaUIsRUFBRSxJQUFJO2FBQ3ZCLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUM7WUFFMUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQztnQkFDdkMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLHVCQUF1QjtnQkFDL0MsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNO2dCQUN6QixVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMseUJBQXlCLENBQUMsV0FBVyxDQUFDO2dCQUN4RCxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsV0FBVzthQUNqRSxDQUFDLENBQUM7UUFDSixDQUFDO2FBQU0sSUFBSSwwQ0FBMEMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2hFLG9CQUFvQjtZQUNwQixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FDbkQsTUFBTSxDQUFDLDJCQUEyQixFQUNsQyxJQUFJLENBQUMsdUJBQXVCLEVBQUU7Z0JBQzlCLEdBQUcsRUFBRSxPQUFPLENBQUMsb0JBQW9CLENBQUMsV0FBVztnQkFDN0MsaUJBQWlCLEVBQUUsSUFBSTthQUN2QixDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDO1lBRTFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUM7Z0JBQ3ZDLGlCQUFpQixFQUFFLElBQUksQ0FBQyx1QkFBdUI7Z0JBQy9DLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTTtnQkFDekIsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLHlCQUF5QixDQUFDLFdBQVcsQ0FBQztnQkFDeEQsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLGlCQUFpQjthQUNsRCxDQUFDLENBQUM7UUFDSixDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBZTtRQUN0QyxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDbkQsSUFBSSxJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztnQkFDekMsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNuRCxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUVyQyxNQUFNLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxlQUFlO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FDekMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FDdkMsS0FBSyxJQUFJLEVBQUU7WUFDVixNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQ3pFLEtBQUssSUFBSSxFQUFFO2dCQUNWLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUU7Z0JBQ2hFLG1EQUFtRDtpQkFDbkQsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLG1CQUFtQixDQUFDLEtBQXFCLEVBQUUsUUFBa0I7UUFDcEUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLFFBQVEsK0JBQWtCLENBQUMsQ0FBQztRQUNuRixJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSwrQkFBa0IsQ0FBQyxDQUFDO1FBQ25GLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsRUFBRSxDQUFDLFFBQVEsK0JBQWtCLElBQUksS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQ3RLLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsUUFBUSwrQkFBa0IsSUFBSSxLQUFLLENBQUMsbUJBQW1CLEtBQUssSUFBSSxDQUFDLENBQUM7SUFDdkgsQ0FBQztJQUVRLE9BQU87UUFDZixJQUFJLENBQUMsdUJBQXVCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdkMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3RDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0NBQ0QsQ0FBQTtBQTVtQlksa0JBQWtCO0lBNEI1QixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixZQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFlBQUEsa0JBQWtCLENBQUE7SUFDbEIsWUFBQSxjQUFjLENBQUE7SUFDZCxZQUFBLGFBQWEsQ0FBQTtJQUNiLFlBQUEsYUFBYSxDQUFBO0dBekNILGtCQUFrQixDQTRtQjlCIn0=