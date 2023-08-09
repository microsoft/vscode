/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';

import { URI } from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import { IAction, Separator } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { Marker, ResourceMarkers, RelatedInformation, MarkerChangesEvent, MarkersModel, compareMarkersByUri, MarkerElement, MarkerTableItem } from 'vs/workbench/contrib/markers/browser/markersModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MarkersFilters, IMarkersFiltersChangeEvent } from 'vs/workbench/contrib/markers/browser/markersViewActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import Messages from 'vs/workbench/contrib/markers/browser/messages';
import { RangeHighlightDecorations } from 'vs/workbench/browser/codeeditor';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Iterable } from 'vs/base/common/iterator';
import { ITreeElement, ITreeNode, ITreeContextMenuEvent, ITreeRenderer, ITreeEvent } from 'vs/base/browser/ui/tree/tree';
import { Relay, Event } from 'vs/base/common/event';
import { WorkbenchObjectTree, IListService, IWorkbenchObjectTreeOptions, IOpenEvent } from 'vs/platform/list/browser/listService';
import { FilterOptions } from 'vs/workbench/contrib/markers/browser/markersFilterOptions';
import { IExpression } from 'vs/base/common/glob';
import { deepClone } from 'vs/base/common/objects';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FilterData, Filter, VirtualDelegate, ResourceMarkersRenderer, MarkerRenderer, RelatedInformationRenderer, MarkersWidgetAccessibilityProvider, MarkersViewModel } from 'vs/workbench/contrib/markers/browser/markersTreeViewer';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { StandardKeyboardEvent, IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { MementoObject, Memento } from 'vs/workbench/common/memento';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IViewPaneOptions, FilterViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IOpenerService, withSelection } from 'vs/platform/opener/common/opener';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { groupBy } from 'vs/base/common/arrays';
import { ResourceMap } from 'vs/base/common/map';
import { EditorResourceAccessor, SideBySideEditor } from 'vs/workbench/common/editor';
import { IMarkersView } from 'vs/workbench/contrib/markers/browser/markers';
import { ResourceListDnDHandler } from 'vs/workbench/browser/dnd';
import { ITableContextMenuEvent, ITableEvent } from 'vs/base/browser/ui/table/table';
import { MarkersTable } from 'vs/workbench/contrib/markers/browser/markersTable';
import { Markers, MarkersContextKeys, MarkersViewMode } from 'vs/workbench/contrib/markers/common/markers';
import { registerNavigableContainer } from 'vs/workbench/browser/actions/widgetNavigationCommands';

function createResourceMarkersIterator(resourceMarkers: ResourceMarkers): Iterable<ITreeElement<MarkerElement>> {
	return Iterable.map(resourceMarkers.markers, m => {
		const relatedInformationIt = Iterable.from(m.relatedInformation);
		const children = Iterable.map(relatedInformationIt, r => ({ element: r }));

		return { element: m, children };
	});
}

export interface IProblemsWidget {
	get contextKeyService(): IContextKeyService;

	get onContextMenu(): Event<ITreeContextMenuEvent<MarkerElement | null>> | Event<ITableContextMenuEvent<MarkerTableItem>>;
	get onDidChangeFocus(): Event<ITreeEvent<MarkerElement | null>> | Event<ITableEvent<MarkerTableItem>>;
	get onDidChangeSelection(): Event<ITreeEvent<MarkerElement | null>> | Event<ITableEvent<MarkerTableItem>>;
	get onDidOpen(): Event<IOpenEvent<MarkerElement | MarkerTableItem | undefined>>;

	collapseMarkers(): void;
	dispose(): void;
	domFocus(): void;
	filterMarkers(resourceMarkers: ResourceMarkers[], filterOptions: FilterOptions): void;
	getFocus(): (MarkerElement | MarkerTableItem | null)[];
	getHTMLElement(): HTMLElement;
	getRelativeTop(location: MarkerElement | MarkerTableItem | null): number | null;
	getSelection(): (MarkerElement | MarkerTableItem | null)[];
	getVisibleItemCount(): number;
	layout(height: number, width: number): void;
	reset(resourceMarkers: ResourceMarkers[]): void;
	revealMarkers(activeResource: ResourceMarkers | null, focus: boolean, lastSelectedRelativeTop: number): void;
	setAriaLabel(label: string): void;
	setMarkerSelection(selection?: Marker[], focus?: Marker[]): void;
	toggleVisibility(hide: boolean): void;
	update(resourceMarkers: ResourceMarkers[]): void;
	updateMarker(marker: Marker): void;
}

