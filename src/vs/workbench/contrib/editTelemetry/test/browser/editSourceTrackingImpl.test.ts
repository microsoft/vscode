/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { computeStringDiff } from '../../../../../editor/common/services/editorWebWorker.js';
import { EditSources, EditSuggestionId, TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserAttentionService } from '../../../../services/userAttention/common/userAttentionService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { AnnotatedDocuments, UriVisibilityProvider } from '../../browser/helpers/annotatedDocuments.js';
import { DiffService } from '../../browser/helpers/documentWithAnnotatedEdits.js';
import { StringEditWithReason } from '../../browser/helpers/observableWorkspace.js';
import { IAiEditTelemetryService } from '../../browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { EditSourceTrackingImpl } from '../../browser/telemetry/editSourceTrackingImpl.js';
import { AgentHostEditAttributionDeferredError, AgentHostEditAttributionUnknownOutcomeError, IAgentHostEditMarkerService, IExternalEditCorrelation, IExternalEditCorrelationResolution } from '../../browser/telemetry/agentHostEditMarkerService.js';
import { IScmRepoAdapter, ScmAdapter } from '../../browser/telemetry/scmAdapter.js';
import { IRandomService } from '../../browser/randomService.js';
import { MutableObservableWorkspace } from './editTelemetry.test.js';

