/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addClass, addStandardDisposableListener, createStyleSheet, getTotalHeight, removeClass } from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IInputOptions, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IListMouseEvent, IListTouchEvent, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer, PagedList } from 'vs/base/browser/ui/list/listPaging';
import { DefaultStyleController, IListOptions, IMultipleSelectionController, IOpenController, isSelectionRangeChangeEvent, isSelectionSingleChangeEvent, List } from 'vs/base/browser/ui/list/listWidget';
import { canceled, onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { KeyCode } from 'vs/base/common/keyCodes';
import { combinedDisposable, Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IFilter, ITree, ITreeConfiguration, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { ClickBehavior, DefaultController, DefaultTreestyler, IControllerOptions, OpenMode } from 'vs/base/parts/tree/browser/treeDefaults';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Registry } from 'vs/platform/registry/common/platform';
import { attachInputBoxStyler, attachListStyler, computeStyles, defaultListStyles } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { InputFocusedContextKey } from 'vs/platform/workbench/common/contextkeys';
import { ObjectTree, IObjectTreeOptions } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeEvent, ITreeRenderer, IAsyncDataSource, IDataSource } from 'vs/base/browser/ui/tree/tree';
import { AsyncDataTree, IAsyncDataTreeOptions } from 'vs/base/browser/ui/tree/asyncDataTree';
import { DataTree, IDataTreeOptions } from 'vs/base/browser/ui/tree/dataTree';

export type ListWidget = List<any> | PagedList<any> | ITree | ObjectTree<any, any> | DataTree<any, any, any> | AsyncDataTree<any, any, any>;

export const IListService = createDecorator<IListService>('listService');

export interface IListService {

	_serviceBrand: any;

	/**
	 * Returns the currently focused list widget if any.
	 */
	readonly lastFocusedList: ListWidget | undefined;
}

interface IRegisteredList {
	widget: ListWidget;
	extraContextKeys?: (IContextKey<boolean>)[];
}

export class ListService implements IListService {

	_serviceBrand: any;

	private lists: IRegisteredList[] = [];
	private _lastFocusedWidget: ListWidget | undefined = undefined;

	get lastFocusedList(): ListWidget | undefined {
		return this._lastFocusedWidget;
	}

	constructor(@IContextKeyService contextKeyService: IContextKeyService) { }

