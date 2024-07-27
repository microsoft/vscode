/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IIconLabelValueOptions, IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { Disposable, DisposableStore, IDisposable, toDisposable, type IReference } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { getIconClassesForLanguageId } from 'vs/editor/common/services/getIconClasses';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchDataTreeOptions } from 'vs/platform/list/browser/listService';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { Registry } from 'vs/platform/registry/common/platform';
import { listErrorForeground, listWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorPane } from 'vs/workbench/common/editor';
import { CellFoldingState, CellRevealType, ICellModelDecorations, ICellModelDeltaDecorations, ICellViewModel, INotebookEditor, INotebookEditorOptions, INotebookEditorPane, INotebookViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { INotebookCellOutlineDataSource, NotebookCellOutlineDataSource } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineDataSource';
import { CellKind, NotebookCellsChangeType, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IBreadcrumbsDataSource, IOutline, IOutlineComparator, IOutlineCreator, IOutlineListConfig, IOutlineService, IQuickPickDataSource, IQuickPickOutlineElement, OutlineChangeEvent, OutlineConfigCollapseItemsValues, OutlineConfigKeys, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
import { OutlineEntry } from 'vs/workbench/contrib/notebook/browser/viewModel/OutlineEntry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { mainWindow } from 'vs/base/browser/window';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action2, IMenu, IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { MenuEntryActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IAction } from 'vs/base/common/actions';
import { NotebookSectionArgs } from 'vs/workbench/contrib/notebook/browser/controller/sectionActions';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { Delayer, disposableTimeout } from 'vs/base/common/async';
import { IOutlinePane } from 'vs/workbench/contrib/outline/browser/outline';
import { Codicon } from 'vs/base/common/codicons';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { NotebookOutlineConstants } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineEntryFactory';
import { INotebookCellOutlineDataSourceFactory } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineDataSourceFactory';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

class NotebookOutlineTemplate {

	static readonly templateId = 'NotebookOutlineRenderer';

	constructor(
		readonly container: HTMLElement,
		readonly iconClass: HTMLElement,
		readonly iconLabel: IconLabel,
		readonly decoration: HTMLElement,
		readonly actionMenu: HTMLElement,
		readonly elementDisposables: DisposableStore,
	) { }
}

class NotebookOutlineRenderer implements ITreeRenderer<OutlineEntry, FuzzyScore, NotebookOutlineTemplate> {

	templateId: string = NotebookOutlineTemplate.templateId;

	constructor(
		private readonly _editor: INotebookEditor | undefined,
		private readonly _target: OutlineTarget,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): NotebookOutlineTemplate {
		const elementDisposables = new DisposableStore();

		container.classList.add('notebook-outline-element', 'show-file-icons');
		const iconClass = document.createElement('div');
		container.append(iconClass);
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const decoration = document.createElement('div');
		decoration.className = 'element-decoration';
		container.append(decoration);
		const actionMenu = document.createElement('div');
		actionMenu.className = 'action-menu';
		container.append(actionMenu);

		return new NotebookOutlineTemplate(container, iconClass, iconLabel, decoration, actionMenu, elementDisposables);
	}

	renderElement(node: ITreeNode<OutlineEntry, FuzzyScore>, _index: number, template: NotebookOutlineTemplate, _height: number | undefined): void {
		const extraClasses: string[] = [];
		const options: IIconLabelValueOptions = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
			extraClasses,
		};

		const isCodeCell = node.element.cell.cellKind === CellKind.Code;
		if (node.element.level >= 8) { // symbol
			template.iconClass.className = 'element-icon ' + ThemeIcon.asClassNameArray(node.element.icon).join(' ');
		} else if (isCodeCell && this._themeService.getFileIconTheme().hasFileIcons && !node.element.isExecuting) {
			template.iconClass.className = '';
			extraClasses.push(...getIconClassesForLanguageId(node.element.cell.language ?? ''));
		} else {
			template.iconClass.className = 'element-icon ' + ThemeIcon.asClassNameArray(node.element.icon).join(' ');
		}

		template.iconLabel.setLabel(' ' + node.element.label, undefined, options);

		const { markerInfo } = node.element;

		template.container.style.removeProperty('--outline-element-color');
		template.decoration.innerText = '';
		if (markerInfo) {
			const problem = this._configurationService.getValue('problems.visibility');
			const useBadges = this._configurationService.getValue(OutlineConfigKeys.problemsBadges);

			if (!useBadges || !problem) {
				template.decoration.classList.remove('bubble');
				template.decoration.innerText = '';
			} else if (markerInfo.count === 0) {
				template.decoration.classList.add('bubble');
				template.decoration.innerText = '\uea71';
			} else {
				template.decoration.classList.remove('bubble');
				template.decoration.innerText = markerInfo.count > 9 ? '9+' : String(markerInfo.count);
			}
			const color = this._themeService.getColorTheme().getColor(markerInfo.topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
			if (problem === undefined) {
				return;
			}
			const useColors = this._configurationService.getValue(OutlineConfigKeys.problemsColors);
			if (!useColors || !problem) {
				template.container.style.removeProperty('--outline-element-color');
				template.decoration.style.setProperty('--outline-element-color', color?.toString() ?? 'inherit');
			} else {
				template.container.style.setProperty('--outline-element-color', color?.toString() ?? 'inherit');
			}
		}

		if (this._target === OutlineTarget.OutlinePane) {
			const nbCell = node.element.cell;
			const nbViewModel = this._editor?.getViewModel();
			if (!nbViewModel) {
				return;
			}
			const idx = nbViewModel.getCellIndex(nbCell);
			const length = isCodeCell ? 0 : nbViewModel.getFoldedLength(idx);

			const scopedContextKeyService = template.elementDisposables.add(this._contextKeyService.createScoped(template.container));
			NotebookOutlineContext.CellKind.bindTo(scopedContextKeyService).set(isCodeCell ? CellKind.Code : CellKind.Markup);
			NotebookOutlineContext.CellHasChildren.bindTo(scopedContextKeyService).set(length > 0);
			NotebookOutlineContext.CellHasHeader.bindTo(scopedContextKeyService).set(node.element.level !== NotebookOutlineConstants.NonHeaderOutlineLevel);
			NotebookOutlineContext.OutlineElementTarget.bindTo(scopedContextKeyService).set(this._target);
			this.setupFolding(isCodeCell, nbViewModel, scopedContextKeyService, template, nbCell);

			const outlineEntryToolbar = template.elementDisposables.add(new ToolBar(template.actionMenu, this._contextMenuService, {
				actionViewItemProvider: action => {
					if (action instanceof MenuItemAction) {
						return this._instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
					return undefined;
				},
			}));

			const menu = template.elementDisposables.add(this._menuService.createMenu(MenuId.NotebookOutlineActionMenu, scopedContextKeyService));
			const actions = getOutlineToolbarActions(menu, { notebookEditor: this._editor, outlineEntry: node.element });
			outlineEntryToolbar.setActions(actions.primary, actions.secondary);

			this.setupToolbarListeners(outlineEntryToolbar, menu, actions, node.element, template);
			template.actionMenu.style.padding = '0 0.8em 0 0.4em';
		}
	}

	disposeTemplate(templateData: NotebookOutlineTemplate): void {
		templateData.iconLabel.dispose();
		templateData.elementDisposables.clear();
	}

	disposeElement(element: ITreeNode<OutlineEntry, FuzzyScore>, index: number, templateData: NotebookOutlineTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
		DOM.clearNode(templateData.actionMenu);
	}

	private setupFolding(isCodeCell: boolean, nbViewModel: INotebookViewModel, scopedContextKeyService: IContextKeyService, template: NotebookOutlineTemplate, nbCell: ICellViewModel) {
		const foldingState = isCodeCell ? CellFoldingState.None : ((nbCell as MarkupCellViewModel).foldingState);
		const foldingStateCtx = NotebookOutlineContext.CellFoldingState.bindTo(scopedContextKeyService);
		foldingStateCtx.set(foldingState);

		if (!isCodeCell) {
			template.elementDisposables.add(nbViewModel.onDidFoldingStateChanged(() => {
				const foldingState = (nbCell as MarkupCellViewModel).foldingState;
				NotebookOutlineContext.CellFoldingState.bindTo(scopedContextKeyService).set(foldingState);
				foldingStateCtx.set(foldingState);
			}));
		}
	}

	private setupToolbarListeners(toolbar: ToolBar, menu: IMenu, initActions: { primary: IAction[]; secondary: IAction[] }, entry: OutlineEntry, templateData: NotebookOutlineTemplate): void {
		// same fix as in cellToolbars setupListeners re #103926
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		toolbar.setActions(initActions.primary, initActions.secondary);
		templateData.elementDisposables.add(menu.onDidChange(() => {
			if (dropdownIsVisible) {
				const actions = getOutlineToolbarActions(menu, { notebookEditor: this._editor, outlineEntry: entry });
				deferredUpdate = () => toolbar.setActions(actions.primary, actions.secondary);

				return;
			}

			const actions = getOutlineToolbarActions(menu, { notebookEditor: this._editor, outlineEntry: entry });
			toolbar.setActions(actions.primary, actions.secondary);
		}));

		templateData.container.classList.remove('notebook-outline-toolbar-dropdown-active');
		templateData.elementDisposables.add(toolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;
			if (visible) {
				templateData.container.classList.add('notebook-outline-toolbar-dropdown-active');
			} else {
				templateData.container.classList.remove('notebook-outline-toolbar-dropdown-active');
			}

			if (deferredUpdate && !visible) {
				disposableTimeout(() => {
					deferredUpdate?.();
				}, 0, templateData.elementDisposables);

				deferredUpdate = undefined;
			}
		}));

	}
}

function getOutlineToolbarActions(menu: IMenu, args?: NotebookSectionArgs): { primary: IAction[]; secondary: IAction[] } {
	const primary: IAction[] = [];
	const secondary: IAction[] = [];
	const result = { primary, secondary };

	// TODO: @Yoyokrazy bring the "inline" back when there's an appropriate run in section icon
	createAndFillInActionBarActions(menu, { shouldForwardArgs: true, arg: args }, result); //, g => /^inline/.test(g));

	return result;
}

class NotebookOutlineAccessibility implements IListAccessibilityProvider<OutlineEntry> {
	getAriaLabel(element: OutlineEntry): string | null {
		return element.label;
	}
	getWidgetAriaLabel(): string {
		return '';
	}
}

class NotebookNavigationLabelProvider implements IKeyboardNavigationLabelProvider<OutlineEntry> {
	getKeyboardNavigationLabel(element: OutlineEntry): { toString(): string | undefined } | { toString(): string | undefined }[] | undefined {
		return element.label;
	}
}

class NotebookOutlineVirtualDelegate implements IListVirtualDelegate<OutlineEntry> {

	getHeight(_element: OutlineEntry): number {
		return 22;
	}

	getTemplateId(_element: OutlineEntry): string {
		return NotebookOutlineTemplate.templateId;
	}
}

export class NotebookQuickPickProvider implements IQuickPickDataSource<OutlineEntry> {

	private readonly _disposables = new DisposableStore();

	private gotoShowCodeCellSymbols: boolean;

	constructor(
		private readonly notebookCellOutlineDataSourceRef: IReference<INotebookCellOutlineDataSource> | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		this.gotoShowCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.gotoSymbolsAllSymbols);

		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.gotoSymbolsAllSymbols)) {
				this.gotoShowCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.gotoSymbolsAllSymbols);
			}
		}));
	}

	getQuickPickElements(): IQuickPickOutlineElement<OutlineEntry>[] {
		const bucket: OutlineEntry[] = [];
		for (const entry of this.notebookCellOutlineDataSourceRef?.object?.entries ?? []) {
			entry.asFlatList(bucket);
		}
		const result: IQuickPickOutlineElement<OutlineEntry>[] = [];
		const { hasFileIcons } = this._themeService.getFileIconTheme();

		const isSymbol = (element: OutlineEntry) => !!element.symbolKind;
		const isCodeCell = (element: OutlineEntry) => (element.cell.cellKind === CellKind.Code && element.level === NotebookOutlineConstants.NonHeaderOutlineLevel); // code cell entries are exactly level 7 by this constant
		for (let i = 0; i < bucket.length; i++) {
			const element = bucket[i];
			const nextElement = bucket[i + 1]; // can be undefined

			if (!this.gotoShowCodeCellSymbols
				&& isSymbol(element)) {
				continue;
			}

			if (this.gotoShowCodeCellSymbols
				&& isCodeCell(element)
				&& nextElement && isSymbol(nextElement)) {
				continue;
			}

			const useFileIcon = hasFileIcons && !element.symbolKind;
			// todo@jrieken it is fishy that codicons cannot be used with iconClasses
			// but file icons can...
			result.push({
				element,
				label: useFileIcon ? element.label : `$(${element.icon.id}) ${element.label}`,
				ariaLabel: element.label,
				iconClasses: useFileIcon ? getIconClassesForLanguageId(element.cell.language ?? '') : undefined,
			});
		}
		return result;
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

export class NotebookOutlinePaneProvider implements IDataSource<NotebookCellOutline, OutlineEntry> {

	private readonly _disposables = new DisposableStore();

	private showCodeCells: boolean;
	private showCodeCellSymbols: boolean;
	private showMarkdownHeadersOnly: boolean;

	constructor(
		private readonly outlineDataSourceRef: IReference<INotebookCellOutlineDataSource> | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		this.showCodeCells = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCells);
		this.showCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);
		this.showMarkdownHeadersOnly = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowMarkdownHeadersOnly);

		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCells)) {
				this.showCodeCells = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCells);
			}
			if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols)) {
				this.showCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);
			}
			if (e.affectsConfiguration(NotebookSetting.outlineShowMarkdownHeadersOnly)) {
				this.showMarkdownHeadersOnly = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowMarkdownHeadersOnly);
			}
		}));
	}

	public getActiveEntry(): OutlineEntry | undefined {
		const newActive = this.outlineDataSourceRef?.object?.activeElement;
		if (!newActive) {
			return undefined;
		}

		if (!this.filterEntry(newActive)) {
			return newActive;
		}

		// find a valid parent
		let parent = newActive.parent;
		while (parent) {
			if (this.filterEntry(parent)) {
				parent = parent.parent;
			} else {
				return parent;
			}
		}

		// no valid parent found, return undefined
		return undefined;
	}

	/**
	 * Checks if the given outline entry should be filtered out of the outlinePane
	 *
	 * @param entry the OutlineEntry to check
	 * @returns true if the entry should be filtered out of the outlinePane
	 */
	private filterEntry(entry: OutlineEntry): boolean {
		// if any are true, return true, this entry should NOT be included in the outline
		if (
			(this.showMarkdownHeadersOnly && entry.cell.cellKind === CellKind.Markup && entry.level === NotebookOutlineConstants.NonHeaderOutlineLevel) ||	// show headers only   + cell is mkdn + is level 7 (not header)
			(!this.showCodeCells && entry.cell.cellKind === CellKind.Code) ||																				// show code cells off + cell is code
			(!this.showCodeCellSymbols && entry.cell.cellKind === CellKind.Code && entry.level > NotebookOutlineConstants.NonHeaderOutlineLevel)				// show symbols off    + cell is code + is level >7 (nb symbol levels)
		) {
			return true;
		}

		return false;
	}

	*getChildren(element: NotebookCellOutline | OutlineEntry): Iterable<OutlineEntry> {
		const isOutline = element instanceof NotebookCellOutline;
		const entries = isOutline ? this.outlineDataSourceRef?.object?.entries ?? [] : element.children;

		for (const entry of entries) {
			if (entry.cell.cellKind === CellKind.Markup) {
				if (!this.showMarkdownHeadersOnly) {
					yield entry;
				} else if (entry.level < NotebookOutlineConstants.NonHeaderOutlineLevel) {
					yield entry;
				}

			} else if (this.showCodeCells && entry.cell.cellKind === CellKind.Code) {
				if (this.showCodeCellSymbols) {
					yield entry;
				} else if (entry.level === NotebookOutlineConstants.NonHeaderOutlineLevel) {
					yield entry;
				}
			}
		}
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

export class NotebookBreadcrumbsProvider implements IBreadcrumbsDataSource<OutlineEntry> {

	private readonly _disposables = new DisposableStore();

	private showCodeCells: boolean;

	constructor(
		private readonly outlineDataSourceRef: IReference<INotebookCellOutlineDataSource> | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		this.showCodeCells = this._configurationService.getValue<boolean>(NotebookSetting.breadcrumbsShowCodeCells);
		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.breadcrumbsShowCodeCells)) {
				this.showCodeCells = this._configurationService.getValue<boolean>(NotebookSetting.breadcrumbsShowCodeCells);
			}
		}));
	}

	getBreadcrumbElements(): readonly OutlineEntry[] {
		const result: OutlineEntry[] = [];
		let candidate = this.outlineDataSourceRef?.object?.activeElement;
		while (candidate) {
			if (this.showCodeCells || candidate.cell.cellKind !== CellKind.Code) {
				result.unshift(candidate);
			}
			candidate = candidate.parent;
		}
		return result;
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

class NotebookComparator implements IOutlineComparator<OutlineEntry> {

	private readonly _collator = new DOM.WindowIdleValue<Intl.Collator>(mainWindow, () => new Intl.Collator(undefined, { numeric: true }));

	compareByPosition(a: OutlineEntry, b: OutlineEntry): number {
		return a.index - b.index;
	}
	compareByType(a: OutlineEntry, b: OutlineEntry): number {
		return a.cell.cellKind - b.cell.cellKind || this._collator.value.compare(a.label, b.label);
	}
	compareByName(a: OutlineEntry, b: OutlineEntry): number {
		return this._collator.value.compare(a.label, b.label);
	}
}

export class NotebookCellOutline implements IOutline<OutlineEntry> {
	readonly outlineKind = 'notebookCells';

	private readonly _disposables = new DisposableStore();
	private readonly _modelDisposables = new DisposableStore();
	private readonly _dataSourceDisposables = new DisposableStore();

	private readonly _onDidChange = new Emitter<OutlineChangeEvent>();
	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private readonly delayerRecomputeState: Delayer<void> = this._disposables.add(new Delayer<void>(300));
	private readonly delayerRecomputeActive: Delayer<void> = this._disposables.add(new Delayer<void>(200));
	// this can be long, because it will force a recompute at the end, so ideally we only do this once all nb language features are registered
	private readonly delayerRecomputeSymbols: Delayer<void> = this._disposables.add(new Delayer<void>(2000));

	readonly config: IOutlineListConfig<OutlineEntry>;
	private _outlineDataSourceReference: IReference<NotebookCellOutlineDataSource> | undefined;
	// These three fields will always be set via setDataSources() on L475
	private _treeDataSource!: IDataSource<NotebookCellOutline, OutlineEntry>;
	private _quickPickDataSource!: IQuickPickDataSource<OutlineEntry>;
	private _breadcrumbsDataSource!: IBreadcrumbsDataSource<OutlineEntry>;

	// view settings
	private gotoShowCodeCellSymbols: boolean;
	private outlineShowCodeCellSymbols: boolean;

	// getters
	get activeElement(): OutlineEntry | undefined {
		this.checkDelayer();
		if (this._target === OutlineTarget.OutlinePane) {
			return (this.config.treeDataSource as NotebookOutlinePaneProvider).getActiveEntry();
		} else {
			console.error('activeElement should not be called outside of the OutlinePane');
			return undefined;
		}
	}
	get entries(): OutlineEntry[] {
		this.checkDelayer();
		return this._outlineDataSourceReference?.object?.entries ?? [];
	}
	get uri(): URI | undefined {
		return this._outlineDataSourceReference?.object?.uri;
	}
	get isEmpty(): boolean {
		return this._outlineDataSourceReference?.object?.isEmpty ?? true;
	}

	private checkDelayer() {
		if (this.delayerRecomputeState.isTriggered()) {
			this.delayerRecomputeState.cancel();
			this.recomputeState();
		}
	}

	constructor(
		private readonly _editor: INotebookEditorPane,
		private readonly _target: OutlineTarget,
		@IThemeService private readonly _themeService: IThemeService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
	) {
		this.gotoShowCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.gotoSymbolsAllSymbols);
		this.outlineShowCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);

		this.initializeOutline();

		const delegate = new NotebookOutlineVirtualDelegate();
		const renderers = [this._instantiationService.createInstance(NotebookOutlineRenderer, this._editor.getControl(), this._target)];
		const comparator = new NotebookComparator();

		const options: IWorkbenchDataTreeOptions<OutlineEntry, FuzzyScore> = {
			collapseByDefault: this._target === OutlineTarget.Breadcrumbs || (this._target === OutlineTarget.OutlinePane && this._configurationService.getValue(OutlineConfigKeys.collapseItems) === OutlineConfigCollapseItemsValues.Collapsed),
			expandOnlyOnTwistieClick: true,
			multipleSelectionSupport: false,
			accessibilityProvider: new NotebookOutlineAccessibility(),
			identityProvider: { getId: element => element.cell.uri.toString() },
			keyboardNavigationLabelProvider: new NotebookNavigationLabelProvider()
		};

		this.config = {
			treeDataSource: this._treeDataSource,
			quickPickDataSource: this._quickPickDataSource,
			breadcrumbsDataSource: this._breadcrumbsDataSource,
			delegate,
			renderers,
			comparator,
			options
		};
	}

	private initializeOutline() {
		// initial setup
		this.setDataSources();
		this.setModelListeners();

		// reset the data sources + model listeners when we get a new notebook model
		this._disposables.add(this._editor.onDidChangeModel(() => {
			this.setDataSources();
			this.setModelListeners();
			this.computeSymbols();
		}));

		// recompute symbols as document symbol providers are updated in the language features registry
		this._disposables.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
			this.delayedComputeSymbols();
		}));

		// recompute active when the selection changes
		this._disposables.add(this._editor.onDidChangeSelection(() => {
			this.delayedRecomputeActive();
		}));

		// recompute state when filter config changes
		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.outlineShowMarkdownHeadersOnly) ||
				e.affectsConfiguration(NotebookSetting.outlineShowCodeCells) ||
				e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols) ||
				e.affectsConfiguration(NotebookSetting.breadcrumbsShowCodeCells)
			) {
				this.delayedRecomputeState();
			}
		}));

		// recompute state when execution states change
		this._disposables.add(this._notebookExecutionStateService.onDidChangeExecution(e => {
			if (e.type === NotebookExecutionType.cell && !!this._editor.textModel && e.affectsNotebook(this._editor.textModel?.uri)) {
				this.delayedRecomputeState();
			}
		}));

		// recompute symbols when the configuration changes (recompute state - and therefore recompute active - is also called within compute symbols)
		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.gotoSymbolsAllSymbols) || e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols)) {
				this.gotoShowCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.gotoSymbolsAllSymbols);
				this.outlineShowCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);
				this.computeSymbols();
			}
		}));

		// fire a change event when the theme changes
		this._disposables.add(this._themeService.onDidFileIconThemeChange(() => {
			this._onDidChange.fire({});
		}));

		// finish with a recompute state
		this.recomputeState();
	}

	/**
	 * set up the primary data source + three viewing sources for the various outline views
	 */
	private setDataSources(): void {
		const notebookEditor = this._editor.getControl();
		this._outlineDataSourceReference?.dispose();
		this._dataSourceDisposables.clear();

		if (!notebookEditor?.hasModel()) {
			this._outlineDataSourceReference = undefined;
		} else {
			this._outlineDataSourceReference = this._dataSourceDisposables.add(this._instantiationService.invokeFunction((accessor) => accessor.get(INotebookCellOutlineDataSourceFactory).getOrCreate(notebookEditor)));
			// escalate outline data source change events
			this._dataSourceDisposables.add(this._outlineDataSourceReference.object.onDidChange(() => {
				this._onDidChange.fire({});
			}));
		}

		// these fields can be passed undefined outlineDataSources. View Providers all handle it accordingly
		this._treeDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookOutlinePaneProvider, this._outlineDataSourceReference));
		this._quickPickDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookQuickPickProvider, this._outlineDataSourceReference));
		this._breadcrumbsDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookBreadcrumbsProvider, this._outlineDataSourceReference));
	}

	/**
	 * set up the listeners for the outline content, these respond to model changes in the notebook
	 */
	private setModelListeners(): void {
		this._modelDisposables.clear();
		if (!this._editor.textModel) {
			return;
		}

		// Perhaps this is the first time we're building the outline
		if (!this.entries.length) {
			this.computeSymbols();
		}

		// recompute state when there are notebook content changes
		this._modelDisposables.add(this._editor.textModel.onDidChangeContent(contentChanges => {
			if (contentChanges.rawEvents.some(c =>
				c.kind === NotebookCellsChangeType.ChangeCellContent ||
				c.kind === NotebookCellsChangeType.ChangeCellInternalMetadata ||
				c.kind === NotebookCellsChangeType.Move ||
				c.kind === NotebookCellsChangeType.ModelChange)) {
				this.delayedRecomputeState();
			}
		}));
	}

	private async computeSymbols(cancelToken: CancellationToken = CancellationToken.None) {
		if (this._target === OutlineTarget.QuickPick && this.gotoShowCodeCellSymbols) {
			await this._outlineDataSourceReference?.object?.computeFullSymbols(cancelToken);
		} else if (this._target === OutlineTarget.OutlinePane && this.outlineShowCodeCellSymbols) {
			// No need to wait for this, we want the outline to show up quickly.
			void this._outlineDataSourceReference?.object?.computeFullSymbols(cancelToken);
		}
	}
	private async delayedComputeSymbols() {
		this.delayerRecomputeState.cancel();
		this.delayerRecomputeActive.cancel();
		this.delayerRecomputeSymbols.trigger(() => { this.computeSymbols(); });
	}

	private recomputeState() { this._outlineDataSourceReference?.object?.recomputeState(); }
	private delayedRecomputeState() {
		this.delayerRecomputeActive.cancel(); // Active is always recomputed after a recomputing the State.
		this.delayerRecomputeState.trigger(() => { this.recomputeState(); });
	}

	private recomputeActive() { this._outlineDataSourceReference?.object?.recomputeActive(); }
	private delayedRecomputeActive() {
		this.delayerRecomputeActive.trigger(() => { this.recomputeActive(); });
	}

	async reveal(entry: OutlineEntry, options: IEditorOptions, sideBySide: boolean): Promise<void> {
		const notebookEditorOptions: INotebookEditorOptions = {
			...options,
			override: this._editor.input?.editorId,
			cellRevealType: CellRevealType.NearTopIfOutsideViewport,
			selection: entry.position,
			viewState: undefined,
		};
		await this._editorService.openEditor({
			resource: entry.cell.uri,
			options: notebookEditorOptions,
		}, sideBySide ? SIDE_GROUP : undefined);
	}

	preview(entry: OutlineEntry): IDisposable {
		const widget = this._editor.getControl();
		if (!widget) {
			return Disposable.None;
		}


		if (entry.range) {
			const range = Range.lift(entry.range);
			widget.revealRangeInCenterIfOutsideViewportAsync(entry.cell, range);
		} else {
			widget.revealInCenterIfOutsideViewport(entry.cell);
		}

		const ids = widget.deltaCellDecorations([], [{
			handle: entry.cell.handle,
			options: { className: 'nb-symbolHighlight', outputClassName: 'nb-symbolHighlight' }
		}]);

		let editorDecorations: ICellModelDecorations[];
		widget.changeModelDecorations(accessor => {
			if (entry.range) {
				const decorations: IModelDeltaDecoration[] = [
					{
						range: entry.range, options: {
							description: 'document-symbols-outline-range-highlight',
							className: 'rangeHighlight',
							isWholeLine: true
						}
					}
				];
				const deltaDecoration: ICellModelDeltaDecorations = {
					ownerId: entry.cell.handle,
					decorations: decorations
				};

				editorDecorations = accessor.deltaDecorations([], [deltaDecoration]);
			}
		});

		return toDisposable(() => {
			widget.deltaCellDecorations(ids, []);
			if (editorDecorations?.length) {
				widget.changeModelDecorations(accessor => {
					accessor.deltaDecorations(editorDecorations, []);
				});
			}
		});

	}

	captureViewState(): IDisposable {
		const widget = this._editor.getControl();
		const viewState = widget?.getEditorViewState();
		return toDisposable(() => {
			if (viewState) {
				widget?.restoreListViewState(viewState);
			}
		});
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._disposables.dispose();
		this._modelDisposables.dispose();
		this._dataSourceDisposables.dispose();
		this._outlineDataSourceReference?.dispose();
	}
}

