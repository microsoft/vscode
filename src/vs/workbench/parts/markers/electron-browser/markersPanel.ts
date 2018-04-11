/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';

import * as errors from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { Panel } from 'vs/workbench/browser/panel';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/electron-browser/constants';
import { Marker, ResourceMarkers, RelatedInformation } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { Controller } from 'vs/workbench/parts/markers/electron-browser/markersTreeController';
import * as Viewer from 'vs/workbench/parts/markers/electron-browser/markersTreeViewer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CollapseAllAction, FilterInputActionItem, FilterByFilesExcludeAction, FilterAction } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { RangeHighlightDecorations } from 'vs/workbench/browser/parts/editor/rangeDecorations';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { debounceEvent } from 'vs/base/common/event';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { TreeResourceNavigator, WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IMarkersWorkbenchService } from 'vs/workbench/parts/markers/electron-browser/markers';
import { SimpleFileResourceDragAndDrop } from 'vs/workbench/browser/dnd';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Scope } from 'vs/workbench/common/memento';
import { localize } from 'vs/nls';

export class MarkersPanel extends Panel {

	private delayedRefresh: Delayer<void>;

	private lastSelectedRelativeTop: number = 0;
	private currentActiveResource: URI = null;

	private tree: WorkbenchTree;
	private autoExpanded: Set<string>;
	private rangeHighlightDecorations: RangeHighlightDecorations;

	private actions: IAction[];
	private collapseAllAction: IAction;
	private filterInputActionItem: FilterInputActionItem;
	private filterByFilesExcludeAction: FilterByFilesExcludeAction;

	private treeContainer: HTMLElement;
	private messageBoxContainer: HTMLElement;
	private panelSettings: any;

