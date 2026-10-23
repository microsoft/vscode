/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { EventLike } from '../../../../base/browser/dom.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../browser/menus.js';
import './media/chatWindowLayoutPicker.css';

/**
 * The Layout button of a chat window: the layout icon, which opens a column of the icons of the layouts of the Layout
 * menu below it, where the current layout is checked. Choosing a layout, Escape, or clicking elsewhere closes it.
 */
class ChatWindowLayoutPickerActionViewItem extends ActionViewItem {

	private readonly _picker = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: IAction,
		options: IActionViewItemOptions | undefined,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super(undefined, action, { ...options, icon: true, label: false });
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.label?.setAttribute('aria-haspopup', 'true');
		this.label?.setAttribute('aria-expanded', 'false');

		// Opened from the keyboard, the picker starts with the current layout focused. The toolbar would run the
		// submenu instead, which does nothing.
		if (this.element) {
			this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space) || event.equals(KeyCode.DownArrow)) {
					dom.EventHelper.stop(e, true);
					if (!this._picker.value) {
						this._showPicker(true);
					}
				}
			}));
		}
	}

	protected override getClass(): string {
		return ThemeIcon.asClassName(Codicon.layout);
	}

	override onClick(event: EventLike): void {
		dom.EventHelper.stop(event, true);
		if (this._picker.value) {
			this._contextViewService.hideContextView();
		} else {
			this._showPicker(false);
		}
	}

	/**
	 * Shows the picker. From the keyboard the current layout is focused; from the mouse the picker itself is, so it
	 * shows no focus, and the arrow keys then move to the current layout.
	 */
	private _showPicker(fromKeyboard: boolean): void {
		const anchor = this.label;
		if (!anchor) {
			return;
		}
		const store = new DisposableStore();
		this._picker.value = store;
		anchor.setAttribute('aria-expanded', 'true');
		store.add(toDisposable(() => anchor.setAttribute('aria-expanded', 'false')));

		let toolbar: MenuWorkbenchToolBar | undefined;
		let pickerElement: HTMLElement | undefined;
		const focusCurrentLayout = () => {
			let checked = 0;
			for (let index = 0; toolbar && index < toolbar.getItemsLength(); index++) {
				if (toolbar.getItemAction(index)?.checked) {
					checked = index;
					break;
				}
			}
			toolbar?.focus(checked);
		};
		this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: container => {
				const element = dom.append(container, dom.$('.chat-window-layout-picker', { tabIndex: -1 }));
				toolbar = store.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, element, Menus.ChatWindowLayout, {
					orientation: ActionsOrientation.VERTICAL,
					// Beside the picker, toward the window, as the session activity bar shows them: after the hover delay,
					// then at once while moving between layouts.
					hoverDelegate: store.add(this._instantiationService.createInstance(WorkbenchHoverDelegate, 'element', undefined, { position: { hoverPosition: HoverPosition.LEFT } })),
					hiddenItemStrategy: HiddenItemStrategy.NoHide,
					highlightToggledItems: true,
					toolbarOptions: { primaryGroup: () => true },
					ariaLabel: localize('chatWindowLayoutPicker', "Layout"),
				}));
				pickerElement = element;
				// Choosing a layout closes the picker.
				store.add(toolbar.actionRunner.onDidRun(() => this._contextViewService.hideContextView()));
				store.add(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, e => {
					const event = new StandardKeyboardEvent(e);
					if (event.equals(KeyCode.Escape)) {
						dom.EventHelper.stop(e, true);
						this._contextViewService.hideContextView();
						anchor.focus();
					} else if (e.target === element && (event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow) || event.equals(KeyCode.Home) || event.equals(KeyCode.End))) {
						dom.EventHelper.stop(e, true);
						focusCurrentLayout();
					}
				}));
				// Clicking elsewhere closes it, as does the window losing focus, for example to a webview. Clicking the
				// button is left to the button, which closes it.
				const targetWindow = dom.getWindow(anchor);
				store.add(dom.addDisposableListener(targetWindow.document, dom.EventType.POINTER_DOWN, e => {
					const target = e.target;
					if (!dom.isHTMLElement(target) || (!dom.isAncestor(target, element) && !dom.isAncestor(target, anchor))) {
						this._contextViewService.hideContextView();
					}
				}, true));
				store.add(dom.addDisposableListener(targetWindow, dom.EventType.BLUR, () => this._contextViewService.hideContextView()));
				return Disposable.None;
			},
			// Closing is handled above, rather than by clicks within the window's container only.
			onDOMEvent: () => { },
			focus: () => {
				if (fromKeyboard) {
					focusCurrentLayout();
				} else {
					pickerElement?.focus();
				}
			},
			onHide: () => {
				if (this._picker.value === store) {
					this._picker.clear();
				} else {
					store.dispose();
				}
			},
		}, this._layoutService.getContainer(dom.getWindow(anchor)));
	}
}

/** Shows the Layout menu of chat windows, in their window's title bar and their docked header, as a column of icons. */
export class ChatWindowLayoutPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.chatWindowLayoutPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		for (const menu of [Menus.TitleBarRightLayout, Menus.ChatWindowTitle]) {
			this._register(actionViewItemService.register(menu, Menus.ChatWindowLayout, (action, options, instantiationService) =>
				action instanceof SubmenuItemAction ? instantiationService.createInstance(ChatWindowLayoutPickerActionViewItem, action, options) : undefined
			));
		}
	}
}