export class NotebookOutlineCreator implements IOutlineCreator<NotebookEditor, OutlineEntry> {

	readonly dispose: () => void;

	constructor(
		@IOutlineService outlineService: IOutlineService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		const reg = outlineService.registerOutlineCreator(this);
		this.dispose = () => reg.dispose();
	}

	matches(candidate: IEditorPane): candidate is NotebookEditor {
		return candidate.getId() === NotebookEditor.ID;
	}

	async createOutline(editor: NotebookEditor, target: OutlineTarget, cancelToken: CancellationToken): Promise<IOutline<OutlineEntry> | undefined> {
		return this._instantiationService.createInstance(NotebookCellOutline, editor, target);
	}
}

export const NotebookOutlineContext = {
	CellKind: new RawContextKey<CellKind>('notebookCellKind', undefined),
	CellHasChildren: new RawContextKey<boolean>('notebookCellHasChildren', false),
	CellHasHeader: new RawContextKey<boolean>('notebookCellHasHeader', false),
	CellFoldingState: new RawContextKey<CellFoldingState>('notebookCellFoldingState', CellFoldingState.None),
	OutlineElementTarget: new RawContextKey<OutlineTarget>('notebookOutlineElementTarget', undefined),
};

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookOutlineCreator, LifecyclePhase.Eventually);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'notebook',
	order: 100,
	type: 'object',
	'properties': {
		[NotebookSetting.outlineShowMarkdownHeadersOnly]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize('outline.showMarkdownHeadersOnly', "When enabled, notebook outline will show only markdown cells containing a header.")
		},
		[NotebookSetting.outlineShowCodeCells]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('outline.showCodeCells', "When enabled, notebook outline shows code cells.")
		},
		[NotebookSetting.outlineShowCodeCellSymbols]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize('outline.showCodeCellSymbols', "When enabled, notebook outline shows code cell symbols. Relies on `notebook.outline.showCodeCells` being enabled.")
		},
		[NotebookSetting.breadcrumbsShowCodeCells]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize('breadcrumbs.showCodeCells', "When enabled, notebook breadcrumbs contain code cells.")
		},
		[NotebookSetting.gotoSymbolsAllSymbols]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize('notebook.gotoSymbols.showAllSymbols', "When enabled, the Go to Symbol Quick Pick will display full code symbols from the notebook, as well as Markdown headers.")
		},
	}
});

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	submenu: MenuId.NotebookOutlineFilter,
	title: localize('filter', "Filter Entries"),
	icon: Codicon.filter,
	group: 'navigation',
	order: -1,
	when: ContextKeyExpr.and(ContextKeyExpr.equals('view', IOutlinePane.Id), NOTEBOOK_IS_ACTIVE_EDITOR),
});

