/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventHelper, EventType, getActiveElement, getWindow, isAncestor, isHTMLElement } from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { AnchorAxisAlignment } from '../../../base/browser/ui/contextview/contextview.js';
import { Menu } from '../../../base/browser/ui/menu/menu.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { IAction, IActionRunner } from '../../../base/common/actions.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { defaultMenuStyles } from '../../../platform/theme/browser/defaultStyles.js';

export interface ISubmenuFlyoutOptions {
	/** The entry the flyout opens beside. It receives `aria-expanded` and the `submenu-open` class. */
	readonly anchor: HTMLElement;
	readonly getActions: () => readonly IAction[];
	readonly getActionRunner: () => IActionRunner;
	readonly lookupKeybinding: (commandId: string) => ResolvedKeybinding | undefined;
	/** Keys on the anchor that open the flyout and move focus into it. */
	readonly openKeys: readonly KeyCode[];
	/** Keys inside the flyout that close it and return focus to the anchor, in addition to Escape. */
	readonly closeKeys: readonly KeyCode[];
}

/**
 * Shows a submenu beside an entry like a menu's own submenus: it opens after a short
 * hover, stays open while the pointer moves into it, and supports the keyboard. The
 * context view places it on whichever side of the anchor has room.
 */
export class SubmenuFlyout extends Disposable {

	private static readonly SHOW_DELAY = 250;
	private static readonly HIDE_DELAY = 300;

	private readonly flyout = this._register(new MutableDisposable());
	private menu: Menu | undefined;
	private readonly showScheduler = this._register(new RunOnceScheduler(() => this.show(false), SubmenuFlyout.SHOW_DELAY));
	private readonly hideScheduler = this._register(new RunOnceScheduler(() => this.flyout.clear(), SubmenuFlyout.HIDE_DELAY));

	get isOpen(): boolean {
		return !!this.flyout.value;
	}

	constructor(
		private readonly options: ISubmenuFlyoutOptions,
		@IContextViewService private readonly contextViewService: IContextViewService,
	) {
		super();

		const anchor = options.anchor;
		anchor.setAttribute('aria-haspopup', 'menu');
		anchor.setAttribute('aria-expanded', 'false');

		this._register(addDisposableListener(anchor, EventType.MOUSE_ENTER, () => {
			this.hideScheduler.cancel();
			if (!this.isOpen) {
				this.showScheduler.schedule();
			}
		}));
		this._register(addDisposableListener(anchor, EventType.MOUSE_LEAVE, () => {
			this.showScheduler.cancel();
			if (this.isOpen) {
				this.hideScheduler.schedule();
			}
		}));
		this._register(addDisposableListener(anchor, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (options.openKeys.some(key => event.equals(key))) {
				EventHelper.stop(e, true);
				this.show(true);
			}
		}));
	}

	/** Opens the flyout, or moves focus into it when it is already open and `focus` is set. */
	show(focus: boolean): void {
		this.showScheduler.cancel();
		this.hideScheduler.cancel();
		if (this.isOpen) {
			if (focus) {
				this.menu?.focus(true);
			}
			return;
		}

		const { anchor, closeKeys } = this.options;
		const actions = this.options.getActions();
		const actionRunner = this.options.getActionRunner();
		const focusToReturn = getActiveElement();
		let flyoutContainer: HTMLElement | undefined;
		let returnFocusToAnchor = false;
		const view = this.contextViewService.showContextView({
			getAnchor: () => anchor,
			anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL,
			canRelayout: false,
			render: container => {
				flyoutContainer = container;
				const disposables = new DisposableStore();
				disposables.add(actionRunner.onWillRun(() => this.flyout.clear()));

				const menu = this.menu = disposables.add(new Menu(container, actions, {
					actionRunner,
					getKeyBinding: action => this.options.lookupKeybinding(action.id),
				}, defaultMenuStyles));
				disposables.add(toDisposable(() => this.menu = undefined));

				disposables.add(menu.onDidCancel(() => {
					returnFocusToAnchor = true;
					this.flyout.clear();
				}));
				disposables.add(menu.onDidBlur(() => this.flyout.clear()));
				disposables.add(addDisposableListener(container, EventType.KEY_DOWN, e => {
					const event = new StandardKeyboardEvent(e);
					if (closeKeys.some(key => event.equals(key))) {
						EventHelper.stop(e, true);
						returnFocusToAnchor = true;
						this.flyout.clear();
					}
				}));

				disposables.add(addDisposableListener(container, EventType.MOUSE_ENTER, () => this.hideScheduler.cancel()));
				disposables.add(addDisposableListener(container, EventType.MOUSE_LEAVE, () => this.hideScheduler.schedule()));

				const targetWindow = getWindow(container);
				disposables.add(addDisposableListener(targetWindow, EventType.BLUR, () => this.flyout.clear()));
				disposables.add(addDisposableListener(targetWindow, EventType.MOUSE_DOWN, e => {
					const target = e.target;
					if (!isHTMLElement(target) || (!isAncestor(target, container) && !isAncestor(target, anchor))) {
						this.flyout.clear();
					}
				}));

				return disposables;
			},
			focus: focus ? () => this.menu?.focus(true) : undefined,
			onHide: () => {
				anchor.setAttribute('aria-expanded', 'false');
				anchor.classList.remove('submenu-open');
				// Hidden by the context view itself (e.g. replaced by another context view): release the handle.
				this.flyout.clearAndLeak()?.dispose();

				// Hovering the flyout moves focus into it; give focus back instead of losing it with the menu.
				if (returnFocusToAnchor) {
					anchor.focus();
				} else if (flyoutContainer && isAncestor(getActiveElement(), flyoutContainer) && isHTMLElement(focusToReturn) && focusToReturn.isConnected) {
					focusToReturn.focus();
				}
			},
		});
		this.flyout.value = toDisposable(() => view.close());
		anchor.setAttribute('aria-expanded', 'true');
		anchor.classList.add('submenu-open');
	}
}
