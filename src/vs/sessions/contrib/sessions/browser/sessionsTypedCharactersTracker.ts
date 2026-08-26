/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { isUserEdit } from '../../../../editor/common/textModelEditSource.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';

/** Characters the user typed into a single resource since the last report. */
export interface ITypedCharactersEntry {
	readonly resource: URI;
	readonly characters: number;
}

/** How long typed characters are buffered before they are reported. Exported for tests. */
export const TYPED_CHARACTERS_REPORT_DELAY = 5000;

/**
 * Counts the characters the user manually types into the text models of this
 * window and reports them per resource.
 *
 * Only models of the window this tracker runs in are observed, which is what
 * scopes the counts to the Agents window: a regular window editing the same
 * folder has its own renderer with its own models and never reaches this
 * tracker.
 *
 * Typing produces one content change per keystroke, so counts are buffered and
 * reported in batches instead of on every change.
 */
export class SessionsTypedCharactersTracker extends Disposable {

	private readonly _pending = new ResourceMap<number>();
	private readonly _modelListeners = this._register(new DisposableMap<ITextModel>());
	private readonly _reportScheduler: RunOnceScheduler;

	constructor(
		private readonly _report: (entries: readonly ITypedCharactersEntry[]) => void,
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

	/** Reports everything buffered so far. */
	flush(): void {
		if (this._pending.size === 0) {
			return;
		}
		const entries: ITypedCharactersEntry[] = [];
		for (const [resource, characters] of this._pending) {
			entries.push({ resource, characters });
		}
		this._pending.clear();
		this._report(entries);
	}

	private _trackModel(model: ITextModel): void {
		this._modelListeners.set(model, model.onDidChangeContent(e => this._handleContentChange(model, e)));
	}

	private _handleContentChange(model: ITextModel, e: IModelContentChangedEvent): void {
		const characters = countTypedCharacters(e);
		if (characters === 0) {
			return;
		}
		this._pending.set(model.uri, (this._pending.get(model.uri) ?? 0) + characters);
		if (!this._reportScheduler.isScheduled()) {
			this._reportScheduler.schedule();
		}
	}
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
