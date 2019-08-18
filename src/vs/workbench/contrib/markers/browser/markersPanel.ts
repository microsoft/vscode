/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';

import { URI } from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import { IAction, IActionViewItem, Action } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Panel } from 'vs/workbench/browser/panel';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/contrib/markers/browser/constants';
import { Marker, ResourceMarkers, RelatedInformation, MarkersModel } from 'vs/workbench/contrib/markers/browser/markersModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MarkersFilterActionViewItem, MarkersFilterAction, IMarkersFilterActionChangeEvent, IMarkerFilterController } from 'vs/workbench/contrib/markers/browser/markersPanelActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import Messages from 'vs/workbench/contrib/markers/browser/messages';
import { RangeHighlightDecorations } from 'vs/workbench/browser/parts/editor/rangeDecorations';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IMarkersWorkbenchService } from 'vs/workbench/contrib/markers/browser/markers';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Iterator } from 'vs/base/common/iterator';
import { ITreeElement, ITreeNode, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { Relay, Event, Emitter } from 'vs/base/common/event';
import { WorkbenchObjectTree, TreeResourceNavigator2 } from 'vs/platform/list/browser/listService';
import { FilterOptions } from 'vs/workbench/contrib/markers/browser/markersFilterOptions';
import { IExpression } from 'vs/base/common/glob';
import { deepClone } from 'vs/base/common/objects';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FilterData, Filter, VirtualDelegate, ResourceMarkersRenderer, MarkerRenderer, RelatedInformationRenderer, TreeElement, MarkersTreeAccessibilityProvider, MarkersViewModel, ResourceDragAndDrop } from 'vs/workbench/contrib/markers/browser/markersTreeViewer';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Separator, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { domEvent } from 'vs/base/browser/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { IMarker } from 'vs/platform/markers/common/markers';
import { withUndefinedAsNull } from 'vs/base/common/types';
import { MementoObject } from 'vs/workbench/common/memento';

function createModelIterator(model: MarkersModel): Iterator<ITreeElement<TreeElement>> {
	const resourcesIt = Iterator.fromArray(model.resourceMarkers);

	return Iterator.map(resourcesIt, m => {
		const markersIt = Iterator.fromArray(m.markers);

		const children = Iterator.map(markersIt, m => {
			const relatedInformationIt = Iterator.from(m.relatedInformation);
			const children = Iterator.map(relatedInformationIt, r => ({ element: r }));

			return { element: m, children };
		});

		return { element: m, children };
	});
}

export class MarkersPanel extends Panel implements IMarkerFilterController {

	private lastSelectedRelativeTop: number = 0;
	private currentActiveResource: URI | null = null;

	private tree: WorkbenchObjectTree<TreeElement, FilterData>;
	private treeLabels: ResourceLabels;
	private rangeHighlightDecorations: RangeHighlightDecorations;

	private actions: IAction[];
	private collapseAllAction: IAction;
	private filterAction: MarkersFilterAction;
	private filterInputActionViewItem: MarkersFilterActionViewItem;

	private treeContainer: HTMLElement;
	private messageBoxContainer: HTMLElement;
	private ariaLabelElement: HTMLElement;
	private readonly panelState: MementoObject;
	private panelFoucusContextKey: IContextKey<boolean>;

	private filter: Filter;

	private _onDidFilter = this._register(new Emitter<void>());
	readonly onDidFilter: Event<void> = this._onDidFilter.event;
	private cachedFilterStats: { total: number; filtered: number; } | undefined = undefined;

