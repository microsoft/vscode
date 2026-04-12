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
import './media/markers.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Separator } from '../../../../base/common/actions.js';
import { groupBy } from '../../../../base/common/arrays.js';
import { Event, Relay } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { deepClone } from '../../../../base/common/objects.js';
import { isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { fillInMarkersDragData } from '../../../../platform/dnd/browser/dnd.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IListService, WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IOpenerService, withSelection } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { RangeHighlightDecorations } from '../../../browser/codeeditor.js';
import { ResourceListDnDHandler } from '../../../browser/dnd.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { FilterViewPane } from '../../../browser/parts/views/viewPane.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { Memento } from '../../../common/memento.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { Markers, MarkersContextKeys } from '../common/markers.js';
import { FilterOptions } from './markersFilterOptions.js';
import { compareMarkersByUri, Marker, MarkersModel, MarkerTableItem, RelatedInformation, ResourceMarkers } from './markersModel.js';
import { MarkersTable } from './markersTable.js';
import { Filter, MarkerRenderer, MarkersViewModel, MarkersWidgetAccessibilityProvider, RelatedInformationRenderer, ResourceMarkersRenderer, VirtualDelegate } from './markersTreeViewer.js';
import { MarkersFilters } from './markersViewActions.js';
import Messages from './messages.js';
function createResourceMarkersIterator(resourceMarkers) {
    return Iterable.map(resourceMarkers.markers, m => {
        const relatedInformationIt = Iterable.from(m.relatedInformation);
        const children = Iterable.map(relatedInformationIt, r => ({ element: r }));
        return { element: m, children };
    });
}
let MarkersView = class MarkersView extends FilterViewPane {
    constructor(options, instantiationService, viewDescriptorService, editorService, configurationService, markerService, contextKeyService, workspaceContextService, contextMenuService, uriIdentityService, keybindingService, storageService, openerService, themeService, hoverService) {
        const memento = new Memento(Markers.MARKERS_VIEW_STORAGE_ID, storageService);
        const panelState = memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        super({
            ...options,
            filterOptions: {
                ariaLabel: Messages.MARKERS_PANEL_FILTER_ARIA_LABEL,
                placeholder: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER,
                focusContextKey: MarkersContextKeys.MarkerViewFilterFocusContextKey.key,
                text: panelState.filter || '',
                history: panelState.filterHistory || []
            }
        }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.editorService = editorService;
        this.markerService = markerService;
        this.workspaceContextService = workspaceContextService;
        this.uriIdentityService = uriIdentityService;
        this.lastSelectedRelativeTop = 0;
        this.currentActiveResource = null;
        this.onVisibleDisposables = this._register(new DisposableStore());
        this.widgetDisposables = this._register(new DisposableStore());
        this.currentHeight = 0;
        this.currentWidth = 0;
        this.cachedFilterStats = undefined;
        this.currentResourceGotAddedToMarkersData = false;
        this.onDidChangeVisibility = this.onDidChangeBodyVisibility;
        this.memento = memento;
        this.panelState = panelState;
        this.markersModel = this._register(instantiationService.createInstance(MarkersModel));
        this.markersViewModel = this._register(instantiationService.createInstance(MarkersViewModel, this.panelState.multiline, this.panelState.viewMode ?? this.getDefaultViewMode()));
        this._register(this.onDidChangeVisibility(visible => this.onDidChangeMarkersViewVisibility(visible)));
        this._register(this.markersViewModel.onDidChangeViewMode(_ => this.onDidChangeViewMode()));
        this.widgetAccessibilityProvider = instantiationService.createInstance(MarkersWidgetAccessibilityProvider);
        this.widgetIdentityProvider = { getId(element) { return element.id; } };
        this.setCurrentActiveEditor();
        this.filter = new Filter(FilterOptions.EMPTY(uriIdentityService));
        this.rangeHighlightDecorations = this._register(this.instantiationService.createInstance(RangeHighlightDecorations));
        this.filters = this._register(new MarkersFilters({
            filterHistory: this.panelState.filterHistory || [],
            showErrors: this.panelState.showErrors !== false,
            showWarnings: this.panelState.showWarnings !== false,
            showInfos: this.panelState.showInfos !== false,
            excludedFiles: !!this.panelState.useFilesExclude,
            activeFile: !!this.panelState.activeFile,
        }, this.contextKeyService));
        // Update filter, whenever the "files.exclude" setting is changed
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (this.filters.excludedFiles && e.affectsConfiguration('files.exclude')) {
                this.updateFilter();
            }
        }));
    }
    render() {
        super.render();
        this._register(registerNavigableContainer({
            name: 'markersView',
            focusNotifiers: [this, this.filterWidget],
            focusNextWidget: () => {
                if (this.filterWidget.hasFocus()) {
                    this.focus();
                }
            },
            focusPreviousWidget: () => {
                if (!this.filterWidget.hasFocus()) {
                    this.focusFilter();
                }
            }
        }));
    }
    renderBody(parent) {
        super.renderBody(parent);
        parent.classList.add('markers-panel');
        this._register(dom.addDisposableListener(parent, 'keydown', e => {
            const event = new StandardKeyboardEvent(e);
            if (!this.keybindingService.mightProducePrintableCharacter(event)) {
                return;
            }
            const result = this.keybindingService.softDispatch(event, event.target);
            if (result.kind === 1 /* ResultKind.MoreChordsNeeded */ || result.kind === 2 /* ResultKind.KbFound */) {
                return;
            }
            this.focusFilter();
        }));
        const panelContainer = dom.append(parent, dom.$('.markers-panel-container'));
        this.createArialLabelElement(panelContainer);
        this.createMessageBox(panelContainer);
        this.widgetContainer = dom.append(panelContainer, dom.$('.widget-container'));
        this.createWidget(this.widgetContainer);
        this.updateFilter();
        this.renderContent();
    }
    getTitle() {
        return Messages.MARKERS_PANEL_TITLE_PROBLEMS.value;
    }
    layoutBodyContent(height = this.currentHeight, width = this.currentWidth) {
        if (this.messageBoxContainer) {
            this.messageBoxContainer.style.height = `${height}px`;
        }
        this.widget.layout(height, width);
        this.currentHeight = height;
        this.currentWidth = width;
    }
    focus() {
        super.focus();
        if (dom.isActiveElement(this.widget.getHTMLElement())) {
            return;
        }
        if (this.hasNoProblems()) {
            this.messageBoxContainer.focus();
        }
        else {
            this.widget.domFocus();
            this.widget.setMarkerSelection();
        }
    }
    focusFilter() {
        this.filterWidget.focus();
    }
    updateBadge(total, filtered) {
        this.filterWidget.updateBadge(total === filtered || total === 0 ? undefined : localize('showing filtered problems', "Showing {0} of {1}", filtered, total));
    }
    checkMoreFilters() {
        this.filterWidget.checkMoreFilters(!this.filters.showErrors || !this.filters.showWarnings || !this.filters.showInfos || this.filters.excludedFiles || this.filters.activeFile);
    }
    clearFilterText() {
        this.filterWidget.setFilterText('');
    }
    showQuickFixes(marker) {
        const viewModel = this.markersViewModel.getViewModel(marker);
        if (viewModel) {
            viewModel.quickFixAction.run();
        }
    }
    openFileAtElement(element, preserveFocus, sideByside, pinned) {
        const { resource, selection } = element instanceof Marker ? { resource: element.resource, selection: element.range } :
            element instanceof RelatedInformation ? { resource: element.raw.resource, selection: element.raw } :
                'marker' in element ? { resource: element.marker.resource, selection: element.marker.range } :
                    { resource: null, selection: null };
        if (resource && selection) {
            this.editorService.openEditor({
                resource,
                options: {
                    selection,
                    preserveFocus,
                    pinned,
                    revealIfVisible: true
                },
            }, sideByside ? SIDE_GROUP : ACTIVE_GROUP).then(editor => {
                if (editor && preserveFocus) {
                    this.rangeHighlightDecorations.highlightRange({ resource, range: selection }, editor.getControl());
                }
                else {
                    this.rangeHighlightDecorations.removeHighlightRange();
                }
            });
            return true;
        }
        else {
            this.rangeHighlightDecorations.removeHighlightRange();
        }
        return false;
    }
    refreshPanel(markerOrChange) {
        if (this.isVisible()) {
            const hasSelection = this.widget.getSelection().length > 0;
            if (markerOrChange) {
                if (markerOrChange instanceof Marker) {
                    this.widget.updateMarker(markerOrChange);
                }
                else {
                    if (markerOrChange.added.size || markerOrChange.removed.size || this.filters.activeFile) {
                        // Reset complete widget
                        this.resetWidget();
                    }
                    else {
                        // Update resource
                        this.widget.update([...markerOrChange.updated]);
                    }
                }
            }
            else {
                // Reset complete widget
                this.resetWidget();
            }
            if (hasSelection) {
                this.widget.setMarkerSelection();
            }
            this.cachedFilterStats = undefined;
            const { total, filtered } = this.getFilterStats();
            this.toggleVisibility(total === 0 || filtered === 0);
            this.renderMessage();
            this.updateBadge(total, filtered);
            this.checkMoreFilters();
        }
    }
    onDidChangeViewState(marker) {
        this.refreshPanel(marker);
    }
    resetWidget() {
        this.widget.reset(this.getResourceMarkers());
    }
    updateFilter() {
        this.filter.options = new FilterOptions(this.filterWidget.getFilterText(), this.getFilesExcludeExpressions(), this.filters.showWarnings, this.filters.showErrors, this.filters.showInfos, this.uriIdentityService);
        this.widget.filterMarkers(this.getResourceMarkers(), this.filter.options);
        this.cachedFilterStats = undefined;
        const { total, filtered } = this.getFilterStats();
        this.toggleVisibility(total === 0 || filtered === 0);
        this.renderMessage();
        this.updateBadge(total, filtered);
        this.checkMoreFilters();
    }
    getDefaultViewMode() {
        switch (this.configurationService.getValue('problems.defaultViewMode')) {
            case 'table':
                return "table" /* MarkersViewMode.Table */;
            case 'tree':
                return "tree" /* MarkersViewMode.Tree */;
            default:
                return "tree" /* MarkersViewMode.Tree */;
        }
    }
    getFilesExcludeExpressions() {
        if (!this.filters.excludedFiles) {
            return [];
        }
        const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
        return workspaceFolders.length
            ? workspaceFolders.map(workspaceFolder => ({ root: workspaceFolder.uri, expression: this.getFilesExclude(workspaceFolder.uri) }))
            : this.getFilesExclude();
    }
    getFilesExclude(resource) {
        return deepClone(this.configurationService.getValue('files.exclude', { resource })) || {};
    }
    getResourceMarkers() {
        if (!this.filters.activeFile) {
            return this.markersModel.resourceMarkers;
        }
        let resourceMarkers = [];
        if (this.currentActiveResource) {
            const activeResourceMarkers = this.markersModel.getResourceMarkers(this.currentActiveResource);
            if (activeResourceMarkers) {
                resourceMarkers = [activeResourceMarkers];
            }
        }
        return resourceMarkers;
    }
    createMessageBox(parent) {
        this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
        this.messageBoxContainer.setAttribute('aria-labelledby', 'markers-panel-arialabel');
    }
    createArialLabelElement(parent) {
        this.ariaLabelElement = dom.append(parent, dom.$(''));
        this.ariaLabelElement.setAttribute('id', 'markers-panel-arialabel');
    }
    createWidget(parent) {
        this.widget = this.markersViewModel.viewMode === "table" /* MarkersViewMode.Table */ ? this.createTable(parent) : this.createTree(parent);
        this.widgetDisposables.add(this.widget);
        const markerFocusContextKey = MarkersContextKeys.MarkerFocusContextKey.bindTo(this.widget.contextKeyService);
        const relatedInformationFocusContextKey = MarkersContextKeys.RelatedInformationFocusContextKey.bindTo(this.widget.contextKeyService);
        this.widgetDisposables.add(this.widget.onDidChangeFocus(focus => {
            markerFocusContextKey.set(focus.elements.some(e => e instanceof Marker));
            relatedInformationFocusContextKey.set(focus.elements.some(e => e instanceof RelatedInformation));
        }));
        this.widgetDisposables.add(Event.debounce(this.widget.onDidOpen, (last, event) => event, 75, true)(options => {
            this.openFileAtElement(options.element, !!options.editorOptions.preserveFocus, options.sideBySide, !!options.editorOptions.pinned);
        }));
        this.widgetDisposables.add(Event.any(this.widget.onDidChangeSelection, this.widget.onDidChangeFocus)(() => {
            const elements = [...this.widget.getSelection(), ...this.widget.getFocus()];
            for (const element of elements) {
                if (element instanceof Marker) {
                    const viewModel = this.markersViewModel.getViewModel(element);
                    viewModel?.showLightBulb();
                }
            }
        }));
        this.widgetDisposables.add(this.widget.onContextMenu(this.onContextMenu, this));
        this.widgetDisposables.add(this.widget.onDidChangeSelection(this.onSelected, this));
    }
    createTable(parent) {
        const table = this.instantiationService.createInstance(MarkersTable, dom.append(parent, dom.$('.markers-table-container')), this.markersViewModel, this.getResourceMarkers(), this.filter.options, {
            accessibilityProvider: this.widgetAccessibilityProvider,
            dnd: this.instantiationService.createInstance(ResourceListDnDHandler, (element) => {
                if (element instanceof MarkerTableItem) {
                    return withSelection(element.resource, element.range);
                }
                return null;
            }),
            horizontalScrolling: false,
            identityProvider: this.widgetIdentityProvider,
            multipleSelectionSupport: true,
            selectionNavigation: true
        });
        return table;
    }
    createTree(parent) {
        const onDidChangeRenderNodeCount = new Relay();
        const treeLabels = this.instantiationService.createInstance(ResourceLabels, this);
        const virtualDelegate = new VirtualDelegate(this.markersViewModel);
        const renderers = [
            this.instantiationService.createInstance(ResourceMarkersRenderer, treeLabels, onDidChangeRenderNodeCount.event),
            this.instantiationService.createInstance(MarkerRenderer, this.markersViewModel),
            this.instantiationService.createInstance(RelatedInformationRenderer)
        ];
        const tree = this.instantiationService.createInstance(MarkersTree, 'MarkersView', dom.append(parent, dom.$('.tree-container.show-file-icons')), virtualDelegate, renderers, {
            filter: this.filter,
            accessibilityProvider: this.widgetAccessibilityProvider,
            identityProvider: this.widgetIdentityProvider,
            dnd: this.instantiationService.createInstance(MarkersListDnDHandler),
            expandOnlyOnTwistieClick: (e) => e instanceof Marker && e.relatedInformation.length > 0,
            overrideStyles: this.getLocationBasedColors().listOverrideStyles,
            selectionNavigation: true,
            multipleSelectionSupport: true,
        });
        onDidChangeRenderNodeCount.input = tree.onDidChangeRenderNodeCount;
        return tree;
    }
    collapseAll() {
        this.widget.collapseMarkers();
    }
    setMultiline(multiline) {
        this.markersViewModel.multiline = multiline;
    }
    setViewMode(viewMode) {
        this.markersViewModel.viewMode = viewMode;
    }
    onDidChangeMarkersViewVisibility(visible) {
        this.onVisibleDisposables.clear();
        if (visible) {
            for (const disposable of this.reInitialize()) {
                this.onVisibleDisposables.add(disposable);
            }
            this.refreshPanel();
        }
    }
    reInitialize() {
        const disposables = [];
        // Markers Model
        const readMarkers = (resource) => this.markerService.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
        this.markersModel.setResourceMarkers(groupBy(readMarkers(), compareMarkersByUri).map(group => [group[0].resource, group]));
        disposables.push(Event.debounce(this.markerService.onMarkerChanged, (resourcesMap, resources) => {
            resourcesMap = resourcesMap || new ResourceMap();
            resources.forEach(resource => resourcesMap.set(resource, resource));
            return resourcesMap;
        }, 64)(resourcesMap => {
            this.markersModel.setResourceMarkers([...resourcesMap.values()].map(resource => [resource, readMarkers(resource)]));
        }));
        disposables.push(Event.any(this.markersModel.onDidChange, this.editorService.onDidActiveEditorChange)(changes => {
            if (changes) {
                this.onDidChangeModel(changes);
            }
            else {
                this.onActiveEditorChanged();
            }
        }));
        disposables.push(toDisposable(() => this.markersModel.reset()));
        // Markers View Model
        this.markersModel.resourceMarkers.forEach(resourceMarker => resourceMarker.markers.forEach(marker => this.markersViewModel.add(marker)));
        disposables.push(this.markersViewModel.onDidChange(marker => this.onDidChangeViewState(marker)));
        disposables.push(toDisposable(() => this.markersModel.resourceMarkers.forEach(resourceMarker => this.markersViewModel.remove(resourceMarker.resource))));
        // Markers Filters
        disposables.push(this.filters.onDidChange((event) => {
            if (event.activeFile) {
                this.refreshPanel();
            }
            else if (event.excludedFiles || event.showWarnings || event.showErrors || event.showInfos) {
                this.updateFilter();
            }
        }));
        disposables.push(this.filterWidget.onDidChangeFilterText(e => this.updateFilter()));
        disposables.push(toDisposable(() => { this.cachedFilterStats = undefined; }));
        disposables.push(toDisposable(() => this.rangeHighlightDecorations.removeHighlightRange()));
        return disposables;
    }
    onDidChangeModel(change) {
        const resourceMarkers = [...change.added, ...change.removed, ...change.updated];
        const resources = [];
        for (const { resource } of resourceMarkers) {
            this.markersViewModel.remove(resource);
            const resourceMarkers = this.markersModel.getResourceMarkers(resource);
            if (resourceMarkers) {
                for (const marker of resourceMarkers.markers) {
                    this.markersViewModel.add(marker);
                }
            }
            resources.push(resource);
        }
        this.currentResourceGotAddedToMarkersData = this.currentResourceGotAddedToMarkersData || this.isCurrentResourceGotAddedToMarkersData(resources);
        this.refreshPanel(change);
        this.updateRangeHighlights();
        if (this.currentResourceGotAddedToMarkersData) {
            this.autoReveal();
            this.currentResourceGotAddedToMarkersData = false;
        }
    }
    onDidChangeViewMode() {
        if (this.widgetContainer && this.widget) {
            this.widgetContainer.textContent = '';
            this.widgetDisposables.clear();
        }
        // Save selection
        const selection = new Set();
        for (const marker of this.widget.getSelection()) {
            if (marker instanceof ResourceMarkers) {
                marker.markers.forEach(m => selection.add(m));
            }
            else if (marker instanceof Marker || marker instanceof MarkerTableItem) {
                selection.add(marker);
            }
        }
        // Save focus
        const focus = new Set();
        for (const marker of this.widget.getFocus()) {
            if (marker instanceof Marker || marker instanceof MarkerTableItem) {
                focus.add(marker);
            }
        }
        // Create new widget
        this.createWidget(this.widgetContainer);
        this.refreshPanel();
        // Restore selection
        if (selection.size > 0) {
            this.widget.setMarkerSelection(Array.from(selection), Array.from(focus));
            this.widget.domFocus();
        }
    }
    isCurrentResourceGotAddedToMarkersData(changedResources) {
        const currentlyActiveResource = this.currentActiveResource;
        if (!currentlyActiveResource) {
            return false;
        }
        const resourceForCurrentActiveResource = this.getResourceForCurrentActiveResource();
        if (resourceForCurrentActiveResource) {
            return false;
        }
        return changedResources.some(r => r.toString() === currentlyActiveResource.toString());
    }
    onActiveEditorChanged() {
        this.setCurrentActiveEditor();
        if (this.filters.activeFile) {
            this.refreshPanel();
        }
        this.autoReveal();
    }
    setCurrentActiveEditor() {
        const activeEditor = this.editorService.activeEditor;
        this.currentActiveResource = activeEditor ? EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }) ?? null : null;
    }
    onSelected() {
        const selection = this.widget.getSelection();
        if (selection && selection.length > 0) {
            this.lastSelectedRelativeTop = this.widget.getRelativeTop(selection[0]) || 0;
        }
    }
    hasNoProblems() {
        const { total, filtered } = this.getFilterStats();
        return total === 0 || filtered === 0;
    }
    renderContent() {
        this.cachedFilterStats = undefined;
        this.resetWidget();
        this.toggleVisibility(this.hasNoProblems());
        this.renderMessage();
    }
    renderMessage() {
        if (!this.messageBoxContainer || !this.ariaLabelElement) {
            return;
        }
        dom.clearNode(this.messageBoxContainer);
        const { total, filtered } = this.getFilterStats();
        if (filtered === 0) {
            this.messageBoxContainer.style.display = 'block';
            this.messageBoxContainer.setAttribute('tabIndex', '0');
            if (this.filters.activeFile) {
                this.renderFilterMessageForActiveFile(this.messageBoxContainer);
            }
            else {
                if (total > 0) {
                    this.renderFilteredByFilterMessage(this.messageBoxContainer);
                }
                else {
                    this.renderNoProblemsMessage(this.messageBoxContainer);
                }
            }
        }
        else {
            this.messageBoxContainer.style.display = 'none';
            if (filtered === total) {
                this.setAriaLabel(localize('No problems filtered', "Showing {0} problems", total));
            }
            else {
                this.setAriaLabel(localize('problems filtered', "Showing {0} of {1} problems", filtered, total));
            }
            this.messageBoxContainer.removeAttribute('tabIndex');
        }
    }
    renderFilterMessageForActiveFile(container) {
        if (this.currentActiveResource && this.markersModel.getResourceMarkers(this.currentActiveResource)) {
            this.renderFilteredByFilterMessage(container);
        }
        else {
            this.renderNoProblemsMessageForActiveFile(container);
        }
    }
    renderFilteredByFilterMessage(container) {
        const span1 = dom.append(container, dom.$('span'));
        span1.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS;
        const link = dom.append(container, dom.$('a.messageAction'));
        link.textContent = localize('clearFilter', "Clear Filters");
        link.setAttribute('tabIndex', '0');
        const span2 = dom.append(container, dom.$('span'));
        span2.textContent = '.';
        dom.addStandardDisposableListener(link, dom.EventType.CLICK, () => this.clearFilters());
        dom.addStandardDisposableListener(link, dom.EventType.KEY_DOWN, (e) => {
            if (e.equals(3 /* KeyCode.Enter */) || e.equals(10 /* KeyCode.Space */)) {
                this.clearFilters();
                e.stopPropagation();
            }
        });
        this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS);
    }
    renderNoProblemsMessageForActiveFile(container) {
        const span = dom.append(container, dom.$('span'));
        span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_ACTIVE_FILE_BUILT;
        this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_ACTIVE_FILE_BUILT);
    }
    renderNoProblemsMessage(container) {
        const span = dom.append(container, dom.$('span'));
        span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT;
        this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT);
    }
    setAriaLabel(label) {
        this.widget.setAriaLabel(label);
        this.ariaLabelElement.setAttribute('aria-label', label);
    }
    clearFilters() {
        this.filterWidget.setFilterText('');
        this.filters.excludedFiles = false;
        this.filters.showErrors = true;
        this.filters.showWarnings = true;
        this.filters.showInfos = true;
    }
    autoReveal(focus = false) {
        // No need to auto reveal if active file filter is on
        if (this.filters.activeFile) {
            return;
        }
        const autoReveal = this.configurationService.getValue('problems.autoReveal');
        if (typeof autoReveal === 'boolean' && autoReveal) {
            const currentActiveResource = this.getResourceForCurrentActiveResource();
            this.widget.revealMarkers(currentActiveResource, focus, this.lastSelectedRelativeTop);
        }
    }
    getResourceForCurrentActiveResource() {
        return this.currentActiveResource ? this.markersModel.getResourceMarkers(this.currentActiveResource) : null;
    }
    updateRangeHighlights() {
        this.rangeHighlightDecorations.removeHighlightRange();
        if (dom.isActiveElement(this.widget.getHTMLElement())) {
            this.highlightCurrentSelectedMarkerRange();
        }
    }
    highlightCurrentSelectedMarkerRange() {
        const selections = this.widget.getSelection() ?? [];
        if (selections.length !== 1) {
            return;
        }
        const selection = selections[0];
        if (!(selection instanceof Marker)) {
            return;
        }
        this.rangeHighlightDecorations.highlightRange(selection);
    }
    onContextMenu(e) {
        const element = e.element;
        if (!element) {
            return;
        }
        e.browserEvent.preventDefault();
        e.browserEvent.stopPropagation();
        this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            menuId: MenuId.ProblemsPanelContext,
            contextKeyService: this.widget.contextKeyService,
            getActions: () => this.getMenuActions(element),
            getActionViewItem: (action) => {
                const keybinding = this.keybindingService.lookupKeybinding(action.id);
                if (keybinding) {
                    return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
                }
                return undefined;
            },
            onHide: (wasCancelled) => {
                if (wasCancelled) {
                    this.widget.domFocus();
                }
            }
        });
    }
    getMenuActions(element) {
        const result = [];
        if (element instanceof Marker) {
            const viewModel = this.markersViewModel.getViewModel(element);
            if (viewModel) {
                const quickFixActions = viewModel.quickFixAction.quickFixes;
                if (quickFixActions.length) {
                    result.push(...quickFixActions);
                    result.push(new Separator());
                }
            }
        }
        return result;
    }
    getFocusElement() {
        return this.widget.getFocus()[0] ?? undefined;
    }
    getFocusedSelectedElements() {
        const focus = this.getFocusElement();
        if (!focus) {
            return null;
        }
        const selection = this.widget.getSelection();
        if (selection.includes(focus)) {
            const result = [];
            for (const selected of selection) {
                if (selected) {
                    result.push(selected);
                }
            }
            return result;
        }
        else {
            return [focus];
        }
    }
    getAllResourceMarkers() {
        return this.markersModel.resourceMarkers;
    }
    getFilterStats() {
        if (!this.cachedFilterStats) {
            this.cachedFilterStats = {
                total: this.markersModel.total,
                filtered: this.widget?.getVisibleItemCount() ?? 0
            };
        }
        return this.cachedFilterStats;
    }
    toggleVisibility(hide) {
        this.widget.toggleVisibility(hide);
        this.layoutBodyContent();
    }
    saveState() {
        this.panelState.filter = this.filterWidget.getFilterText();
        this.panelState.filterHistory = this.filters.filterHistory;
        this.panelState.showErrors = this.filters.showErrors;
        this.panelState.showWarnings = this.filters.showWarnings;
        this.panelState.showInfos = this.filters.showInfos;
        this.panelState.useFilesExclude = this.filters.excludedFiles;
        this.panelState.activeFile = this.filters.activeFile;
        this.panelState.multiline = this.markersViewModel.multiline;
        this.panelState.viewMode = this.markersViewModel.viewMode;
        this.memento.saveMemento();
        super.saveState();
    }
    dispose() {
        super.dispose();
    }
};
MarkersView = __decorate([
    __param(1, IInstantiationService),
    __param(2, IViewDescriptorService),
    __param(3, IEditorService),
    __param(4, IConfigurationService),
    __param(5, IMarkerService),
    __param(6, IContextKeyService),
    __param(7, IWorkspaceContextService),
    __param(8, IContextMenuService),
    __param(9, IUriIdentityService),
    __param(10, IKeybindingService),
    __param(11, IStorageService),
    __param(12, IOpenerService),
    __param(13, IThemeService),
    __param(14, IHoverService)
], MarkersView);
export { MarkersView };
let MarkersTree = class MarkersTree extends WorkbenchObjectTree {
    constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, themeService, configurationService) {
        super(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService);
        this.container = container;
        this.visibilityContextKey = MarkersContextKeys.MarkersTreeVisibilityContextKey.bindTo(contextKeyService);
    }
    collapseMarkers() {
        this.collapseAll();
        this.setSelection([]);
        this.setFocus([]);
        this.getHTMLElement().focus();
        this.focusFirst();
    }
    filterMarkers() {
        this.refilter();
    }
    getVisibleItemCount() {
        let filtered = 0;
        const root = this.getNode();
        for (const resourceMarkerNode of root.children) {
            for (const markerNode of resourceMarkerNode.children) {
                if (resourceMarkerNode.visible && markerNode.visible) {
                    filtered++;
                }
            }
        }
        return filtered;
    }
    isVisible() {
        return !this.container.classList.contains('hidden');
    }
    toggleVisibility(hide) {
        this.visibilityContextKey.set(!hide);
        this.container.classList.toggle('hidden', hide);
    }
    reset(resourceMarkers) {
        this.setChildren(null, Iterable.map(resourceMarkers, m => ({ element: m, children: createResourceMarkersIterator(m) })));
    }
    revealMarkers(activeResource, focus, lastSelectedRelativeTop) {
        if (activeResource) {
            if (this.hasElement(activeResource)) {
                if (!this.isCollapsed(activeResource) && this.hasSelectedMarkerFor(activeResource)) {
                    this.reveal(this.getSelection()[0], lastSelectedRelativeTop);
                    if (focus) {
                        this.setFocus(this.getSelection());
                    }
                }
                else {
                    this.expand(activeResource);
                    this.reveal(activeResource, 0);
                    if (focus) {
                        this.setFocus([activeResource]);
                        this.setSelection([activeResource]);
                    }
                }
            }
        }
        else if (focus) {
            this.setSelection([]);
            this.focusFirst();
        }
    }
    setAriaLabel(label) {
        this.ariaLabel = label;
    }
    setMarkerSelection(selection, focus) {
        if (this.isVisible()) {
            if (selection && selection.length > 0) {
                this.setSelection(selection.map(m => this.findMarkerNode(m)));
                if (focus && focus.length > 0) {
                    this.setFocus(focus.map(f => this.findMarkerNode(f)));
                }
                else {
                    this.setFocus([this.findMarkerNode(selection[0])]);
                }
                this.reveal(this.findMarkerNode(selection[0]));
            }
            else if (this.getSelection().length === 0) {
                const firstVisibleElement = this.firstVisibleElement;
                const marker = firstVisibleElement ?
                    firstVisibleElement instanceof ResourceMarkers ? firstVisibleElement.markers[0] :
                        firstVisibleElement instanceof Marker ? firstVisibleElement : undefined
                    : undefined;
                if (marker) {
                    this.setSelection([marker]);
                    this.setFocus([marker]);
                    this.reveal(marker);
                }
            }
        }
    }
    update(resourceMarkers) {
        for (const resourceMarker of resourceMarkers) {
            if (this.hasElement(resourceMarker)) {
                this.setChildren(resourceMarker, createResourceMarkersIterator(resourceMarker));
                this.rerender(resourceMarker);
            }
        }
    }
    updateMarker(marker) {
        this.rerender(marker);
    }
    findMarkerNode(marker) {
        for (const resourceNode of this.getNode().children) {
            for (const markerNode of resourceNode.children) {
                if (markerNode.element instanceof Marker && markerNode.element.marker === marker.marker) {
                    return markerNode.element;
                }
            }
        }
        return null;
    }
    hasSelectedMarkerFor(resource) {
        const selectedElement = this.getSelection();
        if (selectedElement && selectedElement.length > 0) {
            if (selectedElement[0] instanceof Marker) {
                if (resource.has(selectedElement[0].marker.resource)) {
                    return true;
                }
            }
        }
        return false;
    }
    dispose() {
        super.dispose();
    }
    layout(height, width) {
        this.container.style.height = `${height}px`;
        super.layout(height, width);
    }
};
MarkersTree = __decorate([
    __param(5, IInstantiationService),
    __param(6, IContextKeyService),
    __param(7, IListService),
    __param(8, IThemeService),
    __param(9, IConfigurationService)
], MarkersTree);
let MarkersListDnDHandler = class MarkersListDnDHandler extends ResourceListDnDHandler {
    constructor(instantiationService) {
        super(element => {
            if (element instanceof MarkerTableItem) {
                return withSelection(element.resource, element.range);
            }
            else if (element instanceof ResourceMarkers) {
                return element.resource;
            }
            else if (element instanceof Marker) {
                return withSelection(element.resource, element.range);
            }
            else if (element instanceof RelatedInformation) {
                return withSelection(element.raw.resource, element.raw);
            }
            return null;
        }, instantiationService);
    }
    onWillDragElements(elements, originalEvent) {
        const data = elements.map((e) => {
            if (e instanceof RelatedInformation || e instanceof Marker) {
                return e.marker;
            }
            if (e instanceof ResourceMarkers) {
                return { uri: e.resource };
            }
            return undefined;
        }).filter(isDefined);
        if (!data.length) {
            return;
        }
        fillInMarkersDragData(data, originalEvent);
    }
};
MarkersListDnDHandler = __decorate([
    __param(0, IInstantiationService)
], MarkersListDnDHandler);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc1ZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tYXJrZXJzL2Jyb3dzZXIvbWFya2Vyc1ZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxxQkFBcUIsQ0FBQztBQUU3QixPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBa0IscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFJMUYsT0FBTyxFQUFXLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDeEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkcs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