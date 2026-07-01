/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffService, IDocumentDiff } from '../../../../platform/diff/common/diffService';
import { computeDiffSync } from '../../../../platform/diff/common/diffWorker';
import { toLineRangeMappings } from '../../../../platform/diff/node/diffServiceImpl';
import { ObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { createPlatformServices, TestingServiceCollection } from '../../../../platform/test/node/services';
import { LogEntry } from '../../../../platform/workspaceRecorder/common/workspaceLog';
import { runWithFakedTimers } from '../../../../util/common/timeTravelScheduler';
import { Emitter } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { derived, observableValue, transaction } from '../../../../util/vs/base/common/observableInternal';
import { isDefined } from '../../../../util/vs/base/common/types';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';
import { ILinesDiffComputerOptions, MovedText } from '../../../../util/vs/editor/common/diff/linesDiffComputer';
import { LineRangeMapping } from '../../../../util/vs/editor/common/diff/rangeMapping';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { VisualizationTestRun } from '../../../inlineChat/node/rendererVisualization';
import { waitForStateOrReturn } from '../../../prompts/node/test/summarizeDocumentPlayground';
import { IRecordableEditorLogEntry, IRecordableLogEntry, ITextModelEditReasonMetadata, IWorkspaceListenerService } from '../../../workspaceRecorder/common/workspaceListenerService';
import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../common/observableWorkspaceRecordingReplayer';

export interface IRunRecordingContext {
	testingServiceCollection: TestingServiceCollection;
	instantiationService: IInstantiationService;
	player: ObservableWorkspaceRecordingReplayer;
	store: DisposableStore;
	workspace: ObservableWorkspace;
	finishReplay(): void;
	step(): boolean;
	stepSkipNonContentChanges(): boolean;
}

export async function runRecording<T>(
	recording: IRecordingInformation | LogEntry[],
	run: ((ctx: IRunRecordingContext) => T | Promise<T>)
): Promise<T> {
	const globalStore = new DisposableStore();

	async function playRecordingWithFakedTimers(rec: IRecordingInformation) {
		globalStore.clear();

		return await runWithFakedTimers({ maxTaskCount: 10_000_000 }, async () => {
			return await playRecording(rec);
		});
	}

	async function playRecording(rec: IRecordingInformation) {
		VisualizationTestRun.startRun();

		VisualizationTestRun.instance!.addData('recording', () => {
			return playground;
		}, undefined, '.recording');

		VisualizationTestRun.instance!.addData('result', () => {
			return playground.getResult();
		});

		const r = new ObservableWorkspaceRecordingReplayer(rec);
		const store = new DisposableStore();
		store.add(r);

		const _onStructuredData = new Emitter<IRecordableLogEntry | IRecordableEditorLogEntry>();
		const onStructuredData = _onStructuredData.event;

		const _onHandleChangeReason = new Emitter<{ documentUri: string; documentVersion: number; reason: string; metadata: ITextModelEditReasonMetadata }>();
		const onHandleChangeReason = _onHandleChangeReason.event;

		const myS: IWorkspaceListenerService = {
			_serviceBrand: undefined,
			onHandleChangeReason: onHandleChangeReason,
			onStructuredData: onStructuredData,
		};

		store.add(r.onDocumentEvent(e => {
			// TODO: _onStructuredData.fire(e);
			if (e.data.sourceId === 'TextModel.setChangeReason') {
				_onHandleChangeReason.fire({
					documentUri: e.doc.id.toUri().toString(),
					documentVersion: e.data.v,
					reason: e.data.source,
					metadata: e.data,
				});
			}
		}));

		const s = createPlatformServices();
		s.define(IWorkspaceListenerService, myS);
		s.define(IDiffService, new SyncDiffService());
		let instantiationService: IInstantiationService | undefined;

		const result = await run({
			get testingServiceCollection() {
				if (instantiationService) {
					throw new Error('Already created instances!');
				}
				return s;
			},
			get instantiationService() {
				if (!instantiationService) {
					instantiationService = s.createTestingAccessor().get(IInstantiationService);
				}
				return instantiationService;
			},
			player: r,
			store,
			workspace: r.workspace,
			finishReplay: () => {
				while (r.step()) {
					// noop
				}
			},
			step: () => {
				return r.step();
			},
			stepSkipNonContentChanges: () => {
				while (r.step()) {
					const entry = r.getPreviousLogEntry();
					if (entry?.kind === 'changed') {
						return true;
					}
				}
				return false;
			}
		});

		globalStore.add(store);
		return result;
	}

	if (Array.isArray(recording)) {
		recording = { log: recording };
	}

	const result = await playRecordingWithFakedTimers(recording);

	const playground = new RecordingPlayground(
		JSON.stringify(result, undefined, 4),
		0,
		recording.log,
		async (recording, logEntryIdx) => {
			try {
				const result = await playRecordingWithFakedTimers({ log: recording.slice(0, logEntryIdx + 1) });
				if (typeof result === 'string') {
					return result;
				}
				return JSON.stringify(result, undefined, 4);
			} catch (e) {
				console.error(e);
				return JSON.stringify({ error: e });
			}
		}
	);

	return result;
}

export class RecordingPlayground<T> {
	private readonly _logEntryIdx = observableValue<number>(this, 0);
	private readonly _initialResult = observableValue<T | undefined>(this, undefined);

	constructor(
		result: T,
		logEntryIdx: number,
		private readonly _recording: readonly LogEntry[],
		private readonly _getUpdatedResult: (recording: readonly LogEntry[], stepIdx: number) => T | Promise<T>

	) {
		transaction(tx => {
			this._initialResult.set(result, tx);
			this._logEntryIdx.set(logEntryIdx, tx);
		});

		this._result.recomputeInitiallyAndOnChange(this._store);
	}

	get recording(): IRecordingDoc {
		return {
			...{ $fileExtension: 'recording.w.json' },
			log: this._recording,
			logEntryIdx: this._logEntryIdx.get(),
			writeStep: true,
		};
	}

	set recording(value: IRecordingDoc) {
		transaction(tx => {
			this._initialResult.set(undefined, tx);
			this._logEntryIdx.set(value.logEntryIdx ?? 0, tx);
		});
	}

	private readonly _store = new DisposableStore();

	private readonly _result = derived(this, reader => {
		const r = this._initialResult.read(reader);
		if (r) { return r; }

		return this._getUpdatedResult(this._recording, this._logEntryIdx.read(reader));
	});

	getResult() {
		return waitForStateOrReturn(this._result, isDefined);
	}
}

interface IRecordingDoc {
	log: readonly LogEntry[];
	logEntryIdx?: number;
	writeStep: true;
}

/** This is to avoid non-deterministic race conditions. */
export class SyncDiffService implements IDiffService {
	readonly _serviceBrand: undefined;

	computeDiff(original: string, modified: string, options: ILinesDiffComputerOptions): Promise<IDocumentDiff> {
		const result = computeDiffSync(original, modified, options);
		// Convert from space efficient JSON data to rich objects.
		const diff: IDocumentDiff = {
			identical: result.identical,
			quitEarly: result.quitEarly,
			changes: toLineRangeMappings(result.changes),
			moves: result.moves.map(m => new MovedText(
				new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])),
				toLineRangeMappings(m[4])
			))
		};
		return Promise.resolve(diff);
	}
}
