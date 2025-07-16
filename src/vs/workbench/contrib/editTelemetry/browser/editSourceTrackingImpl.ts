/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reverseOrder, compareBy, numberComparator, sumBy } from '../../../../base/common/arrays.js';
import { IntervalTimer, TimeoutTimer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { toDisposable, DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { mapObservableArrayCached, derived, IReader, IObservable, observableSignal, runOnChange, IObservableWithChange, observableValue, transaction, derivedObservableWithCache } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { AnnotatedStringEdit, BaseStringEdit } from '../../../../editor/common/core/edits/stringEdit.js';
import { StringText } from '../../../../editor/common/core/text/abstractText.js';
import { TextModelEditReason } from '../../../../editor/common/textModelEditReason.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ISCMRepository, ISCMService } from '../../scm/common/scm.js';
import { ArcTracker } from './arcTracker.js';
import { CombineStreamedChanges, DocumentWithSourceAnnotatedEdits, EditKeySourceData, EditSource, EditSourceData, IDocumentWithAnnotatedEdits, MinimizeEditsProcessor } from './documentWithAnnotatedEdits.js';
import { DocumentEditSourceTracker, TrackedEdit } from './editTracker.js';
import { ObservableWorkspace, IObservableDocument } from './observableWorkspace.js';

export class EditSourceTrackingImpl extends Disposable {
	public readonly docsState;

	constructor(
		private readonly _workspace: ObservableWorkspace,
		private readonly _docIsVisible: (doc: IObservableDocument, reader: IReader) => boolean,
		private readonly _statsEnabled: IObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const scmBridge = this._instantiationService.createInstance(ScmBridge);

		const states = mapObservableArrayCached(this, this._workspace.documents, (doc, store) => {
			const docIsVisible = derived(reader => this._docIsVisible(doc, reader));
			const wasEverVisible = derivedObservableWithCache<boolean>(this, (reader, lastVal) => lastVal || docIsVisible.read(reader));
			return wasEverVisible.map(v => v ? [doc, store.add(this._instantiationService.createInstance(TrackedDocumentInfo, doc, docIsVisible, scmBridge, this._statsEnabled))] as const : undefined);
		});

		this.docsState = states.map((entries, reader) => new Map(entries.map(e => e.read(reader)).filter(isDefined)))
			.recomputeInitiallyAndOnChange(this._store);
	}
}

class ScmBridge {
	constructor(
		@ISCMService private readonly _scmService: ISCMService
	) { }

	public async getRepo(uri: URI): Promise<ScmRepoBridge | undefined> {
		const repo = this._scmService.getRepository(uri);
		if (!repo) {
			return undefined;
		}
		return new ScmRepoBridge(repo);
	}
}

class ScmRepoBridge {
	public readonly headBranchNameObs: IObservable<string | undefined> = derived(reader => this._repo.provider.historyProvider.read(reader)?.historyItemRef.read(reader)?.name);
	public readonly headCommitHashObs: IObservable<string | undefined> = derived(reader => this._repo.provider.historyProvider.read(reader)?.historyItemRef.read(reader)?.revision);

	constructor(
		private readonly _repo: ISCMRepository,
	) {
	}

	async isIgnored(uri: URI): Promise<boolean> {
		return false;
	}
}

class TrackedDocumentInfo extends Disposable {
	public readonly longtermTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;
	public readonly windowedTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;

	private readonly _repo: Promise<ScmRepoBridge | undefined>;

	constructor(
		private readonly _doc: IObservableDocument,
		docIsVisible: IObservable<boolean>,
		private readonly _scm: ScmBridge,
		private readonly _statsEnabled: IObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		// Use the listener service and special events from core to annotate where an edit came from (is async)
		let processedDoc: IDocumentWithAnnotatedEdits<EditSourceData> = this._store.add(new DocumentWithSourceAnnotatedEdits(_doc));
		// Combine streaming edits into one and make edit smaller
		processedDoc = this._store.add(this._instantiationService.createInstance((CombineStreamedChanges<EditSourceData>), processedDoc));
		// Remove common suffix and prefix from edits
		processedDoc = this._store.add(new MinimizeEditsProcessor(processedDoc));

		const docWithJustReason = createDocWithJustReason(processedDoc, this._store);

		const longtermResetSignal = observableSignal('resetSignal');

		let longtermReason: '10hours' | 'hashChange' | 'branchChange' | 'closed' = 'closed';
		this.longtermTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }
			longtermResetSignal.read(reader);

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
			reader.store.add(toDisposable(() => {
				// send long term document telemetry
				if (!t.isEmpty()) {
					this.sendTelemetry('longterm', longtermReason, t);
				}
				t.dispose();
			}));
			return t;
		}).recomputeInitiallyAndOnChange(this._store);

		this._store.add(new IntervalTimer()).cancelAndSet(() => {
			// Reset after 10 hours
			longtermReason = '10hours';
			longtermResetSignal.trigger(undefined);
			longtermReason = 'closed';
		}, 10 * 60 * 60 * 1000);

		(async () => {
			const repo = await this._scm.getRepo(_doc.uri);
			if (this._store.isDisposed) {
				return;
			}
			// Reset on branch change or commit
			if (repo) {
				this._store.add(runOnChange(repo.headCommitHashObs, () => {
					longtermReason = 'hashChange';
					longtermResetSignal.trigger(undefined);
					longtermReason = 'closed';
				}));
				this._store.add(runOnChange(repo.headBranchNameObs, () => {
					longtermReason = 'branchChange';
					longtermResetSignal.trigger(undefined);
					longtermReason = 'closed';
				}));
			}

			this._store.add(this._instantiationService.createInstance(ArcTelemetrySender, processedDoc, repo));
		})();

		const resetSignal = observableSignal('resetSignal');

		this.windowedTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }

			if (!docIsVisible.read(reader)) {
				return undefined;
			}
			resetSignal.read(reader);

			reader.store.add(new TimeoutTimer(() => {
				// Reset after 5 minutes
				resetSignal.trigger(undefined);
			}, 5 * 60 * 1000));

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
			reader.store.add(toDisposable(async () => {
				// send long term document telemetry
				this.sendTelemetry('5minWindow', 'time', t);
				t.dispose();
			}));

			return t;
		}).recomputeInitiallyAndOnChange(this._store);

		this._repo = this._scm.getRepo(_doc.uri);
	}

	async sendTelemetry(mode: 'longterm' | '5minWindow', trigger: string, t: DocumentEditSourceTracker) {
		const ranges = t.getTrackedRanges();
		if (ranges.length === 0) {
			return;
		}

		const data = this.getTelemetryData(ranges);


		const statsUuid = generateUuid();

		const sourceKeyToRepresentative = new Map<string, TextModelEditReason>();
		for (const r of ranges) {
			sourceKeyToRepresentative.set(r.sourceKey, r.sourceRepresentative);
		}

		const sums = sumByCategory(ranges, r => r.range.length, r => r.sourceKey);
		const entries = Object.entries(sums).filter(([key, value]) => value !== undefined);
		entries.sort(reverseOrder(compareBy(([key, value]) => value!, numberComparator)));
		entries.length = mode === 'longterm' ? 30 : 10;

		for (const [key, value] of Object.entries(sums)) {
			if (value === undefined) {
				continue;
			}


			const repr = sourceKeyToRepresentative.get(key);
			const cleanedKey = repr?.toKey(1, { $extensionId: false, $extensionVersion: false });

			const metadata = repr?.metadata;
			const extensionId = metadata && '$extensionId' in metadata ? metadata.$extensionId : undefined;
			const extensionVersion = metadata && '$extensionVersion' in metadata ? metadata.$extensionVersion : undefined;

			const m = t.getChangedCharactersCount(key);

			this._telemetryService.publicLog2<{
				mode: string;
				sourceKey: string;
				extensionId: string;
				extensionVersion: string;
				sourceKeyWithoutExtId: string;
				trigger: string;
				languageId: string;
				statsUuid: string;
				modifiedCount: number;
				deltaModifiedCount: number;
				totalModifiedCount: number;
			}, {
				owner: 'hediet';
				comment: 'Reports distribution of various edit kinds.';

				sourceKey: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source of the edit.' };
				mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'longterm or 5minWindow' };
				languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };
				statsUuid: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The unique identifier for the telemetry event.' };
				extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id which provided this inline completion.' };
				extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
				sourceKeyWithoutExtId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source of the edit.' };
				trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The trigger for the telemetry event.' };

				modifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of nes modified characters'; isMeasurement: true };
				deltaModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Delta of modified characters'; isMeasurement: true };
				totalModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Total number of characters'; isMeasurement: true };

			}>('editTelemetry.editSources.details', {
				mode,
				sourceKey: key,
				extensionId: extensionId ?? '',
				extensionVersion: extensionVersion ?? '',
				sourceKeyWithoutExtId: cleanedKey ?? '',
				trigger,
				languageId: this._doc.languageId.get(),
				statsUuid: statsUuid,
				modifiedCount: value,
				deltaModifiedCount: m,
				totalModifiedCount: data.totalModifiedCharactersInFinalState,
			});
		}


		const isTrackedByGit = await data.isTrackedByGit;
		this._telemetryService.publicLog2<{
			mode: string;
			languageId: string;
			statsUuid: string;
			nesModifiedCount: number;
			inlineCompletionsCopilotModifiedCount: number;
			inlineCompletionsNESModifiedCount: number;
			otherAIModifiedCount: number;
			unknownModifiedCount: number;
			userModifiedCount: number;
			ideModifiedCount: number;
			totalModifiedCharacters: number;
			externalModifiedCount: number;
			isTrackedByGit: number;
		}, {
			owner: 'hediet';
			comment: 'Reports distribution of AI vs user edited characters.';

			mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'longterm or 5minWindow' };
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };
			statsUuid: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The unique identifier for the telemetry event.' };

			nesModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of nes modified characters'; isMeasurement: true };
			inlineCompletionsCopilotModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of inline completions copilot modified characters'; isMeasurement: true };
			inlineCompletionsNESModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of inline completions nes modified characters'; isMeasurement: true };
			otherAIModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of other AI modified characters'; isMeasurement: true };
			unknownModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of unknown modified characters'; isMeasurement: true };
			userModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of user modified characters'; isMeasurement: true };
			ideModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of IDE modified characters'; isMeasurement: true };
			totalModifiedCharacters: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Total modified characters'; isMeasurement: true };
			externalModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of external modified characters'; isMeasurement: true };
			isTrackedByGit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the document is tracked by git.' };
		}>('editTelemetry.editSources.stats', {
			mode,
			languageId: this._doc.languageId.get(),
			statsUuid: statsUuid,
			nesModifiedCount: data.nesModifiedCount,
			inlineCompletionsCopilotModifiedCount: data.inlineCompletionsCopilotModifiedCount,
			inlineCompletionsNESModifiedCount: data.inlineCompletionsNESModifiedCount,
			otherAIModifiedCount: data.otherAIModifiedCount,
			unknownModifiedCount: data.unknownModifiedCount,
			userModifiedCount: data.userModifiedCount,
			ideModifiedCount: data.ideModifiedCount,
			totalModifiedCharacters: data.totalModifiedCharactersInFinalState,
			externalModifiedCount: data.externalModifiedCount,
			isTrackedByGit: isTrackedByGit ? 1 : 0,
		});
	}

	getTelemetryData(ranges: readonly TrackedEdit[]) {
		const getEditCategory = (source: EditSource) => {
			if (source.category === 'ai' && source.kind === 'nes') { return 'nes'; }
			if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot') { return 'inlineCompletionsCopilot'; }
			if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat') { return 'inlineCompletionsNES'; }
			if (source.category === 'ai' && source.kind === 'completion') { return 'inlineCompletionsOther'; }
			if (source.category === 'ai') { return 'otherAI'; }
			if (source.category === 'user') { return 'user'; }
			if (source.category === 'ide') { return 'ide'; }
			if (source.category === 'external') { return 'external'; }
			if (source.category === 'unknown') { return 'unknown'; }

			return 'unknown';
		};

		const sums = sumByCategory(ranges, r => r.range.length, r => getEditCategory(r.source));
		const totalModifiedCharactersInFinalState = sumBy(ranges, r => r.range.length);

		return {
			nesModifiedCount: sums.nes ?? 0,
			inlineCompletionsCopilotModifiedCount: sums.inlineCompletionsCopilot ?? 0,
			inlineCompletionsNESModifiedCount: sums.inlineCompletionsNES ?? 0,
			otherAIModifiedCount: sums.otherAI ?? 0,
			userModifiedCount: sums.user ?? 0,
			ideModifiedCount: sums.ide ?? 0,
			unknownModifiedCount: sums.unknown ?? 0,
			externalModifiedCount: sums.external ?? 0,
			totalModifiedCharactersInFinalState,
			languageId: this._doc.languageId.get(),
			isTrackedByGit: this._repo.then(async (repo) => !!repo && !await repo.isIgnored(this._doc.uri)),
		};
	}
}


