/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IIconLabelValueOptions, IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IdleValue } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { getIconClassesForLanguageId } from 'vs/editor/common/services/getIconClasses';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchDataTreeOptions } from 'vs/platform/list/browser/listService';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { Registry } from 'vs/platform/registry/common/platform';
import { listErrorForeground, listWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorPane } from 'vs/workbench/common/editor';
import { CellRevealType, ICellModelDecorations, ICellModelDeltaDecorations, INotebookEditorOptions, INotebookEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
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

class NotebookOutlineTemplate {

	static readonly templateId = 'NotebookOutlineRenderer';

	constructor(
		readonly container: HTMLElement,
		readonly iconClass: HTMLElement,
		readonly iconLabel: IconLabel,
		readonly decoration: HTMLElement
	) { }
}

class NotebookOutlineRenderer implements ITreeRenderer<OutlineEntry, FuzzyScore, NotebookOutlineTemplate> {

	templateId: string = NotebookOutlineTemplate.templateId;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	renderTemplate(container: HTMLElement): NotebookOutlineTemplate {
		container.classList.add('notebook-outline-element', 'show-file-icons');
		const iconClass = document.createElement('div');
		container.append(iconClass);
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const decoration = document.createElement('div');
		decoration.className = 'element-decoration';
		container.append(decoration);
		return new NotebookOutlineTemplate(container, iconClass, iconLabel, decoration);
	}

	renderElement(node: ITreeNode<OutlineEntry, FuzzyScore>, _index: number, template: NotebookOutlineTemplate, _height: number | undefined): void {
		const extraClasses: string[] = [];
		const options: IIconLabelValueOptions = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
			extraClasses,
		};

		if (node.element.cell.cellKind === CellKind.Code && this._themeService.getFileIconTheme().hasFileIcons && !node.element.isExecuting) {
			template.iconClass.className = '';
			extraClasses.push(...getIconClassesForLanguageId(node.element.cell.language ?? ''));
		} else {
			template.iconClass.className = 'element-icon ' + ThemeIcon.asClassNameArray(node.element.icon).join(' ');
		}

		template.iconLabel.setLabel(node.element.label, undefined, options);

		const { markerInfo } = node.element;

		template.container.style.removeProperty('--outline-element-color');
		template.decoration.innerText = '';
		if (markerInfo) {
			const useBadges = this._configurationService.getValue(OutlineConfigKeys.problemsBadges);
			if (!useBadges) {
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
			const useColors = this._configurationService.getValue(OutlineConfigKeys.problemsColors);
			if (!useColors) {
				template.container.style.removeProperty('--outline-element-color');
				template.decoration.style.setProperty('--outline-element-color', color?.toString() ?? 'inherit');
			} else {
				template.container.style.setProperty('--outline-element-color', color?.toString() ?? 'inherit');
			}
		}
	}

	disposeTemplate(templateData: NotebookOutlineTemplate): void {
		templateData.iconLabel.dispose();
	}
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
		@IThemeService private readonly _themeService: IThemeService
	) { }

	getQuickPickElements(): IQuickPickOutlineElement<OutlineEntry>[] {
		const bucket: OutlineEntry[] = [];
		for (const entry of this._getEntries()) {
			entry.asFlatList(bucket);
		}
		const result: IQuickPickOutlineElement<OutlineEntry>[] = [];
		const { hasFileIcons } = this._themeService.getFileIconTheme();

		for (const element of bucket) {
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

	private readonly _collator = new IdleValue<Intl.Collator>(() => new Intl.Collator(undefined, { numeric: true }));

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
		return this._outlineProvider?.entries ?? [];
	}

	private readonly _entriesDisposables = new DisposableStore();

	readonly config: IOutlineListConfig<OutlineEntry>;

	readonly outlineKind = 'notebookCells';

	get activeElement(): OutlineEntry | undefined {
		return this._outlineProvider?.activeElement;
	}

	private _outlineProvider: NotebookCellOutlineProvider | undefined;
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
				this._outlineProvider?.dispose();
				this._outlineProvider = undefined;
				this._localDisposables.clear();
			} else {
				this._outlineProvider?.dispose();
				this._localDisposables.clear();
				this._outlineProvider = instantiationService.createInstance(NotebookCellOutlineProvider, notebookEditor, _target);
				this._localDisposables.add(this._outlineProvider.onDidChange(e => {
					this._onDidChange.fire(e);
				}));
			}
		};

		this._dispoables.add(_editor.onDidChangeModel(() => {
			installSelectionListener();
		}));

		installSelectionListener();
		const treeDataSource: IDataSource<this, OutlineEntry> = { getChildren: parent => parent instanceof NotebookCellOutline ? (this._outlineProvider?.entries ?? []) : parent.children };
		const delegate = new NotebookOutlineVirtualDelegate();
		const renderers = [instantiationService.createInstance(NotebookOutlineRenderer)];
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
			quickPickDataSource: instantiationService.createInstance(NotebookQuickPickProvider, () => (this._outlineProvider?.entries ?? [])),
			treeDataSource,
			delegate,
			renderers,
			comparator,
			options
		};
	}

	async setFullSymbols(cancelToken: CancellationToken) {
		await this._outlineProvider?.setFullSymbols(cancelToken);
	}

	get uri(): URI | undefined {
		return this._outlineProvider?.uri;
	}
	get isEmpty(): boolean {
		return this._outlineProvider?.isEmpty ?? true;
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
		this._outlineProvider?.dispose();
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

		const showAllSymbols = this._configurationService.getValue<boolean>(NotebookSetting.gotoSymbolsAllSymbols);
		if (target === OutlineTarget.QuickPick && showAllSymbols) {
			await outline.setFullSymbols(cancelToken);
		}
		return outline;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookOutlineCreator, LifecyclePhase.Eventually);


Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'notebook',
	order: 100,
	type: 'object',
	'properties': {
		'notebook.outline.showCodeCells': {
			type: 'boolean',
			default: false,
			markdownDescription: localize('outline.showCodeCells', "When enabled notebook outline shows code cells.")
		},
		'notebook.breadcrumbs.showCodeCells': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('breadcrumbs.showCodeCells', "When enabled notebook breadcrumbs contain code cells.")
		},
		[NotebookSetting.gotoSymbolsAllSymbols]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('notebook.gotoSymbols.showAllSymbols', "When enabled goto symbol quickpick will display full code symbols from the notebook, as well as markdown headers.")
		},
	}
});
