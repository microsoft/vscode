/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';

import * as errors from 'vs/base/common/errors';
import * as Set from 'vs/base/common/set';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import builder = require('vs/base/browser/builder');
import { IAction, Action } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { toResource } from 'vs/workbench/common/editor';
import { Panel } from 'vs/workbench/browser/panel';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { IProblemsConfiguration, MarkersModel, Marker, Resource, FilterOptions } from 'vs/workbench/parts/markers/common/markersModel';
import { Controller } from 'vs/workbench/parts/markers/browser/markersTreeController';
import Tree = require('vs/base/parts/tree/browser/tree');
import TreeImpl = require('vs/base/parts/tree/browser/treeImpl');
import * as Viewer from 'vs/workbench/parts/markers/browser/markersTreeViewer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CollapseAllAction, FilterAction, FilterInputBoxActionItem } from 'vs/workbench/parts/markers/browser/markersPanelActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import Messages from 'vs/workbench/parts/markers/common/messages';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';

export class MarkersPanel extends Panel {

	public markersModel: MarkersModel;

	private toDispose: lifecycle.IDisposable[];
	private delayedRefresh: Delayer<void>;

	private lastSelectedRelativeTop: number = 0;
	private currentActiveFile: URI = null;
	private hasToAutoReveal: boolean;

	private tree: Tree.ITree;
	private autoExpanded: Set.ArraySet<string>;
	private rangeHighlightDecorations: RangeHighlightDecorations;

	private actions: IAction[];
	private filterAction: FilterAction;
	private collapseAllAction: IAction;

	private treeContainer: HTMLElement;
	private messageBoxContainer: HTMLElement;
	private messageBox: HTMLElement;