	register(widget: ListWidget, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable {
		if (this.lists.some(l => l.widget === widget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		// Keep in our lists list
		const registeredList: IRegisteredList = { widget, extraContextKeys };
		this.lists.push(registeredList);

		// Check for currently being focused
		if (widget.getHTMLElement() === document.activeElement) {
			this._lastFocusedWidget = widget;
		}

		const result = combinedDisposable([
			widget.onDidFocus(() => this._lastFocusedWidget = widget),
			toDisposable(() => this.lists.splice(this.lists.indexOf(registeredList), 1)),
			widget.onDidDispose(() => {
				this.lists = this.lists.filter(l => l !== registeredList);
				if (this._lastFocusedWidget === widget) {
					this._lastFocusedWidget = undefined;
				}
			})
		]);

		return result;
	}
}

const RawWorkbenchListFocusContextKey = new RawContextKey<boolean>('listFocus', true);
export const WorkbenchListSupportsMultiSelectContextKey = new RawContextKey<boolean>('listSupportsMultiselect', true);
export const WorkbenchListFocusContextKey = ContextKeyExpr.and(RawWorkbenchListFocusContextKey, ContextKeyExpr.not(InputFocusedContextKey));
export const WorkbenchListHasSelectionOrFocus = new RawContextKey<boolean>('listHasSelectionOrFocus', false);
export const WorkbenchListDoubleSelection = new RawContextKey<boolean>('listDoubleSelection', false);
export const WorkbenchListMultiSelection = new RawContextKey<boolean>('listMultiSelection', false);

function createScopedContextKeyService(contextKeyService: IContextKeyService, widget: ListWidget): IContextKeyService {
	const result = contextKeyService.createScoped(widget.getHTMLElement());
	RawWorkbenchListFocusContextKey.bindTo(result);
	return result;
}

export const multiSelectModifierSettingKey = 'workbench.list.multiSelectModifier';
export const openModeSettingKey = 'workbench.list.openMode';
export const horizontalScrollingKey = 'workbench.tree.horizontalScrolling';

function useAltAsMultipleSelectionModifier(configurationService: IConfigurationService): boolean {
	return configurationService.getValue(multiSelectModifierSettingKey) === 'alt';
}

function useSingleClickToOpen(configurationService: IConfigurationService): boolean {
	return configurationService.getValue(openModeSettingKey) !== 'doubleClick';
}

class MultipleSelectionController<T> implements IMultipleSelectionController<T> {

	constructor(private configurationService: IConfigurationService) { }

	isSelectionSingleChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean {
		if (useAltAsMultipleSelectionModifier(this.configurationService)) {
			return event.browserEvent.altKey;
		}

		return isSelectionSingleChangeEvent(event);
	}

	isSelectionRangeChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean {
		return isSelectionRangeChangeEvent(event);
	}
}

class WorkbenchOpenController implements IOpenController {

	constructor(private configurationService: IConfigurationService, private existingOpenController?: IOpenController) { }

	shouldOpen(event: UIEvent): boolean {
		if (event instanceof MouseEvent) {
			const isDoubleClick = event.detail === 2;
			if (!useSingleClickToOpen(this.configurationService) && !isDoubleClick) {
				return false;
			}

			if (event.button === 0 /* left mouse button */ || event.button === 1 /* middle mouse button */) {
				return this.existingOpenController ? this.existingOpenController.shouldOpen(event) : true;
			}

			return false;
		}

		return this.existingOpenController ? this.existingOpenController.shouldOpen(event) : true;
	}
}

function toWorkbenchListOptions<T>(options: IListOptions<T>, configurationService: IConfigurationService, keybindingService: IKeybindingService): IListOptions<T> {
	const result = { ...options };

	if (options.multipleSelectionSupport !== false && !options.multipleSelectionController) {
		result.multipleSelectionController = new MultipleSelectionController(configurationService);
	}

	result.openController = new WorkbenchOpenController(configurationService, options.openController);

	if (options.keyboardNavigationLabelProvider) {
		const tlp = options.keyboardNavigationLabelProvider;

		result.keyboardNavigationLabelProvider = {
			getKeyboardNavigationLabel(e) { return tlp.getKeyboardNavigationLabel(e); },
			mightProducePrintableCharacter(e) { return keybindingService.mightProducePrintableCharacter(e); }
		};
	}

	return result;
}

let sharedListStyleSheet: HTMLStyleElement;
function getSharedListStyleSheet(): HTMLStyleElement {
	if (!sharedListStyleSheet) {
		sharedListStyleSheet = createStyleSheet();
	}

	return sharedListStyleSheet;
}

let sharedTreeStyleSheet: HTMLStyleElement;
function getSharedTreeStyleSheet(): HTMLStyleElement {
	if (!sharedTreeStyleSheet) {
		sharedTreeStyleSheet = createStyleSheet();
	}

	return sharedTreeStyleSheet;
}

function handleTreeController(configuration: ITreeConfiguration, instantiationService: IInstantiationService): ITreeConfiguration {
	if (!configuration.controller) {
		configuration.controller = instantiationService.createInstance(WorkbenchTreeController, {});
	}

	if (!configuration.styler) {
		configuration.styler = new DefaultTreestyler(getSharedTreeStyleSheet());
	}

	return configuration;
}

export class WorkbenchList<T> extends List<T> {

	readonly contextKeyService: IContextKeyService;

	private listHasSelectionOrFocus: IContextKey<boolean>;
	private listDoubleSelection: IContextKey<boolean>;
	private listMultiSelection: IContextKey<boolean>;

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: IListRenderer<any /* TODO@joao */, any>[],
		options: IListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(container, delegate, renderers,
			{
				keyboardSupport: false,
				styleController: new DefaultStyleController(getSharedListStyleSheet()),
				...computeStyles(themeService.getTheme(), defaultListStyles),
				...toWorkbenchListOptions(options, configurationService, keybindingService)
			} as IListOptions<T>
		);

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.push(combinedDisposable([
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService),
			this.onSelectionChange(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				this.listMultiSelection.set(selection.length > 1);
				this.listDoubleSelection.set(selection.length === 2);
			}),
			this.onFocusChange(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
			})
		]));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.disposables.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
				this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(this.configurationService);
			}
		}));
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}
}

