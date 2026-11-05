/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { IChat, ISession } from '../common/session.js';
import { ISelectNoWorkspaceOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../common/workspaceSelection.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IAgentsWindowDraft } from '../../../../platform/window/common/window.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { Event } from '../../../../base/common/event.js';
import { Direction, ISerializedGrid } from '../../../../base/browser/ui/grid/grid.js';
import { IObservable } from '../../../../base/common/observable.js';

export interface ISessionGridPlacement {
	readonly reference: string;
	readonly direction: Direction;
}

export interface ISessionGridSlot {
	readonly id: string;
	readonly placement?: ISessionGridPlacement;
}

export type SessionGridRequest = { readonly type: 'arrange' } | { readonly type: 'restore'; readonly grid: ISerializedGrid };

/**
 * A session view hosted by the Sessions part, as seen by services and actions.
 * Implemented by the part's view; consumers must not depend on the concrete
 * view implementation.
 */
export interface ISessionView {
	focus(): void;
	focusWorkspacePicker(): void;
	focusHarnessPicker(): void;
	focusEnvironmentPicker(): void;
	focusBranchPicker(): void;
	focusWorktreePicker(): void;
	focusSyncAction(): void;
	openModelComparison(): void;

	/**
	 * Starts an inline rename of the session title in the header. Returns
	 * `false` when the header cannot host it so callers can fall back to
	 * another rename affordance.
	 */
	startTitleEditing(): boolean;
	startFocusedChatTitleEditing(): boolean;
	startChatTitleEditing(chatResource: URI): boolean;

	getSession(): IActiveSession | undefined;
	getFocusedChat(): IChat | undefined;
	getActiveChat(): IChat | undefined;
	reopenChat(resource: URI): Promise<void>;
	toggleActiveChatPin(): void;
	closeChatGroup(chatResource: URI): Promise<boolean>;

	selectWorkspace(folderUri: URI, options?: ISelectWorkspaceOptions): WorkspaceSelectionResult;
	applyDraft(draft: IAgentsWindowDraft, folderUri: URI | undefined, options: ISelectWorkspaceOptions, token: CancellationToken): Promise<WorkspaceSelectionResult>;
	selectNoWorkspace(options?: ISelectNoWorkspaceOptions): WorkspaceSelectionResult;

	/** Opens the given chat beside a reference chat, or the active group ("open to the side"). */
	openChatToSide(resource: URI, referenceChatResource?: URI): Promise<void>;
	/** Places a freshly created chat (e.g. a side chat) into its own group beside the current one. */
	splitChatToSide(resource: URI): void;
	focusAdjacentChatGroup(direction: 'previous' | 'next'): void;
	splitActiveChat(direction: 'right' | 'bottom'): void;
	moveActiveChatToAdjacentGroup(direction: 'previous' | 'next'): void;

	prefillInput(text: string): void;
	sendQuery(text: string): void;
	submitInput(): Promise<boolean>;
	/** Attaches the given resources as context to the active chat group's input. */
	attach(uris: URI[]): void;
}

export const ISessionsPartService = createDecorator<ISessionsPartService>('sessionsPartService');

/**
 * Payload for {@link ISessionsPartService.onDidToggleMaximizeSession}.
 */
export interface IToggleMaximizeSessionEvent {
	readonly session: IActiveSession;
	/** The session view's maximized state after the toggle. */
	readonly maximized: boolean;
}

export interface ISessionsPartService {
	readonly _serviceBrand: undefined;

	/** Number of chat surfaces currently shown across all visible session views. */
	readonly shownChatCount: IObservable<number>;

	/**
	 * Reconciles the part's grid so it renders exactly the given visible
	 * sessions (and active session). Called by the view service whenever the
	 * visible sessions or active session change. The part is a passive renderer:
	 * it does not observe the model itself.
	 */
	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void;

	getGridLayout(): ISerializedGrid | undefined;
	/** Returns a pane in visual grid order (`-1` for last), `null` for the composer, or `undefined` if absent. */
	getSessionAtPosition(index: number): IActiveSession | null | undefined;
	/** `null` identifies the empty composer; `undefined` means there is no neighbor. */
	getNeighborSession(sessionId: string | undefined, direction: Direction): IActiveSession | null | undefined;
	getSessionPlacement(sessionId: string): { readonly sessionId: string | undefined; readonly direction: Direction } | undefined;
	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void;
	readonly onDidInteractWithGrid: Event<void>;

	/**
	 * Controls whether mounted session views may render independently of the part's grid visibility.
	 */
	setContentVisible(visible: boolean): void;

	/**
	 * Fires with the session id, a standalone chat's grid slot id, or undefined for the empty new-session slot.
	 * The view service promotes that slot to active.
	 */
	readonly onDidFocusSession: Event<string | undefined>;

	/**
	 * Toggles the maximized state of the session view hosting the given session
	 * in the sessions part's grid.
	 */
	toggleMaximizeSession(session: IActiveSession | undefined): void;

	/**
	 * Fires after the maximized state of a session view was toggled via
	 * {@link toggleMaximizeSession}. Does not fire when the call was a no-op
	 * (e.g. the session was not visible or fewer than two views were present).
	 */
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent>;

	/**
	 * Moves keyboard focus into the chat input of the session view hosting the
	 * given session, or into the placeholder (new-session) view when `session`
	 * is `undefined`. No-op if no matching slot is currently mounted.
	 */
	focusSession(session: IActiveSession | undefined): void;

	/**
	 * Returns the {@link ISessionView} hosting the given session id, or the
	 * placeholder (new-session) view when `sessionId` is `undefined`. Returns
	 * `undefined` if no matching slot is currently mounted in the grid.
	 */
	/**
	 * The view that shows `session`: given the session itself, the view of the window that shows it, such as a window of its
	 * own; given its id, the main window's view of it, else the view of a window that shows it.
	 */
	getSessionView(session: string | ISession | undefined): ISessionView | undefined;

	/**
	 * Returns the session view that currently contains DOM focus.
	 */
	getFocusedSessionView(): ISessionView | undefined;

	/**
	 * Moves keyboard focus into the view that shows exactly `session`, such as a pane's session, first revealing it in the
	 * grid when it is only partially visible. No-op when the grid does not show it.
	 */
	focusSessionView(session: ISession): void;

	/**
	 * The view of the grid's active pane: the pane commands without arguments act on while the main window is the
	 * focused host.
	 */
	getActiveSessionView(): ISessionView | undefined;

	/**
	 * Returns the progress indicator for the sessions part, which drives the
	 * progress bar shown at the top of the part's content area.
	 */
	getProgressIndicator(): IProgressIndicator;
}