suite('Edit Source Tracking Windows', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('flushes and recreates the long-term tracker on hash and branch changes', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('alpha'), 'beta', chatEdit('request-2')));
		await timeout(1500);
		context.branch.set('feature', undefined);

		assert.deepStrictEqual(context.details.map(event => ({
			trigger: event.trigger,
			requestId: event.requestId,
			modifiedCount: event.modifiedCount,
			deltaModifiedCount: event.deltaModifiedCount,
		})), [
			{ trigger: 'hashChange', requestId: 'request-1', modifiedCount: 5, deltaModifiedCount: 5 },
			{ trigger: 'branchChange', requestId: 'request-2', modifiedCount: 3, deltaModifiedCount: 3 },
		]);

		context.disposables.dispose();
	}));

	test('flushes the long-term tracker when the document closes', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		context.document.dispose();
		await timeout(0);

		assert.deepStrictEqual(context.details.map(event => ({
			trigger: event.trigger,
			requestId: event.requestId,
		})), [{ trigger: 'closed', requestId: 'request-1' }]);

		context.disposables.dispose();
	}));

	test('flushes and recreates the long-term tracker after ten hours', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		await timeout(10 * 60 * 60 * 1000);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('alpha'), 'beta', chatEdit('request-2')));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);

		assert.deepStrictEqual(context.details.map(event => ({
			trigger: event.trigger,
			requestId: event.requestId,
		})), [
			{ trigger: '10hours', requestId: 'request-1' },
			{ trigger: 'hashChange', requestId: 'request-2' },
		]);

		context.disposables.dispose();
	}));

	test('emits only the top thirty long-term sources by retained count', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		for (let i = 1; i <= 31; i++) {
			context.document.applyEdit(StringEditWithReason.replace(
				OffsetRange.emptyAt(context.document.value.get().value.length),
				'x'.repeat(i),
				EditSources.unknown({ name: `source-${i}` }),
			));
		}
		await timeout(10);
		context.headHash.set('hash-2', undefined);

		assert.deepStrictEqual({
			count: context.details.length,
			first: context.details[0].sourceKey,
			last: context.details.at(-1)?.sourceKey,
			containsSmallest: context.details.some(event => event.sourceKey === 'source:unknown-name:source-1'),
		}, {
			count: 30,
			first: 'source:unknown-name:source-31',
			last: 'source:unknown-name:source-2',
			containsSmallest: false,
		});

		context.disposables.dispose();
	}));

	test('starts after first visibility and keeps only the long-term tracker while hidden', () => runWithFakedTimers({}, async () => {
		const visible = observableValue('visible', false);
		const context = setup(visible);
		await timeout(10);

		assert.strictEqual(context.impl.docsState.get().size, 0);

		visible.set(true, undefined);
		const visibleState = context.impl.docsState.get().get(context.document);
		if (!visibleState) {
			throw new Error('Expected visible document state');
		}
		assert.ok(visibleState.longtermTracker.get());
		const firstWindowedTracker = visibleState.windowedTracker.get();
		assert.ok(firstWindowedTracker);
		assert.ok(visibleState.windowedFocusTracker.get());

		visible.set(false, undefined);
		const hiddenState = context.impl.docsState.get().get(context.document);
		if (!hiddenState) {
			throw new Error('Expected hidden document state');
		}
		assert.ok(hiddenState.longtermTracker.get());
		assert.strictEqual(hiddenState.windowedTracker.get(), undefined);
		assert.strictEqual(hiddenState.windowedFocusTracker.get(), undefined);

		visible.set(true, undefined);
		const visibleAgainState = context.impl.docsState.get().get(context.document);
		if (!visibleAgainState) {
			throw new Error('Expected visible document state after reopening');
		}
		assert.ok(visibleAgainState.windowedTracker.get());
		assert.notStrictEqual(visibleAgainState.windowedTracker.get(), firstWindowedTracker);

		context.disposables.dispose();
	}));

	test('fans out Agent Host reload attribution to both focus windows', () => runWithFakedTimers({}, async () => {
		const visible = observableValue('visible', true);
		const correlation = new TestExternalEditCorrelation();
		let prepareCount = 0;
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => correlation,
			prepareFlush: async () => {
				prepareCount++;
				return undefined;
			},
		};
		const context = setup(visible, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		correlation.resolve(EditSources.agentHostChatApplyEdits({
			modelId: 'gpt-5',
			sessionId: 'session-1',
			requestId: 'turn-1',
			harness: 'copilotcli',
		}));
		visible.set(false, undefined);
		await timeout(10);

		const focusDetails = context.allDetails.filter(event => event.mode !== 'longterm');
		const focusStats = context.allStats.filter(event => event.mode !== 'longterm');
		assert.deepStrictEqual({
			details: focusDetails.map(event => ({
				mode: event.mode,
				sourceKey: event.sourceKey,
				sourceKeyCleaned: event.sourceKeyCleaned,
				origin: event.origin,
				harness: event.harness,
				modelId: event.modelId,
				conversationId: event.conversationId,
				requestId: event.requestId,
				modifiedCount: event.modifiedCount,
				deltaModifiedCount: event.deltaModifiedCount,
				totalModifiedCount: event.totalModifiedCount,
			})).sort((a, b) => a.mode.localeCompare(b.mode)),
			stats: focusStats.map(event => ({
				mode: event.mode,
				otherAIModifiedCount: event.otherAIModifiedCount,
				agentHostModifiedCount: event.agentHostModifiedCount,
				externalModifiedCount: event.externalModifiedCount,
				totalModifiedCharacters: event.totalModifiedCharacters,
			})).sort((a, b) => a.mode.localeCompare(b.mode)),
			statsUuids: new Set(focusDetails.map(event => event.statsUuid)).size,
			prepareCount,
		}, {
			details: [
				{
					mode: '10minFocusWindow',
					sourceKey: 'source:Chat.applyEdits-$modelId:gpt-5-$harness:copilotcli-$origin:agentHost',
					sourceKeyCleaned: 'source:Chat.applyEdits-$harness:copilotcli-$origin:agentHost',
					origin: 'agentHost',
					harness: 'copilotcli',
					modelId: 'gpt-5',
					conversationId: 'session-1',
					requestId: 'turn-1',
					modifiedCount: 8,
					deltaModifiedCount: 8,
					totalModifiedCount: 8,
				},
				{
					mode: '20minFocusWindow',
					sourceKey: 'source:Chat.applyEdits-$modelId:gpt-5-$harness:copilotcli-$origin:agentHost',
					sourceKeyCleaned: 'source:Chat.applyEdits-$harness:copilotcli-$origin:agentHost',
					origin: 'agentHost',
					harness: 'copilotcli',
					modelId: 'gpt-5',
					conversationId: 'session-1',
					requestId: 'turn-1',
					modifiedCount: 8,
					deltaModifiedCount: 8,
					totalModifiedCount: 8,
				},
			],
			stats: [
				{
					mode: '10minFocusWindow',
					otherAIModifiedCount: 0,
					agentHostModifiedCount: 8,
					externalModifiedCount: 0,
					totalModifiedCharacters: 8,
				},
				{
					mode: '20minFocusWindow',
					otherAIModifiedCount: 0,
					agentHostModifiedCount: 8,
					externalModifiedCount: 0,
					totalModifiedCharacters: 8,
				},
			],
			statsUuids: 2,
			prepareCount: 0,
		});

		context.disposables.dispose();
	}));

	test('drains a late Agent Host marker before focus-window emission', () => runWithFakedTimers({}, async () => {
		const visible = observableValue('visible', true);
		const correlation = new TestExternalEditCorrelation(true);
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => correlation,
			prepareFlush: async () => undefined,
		};
		const context = setup(visible, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		visible.set(false, undefined);
		await timeout(10);
		assert.strictEqual(context.allDetails.length, 0);

		correlation.resolve(EditSources.agentHostChatApplyEdits({
			modelId: undefined,
			sessionId: 'session-1',
			requestId: 'turn-late',
			harness: 'claude',
		}));
		correlation.completeDrain();
		await timeout(10);

		assert.deepStrictEqual(context.allDetails.map(event => ({
			mode: event.mode,
			harness: event.harness,
			requestId: event.requestId,
		})).sort((a, b) => a.mode.localeCompare(b.mode)), [
			{ mode: '10minFocusWindow', harness: 'claude', requestId: 'turn-late' },
			{ mode: '20minFocusWindow', harness: 'claude', requestId: 'turn-late' },
		]);

		context.disposables.dispose();
	}));

	test('falls back to external attribution after the focus correlation drain times out', () => runWithFakedTimers({}, async () => {
		const visible = observableValue('visible', true);
		const correlation = new TestExternalEditCorrelation(true);
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => correlation,
			prepareFlush: async () => undefined,
		};
		const context = setup(visible, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		visible.set(false, undefined);
		await timeout(1_001);

		assert.deepStrictEqual({
			details: context.allDetails.map(event => ({
				mode: event.mode,
				sourceKey: event.sourceKey,
				modifiedCount: event.modifiedCount,
				totalModifiedCount: event.totalModifiedCount,
			})).sort((a, b) => a.mode.localeCompare(b.mode)),
			stats: context.allStats.map(event => ({
				mode: event.mode,
				agentHostModifiedCount: event.agentHostModifiedCount,
				externalModifiedCount: event.externalModifiedCount,
				totalModifiedCharacters: event.totalModifiedCharacters,
			})).sort((a, b) => a.mode.localeCompare(b.mode)),
		}, {
			details: [
				{ mode: '10minFocusWindow', sourceKey: 'source:reloadFromDisk', modifiedCount: 8, totalModifiedCount: 8 },
				{ mode: '20minFocusWindow', sourceKey: 'source:reloadFromDisk', modifiedCount: 8, totalModifiedCount: 8 },
			],
			stats: [
				{ mode: '10minFocusWindow', agentHostModifiedCount: 0, externalModifiedCount: 8, totalModifiedCharacters: 8 },
				{ mode: '20minFocusWindow', agentHostModifiedCount: 0, externalModifiedCount: 8, totalModifiedCharacters: 8 },
			],
		});

		context.disposables.dispose();
	}));

	test('coordinates long-term totals with Agent Host attribution', () => runWithFakedTimers({}, async () => {
		const commits: number[] = [];
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => false,
				release: () => { },
			}),
			prepareFlush: async (_resource, trigger, statsUuid, isDirty) => isDirty || trigger !== 'hashChange' ? undefined : ({
				flushToken: 'flush-1',
				agentModifiedCount: 3,
				commit: async totalModifiedCount => {
					assert.strictEqual(statsUuid, 'stats-2');
					commits.push(totalModifiedCount);
				},
			}),
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual({
			details: context.details.map(event => ({
				statsUuid: event.statsUuid,
				modifiedCount: event.modifiedCount,
				totalModifiedCount: event.totalModifiedCount,
			})),
			stats: context.stats.map(event => ({
				statsUuid: event.statsUuid,
				otherAIModifiedCount: event.otherAIModifiedCount,
				agentHostModifiedCount: event.agentHostModifiedCount,
				totalModifiedCharacters: event.totalModifiedCharacters,
			})),
			commits,
		}, {
			details: [{
				statsUuid: 'stats-2',
				modifiedCount: 5,
				totalModifiedCount: 8,
			}],
			stats: [{
				statsUuid: 'stats-2',
				otherAIModifiedCount: 5,
				agentHostModifiedCount: 3,
				totalModifiedCharacters: 8,
			}],
			commits: [8],
		});

		context.disposables.dispose();
	}));

	test('recomputes workbench totals after a late Agent marker', () => runWithFakedTimers({}, async () => {
		const onDidSuppress = new Emitter<string>();
		const prepareStarted = new DeferredPromise<void>();
		const continuePrepare = new DeferredPromise<void>();
		let suppressed = false;
		const committedTotals: number[] = [];
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: onDidSuppress.event,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => suppressed,
				release: () => { },
			}),
			prepareFlush: async (_resource, trigger) => {
				if (trigger !== 'hashChange') {
					return undefined;
				}
				prepareStarted.complete();
				await continuePrepare.p;
				return {
					flushToken: 'flush-1',
					agentModifiedCount: 3,
					commit: async totalModifiedCount => {
						committedTotals.push(totalModifiedCount);
					},
				};
			},
		};
		const context = setup(undefined, markerService);
		context.disposables.add(onDidSuppress);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await prepareStarted.p;
		suppressed = true;
		onDidSuppress.fire('observation');
		continuePrepare.complete();
		await timeout(10);

		assert.deepStrictEqual({
			committedTotals,
			stats: context.stats.map(event => ({
				otherAIModifiedCount: event.otherAIModifiedCount,
				agentHostModifiedCount: event.agentHostModifiedCount,
				externalModifiedCount: event.externalModifiedCount,
				totalModifiedCharacters: event.totalModifiedCharacters,
			})),
		}, {
			committedTotals: [3],
			stats: [{
				otherAIModifiedCount: 0,
				agentHostModifiedCount: 3,
				externalModifiedCount: 0,
				totalModifiedCharacters: 3,
			}],
		});

		context.disposables.dispose();
	}));

	test('defers Agent Host attribution while the model is dirty', () => runWithFakedTimers({}, async () => {
		const dirtyStates: boolean[] = [];
		let coverageGapTakeCount = 0;
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => false,
				release: () => { },
			}),
			prepareFlush: async (_resource, trigger, _statsUuid, isDirty) => {
				if (trigger === 'hashChange') {
					dirtyStates.push(isDirty);
				}
				return undefined;
			},
			takeCoverageGap: () => {
				coverageGapTakeCount++;
				return { editCount: 1, insertedCount: 42 };
			},
		};
		const context = setup(undefined, markerService, true);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual({
			dirtyStates,
			coverageGapTakeCount,
			details: context.details.map(event => ({
				modifiedCount: event.modifiedCount,
				totalModifiedCount: event.totalModifiedCount,
			})),
		}, {
			dirtyStates: [true],
			coverageGapTakeCount: 0,
			details: [{
				modifiedCount: 5,
				totalModifiedCount: 5,
			}],
		});

		context.disposables.dispose();
	}));

	test('does not fall back matched Agent edits while the model is dirty', () => runWithFakedTimers({}, async () => {
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => true,
				release: () => { },
			}),
			prepareFlush: async () => undefined,
		};
		const context = setup(undefined, markerService, true);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual({
			detailCount: context.details.length,
			statsCount: context.stats.length,
		}, {
			detailCount: 0,
			statsCount: 0,
		});

		context.disposables.dispose();
	}));

	test('keeps unmatched reloads as standard external telemetry', () => runWithFakedTimers({}, async () => {
		let observation = 0;
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => `observation-${++observation}`,
				isSuppressed: () => false,
				release: () => { },
			}),
			prepareFlush: async () => undefined,
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('alpha'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual({
			sourceKeys: context.details.map(event => event.sourceKey).sort(),
			hasInternalObservationKey: context.details.some(event => event.sourceKey.startsWith('external-observation:')),
		}, {
			sourceKeys: ['source:Chat.applyEdits', 'source:reloadFromDisk'],
			hasInternalObservationKey: false,
		});

		context.disposables.dispose();
	}));

	test('reports partial Agent Host coverage without dropping workbench attribution', () => runWithFakedTimers({}, async () => {
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => false,
				release: () => { },
			}),
			takeCoverageGap: () => ({
				editCount: 1,
				insertedCount: 42,
			}),
			prepareFlush: async () => undefined,
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('alpha'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual(context.stats.map(event => ({
			externalModifiedCount: event.externalModifiedCount,
			totalModifiedCharacters: event.totalModifiedCharacters,
			agentHostAttributionCoverage: event.agentHostAttributionCoverage,
			agentHostUntrackedEditCount: event.agentHostUntrackedEditCount,
			agentHostUntrackedInsertedCount: event.agentHostUntrackedInsertedCount,
		})), [{
			externalModifiedCount: 8,
			totalModifiedCharacters: 8,
			agentHostAttributionCoverage: 'partial',
			agentHostUntrackedEditCount: 1,
			agentHostUntrackedInsertedCount: 42,
		}]);

		context.disposables.dispose();
	}));

	test('emits workbench telemetry when Agent Host coordination fails', () => runWithFakedTimers({}, async () => {
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => false,
				release: () => { },
			}),
			prepareFlush: async () => {
				throw new Error('Agent Host unavailable');
			},
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual(context.details.map(event => ({
			modifiedCount: event.modifiedCount,
			totalModifiedCount: event.totalModifiedCount,
		})), [{
			modifiedCount: 5,
			totalModifiedCount: 5,
		}]);

		context.disposables.dispose();
	}));

	test('falls back to external telemetry when a matched Agent flush cannot prepare', () => runWithFakedTimers({}, async () => {
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => true,
				release: () => { },
			}),
			prepareFlush: async () => {
				throw new Error('Agent Host unavailable');
			},
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('alpha'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual(context.details.map(event => event.sourceKey).sort(), [
			'source:Chat.applyEdits',
			'source:reloadFromDisk',
		]);

		context.disposables.dispose();
	}));

	test('falls back to a matched initial external edit when Agent Host is unavailable', () => runWithFakedTimers({}, async () => {
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => true,
				release: () => { },
			}),
			prepareFlush: async () => {
				throw new Error('Agent Host unavailable');
			},
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual(context.details.map(event => ({
			sourceKey: event.sourceKey,
			modifiedCount: event.modifiedCount,
			totalModifiedCount: event.totalModifiedCount,
		})), [{
			sourceKey: 'source:reloadFromDisk',
			modifiedCount: 8,
			totalModifiedCount: 8,
		}]);

		context.disposables.dispose();
	}));

	test('does not fall back when Agent Host attribution is deferred', () => runWithFakedTimers({}, async () => {
		let coverageGapTakeCount = 0;
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => true,
				release: () => { },
			}),
			prepareFlush: async () => {
				throw new AgentHostEditAttributionDeferredError(new Error('Prepare cancelled'));
			},
			takeCoverageGap: () => {
				coverageGapTakeCount++;
				return { editCount: 1, insertedCount: 42 };
			},
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual({
			detailCount: context.details.length,
			statsCount: context.stats.length,
			coverageGapTakeCount,
		}, {
			detailCount: 0,
			statsCount: 0,
			coverageGapTakeCount: 0,
		});

		context.disposables.dispose();
	}));

	test('does not emit external fallback when the Agent Host commit outcome is unknown', () => runWithFakedTimers({}, async () => {
		let coverageGapTakeCount = 0;
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => true,
				release: () => { },
			}),
			prepareFlush: async () => ({
				flushToken: 'flush-1',
				agentModifiedCount: 3,
				commit: async () => {
					throw new AgentHostEditAttributionUnknownOutcomeError(new Error('Transport unavailable'));
				},
			}),
			takeCoverageGap: () => {
				coverageGapTakeCount++;
				return { editCount: 1, insertedCount: 42 };
			},
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'external', EditSources.reloadFromDisk()));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual({
			detailCount: context.details.length,
			coverageGapTakeCount,
			stats: context.stats.map(event => ({
				otherAIModifiedCount: event.otherAIModifiedCount,
				agentHostModifiedCount: event.agentHostModifiedCount,
				externalModifiedCount: event.externalModifiedCount,
				totalModifiedCharacters: event.totalModifiedCharacters,
			})),
		}, {
			detailCount: 0,
			coverageGapTakeCount: 0,
			stats: [{
				otherAIModifiedCount: 0,
				agentHostModifiedCount: 3,
				externalModifiedCount: 0,
				totalModifiedCharacters: 3,
			}],
		});

		context.disposables.dispose();
	}));

	test('commits zero-retention Agent Host windows', () => runWithFakedTimers({}, async () => {
		const commits: number[] = [];
		const markerService: IAgentHostEditMarkerService = {
			createCorrelation: () => ({
				onDidSuppress: Event.None,
				onDidInvalidate: Event.None,
				register: () => 'observation',
				isSuppressed: () => false,
				release: () => { },
			}),
			prepareFlush: async (_resource, trigger) => trigger === 'hashChange' ? ({
				flushToken: 'flush-1',
				agentModifiedCount: 0,
				commit: async totalModifiedCount => {
					commits.push(totalModifiedCount);
				},
			}) : undefined,
		};
		const context = setup(undefined, markerService);
		await timeout(10);

		context.headHash.set('hash-2', undefined);
		await timeout(10);

		assert.deepStrictEqual({
			commits,
			detailCount: context.details.length,
			statsCount: context.stats.length,
		}, {
			commits: [0],
			detailCount: 0,
			statsCount: 0,
		});

		context.disposables.dispose();
	}));
});

