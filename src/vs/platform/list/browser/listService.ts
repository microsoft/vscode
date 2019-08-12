/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheet } from 'vs/base/browser/dom';
import { IListMouseEvent, IListTouchEvent, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer, PagedList } from 'vs/base/browser/ui/list/listPaging';
import { DefaultStyleController, IListOptions, IMultipleSelectionController, IOpenController, isSelectionRangeChangeEvent, isSelectionSingleChangeEvent, List } from 'vs/base/browser/ui/list/listWidget';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable, toDisposable, DisposableStore, combinedDisposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { ITree, ITreeConfiguration, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { ClickBehavior, DefaultController, DefaultTreestyler, IControllerOptions, OpenMode } from 'vs/base/parts/tree/browser/treeDefaults';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { localize } from 'vs/nls';
import { IConfigurationService, getMigratedSettingValue } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Registry } from 'vs/platform/registry/common/platform';
import { attachListStyler, computeStyles, defaultListStyles } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ObjectTree, IObjectTreeOptions } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeEvent, ITreeRenderer, IAsyncDataSource, IDataSource, ITreeMouseEvent } from 'vs/base/browser/ui/tree/tree';
import { AsyncDataTree, IAsyncDataTreeOptions } from 'vs/base/browser/ui/tree/asyncDataTree';
import { DataTree, IDataTreeOptions } from 'vs/base/browser/ui/tree/dataTree';
import { IKeyboardNavigationEventFilter, IAbstractTreeOptions, RenderIndentGuides } from 'vs/base/browser/ui/tree/abstractTree';
import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';

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

		return combinedDisposable(
			widget.onDidFocus(() => this._lastFocusedWidget = widget),
			toDisposable(() => this.lists.splice(this.lists.indexOf(registeredList), 1)),
			widget.onDidDispose(() => {
				this.lists = this.lists.filter(l => l !== registeredList);
				if (this._lastFocusedWidget === widget) {
					this._lastFocusedWidget = undefined;
				}
			})
		);
	}
}

const RawWorkbenchListFocusContextKey = new RawContextKey<boolean>('listFocus', true);
export const WorkbenchListSupportsMultiSelectContextKey = new RawContextKey<boolean>('listSupportsMultiselect', true);
export const WorkbenchListFocusContextKey = ContextKeyExpr.and(RawWorkbenchListFocusContextKey, ContextKeyExpr.not(InputFocusedContextKey));
export const WorkbenchListHasSelectionOrFocus = new RawContextKey<boolean>('listHasSelectionOrFocus', false);
export const WorkbenchListDoubleSelection = new RawContextKey<boolean>('listDoubleSelection', false);
export const WorkbenchListMultiSelection = new RawContextKey<boolean>('listMultiSelection', false);
export const WorkbenchListSupportsKeyboardNavigation = new RawContextKey<boolean>('listSupportsKeyboardNavigation', true);
export const WorkbenchListAutomaticKeyboardNavigationKey = 'listAutomaticKeyboardNavigation';
export const WorkbenchListAutomaticKeyboardNavigation = new RawContextKey<boolean>(WorkbenchListAutomaticKeyboardNavigationKey, true);
export let didBindWorkbenchListAutomaticKeyboardNavigation = false;

function createScopedContextKeyService(contextKeyService: IContextKeyService, widget: ListWidget): IContextKeyService {
	const result = contextKeyService.createScoped(widget.getHTMLElement());
	RawWorkbenchListFocusContextKey.bindTo(result);
	return result;
}

export const multiSelectModifierSettingKey = 'workbench.list.multiSelectModifier';
export const openModeSettingKey = 'workbench.list.openMode';
export const horizontalScrollingKey = 'workbench.list.horizontalScrolling';
export const keyboardNavigationSettingKey = 'workbench.list.keyboardNavigation';
export const automaticKeyboardNavigationSettingKey = 'workbench.list.automaticKeyboardNavigation';
const treeIndentKey = 'workbench.tree.indent';
const treeRenderIndentGuidesKey = 'workbench.tree.renderIndentGuides';

function getHorizontalScrollingSetting(configurationService: IConfigurationService): boolean {
	return getMigratedSettingValue<boolean>(configurationService, horizontalScrollingKey, 'workbench.tree.horizontalScrolling');
}

function useAltAsMultipleSelectionModifier(configurationService: IConfigurationService): boolean {
	return configurationService.getValue(multiSelectModifierSettingKey) === 'alt';
}