function mapObservableDelta<T, TDelta, TDeltaNew>(obs: IObservableWithChange<T, TDelta>, mapFn: (value: TDelta) => TDeltaNew, store: DisposableStore): IObservableWithChange<T, TDeltaNew> {
	const obsResult = observableValue<T, TDeltaNew>('mapped', obs.get());
	store.add(runOnChange(obs, (value, _prevValue, changes) => {
		transaction(tx => {
			for (const c of changes) {
				obsResult.set(value, tx, mapFn(c));
			}
		});
	}));
	return obsResult;
}

/**
 * Removing the metadata allows touching edits from the same source to merged, even if they were caused by different actions (e.g. two user edits).
 */
function createDocWithJustReason(docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>, store: DisposableStore): IDocumentWithAnnotatedEdits<EditKeySourceData> {
	const docWithJustReason: IDocumentWithAnnotatedEdits<EditKeySourceData> = {
		value: mapObservableDelta(docWithAnnotatedEdits.value, edit => ({ edit: edit.edit.mapData(d => d.data.toEditSourceData()) }), store),
		waitForQueue: () => docWithAnnotatedEdits.waitForQueue(),
	};
	return docWithJustReason;
}

class ArcTelemetrySender extends Disposable {
	constructor(
		docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>,
		scmRepoBridge: ScmRepoBridge | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(runOnChange(docWithAnnotatedEdits.value, (_val, _prev, changes) => {
			const edit = AnnotatedStringEdit.compose(changes.map(c => c.edit));

			if (!edit.replacements.some(r => r.data.editReason.metadata.source === 'inlineCompletionAccept')) {
				return;
			}
			if (!edit.replacements.every(r => r.data.editReason.metadata.source === 'inlineCompletionAccept')) {
				onUnexpectedError(new Error('ArcTelemetrySender: Not all edits are inline completion accept edits!'));
				return;
			}
			if (edit.replacements[0].data.editReason.metadata.source !== 'inlineCompletionAccept') {
				return;
			}
			const data = edit.replacements[0].data.editReason.metadata;

			const docWithJustReason = createDocWithJustReason(docWithAnnotatedEdits, this._store);
			const reporter = this._instantiationService.createInstance(ArcTelemetryReporter, docWithJustReason, scmRepoBridge, edit, res => {
				res.telemetryService.publicLog2<{
					extensionId: string;
					extensionVersion: string;
					opportunityId: string;
					didBranchChange: number;
					timeDelayMs: number;
					arc: number;
					originalCharCount: number;
				}, {
					owner: 'hediet';
					comment: 'Reports the accepted and retained character count for an inline completion/edit.';

					extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id (copilot or copilot-chat); which provided this inline completion.' };
					extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
					opportunityId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for an opportunity to show an inline completion or NES.' };

					didBranchChange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates if the branch changed in the meantime. If the branch changed (value is 1); this event should probably be ignored.' };
					timeDelayMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time delay between the user accepting the edit and measuring the survival rate.' };
					arc: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The accepted and restrained character count.' };
					originalCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original character count before any edits.' };
				}>('editTelemetry.reportInlineEditArc', {
					extensionId: data.$extensionId ?? '',
					extensionVersion: data.$extensionVersion ?? '',
					opportunityId: data.$$requestUuid ?? 'unknown',
					didBranchChange: res.didBranchChange ? 1 : 0,
					timeDelayMs: res.timeDelayMs,
					arc: res.arc,
					originalCharCount: res.originalCharCount,
				});
			});

			this._register(toDisposable(() => {
				reporter.cancel();
			}));
		}));
	}
}

