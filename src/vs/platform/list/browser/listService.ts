/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheet } from 'vs/base/browser/dom';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IListMouseEvent, IListRenderer, IListTouchEvent, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedListOptions, IPagedRenderer, PagedList } from 'vs/base/browser/ui/list/listPaging';
import { DefaultStyleController, IKeyboardNavigationEventFilter, IListAccessibilityProvider, IListOptions, IListOptionsUpdate, IMultipleSelectionController, isSelectionRangeChangeEvent, isSelectionSingleChangeEvent, List, TypeNavigationMode } from 'vs/base/browser/ui/list/listWidget';
import { ITableColumn, ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { ITableOptions, ITableOptionsUpdate, Table } from 'vs/base/browser/ui/table/tableWidget';
import { TreeFindMode, IAbstractTreeOptions, IAbstractTreeOptionsUpdate, RenderIndentGuides } from 'vs/base/browser/ui/tree/abstractTree';
import { AsyncDataTree, CompressibleAsyncDataTree, IAsyncDataTreeOptions, IAsyncDataTreeOptionsUpdate, ICompressibleAsyncDataTreeOptions, ICompressibleAsyncDataTreeOptionsUpdate, ITreeCompressionDelegate } from 'vs/base/browser/ui/tree/asyncDataTree';
import { DataTree, IDataTreeOptions } from 'vs/base/browser/ui/tree/dataTree';
import { CompressibleObjectTree, ICompressibleObjectTreeOptions, ICompressibleObjectTreeOptionsUpdate, ICompressibleTreeRenderer, IObjectTreeOptions, ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { IAsyncDataSource, IDataSource, ITreeEvent, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator, IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Registry } from 'vs/platform/registry/common/platform';
import { attachListStyler, computeStyles, defaultListStyles, IColorMapping } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export type ListWidget = List<any> | PagedList<any> | ObjectTree<any, any> | DataTree<any, any, any> | AsyncDataTree<any, any, any> | Table<any>;
export type WorkbenchListWidget = WorkbenchList<any> | WorkbenchPagedList<any> | WorkbenchObjectTree<any, any> | WorkbenchCompressibleObjectTree<any, any> | WorkbenchDataTree<any, any, any> | WorkbenchAsyncDataTree<any, any, any> | WorkbenchCompressibleAsyncDataTree<any, any, any> | WorkbenchTable<any>;

export const IListService = createDecorator<IListService>('listService');

export interface IListService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the currently focused list widget if any.
	 */
	readonly lastFocusedList: WorkbenchListWidget | undefined;
}

interface IRegisteredList {
	widget: WorkbenchListWidget;
	extraContextKeys?: (IContextKey<boolean>)[];
}

export class ListService implements IListService {

	declare readonly _serviceBrand: undefined;

	private disposables = new DisposableStore();
	private lists: IRegisteredList[] = [];
	private _lastFocusedWidget: WorkbenchListWidget | undefined = undefined;
	private _hasCreatedStyleController: boolean = false;

	get lastFocusedList(): WorkbenchListWidget | undefined {
		return this._lastFocusedWidget;
	}

	constructor(@IThemeService private readonly _themeService: IThemeService) { }

	private setLastFocusedList(widget: WorkbenchListWidget | undefined): void {
		if (widget === this._lastFocusedWidget) {
			return;
		}

		this._lastFocusedWidget?.getHTMLElement().classList.remove('last-focused');
		this._lastFocusedWidget = widget;
		this._lastFocusedWidget?.getHTMLElement().classList.add('last-focused');
	}

	register(widget: WorkbenchListWidget, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable {
		if (!this._hasCreatedStyleController) {
			this._hasCreatedStyleController = true;
			// create a shared default tree style sheet for performance reasons
			const styleController = new DefaultStyleController(createStyleSheet(), '');
			this.disposables.add(attachListStyler(styleController, this._themeService));
		}

		if (this.lists.some(l => l.widget === widget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		// Keep in our lists list
		const registeredList: IRegisteredList = { widget, extraContextKeys };
		this.lists.push(registeredList);

		// Check for currently being focused
		if (widget.getHTMLElement() === document.activeElement) {
			this.setLastFocusedList(widget);
		}

		return combinedDisposable(
			widget.onDidFocus(() => this.setLastFocusedList(widget)),
			toDisposable(() => this.lists.splice(this.lists.indexOf(registeredList), 1)),
			widget.onDidDispose(() => {
				this.lists = this.lists.filter(l => l !== registeredList);
				if (this._lastFocusedWidget === widget) {
					this.setLastFocusedList(undefined);
				}
			})
		);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

export const RawWorkbenchListFocusContextKey = new RawContextKey<boolean>('listFocus', true);
export const WorkbenchListSupportsMultiSelectContextKey = new RawContextKey<boolean>('listSupportsMultiselect', true);
export const WorkbenchListFocusContextKey = ContextKeyExpr.and(RawWorkbenchListFocusContextKey, ContextKeyExpr.not(InputFocusedContextKey));
export const WorkbenchListHasSelectionOrFocus = new RawContextKey<boolean>('listHasSelectionOrFocus', false);
export const WorkbenchListDoubleSelection = new RawContextKey<boolean>('listDoubleSelection', false);
export const WorkbenchListMultiSelection = new RawContextKey<boolean>('listMultiSelection', false);
export const WorkbenchListSelectionNavigation = new RawContextKey<boolean>('listSelectionNavigation', false);
export const WorkbenchListSupportsFind = new RawContextKey<boolean>('listSupportsFind', true);
export const WorkbenchTreeElementCanCollapse = new RawContextKey<boolean>('treeElementCanCollapse', false);
export const WorkbenchTreeElementHasParent = new RawContextKey<boolean>('treeElementHasParent', false);
export const WorkbenchTreeElementCanExpand = new RawContextKey<boolean>('treeElementCanExpand', false);
export const WorkbenchTreeElementHasChild = new RawContextKey<boolean>('treeElementHasChild', false);
export const WorkbenchTreeFindOpen = new RawContextKey<boolean>('treeFindOpen', false);
const WorkbenchListTypeNavigationModeKey = 'listTypeNavigationMode';

/**
 * @deprecated in favor of WorkbenchListTypeNavigationModeKey
 */
const WorkbenchListAutomaticKeyboardNavigationLegacyKey = 'listAutomaticKeyboardNavigation';

function createScopedContextKeyService(contextKeyService: IContextKeyService, widget: ListWidget): IContextKeyService {
	const result = contextKeyService.createScoped(widget.getHTMLElement());
	RawWorkbenchListFocusContextKey.bindTo(result);
	return result;
}

const multiSelectModifierSettingKey = 'workbench.list.multiSelectModifier';
const openModeSettingKey = 'workbench.list.openMode';
const horizontalScrollingKey = 'workbench.list.horizontalScrolling';
const defaultFindModeSettingKey = 'workbench.list.defaultFindMode';
/** @deprecated in favor of workbench.list.defaultFindMode */
const keyboardNavigationSettingKey = 'workbench.list.keyboardNavigation';
const treeIndentKey = 'workbench.tree.indent';
const treeRenderIndentGuidesKey = 'workbench.tree.renderIndentGuides';
const listSmoothScrolling = 'workbench.list.smoothScrolling';
const mouseWheelScrollSensitivityKey = 'workbench.list.mouseWheelScrollSensitivity';
const fastScrollSensitivityKey = 'workbench.list.fastScrollSensitivity';
const treeExpandMode = 'workbench.tree.expandMode';

function useAltAsMultipleSelectionModifier(configurationService: IConfigurationService): boolean {
	return configurationService.getValue(multiSelectModifierSettingKey) === 'alt';
}

class MultipleSelectionController<T> extends Disposable implements IMultipleSelectionController<T> {
	private useAltAsMultipleSelectionModifier: boolean;

	constructor(private configurationService: IConfigurationService) {
		super();

		this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
				this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(this.configurationService);
			}
		}));
	}

	isSelectionSingleChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean {
		if (this.useAltAsMultipleSelectionModifier) {
			return event.browserEvent.altKey;
		}

		return isSelectionSingleChangeEvent(event);
	}

	isSelectionRangeChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean {
		return isSelectionRangeChangeEvent(event);
	}
}

function toWorkbenchListOptions<T>(
	accessor: ServicesAccessor,
	options: IListOptions<T>,
): [IListOptions<T>, IDisposable] {
	const configurationService = accessor.get(IConfigurationService);
	const keybindingService = accessor.get(IKeybindingService);

	const disposables = new DisposableStore();
	const result: IListOptions<T> = {
		...options,
		keyboardNavigationDelegate: { mightProducePrintableCharacter(e) { return keybindingService.mightProducePrintableCharacter(e); } },
		smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
		mouseWheelScrollSensitivity: configurationService.getValue<number>(mouseWheelScrollSensitivityKey),
		fastScrollSensitivity: configurationService.getValue<number>(fastScrollSensitivityKey),
		multipleSelectionController: options.multipleSelectionController ?? disposables.add(new MultipleSelectionController(configurationService)),
		keyboardNavigationEventFilter: createKeyboardNavigationEventFilter(keybindingService),
	};

	return [result, disposables];
}

export interface IWorkbenchListOptionsUpdate extends IListOptionsUpdate {
	readonly overrideStyles?: IColorMapping;
}

export interface IWorkbenchListOptions<T> extends IWorkbenchListOptionsUpdate, IResourceNavigatorOptions, IListOptions<T> {
	readonly selectionNavigation?: boolean;
}

export class WorkbenchList<T> extends List<T> {

	readonly contextKeyService: IContextKeyService;
	private readonly themeService: IThemeService;
	private listSupportsMultiSelect: IContextKey<boolean>;
	private listHasSelectionOrFocus: IContextKey<boolean>;
	private listDoubleSelection: IContextKey<boolean>;
	private listMultiSelection: IContextKey<boolean>;
	private horizontalScrolling: boolean | undefined;
	private _styler: IDisposable | undefined;
	private _useAltAsMultipleSelectionModifier: boolean;
	private navigator: ListResourceNavigator<T>;
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.navigator.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: IListRenderer<T, any>[],
		options: IWorkbenchListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
		const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);

		super(user, container, delegate, renderers,
			{
				keyboardSupport: false,
				...computeStyles(themeService.getColorTheme(), defaultListStyles),
				...workbenchListOptions,
				horizontalScrolling
			}
		);

		this.disposables.add(workbenchListOptionsDisposable);

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
		this.themeService = themeService;

		this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);

		const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
		listSelectionNavigation.set(Boolean(options.selectionNavigation));

		this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
		this.horizontalScrolling = options.horizontalScrolling;

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.add(this.contextKeyService);
		this.disposables.add((listService as ListService).register(this));

		if (options.overrideStyles) {
			this.updateStyles(options.overrideStyles);
		}

		this.disposables.add(this.onDidChangeSelection(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.contextKeyService.bufferChangeEvents(() => {
				this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				this.listMultiSelection.set(selection.length > 1);
				this.listDoubleSelection.set(selection.length === 2);
			});
		}));
		this.disposables.add(this.onDidChangeFocus(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
		}));
		this.disposables.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
				this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
			}

			let options: IListOptionsUpdate = {};

			if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === undefined) {
				const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
				options = { ...options, horizontalScrolling };
			}
			if (e.affectsConfiguration(listSmoothScrolling)) {
				const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
				options = { ...options, smoothScrolling };
			}
			if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
				const mouseWheelScrollSensitivity = configurationService.getValue<number>(mouseWheelScrollSensitivityKey);
				options = { ...options, mouseWheelScrollSensitivity };
			}
			if (e.affectsConfiguration(fastScrollSensitivityKey)) {
				const fastScrollSensitivity = configurationService.getValue<number>(fastScrollSensitivityKey);
				options = { ...options, fastScrollSensitivity };
			}
			if (Object.keys(options).length > 0) {
				this.updateOptions(options);
			}
		}));

		this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
		this.disposables.add(this.navigator);
	}

	override updateOptions(options: IWorkbenchListOptionsUpdate): void {
		super.updateOptions(options);

		if (options.overrideStyles) {
			this.updateStyles(options.overrideStyles);
		}

		if (options.multipleSelectionSupport !== undefined) {
			this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
		}
	}

	private updateStyles(styles: IColorMapping): void {
		this._styler?.dispose();
		this._styler = attachListStyler(this, this.themeService, styles);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	override dispose(): void {
		this._styler?.dispose();
		super.dispose();
	}
}

