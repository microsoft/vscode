/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { MessageKind, ResponsePartKind, SessionLifecycle, SessionStatus, TurnState, type ISessionWithDefaultChat, type Turn } from '../../common/state/sessionState.js';
import {
	AGENT_MERGE_CHANGESET_ID,
	ChangesetKind,
	buildChangesetUri,
	buildCompareTurnsChangesetUri,
	buildCompareTurnsChangesetUriTemplate,
	buildDefaultChangesetCatalog,
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
	resolveChangesetUriTemplate,
} from '../../common/changesetUri.js';

suite('changesetUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionUri = 'copilot:/abc-123';

	function turn(id: string, kind: MessageKind, agentMerge = false): Turn {
		return {
			id,
			message: {
				text: id,
				origin: { kind },
				...(agentMerge ? { _meta: toAgentMergeMessageMeta() } : {}),
			},
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		};
	}

	function state(agentMergeEnabled?: boolean, turns: Turn[] = [], changesets?: ISessionWithDefaultChat['changesets']): ISessionWithDefaultChat {
		return {
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			turns,
			changesets,
			...(agentMergeEnabled === undefined ? {} : {
				config: {
					schema: { type: 'object', properties: {} },
					values: { [SessionConfigKey.AgentMerge]: { enabled: agentMergeEnabled } },
				},
			}),
		};
	}

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
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, '', 't2'));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, 't1', ''));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, 'a/b', 't2'));
		assert.throws(() => buildCompareTurnsChangesetUri(sessionUri, 't1', 'a/b'));
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

	test('resolveChangesetUriTemplate joins a relative template onto the session channel', () => {
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, 'changeset/branch'), `${sessionUri}/changeset/branch`);
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, 'changeset/session'), buildSessionChangesetUri(sessionUri));
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, 'changeset/uncommitted'), buildUncommittedChangesetUri(sessionUri));
		// The variable survives resolution.
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, 'changeset/turn/{turnId}'), buildTurnChangesetUriTemplate(sessionUri));
	});

	test('resolveChangesetUriTemplate leaves an already-absolute template alone', () => {
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, buildSessionChangesetUri(sessionUri)), buildSessionChangesetUri(sessionUri));
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, buildTurnChangesetUriTemplate(sessionUri)), buildTurnChangesetUriTemplate(sessionUri));
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, 'copilot:/other/changeset/branch'), 'copilot:/other/changeset/branch');
	});

	test('resolveChangesetUriTemplate does not double up separators', () => {
		assert.strictEqual(resolveChangesetUriTemplate(sessionUri, '/changeset/branch'), `${sessionUri}/changeset/branch`);
		assert.strictEqual(resolveChangesetUriTemplate(`${sessionUri}/`, 'changeset/branch'), `${sessionUri}/changeset/branch`);
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

	test('advertises Agent Merge changes after enablement and preserves them across disable and restore', () => {
		const enabledCatalog = buildDefaultChangesetCatalog(sessionUri, state(true));
		const enabledNotice = turn('notice', MessageKind.SystemNotification);
		enabledNotice.responseParts.push({
			kind: ResponsePartKind.SystemNotification,
			content: 'Agent Merge enabled',
			_meta: toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.AgentMergeEnabled }),
		});

		const findAgentMerge = (catalog: ReturnType<typeof buildDefaultChangesetCatalog>) =>
			catalog.find(changeset => changeset.changeKind === AGENT_MERGE_CHANGESET_ID);

		assert.deepStrictEqual({
			neverEnabled: findAgentMerge(buildDefaultChangesetCatalog(sessionUri, state())),
			configuredWhileDisabled: findAgentMerge(buildDefaultChangesetCatalog(sessionUri, state(false))),
			enabled: findAgentMerge(enabledCatalog),
			disabledAfterEnable: findAgentMerge(buildDefaultChangesetCatalog(sessionUri, state(false, [], enabledCatalog))),
			restoredFromRepairTurn: findAgentMerge(buildDefaultChangesetCatalog(sessionUri, state(undefined, [turn('repair', MessageKind.SystemNotification, true)]))),
			restoredFromEnabledNotice: findAgentMerge(buildDefaultChangesetCatalog(sessionUri, state(undefined, [enabledNotice]))),
		}, {
			neverEnabled: undefined,
			configuredWhileDisabled: undefined,
			enabled: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(sessionUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
			disabledAfterEnable: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(sessionUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
			restoredFromRepairTurn: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(sessionUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
			restoredFromEnabledNotice: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(sessionUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
		});
	});
});