function setup(
	visible: ISettableObservable<boolean> = observableValue('visible', true),
	markerService?: IAgentHostEditMarkerService,
	dirty = false,
) {
	const disposables = new DisposableStore();
	const headHash = observableValue('headHash', 'hash-1');
	const branch = observableValue('branch', 'main');
	const repo = {
		headCommitHashObs: headHash,
		headBranchNameObs: branch,
		isIgnored: async () => false,
	} satisfies IScmRepoAdapter;
	const details: Array<{ sourceKey: string; trigger: string; requestId: string | undefined; statsUuid: string; modifiedCount: number; deltaModifiedCount: number; totalModifiedCount: number }> = [];
	const allDetails: Array<{
		mode: string;
		sourceKey: string;
		sourceKeyCleaned: string;
		origin: string | undefined;
		harness: string | undefined;
		modelId: string | undefined;
		conversationId: string | undefined;
		requestId: string | undefined;
		statsUuid: string;
		modifiedCount: number;
		deltaModifiedCount: number;
		totalModifiedCount: number;
	}> = [];
	const stats: Array<{
		statsUuid: string;
		otherAIModifiedCount: number;
		agentHostModifiedCount: number;
		externalModifiedCount: number;
		totalModifiedCharacters: number;
		agentHostAttributionCoverage?: 'complete' | 'partial';
		agentHostUntrackedEditCount?: number;
		agentHostUntrackedInsertedCount?: number;
	}> = [];
	const allStats: Array<typeof stats[number] & { mode: string }> = [];
	let uuid = 0;
	const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, undefined, true));
	instantiationService.stub(ITelemetryService, {
		publicLog2(eventName, data) {
			const eventData = data as { mode?: string } | undefined;
			if (eventName === 'editTelemetry.editSources.details') {
				allDetails.push(data as typeof allDetails[number]);
				if (eventData?.mode === 'longterm') {
					details.push(data as typeof details[number]);
				}
			} else if (eventName === 'editTelemetry.editSources.stats') {
				allStats.push(data as typeof allStats[number]);
				if (eventData?.mode === 'longterm') {
					stats.push(data as typeof stats[number]);
				}
			}
		},
	});
	instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, 'advanced') });
	instantiationService.stubInstance(ScmAdapter, { getRepo: () => repo });
	instantiationService.stubInstance(UriVisibilityProvider, { isVisible: (_uri, reader) => visible.read(reader) });
	instantiationService.stub(IRandomService, {
		_serviceBrand: undefined,
		generateUuid: () => `stats-${++uuid}`,
		generatePrefixedUuid: namespace => `${namespace}-${++uuid}`,
	});
	instantiationService.stub(IUserAttentionService, {
		_serviceBrand: undefined,
		isVsCodeFocused: constObservable(true),
		isUserActive: constObservable(true),
		hasUserAttention: constObservable(true),
		totalFocusTimeMs: 0,
		fireAfterGivenFocusTimePassed: () => Disposable.None,
	});
	instantiationService.stub(ITextFileService, { isDirty: () => dirty });
	instantiationService.stub(IAiEditTelemetryService, {
		_serviceBrand: undefined,
		createSuggestionId: () => EditSuggestionId.newId(() => 'sgt-test'),
		handleCodeAccepted: () => { },
		handleCodeRejected: () => { },
	});
	instantiationService.stub(ILogService, new NullLogService());

	const workspace = new MutableObservableWorkspace();
	const annotatedDocuments = disposables.add(new AnnotatedDocuments(workspace, instantiationService));
	const impl = disposables.add(new EditSourceTrackingImpl(constObservable(true), annotatedDocuments, markerService, instantiationService));
	const document = disposables.add(workspace.createDocument({
		uri: URI.file('C:\\repo\\file.ts'),
		initialValue: 'hello',
		languageId: 'typescript',
	}));

	return { disposables, document, details, stats, allDetails, allStats, headHash, branch, impl };
}

