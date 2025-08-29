/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { EXECUTION_HISTORY_STORAGE_PREFIX, IExecutionHistoryEntry, IExecutionHistoryService, IInputHistoryEntry, INPUT_HISTORY_STORAGE_PREFIX } from './executionHistoryService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageRuntimeSession, IRuntimeSessionService, RuntimeStartMode } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SessionExecutionHistory } from './sessionExecutionHistory.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IRuntimeStartupService, SerializedSessionMetadata } from '../../../services/runtimeStartup/common/runtimeStartupService.js';
import { RuntimeExitReason } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { SessionInputHistory } from './sessionInputHistory.js';
import { LanguageInputHistory } from './languageInputHistory.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class ExecutionHistoryService extends Disposable implements IExecutionHistoryService {
	_serviceBrand: undefined;

	private readonly _executionHistories: Map<string, SessionExecutionHistory> = new Map();
	private readonly _sessionHistories: Map<string, SessionInputHistory> = new Map();
	private readonly _languageHistories: Map<string, LanguageInputHistory> = new Map();

	constructor(
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IRuntimeStartupService private readonly _runtimeStartupService: IRuntimeStartupService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();

		this._runtimeSessionService.activeSessions.forEach(session => {
			this.beginRecordingHistory(session, RuntimeStartMode.Reconnecting);
		});

        this._register(this._runtimeSessionService.onWillStartSession(evt => {
			this.beginRecordingHistory(evt.session, evt.startMode);
		}));

		this._register(this._runtimeStartupService.onSessionRestoreFailure(evt => {
			this.deleteSessionHistory(evt.sessionId);
		}));

		this._runtimeStartupService.getRestoredSessions().then(sessions => {
			this.pruneStorage(sessions);
		});
	}

	clearInputEntries(sessionId: string): void {
		if (this._sessionHistories.has(sessionId)) {
			this._sessionHistories.get(sessionId)!.delete();
		}
	}

	pruneStorage(sessions: SerializedSessionMetadata[]): void {
		const restoredSessionIds = sessions.map(session => session.metadata.sessionId);
		const activeSessionIds = Array.from(this._executionHistories.keys());
		const allSessionIds = new Set([...restoredSessionIds, ...activeSessionIds]);
		const historyKeys = this._storageService
			.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE)
			.filter(key => key.startsWith(EXECUTION_HISTORY_STORAGE_PREFIX));
		const inputKeys = this._storageService
			.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE)
			.filter(key => key.startsWith(INPUT_HISTORY_STORAGE_PREFIX));
		historyKeys.push(...inputKeys);

		historyKeys.forEach(key => {
			const parts = key.split('.');
			if (parts.length < 3) {
				return;
			}
			const sessionId = parts[2];
			if (!allSessionIds.has(sessionId)) {
				this._logService.debug(
					`[Runtime history] Pruning ${key} for expired session ${sessionId}`);
				this._storageService.remove(key, StorageScope.WORKSPACE);
			}
		});
	}

	getSessionInputEntries(sessionId: string): IInputHistoryEntry[] {
		if (this._sessionHistories.has(sessionId)) {
			return this._sessionHistories.get(sessionId)!.getInputHistory();
		} else {
			const history = new SessionInputHistory(sessionId,
				this._storageService,
				this._logService);
			this._sessionHistories.set(sessionId, history);
			this._register(history);
			return history.getInputHistory();
		}
	}

	getInputEntries(languageId: string): IInputHistoryEntry[] {
		return this.getLanguageHistory(languageId)?.getInputHistory() || [];
	}

	private getLanguageHistory(languageId: string): LanguageInputHistory | undefined {
		if (this._languageHistories.has(languageId)) {
			return this._languageHistories.get(languageId)!;
		}

		try {
			const storageScope =
				this._workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY ?
					StorageScope.PROFILE :
					StorageScope.WORKSPACE;

			const history = new LanguageInputHistory(
				languageId,
				this._storageService,
				storageScope,
				this._logService,
				this._configurationService);

			this._languageHistories.set(languageId, history);
			this._register(history);
			return history;
		} catch (e) {
			this._logService.error(`Error creating language history for ${languageId}: ${e}`);
		}
		return undefined;
	}

	private beginRecordingHistory(session: ILanguageRuntimeSession, startMode: RuntimeStartMode): void {
		this.getLanguageHistory(session.runtimeMetadata.languageId)?.attachSession(session);

		if (this._executionHistories.has(session.sessionId)) {
			const history = this._executionHistories.get(session.sessionId);
			history!.attachSession(session);
		} else {
			const history = new SessionExecutionHistory(
				session.metadata.sessionId,
				startMode,
				this._storageService,
				this._logService);
			history.attachSession(session);
			this._executionHistories.set(session.sessionId, history);
			this._register(history);
		}

		if (this._sessionHistories.has(session.sessionId)) {
			const input = this._sessionHistories.get(session.sessionId);
			input!.attachSession(session);
		} else {
			const input = new SessionInputHistory(
				session.sessionId,
				this._storageService,
				this._logService);
			input.attachSession(session);
			this._sessionHistories.set(session.sessionId, input);
			this._register(input);
		}

		this._register(session.onDidEndSession(evt => {
			if (evt.reason === RuntimeExitReason.Shutdown ||
				evt.reason === RuntimeExitReason.ForcedQuit ||
				evt.reason === RuntimeExitReason.Unknown) {
				this.deleteSessionHistory(session.sessionId);
			}
		}));
	}

	deleteSessionHistory(sessionId: string) {
		if (this._executionHistories.has(sessionId)) {
			const history = this._executionHistories.get(sessionId)!;
			history.delete();
			history.dispose();
			this._executionHistories.delete(sessionId);
		}
		if (this._sessionHistories.has(sessionId)) {
			const input = this._sessionHistories.get(sessionId)!;
			input.delete();
			input.dispose();
			this._sessionHistories.delete(sessionId);
		}
	}

	getExecutionEntries(sessionId: string): IExecutionHistoryEntry<any>[] {
		if (this._executionHistories.has(sessionId)) {
			return this._executionHistories.get(sessionId)?.entries!;
		}

		const history = new SessionExecutionHistory(
			sessionId,
			RuntimeStartMode.Reconnecting,
			this._storageService,
			this._logService);
		this._executionHistories.set(sessionId, history);
		this._register(history);
		return history.entries;
	}

	clearExecutionEntries(runtimeId: string): void {
		if (this._executionHistories.has(runtimeId)) {
			this._executionHistories.get(runtimeId)?.clear();
		} else {
			throw new Error(`Can't get entries; unknown runtime ID: ${runtimeId}`);
		}
	}
}

registerSingleton(IExecutionHistoryService, ExecutionHistoryService, InstantiationType.Delayed);