function useSingleClickToOpen(configurationService: IConfigurationService): boolean {
	return configurationService.getValue(openModeSettingKey) !== 'doubleClick';
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

class WorkbenchOpenController extends Disposable implements IOpenController {
	private openOnSingleClick: boolean;

	constructor(private configurationService: IConfigurationService, private existingOpenController?: IOpenController) {
		super();

		this.openOnSingleClick = useSingleClickToOpen(configurationService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(openModeSettingKey)) {
				this.openOnSingleClick = useSingleClickToOpen(this.configurationService);
			}
		}));
	}

	shouldOpen(event: UIEvent): boolean {
		if (event instanceof MouseEvent) {
			const isLeftButton = event.button === 0;
			const isDoubleClick = event.detail === 2;
			if (isLeftButton && !this.openOnSingleClick && !isDoubleClick) {
				return false;
			}

			if (isLeftButton /* left mouse button */ || event.button === 1 /* middle mouse button */) {
				return this.existingOpenController ? this.existingOpenController.shouldOpen(event) : true;
			}

			return false;
		}

		return this.existingOpenController ? this.existingOpenController.shouldOpen(event) : true;
	}
}

function toWorkbenchListOptions<T>(options: IListOptions<T>, configurationService: IConfigurationService, keybindingService: IKeybindingService): [IListOptions<T>, IDisposable] {
	const disposables = new DisposableStore();
	const result = { ...options };

	if (options.multipleSelectionSupport !== false && !options.multipleSelectionController) {
		const multipleSelectionController = new MultipleSelectionController(configurationService);
		result.multipleSelectionController = multipleSelectionController;
		disposables.add(multipleSelectionController);
	}

	const openController = new WorkbenchOpenController(configurationService, options.openController);
	result.openController = openController;
	disposables.add(openController);

	if (options.keyboardNavigationLabelProvider) {
		const tlp = options.keyboardNavigationLabelProvider;

		result.keyboardNavigationLabelProvider = {
			getKeyboardNavigationLabel(e) { return tlp.getKeyboardNavigationLabel(e); },
			mightProducePrintableCharacter(e) { return keybindingService.mightProducePrintableCharacter(e); }
		};
	}

	return [result, disposables];
}

let sharedListStyleSheet: HTMLStyleElement;
function getSharedListStyleSheet(): HTMLStyleElement {
	if (!sharedListStyleSheet) {
		sharedListStyleSheet = createStyleSheet();
	}

	return sharedListStyleSheet;
}

export class WorkbenchList<T> extends List<T> {

	readonly contextKeyService: IContextKeyService;
	private readonly configurationService: IConfigurationService;

	private listHasSelectionOrFocus: IContextKey<boolean>;
	private listDoubleSelection: IContextKey<boolean>;
	private listMultiSelection: IContextKey<boolean>;

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: IListRenderer<T, any>[],
		options: IListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : getHorizontalScrollingSetting(configurationService);
		const [workbenchListOptions, workbenchListOptionsDisposable] = toWorkbenchListOptions(options, configurationService, keybindingService);

		super(container, delegate, renderers,
			{
				keyboardSupport: false,
				styleController: new DefaultStyleController(getSharedListStyleSheet()),
				...computeStyles(themeService.getTheme(), defaultListStyles),
				...workbenchListOptions,
				horizontalScrolling
			}
		);

		this.disposables.add(workbenchListOptionsDisposable);

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
		this.configurationService = configurationService;

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.add(this.contextKeyService);
		this.disposables.add((listService as ListService).register(this));
		this.disposables.add(attachListStyler(this, themeService));
		this.disposables.add(this.onSelectionChange(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
			this.listMultiSelection.set(selection.length > 1);
			this.listDoubleSelection.set(selection.length === 2);
		}));
		this.disposables.add(this.onFocusChange(() => {
			const selection = this.getSelection();
			const focus = this.getFocus();

			this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
		}));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => {
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
	private readonly configurationService: IConfigurationService;

	private readonly disposables: DisposableStore;

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<number>,
		renderers: IPagedRenderer<T, any>[],
		options: IListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : getHorizontalScrollingSetting(configurationService);
		const [workbenchListOptions, workbenchListOptionsDisposable] = toWorkbenchListOptions(options, configurationService, keybindingService);
		super(container, delegate, renderers,
			{
				keyboardSupport: false,
				styleController: new DefaultStyleController(getSharedListStyleSheet()),
				...computeStyles(themeService.getTheme(), defaultListStyles),
				...workbenchListOptions,
				horizontalScrolling
			}
		);

		this.disposables = new DisposableStore();
		this.disposables.add(workbenchListOptionsDisposable);

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
		this.configurationService = configurationService;

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.add(this.contextKeyService);
		this.disposables.add((listService as ListService).register(this));
		this.disposables.add(attachListStyler(this, themeService));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => {
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

		this.disposables.dispose();
	}
}