function chatEdit(requestId: string) {
	return EditSources.chatApplyEdits({
		modelId: undefined,
		sessionId: 'session-1',
		requestId,
		languageId: 'typescript',
		mode: 'agent',
		extensionId: undefined,
		codeBlockSuggestionId: undefined,
	});
}

class TestExternalEditCorrelation implements IExternalEditCorrelation {
	private readonly _onDidSuppress = new Emitter<string>();
	readonly onDidSuppress = this._onDidSuppress.event;
	private readonly _onDidResolve = new Emitter<IExternalEditCorrelationResolution>();
	readonly onDidResolve = this._onDidResolve.event;
	private readonly _onDidInvalidate = new Emitter<string>();
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private readonly _drain = new DeferredPromise<void>();
	private resolution: IExternalEditCorrelationResolution | undefined;

	constructor(private readonly waitForDrain = false) { }

	register(): string {
		return 'observation';
	}

	isSuppressed(): boolean {
		return this.resolution !== undefined;
	}

	getResolution(): IExternalEditCorrelationResolution | undefined {
		return this.resolution;
	}

	async waitForResolution(_ids: readonly string[], timeoutMs: number): Promise<void> {
		if (this.waitForDrain) {
			await Promise.race([this._drain.p, timeout(timeoutMs)]);
		}
	}

	release(): void { }

	resolve(source: TextModelEditSource): void {
		this.resolution = { id: 'observation', source };
		this._onDidSuppress.fire('observation');
		this._onDidResolve.fire(this.resolution);
	}

	completeDrain(): void {
		this._drain.complete();
	}
}