export interface IWorkbenchPagedListOptions<T> extends IWorkbenchListOptionsUpdate, IResourceNavigatorOptions, IPagedListOptions<T> {
	readonly selectionNavigation?: boolean;
}

export class WorkbenchPagedList<T> extends PagedList<T> {

	readonly contextKeyService: IContextKeyService;
	private readonly themeService: IThemeService;
	private readonly disposables: DisposableStore;
	private listSupportsMultiSelect: IContextKey<boolean>;
	private _useAltAsMultipleSelectionModifier: boolean;
	private horizontalScrolling: boolean | undefined;
	private _styler: IDisposable | undefined;
	private navigator: ListResourceNavigator<T>;
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.navigator.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<number>,
		renderers: IPagedRenderer<T, any>[],
		options: IWorkbenchPagedListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
		const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
		super(user, container, delegate, renderers,
			{
				keyboardSupport: false,
				...computeStyles(themeService.getColorTheme(), defaultListStyles),
				...workbenchListOptions,
				horizontalScrolling
			}
		);

		this.disposables = new DisposableStore();
		this.disposables.add(workbenchListOptionsDisposable);

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
		this.themeService = themeService;

		this.horizontalScrolling = options.horizontalScrolling;

		this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);

		const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
		listSelectionNavigation.set(Boolean(options.selectionNavigation));

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.add(this.contextKeyService);
		this.disposables.add((listService as ListService).register(this));

		if (options.overrideStyles) {
			this.updateStyles(options.overrideStyles);
		}

		if (options.overrideStyles) {
			this.disposables.add(attachListStyler(this, themeService, options.overrideStyles));
		}

		this.disposables.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
				this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
			}

			let options: IListOptionsUpdate = {};

			if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === undefined) {
				const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
				options = { ...options, horizontalScrolling };
			}
			if (e.affectsConfiguration(listSmoothScrolling)) {
				const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
				options = { ...options, smoothScrolling };
			}
			if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
				const mouseWheelScrollSensitivity = configurationService.getValue<number>(mouseWheelScrollSensitivityKey);
				options = { ...options, mouseWheelScrollSensitivity };
			}
			if (e.affectsConfiguration(fastScrollSensitivityKey)) {
				const fastScrollSensitivity = configurationService.getValue<number>(fastScrollSensitivityKey);
				options = { ...options, fastScrollSensitivity };
			}
			if (Object.keys(options).length > 0) {
				this.updateOptions(options);
			}
		}));

		this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
		this.disposables.add(this.navigator);
	}

	override updateOptions(options: IWorkbenchListOptionsUpdate): void {
		super.updateOptions(options);

		if (options.overrideStyles) {
			this.updateStyles(options.overrideStyles);
		}

		if (options.multipleSelectionSupport !== undefined) {
			this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
		}
	}

	private updateStyles(styles: IColorMapping): void {
		this._styler?.dispose();
		this._styler = attachListStyler(this, this.themeService, styles);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	override dispose(): void {
		this._styler?.dispose();
		this.disposables.dispose();
		super.dispose();
	}
}