export class WorkbenchPagedList<T> extends PagedList<T> {

	readonly contextKeyService: IContextKeyService;

	private disposables: IDisposable[] = [];

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<number>,
		renderers: IPagedRenderer<T, any>[],
		options: IListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(container, delegate, renderers,
			{
				keyboardSupport: false,
				styleController: new DefaultStyleController(getSharedListStyleSheet()),
				...computeStyles(themeService.getTheme(), defaultListStyles),
				...toWorkbenchListOptions(options, configurationService, keybindingService)
			} as IListOptions<T>
		);

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.push(combinedDisposable([
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService)
		]));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.disposables.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
				this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(this.configurationService);
			}
		}));
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	dispose(): void {
		super.dispose();

		this.disposables = dispose(this.disposables);
	}
}

export class WorkbenchTree extends Tree {

	readonly contextKeyService: IContextKeyService;

	protected disposables: IDisposable[];

	private listHasSelectionOrFocus: IContextKey<boolean>;
	private listDoubleSelection: IContextKey<boolean>;
	private listMultiSelection: IContextKey<boolean>;

	private _openOnSingleClick: boolean;
	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		configuration: ITreeConfiguration,
		options: ITreeOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const config = handleTreeController(configuration, instantiationService);
		const horizontalScrollMode = configurationService.getValue(horizontalScrollingKey) ? ScrollbarVisibility.Auto : ScrollbarVisibility.Hidden;
		const opts = {
			horizontalScrollMode,
			keyboardSupport: false,
			...computeStyles(themeService.getTheme(), defaultListStyles),
			...options
		};

		super(container, config, opts);

		this.disposables = [];
		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);

		this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._openOnSingleClick = useSingleClickToOpen(configurationService);
		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.push(
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService)
		);

		this.disposables.push(this.onDidChangeSelection(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.listHasSelectionOrFocus.set((selection && selection.length > 0) || !!focus);
			this.listDoubleSelection.set(selection && selection.length === 2);
			this.listMultiSelection.set(selection && selection.length > 1);
		}));

		this.disposables.push(this.onDidChangeFocus(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.listHasSelectionOrFocus.set((selection && selection.length > 0) || !!focus);
		}));

		this.disposables.push(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(openModeSettingKey)) {
				this._openOnSingleClick = useSingleClickToOpen(configurationService);
			}

			if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
				this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
			}
		}));
	}

	get openOnSingleClick(): boolean {
		return this._openOnSingleClick;
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	dispose(): void {
		super.dispose();

		this.disposables = dispose(this.disposables);
	}
}

function massageControllerOptions(options: IControllerOptions): IControllerOptions {
	if (typeof options.keyboardSupport !== 'boolean') {
		options.keyboardSupport = false;
	}

	if (typeof options.clickBehavior !== 'number') {
		options.clickBehavior = ClickBehavior.ON_MOUSE_DOWN;
	}

	return options;
}

export class WorkbenchTreeController extends DefaultController {

	protected disposables: IDisposable[] = [];

	constructor(
		options: IControllerOptions,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(massageControllerOptions(options));

		// if the open mode is not set, we configure it based on settings
		if (isUndefinedOrNull(options.openMode)) {
			this.setOpenMode(this.getOpenModeSetting());
			this.registerListeners();
		}
	}

