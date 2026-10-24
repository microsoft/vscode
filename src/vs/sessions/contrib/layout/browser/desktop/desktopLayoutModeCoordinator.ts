/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { TERMINAL_VIEW_ID } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { registerSessionLayoutModeActions } from '../../../../browser/sessionLayoutModeActions.js';
import { maximizeMainEditorPart, restoreMainEditorPart } from '../../../../browser/mainEditorMaximize.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { chatLayoutOwnersEqual, IChatLayoutOwner } from '../../../../common/chatLayout.js';
import { CustomViewVisibleContext, DesktopLayoutContext, IsPhoneLayoutContext, SessionActivityBarLayoutActionsContext } from '../../../../common/contextkeys.js';
import { SessionLayoutMode, SessionLayoutModeContext, SessionSplitLayout, SessionSplitLayoutContext } from '../../../../common/sessionLayoutMode.js';
import { ChatWindowContext, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { getLayoutModeOwnerKind, IRememberedLayoutMode, ISessionLayoutModeService, LayoutModeOwnerKind } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IDesktopLayoutContext } from './desktopLayoutStrategy.js';

/** The commands that show a layout mode in the main window. */
export const MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS: Readonly<Record<SessionLayoutMode, string>> = {
	[SessionLayoutMode.ChatOnly]: 'workbench.action.agentSessions.layout.showChatOnly',
	[SessionLayoutMode.EditorOnly]: 'workbench.action.agentSessions.layout.showEditorOnly',
	[SessionLayoutMode.Stacked]: 'workbench.action.agentSessions.layout.showStacked',
	[SessionLayoutMode.SideBySide]: 'workbench.action.agentSessions.layout.showSideBySide',
};

interface IFocusedOwner {
	readonly owner: IChatLayoutOwner;
	readonly kind: LayoutModeOwnerKind;
}

/**
 * The layout mode of the main window: chat only while the side pane is closed, editor only while the editor area is
 * maximized, and otherwise the side pane's arrangement with the chat, stacked or side by side.
 *
 * The mode is remembered for the focused chat through {@link ISessionLayoutModeService}, and restored as another chat
 * gets focus: its arrangement, and whether its editor area is maximized. Whether its side pane is open stays with the
 * layout strategies, which never reveal a closed side pane on a focus change; a chat returning from a chat window is
 * shown in its full mode, as that is the user's explicit choice. With several chat surfaces shown, the mode is
 * window-global and focus changes neither restore nor remember it.
 */
export class DesktopLayoutModeCoordinator extends Disposable {

	/** The mode the main window shows. */
	readonly mode: IObservable<SessionLayoutMode>;
	readonly splitLayout: IObservable<SessionSplitLayout>;

	private readonly _focusedOwner: IObservable<IFocusedOwner | undefined>;
	/** The chat of the main window that is focused, whose layout mode the window shows and remembers. */
	readonly focusedOwner: IObservable<IChatLayoutOwner | undefined>;
	/** The chat that just returned from a chat window, to show in its full mode once it is focused. */
	private _returning: IFocusedOwner | undefined;