export interface EditTelemetryData {
	telemetryService: ITelemetryService;
	timeDelayMs: number;
	didBranchChange: boolean;
	arc: number;
	originalCharCount: number;
}

export class ArcTelemetryReporter {
	private readonly _store = new DisposableStore();
	private readonly _arcTracker;
	private readonly _initialBranchName: string | undefined;

	constructor(
		private readonly _document: { value: IObservableWithChange<StringText, { edit: BaseStringEdit }> },
		// _markedEdits -> document.value
		private readonly _gitRepo: ScmRepoBridge | undefined,
		private readonly _trackedEdit: BaseStringEdit,
		private readonly _sendTelemetryEvent: (res: EditTelemetryData) => void,

		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._arcTracker = new ArcTracker(this._document.value.get().value, this._trackedEdit);

		this._store.add(runOnChange(this._document.value, (_val, _prevVal, changes) => {
			const edit = BaseStringEdit.composeOrUndefined(changes.map(c => c.edit));
			if (edit) {
				this._arcTracker.handleEdits(edit);
			}
		}));

		this._initialBranchName = this._gitRepo?.headBranchNameObs.get();

		// This aligns with github inline completions
		this._report(0); // for debugging
		this._reportAfter(30 * 1000);
		this._reportAfter(120 * 1000);
		this._reportAfter(300 * 1000);
		this._reportAfter(600 * 1000);
		// track up to 15min to allow for slower edit responses from legacy SD endpoint
		this._reportAfter(900 * 1000, () => {
			this._store.dispose();
		});
	}

	private _reportAfter(timeoutMs: number, cb?: () => void) {
		const timer = new TimeoutTimer(() => {
			this._report(timeoutMs);
			timer.dispose();
			if (cb) {
				cb();
			}
		}, timeoutMs);
		this._store.add(timer);
	}

	private _report(timeMs: number): void {
		const currentBranch = this._gitRepo?.headBranchNameObs.get();
		const didBranchChange = currentBranch !== this._initialBranchName;

		this._sendTelemetryEvent({
			telemetryService: this._telemetryService,
			timeDelayMs: timeMs,
			didBranchChange,
			arc: this._arcTracker.getAcceptedRestrainedCharactersCount(),
			originalCharCount: this._arcTracker.getOriginalCharacterCount(),
		});
	}

	public cancel(): void {
		this._store.dispose();
	}
}

function sumByCategory<T, TCategory extends string>(items: readonly T[], getValue: (item: T) => number, getCategory: (item: T) => TCategory): Record<TCategory, number | undefined> {
	return items.reduce((acc, item) => {
		const category = getCategory(item);
		acc[category] = (acc[category] || 0) + getValue(item);
		return acc;
	}, {} as any as Record<TCategory, number>);
}