/**
 * @deprecated
 */
let sharedTreeStyleSheet: HTMLStyleElement;
function getSharedTreeStyleSheet(): HTMLStyleElement {
	if (!sharedTreeStyleSheet) {
		sharedTreeStyleSheet = createStyleSheet();
	}

	return sharedTreeStyleSheet;
}

/**
 * @deprecated
 */
function handleTreeController(configuration: ITreeConfiguration, instantiationService: IInstantiationService): ITreeConfiguration {
	if (!configuration.controller) {
		configuration.controller = instantiationService.createInstance(WorkbenchTreeController, {});
	}

	if (!configuration.styler) {
		configuration.styler = new DefaultTreestyler(getSharedTreeStyleSheet());
	}

	return configuration;
}

/**
 * @deprecated
 */
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

/**
 * @deprecated
 */
function massageControllerOptions(options: IControllerOptions): IControllerOptions {
	if (typeof options.keyboardSupport !== 'boolean') {
		options.keyboardSupport = false;
	}

	if (typeof options.clickBehavior !== 'number') {
		options.clickBehavior = ClickBehavior.ON_MOUSE_DOWN;
	}

	return options;
}

/**
 * @deprecated
 */
export class WorkbenchTreeController extends DefaultController {

	protected readonly disposables = new DisposableStore();

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
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(openModeSettingKey)) {
				this.setOpenMode(this.getOpenModeSetting());
			}
		}));
	}

	private getOpenModeSetting(): OpenMode {
		return useSingleClickToOpen(this.configurationService) ? OpenMode.SINGLE_CLICK : OpenMode.DOUBLE_CLICK;
	}

	dispose(): void {
		this.disposables.dispose();
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

/**
 * @deprecated
 */
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
	browserEvent?: UIEvent;
}

export interface IResourceResultsNavigationOptions2 {
	openOnFocus?: boolean;
	openOnSelection?: boolean;
}

export interface SelectionKeyboardEvent extends KeyboardEvent {
	preserveFocus?: boolean;
}

export function getSelectionKeyboardEvent(typeArg = 'keydown', preserveFocus?: boolean): SelectionKeyboardEvent {
	const e = new KeyboardEvent(typeArg);
	(<SelectionKeyboardEvent>e).preserveFocus = preserveFocus;

	return e;
}

export class TreeResourceNavigator2<T, TFilterData> extends Disposable {

	private options: IResourceResultsNavigationOptions2;

	private readonly _onDidOpenResource = new Emitter<IOpenEvent<T | null>>();
	readonly onDidOpenResource: Event<IOpenEvent<T | null>> = this._onDidOpenResource.event;

	constructor(
		private tree: WorkbenchObjectTree<T, TFilterData> | WorkbenchDataTree<any, T, TFilterData> | WorkbenchAsyncDataTree<any, T, TFilterData>,
		options?: IResourceResultsNavigationOptions2
	) {
		super();

		this.options = {
			...{
				openOnSelection: true
			},
			...(options || {})
		};

		this.registerListeners();
	}

	private registerListeners(): void {
		if (this.options && this.options.openOnFocus) {
			this._register(this.tree.onDidChangeFocus(e => this.onFocus(e)));
		}

		if (this.options && this.options.openOnSelection) {
			this._register(this.tree.onDidChangeSelection(e => this.onSelection(e)));
		}

		this._register(this.tree.onDidOpen(e => this.onSelection(e)));
	}

	private onFocus(e: ITreeEvent<T | null>): void {
		const focus = this.tree.getFocus();
		this.tree.setSelection(focus as T[], e.browserEvent);

		if (!e.browserEvent) {
			return;
		}

		const isMouseEvent = e.browserEvent && e.browserEvent instanceof MouseEvent;

		if (!isMouseEvent) {
			const preserveFocus = (e.browserEvent instanceof KeyboardEvent && typeof (<SelectionKeyboardEvent>e.browserEvent).preserveFocus === 'boolean') ?
				!!(<SelectionKeyboardEvent>e.browserEvent).preserveFocus :
				true;

			this.open(preserveFocus, false, false, e.browserEvent);
		}
	}