	private registerListeners(): void {
		this.disposables.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(openModeSettingKey)) {
				this.setOpenMode(this.getOpenModeSetting());
			}
		}));
	}

	private getOpenModeSetting(): OpenMode {
		return useSingleClickToOpen(this.configurationService) ? OpenMode.SINGLE_CLICK : OpenMode.DOUBLE_CLICK;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export interface IOpenResourceOptions {
	editorOptions: IEditorOptions;
	sideBySide: boolean;
	element: any;
	payload: any;
}

export interface IResourceResultsNavigationOptions {
	openOnFocus: boolean;
}

export class TreeResourceNavigator extends Disposable {

	private readonly _openResource = new Emitter<IOpenResourceOptions>();
	readonly openResource: Event<IOpenResourceOptions> = this._openResource.event;

	constructor(private tree: WorkbenchTree, private options?: IResourceResultsNavigationOptions) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		if (this.options && this.options.openOnFocus) {
			this._register(this.tree.onDidChangeFocus(e => this.onFocus(e)));
		}

		this._register(this.tree.onDidChangeSelection(e => this.onSelection(e)));
	}

	private onFocus({ payload }: any): void {
		const element = this.tree.getFocus();
		this.tree.setSelection([element], { fromFocus: true });

		const originalEvent: KeyboardEvent | MouseEvent = payload && payload.originalEvent;
		const isMouseEvent = payload && payload.origin === 'mouse';
		const isDoubleClick = isMouseEvent && originalEvent && originalEvent.detail === 2;

		const preventOpen = payload && payload.preventOpenOnFocus;
		if (!preventOpen && (!isMouseEvent || this.tree.openOnSingleClick || isDoubleClick)) {
			this._openResource.fire({
				editorOptions: {
					preserveFocus: true,
					pinned: false,
					revealIfVisible: true
				},
				sideBySide: false,
				element,
				payload
			});
		}
	}

	private onSelection({ payload }: any): void {
		if (payload && payload.fromFocus) {
			return;
		}

		const originalEvent: KeyboardEvent | MouseEvent = payload && payload.originalEvent;
		const isMouseEvent = payload && payload.origin === 'mouse';
		const isDoubleClick = isMouseEvent && originalEvent && originalEvent.detail === 2;

		if (!isMouseEvent || this.tree.openOnSingleClick || isDoubleClick) {
			if (isDoubleClick && originalEvent) {
				originalEvent.preventDefault(); // focus moves to editor, we need to prevent default
			}

			const isFromKeyboard = payload && payload.origin === 'keyboard';
			const sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey || originalEvent.altKey));
			const preserveFocus = !((isFromKeyboard && (!payload || !payload.preserveFocus)) || isDoubleClick || (payload && payload.focusEditor));
			this._openResource.fire({
				editorOptions: {
					preserveFocus,
					pinned: isDoubleClick,
					revealIfVisible: true
				},
				sideBySide,
				element: this.tree.getSelection()[0],
				payload
			});
		}
	}
}

export interface IOpenEvent<T> {
	editorOptions: IEditorOptions;
	sideBySide: boolean;
	element: T;
}

export interface IResourceResultsNavigationOptions {
	openOnFocus: boolean;
}

export class TreeResourceNavigator2<T, TFilterData> extends Disposable {

	private readonly _openResource: Emitter<IOpenEvent<T>> = new Emitter<IOpenEvent<T>>();
	readonly openResource: Event<IOpenEvent<T>> = this._openResource.event;

	constructor(private tree: WorkbenchObjectTree<T, TFilterData> | WorkbenchAsyncDataTree<any, T, TFilterData>, private options?: IResourceResultsNavigationOptions) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		if (this.options && this.options.openOnFocus) {
			this._register(this.tree.onDidChangeFocus(e => this.onFocus(e)));
		}

