/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reverseOrder, compareBy, numberComparator, sumBy } from '../../../../../base/common/arrays.js';
import { IntervalTimer } from '../../../../../base/common/async.js';
import { toDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { mapObservableArrayCached, derived, IObservable, observableSignal, runOnChange, autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditTelemetryMode, EditTelemetryTrigger, sendEditSourcesDetailsTelemetry, sendEditSourcesStatsTelemetry } from '../../../../../platform/telemetry/common/editTelemetry.js';
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

const FOCUS_CORRELATION_DRAIN_TIMEOUT = 1_000;

export type EditTelemetryCategory = 'nes' | 'inlineCompletionsCopilot' | 'inlineCompletionsNES' | 'inlineCompletionsOther' | 'otherAI' | 'agentHost' | 'user' | 'ide' | 'external' | 'unknown';

export function getEditTelemetryCategory(source: EditSource): EditTelemetryCategory {
	if (source.category === 'ai' && source.kind === 'nes') { return 'nes'; }

	if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot') { return 'inlineCompletionsCopilot'; }
	if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'nes') { return 'inlineCompletionsNES'; }
	if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'completions') { return 'inlineCompletionsCopilot'; }
	if (source.category === 'ai' && source.kind === 'completion') { return 'inlineCompletionsOther'; }

	if (source.category === 'ai') { return 'otherAI'; }
	if (source.category === 'agentHost') { return 'agentHost'; }
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

			const t = new DocumentEditSourceTracker(docWithJustReason, undefined, externalEditCorrelation);
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(() => {
				// send long term document telemetry
				t.stopTracking();
				this._sendTelemetryAndLog('longterm', longtermReason, t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
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

			const t = new DocumentEditSourceTracker(docWithJustReason, undefined, externalEditCorrelation, 'reattribute');
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(() => {
				// send windowed document telemetry
				t.stopTracking();
				this._sendTelemetryAndLog('10minFocusWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
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

			const t = new DocumentEditSourceTracker(docWithJustReason, undefined, externalEditCorrelation, 'reattribute');
			const startFocusTime = this._userAttentionService.totalFocusTimeMs;
			const startTime = Date.now();
			reader.store.add(toDisposable(() => {
				// send focus-windowed document telemetry
				t.stopTracking();
				this._sendTelemetryAndLog('20minFocusWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
			}));

			return t;
		}).recomputeInitiallyAndOnChange(this._store);

	}

	private _sendTelemetryAndLog(mode: EditTelemetryMode, trigger: EditTelemetryTrigger, tracker: DocumentEditSourceTracker, focusTime: number, actualTime: number): void {
		void this.sendTelemetry(mode, trigger, tracker, focusTime, actualTime).catch(error => {
			this._logService.error(`[EditSourceTrackingImpl] Failed to send ${mode} edit telemetry: ${error}`);
		}).finally(() => {
			tracker.releaseExternalEditCorrelations();
			tracker.dispose();
		});
	}

	async sendTelemetry(mode: EditTelemetryMode, trigger: EditTelemetryTrigger, t: DocumentEditSourceTracker, focusTime: number, actualTime: number) {
		if (mode !== 'longterm') {
			await t.waitForExternalEditCorrelations(FOCUS_CORRELATION_DRAIN_TIMEOUT);
		}
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
		const coverageGap = mode === 'longterm' && !isDirty && !deferSuppressedExternal && !preparedAgentFlush?.deferCoverageGap
			? this._agentHostEditMarkerService?.takeCoverageGap?.(this._doc.document.uri, preparedAgentFlush?.coverageGapThroughSequence ?? preparedAgentFlush?.lastSequence)
			: undefined;
		const agentModifiedCount = mode === 'longterm' ? preparedAgentFlush?.agentModifiedCount ?? 0 : data.agentHostModifiedCount;
		if (internalKeys.length === 0 && agentModifiedCount === 0 && !coverageGap) {
			return;
		}
		const totalModifiedCount = data.totalModifiedCharactersInFinalState + (preparedAgentFlush?.agentModifiedCount ?? 0);

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
				origin: repr.props.$origin,
				harness: repr.props.$harness,
				modifiedCount: value,
				deltaModifiedCount: deltaModifiedCount,
				totalModifiedCount,
			});
		}


		const isTrackedByGit = await data.isTrackedByGit;
		sendEditSourcesStatsTelemetry(this._telemetryService, {
			attributionSchemaVersion: 2,
			mode,
			languageId: this._doc.document.languageId.get(),
			statsUuid: statsUuid,
			nesModifiedCount: data.nesModifiedCount,
			inlineCompletionsCopilotModifiedCount: data.inlineCompletionsCopilotModifiedCount,
			inlineCompletionsNESModifiedCount: data.inlineCompletionsNESModifiedCount,
			otherAIModifiedCount: data.otherAIModifiedCount,
			agentHostModifiedCount: agentModifiedCount,
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
			agentHostModifiedCount: sums.agentHost ?? 0,
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
