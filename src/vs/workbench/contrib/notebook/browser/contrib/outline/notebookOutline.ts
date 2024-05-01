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
import { NotebookCellOutlineProvider } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineProvider';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IOutline, IOutlineComparator, IOutlineCreator, IOutlineListConfig, IOutlineService, IQuickPickDataSource, IQuickPickOutlineElement, OutlineChangeEvent, OutlineConfigCollapseItemsValues, OutlineConfigKeys, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
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
import { disposableTimeout } from 'vs/base/common/async';
import { IOutlinePane } from 'vs/workbench/contrib/outline/browser/outline';
import { Codicon } from 'vs/base/common/codicons';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { NotebookOutlineConstants } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineEntryFactory';
import { INotebookCellOutlineProviderFactory } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineProviderFactory';

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

class NotebookQuickPickProvider implements IQuickPickDataSource<OutlineEntry> {

	constructor(
		private _getEntries: () => OutlineEntry[],
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService
	) { }

	getQuickPickElements(): IQuickPickOutlineElement<OutlineEntry>[] {
		const bucket: OutlineEntry[] = [];
		for (const entry of this._getEntries()) {
			entry.asFlatList(bucket);
		}
		const result: IQuickPickOutlineElement<OutlineEntry>[] = [];
		const { hasFileIcons } = this._themeService.getFileIconTheme();

		const showSymbols = this._configurationService.getValue<boolean>(NotebookSetting.gotoSymbolsAllSymbols);
		const isSymbol = (element: OutlineEntry) => !!element.symbolKind;
		const isCodeCell = (element: OutlineEntry) => (element.cell.cellKind === CellKind.Code && element.level === NotebookOutlineConstants.NonHeaderOutlineLevel); // code cell entries are exactly level 7 by this constant
		for (let i = 0; i < bucket.length; i++) {
			const element = bucket[i];
			const nextElement = bucket[i + 1]; // can be undefined

			if (!showSymbols
				&& isSymbol(element)) {
				continue;
			}

			if (showSymbols
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

	private readonly _dispoables = new DisposableStore();

	private readonly _onDidChange = new Emitter<OutlineChangeEvent>();

	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	get entries(): OutlineEntry[] {
		return this._outlineProviderReference?.object?.entries ?? [];
	}

	private readonly _entriesDisposables = new DisposableStore();

	readonly config: IOutlineListConfig<OutlineEntry>;

	readonly outlineKind = 'notebookCells';

	get activeElement(): OutlineEntry | undefined {
		return this._outlineProviderReference?.object?.activeElement;
	}

	private _outlineProviderReference: IReference<NotebookCellOutlineProvider> | undefined;
	private readonly _localDisposables = new DisposableStore();

	constructor(
		private readonly _editor: INotebookEditorPane,
		_target: OutlineTarget,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService _configurationService: IConfigurationService,
	) {
		const installSelectionListener = () => {
			const notebookEditor = _editor.getControl();
			if (!notebookEditor?.hasModel()) {
				this._outlineProviderReference?.dispose();
				this._outlineProviderReference = undefined;
				this._localDisposables.clear();
			} else {
				this._outlineProviderReference?.dispose();
				this._localDisposables.clear();
				this._outlineProviderReference = instantiationService.invokeFunction((accessor) => accessor.get(INotebookCellOutlineProviderFactory).getOrCreate(notebookEditor, _target));
				this._localDisposables.add(this._outlineProviderReference.object.onDidChange(e => {
					this._onDidChange.fire(e);
				}));
			}
		};

		this._dispoables.add(_editor.onDidChangeModel(() => {
			installSelectionListener();
		}));

		installSelectionListener();
		const treeDataSource: IDataSource<this, OutlineEntry> = {
			getChildren: parent => {
				return this.getChildren(parent, _configurationService);
			}
		};
		const delegate = new NotebookOutlineVirtualDelegate();
		const renderers = [instantiationService.createInstance(NotebookOutlineRenderer, this._editor.getControl(), _target)];
		const comparator = new NotebookComparator();

		const options: IWorkbenchDataTreeOptions<OutlineEntry, FuzzyScore> = {
			collapseByDefault: _target === OutlineTarget.Breadcrumbs || (_target === OutlineTarget.OutlinePane && _configurationService.getValue(OutlineConfigKeys.collapseItems) === OutlineConfigCollapseItemsValues.Collapsed),
			expandOnlyOnTwistieClick: true,
			multipleSelectionSupport: false,
			accessibilityProvider: new NotebookOutlineAccessibility(),
			identityProvider: { getId: element => element.cell.uri.toString() },
			keyboardNavigationLabelProvider: new NotebookNavigationLabelProvider()
		};

		this.config = {
			breadcrumbsDataSource: {
				getBreadcrumbElements: () => {
					const result: OutlineEntry[] = [];
					let candidate = this.activeElement;
					while (candidate) {
						result.unshift(candidate);
						candidate = candidate.parent;
					}
					return result;
				}
			},
			quickPickDataSource: instantiationService.createInstance(NotebookQuickPickProvider, () => (this._outlineProviderReference?.object?.entries ?? [])),
			treeDataSource,
			delegate,
			renderers,
			comparator,
			options
		};
	}

	*getChildren(parent: OutlineEntry | NotebookCellOutline, configurationService: IConfigurationService): Iterable<OutlineEntry> {
		const showCodeCells = configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCells);
		const showCodeCellSymbols = configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);
		const showMarkdownHeadersOnly = configurationService.getValue<boolean>(NotebookSetting.outlineShowMarkdownHeadersOnly);

		for (const entry of parent instanceof NotebookCellOutline ? (this._outlineProviderReference?.object?.entries ?? []) : parent.children) {
			if (entry.cell.cellKind === CellKind.Markup) {
				if (!showMarkdownHeadersOnly) {
					yield entry;
				} else if (entry.level < NotebookOutlineConstants.NonHeaderOutlineLevel) {
					yield entry;
				}

			} else if (showCodeCells && entry.cell.cellKind === CellKind.Code) {
				if (showCodeCellSymbols) {
					yield entry;
				} else if (entry.level === NotebookOutlineConstants.NonHeaderOutlineLevel) {
					yield entry;
				}
			}
		}
	}

	async setFullSymbols(cancelToken: CancellationToken) {
		await this._outlineProviderReference?.object?.setFullSymbols(cancelToken);
	}

	get uri(): URI | undefined {
		return this._outlineProviderReference?.object?.uri;
	}
	get isEmpty(): boolean {
		return this._outlineProviderReference?.object?.isEmpty ?? true;
	}
	async reveal(entry: OutlineEntry, options: IEditorOptions, sideBySide: boolean): Promise<void> {
		await this._editorService.openEditor({
			resource: entry.cell.uri,
			options: {
				...options,
				override: this._editor.input?.editorId,
				cellRevealType: CellRevealType.NearTopIfOutsideViewport,
				selection: entry.position
			} as INotebookEditorOptions,
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
		this._dispoables.dispose();
		this._entriesDisposables.dispose();
		this._outlineProviderReference?.dispose();
		this._localDisposables.dispose();
	}
}

export class NotebookOutlineCreator implements IOutlineCreator<NotebookEditor, OutlineEntry> {

	readonly dispose: () => void;

	constructor(
		@IOutlineService outlineService: IOutlineService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		const reg = outlineService.registerOutlineCreator(this);
		this.dispose = () => reg.dispose();
	}

	matches(candidate: IEditorPane): candidate is NotebookEditor {
		return candidate.getId() === NotebookEditor.ID;
	}

	async createOutline(editor: NotebookEditor, target: OutlineTarget, cancelToken: CancellationToken): Promise<IOutline<OutlineEntry> | undefined> {
		const outline = this._instantiationService.createInstance(NotebookCellOutline, editor, target);

		const showAllGotoSymbols = this._configurationService.getValue<boolean>(NotebookSetting.gotoSymbolsAllSymbols);
		const showAllOutlineSymbols = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);
		if (target === OutlineTarget.QuickPick && showAllGotoSymbols) {
			await outline.setFullSymbols(cancelToken);
		} else if (target === OutlineTarget.OutlinePane && showAllOutlineSymbols) {
			// No need to wait for this, we want the outline to show up quickly.
			void outline.setFullSymbols(cancelToken);
		}

		return outline;
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
