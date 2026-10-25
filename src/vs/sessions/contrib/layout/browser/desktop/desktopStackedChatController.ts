/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow, isHTMLElement } from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, debouncedObservable, derived, IObservable, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from '../../../../../workbench/browser/parts/editor/editor.js';
import { IsAuxiliaryWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import type { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { MainEditorPart } from '../../../../browser/parts/editorPart.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import type { SessionView } from '../../../../browser/parts/sessionView.js';
import { clampStackedChatOnResize, decideStackedChatInputOnly, shouldRestoreStackedChatConversation, stackedChatConversationFits, stackedChatForcedByWindow, stackedChatPersistedInputOnly } from '../../../../browser/parts/stackedChatInputOnly.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { chatLayoutOwnersEqual } from '../../../../common/chatLayout.js';
import { CustomViewVisibleContext, DesktopLayoutContext, IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { STACKED_CHAT_CONVERSATION_MIN_HEIGHT, STACKED_CHAT_INPUT_MAX_HEIGHT } from '../../../../common/layoutConstants.js';
import { SessionLayoutMode, SessionLayoutModeContext } from '../../../../common/sessionLayoutMode.js';
import { ChatWindowContext } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartHeightConstraints, ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { DesktopLayoutModeCoordinator } from './desktopLayoutModeCoordinator.js';
import { IDesktopLayoutContext } from './desktopLayoutStrategy.js';

/** Shows only the input of the chat below the editor in the main window, or its conversation too. */
export const TOGGLE_STACKED_CHAT_CONVERSATION_COMMAND_ID = 'workbench.action.agentSessions.layout.toggleConversation';

/**
 * Stacked below the editor in the main window, the chat can show only its input, with its latest message, progress and
 * approvals above it, as it can below the editor of a chat window, and by the same rules (see `stackedChatInputOnly.ts`):
 * dragging the sash between the editor and the chat snaps between the input and the conversation; resizing the window
 * keeps what the chat shows, and shows only the input while the window is too short for the conversation, until it grows
 * again. Whether the chat shows only its input is remembered for the focused chat with its layout mode.
 *
 * It applies while one chat surface is shown, outside phone layouts and custom views.
 */
export class DesktopStackedChatController extends Disposable {

	private _view: AbstractChatView | undefined;
	/** Set while this controller sizes the Sessions Part, so that the sizes it passes through are not decisions. */
	private _sizing = false;
	/** Whether the pointer is pressed on a sash of the workbench grid, as the user drags the split. */
	private _pointerDown = false;
	/** Whether the chat shows only its input because the window is too short for the conversation. */
	private _forcedByWindow = false;
	/** The height the user last left the chat at while it showed the conversation. */
	private _conversationHeight: number | undefined;
	private _inputOnlyHeight: IObservable<number> = constObservable(0);
	/** Sizes the chat after the grid lays out: resizing within its layout pass leaves its split views' offsets stale. */
	private readonly _afterLayout = this._register(new RunOnceScheduler(() => {
		if (!this._restoreConversation()) {
			this._clampOnResize();
		}
	}, 0));

	constructor(
		ctx: IDesktopLayoutContext,
		private readonly _layoutMode: DesktopLayoutModeCoordinator,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@ISessionsService sessionsService: ISessionsService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super();

		const partLaidOut = observableSignalFromEvent(this, Event.any<unknown>(this._sessionsPartService.onDidLayout, this._layoutService.onDidLayoutMainContainer, this._layoutService.onDidChangePartVisibility));
		const sessionView = derived<SessionView | undefined>(this, reader => {
			partLaidOut.read(reader);
			if (this._layoutMode.mode.read(reader) !== SessionLayoutMode.Stacked
				|| ctx.multipleChatsVisibleObs.read(reader) || ctx.multipleSessionsVisibleObs.read(reader)
				|| isPhoneLayout(this._layoutService) || this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
				return undefined;
			}
			const session = sessionsService.mainWindowActiveSession.read(reader);
			return this._sessionsPartService.getSessionView(session?.sessionId);
		});
		this._register(autorun(reader => {
			const view = sessionView.read(reader);
			const chatView = view?.primaryChatView.read(reader);
			if (view && chatView) {
				reader.store.add(this._attach(view, chatView));
			}
		}));

		const container = this._layoutService.mainContainer;
		this._register(addDisposableListener(container, EventType.POINTER_DOWN, e => {
			// A sash between the rows of the workbench grid, such as between the editor and the chat stacked below it.
			this._pointerDown = isHTMLElement(e.target) && !!e.target.closest('.monaco-sash.horizontal')
				&& !e.target.closest('.part.sessionspart') && !e.target.closest('.part.editor');
		}, true));
		const release = () => {
			if (this._pointerDown) {
				this._pointerDown = false;
				// Where the drag lets go, the chat settles at the input or the conversation.
				this._decide(false, true);
			}
		};
		// A pointer that is lost (such as when the window loses focus) must not leave the press stuck.
		const targetWindow = getWindow(container);
		for (const type of [EventType.POINTER_UP, 'pointercancel', EventType.DRAG_END]) {
			this._register(addDisposableListener(targetWindow, type, release, true));
		}
		this._register(addDisposableListener(targetWindow, EventType.BLUR, release));

		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TOGGLE_STACKED_CHAT_CONVERSATION_COMMAND_ID,
					title: localize2('toggleStackedChatConversation', "Toggle Chat Conversation Below Editor"),
					category: SessionsCategories.Sessions,
					f1: true,
					precondition: ContextKeyExpr.and(DesktopLayoutContext, IsPhoneLayoutContext.negate(), CustomViewVisibleContext.negate(), IsAuxiliaryWindowContext.negate(), ContextKeyExpr.has(ChatWindowContext.key).negate(), SessionLayoutModeContext.isEqualTo(SessionLayoutMode.Stacked)),
				});
			}

			override run(): void {
				that.toggleConversation();
			}
		}));
	}

	/** The keyboard's way to drag the chat down to its input, or back up to its conversation. */
	toggleConversation(): void {
		const view = this._view;
		if (view) {
			this._forcedByWindow = false;
			view.setInputOnly(!view.inputOnly.get());
		}
	}

	private _attach(sessionView: SessionView, view: AbstractChatView): IDisposable {
		const store = new DisposableStore();
		this._view = view;
		this._forcedByWindow = false;

		view.enableInputOnly({ maxHeight: STACKED_CHAT_INPUT_MAX_HEIGHT, inputOnly: this._layoutMode.getInputOnly() });
		// The chat view is reused for the next chat of its kind, which shows only its input as it was last left.
		let attachedOwner = this._layoutMode.focusedOwner.get();
		store.add(autorun(reader => {
			const owner = this._layoutMode.focusedOwner.read(reader);
			if (!owner || (attachedOwner && chatLayoutOwnersEqual(owner, attachedOwner))) {
				return;
			}
			attachedOwner = owner;
			this._forcedByWindow = false;
			view.setInputOnly(this._layoutMode.getInputOnly());
		}));
		// Showing only the input, the chat shows no session header either, and is sized to what it shows: the views around
		// it keep no minimum height of their own, which would overflow the part and scroll it.
		store.add(autorun(reader => {
			const inputOnly = view.inputOnly.read(reader);
			sessionView.setHeaderHidden(inputOnly);
			sessionView.setSizedByHost(inputOnly);
		}));

		// Measured while it shows only the input: with the conversation, the session header shows above the input too.
		let measured = 0;
		this._inputOnlyHeight = debouncedObservable(derived(this, reader => {
			const height = view.inputOnlyHeight.read(reader);
			if (view.inputOnly.read(reader) || !measured) {
				measured = height ? height + sessionView.primaryChatViewTop.read(reader) : 0;
			}
			return measured;
		}), 0);
		const inputOnlyHeight = this._inputOnlyHeight;

		// Dragged down, the chat stops where it shows only its input; while it needs its conversation, above it.
		store.add(autorun(reader => {
			const height = inputOnlyHeight.read(reader);
			if (!height) {
				return;
			}
			const collapsed = height + this._sessionsPartService.chromeHeight;
			const minimum = view.canShowInputOnly.read(reader) ? collapsed : collapsed + STACKED_CHAT_CONVERSATION_MIN_HEIGHT;
			const inputOnly = view.inputOnly.read(reader);
			// Showing only its input, the chat keeps its height as the window resizes, rather than growing to be sized back.
			// Not dragged, it is sized to its input in the same layout as its new limits, such as as the input wraps to
			// another line, rather than in a second one: the switch below then finds it sized.
			this._setHeightConstraints({ minimum, maximum: Number.POSITIVE_INFINITY, keepHeight: inputOnly }, inputOnly && !this._sizing ? collapsed : undefined);
		}));

		// Switched to, rather than dragged to: sized to the input, or to the conversation as the user last left it.
		let wasInputOnly: boolean | undefined;
		store.add(autorun(reader => {
			const inputOnly = view.inputOnly.read(reader);
			const height = inputOnlyHeight.read(reader);
			const previous = wasInputOnly;
			wasInputOnly = inputOnly;
			if (previous !== undefined && previous !== inputOnly) {
				this._layoutMode.setInputOnly(stackedChatPersistedInputOnly({ inputOnly, forcedByWindow: this._forcedByWindow, lastUserChoice: this._layoutMode.getInputOnly() }));
			}
			if (!height || this._sizing || (previous === inputOnly && !inputOnly)) {
				return;
			}
			const collapsed = height + this._sessionsPartService.chromeHeight;
			const conversation = Math.max(this._conversationHeight ?? Math.round(this._columnHeight() / 2), collapsed + STACKED_CHAT_CONVERSATION_MIN_HEIGHT);
			this._setHeight(inputOnly ? collapsed : conversation);
		}));

		store.add(this._sessionsPartService.onDidLayout(() => {
			if (this._sizing) {
				return;
			}
			if (this._pointerDown) {
				this._decide(true, true);
			} else {
				this._afterLayout.schedule();
			}
		}));

		// Last, so that the autoruns above stop before the view is reset: resetting it is not the focused chat's choice.
		store.add(toDisposable(() => {
			this._afterLayout.cancel();
			this._view = undefined;
			view.disableInputOnly();
			sessionView.setHeaderHidden(false);
			sessionView.setSizedByHost(false);
			this._inputOnlyHeight = constObservable(0);
			// The chat attached next, such as on a session switch, takes the constraints over rather than laying out twice.
			queueMicrotask(() => {
				if (!this._view) {
					this._setHeightConstraints(undefined);
				}
			});
		}));
		return store;
	}

	/**
	 * While the chat keeps its height, the editor above it takes the resizes of their column instead. Set first, so that
	 * the layout the constraints and `height` cause already resizes by it.
	 */
	private _setHeightConstraints(constraints: ISessionsPartHeightConstraints | undefined, height?: number): void {
		const editorPart = this._editorGroupsService.mainPart;
		if (editorPart instanceof MainEditorPart) {
			editorPart.setTakesStackedColumnResizes(!!constraints?.keepHeight);
		}
		this._sessionsPartService.setHeightConstraints(constraints, height);
	}

	private _collapsedHeight(): number {
		return this._inputOnlyHeight.get() + this._sessionsPartService.chromeHeight;
	}

	/** The height of the column of the side pane and the chat. */
	private _columnHeight(): number {
		return this._layoutService.getSize(Parts.SESSIONS_PART).height + this._layoutService.getSize(Parts.EDITOR_PART).height;
	}

	private _setHeight(height: number): void {
		const { width, height: current } = this._layoutService.getSize(Parts.SESSIONS_PART);
		if (height === current) {
			return;
		}
		this._sizing = true;
		try {
			this._layoutService.setSize(Parts.SESSIONS_PART, { width, height });
		} finally {
			this._sizing = false;
		}
	}

	/** At the bottom, where dragging the chat down stops, it shows only its input; taller, its conversation. */
	private _decide(dragging: boolean, byUser: boolean): void {
		const view = this._view;
		if (!view || !this._inputOnlyHeight.get() || this._sizing) {
			return;
		}
		const groupHeight = this._layoutService.getSize(Parts.SESSIONS_PART).height;
		const collapsedHeight = this._collapsedHeight();
		const { inputOnly, settleHeight } = decideStackedChatInputOnly({ groupHeight, collapsedHeight, conversationMinHeight: STACKED_CHAT_CONVERSATION_MIN_HEIGHT, dragging });
		if (!dragging && !inputOnly) {
			this._conversationHeight = settleHeight ?? groupHeight;
		}
		this._forcedByWindow = stackedChatForcedByWindow({ wasForced: this._forcedByWindow, wasInputOnly: view.inputOnly.get(), inputOnly, byUser });
		this._sizing = true;
		try {
			if (inputOnly !== view.inputOnly.get()) {
				view.setInputOnly(inputOnly);
			}
		} finally {
			this._sizing = false;
		}
		if (settleHeight !== undefined) {
			this._setHeight(settleHeight);
		}
	}

	/** Resized otherwise than by the user's drag: the chat keeps what it shows, at a height that shows it. */
	private _clampOnResize(): void {
		const view = this._view;
		if (!view || !this._inputOnlyHeight.get()) {
			return;
		}
		const groupHeight = this._layoutService.getSize(Parts.SESSIONS_PART).height;
		const collapsedHeight = this._collapsedHeight();
		const inputOnly = view.inputOnly.get();
		if (!inputOnly && !stackedChatConversationFits({ groupHeight, collapsedHeight, conversationMinHeight: STACKED_CHAT_CONVERSATION_MIN_HEIGHT, editorHeight: this._layoutService.getSize(Parts.EDITOR_PART).height, editorMinimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height })) {
			// The editor gave way down to its minimum: the chat shows only its input until the window grows again.
			this._forcedByWindow = true;
			this._sizing = true;
			try {
				view.setInputOnly(true);
			} finally {
				this._sizing = false;
			}
			this._setHeight(collapsedHeight);
			return;
		}
		const height = clampStackedChatOnResize({ groupHeight, collapsedHeight, conversationMinHeight: STACKED_CHAT_CONVERSATION_MIN_HEIGHT, inputOnly });
		if (height !== undefined) {
			this._setHeight(height);
		}
	}

	/** The window grew: a chat that showed only its input because the window was too short shows its conversation again. */
	private _restoreConversation(): boolean {
		const view = this._view;
		if (!view || !this._forcedByWindow || !view.inputOnly.get() || !this._inputOnlyHeight.get()) {
			return false;
		}
		const restore = shouldRestoreStackedChatConversation({
			forcedByWindow: true,
			groupHeight: this._layoutService.getSize(Parts.SESSIONS_PART).height,
			collapsedHeight: this._collapsedHeight(),
			conversationMinHeight: STACKED_CHAT_CONVERSATION_MIN_HEIGHT,
			editorHeight: this._layoutService.getSize(Parts.EDITOR_PART).height,
			editorMinimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height,
		});
		if (restore) {
			this._forcedByWindow = false;
			view.setInputOnly(false);
		}
		return restore;
	}
}