registerAction2(class ToggleShowMarkdownHeadersOnly extends Action2 {
	constructor() {
		super({
			id: 'notebook.outline.toggleShowMarkdownHeadersOnly',
			title: localize('toggleShowMarkdownHeadersOnly', "Markdown Headers Only"),
			f1: false,
			toggled: {
				condition: ContextKeyExpr.equals('config.notebook.outline.showMarkdownHeadersOnly', true)
			},
			menu: {
				id: MenuId.NotebookOutlineFilter,
				group: '0_markdown_cells',
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const configurationService = accessor.get(IConfigurationService);
		const showMarkdownHeadersOnly = configurationService.getValue<boolean>(NotebookSetting.outlineShowMarkdownHeadersOnly);
		configurationService.updateValue(NotebookSetting.outlineShowMarkdownHeadersOnly, !showMarkdownHeadersOnly);
	}
});

registerAction2(class ToggleCodeCellEntries extends Action2 {
	constructor() {
		super({
			id: 'notebook.outline.toggleCodeCells',
			title: localize('toggleCodeCells', "Code Cells"),
			f1: false,
			toggled: {
				condition: ContextKeyExpr.equals('config.notebook.outline.showCodeCells', true)
			},
			menu: {
				id: MenuId.NotebookOutlineFilter,
				order: 1,
				group: '1_code_cells',
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const configurationService = accessor.get(IConfigurationService);
		const showCodeCells = configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCells);
		configurationService.updateValue(NotebookSetting.outlineShowCodeCells, !showCodeCells);
	}
});

registerAction2(class ToggleCodeCellSymbolEntries extends Action2 {
	constructor() {
		super({
			id: 'notebook.outline.toggleCodeCellSymbols',
			title: localize('toggleCodeCellSymbols', "Code Cell Symbols"),
			f1: false,
			toggled: {
				condition: ContextKeyExpr.equals('config.notebook.outline.showCodeCellSymbols', true)
			},
			menu: {
				id: MenuId.NotebookOutlineFilter,
				order: 2,
				group: '1_code_cells',
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const configurationService = accessor.get(IConfigurationService);
		const showCodeCellSymbols = configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);
		configurationService.updateValue(NotebookSetting.outlineShowCodeCellSymbols, !showCodeCellSymbols);
	}
});
