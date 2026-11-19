/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService, INativeSystemWideKeybinding } from '../../../../platform/native/common/native.js';
import { ISystemWideKeybindingCandidate } from './systemWideKeybindings.js';

export interface ISystemWideKeybindingsSynchronizerOptions {
	readonly getCandidates: () => readonly ISystemWideKeybindingCandidate[];
	/** Reports the user's keybindings that the system didn't register. Those of default keybindings are only logged. */
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
	/** The context keys of the `when` clauses of default system-wide keybindings, which decide whether they are selected. */
	private defaultWhenKeys = new Set<string>();

	constructor(
		private readonly options: ISystemWideKeybindingsSynchronizerOptions,
		private readonly keybindingService: IKeybindingService,
		private readonly nativeHostService: INativeHostService,
		private readonly logService: ILogService,
		contextKeyService: IContextKeyService,
	) {
		super();

		this.syncScheduler = this._register(new RunOnceScheduler(() => this.queueSync(), 200));
		this.updateDefaultWhenKeys();
		this._register(keybindingService.onDidUpdateKeybindings(() => {
			this.updateDefaultWhenKeys();
			this.syncScheduler.schedule();
		}));
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this.defaultWhenKeys)) {
				this.syncScheduler.schedule();
			}
		}));

		if (options.syncImmediately) {
			this.queueSync();
		} else {
			this.syncScheduler.schedule();
		}
	}

	private updateDefaultWhenKeys(): void {
		this.defaultWhenKeys = new Set(this.keybindingService.getKeybindings().flatMap(item => item.isDefault && item.systemWide && item.when ? item.when.keys() : []));
	}

	private queueSync(): void {
		void this.syncSequencer.queue(() => this.sync());
	}

	private async sync(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}

		const candidates = this.options.getCandidates();
		const payload: readonly INativeSystemWideKeybinding[] = candidates.map(candidate => ({
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
			this.lastProcessedPayloadHadFailures = result.failed.length > 0;
			const defaultLabels = new Set(candidates.filter(candidate => candidate.isDefault).map(candidate => candidate.userSettingsLabel));
			const failedDefaults = result.failed.filter(label => defaultLabels.has(label));
			if (failedDefaults.length) {
				this.logService.warn(`[${this.options.logLabel}] default system-wide keybindings could not be registered (${failedDefaults.join(', ')}); the key combination may already be taken by the operating system or another application.`);
			}
			const sortedFailures = result.failed.filter(label => !defaultLabels.has(label)).sort();
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