export interface IWorkbenchTableOptionsUpdate extends ITableOptionsUpdate {
	readonly overrideStyles?: IColorMapping;
}

export interface IWorkbenchTableOptions<T> extends IWorkbenchTableOptionsUpdate, IResourceNavigatorOptions, ITableOptions<T> {
	readonly selectionNavigation?: boolean;
}

export class WorkbenchTable<TRow> extends Table<TRow> {

	readonly contextKeyService: IContextKeyService;
	private readonly themeService: IThemeService;
	private listSupportsMultiSelect: IContextKey<boolean>;
	private listHasSelectionOrFocus: IContextKey<boolean>;
	private listDoubleSelection: IContextKey<boolean>;
	private listMultiSelection: IContextKey<boolean>;
	private horizontalScrolling: boolean | undefined;
	private _styler: IDisposable | undefined;
	private _useAltAsMultipleSelectionModifier: boolean;
	private navigator: TableResourceNavigator<TRow>;
	get onDidOpen(): Event<IOpenEvent<TRow | undefined>> { return this.navigator.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: ITableVirtualDelegate<TRow>,
		columns: ITableColumn<TRow, any>[],
		renderers: ITableRenderer<TRow, any>[],
		options: IWorkbenchTableOptions<TRow>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
		const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);

		super(user, container, delegate, columns, renderers,
			{
				keyboardSupport: false,
				...computeStyles(themeService.getColorTheme(), defaultListStyles),
				...workbenchListOptions,
				horizontalScrolling
			}
		);

		this.disposables.add(workbenchListOptionsDisposable);

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
		this.themeService = themeService;

