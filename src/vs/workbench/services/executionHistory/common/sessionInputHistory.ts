/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExecutionHistoryEntry, IInputHistoryEntry, INPUT_HISTORY_STORAGE_PREFIX } from './executionHistoryService.js';
import { ILanguageRuntimeSession } from '../../../services/runtimeSession/common/runtimeSessionService.js';

export class SessionInputHistory extends Disposable {
	private readonly _entries: IInputHistoryEntry[] = [];
	private readonly _storageKey: string;
	private _timerId?: ReturnType<typeof setTimeout>;
	private _dirty: boolean = false;

	private readonly _sessionDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _sessionId: string,
		private readonly _storageService: IStorageService,
		private readonly _logService: ILogService
	) {
		super();

		this._storageKey = `${INPUT_HISTORY_STORAGE_PREFIX}.${_sessionId}`;

		const entries = this._storageService.get(this._storageKey, StorageScope.WORKSPACE, '[]');
		try {
			JSON.parse(entries).forEach((entry: IExecutionHistoryEntry<any>) => {
				this._entries.push(entry);
			});
		} catch (err) {
			this._logService.warn(`Couldn't load input history for ${_sessionId}: ${err}}`);
		}

		this._register(this._storageService.onWillSaveState(() => {
			this.save();
		}));
	}

	attachSession(session: ILanguageRuntimeSession) {
		this._sessionDisposables.clear();
		this._sessionDisposables.add(session.onDidReceiveRuntimeMessageInput(message => {
			this._entries.push({
				when: Date.now(),
				input: message.code
			});
			this._dirty = true;
			this.delayedSave();
		}));
	}

	public override dispose() {
		if (this._timerId) {
			this.save();
		}
		super.dispose();
	}

	public getInputHistory(): IInputHistoryEntry[] {
		return this._entries;
	}

	delete(): void {
		this._entries.length = 0;
		this._storageService.store(this._storageKey,
			null,
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE);
	}

	private delayedSave(): void {
		if (this._timerId) {
			clearTimeout(this._timerId);
			this._timerId = undefined;
		}

		this._timerId = setTimeout(() => {
			this.save();
		}, 5000);
	}

	private save(): void {
		if (this._timerId) {
			clearTimeout(this._timerId);
			this._timerId = undefined;
		}

		if (!this._dirty) {
			return;
		}

		const storageState = JSON.stringify(this._entries);
		this._logService.trace(
			`Saving input history for session ${this._sessionId} ` +
			`(${storageState.length} bytes)`);

		this._storageService.store(this._storageKey,
			storageState,
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE);

		this._dirty = false;
	}
}
