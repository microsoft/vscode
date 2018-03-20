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
import * as builder from 'vs/base/browser/builder';
import { IAction, Action } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { Panel } from 'vs/workbench/browser/panel';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/electron-browser/constants';
import { Marker, ResourceMarkers, RelatedInformation } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { Controller } from 'vs/workbench/parts/markers/electron-browser/markersTreeController';
import * as Viewer from 'vs/workbench/parts/markers/electron-browser/markersTreeViewer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CollapseAllAction, FilterAction, FilterInputBoxActionItem } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { RangeHighlightDecorations } from 'vs/workbench/browser/parts/editor/rangeDecorations';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { debounceEvent } from 'vs/base/common/event';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { TreeResourceNavigator, WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IMarkersWorkbenchService } from 'vs/workbench/parts/markers/electron-browser/markers';
import { SimpleFileResourceDragAndDrop } from 'vs/workbench/browser/dnd';

export class MarkersPanel extends Panel {

	private delayedRefresh: Delayer<void>;

	private lastSelectedRelativeTop: number = 0;
	private currentActiveResource: URI = null;

	private tree: WorkbenchTree;
	private autoExpanded: Set<string>;
	private rangeHighlightDecorations: RangeHighlightDecorations;

	private actions: IAction[];
	private filterAction: FilterAction;
	private collapseAllAction: IAction;

	private treeContainer: HTMLElement;
	private messageBoxContainer: HTMLElement;
	private messageBox: HTMLElement;

	private currentResourceGotAddedToMarkersData: boolean = false;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IMarkersWorkbenchService private markersWorkbenchService: IMarkersWorkbenchService
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService, themeService);
		this.delayedRefresh = new Delayer<void>(500);
		this.autoExpanded = new Set<string>();
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);

		this.rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);
		this.toUnbind.push(this.rangeHighlightDecorations);

		dom.addClass(parent.getHTMLElement(), 'markers-panel');

		let container = dom.append(parent.getHTMLElement(), dom.$('.markers-panel-container'));

		this.createMessageBox(container);
		this.createTree(container);

		this.createListeners();

		return this.render();
	}

	public getTitle(): string {
		return Messages.MARKERS_PANEL_TITLE_PROBLEMS;
	}

	public layout(dimension: builder.Dimension): void {
		this.tree.layout(dimension.height);
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
			this.messageBox.focus();
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
			this.actions = this.createActions();
		}
		this.collapseAllAction.enabled = this.markersWorkbenchService.markersModel.hasFilteredResources();
		return this.actions;
	}

	public openFileAtElement(element: any, preserveFocus: boolean, sideByside: boolean, pinned: boolean): boolean {
		const { resource, selection } = element instanceof Marker ? { resource: element.resource, selection: element.range } :
			element instanceof RelatedInformation ? { resource: element.relatedInformation.resource, selection: element.relatedInformation } : { resource: null, selection: null };
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

	public updateFilter(filter: string) {
		this.markersWorkbenchService.filter(filter);
		this.autoExpanded = new Set<string>();
		this.refreshPanel();
		this.autoReveal();
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
		this.messageBox = dom.append(this.messageBoxContainer, dom.$('span'));
		this.messageBox.setAttribute('tabindex', '0');
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

		Constants.MarkerFocusContextKey.bindTo(this.tree.contextKeyService);

		const markersNavigator = this._register(new TreeResourceNavigator(this.tree, { openOnFocus: true }));
		this._register(debounceEvent(markersNavigator.openResource, (last, event) => event, 75, true)(options => {
			this.openFileAtElement(options.element, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
		}));
	}

	private createActions(): IAction[] {
		this.collapseAllAction = this.instantiationService.createInstance(CollapseAllAction, this.tree, true);
		this.filterAction = new FilterAction();
		const actions = [
			this.filterAction,
			this.collapseAllAction
		];
		actions.forEach(a => {
			this.toUnbind.push(a);
		});
		return actions;
	}

	private createListeners(): void {
		this.toUnbind.push(this.markersWorkbenchService.onDidChangeMarkersForResources(this.onMarkerChanged, this));
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(this.onEditorsChanged, this));
		this.toUnbind.push(this.tree.onDidChangeSelection(() => this.onSelected()));
	}

	private onMarkerChanged(changedResources: URI[]) {
		this.currentResourceGotAddedToMarkersData = this.currentResourceGotAddedToMarkersData || this.isCurrentResourceGotAddedToMarkersData(changedResources);
		this.updateResources(changedResources);
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
		this.messageBox.textContent = this.markersWorkbenchService.markersModel.getMessage();
		dom.toggleClass(this.messageBoxContainer, 'hidden', this.markersWorkbenchService.markersModel.hasFilteredResources());
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

	public getActionItem(action: Action): IActionItem {
		if (action.id === FilterAction.ID) {
			return this.instantiationService.createInstance(FilterInputBoxActionItem, this, action);
		}
		return super.getActionItem(action);
	}

	public getFocusElement(): ResourceMarkers | Marker {
		return this.tree.getFocus();
	}

	public dispose(): void {
		super.dispose();

		this.delayedRefresh.cancel();
		this.tree.dispose();
	}
}