		this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);

		const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
		listSelectionNavigation.set(Boolean(options.selectionNavigation));

		this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
		this.horizontalScrolling = options.horizontalScrolling;

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.add(this.contextKeyService);
		this.disposables.add((listService as ListService).register(this));

		if (options.overrideStyles) {
			this.updateStyles(options.overrideStyles);
		}

		this.disposables.add(this.onDidChangeSelection(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.contextKeyService.bufferChangeEvents(() => {
				this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				this.listMultiSelection.set(selection.length > 1);
				this.listDoubleSelection.set(selection.length === 2);
			});
		}));
		this.disposables.add(this.onDidChangeFocus(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
		}));
		this.disposables.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
				this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
			}

			let options: IListOptionsUpdate = {};

			if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === undefined) {
				const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
				options = { ...options, horizontalScrolling };
			}
			if (e.affectsConfiguration(listSmoothScrolling)) {
				const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
				options = { ...options, smoothScrolling };
			}
			if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
				const mouseWheelScrollSensitivity = configurationService.getValue<number>(mouseWheelScrollSensitivityKey);
				options = { ...options, mouseWheelScrollSensitivity };
			}
			if (e.affectsConfiguration(fastScrollSensitivityKey)) {
				const fastScrollSensitivity = configurationService.getValue<number>(fastScrollSensitivityKey);
				options = { ...options, fastScrollSensitivity };
			}
			if (Object.keys(options).length > 0) {
				this.updateOptions(options);
			}
		}));

		this.navigator = new TableResourceNavigator(this, { configurationService, ...options });
		this.disposables.add(this.navigator);
	}

	override updateOptions(options: IWorkbenchTableOptionsUpdate): void {
		super.updateOptions(options);

		if (options.overrideStyles) {
			this.updateStyles(options.overrideStyles);
		}

		if (options.multipleSelectionSupport !== undefined) {
			this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
		}
	}

	private updateStyles(styles: IColorMapping): void {
		this._styler?.dispose();
		this._styler = attachListStyler(this, this.themeService, styles);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	override dispose(): void {
		this._styler?.dispose();
		this.disposables.dispose();
		super.dispose();
	}
}

export interface IOpenResourceOptions {
	editorOptions: IEditorOptions;
	sideBySide: boolean;
	element: any;
	payload: any;
}

export interface IOpenEvent<T> {
	editorOptions: IEditorOptions;
	sideBySide: boolean;
	element: T;
	browserEvent?: UIEvent;
}

export interface IResourceNavigatorOptions {
	readonly configurationService?: IConfigurationService;
	readonly openOnSingleClick?: boolean;
}

export interface SelectionKeyboardEvent extends KeyboardEvent {
	preserveFocus?: boolean;
	pinned?: boolean;
	__forceEvent?: boolean;
}

export function getSelectionKeyboardEvent(typeArg = 'keydown', preserveFocus?: boolean, pinned?: boolean): SelectionKeyboardEvent {
	const e = new KeyboardEvent(typeArg);
	(<SelectionKeyboardEvent>e).preserveFocus = preserveFocus;
	(<SelectionKeyboardEvent>e).pinned = pinned;
	(<SelectionKeyboardEvent>e).__forceEvent = true;

	return e;
}

abstract class ResourceNavigator<T> extends Disposable {

	private openOnSingleClick: boolean;

	private readonly _onDidOpen = this._register(new Emitter<IOpenEvent<T | undefined>>());
	readonly onDidOpen: Event<IOpenEvent<T | undefined>> = this._onDidOpen.event;

	constructor(
		protected readonly widget: ListWidget,
		options?: IResourceNavigatorOptions
	) {
		super();

		this._register(Event.filter(this.widget.onDidChangeSelection, e => e.browserEvent instanceof KeyboardEvent)(e => this.onSelectionFromKeyboard(e)));
		this._register(this.widget.onPointer((e: { browserEvent: MouseEvent; element: T | undefined }) => this.onPointer(e.element, e.browserEvent)));
		this._register(this.widget.onMouseDblClick((e: { browserEvent: MouseEvent; element: T | undefined }) => this.onMouseDblClick(e.element, e.browserEvent)));

		if (typeof options?.openOnSingleClick !== 'boolean' && options?.configurationService) {
			this.openOnSingleClick = options?.configurationService!.getValue(openModeSettingKey) !== 'doubleClick';
			this._register(options?.configurationService.onDidChangeConfiguration(() => {
				this.openOnSingleClick = options?.configurationService!.getValue(openModeSettingKey) !== 'doubleClick';
			}));
		} else {
			this.openOnSingleClick = options?.openOnSingleClick ?? true;
		}
	}

	private onSelectionFromKeyboard(event: ITreeEvent<any>): void {
		if (event.elements.length !== 1) {
			return;
		}

		const selectionKeyboardEvent = event.browserEvent as SelectionKeyboardEvent;
		const preserveFocus = typeof selectionKeyboardEvent.preserveFocus === 'boolean' ? selectionKeyboardEvent.preserveFocus! : true;
		const pinned = typeof selectionKeyboardEvent.pinned === 'boolean' ? selectionKeyboardEvent.pinned! : !preserveFocus;
		const sideBySide = false;

		this._open(this.getSelectedElement(), preserveFocus, pinned, sideBySide, event.browserEvent);
	}

	private onPointer(element: T | undefined, browserEvent: MouseEvent): void {
		if (!this.openOnSingleClick) {
			return;
		}

		const isDoubleClick = browserEvent.detail === 2;

		if (isDoubleClick) {
			return;
		}

		const isMiddleClick = browserEvent.button === 1;
		const preserveFocus = true;
		const pinned = isMiddleClick;
		const sideBySide = browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey;

		this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
	}

	private onMouseDblClick(element: T | undefined, browserEvent?: MouseEvent): void {
		if (!browserEvent) {
			return;
		}

		// copied from AbstractTree
		const target = browserEvent.target as HTMLElement;
		const onTwistie = target.classList.contains('monaco-tl-twistie')
			|| (target.classList.contains('monaco-icon-label') && target.classList.contains('folder-icon') && browserEvent.offsetX < 16);

		if (onTwistie) {
			return;
		}

		const preserveFocus = false;
		const pinned = true;
		const sideBySide = (browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey);

		this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
	}

