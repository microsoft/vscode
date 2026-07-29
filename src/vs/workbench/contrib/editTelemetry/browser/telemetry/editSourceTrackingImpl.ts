/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reverseOrder, compareBy, numberComparator, sumBy } from '../../../../../base/common/arrays.js';
import { IntervalTimer } from '../../../../../base/common/async.js';
import { toDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { mapObservableArrayCached, derived, IObservable, observableSignal, runOnChange, autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditTelemetryMode, EditTelemetryTrigger, sendEditSourcesDetailsTelemetry } from '../../../../../platform/telemetry/common/editTelemetry.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { IUserAttentionService } from '../../../../services/userAttention/common/userAttentionService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AnnotatedDocument, IAnnotatedDocuments } from '../helpers/annotatedDocuments.js';
import { CreateSuggestionIdForChatOrInlineChatCaller, EditTelemetryReportEditArcForChatOrInlineChatSender, EditTelemetryReportInlineEditArcSender } from './arcTelemetrySender.js';
import { createDocWithJustReason, EditSource } from '../helpers/documentWithAnnotatedEdits.js';
import { DocumentEditSourceTracker, TrackedEdit } from './editTracker.js';
import { sumByCategory } from '../helpers/utils.js';
import { IScmRepoAdapter, ScmAdapter } from './scmAdapter.js';
import { IRandomService } from '../randomService.js';
import { AgentHostEditAttributionDeferredError, AgentHostEditAttributionUnknownOutcomeError, IAgentHostEditMarkerService, IPreparedAgentHostEditAttributionFlush } from './agentHostEditMarkerService.js';

export type EditTelemetryCategory = 'nes' | 'inlineCompletionsCopilot' | 'inlineCompletionsNES' | 'inlineCompletionsOther' | 'otherAI' | 'user' | 'ide' | 'external' | 'unknown';

export function getEditTelemetryCategory(source: EditSource): EditTelemetryCategory {
	if (source.category === 'ai' && source.kind === 'nes') { return 'nes'; }

	if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot') { return 'inlineCompletionsCopilot'; }
	if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'nes') { return 'inlineCompletionsNES'; }
	if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'completions') { return 'inlineCompletionsCopilot'; }
	if (source.category === 'ai' && source.kind === 'completion') { return 'inlineCompletionsOther'; }

	if (source.category === 'ai') { return 'otherAI'; }
	if (source.category === 'user') { return 'user'; }
	if (source.category === 'ide') { return 'ide'; }
	if (source.category === 'external') { return 'external'; }
	return 'unknown';
}

export class EditSourceTrackingImpl extends Disposable {
	public readonly docsState;
	private readonly _states;

	constructor(
		private readonly _statsEnabled: IObservable<boolean>,
		private readonly _annotatedDocuments: IAnnotatedDocuments,
		private readonly _agentHostEditMarkerService: IAgentHostEditMarkerService | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const scmBridge = this._instantiationService.createInstance(ScmAdapter);
		this._states = mapObservableArrayCached(this, this._annotatedDocuments.documents, (doc, store) => {
			return [doc.document, store.add(this._instantiationService.createInstance(TrackedDocumentInfo, doc, scmBridge, this._statsEnabled, this._agentHostEditMarkerService))] as const;
		});
		this.docsState = this._states.map((entries) => new Map(entries));

		this.docsState.recomputeInitiallyAndOnChange(this._store);
	}
}

class TrackedDocumentInfo extends Disposable {
	public readonly longtermTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;
	public readonly windowedTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;
	public readonly windowedFocusTracker: IObservable<DocumentEditSourceTracker<undefined> | undefined>;

	private readonly _repo: IObservable<IScmRepoAdapter | undefined>;

