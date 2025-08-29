/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IInputHistoryEntry, inputHistorySizeSettingId } from './executionHistoryService.js';
import { ILanguageRuntimeSession } from '../../../services/runtimeSession/common/runtimeSessionService.js';

export class LanguageInputHistory extends Disposable {
	private _attachedSessions: Set<string> = new Set();
	private readonly _pendingEntries: IInputHistoryEntry[] = [];
	private readonly _storageKey: string;
	private _timerId?: ReturnType<typeof setTimeout>;

	constructor(
		private readonly _languageId: string,
		private readonly _storageService: IStorageService,
		private readonly _storageScope: StorageScope,
		private readonly _logService: ILogService,
		private readonly _configurationService: IConfigurationService) {
		super();

		this._storageKey = `positron.languageInputHistory.${this._languageId}`;

		this._register(this._storageService.onWillSaveState(() => {
			this.save(true);
		}));
	}

	public attachSession(session: ILanguageRuntimeSession): void {
		if (this._attachedSessions.has(session.sessionId)) {
			this._logService.debug(`LanguageInputHistory (${this._languageId}): ` +
				`Already attached to session ${session.dynState.sessionName} (${session.sessionId})`);
			return;
		}

		if (session.runtimeMetadata.languageId !== this._languageId) {
			this._logService.warn(`LanguageInputHistory (${this._languageId}): Language mismatch ` +
				`(expected ${this._languageId}, got ${session.runtimeMetadata.languageId}))`);
			return;
		}

		this._register(session.onDidReceiveRuntimeMessageInput(languageRuntimeMessageInput => {
			if (languageRuntimeMessageInput.code.length > 0) {
				const entry: IInputHistoryEntry = {
					when: Date.parse(languageRuntimeMessageInput.when),
					input: languageRuntimeMessageInput.code
				};
				this._pendingEntries.push(entry);
				this.delayedSave();
			}
		}));
	}

	private delayedSave(): void {
		this.clearSaveTimer();

		this._timerId = setTimeout(() => {
			this.save(false);
		}, 10000);
	}

	public getInputHistory(): IInputHistoryEntry[] {
		const entries = this._storageService.get(this._storageKey, this._storageScope, '[]');
		let parsedEntries: IInputHistoryEntry[] = [];
		try {
			parsedEntries = JSON.parse(entries);
		} catch (err) {
			this._logService.error(`LanguageInputHistory (${this._languageId}): Failed to parse JSON from storage: ${err}.`);
		}

		return parsedEntries.concat(this._pendingEntries);
	}

	public clear() {
		this.clearSaveTimer();
		this._pendingEntries.splice(0, this._pendingEntries.length);
		this._storageService.remove(this._storageKey, this._storageScope);
	}

	private save(forShutdown: boolean): void {
		this.clearSaveTimer();

		if (this._pendingEntries.length === 0) {
			// Nothing to save
			return;
		}

		const entries = this._storageService.get(this._storageKey, this._storageScope, '[]');
		let parsedEntries: IInputHistoryEntry[] = [];
		try {
			parsedEntries = JSON.parse(entries);
		} catch (err) {
			this._logService.error(`LanguageInputHistory (${this._languageId}): Failed to parse JSON from storage: ${err}.`);

			if (forShutdown) {
				return;
			}

			this._logService.warn(`LanguageInputHistory (${this._languageId}: Clearing to recover from error.`);
		}

		parsedEntries = parsedEntries.concat(this._pendingEntries);

		const max = this._configurationService.getValue<number>(inputHistorySizeSettingId);
		const overflow = parsedEntries.length - max;
		if (overflow > 0) {
			parsedEntries = parsedEntries.splice(overflow);
		}

		const storageState = JSON.stringify(parsedEntries);
		this._logService.trace(`Saving input history in key ${this._storageKey} (${parsedEntries.length} items, ${storageState.length} bytes)`);

		this._storageService.store(this._storageKey,
			storageState,
			this._storageScope,
			StorageTarget.USER);

		this._pendingEntries.splice(0, this._pendingEntries.length);
	}

	private clearSaveTimer(): void {
		if (this._timerId) {
			clearTimeout(this._timerId);
			this._timerId = undefined;
		}
	}

	public override dispose() {
		if (this._timerId) {
			this.save(true);
		}
		super.dispose();
	}
}