	private _open(element: T | undefined, preserveFocus: boolean, pinned: boolean, sideBySide: boolean, browserEvent?: UIEvent): void {
		if (!element) {
			return;
		}

		this._onDidOpen.fire({
			editorOptions: {
				preserveFocus,
				pinned,
				revealIfVisible: true
			},
			sideBySide,
			element,
			browserEvent
		});
	}

	abstract getSelectedElement(): T | undefined;
}

class ListResourceNavigator<T> extends ResourceNavigator<T> {

	protected override readonly widget: List<T> | PagedList<T>;

	constructor(
		widget: List<T> | PagedList<T>,
		options: IResourceNavigatorOptions
	) {
		super(widget, options);
		this.widget = widget;
	}

	getSelectedElement(): T | undefined {
		return this.widget.getSelectedElements()[0];
	}
}

class TableResourceNavigator<TRow> extends ResourceNavigator<TRow> {

	protected override readonly widget!: Table<TRow>;

	constructor(
		widget: Table<TRow>,
		options: IResourceNavigatorOptions
	) {
		super(widget, options);
	}

	getSelectedElement(): TRow | undefined {
		return this.widget.getSelectedElements()[0];
	}
}

class TreeResourceNavigator<T, TFilterData> extends ResourceNavigator<T> {

	protected override readonly widget!: ObjectTree<T, TFilterData> | CompressibleObjectTree<T, TFilterData> | DataTree<any, T, TFilterData> | AsyncDataTree<any, T, TFilterData> | CompressibleAsyncDataTree<any, T, TFilterData>;

	constructor(
		widget: ObjectTree<T, TFilterData> | CompressibleObjectTree<T, TFilterData> | DataTree<any, T, TFilterData> | AsyncDataTree<any, T, TFilterData> | CompressibleAsyncDataTree<any, T, TFilterData>,
		options: IResourceNavigatorOptions
	) {
		super(widget, options);
	}

	getSelectedElement(): T | undefined {
		return this.widget.getSelection()[0] ?? undefined;
	}
}

function createKeyboardNavigationEventFilter(keybindingService: IKeybindingService): IKeyboardNavigationEventFilter {
	let inChord = false;

	return event => {
		if (event.toKeybinding().isModifierKey()) {
			return false;
		}

		if (inChord) {
			inChord = false;
			return false;
		}

		const result = keybindingService.softDispatch(event, event.target);

		if (result?.enterChord) {
			inChord = true;
			return false;
		}

		inChord = false;
		return !result;
	};
}

export interface IWorkbenchObjectTreeOptions<T, TFilterData> extends IObjectTreeOptions<T, TFilterData>, IResourceNavigatorOptions {
	readonly accessibilityProvider: IListAccessibilityProvider<T>;
	readonly overrideStyles?: IColorMapping;
	readonly selectionNavigation?: boolean;
}

export class WorkbenchObjectTree<T extends NonNullable<any>, TFilterData = void> extends ObjectTree<T, TFilterData> {

	private internals: WorkbenchTreeInternals<any, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.internals.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		options: IWorkbenchObjectTreeOptions<T, TFilterData>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options as any);
		super(user, container, delegate, renderers, treeOptions);
		this.disposables.add(disposable);
		this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, themeService, configurationService);
		this.disposables.add(this.internals);
	}

	override updateOptions(options: IAbstractTreeOptionsUpdate): void {
		super.updateOptions(options);
		this.internals.updateOptions(options);
	}
}

export interface IWorkbenchCompressibleObjectTreeOptionsUpdate extends ICompressibleObjectTreeOptionsUpdate {
	readonly overrideStyles?: IColorMapping;
}

export interface IWorkbenchCompressibleObjectTreeOptions<T, TFilterData> extends IWorkbenchCompressibleObjectTreeOptionsUpdate, ICompressibleObjectTreeOptions<T, TFilterData>, IResourceNavigatorOptions {
	readonly accessibilityProvider: IListAccessibilityProvider<T>;
	readonly selectionNavigation?: boolean;
}

export class WorkbenchCompressibleObjectTree<T extends NonNullable<any>, TFilterData = void> extends CompressibleObjectTree<T, TFilterData> {

	private internals: WorkbenchTreeInternals<any, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.internals.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ICompressibleTreeRenderer<T, TFilterData, any>[],
		options: IWorkbenchCompressibleObjectTreeOptions<T, TFilterData>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options as any);
		super(user, container, delegate, renderers, treeOptions);
		this.disposables.add(disposable);
		this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, themeService, configurationService);
		this.disposables.add(this.internals);
	}

	override updateOptions(options: IWorkbenchCompressibleObjectTreeOptionsUpdate = {}): void {
		super.updateOptions(options);

		if (options.overrideStyles) {
			this.internals.updateStyleOverrides(options.overrideStyles);
		}

		this.internals.updateOptions(options);
	}
}

export interface IWorkbenchDataTreeOptionsUpdate extends IAbstractTreeOptionsUpdate {
	readonly overrideStyles?: IColorMapping;
}

export interface IWorkbenchDataTreeOptions<T, TFilterData> extends IWorkbenchDataTreeOptionsUpdate, IDataTreeOptions<T, TFilterData>, IResourceNavigatorOptions {
	readonly accessibilityProvider: IListAccessibilityProvider<T>;
	readonly selectionNavigation?: boolean;
}

export class WorkbenchDataTree<TInput, T, TFilterData = void> extends DataTree<TInput, T, TFilterData> {

	private internals: WorkbenchTreeInternals<TInput, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.internals.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		dataSource: IDataSource<TInput, T>,
		options: IWorkbenchDataTreeOptions<T, TFilterData>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options as any);
		super(user, container, delegate, renderers, dataSource, treeOptions);
		this.disposables.add(disposable);
		this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, themeService, configurationService);
		this.disposables.add(this.internals);
	}

	override updateOptions(options: IWorkbenchDataTreeOptionsUpdate = {}): void {
		super.updateOptions(options);

		if (options.overrideStyles) {
			this.internals.updateStyleOverrides(options.overrideStyles);
		}

		this.internals.updateOptions(options);
	}
}