	private markerFocusContextKey: IContextKey<boolean>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMarkerService private markerService: IMarkerService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService);
		this.toDispose = [];
		this.delayedRefresh = new Delayer<void>(500);
		this.autoExpanded = new Set.ArraySet<string>();
		this.markerFocusContextKey = Constants.MarkerFocusContextKey.bindTo(contextKeyService);
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		this.markersModel = new MarkersModel();

		this.rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);
		this.toDispose.push(this.rangeHighlightDecorations);

		dom.addClass(parent.getHTMLElement(), 'markers-panel');

		const conf = this.configurationService.getConfiguration<IProblemsConfiguration>();
		this.onConfigurationsUpdated(conf);

		let container = dom.append(parent.getHTMLElement(), dom.$('.markers-panel-container'));

		this.createMessageBox(container);
		this.createTree(container);

		this.createActions();
		this.createListeners();

		this.render();

		return TPromise.as(null);
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

		if (this.markersModel.hasFilteredResources()) {
			this.tree.DOMFocus();
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
		let promise: TPromise<void> = super.setVisible(visible);
		if (!visible) {
			this.rangeHighlightDecorations.removeHighlightRange();
		}
		return promise;
	}

	public getActions(): IAction[] {
		this.collapseAllAction.enabled = this.markersModel.hasFilteredResources();
		return this.actions;
	}

	private refreshPanel(): TPromise<any> {
		this.collapseAllAction.enabled = this.markersModel.hasFilteredResources();
		dom.toggleClass(this.treeContainer, 'hidden', !this.markersModel.hasFilteredResources());
		this.renderMessage();
		if (this.markersModel.hasFilteredResources()) {
			return this.tree.refresh().then(() => {
				this.autoExpand();
			});
		}
		return TPromise.as(null);
	}

	public updateFilter(filter: string) {
		this.markersModel.update(new FilterOptions(filter));
		this.autoExpanded = new Set.ArraySet<string>();
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
		var actionProvider = this.instantiationService.createInstance(ContributableActionProvider);
		var renderer = this.instantiationService.createInstance(Viewer.Renderer, this.getActionRunner(), actionProvider);
		let controller = this.instantiationService.createInstance(Controller, this.rangeHighlightDecorations, actionProvider);
		this.tree = new TreeImpl.Tree(this.treeContainer, {
			dataSource: new Viewer.DataSource(),
			renderer,
			controller,
			sorter: new Viewer.Sorter(),
			accessibilityProvider: new Viewer.MarkersTreeAccessibilityProvider()
		}, {
				indentPixels: 0,
				twistiePixels: 20,
				ariaLabel: Messages.MARKERS_PANEL_ARIA_LABEL_PROBLEMS_TREE
			});
		this._register(this.tree.addListener2('focus', (e: { focus: any }) => {
			this.markerFocusContextKey.set(e.focus instanceof Marker);
		}));
		const focusTracker = this._register(dom.trackFocus(this.tree.getHTMLElement()));
		focusTracker.addBlurListener(() => {
			this.markerFocusContextKey.set(false);
		});
	}

	private createActions(): void {
		this.collapseAllAction = this.instantiationService.createInstance(CollapseAllAction, this.tree, true);
		this.filterAction = new FilterAction(this);
		this.actions = [
			this.filterAction,
			this.collapseAllAction
		];
		this.actions.forEach(a => {
			this.toDispose.push(a);
		});
	}

	private createListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationsUpdated(e.config)));
		this.toDispose.push(this.markerService.onMarkerChanged(this.onMarkerChanged, this));
		this.toDispose.push(this.editorGroupService.onEditorsChanged(this.onEditorsChanged, this));
		this.toDispose.push(this.tree.addListener2('selection', () => this.onSelected()));
	}

	private onMarkerChanged(changedResources: URI[]) {
		this.updateResources(changedResources);
		this.delayedRefresh.trigger(() => {
			this.refreshPanel();
			this.updateRangeHighlights();
			this.autoReveal();
		});
	}

	private onEditorsChanged(): void {
		this.currentActiveFile = toResource(this.editorService.getActiveEditorInput(), { filter: 'file' });
		this.autoReveal();
	}

	private onConfigurationsUpdated(conf: IProblemsConfiguration): void {
		this.hasToAutoReveal = conf && conf.problems && conf.problems.autoReveal;
	}

	private onSelected(): void {
		let selection = this.tree.getSelection();
		if (selection && selection.length > 0) {
			this.lastSelectedRelativeTop = this.tree.getRelativeTop(selection[0]);
		}
	}

	private updateResources(resources: URI[]) {
		const bulkUpdater = this.markersModel.getBulkUpdater();
		for (const resource of resources) {
			bulkUpdater.add(resource, this.markerService.read({ resource }));
		}
		bulkUpdater.done();
		for (const resource of resources) {
			if (!this.markersModel.hasResource(resource)) {
				this.autoExpanded.unset(resource.toString());
			}
		}
	}

	private render(): void {
		let allMarkers = this.markerService.read();
		this.markersModel.update(allMarkers);
		this.tree.setInput(this.markersModel).then(this.autoExpand.bind(this));
		dom.toggleClass(this.treeContainer, 'hidden', !this.markersModel.hasFilteredResources());
		this.renderMessage();
	}

	private renderMessage(): void {
		let message = this.markersModel.getMessage();
		this.messageBox.textContent = message;
		dom.toggleClass(this.messageBoxContainer, 'hidden', this.markersModel.hasFilteredResources());
	}

	private autoExpand(): void {
		for (const resource of this.markersModel.filteredResources) {
			const resourceUri = resource.uri.toString();
			if (!this.autoExpanded.contains(resourceUri)) {
				this.tree.expand(resource).done(null, errors.onUnexpectedError);
				this.autoExpanded.set(resourceUri);
			}
		}
	}

	private autoReveal(focus: boolean = false): void {
		let conf = this.configurationService.getConfiguration<IProblemsConfiguration>();
		if (conf && conf.problems && conf.problems.autoReveal) {
			this.revealMarkersForCurrentActiveEditor(focus);
		}
	}

	private revealMarkersForCurrentActiveEditor(focus: boolean = false): void {
		let currentActiveResource = this.getResourceForCurrentActiveFile();
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

	private getResourceForCurrentActiveFile(): Resource {
		if (this.currentActiveFile) {
			let resources = this.markersModel.filteredResources.filter((resource): boolean => {
				return this.currentActiveFile.toString() === resource.uri.toString();
			});
			return resources.length > 0 ? resources[0] : null;
		}
		return null;
	}

	private hasSelectedMarkerFor(resource): boolean {
		let selectedElement = this.tree.getSelection();
		if (selectedElement && selectedElement.length > 0) {
			if (selectedElement[0] instanceof Marker) {
				if (resource.uri.toString() === selectedElement[0].marker.resource.toString()) {
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

	public getFocusElement(): Resource | Marker {
		return this.tree.getFocus();
	}

	public dispose(): void {
		this.delayedRefresh.cancel();
		this.toDispose = lifecycle.dispose(this.toDispose);
		this.tree.dispose();
		this.markersModel.dispose();
		super.dispose();
	}
}