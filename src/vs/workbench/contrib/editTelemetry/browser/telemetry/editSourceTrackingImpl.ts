/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reverseOrder, compareBy, numberComparator, sumBy } from '../../../../../base/common/arrays.js';
import { IntervalTimer, TimeoutTimer } from '../../../../../base/common/async.js';
import { toDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { mapObservableArrayCached, derived, IObservable, observableSignal, runOnChange } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ISCMRepository, ISCMService } from '../../../scm/common/scm.js';
import { AnnotatedDocuments, AnnotatedDocument } from '../helpers/annotatedDocuments.js';
import { AiEditTelemetryAdapter, ChatArcTelemetrySender, InlineEditArcTelemetrySender } from './arcTelemetrySender.js';
import { createDocWithJustReason, EditSource } from '../helpers/documentWithAnnotatedEdits.js';
import { DocumentEditSourceTracker, TrackedEdit } from './editTracker.js';
import { sumByCategory } from '../helpers/utils.js';

export class EditSourceTrackingImpl extends Disposable {
	public readonly docsState;

	constructor(
		private readonly _statsEnabled: IObservable<boolean>,
		private readonly _annotatedDocuments: AnnotatedDocuments,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const scmBridge = this._instantiationService.createInstance(ScmBridge);
		const states = mapObservableArrayCached(this, this._annotatedDocuments.documents, (doc, store) => {
			return [doc.document, store.add(this._instantiationService.createInstance(TrackedDocumentInfo, doc, scmBridge, this._statsEnabled))] as const;
		});
		this.docsState = states.map((entries) => new Map(entries));

		this.docsState.recomputeInitiallyAndOnChange(this._store);
	}
}

class TrackedDocumentInfo extends Disposable {
	public readonly longtermTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;
	public readonly windowedTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;

	private readonly _repo: Promise<ScmRepoBridge | undefined>;

	constructor(
		private readonly _doc: AnnotatedDocument,
		private readonly _scm: ScmBridge,
		private readonly _statsEnabled: IObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		const docWithJustReason = createDocWithJustReason(_doc.documentWithAnnotations, this._store);

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
			const repo = await this._scm.getRepo(_doc.document.uri);
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

			this._store.add(this._instantiationService.createInstance(InlineEditArcTelemetrySender, _doc.documentWithAnnotations, repo));
			this._store.add(this._instantiationService.createInstance(ChatArcTelemetrySender, _doc.documentWithAnnotations, repo));
			this._store.add(this._instantiationService.createInstance(AiEditTelemetryAdapter, _doc.documentWithAnnotations));
		})();

		const resetSignal = observableSignal('resetSignal');

		this.windowedTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }

			if (!this._doc.isVisible.read(reader)) {
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

		this._repo = this._scm.getRepo(_doc.document.uri);
	}

	async sendTelemetry(mode: 'longterm' | '5minWindow', trigger: string, t: DocumentEditSourceTracker) {
		const ranges = t.getTrackedRanges();
		const keys = t.getAllKeys();
		if (keys.length === 0) {
			return;
		}

		const data = this.getTelemetryData(ranges);

		const statsUuid = generateUuid();

		const sums = sumByCategory(ranges, r => r.range.length, r => r.sourceKey);
		const entries = Object.entries(sums).filter(([key, value]) => value !== undefined);
		entries.sort(reverseOrder(compareBy(([key, value]) => value!, numberComparator)));
		entries.length = mode === 'longterm' ? 30 : 10;

		for (const key of keys) {
			if (!sums[key]) {
				sums[key] = 0;
			}
		}

		for (const [key, value] of Object.entries(sums)) {
			if (value === undefined) {
				continue;
			}

			const repr = t.getRepresentative(key)!;
			const deltaModifiedCount = t.getTotalInsertedCharactersCount(key);

			this._telemetryService.publicLog2<{
				mode: string;
				sourceKey: string;

				sourceKeyCleaned: string;
				extensionId: string | undefined;
				extensionVersion: string | undefined;
				modelId: string | undefined;

				trigger: string;
				languageId: string;
				statsUuid: string;
				modifiedCount: number;
				deltaModifiedCount: number;
				totalModifiedCount: number;
			}, {
				owner: 'hediet';
				comment: 'Reports distribution of various edit sources per session.';

				mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Describes the session mode. Is either longterm or 5minWindow.' };
				sourceKey: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A description of the source of the edit.' };

				sourceKeyCleaned: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source of the edit with some properties (such as extensionId, extensionVersion and modelId) removed.' };
				extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id.' };
				extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
				modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The LLM id.' };

				languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };
				statsUuid: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The unique identifier of the session for which stats are reported. The sourceKey is unique in this session.' };

				trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates why the session ended.' };

				modifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of characters inserted by the given edit source during the session that are still in the text document at the end of the session.'; isMeasurement: true };
				deltaModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of characters inserted by the given edit source during the session.'; isMeasurement: true };
				totalModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of characters inserted by any edit source during the session that are still in the text document at the end of the session.'; isMeasurement: true };

			}>('editTelemetry.editSources.details', {
				mode,
				sourceKey: key,

				sourceKeyCleaned: repr.toKey(1, { $extensionId: false, $extensionVersion: false, $modelId: false }),
				extensionId: repr.props.$extensionId,
				extensionVersion: repr.props.$extensionVersion,
				modelId: repr.props.$modelId,

				trigger,
				languageId: this._doc.document.languageId.get(),
				statsUuid: statsUuid,
				modifiedCount: value,
				deltaModifiedCount: deltaModifiedCount,
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
			languageId: this._doc.document.languageId.get(),
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
			if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'completions') { return 'inlineCompletionsCopilot'; }
			if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'nes') { return 'inlineCompletionsNES'; }
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
			languageId: this._doc.document.languageId.get(),
			isTrackedByGit: this._repo.then(async (repo) => !!repo && !await repo.isIgnored(this._doc.document.uri)),
		};
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

export class ScmRepoBridge {
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