export class MarkersView extends FilterViewPane implements IMarkersView {

	private lastSelectedRelativeTop: number = 0;
	private currentActiveResource: URI | null = null;

	private readonly rangeHighlightDecorations: RangeHighlightDecorations;
	private readonly markersModel: MarkersModel;
	private readonly filter: Filter;
	private readonly onVisibleDisposables = this._register(new DisposableStore());

	private widget!: IProblemsWidget;
	private widgetDisposables = this._register(new DisposableStore());
	private widgetContainer!: HTMLElement;
	private widgetIdentityProvider: IIdentityProvider<MarkerElement | MarkerTableItem>;
	private widgetAccessibilityProvider: MarkersWidgetAccessibilityProvider;
	private messageBoxContainer: HTMLElement | undefined;
	private ariaLabelElement: HTMLElement | undefined;
	readonly filters: MarkersFilters;

	private currentHeight = 0;
	private currentWidth = 0;
	private readonly panelState: MementoObject;

	private cachedFilterStats: { total: number; filtered: number } | undefined = undefined;

	private currentResourceGotAddedToMarkersData: boolean = false;
	private readonly markersViewModel: MarkersViewModel;

	readonly onDidChangeVisibility = this.onDidChangeBodyVisibility;

	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IStorageService storageService: IStorageService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
	) {
		const panelState = new Memento(Markers.MARKERS_VIEW_STORAGE_ID, storageService).getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		super({
			...options,
			filterOptions: {
				ariaLabel: Messages.MARKERS_PANEL_FILTER_ARIA_LABEL,
				placeholder: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER,
				focusContextKey: MarkersContextKeys.MarkerViewFilterFocusContextKey.key,
				text: panelState['filter'] || '',
				history: panelState['filterHistory'] || []
			}
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		this.panelState = panelState;

		this.markersModel = this._register(instantiationService.createInstance(MarkersModel));
		this.markersViewModel = this._register(instantiationService.createInstance(MarkersViewModel, this.panelState['multiline'], this.panelState['viewMode'] ?? this.getDefaultViewMode()));
		this._register(this.onDidChangeVisibility(visible => this.onDidChangeMarkersViewVisibility(visible)));
		this._register(this.markersViewModel.onDidChangeViewMode(_ => this.onDidChangeViewMode()));

		this.widgetAccessibilityProvider = instantiationService.createInstance(MarkersWidgetAccessibilityProvider);
		this.widgetIdentityProvider = { getId(element: MarkerElement | MarkerTableItem) { return element.id; } };

		this.setCurrentActiveEditor();

		this.filter = new Filter(FilterOptions.EMPTY(uriIdentityService));
		this.rangeHighlightDecorations = this._register(this.instantiationService.createInstance(RangeHighlightDecorations));

		this.filters = this._register(new MarkersFilters({
			filterHistory: this.panelState['filterHistory'] || [],
			showErrors: this.panelState['showErrors'] !== false,
			showWarnings: this.panelState['showWarnings'] !== false,
			showInfos: this.panelState['showInfos'] !== false,
			excludedFiles: !!this.panelState['useFilesExclude'],
			activeFile: !!this.panelState['activeFile'],
		}, this.contextKeyService));

		// Update filter, whenever the "files.exclude" setting is changed
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (this.filters.excludedFiles && e.affectsConfiguration('files.exclude')) {
				this.updateFilter();
			}
		}));
	}

	override render(): void {
		super.render();
		this._register(registerNavigableContainer({
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

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		parent.classList.add('markers-panel');
		this._register(dom.addDisposableListener(parent, 'keydown', e => {
			if (this.keybindingService.mightProducePrintableCharacter(new StandardKeyboardEvent(e))) {
				this.focusFilter();
			}
		}));

		const panelContainer = dom.append(parent, dom.$('.markers-panel-container'));

		this.createArialLabelElement(panelContainer);

		this.createMessageBox(panelContainer);

		this.widgetContainer = dom.append(panelContainer, dom.$('.widget-container'));
		this.createWidget(this.widgetContainer);

		this.updateFilter();
		this.renderContent();
	}

	public getTitle(): string {
		return Messages.MARKERS_PANEL_TITLE_PROBLEMS;
	}

	protected layoutBodyContent(height: number = this.currentHeight, width: number = this.currentWidth): void {
		if (this.messageBoxContainer) {
			this.messageBoxContainer.style.height = `${height}px`;
		}
		this.widget.layout(height, width);

		this.currentHeight = height;
		this.currentWidth = width;
	}

	public override focus(): void {
		if (this.widget.getHTMLElement() === document.activeElement) {
			return;
		}

		if (this.hasNoProblems()) {
			this.messageBoxContainer!.focus();
		} else {
			this.widget.domFocus();
			this.widget.setMarkerSelection();
		}
	}

	public focusFilter(): void {
		this.filterWidget.focus();
	}

	public updateBadge(total: number, filtered: number): void {
		this.filterWidget.updateBadge(total === filtered || total === 0 ? undefined : localize('showing filtered problems', "Showing {0} of {1}", filtered, total));
	}

	public checkMoreFilters(): void {
		this.filterWidget.checkMoreFilters(!this.filters.showErrors || !this.filters.showWarnings || !this.filters.showInfos || this.filters.excludedFiles || this.filters.activeFile);
	}

	public clearFilterText(): void {
		this.filterWidget.setFilterText('');
	}

	public showQuickFixes(marker: Marker): void {
		const viewModel = this.markersViewModel.getViewModel(marker);
		if (viewModel) {
			viewModel.quickFixAction.run();
		}
	}

	public openFileAtElement(element: any, preserveFocus: boolean, sideByside: boolean, pinned: boolean): boolean {
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

	private refreshPanel(markerOrChange?: Marker | MarkerChangesEvent): void {
		if (this.isVisible()) {
			const hasSelection = this.widget.getSelection().length > 0;

			if (markerOrChange) {
				if (markerOrChange instanceof Marker) {
					this.widget.updateMarker(markerOrChange);
				} else {
					if (markerOrChange.added.size || markerOrChange.removed.size) {
						// Reset complete widget
						this.resetWidget();
					} else {
						// Update resource
						this.widget.update([...markerOrChange.updated]);
					}
				}
			} else {
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

	private onDidChangeViewState(marker?: Marker): void {
		this.refreshPanel(marker);
	}

	private resetWidget(): void {
		this.widget.reset(this.getResourceMarkers());
	}

	private updateFilter() {
		this.filter.options = new FilterOptions(this.filterWidget.getFilterText(), this.getFilesExcludeExpressions(), this.filters.showWarnings, this.filters.showErrors, this.filters.showInfos, this.uriIdentityService);
		this.widget.filterMarkers(this.getResourceMarkers(), this.filter.options);

		this.cachedFilterStats = undefined;
		const { total, filtered } = this.getFilterStats();
		this.toggleVisibility(total === 0 || filtered === 0);
		this.renderMessage();

		this.updateBadge(total, filtered);
		this.checkMoreFilters();
	}

	private getDefaultViewMode(): MarkersViewMode {
		switch (this.configurationService.getValue<string>('problems.defaultViewMode')) {
			case 'table':
				return MarkersViewMode.Table;
			case 'tree':
				return MarkersViewMode.Tree;
			default:
				return MarkersViewMode.Tree;
		}
	}

	private getFilesExcludeExpressions(): { root: URI; expression: IExpression }[] | IExpression {
		if (!this.filters.excludedFiles) {
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

	private getResourceMarkers(): ResourceMarkers[] {
		if (!this.filters.activeFile) {
			return this.markersModel.resourceMarkers;
		}

		let resourceMarkers: ResourceMarkers[] = [];
		if (this.currentActiveResource) {
			const activeResourceMarkers = this.markersModel.getResourceMarkers(this.currentActiveResource);
			if (activeResourceMarkers) {
				resourceMarkers = [activeResourceMarkers];
			}
		}

		return resourceMarkers;
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
		this.messageBoxContainer.setAttribute('aria-labelledby', 'markers-panel-arialabel');
	}

	private createArialLabelElement(parent: HTMLElement): void {
		this.ariaLabelElement = dom.append(parent, dom.$(''));
		this.ariaLabelElement.setAttribute('id', 'markers-panel-arialabel');
	}

	private createWidget(parent: HTMLElement): void {
		this.widget = this.markersViewModel.viewMode === MarkersViewMode.Table ? this.createTable(parent) : this.createTree(parent);
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

		this.widgetDisposables.add(Event.any<any>(this.widget.onDidChangeSelection, this.widget.onDidChangeFocus)(() => {
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

	private createTable(parent: HTMLElement): IProblemsWidget {
		const table = this.instantiationService.createInstance(MarkersTable,
			dom.append(parent, dom.$('.markers-table-container')),
			this.markersViewModel,
			this.getResourceMarkers(),
			this.filter.options,
			{
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
			},
		);

		return table;
	}

	private createTree(parent: HTMLElement): IProblemsWidget {
		const onDidChangeRenderNodeCount = new Relay<ITreeNode<any, any>>();

		const treeLabels = this.instantiationService.createInstance(ResourceLabels, this);

		const virtualDelegate = new VirtualDelegate(this.markersViewModel);
		const renderers = [
			this.instantiationService.createInstance(ResourceMarkersRenderer, treeLabels, onDidChangeRenderNodeCount.event),
			this.instantiationService.createInstance(MarkerRenderer, this.markersViewModel),
			this.instantiationService.createInstance(RelatedInformationRenderer)
		];

		const tree = this.instantiationService.createInstance(MarkersTree,
			'MarkersView',
			dom.append(parent, dom.$('.tree-container.show-file-icons')),
			virtualDelegate,
			renderers,
			{
				filter: this.filter,
				accessibilityProvider: this.widgetAccessibilityProvider,
				identityProvider: this.widgetIdentityProvider,
				dnd: this.instantiationService.createInstance(ResourceListDnDHandler, (element) => {
					if (element instanceof ResourceMarkers) {
						return element.resource;
					}
					if (element instanceof Marker) {
						return withSelection(element.resource, element.range);
					}
					if (element instanceof RelatedInformation) {
						return withSelection(element.raw.resource, element.raw);
					}
					return null;
				}),
				expandOnlyOnTwistieClick: (e: MarkerElement) => e instanceof Marker && e.relatedInformation.length > 0,
				overrideStyles: {
					listBackground: this.getBackgroundColor()
				},
				selectionNavigation: true,
				multipleSelectionSupport: true,
			},
		);

		onDidChangeRenderNodeCount.input = tree.onDidChangeRenderNodeCount;

		return tree;
	}

	collapseAll(): void {
		this.widget.collapseMarkers();
	}

	setMultiline(multiline: boolean): void {
		this.markersViewModel.multiline = multiline;
	}

	setViewMode(viewMode: MarkersViewMode): void {
		this.markersViewModel.viewMode = viewMode;
	}

	private onDidChangeMarkersViewVisibility(visible: boolean): void {
		this.onVisibleDisposables.clear();
		if (visible) {
			for (const disposable of this.reInitialize()) {
				this.onVisibleDisposables.add(disposable);
			}
			this.refreshPanel();
		}
	}

	private reInitialize(): IDisposable[] {
		const disposables = [];

		// Markers Model
		const readMarkers = (resource?: URI) => this.markerService.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
		this.markersModel.setResourceMarkers(groupBy(readMarkers(), compareMarkersByUri).map(group => [group[0].resource, group]));
		disposables.push(Event.debounce<readonly URI[], ResourceMap<URI>>(this.markerService.onMarkerChanged, (resourcesMap, resources) => {
			resourcesMap = resourcesMap || new ResourceMap<URI>();
			resources.forEach(resource => resourcesMap!.set(resource, resource));
			return resourcesMap;
		}, 64)(resourcesMap => {
			this.markersModel.setResourceMarkers([...resourcesMap.values()].map(resource => [resource, readMarkers(resource)]));
		}));
		disposables.push(Event.any<MarkerChangesEvent | void>(this.markersModel.onDidChange, this.editorService.onDidActiveEditorChange)(changes => {
			if (changes) {
				this.onDidChangeModel(changes);
			} else {
				this.onActiveEditorChanged();
			}
		}));
		disposables.push(toDisposable(() => this.markersModel.reset()));

		// Markers View Model
		this.markersModel.resourceMarkers.forEach(resourceMarker => resourceMarker.markers.forEach(marker => this.markersViewModel.add(marker)));
		disposables.push(this.markersViewModel.onDidChange(marker => this.onDidChangeViewState(marker)));
		disposables.push(toDisposable(() => this.markersModel.resourceMarkers.forEach(resourceMarker => this.markersViewModel.remove(resourceMarker.resource))));

		// Markers Filters
		disposables.push(this.filters.onDidChange((event: IMarkersFiltersChangeEvent) => {
			if (event.activeFile) {
				this.refreshPanel();
			} else if (event.excludedFiles || event.showWarnings || event.showErrors || event.showInfos) {
				this.updateFilter();
			}
		}));
		disposables.push(this.filterWidget.onDidChangeFilterText(e => this.updateFilter()));
		disposables.push(toDisposable(() => { this.cachedFilterStats = undefined; }));

		disposables.push(toDisposable(() => this.rangeHighlightDecorations.removeHighlightRange()));

		return disposables;
	}

	private onDidChangeModel(change: MarkerChangesEvent): void {
		const resourceMarkers = [...change.added, ...change.removed, ...change.updated];
		const resources: URI[] = [];
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

	private onDidChangeViewMode(): void {
		if (this.widgetContainer && this.widget) {
			this.widgetContainer.textContent = '';
			this.widgetDisposables.clear();
		}

		// Save selection
		const selection = new Set<Marker>();
		for (const marker of this.widget.getSelection()) {
			if (marker instanceof ResourceMarkers) {
				marker.markers.forEach(m => selection.add(m));
			} else if (marker instanceof Marker || marker instanceof MarkerTableItem) {
				selection.add(marker);
			}
		}

		// Save focus
		const focus = new Set<Marker>();
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
		if (this.filters.activeFile) {
			this.refreshPanel();
		}
		this.autoReveal();
	}

	private setCurrentActiveEditor(): void {
		const activeEditor = this.editorService.activeEditor;
		this.currentActiveResource = activeEditor ? EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }) ?? null : null;
	}

	private onSelected(): void {
		const selection = this.widget.getSelection();
		if (selection && selection.length > 0) {
			this.lastSelectedRelativeTop = this.widget.getRelativeTop(selection[0]) || 0;
		}
	}

	private hasNoProblems(): boolean {
		const { total, filtered } = this.getFilterStats();
		return total === 0 || filtered === 0;
	}

	private renderContent(): void {
		this.cachedFilterStats = undefined;
		this.resetWidget();
		this.toggleVisibility(this.hasNoProblems());
		this.renderMessage();
	}

	private renderMessage(): void {
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
			} else {
				if (total > 0) {
					this.renderFilteredByFilterMessage(this.messageBoxContainer);
				} else {
					this.renderNoProblemsMessage(this.messageBoxContainer);
				}
			}
		} else {
			this.messageBoxContainer.style.display = 'none';
			if (filtered === total) {
				this.setAriaLabel(localize('No problems filtered', "Showing {0} problems", total));
			} else {
				this.setAriaLabel(localize('problems filtered', "Showing {0} of {1} problems", filtered, total));
			}
			this.messageBoxContainer.removeAttribute('tabIndex');
		}
	}

	private renderFilterMessageForActiveFile(container: HTMLElement): void {
		if (this.currentActiveResource && this.markersModel.getResourceMarkers(this.currentActiveResource)) {
			this.renderFilteredByFilterMessage(container);
		} else {
			this.renderNoProblemsMessageForActiveFile(container);
		}
	}

	private renderFilteredByFilterMessage(container: HTMLElement) {
		const span1 = dom.append(container, dom.$('span'));
		span1.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS;
		const link = dom.append(container, dom.$('a.messageAction'));
		link.textContent = localize('clearFilter', "Clear Filters");
		link.setAttribute('tabIndex', '0');
		const span2 = dom.append(container, dom.$('span'));
		span2.textContent = '.';
		dom.addStandardDisposableListener(link, dom.EventType.CLICK, () => this.clearFilters());
		dom.addStandardDisposableListener(link, dom.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				this.clearFilters();
				e.stopPropagation();
			}
		});
		this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS);
	}

	private renderNoProblemsMessageForActiveFile(container: HTMLElement) {
		const span = dom.append(container, dom.$('span'));
		span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_ACTIVE_FILE_BUILT;
		this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_ACTIVE_FILE_BUILT);
	}

	private renderNoProblemsMessage(container: HTMLElement) {
		const span = dom.append(container, dom.$('span'));
		span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT;
		this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT);
	}

	private setAriaLabel(label: string): void {
		this.widget.setAriaLabel(label);
		this.ariaLabelElement!.setAttribute('aria-label', label);
	}

	private clearFilters(): void {
		this.filterWidget.setFilterText('');
		this.filters.excludedFiles = false;
		this.filters.showErrors = true;
		this.filters.showWarnings = true;
		this.filters.showInfos = true;
	}

	private autoReveal(focus: boolean = false): void {
		// No need to auto reveal if active file filter is on
		if (this.filters.activeFile) {
			return;
		}
		const autoReveal = this.configurationService.getValue<boolean>('problems.autoReveal');
		if (typeof autoReveal === 'boolean' && autoReveal) {
			const currentActiveResource = this.getResourceForCurrentActiveResource();
			this.widget.revealMarkers(currentActiveResource, focus, this.lastSelectedRelativeTop);
		}
	}

	private getResourceForCurrentActiveResource(): ResourceMarkers | null {
		return this.currentActiveResource ? this.markersModel.getResourceMarkers(this.currentActiveResource) : null;
	}

	private updateRangeHighlights() {
		this.rangeHighlightDecorations.removeHighlightRange();
		if (this.widget.getHTMLElement() === document.activeElement) {
			this.highlightCurrentSelectedMarkerRange();
		}
	}

	private highlightCurrentSelectedMarkerRange() {
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

	private onContextMenu(e: ITreeContextMenuEvent<MarkerElement | null> | ITableContextMenuEvent<MarkerTableItem>): void {
		const element = e.element;
		if (!element) {
			return;
		}

		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor!,
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
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this.widget.domFocus();
				}
			}
		});
	}

	private getMenuActions(element: MarkerElement | null): IAction[] {
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

		return result;
	}

	public getFocusElement(): MarkerElement | undefined {
		return this.widget.getFocus()[0] ?? undefined;
	}

	public getFocusedSelectedElements(): MarkerElement[] | null {
		const focus = this.getFocusElement();
		if (!focus) {
			return null;
		}
		const selection = this.widget.getSelection();
		if (selection.includes(focus)) {
			const result: MarkerElement[] = [];
			for (const selected of selection) {
				if (selected) {
					result.push(selected);
				}
			}
			return result;
		} else {
			return [focus];
		}
	}

	public getAllResourceMarkers(): ResourceMarkers[] {
		return this.markersModel.resourceMarkers;
	}

	getFilterStats(): { total: number; filtered: number } {
		if (!this.cachedFilterStats) {
			this.cachedFilterStats = {
				total: this.markersModel.total,
				filtered: this.widget?.getVisibleItemCount() ?? 0
			};
		}

		return this.cachedFilterStats;
	}

	private toggleVisibility(hide: boolean): void {
		this.widget.toggleVisibility(hide);
		this.layoutBodyContent();
	}

	override saveState(): void {
		this.panelState['filter'] = this.filterWidget.getFilterText();
		this.panelState['filterHistory'] = this.filters.filterHistory;
		this.panelState['showErrors'] = this.filters.showErrors;
		this.panelState['showWarnings'] = this.filters.showWarnings;
		this.panelState['showInfos'] = this.filters.showInfos;
		this.panelState['useFilesExclude'] = this.filters.excludedFiles;
		this.panelState['activeFile'] = this.filters.activeFile;
		this.panelState['multiline'] = this.markersViewModel.multiline;
		this.panelState['viewMode'] = this.markersViewModel.viewMode;

		super.saveState();
	}

	override dispose() {
		super.dispose();
	}

}

class MarkersTree extends WorkbenchObjectTree<MarkerElement, FilterData> implements IProblemsWidget {

	private readonly visibilityContextKey: IContextKey<boolean>;

	constructor(
		user: string,
		private readonly container: HTMLElement,
		delegate: IListVirtualDelegate<MarkerElement>,
		renderers: ITreeRenderer<MarkerElement, FilterData, any>[],
		options: IWorkbenchObjectTreeOptions<MarkerElement, FilterData>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService);
		this.visibilityContextKey = MarkersContextKeys.MarkersTreeVisibilityContextKey.bindTo(contextKeyService);
	}

	collapseMarkers(): void {
		this.collapseAll();
		this.setSelection([]);
		this.setFocus([]);
		this.getHTMLElement().focus();
		this.focusFirst();
	}

	filterMarkers(): void {
		this.refilter();
	}

	getVisibleItemCount(): number {
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

	isVisible(): boolean {
		return !this.container.classList.contains('hidden');
	}

	toggleVisibility(hide: boolean): void {
		this.visibilityContextKey.set(!hide);
		this.container.classList.toggle('hidden', hide);
	}

	reset(resourceMarkers: ResourceMarkers[]): void {
		this.setChildren(null, Iterable.map(resourceMarkers, m => ({ element: m, children: createResourceMarkersIterator(m) })));
	}

	revealMarkers(activeResource: ResourceMarkers | null, focus: boolean, lastSelectedRelativeTop: number): void {
		if (activeResource) {
			if (this.hasElement(activeResource)) {
				if (!this.isCollapsed(activeResource) && this.hasSelectedMarkerFor(activeResource)) {
					this.reveal(this.getSelection()[0], lastSelectedRelativeTop);
					if (focus) {
						this.setFocus(this.getSelection());
					}
				} else {
					this.expand(activeResource);
					this.reveal(activeResource, 0);

					if (focus) {
						this.setFocus([activeResource]);
						this.setSelection([activeResource]);
					}
				}
			}
		} else if (focus) {
			this.setSelection([]);
			this.focusFirst();
		}
	}

	setAriaLabel(label: string): void {
		this.ariaLabel = label;
	}

	setMarkerSelection(selection?: Marker[], focus?: Marker[]): void {
		if (this.isVisible()) {
			if (selection && selection.length > 0) {
				this.setSelection(selection.map(m => this.findMarkerNode(m)));

				if (focus && focus.length > 0) {
					this.setFocus(focus.map(f => this.findMarkerNode(f)));
				} else {
					this.setFocus([this.findMarkerNode(selection[0])]);
				}

				this.reveal(this.findMarkerNode(selection[0]));
			} else if (this.getSelection().length === 0) {
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

	update(resourceMarkers: ResourceMarkers[]): void {
		for (const resourceMarker of resourceMarkers) {
			this.setChildren(resourceMarker, createResourceMarkersIterator(resourceMarker));
			this.rerender(resourceMarker);
		}
	}

	updateMarker(marker: Marker): void {
		this.rerender(marker);
	}

	private findMarkerNode(marker: Marker) {
		for (const resourceNode of this.getNode().children) {
			for (const markerNode of resourceNode.children) {
				if (markerNode.element instanceof Marker && markerNode.element.marker === marker.marker) {
					return markerNode.element;
				}
			}
		}

		return null;
	}

	private hasSelectedMarkerFor(resource: ResourceMarkers): boolean {
		const selectedElement = this.getSelection();
		if (selectedElement && selectedElement.length > 0) {
			if (selectedElement[0] instanceof Marker) {
				if (resource.has((<Marker>selectedElement[0]).marker.resource)) {
					return true;
				}
			}
		}

		return false;
	}

	override dispose(): void {
		super.dispose();
	}

	override layout(height: number, width: number): void {
		this.container.style.height = `${height}px`;
		super.layout(height, width);
	}
}