	private currentResourceGotAddedToMarkersData: boolean = false;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IMarkersWorkbenchService private markersWorkbenchService: IMarkersWorkbenchService,
		@IStorageService storageService: IStorageService,
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService, themeService);
		this.delayedRefresh = new Delayer<void>(500);
		this.autoExpanded = new Set<string>();
		this.panelSettings = this.getMemento(storageService, Scope.WORKSPACE);
	}

	public create(parent: HTMLElement): TPromise<void> {
		super.create(parent);

		this.rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);
		this.toUnbind.push(this.rangeHighlightDecorations);

		dom.addClass(parent, 'markers-panel');

		let container = dom.append(parent, dom.$('.markers-panel-container'));

		this.createMessageBox(container);
		this.createTree(container);
		this.createActions();
		this.createListeners();

		this.updateFilter();

		return this.render();
	}

	public getTitle(): string {
		return Messages.MARKERS_PANEL_TITLE_PROBLEMS;
	}

	public layout(dimension: dom.Dimension): void {
		const height = dimension.height - 38;
		this.treeContainer.style.height = `${height}px`;
		this.tree.layout(height, dimension.width);
		this.filterInputActionItem.toggleLayout(dimension.width < 1200);
	}

	public focus(): void {
		if (this.tree.isDOMFocused()) {
			return;
		}

		if (this.markersWorkbenchService.markersModel.hasFilteredResources()) {
			this.tree.domFocus();
			if (this.tree.getSelection().length === 0) {
				this.tree.focusFirst();
			}
			this.highlightCurrentSelectedMarkerRange();
			this.autoReveal(true);
		} else {
			this.messageBoxContainer.focus();
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		const wasVisible = this.isVisible();
		return super.setVisible(visible)
			.then(() => {
				if (this.isVisible()) {
					if (!wasVisible) {
						this.refreshPanel();
					}
				} else {
					this.rangeHighlightDecorations.removeHighlightRange();
				}
			});
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.createActions();
		}
		return this.actions;
	}

	public openFileAtElement(element: any, preserveFocus: boolean, sideByside: boolean, pinned: boolean): boolean {
		const { resource, selection } = element instanceof Marker ? { resource: element.resource, selection: element.range } :
			element instanceof RelatedInformation ? { resource: element.raw.resource, selection: element.raw } : { resource: null, selection: null };
		if (resource && selection) {
			this.editorService.openEditor({
				resource,
				options: {
					selection,
					preserveFocus,
					pinned,
					revealIfVisible: true
				},
			}, sideByside).done(editor => {
				if (editor && preserveFocus) {
					this.rangeHighlightDecorations.highlightRange({ resource, range: selection }, <ICodeEditor>editor.getControl());
				} else {
					this.rangeHighlightDecorations.removeHighlightRange();
				}
			}, errors.onUnexpectedError);
			return true;
		} else {
			this.rangeHighlightDecorations.removeHighlightRange();
		}
		return false;
	}

	private refreshPanel(): TPromise<any> {
		if (this.isVisible()) {
			this.collapseAllAction.enabled = this.markersWorkbenchService.markersModel.hasFilteredResources();
			dom.toggleClass(this.treeContainer, 'hidden', !this.markersWorkbenchService.markersModel.hasFilteredResources());
			this.renderMessage();
			if (this.markersWorkbenchService.markersModel.hasFilteredResources()) {
				return this.tree.refresh().then(() => {
					this.autoExpand();
				});
			}
		}
		return TPromise.as(null);
	}

	private updateFilter() {
		this.autoExpanded = new Set<string>();
		this.markersWorkbenchService.filter({ filterText: this.filterInputActionItem.getFilterText(), useFilesExclude: this.filterByFilesExcludeAction.checked });
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
	}

	private createTree(parent: HTMLElement): void {
		this.treeContainer = dom.append(parent, dom.$('.tree-container'));
		dom.addClass(this.treeContainer, 'show-file-icons');
		const renderer = this.instantiationService.createInstance(Viewer.Renderer);
		const dnd = this.instantiationService.createInstance(SimpleFileResourceDragAndDrop, obj => obj instanceof ResourceMarkers ? obj.uri : void 0);
		const controller = this.instantiationService.createInstance(Controller);
		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new Viewer.DataSource(),
			filter: new Viewer.DataFilter(),
			renderer,
			controller,
			accessibilityProvider: new Viewer.MarkersTreeAccessibilityProvider(),
			dnd
		}, {
				twistiePixels: 20,
				ariaLabel: Messages.MARKERS_PANEL_ARIA_LABEL_PROBLEMS_TREE
			});

		const markerFocusContextKey = Constants.MarkerFocusContextKey.bindTo(this.tree.contextKeyService);
		const relatedInformationFocusContextKey = Constants.RelatedInformationFocusContextKey.bindTo(this.tree.contextKeyService);
		this._register(this.tree.onDidChangeFocus((e: { focus: any }) => {
			markerFocusContextKey.set(e.focus instanceof Marker);
			relatedInformationFocusContextKey.set(e.focus instanceof RelatedInformation);
		}));
		const focusTracker = this._register(dom.trackFocus(this.tree.getHTMLElement()));
		this._register(focusTracker.onDidBlur(() => {
			markerFocusContextKey.set(false);
			relatedInformationFocusContextKey.set(false);
		}));

		const markersNavigator = this._register(new TreeResourceNavigator(this.tree, { openOnFocus: true }));
		this._register(debounceEvent(markersNavigator.openResource, (last, event) => event, 75, true)(options => {
			this.openFileAtElement(options.element, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
		}));
	}

	private createActions(): void {
		this.collapseAllAction = this.instantiationService.createInstance(CollapseAllAction, this.tree, true);
		const filterAction = this.instantiationService.createInstance(FilterAction);
		this.filterInputActionItem = this.instantiationService.createInstance(FilterInputActionItem, this.panelSettings['filter'] || '', this.panelSettings['filterHistory'] || [], filterAction);
		this.filterByFilesExcludeAction = new FilterByFilesExcludeAction(this.panelSettings['useFilesExclude']);
		this.actions = [filterAction, this.filterByFilesExcludeAction, this.collapseAllAction];
	}

	private createListeners(): void {
		this.toUnbind.push(this.markersWorkbenchService.onDidChange(resources => this.onDidChange(resources)));
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(this.onEditorsChanged, this));
		this.toUnbind.push(this.tree.onDidChangeSelection(() => this.onSelected()));
		this.toUnbind.push(this.filterInputActionItem.onDidChange(() => this.updateFilter()));
		this.toUnbind.push(this.filterByFilesExcludeAction.onDidCheck(() => this.updateFilter()));
		this.actions.forEach(a => this.toUnbind.push(a));
	}

	private onDidChange(resources: URI[]) {
		this.currentResourceGotAddedToMarkersData = this.currentResourceGotAddedToMarkersData || this.isCurrentResourceGotAddedToMarkersData(resources);
		this.updateResources(resources);
		this.delayedRefresh.trigger(() => {
			this.refreshPanel();
			this.updateRangeHighlights();
			if (this.currentResourceGotAddedToMarkersData) {
				this.autoReveal();
				this.currentResourceGotAddedToMarkersData = false;
			}
		});
	}

	private isCurrentResourceGotAddedToMarkersData(changedResources: URI[]) {
		if (!this.currentActiveResource) {
			return false;
		}
		const resourceForCurrentActiveResource = this.getResourceForCurrentActiveResource();
		if (resourceForCurrentActiveResource) {
			return false;
		}
		return changedResources.some(r => r.toString() === this.currentActiveResource.toString());
	}

	private onEditorsChanged(): void {
		const activeInput = this.editorService.getActiveEditorInput();
		this.currentActiveResource = activeInput ? activeInput.getResource() : void 0;
		this.autoReveal();
	}

	private onSelected(): void {
		let selection = this.tree.getSelection();
		if (selection && selection.length > 0) {
			this.lastSelectedRelativeTop = this.tree.getRelativeTop(selection[0]);
		}
	}

	private updateResources(resources: URI[]) {
		for (const resource of resources) {
			if (!this.markersWorkbenchService.markersModel.hasResource(resource)) {
				this.autoExpanded.delete(resource.toString());
			}
		}
	}

	private render(): TPromise<void> {
		dom.toggleClass(this.treeContainer, 'hidden', !this.markersWorkbenchService.markersModel.hasFilteredResources());
		return this.tree.setInput(this.markersWorkbenchService.markersModel)
			.then(() => {
				this.renderMessage();
				this.autoExpand();
			});
	}

	private renderMessage(): void {
		const markersModel = this.markersWorkbenchService.markersModel;
		const hasFilteredResources = markersModel.hasFilteredResources();
		dom.clearNode(this.messageBoxContainer);
		dom.toggleClass(this.messageBoxContainer, 'hidden', hasFilteredResources);
		if (!hasFilteredResources) {
			if (markersModel.hasResources()) {
				if (markersModel.filterOptions.filter) {
					this.renderFilteredByFilterMessage(this.messageBoxContainer);
				} else {
					this.renderFilteredByFilesExcludeMessage(this.messageBoxContainer);
				}
			} else {
				this.renderNoProblemsMessage(this.messageBoxContainer);
			}
		}
	}

	private renderFilteredByFilesExcludeMessage(container: HTMLElement) {
		const span1 = dom.append(container, dom.$('span'));
		span1.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_FILE_EXCLUSIONS_FILTER;
		const link = dom.append(container, dom.$('a.messageAction'));
		link.textContent = localize('disableFilesExclude', "Disable Files Exclude.");
		link.setAttribute('tabIndex', '0');
		dom.addDisposableListener(link, dom.EventType.CLICK, () => this.filterByFilesExcludeAction.checked = false);
	}

	private renderFilteredByFilterMessage(container: HTMLElement) {
		const span1 = dom.append(container, dom.$('span'));
		span1.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS;
		const link = dom.append(container, dom.$('a.messageAction'));
		link.textContent = localize('clearFilter', "Clear Filter.");
		link.setAttribute('tabIndex', '0');
		dom.addDisposableListener(link, dom.EventType.CLICK, () => this.filterInputActionItem.clear());
	}

	private renderNoProblemsMessage(container: HTMLElement) {
		const span = dom.append(container, dom.$('span'));
		span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT;
	}

	private autoExpand(): void {
		this.markersWorkbenchService.markersModel.forEachFilteredResource(resource => {
			if (!this.autoExpanded.has(resource.uri.toString())) {
				this.tree.expand(resource).done(null, errors.onUnexpectedError);
				this.autoExpanded.add(resource.uri.toString());
			}
		});
	}

	private autoReveal(focus: boolean = false): void {
		let autoReveal = this.configurationService.getValue<boolean>('problems.autoReveal');
		if (typeof autoReveal === 'boolean' && autoReveal) {
			this.revealMarkersForCurrentActiveEditor(focus);
		}
	}

	private revealMarkersForCurrentActiveEditor(focus: boolean = false): void {
		let currentActiveResource = this.getResourceForCurrentActiveResource();
		if (currentActiveResource) {
			if (this.tree.isExpanded(currentActiveResource) && this.hasSelectedMarkerFor(currentActiveResource)) {
				this.tree.reveal(this.tree.getSelection()[0], this.lastSelectedRelativeTop);
				if (focus) {
					this.tree.setFocus(this.tree.getSelection()[0]);
				}
			} else {
				this.tree.reveal(currentActiveResource, 0);
				if (focus) {
					this.tree.setFocus(currentActiveResource);
					this.tree.setSelection([currentActiveResource]);
				}
			}
		} else if (focus) {
			this.tree.setSelection([]);
			this.tree.focusFirst();
		}
	}

	private getResourceForCurrentActiveResource(): ResourceMarkers {
		let res: ResourceMarkers = null;
		if (this.currentActiveResource) {
			this.markersWorkbenchService.markersModel.forEachFilteredResource(resource => {
				if (!res && resource.uri.toString() === this.currentActiveResource.toString()) {
					res = resource;
				}
			});
		}
		return res;
	}

	private hasSelectedMarkerFor(resource: ResourceMarkers): boolean {
		let selectedElement = this.tree.getSelection();
		if (selectedElement && selectedElement.length > 0) {
			if (selectedElement[0] instanceof Marker) {
				if (resource.uri.toString() === (<Marker>selectedElement[0]).raw.resource.toString()) {
					return true;
				}
			}
		}
		return false;
	}

	private updateRangeHighlights() {
		this.rangeHighlightDecorations.removeHighlightRange();
		if (this.tree.isDOMFocused()) {
			this.highlightCurrentSelectedMarkerRange();
		}
	}

	private highlightCurrentSelectedMarkerRange() {
		let selections = this.tree.getSelection();
		if (selections && selections.length === 1 && selections[0] instanceof Marker) {
			const marker: Marker = selections[0];
			this.rangeHighlightDecorations.highlightRange(marker);
		}
	}

	public getFocusElement(): ResourceMarkers | Marker {
		return this.tree.getFocus();
	}

	public getActionItem(action: IAction): IActionItem {
		if (action.id === FilterAction.ID) {
			return this.filterInputActionItem;
		}
		return super.getActionItem(action);
	}

	public shutdown(): void {
		// store memento
		this.panelSettings['filter'] = this.filterInputActionItem.getFilterText();
		this.panelSettings['filterHistory'] = this.filterInputActionItem.getFilterHistory();
		this.panelSettings['useFilesExclude'] = this.filterByFilesExcludeAction.checked;

		super.shutdown();
	}

	public dispose(): void {
		super.dispose();

		this.delayedRefresh.cancel();
		this.tree.dispose();
	}
}
