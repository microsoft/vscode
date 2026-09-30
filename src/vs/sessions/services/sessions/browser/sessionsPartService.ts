/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { SessionView } from '../../../browser/parts/sessionView.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { Event } from '../../../../base/common/event.js';
import { Direction, ISerializedGrid } from '../../../../base/browser/ui/grid/grid.js';
import type { SessionsPart } from '../../../browser/parts/sessionsPart.js';
import { IAuxiliaryWindowOpenOptions } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import type { SessionGridDirection } from './sessionsService.js';

export interface ISessionDragTarget {
	readonly partId: string;
	readonly referenceSessionId: string | undefined;
	readonly direction: SessionGridDirection;
}

export interface ISessionDragHandlers {
	drop(sessions: readonly IActiveSession[], target: ISessionDragTarget): Promise<void>;
	openWindow(sessions: readonly IActiveSession[], bounds: { readonly x: number; readonly y: number }): Promise<void>;
}

export interface ISessionPartCloseEvent {
	readonly partId: string;
	readonly shutdown: boolean;
}

export interface ISessionGridPlacement {
	readonly reference: string;
	readonly direction: Direction;
}

export interface ISessionGridSlot {
	readonly id: string;
	readonly partId?: string;
	readonly placement?: ISessionGridPlacement;
}

export const MAIN_SESSIONS_PART = 'main';

export type SessionGridRequest = ({ readonly type: 'arrange' } | { readonly type: 'restore'; readonly grid: ISerializedGrid }) & { readonly partId?: string };

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

	getParts(): readonly SessionsPart[];
	getPart(partId: string): SessionsPart | undefined;
	getPartForWindow(targetWindow: Window): SessionsPart | undefined;
	createAuxiliaryPart(options?: IAuxiliaryWindowOpenOptions, partId?: string): Promise<SessionsPart>;
	getAuxiliaryWindowState(partId: string): IAuxiliaryWindowOpenOptions | undefined;
	closeAuxiliaryPart(partId: string): void;
	setAuxiliaryWindowCloseHandler(handler: (partId: string) => void): void;
	readonly onDidCloseAuxiliaryPart: Event<ISessionPartCloseEvent>;
	transferSessions(sessions: readonly IActiveSession[], targetPartId: string, commit: () => void): void;
	setSessionDragHandlers(handlers: ISessionDragHandlers): void;
	startSessionDrag(event: PointerEvent, element: HTMLElement, session: IActiveSession): void;
	flushState(): void;

	/**
	 * Reconciles the part's grid so it renders exactly the given visible
	 * sessions (and active session). Called by the view service whenever the
	 * visible sessions or active session change. The part is a passive renderer:
	 * it does not observe the model itself.
	 */
	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest, partId?: string): void;

	getGridLayout(partId?: string): ISerializedGrid | undefined;
	/** `null` identifies the empty composer; `undefined` means there is no neighbor. */
	getNeighborSession(sessionId: string | undefined, direction: Direction): IActiveSession | null | undefined;
	getSessionPlacement(sessionId: string): { readonly sessionId: string | undefined; readonly direction: Direction } | undefined;
	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void;
	readonly onDidInteractWithGrid: Event<string>;

	/**
	 * Controls whether mounted session views may render independently of the part's grid visibility.
	 */
	setContentVisible(visible: boolean): void;

	/**
	 * Fires with the session id of a focused grid slot, or undefined for the empty new-session slot.
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
	 * Returns the {@link SessionView} hosting the given session id, or the
	 * placeholder (new-session) view when `sessionId` is `undefined`. Returns
	 * `undefined` if no matching slot is currently mounted in the grid.
	 */
	getSessionView(sessionId: string | undefined): SessionView | undefined;

	/**
	 * Returns the session view that currently contains DOM focus.
	 */
	getFocusedSessionView(): SessionView | undefined;

	/**
	 * Returns the progress indicator for the sessions part, which drives the
	 * progress bar shown at the top of the part's content area.
	 */
	getProgressIndicator(): IProgressIndicator;
}
