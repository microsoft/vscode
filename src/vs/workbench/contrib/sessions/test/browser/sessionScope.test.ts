/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { SessionsListingScopeFilter } from '../../browser/sessionScope.js';
import { ISessionChangeEvent } from '../../common/sessionsProvider.js';
import { buildTestSession, buildTestWorkspace } from '../common/testSessionBuilder.js';

suite('SessionsListingScopeFilter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** A session working in the folder `/home/user/projects/<folder>`, which can move to another folder. */
	function createSession(id: string, folder: string): ISession & { readonly workspace: ISettableObservable<ISessionWorkspace | undefined> } {
		return { ...buildTestSession({ id, title: id }).session, workspace: observableValue<ISessionWorkspace | undefined>(id, buildTestWorkspace(folder)) };
	}

	test('reports a session entering the scope as added, one leaving it as changed, and every removal as removed', () => {
		const here = createSession('here', 'repo');
		const elsewhere = createSession('elsewhere', 'other');
		const hydrating = createSession('hydrating', 'other');
		const sessions = [here, elsewhere, hydrating];
		const changes = disposables.add(new Emitter<ISessionChangeEvent>());
		const folders = observableValue<readonly URI[]>('folders', [URI.file('/home/user/projects/repo')]);
		const filter = disposables.add(new SessionsListingScopeFilter({ folders, repositories: constObservable([]) }, () => sessions, changes.event));
		const ids = (list: readonly ISession[]) => list.map(session => session.sessionId).sort().join(',');
		const events: string[] = [];
		disposables.add(filter.onDidChangeSessions(e => events.push(`added=${ids(e.added)} removed=${ids(e.removed)} changed=${ids(e.changed)}`)));
		const listed: string[] = [ids(filter.getSessions())];

		// A session's workspace hydrates into the scope, without an event of its provider
		hydrating.workspace.set(buildTestWorkspace('repo'), undefined);
		listed.push(ids(filter.getSessions()));
		// Changes of hidden sessions are not reported, those of listed ones are
		changes.fire({ added: [], removed: [], changed: [elsewhere, here] });
		// The window's folder changes: the listed sessions are hidden, not removed
		folders.set([URI.file('/home/user/projects/other')], undefined);
		listed.push(ids(filter.getSessions()));
		// A removal of a hidden session is still reported, as an open of it can show it
		sessions.splice(sessions.indexOf(here), 1);
		changes.fire({ added: [], removed: [here], changed: [] });
		// Without folders, every session is listed
		folders.set([], undefined);
		listed.push(ids(filter.getSessions()));

		assert.deepStrictEqual({ listed, events }, {
			listed: ['here', 'here,hydrating', 'elsewhere', 'elsewhere,hydrating'],
			events: [
				'added=hydrating removed= changed=',
				'added= removed= changed=here',
				'added=elsewhere removed= changed=here,hydrating',
				'added= removed=here changed=',
				'added=hydrating removed= changed=',
			],
		});
	});

	test('lists the replacement of a session, as a change of its sessions only reports it, and matches it to the scope again', () => {
		const here = createSession('here', 'repo');
		const other = createSession('other', 'repo');
		const sessions: ISession[] = [here, other];
		const changes = disposables.add(new Emitter<ISessionChangeEvent>());
		const folders = observableValue<readonly URI[]>('folders', [URI.file('/home/user/projects/repo')]);
		const filter = disposables.add(new SessionsListingScopeFilter({ folders, repositories: constObservable([]) }, () => sessions, changes.event));
		const events: { readonly added: readonly ISession[]; readonly removed: readonly ISession[]; readonly changed: readonly ISession[] }[] = [];
		disposables.add(filter.onDidChangeSessions(e => events.push(e)));

		// A pending session committed under the same ID: another object, which comes as a change only
		const committed = createSession('here', 'repo');
		sessions[0] = committed;
		changes.fire({ added: [], removed: [], changed: [committed] });
		const listedCommitted = filter.getSessions().find(session => session.sessionId === 'here');
		// A replacement that works elsewhere leaves the scope
		const moved = createSession('other', 'elsewhere');
		sessions[1] = moved;
		changes.fire({ added: [], removed: [], changed: [moved] });

		assert.deepStrictEqual({
			listedCommitted: listedCommitted === committed,
			listed: filter.getSessions().map(session => session.sessionId),
			events: events.map(e => ({ added: e.added.length, removed: e.removed.length, changed: e.changed.map(session => session === committed ? 'committed' : session === other ? 'other' : session === moved ? 'moved' : 'stale') })),
		}, {
			listedCommitted: true,
			listed: ['here'],
			events: [{ added: 0, removed: 0, changed: ['committed'] }, { added: 0, removed: 0, changed: ['other'] }],
		});
	});

	test('lists the replacement of a hidden session that moves into the scope, and the session a draft graduates into', () => {
		const hidden = createSession('hidden', 'other');
		const draft = createSession('draft', 'repo');
		const sessions: ISession[] = [hidden];
		const changes = disposables.add(new Emitter<ISessionChangeEvent>());
		const folders = observableValue<readonly URI[]>('folders', [URI.file('/home/user/projects/repo')]);
		const filter = disposables.add(new SessionsListingScopeFilter({ folders, repositories: constObservable([]) }, () => sessions, changes.event));
		const listed = () => filter.getSessions().map(session => session === hidden ? 'hidden (stale)' : session === draft ? 'draft' : session.sessionId === 'hidden' ? 'hidden (replacement)' : session.sessionId);

		// A replacement under the same ID that works in the scope, reported as a change only
		const moved = createSession('hidden', 'repo');
		sessions[0] = moved;
		changes.fire({ added: [], removed: [], changed: [moved] });
		const afterMove = listed();
		// A draft is added and listed; its provider then drops it for the session it committed, with no change, and matches again
		sessions.push(draft);
		changes.fire({ added: [draft], removed: [], changed: [] });
		const withDraft = listed();
		sessions.splice(sessions.indexOf(draft), 1, createSession('committed', 'repo'));
		filter.rematch();

		assert.deepStrictEqual({ afterMove, withDraft, graduated: listed() }, {
			afterMove: ['hidden (replacement)'],
			withDraft: ['hidden (replacement)', 'draft'],
			graduated: ['hidden (replacement)', 'committed'],
		});
	});

	test('announces how it lists the sessions differently from those listed before it', () => {
		const here = createSession('here', 'repo');
		const elsewhere = createSession('elsewhere', 'other');
		const sessions = [here, elsewhere];
		const folders = observableValue<readonly URI[]>('folders', [URI.file('/home/user/projects/repo')]);
		const filter = disposables.add(new SessionsListingScopeFilter({ folders, repositories: constObservable([]) }, () => sessions, Event.None));
		const ids = (list: readonly ISession[]) => list.map(session => session.sessionId).sort().join(',');
		const events: string[] = [];
		disposables.add(filter.onDidChangeSessions(e => events.push(`added=${ids(e.added)} removed=${ids(e.removed)} changed=${ids(e.changed)}`)));

		// From every session, as without a scope; from an earlier scope of the other folder; from the same sessions
		filter.announceFrom(sessions);
		filter.announceFrom([elsewhere]);
		filter.announceFrom([here]);

		assert.deepStrictEqual(events, [
			'added= removed= changed=elsewhere',
			'added=here removed= changed=elsewhere',
		]);
	});

	test('lists workspace-less quick chats in every scope, but not a session whose workspace is still hydrating', () => {
		const quickChatFlag = observableValue('isQuickChat', true);
		const quickChat: ISession = { ...createSession('quickChat', 'scratch'), workspace: observableValue<ISessionWorkspace | undefined>('quickChat', undefined), isQuickChat: quickChatFlag };
		const hydrating = { ...createSession('hydrating', 'repo'), isQuickChat: constObservable(false) };
		hydrating.workspace.set(undefined, undefined);
		const sessions = [quickChat, hydrating];
		const changes = disposables.add(new Emitter<ISessionChangeEvent>());
		const filter = disposables.add(new SessionsListingScopeFilter({ folders: constObservable([URI.file('/home/user/projects/repo')]), repositories: constObservable([]) }, () => sessions, changes.event));
		const ids = (list: readonly ISession[]) => list.map(session => session.sessionId).sort().join(',');
		const events: string[] = [];
		disposables.add(filter.onDidChangeSessions(e => events.push(`added=${ids(e.added)} removed=${ids(e.removed)} changed=${ids(e.changed)}`)));
		const listed: string[] = [ids(filter.getSessions())];

		// The hydrating session's workspace arrives, in the scope
		hydrating.workspace.set(buildTestWorkspace('repo'), undefined);
		listed.push(ids(filter.getSessions()));
		// The quick chat stops being one, without a workspace in the scope
		quickChatFlag.set(false, undefined);
		listed.push(ids(filter.getSessions()));

		assert.deepStrictEqual({ listed, events }, {
			listed: ['quickChat', 'hydrating,quickChat', 'hydrating'],
			events: [
				'added=hydrating removed= changed=',
				'added= removed= changed=quickChat',
			],
		});
	});

	test('reports changes of sessions only for those it lists, without matching the sessions to the scope again', () => {
		const here = createSession('here', 'repo');
		const elsewhere = createSession('elsewhere', 'other');
		const changes = disposables.add(new Emitter<ISessionChangeEvent>());
		let reads = 0;
		const filter = disposables.add(new SessionsListingScopeFilter({ folders: constObservable([URI.file('/home/user/projects/repo')]), repositories: constObservable([]) }, () => { reads++; return [here, elsewhere]; }, changes.event));
		const events: string[] = [];
		disposables.add(filter.onDidChangeSessions(e => events.push(`added=${e.added.length} removed=${e.removed.length} changed=${e.changed.map(session => session.sessionId).join(',')}`)));
		const initialReads = reads;

		// Such as of the sessions' status as they stream
		changes.fire({ added: [], removed: [], changed: [here, elsewhere] });
		changes.fire({ added: [], removed: [], changed: [elsewhere] });
		const afterChanges = reads - initialReads;
		// A change of what the provider lists, such as as it hides another agent's sessions, matches them again
		changes.fire({ added: [], removed: [], changed: [] });

		assert.deepStrictEqual({ afterChanges, afterRequery: reads - initialReads, events }, {
			afterChanges: 0,
			afterRequery: 1,
			events: ['added=0 removed=0 changed=here'],
		});
	});

	test('lists the sessions on GitHub of the repositories of the folders\' origin, on any branch, and every session in an empty window', () => {
		const onGitHub = (id: string, path: string) => {
			const root = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path });
			return { ...buildTestSession({ id, title: id }).session, workspace: constObservable<ISessionWorkspace | undefined>({ ...buildTestWorkspace(id), folders: [{ root, workingDirectory: root, name: id, description: undefined, gitRepository: undefined }] }) };
		};
		const sessions = [onGitHub('main', '/Microsoft/VSCode/HEAD'), onGitHub('branch', '/microsoft/vscode/feature%2Fx'), onGitHub('other', '/microsoft/vscode-tools/HEAD'), createSession('local', 'repo')];
		const folders = observableValue<readonly URI[]>('folders', [URI.file('/home/user/projects/elsewhere')]);
		const filter = disposables.add(new SessionsListingScopeFilter({ folders, repositories: constObservable([]), gitHubRepositories: constObservable(['microsoft/vscode']) }, () => sessions, Event.None));
		const listed = () => filter.getSessions().map(session => session.sessionId).sort();
		const scoped = listed();
		folders.set([], undefined);

		assert.deepStrictEqual({ scoped, emptyWindow: listed() }, {
			scoped: ['branch', 'main'],
			emptyWindow: ['branch', 'local', 'main', 'other'],
		});
	});
});
