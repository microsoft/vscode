/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ResponsePartKind, SessionLifecycle, SessionStatus, TurnState, withSessionGitState, type ISessionWithDefaultChat, type Turn } from '../../common/state/sessionState.js';
import {
	AGENT_MERGE_CHANGESET_ID,
	ChangesetKind,
	buildBranchChangesetUri,
	buildChangesetUri,
	buildCompareTurnsChangesetUri,
	buildCompareTurnsChangesetUriTemplate,
	buildDefaultChangesetCatalog,
	buildSessionChangesetUri,
	buildTurnChangesetUri,
	buildTurnChangesetUriTemplate,
	buildUncommittedChangesetUri,
	buildFolderChangesetOwnerUri,
	isChangesetUri,
	isSessionChangesetUri,
	isUncommittedChangesetUri,
	parseChangesetUri,
	parseCompareTurnsChangesetUri,
	parseTurnChangesetUri,
	parseFolderChangesetOwnerUri,
	resolveChangesetUriTemplate,
	resolveChatChangesetCatalogue,
	selectDefaultChangeset,
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

	function state(agentMergeEnabled?: boolean, turns: Turn[] = [], changesets?: ISessionWithDefaultChat['changesets'], workingDirectories?: readonly string[], configValues?: Record<string, unknown>): ISessionWithDefaultChat {
		return {
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			...(workingDirectories ? { workingDirectories: [...workingDirectories] } : {}),
			turns,
			changesets,
			...(agentMergeEnabled === undefined && configValues === undefined ? {} : {
				config: {
					schema: { type: 'object', properties: {} },
					values: configValues ?? { [SessionConfigKey.AgentMerge]: { enabled: agentMergeEnabled } },
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
		const folderOwner = buildFolderChangesetOwnerUri(sessionUri, 'folder-id');
		assert.ok(folderOwner.startsWith('ahp-folder-changeset://scope/'));
		assert.strictEqual(buildBranchChangesetUri(folderOwner), `${folderOwner}/changeset/branch`);
		assert.deepStrictEqual(parseFolderChangesetOwnerUri(folderOwner), { sessionUri, scopeId: 'folder-id' });
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
		assert.throws(() => buildFolderChangesetOwnerUri(sessionUri, ''));
		assert.throws(() => buildFolderChangesetOwnerUri(sessionUri, 'a/b'));
	});

	test('parseChangesetUri identifies the well-known kinds', () => {
		assert.deepStrictEqual(parseChangesetUri(buildSessionChangesetUri(sessionUri)),
			{ ownerUri: sessionUri, sessionUri, changesetId: 'session', kind: ChangesetKind.Session });
		assert.deepStrictEqual(parseChangesetUri(buildUncommittedChangesetUri(sessionUri)),
			{ ownerUri: sessionUri, sessionUri, changesetId: 'uncommitted', kind: ChangesetKind.Uncommitted });
		assert.deepStrictEqual(parseChangesetUri(buildTurnChangesetUri(sessionUri, 't1')),
			{ ownerUri: sessionUri, sessionUri, changesetId: 'turn/t1', kind: ChangesetKind.Turn, turnId: 't1' });
		assert.deepStrictEqual(parseChangesetUri(buildCompareTurnsChangesetUri(sessionUri, 't1', 't2')),
			{ ownerUri: sessionUri, sessionUri, changesetId: 'compare/t1/t2', kind: ChangesetKind.Compare, originalTurnId: 't1', modifiedTurnId: 't2' });
		assert.deepStrictEqual(parseChangesetUri(buildChangesetUri(sessionUri, 'staged')),
			{ ownerUri: sessionUri, sessionUri, changesetId: 'staged', kind: ChangesetKind.Unknown });
	});

	test('parseChangesetUri preserves chat ownership and resolves the containing session', () => {
		const chatUri = buildChatUri(sessionUri, 'peer');
		assert.deepStrictEqual(parseChangesetUri(buildSessionChangesetUri(chatUri)), {
			ownerUri: chatUri,
			sessionUri,
			changesetId: 'session',
			kind: ChangesetKind.Session,
		});
	});

	test('parseChangesetUri preserves folder ownership and resolves the containing session', () => {
		const folderOwner = buildFolderChangesetOwnerUri(sessionUri, 'folder-id');
		assert.deepStrictEqual(parseChangesetUri(buildBranchChangesetUri(folderOwner)), {
			ownerUri: folderOwner,
			sessionUri,
			changesetId: 'branch',
			kind: ChangesetKind.Branch,
		});
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

	test('selectDefaultChangeset follows the configured kind and falls back to catalogue order', () => {
		const changesets = [
			{ label: 'Session', changeKind: ChangesetKind.Session },
			{ label: 'Branch', changeKind: ChangesetKind.Branch },
		];
		assert.deepStrictEqual({
			implicit: selectDefaultChangeset(changesets)?.label,
			explicit: selectDefaultChangeset(changesets, ChangesetKind.Session)?.label,
			missing: selectDefaultChangeset(changesets, ChangesetKind.Uncommitted)?.label,
		}, {
			implicit: 'Branch',
			explicit: 'Session',
			missing: 'Session',
		});
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

	test('advertises cumulative session changes only on the session catalogue', () => {
		const creatingState = { ...state(), lifecycle: SessionLifecycle.Creating };
		const readyState = state();
		const defaultChatUri = buildDefaultChatUri(sessionUri);

		assert.deepStrictEqual({
			creatingSession: buildDefaultChangesetCatalog(sessionUri, creatingState),
			creatingChat: buildDefaultChangesetCatalog(defaultChatUri, creatingState),
			readySession: buildDefaultChangesetCatalog(sessionUri, readyState),
			readyChat: buildDefaultChangesetCatalog(defaultChatUri, readyState),
		}, {
			creatingSession: [],
			creatingChat: [{
				label: 'Uncommitted Changes',
				description: 'Show uncommitted changes in this session',
				uriTemplate: buildUncommittedChangesetUri(defaultChatUri),
				changeKind: ChangesetKind.Uncommitted,
			}],
			readySession: [{
				label: 'Session Changes',
				description: 'Show all changes made in this session',
				uriTemplate: buildSessionChangesetUri(sessionUri),
				changeKind: ChangesetKind.Session,
			}],
			readyChat: [{
				label: 'This Turn',
				description: 'Show changes made in this turn',
				uriTemplate: buildTurnChangesetUriTemplate(defaultChatUri),
				changeKind: ChangesetKind.Turn,
			}],
		});
	});

	test('projects the session-owned Session Changes entry into every chat catalogue', () => {
		const peerChatUri = buildChatUri(sessionUri, 'peer');
		const sessionChangeset = {
			label: 'Session Changes',
			uriTemplate: buildSessionChangesetUri(sessionUri),
			changeKind: ChangesetKind.Session,
		};
		const resolved = resolveChatChangesetCatalogue(peerChatUri, [{
			label: 'Branch Changes',
			uriTemplate: buildBranchChangesetUri(peerChatUri),
			changeKind: ChangesetKind.Branch,
		}, {
			label: 'This Turn',
			uriTemplate: buildTurnChangesetUriTemplate(peerChatUri),
			changeKind: ChangesetKind.Turn,
		}], [sessionChangeset]);

		assert.deepStrictEqual(resolved?.map(({ changeset, owner }) => ({
			kind: changeset.changeKind,
			owner,
		})), [
			{ kind: ChangesetKind.Branch, owner: 'chat' },
			{ kind: ChangesetKind.Session, owner: 'session' },
			{ kind: ChangesetKind.Turn, owner: 'chat' },
		]);
	});

	test('allows chat catalogues to share the session branch changeset without sharing chat-scoped changesets', () => {
		const peerChatUri = buildChatUri(sessionUri, 'peer');
		const readyState = {
			...state(),
			_meta: withSessionGitState(undefined, {
				branchName: 'feature',
				baseBranchName: 'main',
			}),
		};
		const catalogue = buildDefaultChangesetCatalog(peerChatUri, readyState, sessionUri);

		assert.deepStrictEqual(
			catalogue.map(changeset => ({ kind: changeset.changeKind, uri: changeset.uriTemplate })),
			[
				{ kind: ChangesetKind.Branch, uri: buildBranchChangesetUri(sessionUri) },
				{ kind: ChangesetKind.Uncommitted, uri: buildUncommittedChangesetUri(peerChatUri) },
				{ kind: ChangesetKind.Turn, uri: buildTurnChangesetUriTemplate(peerChatUri) },
				{ kind: ChangesetKind.Compare, uri: buildCompareTurnsChangesetUriTemplate(peerChatUri) },
			],
		);
	});

	test('uses the advertised default chat when projecting a session-owned catalogue', () => {
		const defaultChat = 'ahp-chat:/primary';
		const catalogue = [
			{ label: 'Branch Changes', changeKind: ChangesetKind.Branch, uriTemplate: 'ahp-changeset:/branch' },
			{ label: 'Session Changes', changeKind: ChangesetKind.Session, uriTemplate: 'ahp-changeset:/session' },
			{ label: 'This Turn', changeKind: ChangesetKind.Turn, uriTemplate: 'ahp-changeset:/turn/{turnId}' },
		];
		const project = (chat: string) => resolveChatChangesetCatalogue(chat, undefined, catalogue, defaultChat)
			?.map(({ changeset, owner }) => ({ kind: changeset.changeKind, uri: changeset.uriTemplate, owner }));

		assert.deepStrictEqual({
			defaultChat: project(defaultChat),
			peerChat: project('ahp-chat:/peer'),
			formerDefault: project(buildDefaultChatUri(sessionUri)),
		}, {
			defaultChat: [
				{ kind: ChangesetKind.Branch, uri: 'ahp-changeset:/branch', owner: 'session' },
				{ kind: ChangesetKind.Session, uri: 'ahp-changeset:/session', owner: 'session' },
				{ kind: ChangesetKind.Turn, uri: 'ahp-changeset:/turn/{turnId}', owner: 'session' },
			],
			peerChat: [
				{ kind: ChangesetKind.Session, uri: 'ahp-changeset:/session', owner: 'session' },
				{ kind: ChangesetKind.Turn, uri: 'ahp-changeset:/turn/{turnId}', owner: 'session' },
			],
			formerDefault: [
				{ kind: ChangesetKind.Session, uri: 'ahp-changeset:/session', owner: 'session' },
				{ kind: ChangesetKind.Turn, uri: 'ahp-changeset:/turn/{turnId}', owner: 'session' },
			],
		});
	});

	test('advertises Agent Merge changes only on the owning chat when chats share the folder', () => {
		const owner = buildChatUri(sessionUri, 'owner');
		const other = buildChatUri(sessionUri, 'other');
		const peerFolder = 'file:///work/peer';
		const sharedState = state(undefined, [], undefined, [peerFolder], {
			[SessionConfigKey.AgentMergeFolders]: { [peerFolder]: { enabled: true, chat: owner } },
		});
		const resolvedFor: [string, string | undefined][] = [];
		const resolveOwner = (folderKey: string, recordedChat: string | undefined) => {
			resolvedFor.push([folderKey, recordedChat]);
			return owner;
		};
		const hasAgentMerge = (chat: string) => buildDefaultChangesetCatalog(chat, sharedState, chat, resolveOwner)
			.some(changeset => changeset.changeKind === AGENT_MERGE_CHANGESET_ID);

		assert.deepStrictEqual({ owner: hasAgentMerge(owner), other: hasAgentMerge(other), resolvedFor }, {
			owner: true,
			other: false,
			resolvedFor: [[peerFolder, owner], [peerFolder, owner]],
		});
	});

	test('advertises Agent Merge changes after enablement and preserves them across disable and restore', () => {
		const defaultChatUri = buildDefaultChatUri(sessionUri);
		const peerChatUri = buildChatUri(sessionUri, 'peer');
		const peerFolder = 'file:///work/peer';
		const enabledCatalog = buildDefaultChangesetCatalog(defaultChatUri, state(true));
		const peerEnabledCatalog = buildDefaultChangesetCatalog(peerChatUri, state(undefined, [], undefined, [peerFolder], {
			[SessionConfigKey.AgentMergeFolders]: { [peerFolder]: { enabled: true } },
		}));
		const enabledNotice = turn('notice', MessageKind.SystemNotification);
		enabledNotice.responseParts.push({
			kind: ResponsePartKind.SystemNotification,
			content: 'Agent Merge enabled',
			_meta: toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.AgentMergeEnabled }),
		});

		const findAgentMerge = (catalog: ReturnType<typeof buildDefaultChangesetCatalog>) =>
			catalog.find(changeset => changeset.changeKind === AGENT_MERGE_CHANGESET_ID);

		assert.deepStrictEqual({
			session: findAgentMerge(buildDefaultChangesetCatalog(sessionUri, state(true))),
			peerChat: findAgentMerge(peerEnabledCatalog),
			neverEnabled: findAgentMerge(buildDefaultChangesetCatalog(defaultChatUri, state())),
			configuredWhileDisabled: findAgentMerge(buildDefaultChangesetCatalog(defaultChatUri, state(false))),
			enabled: findAgentMerge(enabledCatalog),
			disabledAfterEnable: findAgentMerge(buildDefaultChangesetCatalog(defaultChatUri, state(false, [], enabledCatalog))),
			restoredFromRepairTurn: findAgentMerge(buildDefaultChangesetCatalog(defaultChatUri, state(undefined, [turn('repair', MessageKind.SystemNotification, true)]))),
			restoredFromEnabledNotice: findAgentMerge(buildDefaultChangesetCatalog(defaultChatUri, state(undefined, [enabledNotice]))),
		}, {
			session: undefined,
			peerChat: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(peerChatUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
			neverEnabled: undefined,
			configuredWhileDisabled: undefined,
			enabled: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(defaultChatUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
			disabledAfterEnable: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(defaultChatUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
			restoredFromRepairTurn: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(defaultChatUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
			restoredFromEnabledNotice: {
				label: 'Agent Merge Changes',
				description: 'Show changes made by Agent Merge since the last user message',
				uriTemplate: buildCompareTurnsChangesetUriTemplate(defaultChatUri),
				changeKind: AGENT_MERGE_CHANGESET_ID,
			},
		});
	});
});