	private currentResourceGotAddedToMarkersData: boolean = false;
	readonly markersViewModel: MarkersViewModel;
	private disposables: IDisposable[] = [];

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IMarkersWorkbenchService private readonly markersWorkbenchService: IMarkersWorkbenchService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService, themeService, storageService);
		this.panelFoucusContextKey = Constants.MarkerPanelFocusContextKey.bindTo(contextKeyService);
		this.panelState = this.getMemento(StorageScope.WORKSPACE);
		this.markersViewModel = instantiationService.createInstance(MarkersViewModel, this.panelState['multiline']);
		this.markersViewModel.onDidChange(this.onDidChangeViewState, this, this.disposables);
		this.setCurrentActiveEditor();
	}

	public create(parent: HTMLElement): void {
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

		this._register(this.onDidFocus(() => this.panelFoucusContextKey.set(true)));
		this._register(this.onDidBlur(() => this.panelFoucusContextKey.set(false)));

		this._register(this.onDidChangeVisibility(visible => {
			if (visible) {
				this.refreshPanel();
			} else {
				this.rangeHighlightDecorations.removeHighlightRange();
			}
		}));

		this.render();
	}

	public getTitle(): string {
		return Messages.MARKERS_PANEL_TITLE_PROBLEMS;
	}

	public layout(dimension: dom.Dimension): void {
		this.treeContainer.style.height = `${dimension.height}px`;
		this.tree.layout(dimension.height, dimension.width);
		if (this.filterInputActionViewItem) {
			this.filterInputActionViewItem.toggleLayout(dimension.width < 1200);
		}
	}

	public focus(): void {
		if (this.tree.getHTMLElement() === document.activeElement) {
			return;
		}

		if (this.isEmpty()) {
			this.messageBoxContainer.focus();
		} else {
			this.tree.getHTMLElement().focus();
		}
	}

	public focusFilter(): void {
		if (this.filterInputActionViewItem) {
			this.filterInputActionViewItem.focus();
		}
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.createActions();
		}
		return this.actions;
	}

	public showQuickFixes(marker: Marker): void {
		const viewModel = this.markersViewModel.getViewModel(marker);
		if (viewModel) {
			viewModel.quickFixAction.run();
		}
	}

	public openFileAtElement(element: any, preserveFocus: boolean, sideByside: boolean, pinned: boolean): boolean {
		const { resource, selection, event, data } = element instanceof Marker ? { resource: element.resource, selection: element.range, event: 'problems.selectDiagnostic', data: this.getTelemetryData(element.marker) } :
			element instanceof RelatedInformation ? { resource: element.raw.resource, selection: element.raw, event: 'problems.selectRelatedInformation', data: this.getTelemetryData(element.marker) } : { resource: null, selection: null, event: null, data: null };
		if (resource && selection && event) {
			/* __GDPR__
			"problems.selectDiagnostic" : {
				"source": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"code" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
			}
			*/
			/* __GDPR__
				"problems.selectRelatedInformation" : {
					"source": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
					"code" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog(event, data);
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

	private refreshPanel(marker?: Marker): void {
		if (this.isVisible()) {
			this.cachedFilterStats = undefined;

			if (marker) {
				this.tree.rerender(marker);
			} else {
				this.tree.setChildren(null, createModelIterator(this.markersWorkbenchService.markersModel));
			}

			const { total, filtered } = this.getFilterStats();
			dom.toggleClass(this.treeContainer, 'hidden', total === 0 || filtered === 0);
			this.renderMessage();
			this._onDidFilter.fire();
		}
	}

	private onDidChangeViewState(marker?: Marker): void {
		this.refreshPanel(marker);
	}

	private updateFilter() {
		this.cachedFilterStats = undefined;
		this.filter.options = new FilterOptions(this.filterAction.filterText, this.getFilesExcludeExpressions());
		this.tree.refilter();
		this._onDidFilter.fire();

		const { total, filtered } = this.getFilterStats();
		dom.toggleClass(this.treeContainer, 'hidden', total === 0 || filtered === 0);
		this.renderMessage();
	}

	private getFilesExcludeExpressions(): { root: URI, expression: IExpression }[] | IExpression {
		if (!this.filterAction.useFilesExclude) {
			return [];
		}

		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		return workspaceFolders.length
			? workspaceFolders.map(workspaceFolder => ({ root: workspaceFolder.uri, expression: this.getFilesExclude(workspaceFolder.uri) }))
			: this.getFilesExclude();
	}

	private getFilesExclude(resource?: URI): IExpression {
		return deepClone(this.configurationService.getValue('files.exclude', { resource })) || {};
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

		const onDidChangeRenderNodeCount = new Relay<ITreeNode<any, any>>();

		this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));

		const virtualDelegate = new VirtualDelegate(this.markersViewModel);
		const renderers = [
			this.instantiationService.createInstance(ResourceMarkersRenderer, this.treeLabels, onDidChangeRenderNodeCount.event),
			this.instantiationService.createInstance(MarkerRenderer, this.markersViewModel),
			this.instantiationService.createInstance(RelatedInformationRenderer)
		];
		this.filter = new Filter(new FilterOptions());
		const accessibilityProvider = this.instantiationService.createInstance(MarkersTreeAccessibilityProvider);

		const identityProvider = {
			getId(element: TreeElement) {
				return element.id;
			}
		};

		this.tree = this.instantiationService.createInstance(WorkbenchObjectTree,
			this.treeContainer,
			virtualDelegate,
			renderers,
			{
				filter: this.filter,
				accessibilityProvider,
				identityProvider,
				dnd: new ResourceDragAndDrop(this.instantiationService),
				expandOnlyOnTwistieClick: (e: TreeElement) => e instanceof Marker && e.relatedInformation.length > 0
			}
		);

		onDidChangeRenderNodeCount.input = this.tree.onDidChangeRenderNodeCount;

		const markerFocusContextKey = Constants.MarkerFocusContextKey.bindTo(this.tree.contextKeyService);
		const relatedInformationFocusContextKey = Constants.RelatedInformationFocusContextKey.bindTo(this.tree.contextKeyService);
		this._register(this.tree.onDidChangeFocus(focus => {
			markerFocusContextKey.set(focus.elements.some(e => e instanceof Marker));
			relatedInformationFocusContextKey.set(focus.elements.some(e => e instanceof RelatedInformation));
		}));
		const focusTracker = this._register(dom.trackFocus(this.tree.getHTMLElement()));
		this._register(focusTracker.onDidBlur(() => {
			markerFocusContextKey.set(false);
			relatedInformationFocusContextKey.set(false);
		}));

		const markersNavigator = this._register(new TreeResourceNavigator2(this.tree, { openOnFocus: true }));
		this._register(Event.debounce(markersNavigator.onDidOpenResource, (last, event) => event, 75, true)(options => {
			this.openFileAtElement(options.element, !!options.editorOptions.preserveFocus, options.sideBySide, !!options.editorOptions.pinned);
		}));
		this._register(this.tree.onDidChangeCollapseState(({ node }) => {
			const { element } = node;
			if (element instanceof RelatedInformation && !node.collapsed) {
				/* __GDPR__
				"problems.expandRelatedInformation" : {
					"source": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
					"code" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
				}
				*/
				this.telemetryService.publicLog('problems.expandRelatedInformation', this.getTelemetryData(element.marker));
			}
		}));

		this._register(this.tree.onContextMenu(this.onContextMenu, this));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (this.filterAction.useFilesExclude && e.affectsConfiguration('files.exclude')) {
				this.updateFilter();
			}
		}));

		// move focus to input, whenever a key is pressed in the panel container
		this._register(domEvent(parent, 'keydown')(e => {
			if (this.filterInputActionViewItem && this.keybindingService.mightProducePrintableCharacter(new StandardKeyboardEvent(e))) {
				this.filterInputActionViewItem.focus();
			}
		}));

		this._register(Event.any<any>(this.tree.onDidChangeSelection, this.tree.onDidChangeFocus)(() => {
			const elements = [...this.tree.getSelection(), ...this.tree.getFocus()];
			for (const element of elements) {
				if (element instanceof Marker) {
					const viewModel = this.markersViewModel.getViewModel(element);
					if (viewModel) {
						viewModel.showLightBulb();
					}
				}
			}
		}));
	}

	private createActions(): void {
		this.collapseAllAction = new Action('vs.tree.collapse', localize('collapseAll', "Collapse All"), 'monaco-tree-action collapse-all', true, async () => {
			this.tree.collapseAll();
			this.tree.setSelection([]);
			this.tree.setFocus([]);
			this.tree.getHTMLElement().focus();
			this.tree.focusFirst();
		});

		this.filterAction = this.instantiationService.createInstance(MarkersFilterAction, { filterText: this.panelState['filter'] || '', filterHistory: this.panelState['filterHistory'] || [], useFilesExclude: !!this.panelState['useFilesExclude'] });
		this.actions = [this.filterAction, this.collapseAllAction];
	}

	private createListeners(): void {
		const onModelOrActiveEditorChanged = Event.debounce<URI | true, { resources: URI[], activeEditorChanged: boolean }>(Event.any<any>(this.markersWorkbenchService.markersModel.onDidChange, Event.map(this.editorService.onDidActiveEditorChange, () => true)), (result, e) => {
			if (!result) {
				result = {
					resources: [],
					activeEditorChanged: false
				};
			}
			if (e === true) {
				result.activeEditorChanged = true;
			} else {
				result.resources.push(e);
			}
			return result;
		}, 0);

		this._register(onModelOrActiveEditorChanged(({ resources, activeEditorChanged }) => {
			if (resources) {
				this.onDidChangeModel(resources);
			}
			if (activeEditorChanged) {
				this.onActiveEditorChanged();
			}
		}, this));
		this._register(this.tree.onDidChangeSelection(() => this.onSelected()));
		this._register(this.filterAction.onDidChange((event: IMarkersFilterActionChangeEvent) => {
			if (event.filterText || event.useFilesExclude) {
				this.updateFilter();
			}
		}));
		this.actions.forEach(a => this._register(a));
	}

	private onDidChangeModel(resources: URI[]) {
		for (const resource of resources) {
			this.markersViewModel.remove(resource);
			const resourceMarkers = this.markersWorkbenchService.markersModel.getResourceMarkers(resource);
			if (resourceMarkers) {
				for (const marker of resourceMarkers.markers) {
					this.markersViewModel.add(marker);
				}
			}
		}
		this.currentResourceGotAddedToMarkersData = this.currentResourceGotAddedToMarkersData || this.isCurrentResourceGotAddedToMarkersData(resources);
		this.refreshPanel();
		this.updateRangeHighlights();
		if (this.currentResourceGotAddedToMarkersData) {
			this.autoReveal();
			this.currentResourceGotAddedToMarkersData = false;
		}
	}

	private isCurrentResourceGotAddedToMarkersData(changedResources: URI[]) {
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

	private onActiveEditorChanged(): void {
		this.setCurrentActiveEditor();
		this.autoReveal();
	}

	private setCurrentActiveEditor(): void {
		const activeEditor = this.editorService.activeEditor;
		this.currentActiveResource = activeEditor ? withUndefinedAsNull(activeEditor.getResource()) : null;
	}

	private onSelected(): void {
		let selection = this.tree.getSelection();
		if (selection && selection.length > 0) {
			this.lastSelectedRelativeTop = this.tree.getRelativeTop(selection[0]) || 0;
		}
	}

	private isEmpty(): boolean {
		const { total, filtered } = this.getFilterStats();
		return total === 0 || filtered === 0;
	}

	private render(): void {
		this.cachedFilterStats = undefined;
		this.tree.setChildren(null, createModelIterator(this.markersWorkbenchService.markersModel));
		dom.toggleClass(this.treeContainer, 'hidden', this.isEmpty());
		this.renderMessage();
	}

	private renderMessage(): void {
		dom.clearNode(this.messageBoxContainer);
		const { total, filtered } = this.getFilterStats();

		if (filtered === 0) {
			this.messageBoxContainer.style.display = 'block';
			this.messageBoxContainer.setAttribute('tabIndex', '0');
			if (total > 0) {
				if (this.filter.options.filter) {
					this.renderFilteredByFilterMessage(this.messageBoxContainer);
				} else {
					this.renderFilteredByFilesExcludeMessage(this.messageBoxContainer);
				}
			} else {
				this.renderNoProblemsMessage(this.messageBoxContainer);
			}
		} else {
			this.messageBoxContainer.style.display = 'none';
			if (filtered === total) {
				this.ariaLabelElement.setAttribute('aria-label', localize('No problems filtered', "Showing {0} problems", total));
			} else {
				this.ariaLabelElement.setAttribute('aria-label', localize('problems filtered', "Showing {0} of {1} problems", filtered, total));
			}
			this.messageBoxContainer.removeAttribute('tabIndex');
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
		link.textContent = localize('clearFilter', "Clear Filter");
		link.setAttribute('tabIndex', '0');
		const span2 = dom.append(container, dom.$('span'));
		span2.textContent = '.';
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
			if (!this.tree.isCollapsed(currentActiveResource) && this.hasSelectedMarkerFor(currentActiveResource)) {
				this.tree.reveal(this.tree.getSelection()[0], this.lastSelectedRelativeTop);
				if (focus) {
					this.tree.setFocus(this.tree.getSelection());
				}
			} else {
				this.tree.expand(currentActiveResource);
				this.tree.reveal(currentActiveResource, 0);

				if (focus) {
					this.tree.setFocus([currentActiveResource]);
					this.tree.setSelection([currentActiveResource]);
				}
			}
		} else if (focus) {
			this.tree.setSelection([]);
			this.tree.focusFirst();
		}
	}

	private getResourceForCurrentActiveResource(): ResourceMarkers | null {
		return this.currentActiveResource ? this.markersWorkbenchService.markersModel.getResourceMarkers(this.currentActiveResource) : null;
	}

	private hasSelectedMarkerFor(resource: ResourceMarkers): boolean {
		let selectedElement = this.tree.getSelection();
		if (selectedElement && selectedElement.length > 0) {
			if (selectedElement[0] instanceof Marker) {
				if (resource.resource.toString() === (<Marker>selectedElement[0]).marker.resource.toString()) {
					return true;
				}
			}
		}
		return false;
	}

	private updateRangeHighlights() {
		this.rangeHighlightDecorations.removeHighlightRange();
		if (this.tree.getHTMLElement() === document.activeElement) {
			this.highlightCurrentSelectedMarkerRange();
		}
	}

	private highlightCurrentSelectedMarkerRange() {
		const selections = this.tree.getSelection();

		if (selections.length !== 1) {
			return;
		}

		const selection = selections[0];

		if (!(selection instanceof Marker)) {
			return;
		}

		this.rangeHighlightDecorations.highlightRange(selection);
	}

	private onContextMenu(e: ITreeContextMenuEvent<TreeElement>): void {
		const element = e.element;
		if (!element) {
			return;
		}

		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor!,
			getActions: () => this.getMenuActions(element),
			getActionViewItem: (action) => {
				const keybinding = this.keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return undefined;
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this.tree.domFocus();
				}
			}
		});
	}

	private getMenuActions(element: TreeElement): IAction[] {
		const result: IAction[] = [];

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

		const menu = this.menuService.createMenu(MenuId.ProblemsPanelContext, this.tree.contextKeyService);
		const groups = menu.getActions();
		menu.dispose();

		for (let group of groups) {
			const [, actions] = group;
			result.push(...actions);
			result.push(new Separator());
		}

		result.pop(); // remove last separator
		return result;
	}

	public getFocusElement() {
		return this.tree.getFocus()[0];
	}

	public getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === MarkersFilterAction.ID) {
			this.filterInputActionViewItem = this.instantiationService.createInstance(MarkersFilterActionViewItem, this.filterAction, this);
			return this.filterInputActionViewItem;
		}
		return super.getActionViewItem(action);
	}

	getFilterOptions(): FilterOptions {
		return this.filter.options;
	}

	getFilterStats(): { total: number; filtered: number; } {
		if (!this.cachedFilterStats) {
			this.cachedFilterStats = this.computeFilterStats();
		}

		return this.cachedFilterStats;
	}

	private computeFilterStats(): { total: number; filtered: number; } {
		const root = this.tree.getNode();
		let total = 0;
		let filtered = 0;

		for (const resourceMarkerNode of root.children) {
			for (const markerNode of resourceMarkerNode.children) {
				total++;

				if (resourceMarkerNode.visible && markerNode.visible) {
					filtered++;
				}
			}
		}

		return { total, filtered };
	}

	private getTelemetryData({ source, code }: IMarker): any {
		return { source, code };
	}

	protected saveState(): void {
		this.panelState['filter'] = this.filterAction.filterText;
		this.panelState['filterHistory'] = this.filterAction.filterHistory;
		this.panelState['useFilesExclude'] = this.filterAction.useFilesExclude;
		this.panelState['multiline'] = this.markersViewModel.multiline;

		super.saveState();
	}

	public dispose(): void {
		super.dispose();
		this.tree.dispose();
		this.markersViewModel.dispose();
		this.disposables = dispose(this.disposables);
	}
}
