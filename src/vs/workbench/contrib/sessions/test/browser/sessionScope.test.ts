/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
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
});
