/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { isUserEdit } from '../../../../editor/common/textModelEditSource.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

/** Characters the user typed into one resource while `session` was active. */
export interface ITypedCharactersEntry {
	/**
	 * The session that was active while the characters were typed, captured at
	 * that moment so attribution does not depend on which session is active
	 * when the buffered batch is eventually reported.
	 */
	readonly session: IActiveSession;
	readonly resource: URI;
	readonly characters: number;
}

/** Buffered {@link ITypedCharactersEntry} plus the bookkeeping used to retry it. */
interface IPendingEntry {
	readonly session: IActiveSession;
	readonly resource: URI;
	characters: number;
	retries: number;
}

/** How long typed characters are buffered before they are reported. Exported for tests. */
export const TYPED_CHARACTERS_REPORT_DELAY = 5000;

/**
 * How often reporting an entry may be deferred before it is dropped. Bounds
 * how long typing is retained for a session whose workspace never resolves.
 * Exported for tests.
 */
export const MAX_TYPED_CHARACTERS_RETRIES = 3;

/**
 * Counts the characters the user manually types into the text models of this
 * window and reports them per resource and originating session.
 *
 * Only models of the window this tracker runs in are observed, which is what
 * scopes the counts to the Agents window: a regular window editing the same
 * folder has its own renderer with its own models and never reaches this
 * tracker.
 *
 * Typing produces one content change per keystroke, so counts are buffered and
 * reported in batches instead of on every change. The active session is still
 * captured per keystroke, so a batch reported after the user switched sessions
 * stays attributed to the session it was typed into.
 */
export class SessionsTypedCharactersTracker extends Disposable {

	private readonly _pending = new Map<string, IPendingEntry>();
	private readonly _modelListeners = this._register(new DisposableMap<ITextModel>());
	private readonly _reportScheduler: RunOnceScheduler;

	/**
	 * @param _report Consumes a batch and returns the entries it could not
	 * attribute yet, which are retried instead of being dropped.
	 */
	constructor(
		private readonly _getActiveSession: () => IActiveSession | undefined,
		private readonly _report: (entries: readonly ITypedCharactersEntry[]) => readonly ITypedCharactersEntry[],
		@IModelService modelService: IModelService,
	) {
		super();

		// Registered first so it runs before the scheduler is cancelled.
		this._register(toDisposable(() => this.flush()));
		this._reportScheduler = this._register(new RunOnceScheduler(() => this.flush(), TYPED_CHARACTERS_REPORT_DELAY));

		for (const model of modelService.getModels()) {
			this._trackModel(model);
		}
		this._register(modelService.onModelAdded(model => this._trackModel(model)));
		this._register(modelService.onModelRemoved(model => this._modelListeners.deleteAndDispose(model)));
	}

	/** Reports everything buffered so far, retaining whatever the consumer could not attribute yet. */
	flush(): void {
		if (this._pending.size === 0) {
			return;
		}
		const flushed = new Map(this._pending);
		this._pending.clear();

		for (const entry of this._report([...flushed.values()])) {
			const key = toKey(entry.session.sessionId, entry.resource);
			const deferred = flushed.get(key);
			if (!deferred || deferred.retries >= MAX_TYPED_CHARACTERS_RETRIES) {
				continue;
			}
			deferred.retries++;
			this._add(key, deferred);
		}

		if (this._pending.size > 0) {
			this._reportScheduler.schedule();
		}
	}

	private _trackModel(model: ITextModel): void {
		this._modelListeners.set(model, model.onDidChangeContent(e => this._handleContentChange(model, e)));
	}

	private _handleContentChange(model: ITextModel, e: IModelContentChangedEvent): void {
		const characters = countTypedCharacters(e);
		if (characters === 0) {
			return;
		}
		const session = this._getActiveSession();
		if (!session) {
			return;
		}
		this._add(toKey(session.sessionId, model.uri), { session, resource: model.uri, characters, retries: 0 });
		if (!this._reportScheduler.isScheduled()) {
			this._reportScheduler.schedule();
		}
	}

	private _add(key: string, entry: IPendingEntry): void {
		const existing = this._pending.get(key);
		if (existing) {
			existing.characters += entry.characters;
		} else {
			this._pending.set(key, entry);
		}
	}
}

function toKey(sessionId: string, resource: URI): string {
	return `${sessionId}\u0000${resource.toString()}`;
}

/**
 * Sums the characters inserted by manual typing in `e`, ignoring everything
 * the user did not type themselves (agent edits, accepted suggestions, paste,
 * undo/redo, …).
 *
 * `detailedReasons[i]` describes the next `detailedReasonsChangeLengths[i]`
 * entries of `changes`, so both lists are walked in lockstep.
 */
export function countTypedCharacters(e: IModelContentChangedEvent): number {
	if (e.isUndoing || e.isRedoing) {
		return 0;
	}
	let characters = 0;
	let changeIndex = 0;
	for (let i = 0; i < e.detailedReasons.length; i++) {
		const changeEnd = Math.min(changeIndex + e.detailedReasonsChangeLengths[i], e.changes.length);
		if (isUserEdit(e.detailedReasons[i])) {
			for (let j = changeIndex; j < changeEnd; j++) {
				characters += e.changes[j].text.length;
			}
		}
		changeIndex = changeEnd;
	}
	return characters;
}
