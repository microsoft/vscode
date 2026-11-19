/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';

/** Serializes passive history reads while a chat is observed, including a trailing read after invalidation. */
export class CodexChatHistory extends Disposable {
	private readonly _scheduler = this._register(new RunOnceScheduler(() => { void this._run(); }, 1000));
	private _running = false;
	private _dirty = false;
	private _waitingForChanges = false;

	constructor(private readonly _refresh: () => Promise<void>, private readonly _logService: ILogService) {
		super();
		this.invalidate();
	}

	invalidate(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._dirty = true;
		if (!this._running && !this._waitingForChanges) {
			this._waitingForChanges = true;
			this._scheduler.schedule();
		}
	}

	private async _run(): Promise<void> {
		if (this._store.isDisposed || this._running) {
			return;
		}
		this._running = true;
		this._dirty = false;
		this._waitingForChanges = false;
		try {
			await this._refresh();
		} catch (error) {
			this._logService.warn('[Codex] Failed to refresh observed history', error);
		} finally {
			this._running = false;
			if (!this._store.isDisposed) {
				this._waitingForChanges = this._dirty;
				this._scheduler.schedule(this._dirty ? 1000 : 5000);
			}
		}
	}
}
