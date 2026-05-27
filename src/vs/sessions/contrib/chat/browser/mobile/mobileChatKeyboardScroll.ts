/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IMobileVisualViewport } from '../../../../browser/parts/mobile/mobileVisualViewport.js';

/**
 * Delay (in milliseconds) between the keyboard becoming visible and the
 * scroll-to-bottom call. The keyboard animation on iOS is ~250ms; by
 * waiting ~50ms we let the chat input lift settle and the list have
 * its new effective height (the layout viewport doesn't shrink on iOS,
 * but the input-part `padding-bottom` does — see the keyboard-avoidance
 * section in `mobileChatShell.css`). A shorter delay tends to scroll
 * before the lift, leaving the last message hidden under the input.
 */
const KEYBOARD_OPEN_SCROLL_DELAY_MS = 50;

/**
 * On phone-layout viewports, scrolls the chat message list to its last
 * item whenever the virtual keyboard appears, so the most recent
 * message stays visible above the lifted chat input.
 *
 * The keyboard-avoidance CSS (see the "Phone Layout: iOS Keyboard
 * Avoidance" section in `mobileChatShell.css`) only translates the
 * input container itself — it doesn't change the chat-list viewport
 * height because on iOS the layout viewport doesn't shrink when the
 * keyboard opens. Without this contribution, focusing the input would
 * push the input up over the most recent message, hiding it behind the
 * lifted input. Mirroring native iOS messaging-app behaviour, we keep
 * the list anchored to the bottom when the user starts typing.
 *
 * # Per-widget autorun
 *
 * One {@link autorun} is registered per chat widget the moment it is
 * created. The autorun observes
 * {@link IMobileVisualViewport.isKeyboardVisible} and, on the rising
 * edge (closed → open), schedules a {@link IChatWidget.reveal} call on
 * the widget's last view-model item.
 *
 * Per-widget (rather than one global autorun on the last-focused
 * widget) means that if multiple chat widgets are mounted, each gets
 * its own lift-and-scroll pass — and if the keyboard is already open
 * when a widget is created, the autorun fires immediately and scrolls
 * the brand-new list to its bottom.
 *
 * # Lifetime
 *
 * Per-widget autoruns are kept in a {@link DisposableMap} keyed by the
 * widget instance. {@link IChatWidgetService} does not currently expose
 * an `onDidRemoveWidget`/`onWillDispose` event, so per-widget
 * autoruns are released collectively when this contribution is
 * disposed (which is workbench-lifetime). The autorun is robust
 * against widget disposal: it bails out when `widget.viewModel` is
 * `undefined`, which is the state a chat widget enters when its
 * underlying session is detached, so a stale autorun is a no-op
 * rather than a crash.
 */
class MobileChatKeyboardScrollContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.mobileChatKeyboardScroll';

	private readonly _perWidgetAutoruns = this._register(new DisposableMap<IChatWidget>());

	constructor(
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMobileVisualViewport mobileVisualViewport: IMobileVisualViewport,
	) {
		super();

		// Gate the whole behaviour on the phone-layout context key,
		// matching the rest of the mobile contributions in this
		// folder (the desktop layout doesn't lift the input either,
		// so scrolling on keyboard would be both unnecessary and
		// disorienting).
		const isPhoneCtxObs = observableContextKey<boolean>('sessionsIsPhoneLayout', contextKeyService);
		const isPhone = derived(this, reader => isPhoneCtxObs.read(reader) === true);

		const wireWidget = (widget: IChatWidget) => {
			// Replace any prior autorun for the same widget instance
			// (defensive — chat widgets are typically registered
			// exactly once, but this keeps the map invariant clean).
			this._perWidgetAutoruns.deleteAndDispose(widget);

			this._perWidgetAutoruns.set(widget, autorun(reader => {
				if (!isPhone.read(reader)) {
					return;
				}
				if (!mobileVisualViewport.isKeyboardVisible.read(reader)) {
					return;
				}

				// Defer the scroll past the start of the keyboard
				// animation so the list has its new effective height
				// (the input-part has lifted by then via the
				// keyboard-avoidance CSS). Capturing the widget by
				// closure is safe — the no-op guards below handle
				// the case where the widget is disposed before the
				// timeout fires.
				const targetWindow = widget.domNode.ownerDocument.defaultView ?? globalThis;
				const timeoutId = targetWindow.setTimeout(() => {
					const items = widget.viewModel?.getItems();
					if (!items || items.length === 0) {
						return;
					}
					widget.reveal(items[items.length - 1]);
				}, KEYBOARD_OPEN_SCROLL_DELAY_MS);

				reader.store.add({
					dispose: () => targetWindow.clearTimeout(timeoutId),
				});
			}));
		};

		// Wire up widgets that already exist at contribution-start
		// time (the contribution is in `AfterRestored` phase so
		// `ChatViewPane`s may have already created their widgets).
		for (const widget of chatWidgetService.getAllWidgets()) {
			wireWidget(widget);
		}

		this._register(chatWidgetService.onDidAddWidget(wireWidget));
	}
}

registerWorkbenchContribution2(
	MobileChatKeyboardScrollContribution.ID,
	MobileChatKeyboardScrollContribution,
	WorkbenchPhase.AfterRestored,
);