		this._register(this.tree.onDidChangeSelection(e => this.onSelection(e)));
	}

	private onFocus(e: ITreeEvent<T>): void {
		const focus = this.tree.getFocus();
		this.tree.setSelection(focus, e.browserEvent);

		if (!e.browserEvent) {
			return;
		}

		const isMouseEvent = e.browserEvent && e.browserEvent instanceof MouseEvent;

		if (!isMouseEvent) {
			this.open(true, false, false);
		}
	}

	private onSelection(e: ITreeEvent<T>): void {
		if (!e.browserEvent) {
			return;
		}

		const isDoubleClick = e.browserEvent.detail === 2;
		const sideBySide = e.browserEvent instanceof MouseEvent && (e.browserEvent.ctrlKey || e.browserEvent.metaKey || e.browserEvent.altKey);
		this.open(!isDoubleClick, isDoubleClick, sideBySide);
	}

	private open(preserveFocus: boolean, pinned: boolean, sideBySide: boolean): void {
		this._openResource.fire({
			editorOptions: {
				preserveFocus,
				pinned,
				revealIfVisible: true
			},
			sideBySide,
			element: this.tree.getSelection()[0]
		});
	}
}

export interface IHighlighter {
	getHighlights(tree: ITree, element: any, pattern: string): FuzzyScore;
	getHighlightsStorageKey?(element: any): any;
}

export interface IHighlightingTreeConfiguration extends ITreeConfiguration {
	highlighter: IHighlighter;
}

export interface IHighlightingTreeOptions extends ITreeOptions {
	filterOnType?: boolean;
}

export class HighlightingTreeController extends WorkbenchTreeController {

	constructor(
		options: IControllerOptions,
		private readonly onType: () => any,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(options, configurationService);
	}

	onKeyDown(tree: ITree, event: IKeyboardEvent) {
		let handled = super.onKeyDown(tree, event);
		if (handled) {
			return true;
		}
		if (this.upKeyBindingDispatcher.has(event.keyCode)) {
			return false;
		}
		if (this._keybindingService.mightProducePrintableCharacter(event)) {
			this.onType();
			return true;
		}
		return false;
	}
}

class HightlightsFilter implements IFilter {

	static add(config: ITreeConfiguration, options: IHighlightingTreeOptions): ITreeConfiguration {
		let myFilter = new HightlightsFilter();
		myFilter.enabled = options.filterOnType;
		if (!config.filter) {
			config.filter = myFilter;
		} else {
			let otherFilter = config.filter;
			config.filter = {
				isVisible(tree: ITree, element: any): boolean {
					return myFilter.isVisible(tree, element) && otherFilter.isVisible(tree, element);
				}
			};
		}
		return config;
	}

	enabled: boolean = true;

	isVisible(tree: ITree, element: any): boolean {
		if (!this.enabled) {
			return true;
		}
		let tree2 = (tree as HighlightingWorkbenchTree);
		if (!tree2.isHighlighterScoring()) {
			return true;
		}
		if (tree2.getHighlighterScore(element)) {
			return true;
		}
		return false;
	}
}

export class HighlightingWorkbenchTree extends WorkbenchTree {

	protected readonly domNode: HTMLElement;
	protected readonly inputContainer: HTMLElement;
	protected readonly input: InputBox;

	protected readonly highlighter: IHighlighter;
	protected readonly highlights: Map<any, FuzzyScore>;

	private readonly _onDidStartFilter: Emitter<this>;
	readonly onDidStartFiltering: Event<this>;

	constructor(
		parent: HTMLElement,
		treeConfiguration: IHighlightingTreeConfiguration,
		treeOptions: IHighlightingTreeOptions,
		listOptions: IInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextViewService contextViewService: IContextViewService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		// build html skeleton
		const container = document.createElement('div');
		container.className = 'highlighting-tree';
		const inputContainer = document.createElement('div');
		inputContainer.className = 'input';
		const treeContainer = document.createElement('div');
		treeContainer.className = 'tree';
		container.appendChild(inputContainer);
		container.appendChild(treeContainer);
		parent.appendChild(container);

		// create tree
		treeConfiguration.controller = treeConfiguration.controller || instantiationService.createInstance(HighlightingTreeController, {}, () => this.onTypeInTree());
		super(treeContainer, HightlightsFilter.add(treeConfiguration, treeOptions), treeOptions, contextKeyService, listService, themeService, instantiationService, configurationService);
		this.highlighter = treeConfiguration.highlighter;
		this.highlights = new Map<any, FuzzyScore>();

		this.domNode = container;
		addClass(this.domNode, 'inactive');

		// create input
		this.inputContainer = inputContainer;
		this.input = new InputBox(inputContainer, contextViewService, listOptions);
		this.input.setEnabled(false);
		this.input.onDidChange(this.updateHighlights, this, this.disposables);
		this.disposables.push(attachInputBoxStyler(this.input, themeService));
		this.disposables.push(this.input);
		this.disposables.push(addStandardDisposableListener(this.input.inputElement, 'keydown', event => {
			//todo@joh make this command/context-key based
			switch (event.keyCode) {
				case KeyCode.UpArrow:
				case KeyCode.DownArrow:
				case KeyCode.Tab:
					this.domFocus();
					event.preventDefault();
					break;
				case KeyCode.Enter:
					this.setSelection(this.getSelection());
					event.preventDefault();
					break;
				case KeyCode.Escape:
					this.input.value = '';
					this.domFocus();
					event.preventDefault();
					break;
			}
		}));

		this._onDidStartFilter = new Emitter<this>();
		this.onDidStartFiltering = this._onDidStartFilter.event;
		this.disposables.push(this._onDidStartFilter);
	}