export interface IWorkbenchAsyncDataTreeOptionsUpdate extends IAsyncDataTreeOptionsUpdate {
	readonly overrideStyles?: IColorMapping;
}

export interface IWorkbenchAsyncDataTreeOptions<T, TFilterData> extends IWorkbenchAsyncDataTreeOptionsUpdate, IAsyncDataTreeOptions<T, TFilterData>, IResourceNavigatorOptions {
	readonly accessibilityProvider: IListAccessibilityProvider<T>;
	readonly selectionNavigation?: boolean;
}

export class WorkbenchAsyncDataTree<TInput, T, TFilterData = void> extends AsyncDataTree<TInput, T, TFilterData> {

	private internals: WorkbenchTreeInternals<TInput, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.internals.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		dataSource: IAsyncDataSource<TInput, T>,
		options: IWorkbenchAsyncDataTreeOptions<T, TFilterData>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options as any);
		super(user, container, delegate, renderers, dataSource, treeOptions);
		this.disposables.add(disposable);
		this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, themeService, configurationService);
		this.disposables.add(this.internals);
	}

	override updateOptions(options: IWorkbenchAsyncDataTreeOptionsUpdate = {}): void {
		super.updateOptions(options);

		if (options.overrideStyles) {
			this.internals.updateStyleOverrides(options.overrideStyles);
		}

		this.internals.updateOptions(options);
	}
}

export interface IWorkbenchCompressibleAsyncDataTreeOptions<T, TFilterData> extends ICompressibleAsyncDataTreeOptions<T, TFilterData>, IResourceNavigatorOptions {
	readonly accessibilityProvider: IListAccessibilityProvider<T>;
	readonly overrideStyles?: IColorMapping;
	readonly selectionNavigation?: boolean;
}

export class WorkbenchCompressibleAsyncDataTree<TInput, T, TFilterData = void> extends CompressibleAsyncDataTree<TInput, T, TFilterData> {

	private internals: WorkbenchTreeInternals<TInput, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.internals.onDidOpen; }

	constructor(
		user: string,
		container: HTMLElement,
		virtualDelegate: IListVirtualDelegate<T>,
		compressionDelegate: ITreeCompressionDelegate<T>,
		renderers: ICompressibleTreeRenderer<T, TFilterData, any>[],
		dataSource: IAsyncDataSource<TInput, T>,
		options: IWorkbenchCompressibleAsyncDataTreeOptions<T, TFilterData>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options as any);
		super(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, treeOptions);
		this.disposables.add(disposable);
		this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, themeService, configurationService);
		this.disposables.add(this.internals);
	}

	override updateOptions(options: ICompressibleAsyncDataTreeOptionsUpdate): void {
		super.updateOptions(options);
		this.internals.updateOptions(options);
	}
}

function getDefaultTreeFindMode(configurationService: IConfigurationService) {
	const value = configurationService.getValue<'highlight' | 'filter'>(defaultFindModeSettingKey);

	if (value === 'highlight') {
		return TreeFindMode.Highlight;
	} else if (value === 'filter') {
		return TreeFindMode.Filter;
	}

	const deprecatedValue = configurationService.getValue<'simple' | 'highlight' | 'filter'>(keyboardNavigationSettingKey);

	if (deprecatedValue === 'simple' || deprecatedValue === 'highlight') {
		return TreeFindMode.Highlight;
	} else if (deprecatedValue === 'filter') {
		return TreeFindMode.Filter;
	}

	return undefined;
}

