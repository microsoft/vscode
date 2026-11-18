/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChat, ISession } from '../common/session.js';
import { ISelectNoWorkspaceOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../common/workspaceSelection.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IAgentsWindowDraft } from '../../../../platform/window/common/window.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { Event } from '../../../../base/common/event.js';
import { Direction, ISerializedGrid } from '../../../../base/browser/ui/grid/grid.js';
import { IObservable } from '../../../../base/common/observable.js';
import type { ISessionHost } from './sessionHost.js';
import type { ISessionGridPane } from './sessionGridPane.js';
import { ISessionGridPlacement } from '../../../browser/parts/sessions/sessionGridState.js';

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
	/** The host of the session the view shows. */
	readonly host: ISessionHost;
	/** The pane of the grid it shows, while it shows one. */
	readonly pane: IObservable<ISessionGridPane | undefined>;

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

	/** The provider's session the pane it shows shows. */
	getSession(): ISession | undefined;
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
	readonly session: ISession;
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
	updatePanes(panes: readonly ISessionGridPane[], activePane: ISessionGridPane | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void;

	getGridLayout(): ISerializedGrid | undefined;
	/** The pane at `index` in visual grid order (`-1` for the last), including the new-session slot's, or `undefined` if absent. */
	getPaneAtPosition(index: number): ISessionGridPane | undefined;
	/** The pane next to `pane` in `direction`, or `undefined` if there is none. */
	getNeighborPane(pane: ISessionGridPane, direction: Direction): ISessionGridPane | undefined;
	/** The view of the grid slot of `pane`. */
	getViewOfPane(pane: ISessionGridPane): ISessionView | undefined;
	getSessionPlacement(sessionId: string): { readonly sessionId: string | undefined; readonly direction: Direction } | undefined;
	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void;
	/** Resizes the view of `pane` by `amount` in `direction`. */
	resizePane(pane: ISessionGridPane, direction: Direction, amount: number): void;
	readonly onDidInteractWithGrid: Event<void>;

	/**
	 * Controls whether mounted session views may render independently of the part's grid visibility.
	 */
	setContentVisible(visible: boolean): void;

	/**
	 * Fires with the id of the grid slot whose view receives focus, which is the id of its pane, including the new-session
	 * slot's. The sessions service makes that pane the active one.
	 */
	readonly onDidFocusPane: Event<string>;

	/** Toggles the maximized state of the view of `pane` in the grid. */
	toggleMaximizePane(pane: ISessionGridPane): void;

	/**
	 * Fires after the maximized state of a session view was toggled via
	 * {@link toggleMaximizePane}. Does not fire when the call was a no-op
	 * (e.g. the pane was not in the grid or fewer than two views were present).
	 */
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent>;

	/**
	 * Moves keyboard focus into the placeholder (new-session) view, first revealing it in the grid when it is only
	 * partially visible. No-op if no new-session slot is currently mounted.
	 */
	focusNewSessionSlot(): void;

	/** Moves keyboard focus into the view of the grid slot of `pane`, first revealing it like {@link focusNewSessionSlot}. */
	focusPane(pane: ISessionGridPane): void;

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

	/** Moves keyboard focus into the view of the grid whose host is `host`, a pane's view, first revealing it in the grid. */
	focusViewOfHost(host: ISessionHost): void;

	/**
	 * The view of the grid's active pane: the pane commands without arguments act on while the main window is the
	 * focused host.
	 */
	getActiveSessionView(): ISessionView | undefined;

	/** The view of the grid whose host is `host`: a slot or a detached pane. `undefined` for other hosts, such as a chat window's. */
	getSessionViewOfHost(host: ISessionHost): ISessionView | undefined;

	/** The id of the grid slot whose view's host is `host`, which is the id of its pane. `undefined` for other hosts. */
	getPaneIdOfHost(host: ISessionHost): string | undefined;

	/**
	 * Returns the progress indicator for the sessions part, which drives the
	 * progress bar shown at the top of the part's content area.
	 */
	getProgressIndicator(): IProgressIndicator;
}