	setInput(element: any): Promise<any> {
		this.input.setEnabled(false);
		return super.setInput(element).then(value => {
			if (!this.input.inputElement) {
				// has been disposed in the meantime -> cancel
				return Promise.reject(canceled());
			}
			this.input.setEnabled(true);
			return value;
		});
	}

	layout(height?: number, width?: number): void {
		this.input.layout();
		super.layout(isNaN(height) ? height : height - getTotalHeight(this.inputContainer), width);
	}

	private onTypeInTree(): void {
		removeClass(this.domNode, 'inactive');
		this.input.focus();
		this.layout();
		this._onDidStartFilter.fire(this);
	}

	private lastSelection: any[];

	private updateHighlights(pattern: string): void {

		// remember old selection
		let defaultSelection: any[] = [];
		if (!this.lastSelection && pattern) {
			this.lastSelection = this.getSelection();
		} else if (this.lastSelection && !pattern) {
			defaultSelection = this.lastSelection;
			this.lastSelection = [];
		}

		let topElement: any;
		if (pattern) {
			let nav = this.getNavigator(undefined, false);
			let topScore: FuzzyScore;
			while (nav.next()) {
				let element = nav.current();
				let score = this.highlighter.getHighlights(this, element, pattern);
				this.highlights.set(this._getHighlightsStorageKey(element), score);
				element.foo = 1;
				if (!topScore || score && topScore[0] < score[0]) {
					topScore = score;
					topElement = element;
				}
			}
		} else {
			// no pattern, clear highlights
			this.highlights.clear();
		}

		this.refresh().then(() => {
			if (topElement) {
				this.reveal(topElement, 0.5).then(_ => {
					this.setSelection([topElement], this);
					this.setFocus(topElement, this);
				});
			} else {
				this.setSelection(defaultSelection, this);
			}
		}, onUnexpectedError);
	}

	isHighlighterScoring(): boolean {
		return this.highlights.size > 0;
	}

	getHighlighterScore(element: any): FuzzyScore {
		return this.highlights.get(this._getHighlightsStorageKey(element));
	}

	private _getHighlightsStorageKey(element: any): any {
		return typeof this.highlighter.getHighlightsStorageKey === 'function'
			? this.highlighter.getHighlightsStorageKey(element)
			: element;
	}
}

export class WorkbenchObjectTree<T extends NonNullable<any>, TFilterData = void> extends ObjectTree<T, TFilterData> {

	readonly contextKeyService: IContextKeyService;

	protected disposables: IDisposable[];

