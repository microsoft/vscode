/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';

import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Panel } from 'vs/workbench/browser/panel';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/electron-browser/constants';
import { Marker, ResourceMarkers, RelatedInformation } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { Controller } from 'vs/workbench/parts/markers/electron-browser/markersTreeController';
import * as Viewer from 'vs/workbench/parts/markers/electron-browser/markersTreeViewer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CollapseAllAction, MarkersFilterActionItem, MarkersFilterAction, QuickFixAction, QuickFixActionItem, IMarkersFilterActionChangeEvent } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
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
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';

export class MarkersPanel extends Panel {

	private delayedRefresh: Delayer<void>;

	private lastSelectedRelativeTop: number = 0;
	private currentActiveResource: URI = null;

	private tree: WorkbenchTree;
	private rangeHighlightDecorations: RangeHighlightDecorations;

	private actions: IAction[];
	private collapseAllAction: IAction;
	private filterAction: MarkersFilterAction;
	private filterInputActionItem: MarkersFilterActionItem;

	private treeContainer: HTMLElement;
	private messageBoxContainer: HTMLElement;
	private ariaLabelElement: HTMLElement;
	private panelSettings: any;

	private currentResourceGotAddedToMarkersData: boolean = false;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorService private editorService: IEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IMarkersWorkbenchService private markersWorkbenchService: IMarkersWorkbenchService,
		@IStorageService storageService: IStorageService,
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService, themeService);
		this.delayedRefresh = new Delayer<void>(500);
		this.panelSettings = this.getMemento(storageService, Scope.WORKSPACE);
		this.setCurrentActiveEditor();
	}

	public create(parent: HTMLElement): TPromise<void> {
		super.create(parent);

		this.rangeHighlightDecorations = this._register(this.instantiationService.createInstance(RangeHighlightDecorations));

		dom.addClass(parent, 'markers-panel');

		const container = dom.append(parent, dom.$('.markers-panel-container'));

		this.createArialLabelElement(container);
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
		this.treeContainer.style.height = `${dimension.height}px`;
		this.tree.layout(dimension.height, dimension.width);
		if (this.filterInputActionItem) {
			this.filterInputActionItem.toggleLayout(dimension.width < 1200);
		}
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
			}, sideByside ? SIDE_GROUP : ACTIVE_GROUP).then(editor => {
				if (editor && preserveFocus) {
					this.rangeHighlightDecorations.highlightRange({ resource, range: selection }, <ICodeEditor>editor.getControl());
				} else {
					this.rangeHighlightDecorations.removeHighlightRange();
				}
			});
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
				return this.tree.refresh();
			}
		}
		return TPromise.as(null);
	}

	private updateFilter() {
		this.markersWorkbenchService.filter({ filterText: this.filterAction.filterText, useFilesExclude: this.filterAction.useFilesExclude });
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
		this.messageBoxContainer.setAttribute('aria-labelledby', 'markers-panel-arialabel');
	}

	private createArialLabelElement(parent: HTMLElement): void {
		this.ariaLabelElement = dom.append(parent, dom.$(''));
		this.ariaLabelElement.setAttribute('id', 'markers-panel-arialabel');
		this.ariaLabelElement.setAttribute('aria-live', 'polite');
	}

	private createTree(parent: HTMLElement): void {
		this.treeContainer = dom.append(parent, dom.$('.tree-container.show-file-icons'));
		const renderer = this.instantiationService.createInstance(Viewer.Renderer, (action) => this.getActionItem(action));
		const dnd = this.instantiationService.createInstance(SimpleFileResourceDragAndDrop, obj => obj instanceof ResourceMarkers ? obj.uri : void 0);
		const controller = this.instantiationService.createInstance(Controller, () => { if (this.filterInputActionItem) { this.filterInputActionItem.focus(); } });
		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new Viewer.DataSource(),
			filter: new Viewer.DataFilter(),
			renderer,
			controller,
			accessibilityProvider: this.instantiationService.createInstance(Viewer.MarkersTreeAccessibilityProvider),
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
		this.filterAction = this.instantiationService.createInstance(MarkersFilterAction, { filterText: this.panelSettings['filter'] || '', filterHistory: this.panelSettings['filterHistory'] || [], useFilesExclude: !!this.panelSettings['useFilesExclude'] });
		this.actions = [this.filterAction, this.collapseAllAction];
	}

	private createListeners(): void {
		this._register(this.markersWorkbenchService.onDidChange(resources => this.onDidChange(resources)));
		this._register(this.editorService.onDidActiveEditorChange(this.onActiveEditorChanged, this));
		this._register(this.tree.onDidChangeSelection(() => this.onSelected()));
		this._register(this.filterAction.onDidChange((event: IMarkersFilterActionChangeEvent) => {
			if (event.filterText || event.useFilesExclude) {
				this.updateFilter();
			}
		}));
		this.actions.forEach(a => this._register(a));
	}

	private onDidChange(resources: URI[]) {
		this.currentResourceGotAddedToMarkersData = this.currentResourceGotAddedToMarkersData || this.isCurrentResourceGotAddedToMarkersData(resources);
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

	private onActiveEditorChanged(): void {
		this.setCurrentActiveEditor();
		this.autoReveal();
	}

	private setCurrentActiveEditor(): void {
		const activeEditor = this.editorService.activeEditor;
		this.currentActiveResource = activeEditor ? activeEditor.getResource() : void 0;
	}

	private onSelected(): void {
		let selection = this.tree.getSelection();
		if (selection && selection.length > 0) {
			this.lastSelectedRelativeTop = this.tree.getRelativeTop(selection[0]);
		}
	}

	private render(): TPromise<void> {
		dom.toggleClass(this.treeContainer, 'hidden', !this.markersWorkbenchService.markersModel.hasFilteredResources());
		return this.tree.setInput(this.markersWorkbenchService.markersModel)
			.then(() => this.renderMessage());
	}

	private renderMessage(): void {
		dom.clearNode(this.messageBoxContainer);
		const markersModel = this.markersWorkbenchService.markersModel;
		if (markersModel.hasFilteredResources()) {
			this.messageBoxContainer.style.display = 'none';
			const { total, filtered } = markersModel.stats();
			if (filtered === total) {
				this.ariaLabelElement.setAttribute('aria-label', localize('No problems filtered', "Showing {0} problems", total));
			} else {
				this.ariaLabelElement.setAttribute('aria-label', localize('problems filtered', "Showing {0} of {1} problems", filtered, total));
			}
			this.messageBoxContainer.removeAttribute('tabIndex');
		} else {
			this.messageBoxContainer.style.display = 'block';
			this.messageBoxContainer.setAttribute('tabIndex', '0');
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
		link.textContent = localize('disableFilesExclude', "Disable Files Exclude Filter.");
		link.setAttribute('tabIndex', '0');
		dom.addStandardDisposableListener(link, dom.EventType.CLICK, () => this.filterAction.useFilesExclude = false);
		dom.addStandardDisposableListener(link, dom.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				this.filterAction.useFilesExclude = false;
				e.stopPropagation();
			}
		});
		this.ariaLabelElement.setAttribute('aria-label', Messages.MARKERS_PANEL_NO_PROBLEMS_FILE_EXCLUSIONS_FILTER);
	}

	private renderFilteredByFilterMessage(container: HTMLElement) {
		const span1 = dom.append(container, dom.$('span'));
		span1.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS;
		const link = dom.append(container, dom.$('a.messageAction'));
		link.textContent = localize('clearFilter', "Clear Filter.");
		link.setAttribute('tabIndex', '0');
		dom.addStandardDisposableListener(link, dom.EventType.CLICK, () => this.filterAction.filterText = '');
		dom.addStandardDisposableListener(link, dom.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				this.filterAction.filterText = '';
				e.stopPropagation();
			}
		});
		this.ariaLabelElement.setAttribute('aria-label', Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS);
	}

	private renderNoProblemsMessage(container: HTMLElement) {
		const span = dom.append(container, dom.$('span'));
		span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT;
		this.ariaLabelElement.setAttribute('aria-label', Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT);
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
				this.tree.expand(currentActiveResource)
					.then(() => this.tree.reveal(currentActiveResource, 0))
					.then(() => {
						if (focus) {
							this.tree.setFocus(currentActiveResource);
							this.tree.setSelection([currentActiveResource]);
						}
					});
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
		if (action.id === MarkersFilterAction.ID) {
			this.filterInputActionItem = this.instantiationService.createInstance(MarkersFilterActionItem, this.filterAction);
			return this.filterInputActionItem;
		}
		if (action.id === QuickFixAction.ID) {
			return this.instantiationService.createInstance(QuickFixActionItem, action);
		}
		return super.getActionItem(action);
	}

	public shutdown(): void {
		// store memento
		this.panelSettings['filter'] = this.filterAction.filterText;
		this.panelSettings['filterHistory'] = this.filterAction.filterHistory;
		this.panelSettings['useFilesExclude'] = this.filterAction.useFilesExclude;

		super.shutdown();
	}

	public dispose(): void {
		super.dispose();

		this.delayedRefresh.cancel();
		this.tree.dispose();
	}
}
