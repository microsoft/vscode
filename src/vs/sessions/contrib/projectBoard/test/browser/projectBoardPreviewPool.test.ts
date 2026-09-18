/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatModelReference, IChatQuestionAnswerValue, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { IProjectBoardPendingActions } from '../../common/projectBoardActions.js';
import { IProjectBoardInputConfiguration, IProjectBoardMetadata, ProjectBoardMetadata, projectBoardMetadataLimits } from '../../browser/projectBoardMetadata.js';
import { IProjectBoardMetadataLease, IProjectBoardQuestionLease, ProjectBoardPreviewPool } from '../../browser/projectBoardPreviewPool.js';
import { IProjectBoardPendingQuestion, ProjectBoardQuestionPreview, ProjectBoardQuestionPreviewState } from '../../browser/projectBoardQuestions.js';

suite('ProjectBoardPreviewPool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function chat(id = 'child') {
		return { resource: URI.parse(`test-chat:session#${id}`), status: observableValue('status', SessionStatus.NeedsInput) };
	}

	function setup() {
		const instantiation = store.add(new TestInstantiationService());
		const pool = store.add(new ProjectBoardPreviewPool(instantiation));
		const created = sinon.spy(instantiation, 'createInstance');
		store.add(toDisposable(() => created.restore()));
		return { instantiation, pool, created };
	}

	function metadataStub(instantiation: TestInstantiationService) {
		const calls = { credits: [] as boolean[], configuration: [] as boolean[], disposed: 0 };
		const metadata = observableValue<IProjectBoardMetadata>('metadata', { kind: 'loading' });
		const helper: IProjectBoardMetadataLease = {
			metadata,
			credits: observableValue<number | undefined>('credits', undefined),
			creditsError: observableValue<string | undefined>('creditsError', undefined),
			configuration: observableValue<IProjectBoardInputConfiguration | undefined>('configuration', undefined),
			actions: observableValue<IProjectBoardPendingActions | undefined>('actions', undefined),
			setIncludeCredits: value => { assert.strictEqual(calls.disposed, 0); calls.credits.push(value); },
			setIncludeConfiguration: value => { assert.strictEqual(calls.disposed, 0); calls.configuration.push(value); },
			dispose: () => { calls.disposed++; },
		};
		instantiation.stubInstance(ProjectBoardMetadata, helper);
		return { helper, calls, metadata };
	}

	function questionStub(instantiation: TestInstantiationService) {
		const calls = { submitted: [] as Parameters<ProjectBoardQuestionPreview['submit']>[], disposed: 0, result: true };
		const helper: IProjectBoardQuestionLease = {
			preview: observableValue<ProjectBoardQuestionPreviewState>('preview', { kind: 'loading' }),
			questionCarousels: observableValue<readonly IProjectBoardPendingQuestion[]>('carousels', []),
			submit: (question, answers) => {
				assert.strictEqual(calls.disposed, 0);
				calls.submitted.push([question, answers]);
				return calls.result;
			},
			dispose: () => { calls.disposed++; },
		};
		instantiation.stubInstance(ProjectBoardQuestionPreview, helper);
		return { helper, calls };
	}

	test('metadata quota counts distinct exact resources, not board leases', () => {
		const h = setup();
		const helpers = Array.from({ length: projectBoardMetadataLimits.activeHelpers }, (_, index) => {
			const stub = metadataStub(h.instantiation);
			const lease = store.add(h.pool.acquireMetadata(chat(String(index)))!);
			const shared = store.add(h.pool.acquireMetadata(chat(String(index)))!);
			assert.strictEqual(shared.metadata, lease.metadata);
			return { ...stub, lease, shared };
		});
		assert.strictEqual(h.pool.acquireMetadata(chat('overflow')), undefined);
		assert.strictEqual(h.created.callCount, projectBoardMetadataLimits.activeHelpers);
		helpers[0].lease.dispose();
		assert.strictEqual(h.pool.acquireMetadata(chat('overflow')), undefined);
		assert.strictEqual(helpers[0].calls.disposed, 0);
		helpers[0].shared.dispose();
		const replacement = metadataStub(h.instantiation);
		assert.strictEqual(store.add(h.pool.acquireMetadata(chat('overflow'))!).metadata, replacement.helper.metadata);
		assert.strictEqual(helpers[0].calls.disposed, 1);
	});

	test('question quota is independently bounded at eight shared helpers', () => {
		const h = setup();
		const helpers = Array.from({ length: 8 }, (_, index) => {
			const stub = questionStub(h.instantiation);
			const lease = store.add(h.pool.acquireQuestions(chat(String(index)))!);
			const shared = store.add(h.pool.acquireQuestions(chat(String(index)))!);
			assert.strictEqual(shared.preview, lease.preview);
			assert.strictEqual(shared.questionCarousels, lease.questionCarousels);
			return { ...stub, lease, shared };
		});

		assert.strictEqual(h.pool.acquireQuestions(chat('overflow')), undefined);
		assert.strictEqual(h.created.callCount, 8);
		metadataStub(h.instantiation);
		assert.ok(store.add(h.pool.acquireMetadata(chat('overflow'))!));
		helpers[0].lease.dispose();
		assert.strictEqual(h.pool.acquireQuestions(chat('overflow')), undefined);
		helpers[0].shared.dispose();
		const replacement = questionStub(h.instantiation);
		assert.strictEqual(store.add(h.pool.acquireQuestions(chat('overflow'))!).preview, replacement.helper.preview);
		assert.strictEqual(helpers[0].calls.disposed, 1);
	});

	test('ready metadata stays warm between boards but idle entries yield to the global quota', () => {
		const h = setup();
		const helpers = Array.from({ length: projectBoardMetadataLimits.activeHelpers }, (_, index) => {
			const stub = metadataStub(h.instantiation);
			stub.metadata.set({ kind: 'ready', prompt: `Prompt ${index}`, context: [] }, undefined);
			const lease = store.add(h.pool.acquireMetadata(chat(String(index)))!);
			lease.dispose();
			return stub;
		});
		assert.ok(helpers.every(helper => helper.calls.disposed === 0), 'Loaded previews survive a board switch without retaining extra leases');
		const revived = store.add(h.pool.acquireMetadata(chat('0'))!);
		assert.strictEqual(revived.metadata, helpers[0].helper.metadata);
		assert.strictEqual(h.created.callCount, projectBoardMetadataLimits.activeHelpers);
		revived.dispose();
		metadataStub(h.instantiation);
		store.add(h.pool.acquireMetadata(chat('new'))!);
		assert.strictEqual(helpers[1].calls.disposed, 1, 'Evict the least recently used idle entry before loading another model');
		assert.strictEqual(helpers[0].calls.disposed, 0, 'A recently reused entry remains warm');
		h.pool.clearIdleMetadata();
		assert.ok(helpers.every(helper => helper.calls.disposed === 1), 'Closing the last Hub view releases warm cached models');
	});

	test('idle ready entries disable optional observation and active entries survive cache clearing', () => {
		const h = setup();
		const stub = metadataStub(h.instantiation);
		stub.metadata.set({ kind: 'ready', context: [] }, undefined);
		const first = store.add(h.pool.acquireMetadata(chat())!);
		first.setIncludeCredits(true);
		first.setIncludeConfiguration(true);
		first.dispose();
		assert.deepStrictEqual(stub.calls, { credits: [true, false], configuration: [true, false], disposed: 0 });
		const active = store.add(h.pool.acquireMetadata(chat())!);
		h.pool.clearIdleMetadata();
		assert.strictEqual(stub.calls.disposed, 0);
		active.dispose();
		h.pool.clearIdleMetadata();
		assert.strictEqual(stub.calls.disposed, 1);
	});

	test('all metadata observables are shared and feature flags aggregate across leases', () => {
		const h = setup();
		const { helper, calls } = metadataStub(h.instantiation);
		const first = store.add(h.pool.acquireMetadata(chat())!);
		const second = store.add(h.pool.acquireMetadata(chat())!);
		for (const key of ['metadata', 'credits', 'creditsError', 'configuration', 'actions'] as const) {
			assert.strictEqual(first[key], helper[key]);
			assert.strictEqual(second[key], helper[key]);
		}
		first.setIncludeCredits(true);
		first.setIncludeConfiguration(true);
		second.setIncludeCredits(true);
		second.setIncludeConfiguration(true);
		first.setIncludeCredits(false);
		first.setIncludeConfiguration(false);
		assert.deepStrictEqual(calls, { credits: [true], configuration: [true], disposed: 0 });
		second.dispose();
		assert.deepStrictEqual(calls, { credits: [true, false], configuration: [true, false], disposed: 0 });
		first.dispose();
		first.dispose();
		second.setIncludeCredits(true);
		second.setIncludeConfiguration(true);
		assert.strictEqual(calls.disposed, 1);
	});

	test('metadata feature updates stop if an observable consumer disposes the pool', () => {
		const h = setup();
		const { helper, calls } = metadataStub(h.instantiation);
		helper.setIncludeCredits = value => {
			calls.credits.push(value);
			h.pool.dispose();
		};
		const lease = store.add(h.pool.acquireMetadata(chat())!);
		lease.setIncludeCredits(true);
		lease.setIncludeConfiguration(true);
		assert.deepStrictEqual(calls, { credits: [true], configuration: [], disposed: 1 });
	});

	test('released metadata leases cannot modify a replacement helper for the same chat', () => {
		const h = setup();
		const old = metadataStub(h.instantiation);
		const stale = store.add(h.pool.acquireMetadata(chat())!);
		stale.dispose();
		const replacement = metadataStub(h.instantiation);
		const current = store.add(h.pool.acquireMetadata(chat())!);
		stale.setIncludeCredits(true);
		stale.setIncludeConfiguration(true);
		stale.dispose();
		current.setIncludeCredits(true);
		assert.deepStrictEqual([old.calls, replacement.calls], [
			{ credits: [], configuration: [], disposed: 1 },
			{ credits: [true], configuration: [], disposed: 0 },
		]);
	});

	test('question submission delegates once with original arguments and preserves helper rejection', () => {
		const h = setup();
		const { calls } = questionStub(h.instantiation);
		const first = store.add(h.pool.acquireQuestions(chat())!);
		const second = store.add(h.pool.acquireQuestions(chat())!);
		const pending = { requestId: 'original-request', carousel: new ChatQuestionCarouselData([], true, 'original-carousel') };
		const answers = new Map<string, IChatQuestionAnswerValue>([['question', 'backend-value']]);
		assert.strictEqual(first.submit(pending, answers), true);
		calls.result = false;
		assert.strictEqual(second.submit(pending, undefined), false);
		assert.strictEqual(calls.submitted.length, 2);
		assert.strictEqual(calls.submitted[0][0], pending);
		assert.strictEqual(calls.submitted[0][1], answers);
		assert.strictEqual(calls.submitted[1][0], pending);
		assert.strictEqual(calls.submitted[1][1], undefined);
		first.dispose();
		assert.strictEqual(first.submit(pending, answers), false);
		second.dispose();
		const replacement = questionStub(h.instantiation);
		store.add(h.pool.acquireQuestions(chat())!);
		assert.strictEqual(second.submit(pending, answers), false);
		assert.deepStrictEqual([calls.submitted.length, calls.disposed, replacement.calls.submitted.length], [2, 1, 0]);
	});

	test('availability is deferred, coalesced and lets denied consumers retry', async () => {
		const h = setup();
		const leases = Array.from({ length: 8 }, (_, index) => {
			questionStub(h.instantiation);
			return store.add(h.pool.acquireQuestions(chat(String(index)))!);
		});
		const shared = store.add(h.pool.acquireQuestions(chat('0'))!);
		assert.strictEqual(h.pool.acquireQuestions(chat('denied')), undefined);
		let notifications = 0;
		let retry: IProjectBoardQuestionLease | undefined;
		store.add(h.pool.onDidChangeAvailability(() => {
			notifications++;
			questionStub(h.instantiation);
			retry = store.add(h.pool.acquireQuestions(chat('denied'))!);
		}));
		shared.dispose();
		await timeout(0);
		assert.strictEqual(notifications, 0, 'Releasing a shared lease does not free a slot');
		leases[0].dispose();
		leases[1].dispose();
		assert.deepStrictEqual([notifications, retry], [0, undefined]);
		await timeout(0);
		assert.strictEqual(notifications, 1);
		assert.ok(retry);
	});

	test('pool disposal releases helpers once, cancels notifications and rejects stale leases', async () => {
		const h = setup();
		const metadata = metadataStub(h.instantiation);
		const questions = questionStub(h.instantiation);
		const lease = store.add(h.pool.acquireMetadata(chat())!);
		const shared = store.add(h.pool.acquireMetadata(chat())!);
		const question = store.add(h.pool.acquireQuestions(chat())!);
		const releasedQuestions = questionStub(h.instantiation);
		const released = store.add(h.pool.acquireQuestions(chat('released'))!);
		let notifications = 0;
		store.add(h.pool.onDidChangeAvailability(() => notifications++));
		released.dispose();
		h.pool.dispose();
		h.pool.dispose();
		lease.setIncludeCredits(true);
		shared.setIncludeConfiguration(true);
		lease.dispose();
		shared.dispose();
		question.dispose();
		assert.strictEqual(question.submit({ requestId: 'stale', carousel: new ChatQuestionCarouselData([], true) }, undefined), false);
		assert.deepStrictEqual([h.pool.acquireMetadata(chat()), h.pool.acquireQuestions(chat())], [undefined, undefined]);
		await timeout(0);
		assert.deepStrictEqual([metadata.calls, questions.calls.disposed, releasedQuestions.calls.disposed, notifications], [
			{ credits: [], configuration: [], disposed: 1 }, 1, 1, 0,
		]);
	});

	for (const kind of ['metadata', 'questions'] as const) {
		for (const release of ['last lease', 'pool'] as const) {
			test(`${kind} delegates pending-load cancellation and late-reference cleanup on ${release} disposal`, async () => {
				const h = setup();
				const loaded = new DeferredPromise<IChatModelReference | undefined>();
				let token: CancellationToken | undefined;
				let loads = 0;
				let released = 0;
				h.instantiation.stub(IChatService, new class extends mock<IChatService>() {
					override acquireExistingSession() { return undefined; }
					override acquireOrLoadSession(_resource: URI, _location: ChatAgentLocation, cancellation: CancellationToken) {
						token = cancellation;
						loads++;
						return loaded.p;
					}
				}());
				h.instantiation.stub(ILogService, store.add(new NullLogService()));
				h.instantiation.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
					override getMaterializedSessionResource() { return undefined; }
				}());
				const acquire = () => kind === 'metadata' ? h.pool.acquireMetadata(chat()) : h.pool.acquireQuestions(chat());
				const first = store.add(acquire()!);
				const second = store.add(acquire()!);
				first.dispose();
				assert.deepStrictEqual([loads, token?.isCancellationRequested], [1, false]);
				if (release === 'pool') {
					h.pool.dispose();
				} else {
					second.dispose();
				}
				assert.strictEqual(token?.isCancellationRequested, true);
				await loaded.complete({
					get object(): never { throw new Error('Must not observe a late model after disposal'); },
					dispose: () => { released++; },
				});
				assert.deepStrictEqual([loads, released], [1, 1]);
			});
		}
	}
});
