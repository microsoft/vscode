/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { registerSessionLayoutModeActions } from '../../../../browser/sessionLayoutModeActions.js';
import { restoreMainEditorPart } from '../../../../browser/mainEditorMaximize.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { chatLayoutOwnersEqual, IChatLayoutOwner } from '../../../../common/chatLayout.js';
import { CustomViewVisibleContext, DesktopLayoutContext, IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
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

/** Side by side in the center panel alignment, the share of its column the panel keeps alone, and the least it keeps. */
const PANEL_ONLY_WIDTH_RATIO = 0.4;
const PANEL_ONLY_MIN_WIDTH = 320;

/** The commands of the toggles of the main window's Layout menu: Show Chat, Show Editor, and Stacked. */
export const MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS = {
	chat: 'workbench.action.agentSessions.layout.toggleChat',
	editor: 'workbench.action.agentSessions.layout.toggleEditor',
	stacked: 'workbench.action.agentSessions.layout.toggleStacked',
} as const;

/** The sizes of the editor and the panel before the chat was hidden in the center panel alignment. */
export interface ICenterSizesBeforeChatHidden {
	readonly editor: IDimension;
	readonly panel: IDimension;
}

/**
 * Restores the sizes from before the chat was hidden in the center panel alignment, as the chat shows again, only in
 * the dimension hiding it changed. Stacked, the heights of the editor and the panel in the chat's column; side by side,
 * the width of the chat's column, which the editor beside it gives or takes. The other dimension is the window's,
 * which may have changed since; restoring it would resize the grid's other parts, such as the sidebar.
 */
export function restoreCenterSizes(layoutService: Pick<IAgentWorkbenchLayoutService, 'getSize' | 'setSize' | 'isVisible'>, arrangement: SessionSplitLayout, sizes: ICenterSizesBeforeChatHidden): void {
	if (arrangement === SessionLayoutMode.Stacked) {
		layoutService.setSize(Parts.EDITOR_PART, { width: layoutService.getSize(Parts.EDITOR_PART).width, height: sizes.editor.height });
		// The panel may have been hidden since, such as by the session switched to.
		if (layoutService.isVisible(Parts.PANEL_PART)) {
			layoutService.setSize(Parts.PANEL_PART, { width: layoutService.getSize(Parts.PANEL_PART).width, height: sizes.panel.height });
		}
	} else {
		layoutService.setSize(Parts.SESSIONS_PART, { width: sizes.panel.width, height: layoutService.getSize(Parts.SESSIONS_PART).height });
	}
}

interface IFocusedOwner {
	readonly owner: IChatLayoutOwner;
	readonly kind: LayoutModeOwnerKind;
}

/**
 * The layout mode of the main window: chat only while the side pane is closed, editor only while the editor area is
 * maximized, and otherwise the side pane's arrangement with the chat, stacked or side by side.
 *
 * The mode is remembered for the focused chat through {@link ISessionLayoutModeService}, and restored as another chat
 * gets focus: its arrangement, and whether its chat is hidden. Whether its side pane is open stays with the layout
 * strategies, which never reveal a closed side pane on a focus change, except that a chat remembered in editor only
 * reopens it as the chat last left it; a chat returning from a chat window is shown in its full mode, as that is the
 * user's explicit choice. With several chat surfaces shown, the mode is
 * window-global and focus changes neither restore nor remember it.
 */
export class DesktopLayoutModeCoordinator extends Disposable {

	/** The mode the main window shows. */
	readonly mode: IObservable<SessionLayoutMode>;
	readonly splitLayout: IObservable<SessionSplitLayout>;

	private readonly _focusedOwner: IObservable<IFocusedOwner | undefined>;
	/** The chat of the main window that is focused, whose layout mode the window shows and remembers. */
	readonly focusedOwner: IObservable<IChatLayoutOwner | undefined>;
	/** The sizes of the editor and the panel before the chat was hidden in the center panel alignment, and their arrangement. */
	private _sizesBeforeChatHidden: { readonly sizes: ICenterSizesBeforeChatHidden; readonly arrangement: SessionSplitLayout } | undefined;
	/** The width the panel was left at alone in its column, side by side in the center panel alignment. */
	private _panelOnlyWidth: number | undefined;
	/** The chat that just returned from a chat window, to show in its full mode once it is focused. */
	private _returning: IFocusedOwner | undefined;

	constructor(
		private readonly _ctx: IDesktopLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionLayoutModeService private readonly _layoutModeService: ISessionLayoutModeService,
		@IContextKeyService contextKeyService: IContextKeyService,
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
			// Editor only hides the chat; a maximized editor area hides it too.
			if (this._layoutService.isEditorMaximized() || (this._isChatHidden() && this._layoutService.isSidePaneVisible())) {
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
			toggleIds: MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS,
			// Not in the Layout menu of a chat window, which shows the chat window's toggles, if any.
			menuWhen: ContextKeyExpr.and(DesktopLayoutContext, IsPhoneLayoutContext.negate(), IsAuxiliaryWindowContext.negate(), ContextKeyExpr.has(ChatWindowContext.key).negate())!,
			current: () => ({ mode: this.mode.get(), splitLayout: this.splitLayout.get() }),
			run: (_accessor, mode) => this.setMode(mode),
			setSplitLayout: (_accessor, splitLayout) => this.setSplitLayout(splitLayout),
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
		// Synchronously, before the layout strategies restore the chat's side pane.
		if (remembered.mode === SessionLayoutMode.EditorOnly) {
			this._showEditorOnly();
			return;
		}
		this._showChat();
	}

	/**
	 * Hides only the chat: the sessions list, the panel and the side pane's composition stay as they are. A closed side
	 * pane reopens as the chat last left it, through the side pane toggle, so that the layout strategies remember the
	 * chat's own composition rather than whatever part shows first.
	 */
	private _showEditorOnly(): void {
		if (this._layoutService.isEditorMaximized() || this._isChatHidden()) {
			return;
		}
		if (!this._layoutService.isSidePaneVisible()) {
			this._layoutService.toggleSidePane();
			if (!this._layoutService.isSidePaneVisible()) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		}
		this._hideChat();
	}

	/** Whether the chat (the Sessions Part) is hidden, rather than covered by a custom view. */
	private _isChatHidden(): boolean {
		return !this._layoutService.isVisible(Parts.SESSIONS_PART) && !this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART);
	}

	/**
	 * Hides the chat. In the center panel alignment, where the panel shares the chat's column, the editor takes the chat's
	 * room rather than the panel: stacked, the editor takes its height; side by side, the column of the panel narrows and
	 * the editor widens. The sizes before are restored as the chat shows again.
	 */
	private _hideChat(): void {
		const center = this._layoutService.getPanelAlignment() === 'center' && this._layoutService.isVisible(Parts.PANEL_PART);
		const editor = this._layoutService.getSize(Parts.EDITOR_PART);
		const chat = this._layoutService.getSize(Parts.SESSIONS_PART);
		const panel = this._layoutService.getSize(Parts.PANEL_PART);
		this._layoutService.setPartHidden(true, Parts.SESSIONS_PART);
		if (!center) {
			this._sizesBeforeChatHidden = undefined;
			return;
		}
		this._sizesBeforeChatHidden = { sizes: { editor, panel }, arrangement: this._layoutService.getSidePaneArrangement() };
		if (this._layoutService.getSidePaneArrangement() === SessionLayoutMode.Stacked) {
			this._layoutService.setSize(Parts.PANEL_PART, panel);
			this._layoutService.setSize(Parts.EDITOR_PART, { width: editor.width, height: editor.height + chat.height });
		} else {
			const panelWidth = Math.min(panel.width, this._panelOnlyWidth ?? Math.max(PANEL_ONLY_MIN_WIDTH, Math.round(panel.width * PANEL_ONLY_WIDTH_RATIO)));
			this._layoutService.setSize(Parts.PANEL_PART, { width: panelWidth, height: this._layoutService.getSize(Parts.PANEL_PART).height });
			this._layoutService.setSize(Parts.EDITOR_PART, { width: editor.width + panel.width - panelWidth, height: editor.height });
		}
	}

	/** Shows the chat: it may be hidden (Editor only), or hidden with the maximized editor area, which is restored. */
	private _showChat(): void {
		if (this._layoutService.isEditorMaximized()) {
			restoreMainEditorPart(this._layoutService);
		}
		if (!this._isChatHidden()) {
			return;
		}
		// Rearranged since, the sizes from before are another arrangement's: the grid lays the new one out.
		const saved = this._sizesBeforeChatHidden;
		this._sizesBeforeChatHidden = undefined;
		const sizes = saved?.arrangement === this._layoutService.getSidePaneArrangement() ? saved.sizes : undefined;
		const centerSideBySide = this._layoutService.getPanelAlignment() === 'center' && this._layoutService.getSidePaneArrangement() === SessionLayoutMode.SideBySide && this._layoutService.isVisible(Parts.PANEL_PART);
		if (centerSideBySide) {
			// The width the panel was left at alone in its column, for the next time.
			this._panelOnlyWidth = this._layoutService.getSize(Parts.PANEL_PART).width;
		}
		this._layoutService.setPartHidden(false, Parts.SESSIONS_PART);
		if (sizes && this._layoutService.getPanelAlignment() === 'center') {
			restoreCenterSizes(this._layoutService, this._layoutService.getSidePaneArrangement(), sizes);
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

	/**
	 * Arranges the chat and the editor as `splitLayout`: at once while both show, else the next time both show, without
	 * showing the one that is hidden. Either way it is remembered for the focused chat, as the window shows it.
	 */
	setSplitLayout(splitLayout: SessionSplitLayout): void {
		if (this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
			return;
		}
		const mode = this.mode.get();
		if (mode === SessionLayoutMode.Stacked || mode === SessionLayoutMode.SideBySide) {
			this.setMode(splitLayout);
			return;
		}
		this._layoutService.setSidePaneArrangement(splitLayout);
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
			this._showEditorOnly();
			return;
		}
		this._showChat();
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
