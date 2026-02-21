/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AgentFeedbackService, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { IChatEditingService } from '../../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

function r(startLine: number, endLine: number = startLine): Range {
	return new Range(startLine, 1, endLine, 1);
}

function feedbackSummary(items: readonly { resourceUri: URI; range: { startLineNumber: number } }[]): string[] {
	return items.map(f => `${f.resourceUri.path}:${f.range.startLineNumber}`);
}

suite('AgentFeedbackService - Ordering', () => {

	const store = new DisposableStore();
	let service: IAgentFeedbackService;
	let session: URI;
	let fileA: URI;
	let fileB: URI;
	let fileC: URI;

	setup(() => {
		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() { });
		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() { });

		service = store.add(instantiationService.createInstance(AgentFeedbackService));
		session = URI.parse('test://session/1');
		fileA = URI.parse('file:///a.ts');
		fileB = URI.parse('file:///b.ts');
		fileC = URI.parse('file:///c.ts');
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('single file - items sorted by line number', () => {
		service.addFeedback(session, fileA, r(20), 'line 20');
		service.addFeedback(session, fileA, r(5), 'line 5');
		service.addFeedback(session, fileA, r(10), 'line 10');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:5',
			'/a.ts:10',
			'/a.ts:20',
		]);
	});

	test('multiple files - files ordered by recency, items within file sorted by line', () => {
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileA, r(5), 'A:5');
		service.addFeedback(session, fileB, r(20), 'B:20');
		service.addFeedback(session, fileB, r(3), 'B:3');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:5',
			'/a.ts:10',
			'/b.ts:3',
			'/b.ts:20',
		]);
	});

	test('new file appended to end', () => {
		service.addFeedback(session, fileA, r(1), 'A:1');
		service.addFeedback(session, fileB, r(1), 'B:1');
		service.addFeedback(session, fileC, r(1), 'C:1');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:1',
			'/b.ts:1',
			'/c.ts:1',
		]);
	});

	test('adding to existing file does not change file ordering', () => {
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileB, r(10), 'B:10');
		// Add more feedback to fileA — should stay before fileB
		service.addFeedback(session, fileA, r(5), 'A:5');
		service.addFeedback(session, fileA, r(20), 'A:20');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:5',
			'/a.ts:10',
			'/a.ts:20',
			'/b.ts:10',
		]);
	});

	test('interleaved adds across files maintain file recency and line sort', () => {
		service.addFeedback(session, fileA, r(30), 'A:30');
		service.addFeedback(session, fileB, r(50), 'B:50');
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileC, r(1), 'C:1');
		service.addFeedback(session, fileB, r(5), 'B:5');
		service.addFeedback(session, fileA, r(20), 'A:20');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:10',
			'/a.ts:20',
			'/a.ts:30',
			'/b.ts:5',
			'/b.ts:50',
			'/c.ts:1',
		]);
	});

	test('navigation follows sorted order', () => {
		service.addFeedback(session, fileA, r(20), 'A:20');
		service.addFeedback(session, fileB, r(10), 'B:10');
		service.addFeedback(session, fileA, r(5), 'A:5');

		// Expected order: A:5, A:20, B:10
		const first = service.getNextFeedback(session, true)!;
		assert.strictEqual(first.resourceUri.path, '/a.ts');
		assert.strictEqual(first.range.startLineNumber, 5);

		const second = service.getNextFeedback(session, true)!;
		assert.strictEqual(second.resourceUri.path, '/a.ts');
		assert.strictEqual(second.range.startLineNumber, 20);

		const third = service.getNextFeedback(session, true)!;
		assert.strictEqual(third.resourceUri.path, '/b.ts');
		assert.strictEqual(third.range.startLineNumber, 10);

		// Wraps around
		const fourth = service.getNextFeedback(session, true)!;
		assert.strictEqual(fourth.resourceUri.path, '/a.ts');
		assert.strictEqual(fourth.range.startLineNumber, 5);
	});

	test('navigation bearings reflect sorted position', () => {
		service.addFeedback(session, fileA, r(20), 'A:20');
		service.addFeedback(session, fileA, r(5), 'A:5');
		service.addFeedback(session, fileB, r(1), 'B:1');

		// Before navigation, no anchor
		let bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, -1);
		assert.strictEqual(bearing.totalCount, 3);

		// Navigate to first (A:5)
		service.getNextFeedback(session, true);
		bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, 0);

		// Navigate to second (A:20)
		service.getNextFeedback(session, true);
		bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, 1);

		// Navigate to third (B:1)
		service.getNextFeedback(session, true);
		bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, 2);
	});

	test('removing feedback preserves ordering', () => {
		const f1 = service.addFeedback(session, fileA, r(30), 'A:30');
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileA, r(20), 'A:20');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:10',
			'/a.ts:20',
			'/a.ts:30',
		]);

		service.removeFeedback(session, f1.id);
		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:10',
			'/a.ts:20',
		]);
	});

	test('same line number items are stable', () => {
		const f1 = service.addFeedback(session, fileA, r(10), 'first');
		const f2 = service.addFeedback(session, fileA, r(10), 'second');

		const items = service.getFeedback(session);
		assert.strictEqual(items[0].id, f1.id);
		assert.strictEqual(items[1].id, f2.id);
	});
});
