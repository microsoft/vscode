/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { ObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService, multiplexProperties } from '../../../platform/telemetry/common/telemetry';
import { LogEntry } from '../../../platform/workspaceRecorder/common/workspaceLog';
import { RunOnceScheduler } from '../../../util/vs/base/common/async';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { autorun, autorunWithStore } from '../../../util/vs/base/common/observable';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { DebugRecorder } from './debugRecorder';

/**
 * Periodically sends an enhanced GH telemetry event with a fixed-length slice of recent workspace activity.
 *
 * Each event is shipped on the existing `copilot-nes/provideInlineEdit` channel (so we reuse the existing
 * privacy/classification surface) and tagged with `continuous: 'true'` so the backend can route it.
 *
 * ## Timing
 *
 * - Every {@link INTERVAL_MS} a "tick" fires.
 * - On tick, the sender enters an **idle-detection** phase mirroring the suggestion-anchored
 *   {@link TelemetrySender}: it waits for {@link IDLE_MS} of no workspace edits, with a {@link HARD_CAP_MS}
 *   hard cap. This avoids capturing a mid-keystroke window — we want each slice to end at a "stable" moment.
 * - At the moment of send, the slice covers `[sendTime - WINDOW_MS, sendTime]`.
 *
 * ## Overlap guarantee
 *
 * Adjacent slices are guaranteed to overlap by **at least** {@link OVERLAP_MS}. Worst-case math:
 * with ticks at `T1` and `T2 = T1 + INTERVAL_MS`, and idle-defer `d ∈ [0, HARD_CAP_MS]`, the actual send
 * times are `S1 = T1 + d1` and `S2 = T2 + d2`. Overlap is
 * `WINDOW_MS - (S2 - S1) = WINDOW_MS - INTERVAL_MS - (d2 - d1)`. Minimum overlap is reached when
 * `d2 = HARD_CAP_MS, d1 = 0`, giving `WINDOW_MS - INTERVAL_MS - HARD_CAP_MS = OVERLAP_MS`. Hence the
 * formula `INTERVAL_MS = WINDOW_MS - OVERLAP_MS - HARD_CAP_MS`.
 *
 * ## Empty slices are skipped
 *
 * A recording with no actual edits (only the header + per-doc framing, or only selection changes) is not
 * sent. This keeps the channel free of "heartbeat" events when the user is idle.
 *
 * ## Reconstruction
 *
 * Each event carries a `sessionId` (stable per sender lifetime), a monotonically increasing `sequenceNumber`,
 * and explicit `windowStart`/`windowEnd` timestamps. The backend stitches a longer recording by grouping
 * events by `sessionId`, ordering by `sequenceNumber`, and deduplicating entries in the overlap zone by
 * `(documentId, time)`.
 */
export class ContinuousEnhancedTelemetrySender extends Disposable {

	public static readonly WINDOW_MS = 5 * 60 * 1000;
	public static readonly OVERLAP_MS = 30 * 1000;
	public static readonly IDLE_MS = 5 * 1000;
	public static readonly HARD_CAP_MS = 30 * 1000;
	/** Tick cadence. See class-level overlap math. */
	public static readonly INTERVAL_MS = 5 * 60 * 1000 - 30 * 1000 - 30 * 1000;

	private static readonly MAX_ENTRIES_BYTES = 200 * 1024;

	private readonly _sessionId = generateUuid();
	private _sequenceNumber = 0;

	constructor(
		private readonly _debugRecorder: DebugRecorder,
		private readonly _workspace: ObservableWorkspace | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
	) {
		super();

		const enabled = configurationService.getExperimentBasedConfigObservable(ConfigKey.Advanced.ContinuousEnhancedTelemetryEnabled, experimentationService);

		this._register(autorunWithStore((reader, store) => {
			if (!enabled.read(reader)) { return; }
			this._runLoop(store);
		}));
	}

	private _runLoop(store: DisposableStore): void {
		const tickScheduler = store.add(new RunOnceScheduler(() => {
			if (store.isDisposed) { return; }
			this._onTick(store, () => {
				if (store.isDisposed) { return; }
				tickScheduler.schedule();
			});
		}, ContinuousEnhancedTelemetrySender.INTERVAL_MS));
		tickScheduler.schedule();
	}

