/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { EXECUTION_HISTORY_STORAGE_PREFIX, ExecutionEntryType, IExecutionHistoryEntry, IExecutionHistoryError } from './executionHistoryService.js';
import { ILanguageRuntimeInfo, ILanguageRuntimeMessage, ILanguageRuntimeMessageError, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageStream, RuntimeOnlineState } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, RuntimeStartMode } from '../../../services/runtimeSession/common/runtimeSessionService.js';

export class SessionExecutionHistory extends Disposable {
	private readonly _entries: IExecutionHistoryEntry<any>[] = [];
	private readonly _storageKey: string;
	private readonly _pendingExecutions: Map<string, IExecutionHistoryEntry<any>> = new Map();
	private _timerId?: ReturnType<typeof setTimeout>;
	private _dirty: boolean = false;

	private readonly _sessionDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _sessionId: string,
		private readonly _startMode: RuntimeStartMode,
		private readonly _storageService: IStorageService,
		private readonly _logService: ILogService
	) {
		super();

		this._storageKey = `${EXECUTION_HISTORY_STORAGE_PREFIX}.${_sessionId}`;
		const entries = this._storageService.get(this._storageKey, StorageScope.WORKSPACE, '[]');
		try {
			JSON.parse(entries).forEach((entry: IExecutionHistoryEntry<any>) => {
				this._entries.push(entry);
			});
		} catch (err) {
			this._logService.warn(`Couldn't load execution history for ${_sessionId}: ${err}}`);
		}

		this._register(this._storageService.onWillSaveState(() => {
			this.flushPendingExecutions();
			this.save();
		}));
	}

	attachSession(session: ILanguageRuntimeSession) {
		this._sessionDisposables.clear();

		if (this._startMode === RuntimeStartMode.Starting) {
			this._sessionDisposables.add(session.onDidCompleteStartup(info => {
				const entry: IExecutionHistoryEntry<ILanguageRuntimeInfo> = {
					id: `startup-${session.sessionId}`,
					when: Date.now(),
					prompt: '',
					input: '',
					outputType: ExecutionEntryType.Startup,
					output: info,
					durationMs: 0
				};
				this._entries.push(entry);
				this._dirty = true;
				this.delayedSave();
			}));
		}

		this._sessionDisposables.add(session.onDidReceiveRuntimeMessageInput(message => {
			const pending = this._pendingExecutions.get(message.parent_id);
			if (pending) {
				if (pending.input) {
					this._logService.warn(
						`Received duplicate input messages for execution ${message.id}; ` +
						`replacing previous input '${pending.input}' with '${message.code}'.`);
				}

				pending.input = message.code;
			} else {
				const entry: IExecutionHistoryEntry<string> = {
					id: message.parent_id,
					when: Date.parse(message.when),
					prompt: session.dynState.inputPrompt,
					input: message.code,
					outputType: ExecutionEntryType.Execution,
					output: '',
					durationMs: 0
				};

				this._pendingExecutions.set(message.parent_id, entry);
			}
		}));

		const handleDidReceiveRuntimeMessageOutput = (message: ILanguageRuntimeMessageOutput) => {
			const output = message.data['text/plain'];
			if (output) {
				this.recordOutput(message, output);
			}
		};

		const handleDidReceiveRuntimeMessageStream = (message: ILanguageRuntimeMessageStream) => {
			const output = message.text;
			if (output) {
				this.recordOutput(message, output);
			}
		};

		const handleDidReceiveRuntimeMessageError = (message: ILanguageRuntimeMessageError) => {
			this.recordError(message);
		};

		this._sessionDisposables.add(
			session.onDidReceiveRuntimeMessageOutput(handleDidReceiveRuntimeMessageOutput));
		this._sessionDisposables.add(
			session.onDidReceiveRuntimeMessageResult(handleDidReceiveRuntimeMessageOutput));
		this._sessionDisposables.add(
			session.onDidReceiveRuntimeMessageStream(handleDidReceiveRuntimeMessageStream));
		this._sessionDisposables.add(
			session.onDidReceiveRuntimeMessageError(handleDidReceiveRuntimeMessageError));

		this._sessionDisposables.add(session.onDidReceiveRuntimeMessageState(message => {
			if (message.state === RuntimeOnlineState.Idle) {
				const pending = this._pendingExecutions.get(message.parent_id);
				if (pending) {
					pending.durationMs = Date.now() - pending.when;
					this._pendingExecutions.delete(message.parent_id);
					this._entries.push(pending);
					this._dirty = true;
					this.delayedSave();
				}
			}
		}));

		this._sessionDisposables.add(session.onDidEndSession(() => {
			this.flushPendingExecutions();
		}));
	}

	private flushPendingExecutions() {
		this._pendingExecutions.forEach(entry => {
			this._entries.push(entry);
			this._dirty = true;
		});
		this._pendingExecutions.clear();
	}

	private recordOutput(message: ILanguageRuntimeMessage, output: string) {
		const pending = this._pendingExecutions.get(message.parent_id);
		if (pending) {
			pending.output += output;
		} else {
			const entry: IExecutionHistoryEntry<string> = {
				id: message.parent_id,
				when: Date.parse(message.when),
				prompt: '',
				input: '',
				outputType: ExecutionEntryType.Execution,
				output,
				durationMs: 0
			};
			this._pendingExecutions.set(message.parent_id, entry);
		}
	}

	private recordError(message: ILanguageRuntimeMessageError) {
		const pending = this._pendingExecutions.get(message.parent_id);
		if (pending) {
			const error: IExecutionHistoryError = {
				name: message.name,
				message: message.message,
				traceback: message.traceback
			};
			pending.error = error;
		} else {
		}
	}

	public override dispose() {
		if (this._timerId) {
			this.save();
		}
		super.dispose();
	}

	get entries(): IExecutionHistoryEntry<any>[] {
		return this._entries;
	}

	clear(): void {
		this._entries.splice(0, this._entries.length);
		this.save();
	}

	delete(): void {
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
		}, 10000);
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
			`Saving execution history for session ${this._sessionId} ` +
			`(${storageState.length} bytes)`);

		this._storageService.store(this._storageKey,
			storageState,
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE);

		this._dirty = false;
	}
}