	private onSelection(e: ITreeEvent<T | null> | ITreeMouseEvent<T | null>, doubleClick = false): void {
		if (!e.browserEvent || e.browserEvent.type === 'contextmenu') {
			return;
		}

		const isKeyboardEvent = e.browserEvent instanceof KeyboardEvent;
		const isMiddleClick = e.browserEvent instanceof MouseEvent ? e.browserEvent.button === 1 : false;
		const isDoubleClick = e.browserEvent.detail === 2;
		const preserveFocus = (e.browserEvent instanceof KeyboardEvent && typeof (<SelectionKeyboardEvent>e.browserEvent).preserveFocus === 'boolean') ?
			!!(<SelectionKeyboardEvent>e.browserEvent).preserveFocus :
			!isDoubleClick;

		if (this.tree.openOnSingleClick || isDoubleClick || isKeyboardEvent) {
			const sideBySide = e.browserEvent instanceof MouseEvent && (e.browserEvent.ctrlKey || e.browserEvent.metaKey || e.browserEvent.altKey);
			this.open(preserveFocus, isDoubleClick || isMiddleClick, sideBySide, e.browserEvent);
		}
	}

	private open(preserveFocus: boolean, pinned: boolean, sideBySide: boolean, browserEvent?: UIEvent): void {
		this._onDidOpenResource.fire({
			editorOptions: {
				preserveFocus,
				pinned,
				revealIfVisible: true
			},
			sideBySide,
			element: this.tree.getSelection()[0],
			browserEvent
		});
	}
}

function createKeyboardNavigationEventFilter(container: HTMLElement, keybindingService: IKeybindingService): IKeyboardNavigationEventFilter {
	let inChord = false;

	return event => {
		if (inChord) {
			inChord = false;
			return false;
		}

		const result = keybindingService.softDispatch(event, container);

		if (result && result.enterChord) {
			inChord = true;
			return false;
		}

		inChord = false;
		return true;
	};
}

export class WorkbenchObjectTree<T extends NonNullable<any>, TFilterData = void> extends ObjectTree<T, TFilterData> {

	private internals: WorkbenchTreeInternals<any, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		options: IObjectTreeOptions<T, TFilterData>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService
	) {
		const { options: treeOptions, getAutomaticKeyboardNavigation, disposable } = workbenchTreeDataPreamble(container, options, contextKeyService, themeService, configurationService, keybindingService, accessibilityService);
		super(container, delegate, renderers, treeOptions);
		this.disposables.push(disposable);
		this.internals = new WorkbenchTreeInternals(this, treeOptions, getAutomaticKeyboardNavigation, contextKeyService, listService, themeService, configurationService, accessibilityService);
		this.disposables.push(this.internals);
	}
}

export class WorkbenchDataTree<TInput, T, TFilterData = void> extends DataTree<TInput, T, TFilterData> {

	private internals: WorkbenchTreeInternals<TInput, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		dataSource: IDataSource<TInput, T>,
		options: IDataTreeOptions<T, TFilterData>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService
	) {
		const { options: treeOptions, getAutomaticKeyboardNavigation, disposable } = workbenchTreeDataPreamble(container, options, contextKeyService, themeService, configurationService, keybindingService, accessibilityService);
		super(container, delegate, renderers, dataSource, treeOptions);
		this.disposables.push(disposable);
		this.internals = new WorkbenchTreeInternals(this, treeOptions, getAutomaticKeyboardNavigation, contextKeyService, listService, themeService, configurationService, accessibilityService);
		this.disposables.push(this.internals);
	}
}

export class WorkbenchAsyncDataTree<TInput, T, TFilterData = void> extends AsyncDataTree<TInput, T, TFilterData> {

