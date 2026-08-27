/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';

/**
 * Shared controller state that single-pane layout strategies read/coordinate
 * through. Implemented by the single-pane layout controller; the concrete
 * services each strategy needs are injected into the strategy directly via DI.
 */
export interface ISinglePaneLayoutContext {
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
}

/**
 * Base class for a single-pane layout behaviour, owning its own disposables.
 *
 * Exactly three concrete strategies extend this — one per session lifecycle stage:
 * {@link import('./singlePaneNewSessionStrategy.js').SinglePaneNewSessionStrategy} (an
 * uncreated, workspace-backed draft), {@link import('./singlePaneExistingSessionStrategy.js').SinglePaneExistingSessionStrategy}
 * (a created, workspace-backed session), and {@link import('./singlePaneQuickChatStrategy.js').SinglePaneQuickChatStrategy}
 * (a workspace-less quick chat). Each owns the full vertical slice of behaviour for its stage:
 * side-pane visibility, the detail-panel (Changes/Files) mapping, and — for the two workspace
 * stages — the managed docked tabs and detail-only editor-area collapse.
 *
 * Shared mechanics (the managed-tabs reconcile pipeline + editor-area collapse and the Existing
 * Editor-visibility-profile storage) live in non-strategy coordinator classes in this
 * folder — see `singlePaneDockedTabsCoordinator.ts`, `singlePaneDetailPanelCoordinator.ts`, and
 * `singlePaneVisibilityProfileStore.ts`. The shared detail coordinator owns only content selection
 * and context publication; each lifecycle strategy owns Auxiliary Bar visibility. The shared mechanics are owned by
 * {@link import('./singlePaneExistingSessionStrategy.js').SinglePaneExistingSessionStrategy}
 * (the docked-tabs coordinator, since its reconcile pipeline is shared across the New→Existing
 * submit transition) or by the controller (the visibility-profile store, since it backs one
 * combined storage blob for both workspace stages).
 */
export abstract class SinglePaneLayoutStrategy extends Disposable {
	constructor(protected readonly _ctx: ISinglePaneLayoutContext) {
		super();
	}
}