	constructor(
		private readonly _doc: AnnotatedDocument,
		private readonly _scm: ScmAdapter,
		private readonly _statsEnabled: IObservable<boolean>,
		private readonly _agentHostEditMarkerService: IAgentHostEditMarkerService | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IRandomService private readonly _randomService: IRandomService,
		@IUserAttentionService private readonly _userAttentionService: IUserAttentionService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._repo = derived(this, reader => this._scm.getRepo(_doc.document.uri, reader));

		const docWithJustReason = createDocWithJustReason(_doc.documentWithAnnotations, this._store);
		const externalEditCorrelation = this._agentHostEditMarkerService?.createCorrelation(_doc.document.uri);

		const longtermResetSignal = observableSignal('resetSignal');

		let longtermReason: EditTelemetryTrigger = 'closed';
		this.longtermTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }
			longtermResetSignal.read(reader);

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined, externalEditCorrelation));
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(() => {
				// send long term document telemetry
				this._sendTelemetryAndLog('longterm', longtermReason, t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
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

		// Focus time based 10-minute window tracker
		const resetSignal = observableSignal('resetSignal');

		this.windowedTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }

			if (!this._doc.isVisible.read(reader)) {
				return undefined;
			}
			resetSignal.read(reader);

			// Reset after 10 minutes of accumulated focus time
			reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(10 * 60 * 1000, () => {
				resetSignal.trigger(undefined);
			}));

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(async () => {
				// send windowed document telemetry
				this._sendTelemetryAndLog('10minFocusWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
				t.dispose();
			}));

			return t;
		}).recomputeInitiallyAndOnChange(this._store);

		// Focus time based 20-minute window tracker
		const focusResetSignal = observableSignal('focusResetSignal');

		this.windowedFocusTracker = derived((reader) => {
			if (!this._statsEnabled.read(reader)) { return undefined; }

			if (!this._doc.isVisible.read(reader)) {
				return undefined;
			}
			focusResetSignal.read(reader);

			// Reset after 20 minutes of accumulated focus time
			reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(20 * 60 * 1000, () => {
				focusResetSignal.trigger(undefined);
			}));

			const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(async () => {
				// send focus-windowed document telemetry
				this._sendTelemetryAndLog('20minFocusWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
				t.dispose();
			}));

			return t;
		}).recomputeInitiallyAndOnChange(this._store);

	}

	private _sendTelemetryAndLog(mode: EditTelemetryMode, trigger: EditTelemetryTrigger, tracker: DocumentEditSourceTracker, focusTime: number, actualTime: number): void {
		void this.sendTelemetry(mode, trigger, tracker, focusTime, actualTime).catch(error => {
			this._logService.error(`[EditSourceTrackingImpl] Failed to send ${mode} edit telemetry: ${error}`);
		}).finally(() => {
			tracker.releaseExternalEditCorrelations();
		});
	}

	async sendTelemetry(mode: EditTelemetryMode, trigger: EditTelemetryTrigger, t: DocumentEditSourceTracker, focusTime: number, actualTime: number) {
		const coverageGap = mode === 'longterm' ? this._agentHostEditMarkerService?.takeCoverageGap?.(this._doc.document.uri) : undefined;
		t.applyPendingExternalEdits();
		let ranges = t.getTrackedRanges();
		let internalKeys = t.getAllKeys();
		let data = this.getTelemetryData(ranges);
		const statsUuid = this._randomService.generateUuid();
		let preparedAgentFlush: IPreparedAgentHostEditAttributionFlush | undefined;
		let deferSuppressedExternal = false;
		const isDirty = this._textFileService.isDirty(this._doc.document.uri);
		if (mode === 'longterm' && this._agentHostEditMarkerService) {
			try {
				preparedAgentFlush = await this._agentHostEditMarkerService.prepareFlush(
					this._doc.document.uri,
					trigger,
					statsUuid,
					isDirty,
					this._doc.document.languageId.get(),
				);
			} catch (error) {
				this._logService.error(`[EditSourceTrackingImpl] Failed to prepare Agent Host edit attribution: ${error}`);
				deferSuppressedExternal = error instanceof AgentHostEditAttributionDeferredError || error instanceof AgentHostEditAttributionUnknownOutcomeError;
			}
		}
		if (preparedAgentFlush) {
			t.applyPendingExternalEdits();
			ranges = t.getTrackedRanges();
			internalKeys = t.getAllKeys();
			data = this.getTelemetryData(ranges);
			try {
				await preparedAgentFlush.commit(data.totalModifiedCharactersInFinalState + preparedAgentFlush.agentModifiedCount);
			} catch (error) {
				this._logService.error(`[EditSourceTrackingImpl] Failed to commit Agent Host edit attribution: ${error}`);
				if (!(error instanceof AgentHostEditAttributionUnknownOutcomeError)) {
					preparedAgentFlush = undefined;
				}
				deferSuppressedExternal = error instanceof AgentHostEditAttributionDeferredError || error instanceof AgentHostEditAttributionUnknownOutcomeError;
			}
		}
		const includeSuppressedExternal = !preparedAgentFlush && !deferSuppressedExternal && !isDirty && mode === 'longterm' && !!this._agentHostEditMarkerService;
		if (includeSuppressedExternal) {
			ranges = t.getTrackedRanges(undefined, true);
			internalKeys = t.getAllKeys(true);
			data = this.getTelemetryData(ranges);
		}
		const agentModifiedCount = preparedAgentFlush?.agentModifiedCount ?? 0;
		if (internalKeys.length === 0 && agentModifiedCount === 0 && !coverageGap) {
			return;
		}
		const totalModifiedCount = data.totalModifiedCharactersInFinalState + agentModifiedCount;

		const telemetryKeys = new Map<string, {
			readonly representative: TextModelEditSource;
			modifiedCount: number;
			deltaModifiedCount: number;
		}>();
		for (const internalKey of internalKeys) {
			const representative = t.getRepresentative(internalKey)!;
			const telemetryKey = representative.toKey(1);
			const entry = telemetryKeys.get(telemetryKey) ?? {
				representative,
				modifiedCount: 0,
				deltaModifiedCount: 0,
			};
			entry.deltaModifiedCount += t.getTotalInsertedCharactersCount(internalKey, includeSuppressedExternal);
			telemetryKeys.set(telemetryKey, entry);
		}
		for (const range of ranges) {
			const representative = t.getRepresentative(range.sourceKey)!;
			const entry = telemetryKeys.get(representative.toKey(1));
			if (entry) {
				entry.modifiedCount += range.range.length;
			}
		}
		const sums = Object.fromEntries(Array.from(telemetryKeys, ([key, value]) => [key, value.modifiedCount]));
		const entries = Object.entries(sums)
			.filter((entry): entry is [string, number] => entry[1] !== undefined)
			.sort(reverseOrder(compareBy(([, value]) => value, numberComparator)))
			.slice(0, mode === 'longterm' ? 30 : 10);

		for (const [key, value] of entries) {
			const telemetryEntry = telemetryKeys.get(key)!;
			const repr = telemetryEntry.representative;
			const deltaModifiedCount = telemetryEntry.deltaModifiedCount;

			sendEditSourcesDetailsTelemetry(this._telemetryService, {
				mode,
				sourceKey: key,
				sourceKeyCleaned: repr.toKey(1, { $extensionId: false, $extensionVersion: false, $modelId: false }),
				extensionId: repr.props.$extensionId,
				extensionVersion: repr.props.$extensionVersion,
				modelId: repr.props.$modelId,
				trigger,
				languageId: this._doc.document.languageId.get(),
				statsUuid: statsUuid,
				conversationId: repr.props.$$sessionId,
				requestId: repr.props.$$requestId,
				origin: undefined,
				harness: undefined,
				modifiedCount: value,
				deltaModifiedCount: deltaModifiedCount,
				totalModifiedCount,
			});
		}


		const isTrackedByGit = await data.isTrackedByGit;
		this._telemetryService.publicLog2<{
			mode: EditTelemetryMode;
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
			trigger: EditTelemetryTrigger;
			agentHostAttributionCoverage?: 'complete' | 'partial';
			agentHostUntrackedEditCount?: number;
			agentHostUntrackedInsertedCount?: number;
		}, {
			owner: 'hediet';
			comment: 'Aggregates character counts by edit source category (user typing, AI completions, NES, IDE actions, external changes) for each editing session. Sessions represent units of work and end when documents close, branches change, commits occur, or time limits are reached (10 or 20 minutes of focus time for visible documents, or 10 hours otherwise). Focus time is computed as accumulated 1-minute blocks where VS Code has focus and there was recent user activity. Tracks both total characters inserted and characters remaining at session end to measure retention. This high-level summary complements editSources.details which provides granular per-source breakdowns. @sentToGitHub';

			mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'longterm, 10minFocusWindow, or 20minFocusWindow' };
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
			agentHostAttributionCoverage?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether long-term Agent Host edit attribution was complete or skipped at least one oversized edit.' };
			agentHostUntrackedEditCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Number of oversized Agent Host edits excluded from detailed attribution in this long-term window.'; isMeasurement: true };
			agentHostUntrackedInsertedCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Characters inserted by oversized Agent Host edits excluded from retained-character attribution in this long-term window.'; isMeasurement: true };
		}>('editTelemetry.editSources.stats', {
			mode,
			languageId: this._doc.document.languageId.get(),
			statsUuid: statsUuid,
			nesModifiedCount: data.nesModifiedCount,
			inlineCompletionsCopilotModifiedCount: data.inlineCompletionsCopilotModifiedCount,
			inlineCompletionsNESModifiedCount: data.inlineCompletionsNESModifiedCount,
			otherAIModifiedCount: data.otherAIModifiedCount + agentModifiedCount,
			unknownModifiedCount: data.unknownModifiedCount,
			userModifiedCount: data.userModifiedCount,
			ideModifiedCount: data.ideModifiedCount,
			totalModifiedCharacters: totalModifiedCount,
			externalModifiedCount: data.externalModifiedCount,
			isTrackedByGit: isTrackedByGit ? 1 : 0,
			focusTime,
			actualTime,
			trigger,
			...(mode === 'longterm' ? {
				agentHostAttributionCoverage: coverageGap ? 'partial' as const : 'complete' as const,
				agentHostUntrackedEditCount: coverageGap?.editCount ?? 0,
				agentHostUntrackedInsertedCount: coverageGap?.insertedCount ?? 0,
			} : {}),
		});
	}

	getTelemetryData(ranges: readonly TrackedEdit[]) {
		const sums = sumByCategory(ranges, r => r.range.length, r => getEditTelemetryCategory(r.source));
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