	private internals: WorkbenchTreeInternals<TInput, T, TFilterData>;
	get contextKeyService(): IContextKeyService { return this.internals.contextKeyService; }
	get useAltAsMultipleSelectionModifier(): boolean { return this.internals.useAltAsMultipleSelectionModifier; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		dataSource: IAsyncDataSource<TInput, T>,
		options: IAsyncDataTreeOptions<T, TFilterData>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService
	) {
		const { options: treeOptions, getAutomaticKeyboardNavigation, disposable } = workbenchTreeDataPreamble(container, options, contextKeyService, themeService, configurationService, keybindingService, accessibilityService);
		super(container, delegate, renderers, dataSource, treeOptions);
		this.disposables.push(disposable);
		this.internals = new WorkbenchTreeInternals(this, treeOptions, getAutomaticKeyboardNavigation, contextKeyService, listService, themeService, configurationService, accessibilityService);
		this.disposables.push(this.internals);
	}
}

function workbenchTreeDataPreamble<T, TFilterData, TOptions extends IAbstractTreeOptions<T, TFilterData> | IAsyncDataTreeOptions<T, TFilterData>>(
	container: HTMLElement,
	options: TOptions,
	contextKeyService: IContextKeyService,
	themeService: IThemeService,
	configurationService: IConfigurationService,
	keybindingService: IKeybindingService,
	accessibilityService: IAccessibilityService,
): { options: TOptions, getAutomaticKeyboardNavigation: () => boolean | undefined, disposable: IDisposable } {
	WorkbenchListSupportsKeyboardNavigation.bindTo(contextKeyService);

	if (!didBindWorkbenchListAutomaticKeyboardNavigation) {
		WorkbenchListAutomaticKeyboardNavigation.bindTo(contextKeyService);
		didBindWorkbenchListAutomaticKeyboardNavigation = true;
	}

	const getAutomaticKeyboardNavigation = () => {
		// give priority to the context key value to disable this completely
		let automaticKeyboardNavigation = contextKeyService.getContextKeyValue<boolean>(WorkbenchListAutomaticKeyboardNavigationKey);

		if (automaticKeyboardNavigation) {
			automaticKeyboardNavigation = configurationService.getValue<boolean>(automaticKeyboardNavigationSettingKey);
		}

		return automaticKeyboardNavigation;
	};

	const accessibilityOn = accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Enabled;
	const keyboardNavigation = accessibilityOn ? 'simple' : configurationService.getValue<string>(keyboardNavigationSettingKey);
	const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : getHorizontalScrollingSetting(configurationService);
	const openOnSingleClick = useSingleClickToOpen(configurationService);
	const [workbenchListOptions, disposable] = toWorkbenchListOptions(options, configurationService, keybindingService);
	const additionalScrollHeight = options.additionalScrollHeight;

	return {
		getAutomaticKeyboardNavigation,
		disposable,
		options: {
			keyboardSupport: false,
			styleController: new DefaultStyleController(getSharedListStyleSheet()),
			...computeStyles(themeService.getTheme(), defaultListStyles),
			...workbenchListOptions,
			indent: configurationService.getValue<number>(treeIndentKey),
			renderIndentGuides: configurationService.getValue<RenderIndentGuides>(treeRenderIndentGuidesKey),
			automaticKeyboardNavigation: getAutomaticKeyboardNavigation(),
			simpleKeyboardNavigation: keyboardNavigation === 'simple',
			filterOnType: keyboardNavigation === 'filter',
			horizontalScrolling,
			openOnSingleClick,
			keyboardNavigationEventFilter: createKeyboardNavigationEventFilter(container, keybindingService),
			additionalScrollHeight
		} as TOptions
	};
}

class WorkbenchTreeInternals<TInput, T, TFilterData> {

	readonly contextKeyService: IContextKeyService;
	private hasSelectionOrFocus: IContextKey<boolean>;
	private hasDoubleSelection: IContextKey<boolean>;
	private hasMultiSelection: IContextKey<boolean>;
	private _useAltAsMultipleSelectionModifier: boolean;
	private disposables: IDisposable[] = [];

