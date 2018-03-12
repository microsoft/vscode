/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITree, ITreeConfiguration, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { List, IListOptions, isSelectionRangeChangeEvent, isSelectionSingleChangeEvent, IMultipleSelectionController, IOpenController } from 'vs/base/browser/ui/list/listWidget';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable, combinedDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey, RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { PagedList, IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { IDelegate, IRenderer, IListMouseEvent, IListTouchEvent } from 'vs/base/browser/ui/list/list';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { InputFocusedContextKey } from 'vs/platform/workbench/common/contextkeys';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { mixin } from 'vs/base/common/objects';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { DefaultController, IControllerOptions, OpenMode, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import Event, { Emitter } from 'vs/base/common/event';
import { ScrollbarVisibility } from '../../../base/common/scrollable';

export type ListWidget = List<any> | PagedList<any> | ITree;

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
		if (widget.isDOMFocused()) {
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
export const WorkbenchListDoubleSelection = new RawContextKey<boolean>('listDoubleSelection', false);
export const WorkbenchListMultiSelection = new RawContextKey<boolean>('listMultiSelection', false);

function createScopedContextKeyService(contextKeyService: IContextKeyService, widget: ListWidget): IContextKeyService {
	const result = contextKeyService.createScoped(widget.getHTMLElement());

	if (widget instanceof List || widget instanceof PagedList) {
		WorkbenchListSupportsMultiSelectContextKey.bindTo(result);
	}

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

function handleListControllers<T>(options: IListOptions<T>, configurationService: IConfigurationService): IListOptions<T> {
	if (options.multipleSelectionSupport !== false && !options.multipleSelectionController) {
		options.multipleSelectionController = new MultipleSelectionController(configurationService);
	}

	options.openController = new WorkbenchOpenController(configurationService, options.openController);

	return options;
}

function handleTreeController(configuration: ITreeConfiguration, instantiationService: IInstantiationService): ITreeConfiguration {
	if (!configuration.controller) {
		configuration.controller = instantiationService.createInstance(WorkbenchTreeController, {});
	}

	return configuration;
}

export class WorkbenchList<T> extends List<T> {

	readonly contextKeyService: IContextKeyService;

	private listDoubleSelection: IContextKey<boolean>;
	private listMultiSelection: IContextKey<boolean>;

	private _useAltAsMultipleSelectionModifier: boolean;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		options: IListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(container, delegate, renderers, mixin(handleListControllers(options, configurationService), { keyboardSupport: false, selectOnMouseDown: true } as IListOptions<T>, false));

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
		this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
		this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);

		this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);

		this.disposables.push(combinedDisposable([
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService),
			this.onSelectionChange(() => {
				const selection = this.getSelection();
				this.listMultiSelection.set(selection.length > 1);
				this.listDoubleSelection.set(selection.length === 2);
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
		delegate: IDelegate<number>,
		renderers: IPagedRenderer<T, any>[],
		options: IListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(container, delegate, renderers, mixin(handleListControllers(options, configurationService), { keyboardSupport: false, selectOnMouseDown: true } as IListOptions<T>, false));

		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

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
		const opts = { horizontalScrollMode, keyboardSupport: false, ...options };

		super(container, config, opts);

		this.disposables = [];
		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
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
			this.listDoubleSelection.set(selection && selection.length === 2);
			this.listMultiSelection.set(selection && selection.length > 1);
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
		@IConfigurationService private configurationService: IConfigurationService
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

	private _openResource: Emitter<IOpenResourceOptions> = new Emitter<IOpenResourceOptions>();
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

		if (!isMouseEvent || this.tree.openOnSingleClick || isDoubleClick) {
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

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'workbench',
	'order': 7,
	'title': localize('workbenchConfigurationTitle', "Workbench"),
	'type': 'object',
	'properties': {
		'workbench.list.multiSelectModifier': {
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
			}, "The modifier to be used to add an item in trees and lists to a multi-selection with the mouse (for example in the explorer, open editors and scm view). `ctrlCmd` maps to `Control` on Windows and Linux and to `Command` on macOS. The 'Open to Side' mouse gestures - if supported - will adapt such that they do not conflict with the multiselect modifier.")
		},
		'workbench.list.openMode': {
			'type': 'string',
			'enum': ['singleClick', 'doubleClick'],
			'enumDescriptions': [
				localize('openMode.singleClick', "Opens items on mouse single click."),
				localize('openMode.doubleClick', "Open items on mouse double click.")
			],
			'default': 'singleClick',
			'description': localize({
				key: 'openModeModifier',
				comment: ['`singleClick` and `doubleClick` refers to a value the setting can take and should not be localized.']
			}, "Controls how to open items in trees and lists using the mouse (if supported). Set to `singleClick` to open items with a single mouse click and `doubleClick` to only open via mouse double click. For parents with children in trees, this setting will control if a single click expands the parent or a double click. Note that some trees and lists might choose to ignore this setting if it is not applicable. ")
		},
		[horizontalScrollingKey]: {
			'type': 'boolean',
			'default': false,
			'description': localize('horizontalScrolling setting', "Controls whether trees support horizontal scrolling in the workbench.")
		}
	}
});
