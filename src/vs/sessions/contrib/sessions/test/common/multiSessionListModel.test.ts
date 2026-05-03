/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import {
	MultiSessionInputRow,
	MultiSessionListRowStatus,
	buildMultiSessionList,
	formatElapsed,
} from '../../common/multiSessionListModel.js';

const NOW = 1_700_000_000_000;

function uri(id: string): URI {
	return URI.parse(`agent-session:/${id}`);
}

function row(overrides: Partial<MultiSessionInputRow> & { id: string }): MultiSessionInputRow {
	return {
		resource: uri(overrides.id),
		label: overrides.label ?? `session-${overrides.id}`,
		providerType: overrides.providerType ?? 'local',
		status: overrides.status ?? MultiSessionListRowStatus.InProgress,
		archived: overrides.archived ?? false,
		description: overrides.description,
		created: overrides.created ?? NOW - 60_000,
		lastActivity: overrides.lastActivity,
		parentResource: overrides.parentResource,
	};
}

suite('multiSessionListModel.buildMultiSessionList', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('archived sessions are excluded', () => {
		const result = buildMultiSessionList([
			row({ id: 'a', archived: true }),
			row({ id: 'b', archived: false }),
		], { now: NOW });

		assert.deepStrictEqual(result.map(r => r.resource.toString()), [uri('b').toString()]);
	});

	test('roots are sorted most-recent-activity first', () => {
		const result = buildMultiSessionList([
			row({ id: 'old', created: NOW - 600_000 }),
			row({ id: 'fresh', created: NOW - 600_000, lastActivity: NOW - 1_000 }),
			row({ id: 'mid', created: NOW - 600_000, lastActivity: NOW - 60_000 }),
		], { now: NOW });

		assert.deepStrictEqual(
			result.map(r => ({ resource: r.resource.toString(), depth: r.depth })),
			[
				{ resource: uri('fresh').toString(), depth: 0 },
				{ resource: uri('mid').toString(), depth: 0 },
				{ resource: uri('old').toString(), depth: 0 },
			],
		);
	});

	test('children nest beneath their parent at the right depth', () => {
		const orchestrator = row({ id: 'orchestrator', lastActivity: NOW - 5_000 });
		const child1 = row({ id: 'coder', parentResource: uri('orchestrator'), lastActivity: NOW - 4_000 });
		const child2 = row({ id: 'tester', parentResource: uri('orchestrator'), lastActivity: NOW - 3_000 });
		const grandchild = row({ id: 'subagent', parentResource: uri('coder'), lastActivity: NOW - 2_000 });

		const result = buildMultiSessionList([orchestrator, child1, child2, grandchild], { now: NOW });

		assert.deepStrictEqual(
			result.map(r => ({ id: r.label, depth: r.depth, hasChildren: r.hasChildren })),
			[
				{ id: 'session-orchestrator', depth: 0, hasChildren: true },
				{ id: 'session-tester', depth: 1, hasChildren: false },
				{ id: 'session-coder', depth: 1, hasChildren: true },
				{ id: 'session-subagent', depth: 2, hasChildren: false },
			],
		);
	});

	test('orphan children (parent missing or archived) are promoted to roots', () => {
		const result = buildMultiSessionList([
			row({ id: 'orphan', parentResource: uri('missing-parent'), lastActivity: NOW - 1_000 }),
			row({ id: 'archived-parent', archived: true }),
			row({ id: 'orphan-of-archived', parentResource: uri('archived-parent'), lastActivity: NOW - 500 }),
		], { now: NOW });

		assert.deepStrictEqual(
			result.map(r => ({ id: r.label, depth: r.depth })),
			[
				{ id: 'session-orphan-of-archived', depth: 0 },
				{ id: 'session-orphan', depth: 0 },
			],
		);
	});

	test('elapsedMs is computed against now using lastActivity, falling back to created', () => {
		const result = buildMultiSessionList([
			row({ id: 'with-activity', created: NOW - 100_000, lastActivity: NOW - 30_000 }),
			row({ id: 'no-activity', created: NOW - 7_000 }),
		], { now: NOW });

		assert.deepStrictEqual(
			result.map(r => ({ id: r.label, elapsedMs: r.elapsedMs })),
			[
				{ id: 'session-no-activity', elapsedMs: 7_000 },
				{ id: 'session-with-activity', elapsedMs: 30_000 },
			],
		);
	});

	test('maxDepth caps depth without dropping rows', () => {
		const result = buildMultiSessionList([
			row({ id: 'a' }),
			row({ id: 'b', parentResource: uri('a') }),
			row({ id: 'c', parentResource: uri('b') }),
			row({ id: 'd', parentResource: uri('c') }),
		], { now: NOW, maxDepth: 1 });

		assert.deepStrictEqual(
			result.map(r => ({ id: r.label, depth: r.depth })),
			[
				{ id: 'session-a', depth: 0 },
				{ id: 'session-b', depth: 1 },
				{ id: 'session-c', depth: 1 },
				{ id: 'session-d', depth: 1 },
			],
		);
	});

	test('limit truncates the output to the most-recent-first prefix', () => {
		const result = buildMultiSessionList([
			row({ id: 'a', lastActivity: NOW - 1_000 }),
			row({ id: 'b', lastActivity: NOW - 2_000 }),
			row({ id: 'c', lastActivity: NOW - 3_000 }),
		], { now: NOW, limit: 2 });

		assert.deepStrictEqual(
			result.map(r => r.label),
			['session-a', 'session-b'],
		);
	});

	test('row carries through label, status, providerType, description, parentResource', () => {
		const [parent, child] = buildMultiSessionList([
			row({
				id: 'orchestrator',
				label: 'Plan a refactor',
				status: MultiSessionListRowStatus.InProgress,
				providerType: 'local',
				description: 'Drafting plan...',
			}),
			row({
				id: 'coder',
				label: 'Write code',
				parentResource: uri('orchestrator'),
				status: MultiSessionListRowStatus.NeedsInput,
				providerType: 'cloud',
				description: 'Awaiting approval',
			}),
		], { now: NOW });

		assert.deepStrictEqual(
			{
				parent: {
					label: parent.label,
					status: parent.status,
					providerType: parent.providerType,
					description: parent.description,
					parentResource: parent.parentResource,
					hasChildren: parent.hasChildren,
				},
				child: {
					label: child.label,
					status: child.status,
					providerType: child.providerType,
					description: child.description,
					parentResource: child.parentResource?.toString(),
					hasChildren: child.hasChildren,
				},
			},
			{
				parent: {
					label: 'Plan a refactor',
					status: MultiSessionListRowStatus.InProgress,
					providerType: 'local',
					description: 'Drafting plan...',
					parentResource: undefined,
					hasChildren: true,
				},
				child: {
					label: 'Write code',
					status: MultiSessionListRowStatus.NeedsInput,
					providerType: 'cloud',
					description: 'Awaiting approval',
					parentResource: uri('orchestrator').toString(),
					hasChildren: false,
				},
			},
		);
	});
});

suite('multiSessionListModel.formatElapsed', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('produces compact, monotonic strings across the full range', () => {
		const cases: ReadonlyArray<{ ms: number; expected: string }> = [
			{ ms: -100, expected: '' },
			{ ms: 0, expected: '0s' },
			{ ms: 12_000, expected: '12s' },
			{ ms: 59_999, expected: '59s' },
			{ ms: 60_000, expected: '1m' },
			{ ms: 4 * 60_000, expected: '4m' },
			{ ms: 60 * 60_000, expected: '1h' },
			{ ms: 60 * 60_000 + 12 * 60_000, expected: '1h 12m' },
			{ ms: 23 * 60 * 60_000, expected: '23h' },
			{ ms: 24 * 60 * 60_000, expected: '1d' },
			{ ms: 3 * 24 * 60 * 60_000, expected: '3d' },
		];

		assert.deepStrictEqual(
			cases.map(c => formatElapsed(c.ms)),
			cases.map(c => c.expected),
		);
	});
});