function workbenchTreeDataPreamble<T, TFilterData, TOptions extends IAbstractTreeOptions<T, TFilterData> | IAsyncDataTreeOptions<T, TFilterData>>(
	accessor: ServicesAccessor,
	options: TOptions,
): { options: TOptions; getTypeNavigationMode: () => TypeNavigationMode | undefined; disposable: IDisposable } {
	const configurationService = accessor.get(IConfigurationService);
	const contextViewService = accessor.get(IContextViewService);
	const contextKeyService = accessor.get(IContextKeyService);
	const instantiationService = accessor.get(IInstantiationService);

	const getTypeNavigationMode = () => {
		// give priority to the context key value to specify a value
		const modeString = contextKeyService.getContextKeyValue<'automatic' | 'trigger'>(WorkbenchListTypeNavigationModeKey);

		if (modeString === 'automatic') {
			return TypeNavigationMode.Automatic;
		} else if (modeString === 'trigger') {
			return TypeNavigationMode.Trigger;
		}

		// also check the deprecated context key to set the mode to 'trigger'
		const modeBoolean = contextKeyService.getContextKeyValue<boolean>(WorkbenchListAutomaticKeyboardNavigationLegacyKey);

		if (modeBoolean === false) {
			return TypeNavigationMode.Trigger;
		}

		return undefined;
	};

	const horizontalScrolling = options.horizontalScrolling !== undefined ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
	const [workbenchListOptions, disposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
	const additionalScrollHeight = options.additionalScrollHeight;

	return {
		getTypeNavigationMode,
		disposable,
		options: {
			// ...options, // TODO@Joao why is this not splatted here?
			keyboardSupport: false,
			...workbenchListOptions,
			indent: typeof configurationService.getValue(treeIndentKey) === 'number' ? configurationService.getValue(treeIndentKey) : undefined,
			renderIndentGuides: configurationService.getValue<RenderIndentGuides>(treeRenderIndentGuidesKey),
			smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
			defaultFindMode: getDefaultTreeFindMode(configurationService),
			horizontalScrolling,
			additionalScrollHeight,
			hideTwistiesOfChildlessElements: options.hideTwistiesOfChildlessElements,
			expandOnlyOnTwistieClick: options.expandOnlyOnTwistieClick ?? (configurationService.getValue<'singleClick' | 'doubleClick'>(treeExpandMode) === 'doubleClick'),
			contextViewProvider: contextViewService as IContextViewProvider
		} as TOptions
	};
}

interface IWorkbenchTreeInternalsOptionsUpdate {
	readonly multipleSelectionSupport?: boolean;
}

class WorkbenchTreeInternals<TInput, T, TFilterData> {

	readonly contextKeyService: IContextKeyService;
	private listSupportsMultiSelect: IContextKey<boolean>;
	private listSupportFindWidget: IContextKey<boolean>;
	private hasSelectionOrFocus: IContextKey<boolean>;
	private hasDoubleSelection: IContextKey<boolean>;
	private hasMultiSelection: IContextKey<boolean>;
	private treeElementCanCollapse: IContextKey<boolean>;
	private treeElementHasParent: IContextKey<boolean>;
	private treeElementCanExpand: IContextKey<boolean>;
	private treeElementHasChild: IContextKey<boolean>;
	private treeFindOpen: IContextKey<boolean>;
	private _useAltAsMultipleSelectionModifier: boolean;
	private disposables: IDisposable[] = [];
	private styler: IDisposable | undefined;
	private navigator: TreeResourceNavigator<T, TFilterData>;

	get onDidOpen(): Event<IOpenEvent<T | undefined>> { return this.navigator.onDidOpen; }

	constructor(
		private tree: WorkbenchObjectTree<T, TFilterData> | WorkbenchCompressibleObjectTree<T, TFilterData> | WorkbenchDataTree<TInput, T, TFilterData> | WorkbenchAsyncDataTree<TInput, T, TFilterData> | WorkbenchCompressibleAsyncDataTree<TInput, T, TFilterData>,
		options: IWorkbenchObjectTreeOptions<T, TFilterData> | IWorkbenchCompressibleObjectTreeOptions<T, TFilterData> | IWorkbenchDataTreeOptions<T, TFilterData> | IWorkbenchAsyncDataTreeOptions<T, TFilterData> | IWorkbenchCompressibleAsyncDataTreeOptions<T, TFilterData>,
		getTypeNavigationMode: () => TypeNavigationMode | undefined,
		overrideStyles: IColorMapping | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService private themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		this.contextKeyService = createScopedContextKeyService(contextKeyService, tree);

		this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);

		const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
		listSelectionNavigation.set(Boolean(options.selectionNavigation));

		this.listSupportFindWidget = WorkbenchListSupportsFind.bindTo(this.contextKeyService);
		this.listSupportFindWidget.set(options.findWidgetEnabled ?? true);

		this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this.treeElementCanCollapse = WorkbenchTreeElementCanCollapse.bindTo(this.contextKeyService);
		this.treeElementHasParent = WorkbenchTreeElementHasParent.bindTo(this.contextKeyService);
		this.treeElementCanExpand = WorkbenchTreeElementCanExpand.bindTo(this.contextKeyService);
		this.treeElementHasChild = WorkbenchTreeElementHasChild.bindTo(this.contextKeyService);

		this.treeFindOpen = WorkbenchTreeFindOpen.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.updateStyleOverrides(overrideStyles);

		const updateCollapseContextKeys = () => {
			const focus = tree.getFocus()[0];

			if (!focus) {
				return;
			}

			const node = tree.getNode(focus);
			this.treeElementCanCollapse.set(node.collapsible && !node.collapsed);
			this.treeElementHasParent.set(!!tree.getParentElement(focus));
			this.treeElementCanExpand.set(node.collapsible && node.collapsed);
			this.treeElementHasChild.set(!!tree.getFirstElementChild(focus));
		};

		const interestingContextKeys = new Set();
		interestingContextKeys.add(WorkbenchListTypeNavigationModeKey);
		interestingContextKeys.add(WorkbenchListAutomaticKeyboardNavigationLegacyKey);

		this.disposables.push(
			this.contextKeyService,
			(listService as ListService).register(tree),
			tree.onDidChangeSelection(() => {
				const selection = tree.getSelection();
				const focus = tree.getFocus();

				this.contextKeyService.bufferChangeEvents(() => {
					this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
					this.hasMultiSelection.set(selection.length > 1);
					this.hasDoubleSelection.set(selection.length === 2);
				});
			}),
			tree.onDidChangeFocus(() => {
				const selection = tree.getSelection();
				const focus = tree.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				updateCollapseContextKeys();
			}),
			tree.onDidChangeCollapseState(updateCollapseContextKeys),
			tree.onDidChangeModel(updateCollapseContextKeys),
			tree.onDidChangeFindOpenState(enabled => this.treeFindOpen.set(enabled)),
			configurationService.onDidChangeConfiguration(e => {
				let newOptions: IAbstractTreeOptionsUpdate = {};
				if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
					this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
				}
				if (e.affectsConfiguration(treeIndentKey)) {
					const indent = configurationService.getValue<number>(treeIndentKey);
					newOptions = { ...newOptions, indent };
				}
				if (e.affectsConfiguration(treeRenderIndentGuidesKey)) {
					const renderIndentGuides = configurationService.getValue<RenderIndentGuides>(treeRenderIndentGuidesKey);
					newOptions = { ...newOptions, renderIndentGuides };
				}
				if (e.affectsConfiguration(listSmoothScrolling)) {
					const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
					newOptions = { ...newOptions, smoothScrolling };
				}
				if (e.affectsConfiguration(defaultFindModeSettingKey) || e.affectsConfiguration(keyboardNavigationSettingKey)) {
					tree.updateOptions({ defaultFindMode: getDefaultTreeFindMode(configurationService) });
				}
				if (e.affectsConfiguration(horizontalScrollingKey) && options.horizontalScrolling === undefined) {
					const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
					newOptions = { ...newOptions, horizontalScrolling };
				}
				if (e.affectsConfiguration(treeExpandMode) && options.expandOnlyOnTwistieClick === undefined) {
					newOptions = { ...newOptions, expandOnlyOnTwistieClick: configurationService.getValue<'singleClick' | 'doubleClick'>(treeExpandMode) === 'doubleClick' };
				}
				if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
					const mouseWheelScrollSensitivity = configurationService.getValue<number>(mouseWheelScrollSensitivityKey);
					newOptions = { ...newOptions, mouseWheelScrollSensitivity };
				}
				if (e.affectsConfiguration(fastScrollSensitivityKey)) {
					const fastScrollSensitivity = configurationService.getValue<number>(fastScrollSensitivityKey);
					newOptions = { ...newOptions, fastScrollSensitivity };
				}
				if (Object.keys(newOptions).length > 0) {
					tree.updateOptions(newOptions);
				}
			}),
			this.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(interestingContextKeys)) {
					tree.updateOptions({ typeNavigationMode: getTypeNavigationMode() });
				}
			})
		);

		this.navigator = new TreeResourceNavigator(tree, { configurationService, ...options });
		this.disposables.push(this.navigator);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	updateOptions(options: IWorkbenchTreeInternalsOptionsUpdate): void {
		if (options.multipleSelectionSupport !== undefined) {
			this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
		}
	}

	updateStyleOverrides(overrideStyles?: IColorMapping): void {
		dispose(this.styler);
		this.styler = overrideStyles ? attachListStyler(this.tree, this.themeService, overrideStyles) : Disposable.None;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		dispose(this.styler);
		this.styler = undefined;
	}
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'workbench',
	order: 7,
	title: localize('workbenchConfigurationTitle', "Workbench"),
	type: 'object',
	properties: {
		[multiSelectModifierSettingKey]: {
			type: 'string',
			enum: ['ctrlCmd', 'alt'],
			markdownEnumDescriptions: [
				localize('multiSelectModifier.ctrlCmd', "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
				localize('multiSelectModifier.alt', "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
			],
			default: 'ctrlCmd',
			description: localize({
				key: 'multiSelectModifier',
				comment: [
					'- `ctrlCmd` refers to a value the setting can take and should not be localized.',
					'- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized.'
				]
			}, "The modifier to be used to add an item in trees and lists to a multi-selection with the mouse (for example in the explorer, open editors and scm view). The 'Open to Side' mouse gestures - if supported - will adapt such that they do not conflict with the multiselect modifier.")
		},
		[openModeSettingKey]: {
			type: 'string',
			enum: ['singleClick', 'doubleClick'],
			default: 'singleClick',
			description: localize({
				key: 'openModeModifier',
				comment: ['`singleClick` and `doubleClick` refers to a value the setting can take and should not be localized.']
			}, "Controls how to open items in trees and lists using the mouse (if supported). Note that some trees and lists might choose to ignore this setting if it is not applicable.")
		},
		[horizontalScrollingKey]: {
			type: 'boolean',
			default: false,
			description: localize('horizontalScrolling setting', "Controls whether lists and trees support horizontal scrolling in the workbench. Warning: turning on this setting has a performance implication.")
		},
		[treeIndentKey]: {
			type: 'number',
			default: 8,
			minimum: 4,
			maximum: 40,
			description: localize('tree indent setting', "Controls tree indentation in pixels.")
		},
		[treeRenderIndentGuidesKey]: {
			type: 'string',
			enum: ['none', 'onHover', 'always'],
			default: 'onHover',
			description: localize('render tree indent guides', "Controls whether the tree should render indent guides.")
		},
		[listSmoothScrolling]: {
			type: 'boolean',
			default: false,
			description: localize('list smoothScrolling setting', "Controls whether lists and trees have smooth scrolling."),
		},
		[mouseWheelScrollSensitivityKey]: {
			type: 'number',
			default: 1,
			markdownDescription: localize('Mouse Wheel Scroll Sensitivity', "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.")
		},
		[fastScrollSensitivityKey]: {
			type: 'number',
			default: 5,
			description: localize('Fast Scroll Sensitivity', "Scrolling speed multiplier when pressing `Alt`.")
		},
		[defaultFindModeSettingKey]: {
			type: 'string',
			enum: ['highlight', 'filter'],
			enumDescriptions: [
				localize('defaultFindModeSettingKey.highlight', "Highlight elements when searching. Further up and down navigation will traverse only the highlighted elements."),
				localize('defaultFindModeSettingKey.filter', "Filter elements when searching.")
			],
			default: 'highlight',
			description: localize('defaultFindModeSettingKey', "Controls the default find mode for lists and trees in the workbench.")
		},
		[keyboardNavigationSettingKey]: {
			type: 'string',
			enum: ['simple', 'highlight', 'filter'],
			enumDescriptions: [
				localize('keyboardNavigationSettingKey.simple', "Simple keyboard navigation focuses elements which match the keyboard input. Matching is done only on prefixes."),
				localize('keyboardNavigationSettingKey.highlight', "Highlight keyboard navigation highlights elements which match the keyboard input. Further up and down navigation will traverse only the highlighted elements."),
				localize('keyboardNavigationSettingKey.filter', "Filter keyboard navigation will filter out and hide all the elements which do not match the keyboard input.")
			],
			default: 'highlight',
			description: localize('keyboardNavigationSettingKey', "Controls the keyboard navigation style for lists and trees in the workbench. Can be simple, highlight and filter."),
			deprecated: true,
			deprecationMessage: localize('keyboardNavigationSettingKeyDeprecated', "Please use 'workbench.list.defaultFindMode' instead.")
		},
		[treeExpandMode]: {
			type: 'string',
			enum: ['singleClick', 'doubleClick'],
			default: 'singleClick',
			description: localize('expand mode', "Controls how tree folders are expanded when clicking the folder names. Note that some trees and lists might choose to ignore this setting if it is not applicable."),
		}
	}
});
