/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventHelper, EventType, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
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
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
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
	 * Lists the entry picked last (remembered per profile) first.
	 */
	readonly recentFirst?: boolean;

	/**
	 * Opens the menu over the button, with its first entry under the pointer, so that a second click without moving
	 * the pointer picks it.
	 */
	readonly menuOverButton?: boolean;
}

/**
 * The offset of the pointer in the button from the top left corner of the menu when the menu opens over the button:
 * inside the icon column of the first entry, at its vertical center.
 */
const MENU_OVER_BUTTON_POINTER_OFFSET = { x: 16, y: 19 };

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
	) {
		super();

		this.element = $('.tabs-bar-add-tab');
		parent.insertBefore(this.element, options?.before ?? null);

		const recentEntryStorageKey = `editor.addTabMenu.recentEntry.${menuId.id}`;
		const menu = this._register(menuService.createMenu(menuId, contextKeyService));
		const getActions = () => {
			const actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
			const recentEntry = options?.recentFirst ? storageService.get(recentEntryStorageKey, StorageScope.PROFILE) : undefined;
			const recentIndex = recentEntry ? actions.findIndex(action => action.id === recentEntry) : -1;
			return recentIndex > 0 ? [actions[recentIndex], ...actions.slice(0, recentIndex), ...actions.slice(recentIndex + 1)] : actions;
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
			getAnchor: options?.menuOverButton ? () => this._getMenuOverButtonAnchor() : undefined
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
		if (options?.menuOverButton) {
			this._ignoreReleaseOfOpeningPress();
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

	private _getMenuOverButtonAnchor(): { x: number; y: number } {
		const button = this.element.getBoundingClientRect();
		return {
			x: button.left + button.width / 2 - MENU_OVER_BUTTON_POINTER_OFFSET.x,
			y: button.top + button.height / 2 - MENU_OVER_BUTTON_POINTER_OFFSET.y,
		};
	}

	/**
	 * The menu opens on mouse down, under the pointer: releasing the button that opened it must not pick its first entry.
	 */
	private _ignoreReleaseOfOpeningPress(): void {
		const pendingRelease = this._register(new MutableDisposable());
		this._register(addDisposableListener(this.element, EventType.MOUSE_DOWN, e => {
			if (e.button !== 0) {
				return;
			}
			pendingRelease.value = addDisposableListener(getWindow(this.element), EventType.MOUSE_UP, release => {
				pendingRelease.clear();
				if (!isHTMLElement(release.target) || !this.element.contains(release.target)) {
					EventHelper.stop(release, true);
				}
			}, true);
		}, true));
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