	private _onTick(loopStore: DisposableStore, reschedule: () => void): void {
		if (loopStore.isDisposed) { return; }

		const idleStore = new DisposableStore();
		loopStore.add(idleStore); // tear down with the loop if config toggles off mid-wait

		let fired = false;
		const fireAndReset = () => {
			if (fired) { return; }
			fired = true;
			idleStore.dispose();
			this._sendNow();
			reschedule();
		};

		const idleScheduler = idleStore.add(new RunOnceScheduler(fireAndReset, ContinuousEnhancedTelemetrySender.IDLE_MS));
		const hardCap = idleStore.add(new RunOnceScheduler(fireAndReset, ContinuousEnhancedTelemetrySender.HARD_CAP_MS));

		if (this._workspace) {
			let isFirstRun = true;
			idleStore.add(autorun(reader => {
				this._workspace!.onDidOpenDocumentChange.read(reader);
				if (isFirstRun) {
					isFirstRun = false;
					return;
				}
				idleScheduler.schedule();
			}));
		}

		idleScheduler.schedule();
		hardCap.schedule();
	}

	private _sendNow(): void {
		const now = Date.now();
		const windowStart = now - ContinuousEnhancedTelemetrySender.WINDOW_MS;
		const entries = this._debugRecorder.getLogInRange(windowStart, now);

		if (!entries || !hasAnyEdit(entries)) {
			// User requested: skip slices with no actual edits.
			return;
		}

		const entriesJson = JSON.stringify(entries);
		const entriesSize = entriesJson.length;
		const sequenceNumber = this._sequenceNumber++;

		const recording = {
			entries: entriesSize > ContinuousEnhancedTelemetrySender.MAX_ENTRIES_BYTES ? undefined : entries,
			entriesSize,
			windowStart,
			windowEnd: now,
			sessionId: this._sessionId,
			sequenceNumber,
		};

		const { activeDocumentRepository, repositoryUrls } = this._collectGitMetadata();

		this._telemetryService.sendEnhancedGHTelemetryEvent('copilot-nes/provideInlineEdit',
			multiplexProperties({
				continuous: 'true',
				recording: JSON.stringify(recording),
				activeDocumentRepository,
				repositories: repositoryUrls === undefined ? undefined : JSON.stringify(repositoryUrls),
			}),
			{
				continuousWindowDurationMs: ContinuousEnhancedTelemetrySender.WINDOW_MS,
				continuousOverlapMs: ContinuousEnhancedTelemetrySender.OVERLAP_MS,
				continuousEntriesCount: entries.length,
				continuousEntriesSize: entriesSize,
				continuousSequenceNumber: sequenceNumber,
			}
		);
	}

	private _collectGitMetadata(): { activeDocumentRepository: string | undefined; repositoryUrls: string[] | undefined } {
		const git = this._gitExtensionService.getExtensionApi();
		if (!git) {
			return { activeDocumentRepository: undefined, repositoryUrls: undefined };
		}

		const remoteUrlSet = new Set<string>();
		let activeDocumentRepository: string | undefined;

		for (const repository of git.repositories) {
			const remoteName = repository.state.HEAD?.upstream?.remote;
			const remote = repository.state.remotes.find(r => r.name === remoteName);
			if (remote?.fetchUrl) { remoteUrlSet.add(remote.fetchUrl); }
			if (remote?.pushUrl) { remoteUrlSet.add(remote.pushUrl); }
			if (activeDocumentRepository === undefined && remote?.fetchUrl) {
				activeDocumentRepository = remote.pushUrl || remote.fetchUrl;
			}
		}

		return {
			activeDocumentRepository,
			repositoryUrls: remoteUrlSet.size === 0 ? undefined : [...remoteUrlSet],
		};
	}
}

function hasAnyEdit(entries: LogEntry[]): boolean {
	for (const e of entries) {
		if (e.kind === 'changed') { return true; }
	}
	return false;
}
