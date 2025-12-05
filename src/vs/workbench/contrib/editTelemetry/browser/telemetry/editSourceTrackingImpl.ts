/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reverseOrder, compareBy, numberComparator, sumBy } from '../../../../../base/common/arrays.js';
import { IntervalTimer, TimeoutTimer } from '../../../../../base/common/async.js';
import { toDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { mapObservableArrayCached, derived, IObservable, observableSignal, runOnChange, autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserAttentionService } from '../../../../services/userAttention/common/userAttentionService.js';
import { AnnotatedDocument, IAnnotatedDocuments } from '../helpers/annotatedDocuments.js';
import { CreateSuggestionIdForChatOrInlineChatCaller, EditTelemetryReportEditArcForChatOrInlineChatSender, EditTelemetryReportInlineEditArcSender } from './arcTelemetrySender.js';
import { createDocWithJustReason, EditSource } from '../helpers/documentWithAnnotatedEdits.js';
import { DocumentEditSourceTracker, TrackedEdit } from './editTracker.js';
import { sumByCategory } from '../helpers/utils.js';
import { ScmAdapter, ScmRepoAdapter } from './scmAdapter.js';
import { IRandomService } from '../randomService.js';

export class EditSourceTrackingImpl extends Disposable {
	public readonly docsState;
	private readonly _states;

	constructor(
		private readonly _statsEnabled: IObservable<boolean>,
		private readonly _annotatedDocuments: IAnnotatedDocuments,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const scmBridge = this._instantiationService.createInstance(ScmAdapter);
		this._states = mapObservableArrayCached(this, this._annotatedDocuments.documents, (doc, store) => {
			return [doc.document, store.add(this._instantiationService.createInstance(TrackedDocumentInfo, doc, scmBridge, this._statsEnabled))] as const;
		});
		this.docsState = this._states.map((entries) => new Map(entries));

		this.docsState.recomputeInitiallyAndOnChange(this._store);
	}
}

class TrackedDocumentInfo extends Disposable {
	public readonly longtermTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;
	public readonly windowedTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;
	public readonly windowedFocusTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;

	private readonly _repo: IObservable<ScmRepoAdapter | undefined>;

	constructor(
		private readonly _doc: AnnotatedDocument,
		private readonly _scm: ScmAdapter,
		private readonly _statsEnabled: IObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IRandomService private readonly _randomService: IRandomService,
		@IUserAttentionService private readonly _userAttentionService: IUserAttentionService,
	) {
		super();

		this._repo = derived(this, reader => this._scm.getRepo(_doc.document.uri, reader));

		const docWithJustReason = createDocWithJustReason(_doc.documentWithAnnotations, this._store);

		const longtermResetSignal = observableSignal('resetSignal');

		let longtermReason: '10hours' | 'hashChange' | 'branchChange' | 'closed' = 'closed';
		this.longtermTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }
			longtermResetSignal.read(reader);

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(() => {
				// send long term document telemetry
				if (!t.isEmpty()) {
					this.sendTelemetry('longterm', longtermReason, t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
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

		// Reset on branch change or commit
		this._store.add(autorun(reader => {
			const repo = this._repo.read(reader);
			if (repo) {
				reader.store.add(runOnChange(repo.headCommitHashObs, () => {
					longtermReason = 'hashChange';
					longtermResetSignal.trigger(undefined);
					longtermReason = 'closed';
				}));
				reader.store.add(runOnChange(repo.headBranchNameObs, () => {
					longtermReason = 'branchChange';
					longtermResetSignal.trigger(undefined);
					longtermReason = 'closed';
				}));
			}
		}));

		this._store.add(this._instantiationService.createInstance(EditTelemetryReportInlineEditArcSender, _doc.documentWithAnnotations, this._repo));
		this._store.add(this._instantiationService.createInstance(EditTelemetryReportEditArcForChatOrInlineChatSender, _doc.documentWithAnnotations, this._repo));
		this._store.add(this._instantiationService.createInstance(CreateSuggestionIdForChatOrInlineChatCaller, _doc.documentWithAnnotations));

		// Wall-clock time based 5-minute window tracker
		const resetSignal = observableSignal('resetSignal');

		this.windowedTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }

			if (!this._doc.isVisible.read(reader)) {
				return undefined;
			}
			resetSignal.read(reader);

			// Reset after 5 minutes of wall-clock time
			reader.store.add(new TimeoutTimer(() => {
				resetSignal.trigger(undefined);
			}, 5 * 60 * 1000));

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(async () => {
				// send windowed document telemetry
				this.sendTelemetry('5minWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
				t.dispose();
			}));

			return t;
		}).recomputeInitiallyAndOnChange(this._store);

		// Focus time based 5-minute window tracker
		const focusResetSignal = observableSignal('focusResetSignal');

		this.windowedFocusTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }

			if (!this._doc.isVisible.read(reader)) {
				return undefined;
			}
			focusResetSignal.read(reader);

			// Reset after 5 minutes of accumulated focus time
			reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(5 * 60 * 1000, () => {
				focusResetSignal.trigger(undefined);
			}));

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(async () => {
				// send focus-windowed document telemetry
				this.sendTelemetry('5minFocusWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
				t.dispose();
			}));

			return t;
		}).recomputeInitiallyAndOnChange(this._store);

	}

	async sendTelemetry(mode: 'longterm' | '5minWindow' | '5minFocusWindow', trigger: string, t: DocumentEditSourceTracker, focusTime: number, actualTime: number) {
		const ranges = t.getTrackedRanges();
		const keys = t.getAllKeys();
		if (keys.length === 0) {
			return;
		}

		const data = this.getTelemetryData(ranges);

		const statsUuid = this._randomService.generateUuid();

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
				comment: 'Provides detailed character count breakdown for individual edit sources (typing, paste, inline completions, NES, etc.) within a session. Reports the top 10-30 sources per session with granular metadata including extension IDs and model IDs for AI edits. Sessions are scoped to either 5-minute wall-clock time windows, 5-minute focus time windows for visible documents, or longer periods ending on branch changes, commits, or 10-hour intervals. Focus time is computed as the accumulated time where VS Code has focus and there was recent user activity (within the last minute). This event complements editSources.stats by providing source-specific details. @sentToGitHub';

				mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Describes the session mode. Is either \'longterm\', \'5minWindow\', or \'5minFocusWindow\'.' };
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
			focusTime: number;
			actualTime: number;
			trigger: string;
		}, {
			owner: 'hediet';
			comment: 'Aggregates character counts by edit source category (user typing, AI completions, NES, IDE actions, external changes) for each editing session. Sessions represent units of work and end when documents close, branches change, commits occur, or time limits are reached (5 minutes of wall-clock time, 5 minutes of focus time for visible documents, or 10 hours otherwise). Focus time is computed as accumulated 1-minute blocks where VS Code has focus and there was recent user activity. Tracks both total characters inserted and characters remaining at session end to measure retention. This high-level summary complements editSources.details which provides granular per-source breakdowns. @sentToGitHub';

			mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'longterm, 5minWindow, or 5minFocusWindow' };
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
			focusTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The focus time in ms during the session.'; isMeasurement: true };
			actualTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The actual time in ms during the session.'; isMeasurement: true };
			trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates why the session ended.' };
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
			focusTime,
			actualTime,
			trigger,
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
			isTrackedByGit: this._repo.get()?.isIgnored(this._doc.document.uri),
		};
	}
}
