/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventHelper, EventType, getWindow } from '../../../../base/browser/dom.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IEditorCommandsContext } from '../../../common/editor.js';

const addTabActionId = 'editor.tabs.addTab';

export interface IEditorAddTabControlOptions {

	/**
	 * Element before which the control is inserted. Appended to the parent when omitted.
	 */
	readonly before?: HTMLElement;

	/**
	 * Resolves keybindings shown in the dropdown. Defaults to a lookup in the given context key service.
	 */
	readonly keybindingProvider?: (action: IAction) => ResolvedKeybinding | undefined;

	/**
	 * The context the entries run with, such as the group of the tabs bar, so that they act on that group rather than
	 * on the active one.
	 */
	readonly context?: IEditorCommandsContext;

	/**
	 * Lists the entry picked last (remembered per profile) again above the entries.
	 */
	readonly recentFirst?: boolean;

	/**
	 * Makes the first entry the default: the menu highlights it when it opens and while the pointer is over the button,
	 * and pressing the button again while the menu is open picks it, so that clicking twice without moving the pointer
	 * picks it.
	 */
	readonly defaultEntry?: boolean;
}

/**
 * The "Add Tab" (`+`) dropdown that lists the actions of a contributed menu.
 * The control element carries the `hidden` class while the menu has no actions.
 */
export class EditorAddTabControl extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeVisibility = this._register(new Emitter<void>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	get visible(): boolean {
		return !this.element.classList.contains('hidden');
	}

	constructor(
		parent: HTMLElement,
		menuId: MenuId,
		contextKeyService: IContextKeyService,
		options: IEditorAddTabControlOptions | undefined,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IContextViewService contextViewService: IContextViewService,
	) {
		super();

		this.element = $('.tabs-bar-add-tab');
		parent.insertBefore(this.element, options?.before ?? null);

		const recentEntryStorageKey = `editor.addTabMenu.recentEntry.${menuId.id}`;
		const recentDescription = localize('addTabRecentlyUsed', "recently used");
		let recentAction: IAction | undefined;
		const menu = this._register(menuService.createMenu(menuId, contextKeyService));
		const getActions = () => {
			const actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
			const recentEntry = options?.recentFirst ? storageService.get(recentEntryStorageKey, StorageScope.PROFILE) : undefined;
			recentAction = recentEntry ? actions.find(action => action.id === recentEntry) : undefined;
			// The recent entry moves to the top
			return recentAction ? [recentAction, ...actions.filter(action => action !== recentAction)] : actions;
		};
		const addTabAction = toAction({
			id: addTabActionId,
			label: localize('addTab', "Add Tab"),
			class: ThemeIcon.asClassName(Codicon.add),
			run: () => { }
		});
		const dropdown = this._register(new DropdownMenuActionViewItem(addTabAction, { getActions }, contextMenuService, {
			classNames: ThemeIcon.asClassNameArray(Codicon.add),
			keybindingProvider: options?.keybindingProvider ?? (action => keybindingService.lookupKeybinding(action.id, contextKeyService)),
			defaultItem: options?.defaultEntry ? 0 : undefined,
			getDescription: action => action === recentAction ? recentDescription : undefined
		}));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, this.element, {
			ariaLabel: localize('ariaLabelAddTab', "Add Tab"),
			actionViewItemProvider: action => action === addTabAction ? dropdown : undefined
		}));
		toolbar.context = options?.context;
		toolbar.setActions([addTabAction]);
		this._registerMenuTelemetry(menuId, dropdown, toolbar, telemetryService);
		if (options?.recentFirst) {
			this._register(toolbar.actionRunner.onWillRun(e => {
				if (e.action.id !== addTabActionId) {
					storageService.store(recentEntryStorageKey, e.action.id, StorageScope.PROFILE, StorageTarget.MACHINE);
				}
			}));
		}
		if (options?.defaultEntry) {
			this._pickDefaultEntryOnSecondPress(dropdown, toolbar, () => getActions().find(action => !(action instanceof Separator)), contextViewService);
		}

		const updateVisibility = () => this.element.classList.toggle('hidden', getActions().length === 0);
		updateVisibility();
		this._register(menu.onDidChange(() => {
			const wasVisible = this.visible;
			updateVisibility();
			if (wasVisible !== this.visible) {
				this._onDidChangeVisibility.fire();
			}
		}));
	}

	/**
	 * While the menu is open, pressing the button picks the default entry rather than only closing the menu. The menu
	 * blocks the mouse in the rest of the window, so the press is recognized by its position before the block sees it.
	 */
	private _pickDefaultEntryOnSecondPress(dropdown: DropdownMenuActionViewItem, toolbar: WorkbenchToolBar, getDefaultEntry: () => IAction | undefined, contextViewService: IContextViewService): void {
		const whileMenuVisible = this._register(new MutableDisposable());
		this._register(dropdown.onDidChangeVisibility(visible => {
			whileMenuVisible.value = visible ? addDisposableListener(getWindow(this.element), EventType.MOUSE_DOWN, e => {
				const bounds = this.element.getBoundingClientRect();
				const onButton = e.clientX >= bounds.left && e.clientX < bounds.right && e.clientY >= bounds.top && e.clientY < bounds.bottom;
				const entry = onButton && e.button === 0 ? getDefaultEntry() : undefined;
				if (!entry) {
					return;
				}
				EventHelper.stop(e, true);
				contextViewService.hideContextView();
				toolbar.actionRunner.run(entry, toolbar.context);
			}, true) : undefined;
		}));
	}
	/**
	 * Logs the journey through the menu: it was opened, then an entry was picked or it was dismissed.
	 */
	private _registerMenuTelemetry(menuId: MenuId, dropdown: DropdownMenuActionViewItem, toolbar: WorkbenchToolBar, telemetryService: ITelemetryService): void {
		type EditorAddTabMenuEvent = { kind: 'opened' | 'picked' | 'dismissed'; menuId: string; entry: string | undefined };
		type EditorAddTabMenuClassification = {
			owner: 'hediet';
			comment: 'How the add tab (+) button at the end of the editor tabs is used.';
			kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'opened: the menu was opened. picked: an entry was picked. dismissed: the menu was closed without picking an entry.' };
			menuId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The menu of the button, e.g. the one of the workbench or of the Agents window.' };
			entry: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The command id of the picked entry.' };
		};
		const log = (kind: EditorAddTabMenuEvent['kind'], entry?: string) => telemetryService.publicLog2<EditorAddTabMenuEvent, EditorAddTabMenuClassification>('editorAddTabMenu', { kind, menuId: menuId.id, entry });

		let picked = false;
		// The dropdown runs its entries with the action runner of the toolbar
		this._register(toolbar.actionRunner.onWillRun(e => {
			if (e.action.id === addTabActionId) {
				return;
			}
			picked = true;
			log('picked', e.action.id);
		}));
		this._register(dropdown.onDidChangeVisibility(visible => {
			if (visible) {
				picked = false;
				log('opened');
				return;
			}
			// The menu hides before the picked entry runs, in the same task
			queueMicrotask(() => {
				if (!picked) {
					log('dismissed');
				}
			});
		}));
	}
}