	private hasSelectionOrFocus: IContextKey<boolean>;
	private hasDoubleSelection: IContextKey<boolean>;
	private hasMultiSelection: IContextKey<boolean>;

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		options: IObjectTreeOptions<T, TFilterData>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(container, delegate, renderers, {
			keyboardSupport: false,
			styleController: new DefaultStyleController(getSharedListStyleSheet()),
			...computeStyles(themeService.getTheme(), defaultListStyles),
			...toWorkbenchListOptions(options, configurationService, keybindingService)
		});

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.push(
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService),
			this.onDidChangeSelection(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				this.hasMultiSelection.set(selection.length > 1);
				this.hasDoubleSelection.set(selection.length === 2);
			}),
			this.onDidChangeFocus(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
			}),
			configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
					this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
				}
			})
		);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class WorkbenchDataTree<TInput, T, TFilterData = void> extends DataTree<TInput, T, TFilterData> {

	readonly contextKeyService: IContextKeyService;

	private hasSelectionOrFocus: IContextKey<boolean>;
	private hasDoubleSelection: IContextKey<boolean>;
	private hasMultiSelection: IContextKey<boolean>;

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		dataSource: IDataSource<TInput, T>,
		options: IDataTreeOptions<T, TFilterData>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(container, delegate, renderers, dataSource, {
			keyboardSupport: false,
			styleController: new DefaultStyleController(getSharedListStyleSheet()),
			...computeStyles(themeService.getTheme(), defaultListStyles),
			...toWorkbenchListOptions(options, configurationService, keybindingService)
		});

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.push(
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService),
			this.onDidChangeSelection(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				this.hasMultiSelection.set(selection.length > 1);
				this.hasDoubleSelection.set(selection.length === 2);
			}),
			this.onDidChangeFocus(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
			}),
			configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
					this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
				}
			})
		);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}
}

export class WorkbenchAsyncDataTree<TInput, T, TFilterData = void> extends AsyncDataTree<TInput, T, TFilterData> {

	readonly contextKeyService: IContextKeyService;

	private hasSelectionOrFocus: IContextKey<boolean>;
	private hasDoubleSelection: IContextKey<boolean>;
	private hasMultiSelection: IContextKey<boolean>;

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		dataSource: IAsyncDataSource<TInput, T>,
		options: IAsyncDataTreeOptions<T, TFilterData>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(container, delegate, renderers, dataSource, {
			keyboardSupport: false,
			styleController: new DefaultStyleController(getSharedListStyleSheet()),
			...computeStyles(themeService.getTheme(), defaultListStyles),
			...toWorkbenchListOptions(options, configurationService, keybindingService)
		});

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.push(
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService),
			this.onDidChangeSelection(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				this.hasMultiSelection.set(selection.length > 1);
				this.hasDoubleSelection.set(selection.length === 2);
			}),
			this.onDidChangeFocus(() => {
				const selection = this.getSelection();
				const focus = this.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
			}),
			configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
					this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
				}
			})
		);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'workbench',
	'order': 7,
	'title': localize('workbenchConfigurationTitle', "Workbench"),
	'type': 'object',
	'properties': {
		[multiSelectModifierSettingKey]: {
			'type': 'string',
			'enum': ['ctrlCmd', 'alt'],
			'enumDescriptions': [
				localize('multiSelectModifier.ctrlCmd', "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
				localize('multiSelectModifier.alt', "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
			],
			'default': 'ctrlCmd',
			'description': localize({
				key: 'multiSelectModifier',
				comment: [
					'- `ctrlCmd` refers to a value the setting can take and should not be localized.',
					'- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized.'
				]
			}, "The modifier to be used to add an item in trees and lists to a multi-selection with the mouse (for example in the explorer, open editors and scm view). The 'Open to Side' mouse gestures - if supported - will adapt such that they do not conflict with the multiselect modifier.")
		},
		[openModeSettingKey]: {
			'type': 'string',
			'enum': ['singleClick', 'doubleClick'],
			'default': 'singleClick',
			'description': localize({
				key: 'openModeModifier',
				comment: ['`singleClick` and `doubleClick` refers to a value the setting can take and should not be localized.']
			}, "Controls how to open items in trees and lists using the mouse (if supported). For parents with children in trees, this setting will control if a single click expands the parent or a double click. Note that some trees and lists might choose to ignore this setting if it is not applicable. ")
		},
		[horizontalScrollingKey]: {
			'type': 'boolean',
			'default': false,
			'description': localize('horizontalScrolling setting', "Controls whether trees support horizontal scrolling in the workbench.")
		}
	}
});
