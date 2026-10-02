/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { DesktopOwnerCompositionStore } from './desktopOwnerCompositionStore.js';

/**
 * Shared controller state that desktop layout strategies read/coordinate
 * through. Implemented by the desktop layout controller; the concrete
 * services each strategy needs are injected into the strategy directly via DI.
 */
export interface IDesktopLayoutContext {
	/** `> 0` while a session-switch layout restore is in progress. */
	readonly isRestoringSessionLayout: boolean;
	/** Runs `work` while a session-switch layout restore is held. */
	withSessionLayoutRestore(work: () => void | Promise<unknown>): void;
	/** Fires when a session-switch layout restore fully settles, so strategies reconcile off the settled state rather than the transient changes during the restore. */
	readonly onDidEndSessionLayoutRestore: Event<void>;
	/** `true` while the whole side pane (editor + aux bar) is being toggled together. */
	readonly togglingSidePane: boolean;
	readonly multipleSessionsVisibleObs: IObservable<boolean>;
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	hasSavedWorkingSet(sessionResource: URI): boolean;
	completeChangesEditorTransition(): void;
	/** [R1/R13] Whether `sessions.experimental.chatSpecificLayout` is in effect for the current (desktop, non-suspended) presentation. Pass `reader` from inside a derive/autorun so a phone transition reactively re-evaluates it. */
	chatLayoutActive(reader?: IReader): boolean;
	/** [R2/R5/R13] Resolves the chat-layout owner key (main chat maps to the session resource unchanged) for a session's currently active chat. Returns `undefined` while {@link chatLayoutActive} is `false`. */
	ownerKeyFor(session: IActiveSession, reader?: IReader): URI | undefined;
	/** [R5] Each owner's remembered last-open side-pane (Editor/Details) composition. Only consulted while {@link chatLayoutActive}. */
	readonly compositionStore: DesktopOwnerCompositionStore;
}

/**
 * Base class for a desktop layout behaviour, owning its own disposables.
 *
 * Exactly two concrete strategies extend this — one per session lifecycle stage:
 * {@link import('./desktopDraftSessionStrategy.js').DesktopDraftSessionStrategy} (workspace-backed
 * and workspace-less drafts) and {@link import('./desktopExistingSessionStrategy.js').DesktopExistingSessionStrategy}
 * (a created, workspace-backed session). Each owns the full vertical slice of behaviour for its stage:
 * side-pane visibility, the detail-panel (Changes/Files) mapping, and — for the two workspace
 * stages — the managed docked tabs and detail-only editor-area collapse.
 *
 * Shared mechanics (the managed-tabs reconcile pipeline + editor-area collapse and the Existing
 * Editor-visibility-profile storage) live in non-strategy coordinator classes in this
 * folder — see `desktopDockedTabsCoordinator.ts`, `desktopDetailPanelCoordinator.ts`, and
 * `desktopVisibilityProfileStore.ts`. The shared detail coordinator owns only content selection
 * and context publication; each lifecycle strategy owns Auxiliary Bar visibility. The shared mechanics are owned by
 * {@link import('./desktopExistingSessionStrategy.js').DesktopExistingSessionStrategy}
 * (the docked-tabs coordinator, since its reconcile pipeline is shared across the New→Existing
 * submit transition) or by the controller (the visibility-profile store, since it backs one
 * combined storage blob for both workspace stages).
 */
export abstract class DesktopLayoutStrategy extends Disposable {
	constructor(protected readonly _ctx: IDesktopLayoutContext) {
		super();
	}
}