	constructor(
		private readonly _ctx: IDesktopLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionLayoutModeService private readonly _layoutModeService: ISessionLayoutModeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IChatWindowService chatWindowService: IChatWindowService,
	) {
		super();

		const layoutChanged = observableSignalFromEvent(this, Event.any<unknown>(
			this._layoutService.onDidChangePartVisibility,
			this._layoutService.onDidToggleSidePane,
			this._layoutService.onDidChangeEditorMaximized,
			this._layoutService.onDidChangeSidePaneArrangement,
		));
		this.splitLayout = derived(this, reader => {
			layoutChanged.read(reader);
			return this._layoutService.getSidePaneArrangement();
		});
		this.mode = derived(this, reader => {
			layoutChanged.read(reader);
			if (this._layoutService.isEditorMaximized()) {
				return SessionLayoutMode.EditorOnly;
			}
			return this._layoutService.isSidePaneVisible() ? this._layoutService.getSidePaneArrangement() : SessionLayoutMode.ChatOnly;
		});
		this._focusedOwner = derived(this, reader => {
			const session = sessionsService.mainWindowActiveSession.read(reader);
			const chat = session?.activeChat.read(reader);
			return session && chat ? { owner: { sessionResource: session.resource, chatResource: chat.resource }, kind: getLayoutModeOwnerKind(session, reader) } : undefined;
		});
		this.focusedOwner = derived(this, reader => this._focusedOwner.read(reader)?.owner);

		const modeContext = SessionLayoutModeContext.bindTo(contextKeyService);
		const splitLayoutContext = SessionSplitLayoutContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			modeContext.set(this.mode.read(reader));
			splitLayoutContext.set(this.splitLayout.read(reader));
		}));

		let applied: IFocusedOwner | undefined;
		this._register(autorun(reader => {
			const focused = this._focusedOwner.read(reader);
			const mode = this.mode.read(reader);
			const splitLayout = this.splitLayout.read(reader);
			if (!focused || !this._isOwnerScoped(reader)) {
				return;
			}
			if (!applied || !chatLayoutOwnersEqual(applied.owner, focused.owner) || applied.kind !== focused.kind) {
				applied = focused;
				// Applied for the newly focused chat, before the layout strategies restore its side pane.
				this._restore(focused);
				return;
			}
			if (this._ctx.isRestoringSessionLayout) {
				return;
			}
			const previous = this._layoutModeService.getMainWindowMode(focused.owner, focused.kind);
			this._layoutModeService.setMainWindowMode(focused.owner, focused.kind, { mode, splitLayout, inputOnly: previous?.inputOnly ?? false });
		}));
		// What a restore settles on is the focused chat's mode.
		this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
			const focused = this._focusedOwner.get();
			if (focused && this._isOwnerScoped(undefined)) {
				const previous = this._layoutModeService.getMainWindowMode(focused.owner, focused.kind);
				this._layoutModeService.setMainWindowMode(focused.owner, focused.kind, { mode: this.mode.get(), splitLayout: this.splitLayout.get(), inputOnly: previous?.inputOnly ?? false });
			}
		}));

		this._registerChatWindowReturns(chatWindowService);

		this._register(registerSessionLayoutModeActions({
			ids: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS,
			// The main window's, not a chat window's, which has its own.
			precondition: ContextKeyExpr.and(DesktopLayoutContext, IsPhoneLayoutContext.negate(), CustomViewVisibleContext.negate(), IsAuxiliaryWindowContext.negate(), ContextKeyExpr.has(ChatWindowContext.key).negate())!,
			// Not in the Session Activity Bar of a chat window, which shows the chat window's modes, if any.
			activityBarWhen: ContextKeyExpr.and(SessionActivityBarLayoutActionsContext, ContextKeyExpr.has(ChatWindowContext.key).negate()),
			run: (_accessor, mode) => this.setMode(mode),
		}));
	}

	/** Whether focus changes restore and remember the mode: one chat surface shown, outside phone layouts and custom views. */
	private _isOwnerScoped(reader: IReader | undefined): boolean {
		const multiple = reader ? this._ctx.multipleChatsVisibleObs.read(reader) || this._ctx.multipleSessionsVisibleObs.read(reader) : this._ctx.multipleChatsVisibleObs.get() || this._ctx.multipleSessionsVisibleObs.get();
		return !multiple && !isPhoneLayout(this._layoutService) && !this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART);
	}

	private _restore(focused: IFocusedOwner): void {
		const returning = this._returning;
		this._returning = undefined;
		if (returning && chatLayoutOwnersEqual(returning.owner, focused.owner)) {
			const remembered = this._layoutModeService.returnToMainWindow(focused.owner, focused.kind);
			if (remembered) {
				this.setMode(remembered.mode, remembered);
			}
			return;
		}
		const remembered = this._layoutModeService.getMainWindowMode(focused.owner, focused.kind);
		if (!remembered) {
			return;
		}
		this._layoutService.setSidePaneArrangement(remembered.splitLayout);
		// Synchronously, before the layout strategies restore the chat's side pane, which un-maximizing would overwrite.
		const maximized = this._layoutService.isEditorMaximized();
		if ((remembered.mode === SessionLayoutMode.EditorOnly) !== maximized) {
			if (maximized) {
				restoreMainEditorPart(this._layoutService);
			} else {
				maximizeMainEditorPart(this._layoutService, this._viewsService.isViewVisible(TERMINAL_VIEW_ID));
			}
		}
	}

	/** Whether the focused chat, stacked below the editor, shows only its input, as it was last left. */
	getInputOnly(): boolean {
		const focused = this._focusedOwner.get();
		return focused ? this._layoutModeService.getMainWindowMode(focused.owner, focused.kind)?.inputOnly ?? false : false;
	}

	/** Remembers whether the focused chat, stacked below the editor, shows only its input. */
	setInputOnly(inputOnly: boolean): void {
		const focused = this._focusedOwner.get();
		if (focused && this._isOwnerScoped(undefined)) {
			this._layoutModeService.setMainWindowMode(focused.owner, focused.kind, { mode: this.mode.get(), splitLayout: this.splitLayout.get(), inputOnly });
		}
	}

	/** Shows `mode` in the main window, through the same operations as its other layout actions. */
	setMode(mode: SessionLayoutMode, remembered?: IRememberedLayoutMode): void {
		if (this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
			return;
		}
		if (mode === SessionLayoutMode.EditorOnly) {
			if (remembered) {
				this._layoutService.setSidePaneArrangement(remembered.splitLayout);
			}
			if (!this._layoutService.isEditorMaximized()) {
				maximizeMainEditorPart(this._layoutService, this._viewsService.isViewVisible(TERMINAL_VIEW_ID));
			}
			return;
		}
		if (this._layoutService.isEditorMaximized()) {
			restoreMainEditorPart(this._layoutService);
		}
		if (mode === SessionLayoutMode.ChatOnly) {
			if (remembered) {
				this._layoutService.setSidePaneArrangement(remembered.splitLayout);
			}
			if (this._layoutService.isSidePaneVisible()) {
				this._layoutService.toggleSidePane();
			}
			return;
		}
		this._layoutService.setSidePaneArrangement(mode);
		if (!this._layoutService.isSidePaneVisible()) {
			// Reopens the chat's last side pane; a side pane with nothing to show stays closed.
			this._layoutService.toggleSidePane();
		}
	}

	/** Remembers which chat each chat window shows, so that the chat is shown in its full mode as it returns. */
	private _registerChatWindowReturns(chatWindowService: IChatWindowService): void {
		const owners = new Map<IChatWindow, IFocusedOwner>();
		this._register(autorun(reader => {
			const windows = chatWindowService.windows.read(reader);
			for (const window of windows) {
				const session = window.session.read(reader);
				const chat = session?.activeChat.read(reader);
				if (session && chat) {
					owners.set(window, { owner: { sessionResource: session.resource, chatResource: chat.resource }, kind: getLayoutModeOwnerKind(session, reader) });
				}
			}
			for (const [window, returning] of owners) {
				if (windows.includes(window)) {
					continue;
				}
				owners.delete(window);
				const focused = this._focusedOwner.read(undefined);
				if (focused && chatLayoutOwnersEqual(focused.owner, returning.owner)) {
					// Already focused in the main window: no focus change follows to show it.
					const remembered = this._layoutModeService.returnToMainWindow(returning.owner, returning.kind);
					if (remembered && this._isOwnerScoped(undefined)) {
						this.setMode(remembered.mode, remembered);
					}
				} else {
					this._returning = returning;
				}
			}
		}));
	}
}
