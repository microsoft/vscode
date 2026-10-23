/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { URI as ProtocolURI } from '../common/state/sessionState.js';

export const IAgentHostFileEditCoordinator = createDecorator<IAgentHostFileEditCoordinator>('agentHostFileEditCoordinator');

/** How long a change of a file waits for the edit tool calls on it to finish by default. */
const DEFAULT_EDITS_TIMEOUT_MS = 30_000;

/** Changes that an agent made to a file, and that were discarded. */
export interface IDiscardedFileEdits {
	/** Storage resource of the database that recorded the agent's edits, as `ITrackedEditSource.storage`. */
	readonly storage: ProtocolURI;
	readonly resource: URI;
	/**
	 * The one-based lines of the discarded changes in the file as the agent
	 * last wrote it, or `undefined` when every change was discarded.
	 */
	readonly lines?: { readonly startLineNumber: number; readonly endLineNumberExclusive: number };
	/** Whether discarding the changes deleted the file, which the agent had created. */
	readonly deleted: boolean;
}

/** Thrown by {@link IAgentHostFileEditCoordinator.runExclusive} when edit tool calls on the file don't finish in time. */
export class FileEditsInProgressError extends Error {
	constructor(readonly resource: URI) {
		super(`Edits of ${resource.toString()} are still in progress`);
	}
}

/**
 * Tells an agent about its changes to a file that the user undid, so it
 * reads the file again before it edits it and doesn't redo them. Sent once,
 * as `additionalContext` with the agent's next tool result or prompt.
 */
export function describeDiscardedFileEdits(edits: IDiscardedFileEdits): string {
	const path = edits.resource.scheme === 'file' ? edits.resource.fsPath : edits.resource.toString();
	if (edits.deleted) {
		return `The user undid your creation of ${path}, so the file no longer exists. Don't create it again unless the user asks you to.`;
	}
	const lines = edits.lines;
	const where = !lines ? ''
		: lines.endLineNumberExclusive - lines.startLineNumber > 1 ? ` on lines ${lines.startLineNumber}-${lines.endLineNumberExclusive - 1}`
			: lines.endLineNumberExclusive > lines.startLineNumber ? ` on line ${lines.startLineNumber}`
				: ` near line ${lines.startLineNumber}`;
	return `The user undid your changes to ${path}${where}. Read the file again before you edit it, and don't make those changes again unless the user asks you to.`;
}

/**
 * Coordinates the edit tool calls of agents with the host's own changes to
 * the files they edit, like discarding a Working Set's changes while a turn
 * runs: such a change waits for the edit tool calls on its file, and new
 * ones wait for it, so each edit's snapshots and the host's change are
 * recorded in the order they were made.
 */
export interface IAgentHostFileEditCoordinator {
	readonly _serviceBrand: undefined;

	/** Fires when changes that an agent made to a file were discarded, so the agent can be told. */
	readonly onDidDiscardFileEdits: Event<IDiscardedFileEdits>;

	/** Fires with a file when an edit tool call on it starts while none ran, or the last one running ends. */
	readonly onDidChangeEditing: Event<URI>;

	/** Whether an edit tool call on `resource` runs, see {@link beginEdit}. */
	isEditing(resource: URI): boolean;

	/**
	 * Declares that the edit tool calls of `provider`'s agents wait for
	 * {@link beginEdit} before they run, so their files can be changed while
	 * their turns run.
	 */
	registerCoordinatedProvider(provider: string): IDisposable;

	/** Whether the edit tool calls of `provider`'s agents wait for {@link beginEdit}. */
	isCoordinatedProvider(provider: string | undefined): boolean;

	/**
	 * Waits until no exclusive change of `resource` runs or waits, then marks
	 * an edit tool call on it as running until the result is disposed.
	 */
	beginEdit(resource: URI): Promise<IDisposable>;

	/** Marks an observed SDK write without claiming that its execution can wait for exclusive changes. */
	markEditing(resource: URI): IDisposable;

	/**
	 * Runs `task` once no edit tool call on `resource` runs, while new ones
	 * wait. Changes of the same file run one at a time. Throws a
	 * {@link FileEditsInProgressError}, without running `task`, when the edit
	 * tool calls don't finish within `timeoutMs`.
	 */
	runExclusive<T>(resource: URI, task: () => Promise<T>, timeoutMs?: number): Promise<T>;

