/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	BASELINE_TURN_ID,
	ChangesetKind,
	buildChangesetUri,
	buildCompareTurnsChangesetUri,
	buildCompareTurnsChangesetUriTemplate,
	buildSessionChangesetUri,
	buildTurnChangesetUri,
	buildTurnChangesetUriTemplate,
	buildUncommittedChangesetUri,
	isChangesetUri,
	isSessionChangesetUri,
	isUncommittedChangesetUri,
	parseChangesetUri,
	parseCompareTurnsChangesetUri,
	parseTurnChangesetUri,
} from '../../common/changesetUri.js';

suite('changesetUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionUri = 'copilot:/abc-123';

	test('builders produce the documented shapes', () => {
		assert.strictEqual(buildSessionChangesetUri(sessionUri), 'copilot:/abc-123/changeset/session');
		assert.strictEqual(buildUncommittedChangesetUri(sessionUri), 'copilot:/abc-123/changeset/uncommitted');
		assert.strictEqual(buildTurnChangesetUri(sessionUri, 't1'), 'copilot:/abc-123/changeset/turn/t1');
		assert.strictEqual(buildTurnChangesetUriTemplate(sessionUri), 'copilot:/abc-123/changeset/turn/{turnId}');
		assert.strictEqual(buildCompareTurnsChangesetUri(sessionUri, 't1', 't2'), 'copilot:/abc-123/changeset/compare/t1/t2');
		assert.strictEqual(buildCompareTurnsChangesetUriTemplate(sessionUri), 'copilot:/abc-123/changeset/compare/{originalTurnId}/{modifiedTurnId}');
		assert.strictEqual(buildChangesetUri(sessionUri, 'session'), `${sessionUri}/changeset/session`);
	});

	test('builders reject malformed ids', () => {
		assert.throws(() => buildChangesetUri(sessionUri, ''));
		assert.throws(() => buildChangesetUri(sessionUri, 'with/slash'));
		assert.throws(() => buildTurnChangesetUri(sessionUri, ''));
		assert.throws(() => buildTurnChangesetUri(sessionUri, 'a/b'));
		assert.throws(() => buildTurnChangesetUri(sessionUri, BASELINE_TURN_ID));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, '', 't2'));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, 't1', ''));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, 'a/b', 't2'));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, 't1', 'a/b'));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, 't1', BASELINE_TURN_ID));
	});

	test('compare URI accepts BASELINE_TURN_ID on the original side', () => {
		const uri = buildCompareTurnsChangesetUri(sessionUri, BASELINE_TURN_ID, 't2');
		assert.strictEqual(uri, 'copilot:/abc-123/changeset/compare/baseline/t2');
		assert.deepStrictEqual(parseCompareTurnsChangesetUri(uri),
			{ sessionUri, originalTurnId: BASELINE_TURN_ID, modifiedTurnId: 't2' });
	});

	test('parseChangesetUri identifies the well-known kinds', () => {
		assert.deepStrictEqual(parseChangesetUri(buildSessionChangesetUri(sessionUri)),
			{ sessionUri, changesetId: 'session', kind: ChangesetKind.Session });
		assert.deepStrictEqual(parseChangesetUri(buildUncommittedChangesetUri(sessionUri)),
			{ sessionUri, changesetId: 'uncommitted', kind: ChangesetKind.Uncommitted });
		assert.deepStrictEqual(parseChangesetUri(buildTurnChangesetUri(sessionUri, 't1')),
			{ sessionUri, changesetId: 'turn/t1', kind: ChangesetKind.Turn, turnId: 't1' });
		assert.deepStrictEqual(parseChangesetUri(buildCompareTurnsChangesetUri(sessionUri, 't1', 't2')),
			{ sessionUri, changesetId: 'compare/t1/t2', kind: ChangesetKind.Compare, originalTurnId: 't1', modifiedTurnId: 't2' });
		assert.deepStrictEqual(parseChangesetUri(buildChangesetUri(sessionUri, 'staged')),
			{ sessionUri, changesetId: 'staged', kind: ChangesetKind.Unknown });
	});

	test('parseChangesetUri returns undefined for non-changeset / malformed URIs', () => {
		assert.strictEqual(parseChangesetUri(sessionUri), undefined);
		assert.strictEqual(parseChangesetUri('agenthost:/root'), undefined);
		assert.strictEqual(parseChangesetUri(`${sessionUri}/changeset/foo/bar`), undefined);
		assert.strictEqual(parseChangesetUri(buildTurnChangesetUriTemplate(sessionUri)), undefined);
		assert.strictEqual(parseChangesetUri(`${sessionUri}/changeset/turn/`), undefined);
		assert.strictEqual(parseChangesetUri(`${sessionUri}/changeset/turn/a/b`), undefined);
		assert.strictEqual(parseChangesetUri(buildCompareTurnsChangesetUriTemplate(sessionUri)), undefined);
		assert.strictEqual(parseChangesetUri(`${sessionUri}/changeset/compare/t1`), undefined);
		assert.strictEqual(parseChangesetUri(`${sessionUri}/changeset/compare/t1/t2/t3`), undefined);
		assert.strictEqual(parseChangesetUri(`${sessionUri}/changeset/compare/{originalTurnId}/t2`), undefined);
		assert.strictEqual(parseChangesetUri(`${sessionUri}/changeset/compare/t1/{modifiedTurnId}`), undefined);
	});

	test('parseTurnChangesetUri only matches expanded turn URIs', () => {
		assert.deepStrictEqual(parseTurnChangesetUri(buildTurnChangesetUri(sessionUri, 't42')),
			{ sessionUri, turnId: 't42' });
		assert.strictEqual(parseTurnChangesetUri(buildSessionChangesetUri(sessionUri)), undefined);
		assert.strictEqual(parseTurnChangesetUri(buildTurnChangesetUriTemplate(sessionUri)), undefined);
		assert.strictEqual(parseTurnChangesetUri(buildCompareTurnsChangesetUri(sessionUri, 't1', 't2')), undefined);
	});

	test('parseCompareTurnsChangesetUri only matches expanded compare URIs', () => {
		assert.deepStrictEqual(parseCompareTurnsChangesetUri(buildCompareTurnsChangesetUri(sessionUri, 't1', 't2')),
			{ sessionUri, originalTurnId: 't1', modifiedTurnId: 't2' });
		assert.strictEqual(parseCompareTurnsChangesetUri(buildSessionChangesetUri(sessionUri)), undefined);
		assert.strictEqual(parseCompareTurnsChangesetUri(buildTurnChangesetUri(sessionUri, 't1')), undefined);
		assert.strictEqual(parseCompareTurnsChangesetUri(buildCompareTurnsChangesetUriTemplate(sessionUri)), undefined);
	});

	test('predicates match the parser semantics', () => {
		assert.strictEqual(isChangesetUri(buildSessionChangesetUri(sessionUri)), true);
		assert.strictEqual(isChangesetUri(buildUncommittedChangesetUri(sessionUri)), true);
		assert.strictEqual(isChangesetUri(buildTurnChangesetUri(sessionUri, 't1')), true);
		assert.strictEqual(isChangesetUri(sessionUri), false);
		assert.strictEqual(isSessionChangesetUri(buildSessionChangesetUri(sessionUri)), true);
		assert.strictEqual(isSessionChangesetUri(buildUncommittedChangesetUri(sessionUri)), false);
		assert.strictEqual(isUncommittedChangesetUri(buildUncommittedChangesetUri(sessionUri)), true);
		assert.strictEqual(isUncommittedChangesetUri(buildSessionChangesetUri(sessionUri)), false);
	});
});
