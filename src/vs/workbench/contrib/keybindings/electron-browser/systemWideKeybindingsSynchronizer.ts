/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService, INativeSystemWideKeybinding } from '../../../../platform/native/common/native.js';
import { ISystemWideKeybindingCandidate } from './systemWideKeybindings.js';

export interface ISystemWideKeybindingsSynchronizerOptions {
	readonly getCandidates: () => readonly ISystemWideKeybindingCandidate[];
	readonly onRegistrationFailuresChanged: (failed: readonly string[]) => void;
	readonly logLabel: string;
	readonly syncImmediately?: boolean;
}

export class SystemWideKeybindingsSynchronizer extends Disposable {

	private readonly syncScheduler: RunOnceScheduler;
	private readonly syncSequencer = new Sequencer();
	private lastProcessedPayload: readonly INativeSystemWideKeybinding[] | undefined;
	private lastProcessedPayloadHadFailures = false;
	private lastReportedFailures: readonly string[] = [];

	constructor(
		private readonly options: ISystemWideKeybindingsSynchronizerOptions,
		keybindingService: IKeybindingService,
		private readonly nativeHostService: INativeHostService,
		private readonly logService: ILogService,
	) {
		super();

		this.syncScheduler = this._register(new RunOnceScheduler(() => this.queueSync(), 200));
		this._register(keybindingService.onDidUpdateKeybindings(() => this.syncScheduler.schedule()));

		if (options.syncImmediately) {
			this.queueSync();
		} else {
			this.syncScheduler.schedule();
		}
	}

	private queueSync(): void {
		void this.syncSequencer.queue(() => this.sync());
	}

	private async sync(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}

		const payload: readonly INativeSystemWideKeybinding[] = this.options.getCandidates().map(candidate => ({
			accelerator: candidate.accelerator,
			commandId: candidate.commandId,
			args: candidate.args,
			userSettingsLabel: candidate.userSettingsLabel,
		}));
		if (!this.lastProcessedPayloadHadFailures && this.lastProcessedPayload && structuralEquals(payload, this.lastProcessedPayload)) {
			return;
		}

		try {
			const result = await this.nativeHostService.syncSystemWideKeybindings([...payload]);
			if (this._store.isDisposed) {
				return;
			}

			this.lastProcessedPayload = payload;
			const sortedFailures = [...result.failed].sort();
			this.lastProcessedPayloadHadFailures = sortedFailures.length > 0;
			if (!structuralEquals(sortedFailures, this.lastReportedFailures)) {
				this.lastReportedFailures = sortedFailures;
				this.options.onRegistrationFailuresChanged(sortedFailures);
			}
		} catch (error) {
			if (!this._store.isDisposed) {
				this.lastProcessedPayload = undefined;
				this.lastProcessedPayloadHadFailures = false;
				this.logService.error(`[${this.options.logLabel}] failed to sync system-wide keybindings with the main process`, error);
			}
		}
	}
}