	constructor(
		tree: WorkbenchObjectTree<T, TFilterData> | WorkbenchDataTree<TInput, T, TFilterData> | WorkbenchAsyncDataTree<TInput, T, TFilterData>,
		options: IAbstractTreeOptions<T, TFilterData> | IAsyncDataTreeOptions<T, TFilterData>,
		getAutomaticKeyboardNavigation: () => boolean | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		this.contextKeyService = createScopedContextKeyService(contextKeyService, tree);

		const listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
		listSupportsMultiSelect.set(!(options.multipleSelectionSupport === false));

		this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
		this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		const interestingContextKeys = new Set();
		interestingContextKeys.add(WorkbenchListAutomaticKeyboardNavigationKey);
		const updateKeyboardNavigation = () => {
			const accessibilityOn = accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Enabled;
			const keyboardNavigation = accessibilityOn ? 'simple' : configurationService.getValue<string>(keyboardNavigationSettingKey);
			tree.updateOptions({
				simpleKeyboardNavigation: keyboardNavigation === 'simple',
				filterOnType: keyboardNavigation === 'filter'
			});
		};

		this.disposables.push(
			this.contextKeyService,
			(listService as ListService).register(tree),
			attachListStyler(tree, themeService),
			tree.onDidChangeSelection(() => {
				const selection = tree.getSelection();
				const focus = tree.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
				this.hasMultiSelection.set(selection.length > 1);
				this.hasDoubleSelection.set(selection.length === 2);
			}),
			tree.onDidChangeFocus(() => {
				const selection = tree.getSelection();
				const focus = tree.getFocus();

				this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
			}),
			configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(openModeSettingKey)) {
					tree.updateOptions({ openOnSingleClick: useSingleClickToOpen(configurationService) });
				}
				if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
					this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
				}
				if (e.affectsConfiguration(treeIndentKey)) {
					const indent = configurationService.getValue<number>(treeIndentKey);
					tree.updateOptions({ indent });
				}
				if (e.affectsConfiguration(treeRenderIndentGuidesKey)) {
					const renderIndentGuides = configurationService.getValue<RenderIndentGuides>(treeRenderIndentGuidesKey);
					tree.updateOptions({ renderIndentGuides });
				}
				if (e.affectsConfiguration(keyboardNavigationSettingKey)) {
					updateKeyboardNavigation();
				}
				if (e.affectsConfiguration(automaticKeyboardNavigationSettingKey)) {
					tree.updateOptions({ automaticKeyboardNavigation: getAutomaticKeyboardNavigation() });
				}
			}),
			this.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(interestingContextKeys)) {
					tree.updateOptions({ automaticKeyboardNavigation: getAutomaticKeyboardNavigation() });
				}
			}),
			accessibilityService.onDidChangeAccessibilitySupport(() => updateKeyboardNavigation())
		);
	}

	get useAltAsMultipleSelectionModifier(): boolean {
		return this._useAltAsMultipleSelectionModifier;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
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
			'description': localize('horizontalScrolling setting', "Controls whether lists and trees support horizontal scrolling in the workbench.")
		},
		'workbench.tree.horizontalScrolling': {
			'type': 'boolean',
			'default': false,
			'description': localize('tree horizontalScrolling setting', "Controls whether trees support horizontal scrolling in the workbench."),
			'deprecationMessage': localize('deprecated', "This setting is deprecated, please use '{0}' instead.", horizontalScrollingKey)
		},
		[treeIndentKey]: {
			'type': 'number',
			'default': 8,
			minimum: 0,
			maximum: 40,
			'description': localize('tree indent setting', "Controls tree indentation in pixels.")
		},
		[treeRenderIndentGuidesKey]: {
			type: 'string',
			enum: ['none', 'onHover', 'always'],
			default: 'onHover',
			description: localize('render tree indent guides', "Controls whether the tree should render indent guides.")
		},
		[keyboardNavigationSettingKey]: {
			'type': 'string',
			'enum': ['simple', 'highlight', 'filter'],
			'enumDescriptions': [
				localize('keyboardNavigationSettingKey.simple', "Simple keyboard navigation focuses elements which match the keyboard input. Matching is done only on prefixes."),
				localize('keyboardNavigationSettingKey.highlight', "Highlight keyboard navigation highlights elements which match the keyboard input. Further up and down navigation will traverse only the highlighted elements."),
				localize('keyboardNavigationSettingKey.filter', "Filter keyboard navigation will filter out and hide all the elements which do not match the keyboard input.")
			],
			'default': 'highlight',
			'description': localize('keyboardNavigationSettingKey', "Controls the keyboard navigation style for lists and trees in the workbench. Can be simple, highlight and filter.")
		},
		[automaticKeyboardNavigationSettingKey]: {
			'type': 'boolean',
			'default': true,
			markdownDescription: localize('automatic keyboard navigation setting', "Controls whether keyboard navigation in lists and trees is automatically triggered simply by typing. If set to `false`, keyboard navigation is only triggered when executing the `list.toggleKeyboardNavigation` command, for which you can assign a keyboard shortcut.")
		}
	}
});
