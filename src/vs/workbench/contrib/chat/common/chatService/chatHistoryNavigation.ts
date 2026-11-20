/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { AhpErrorCodes, ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IChatSessionHistoryItem, IChatSessionHistoryNavigation } from '../chatSessionsService.js';
import { IChatHistoryNavigation, IChatHistoryOutlineEntry, IChatHistorySearchOptions, IChatHistorySearchResult, IChatModel, IChatRequestModel } from '../model/chatModel.js';

/** Restarts one invalidated traversal; never joins results from different revisions. */
export async function* chatHistoryPages<T extends { readonly nextCursor?: string }>(read: (cursor: string | undefined) => Promise<T>, token: CancellationToken) {
	const seen = new Set<string>();
	let cursor: string | undefined;
	let restarted = false;
	do {
		CancellationToken.throwIfCanceled(token);
		let page: T;
		try {
			page = await read(cursor);
		} catch (error) {
			if (restarted || !(error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict)) {
				throw error;
			}
			restarted = true;
			seen.clear();
			cursor = undefined;
			CancellationToken.throwIfCanceled(token);
			page = await read(undefined);
		}
		CancellationToken.throwIfCanceled(token);
		yield { page, first: cursor === undefined };
		cursor = page.nextCursor;
		if (cursor !== undefined) {
			if (seen.has(cursor)) {
				throw new Error('Chat history cursor did not advance');
			}
			seen.add(cursor);
		}
	} while (cursor !== undefined);
}

/**
 * An independent reading window over settled turns. Only an exclusive read anchored
 * at the current boundary may extend it; seeking elsewhere replaces the whole window.
 * Neither operation writes to the live model or changes the host subscription.
 */
export class ChatHistoryNavigation extends Disposable implements IChatHistoryNavigation {
	readonly outline = observableValue<readonly IChatHistoryOutlineEntry[] | undefined>(this, undefined);
	readonly window = observableValue<readonly IChatRequestModel[] | undefined>(this, undefined);
	readonly inHistory = this.window.map(requests => requests !== undefined);
	private readonly _pages = this._register(new DisposableStore());
	private _read: CancellationTokenSource | undefined;
	private _outlineVersion = 0;
	private _hasBefore = false;
	private _hasAfter = false;

	constructor(
		private readonly _source: IChatSessionHistoryNavigation,
		private readonly _live: IChatModel,
		private readonly _restore: (history: readonly IChatSessionHistoryItem[], token: CancellationToken) => Promise<IChatModel>,
	) {
		super();
	}

	async loadOutline(token: CancellationToken): Promise<void> {
		this._check(token);
		const version = ++this._outlineVersion;
		const items: IChatHistoryOutlineEntry[] = [];
		for await (const { page, first } of chatHistoryPages(cursor => this._source.list(cursor, token), token)) {
			this._check(token);
			if (version !== this._outlineVersion) {
				return;
			}
			if (first) {
				items.length = 0;
			}
			items.push(...page.items);
		}
		this.outline.set(items, undefined);
	}

	async search(query: string, options: IChatHistorySearchOptions, cursor: string | undefined, token: CancellationToken): Promise<IChatHistorySearchResult> {
		this._check(token);
		const result = await this._source.search(query, options, cursor, token);
		this._check(token);
		return result;
	}

	async revealTurn(turnId: string, token: CancellationToken): Promise<void> {
		this._check(token);
		this._cancelRead();
		if (this.window.get()?.some(request => request.id === turnId)) {
			return;
		}
		if (this._live.getRequests().some(request => request.id === turnId)) {
			await this.returnToLatest();
			return;
		}
		await this._readPage(turnId, 'around', token);
	}

	async loadPage(direction: 'before' | 'after', token: CancellationToken): Promise<void> {
		this._check(token);
		const current = this.window.get();
		if (!current || this._read) {
			return;
		}
		if (direction === 'after' && !this._hasAfter) {
			await this.returnToLatest();
		} else if (direction === 'after' || this._hasBefore) {
			await this._readPage(current[direction === 'before' ? 0 : current.length - 1].id, direction, token);
		}
	}

	async returnToLatest(): Promise<void> {
		this._cancelRead();
		this.window.set(undefined, undefined);
		this._pages.clear();
	}

	private async _readPage(turnId: string, direction: 'around' | 'before' | 'after', token: CancellationToken): Promise<void> {
		const read = this._read = new CancellationTokenSource(token);
		let page: IChatModel | undefined;
		try {
			const result = await this._source.read(turnId, direction, read.token);
			this._check(read.token);
			const current = this.window.get() ?? [];
			const ids = result.history.filter(item => item.type === 'request').map(item => item.id);
			const known = new Set(direction === 'around' ? [] : current.map(request => request.id));
			if ((direction === 'around' && !ids.includes(turnId)) || new Set(ids).size !== ids.length || ids.some(id => id === undefined || known.has(id))) {
				throw new Error('Invalid chat history window');
			}
			if (ids.length > 0) {
				page = await this._restore(result.history, read.token);
				this._check(read.token);
			}
			const requests = page?.getRequests() ?? [];
			if (direction !== 'after') {
				this._hasBefore = result.hasBefore;
			}
			if (direction !== 'before') {
				this._hasAfter = result.hasAfter;
			}
			const next = direction === 'before' ? [...requests, ...current] : direction === 'after' ? [...current, ...requests] : [...requests];
			if (direction === 'around') {
				this._pages.clear();
			}
			if (page) {
				this._pages.add(page);
				page = undefined;
			}
			this.window.set(next, undefined);
		} finally {
			page?.dispose();
			if (this._read === read) {
				this._read = undefined;
			}
			read.dispose();
		}
	}

	private _check(token: CancellationToken): void {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	private _cancelRead(): void {
		this._read?.cancel();
		this._read = undefined;
	}

	override dispose(): void {
		this._cancelRead();
		this.outline.set(undefined, undefined);
		this.window.set(undefined, undefined);
		super.dispose();
	}
}