	/** Reports discarded changes; see {@link onDidDiscardFileEdits}. */
	reportDiscarded(edits: IDiscardedFileEdits): void;
}

interface IFileState {
	/** Edit tool calls on the file that are running. */
	edits: number;
	/** Resolves once no edit tool call on the file runs. */
	idle: DeferredPromise<void> | undefined;
	/** The last exclusive change of the file, while it runs or waits. */
	exclusive: Promise<unknown> | undefined;
}

export class AgentHostFileEditCoordinator extends Disposable implements IAgentHostFileEditCoordinator {

	declare readonly _serviceBrand: undefined;

	private readonly _files = new Map<string, IFileState>();
	private readonly _coordinatedProviders = new Map<string, number>();

	private readonly _onDidDiscardFileEdits = this._register(new Emitter<IDiscardedFileEdits>());
	readonly onDidDiscardFileEdits = this._onDidDiscardFileEdits.event;

	private readonly _onDidChangeEditing = this._register(new Emitter<URI>());
	readonly onDidChangeEditing = this._onDidChangeEditing.event;

	isEditing(resource: URI): boolean {
		return (this._files.get(extUriBiasedIgnorePathCase.getComparisonKey(resource))?.edits ?? 0) > 0;
	}

	registerCoordinatedProvider(provider: string): IDisposable {
		this._coordinatedProviders.set(provider, (this._coordinatedProviders.get(provider) ?? 0) + 1);
		let registered = true;
		return toDisposable(() => {
			if (!registered) {
				return;
			}
			registered = false;
			const count = (this._coordinatedProviders.get(provider) ?? 1) - 1;
			if (count > 0) {
				this._coordinatedProviders.set(provider, count);
			} else {
				this._coordinatedProviders.delete(provider);
			}
		});
	}

	isCoordinatedProvider(provider: string | undefined): boolean {
		return provider !== undefined && this._coordinatedProviders.has(provider);
	}

	async beginEdit(resource: URI): Promise<IDisposable> {
		const key = extUriBiasedIgnorePathCase.getComparisonKey(resource);
		// A change of the file that runs or waits goes first; one that comes later waits for this edit.
		for (let exclusive = this._files.get(key)?.exclusive; exclusive; exclusive = this._files.get(key)?.exclusive) {
			await exclusive.catch(() => { });
		}
		return this.markEditing(resource);
	}

	markEditing(resource: URI): IDisposable {
		const key = extUriBiasedIgnorePathCase.getComparisonKey(resource);
		const state = this._getState(key);
		state.edits++;
		if (state.edits === 1) {
			this._onDidChangeEditing.fire(resource);
		}
		let running = true;
		return toDisposable(() => {
			if (!running) {
				return;
			}
			running = false;
			state.edits--;
			if (state.edits === 0) {
				state.idle?.complete();
				state.idle = undefined;
				this._deleteIfUnused(key, state);
				if (!this._store.isDisposed) {
					this._onDidChangeEditing.fire(resource);
				}
			}
		});
	}

	async runExclusive<T>(resource: URI, task: () => Promise<T>, timeoutMs = DEFAULT_EDITS_TIMEOUT_MS): Promise<T> {
		const key = extUriBiasedIgnorePathCase.getComparisonKey(resource);
		const state = this._getState(key);
		const previous = state.exclusive;
		const run = (async () => {
			await previous?.catch(() => { });
			if (state.edits > 0) {
				state.idle ??= new DeferredPromise<void>();
				const idle = await raceTimeout(state.idle.p.then(() => true), timeoutMs);
				if (!idle) {
					throw new FileEditsInProgressError(resource);
				}
			}
			return task();
		})();
		state.exclusive = run;
		try {
			return await run;
		} finally {
			if (state.exclusive === run) {
				state.exclusive = undefined;
				this._deleteIfUnused(key, state);
			}
		}
	}

	reportDiscarded(edits: IDiscardedFileEdits): void {
		this._onDidDiscardFileEdits.fire(edits);
	}

	private _getState(key: string): IFileState {
		let state = this._files.get(key);
		if (!state) {
			state = { edits: 0, idle: undefined, exclusive: undefined };
			this._files.set(key, state);
		}
		return state;
	}

	private _deleteIfUnused(key: string, state: IFileState): void {
		if (state.edits === 0 && !state.exclusive && this._files.get(key) === state) {
			this._files.delete(key);
		}
	}
}
