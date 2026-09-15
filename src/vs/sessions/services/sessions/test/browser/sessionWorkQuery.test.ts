/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, SessionStatus } from '../../common/session.js';
import { getSessionWorkViewLabel, isPromotableSessionWorkView, ISessionWorkEntry, matchesSessionWorkQuery, SESSION_WORK_VIEWS } from '../../common/sessionWorkQuery.js';
import { ISessionWorkSummary } from '../../common/sessionWorkSummary.js';

suite('Session work metadata queries', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function entry(options: { archived?: boolean; running?: boolean; attention?: 'input' | 'error' | 'connection'; results?: boolean; automation?: boolean; archiveKind?: ISessionWorkSummary['archiveKind'] } = {}): ISessionWorkEntry {
		return {
			session: new class extends mock<ISession>() {
				override readonly title = constObservable('Preserve reconnect drafts');
				override readonly status = constObservable(SessionStatus.Completed);
				override readonly isArchived = constObservable(options.archived ?? false);
				override readonly isAutomation = constObservable(options.automation ?? false);
				override readonly workspace = constObservable(undefined);
			}(),
			collection: 'release',
			pinned: false,
			summary: new class extends mock<ISessionWorkSummary>() {
				override readonly running = options.running ?? false;
				override readonly attention = options.attention;
				override readonly hasUnreviewedResults = options.results ?? false;
				override readonly archiveKind = options.archiveKind ?? 'inspect';
			}(),
		};
	}

	test('active and archived queries remain disjoint', () => {
		assert.deepStrictEqual([
			matchesSessionWorkQuery(entry(), { view: 'all', filter: '' }),
			matchesSessionWorkQuery(entry({ archived: true }), { view: 'all', filter: '' }),
			matchesSessionWorkQuery(entry(), { view: 'archived', filter: '' }),
			matchesSessionWorkQuery(entry({ archived: true }), { view: 'archived', filter: '' }),
		], [true, false, false, true]);
	});

	test('My work includes settled work as well as priority groups without exposing archives or automations', () => {
		assert.deepStrictEqual([
			entry(), entry({ attention: 'input' }), entry({ running: true }), entry({ results: true }),
			entry({ archived: true }), entry({ automation: true }),
		].map(item => matchesSessionWorkQuery(item, { view: 'overview', filter: '' })), [true, true, true, true, false, false]);
	});

	test('overview, legacy cards, and unspecified views share the ordinary session catalog', () => {
		assert.deepStrictEqual(([undefined, 'cards', 'overview'] as const).map(view => {
			const query = { view, filter: '' };
			return [entry(), entry({ archived: true }), entry({ automation: true })].map(item => matchesSessionWorkQuery(item, query));
		}), [[true, false, false], [true, false, false], [true, false, false]]);
	});

	test('only ordinary builtin filters can be promoted and legacy card labels resolve to My work', () => {
		assert.deepStrictEqual({
			promotable: SESSION_WORK_VIEWS.filter(isPromotableSessionWorkView),
			review: getSessionWorkViewLabel('review'),
			legacy: getSessionWorkViewLabel('cards'),
			invalid: [undefined, null, '', {}, ['review']].map(isPromotableSessionWorkView),
		}, { promotable: ['needsInput', 'review', 'inProgress', 'all'], review: 'Needs review', legacy: 'My work', invalid: [false, false, false, false, false] });
	});

	test('reviewable results do not obscure active work or pending decisions', () => {
		assert.deepStrictEqual([
			matchesSessionWorkQuery(entry({ results: true }), { view: 'review', filter: '' }),
			matchesSessionWorkQuery(entry({ results: true, running: true }), { view: 'review', filter: '' }),
			matchesSessionWorkQuery(entry({ results: true, attention: 'input' }), { view: 'review', filter: '' }),
		], [true, false, false]);
	});

	test('collection and keyword criteria compose without interpreting commands', () => {
		const session = entry();
		assert.deepStrictEqual([
			matchesSessionWorkQuery(session, { view: 'all', collection: 'release', filter: 'reconnect drafts' }),
			matchesSessionWorkQuery(session, { view: 'all', collection: 'other', filter: 'reconnect' }),
			matchesSessionWorkQuery(session, { view: 'all', filter: 'archive everything' }),
		], [true, false, false]);
	});

	test('unknown connection states remain discoverable as attention', () => {
		assert.strictEqual(matchesSessionWorkQuery(entry({ attention: 'connection' }), { view: 'needsInput', filter: '' }), true);
	});

	test('overview still honors collection, status, and text filters', () => {
		const session = entry();
		assert.deepStrictEqual([
			matchesSessionWorkQuery(session, { view: 'overview', collection: 'release', status: SessionStatus.Completed, filter: 'RECONNECT' }),
			matchesSessionWorkQuery(session, { view: 'overview', collection: 'other', filter: '' }),
			matchesSessionWorkQuery(session, { view: 'overview', status: SessionStatus.NeedsInput, filter: '' }),
			matchesSessionWorkQuery(session, { view: 'overview', filter: 'not present' }),
		], [true, false, false, false]);
	});

	test('archive suggestions keep their eligibility and archive guards', () => {
		assert.deepStrictEqual([
			entry({ archiveKind: 'excluded' }), entry({ archiveKind: 'inspect' }), entry({ archived: true }), entry({ automation: true }),
		].map(item => matchesSessionWorkQuery(item, { view: 'archive', filter: '' })), [false, true, false, false]);
	});

	test('automation runs do not leak into ordinary work views', () => {
		assert.strictEqual(matchesSessionWorkQuery(entry({ automation: true, running: true }), { view: 'overview', filter: '' }), false);
	});
});
