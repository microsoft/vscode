/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue, autorun, ISettableObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SessionHasGitRepositoryContext } from '../../../../common/contextkeys.js';
import { ISession } from '../../common/session.js';
import { setSessionContextKeys } from '../../common/sessionContextKeys.js';

function createSession(hasGitRepository: ISettableObservable<boolean>): ISession {
	return upcastPartial<ISession>({
		sessionId: 'session',
		providerId: 'provider',
		sessionType: 'type',
		workspace: constObservable(undefined),
		hasGitRepository,
		isArchived: constObservable(false),
		isRead: constObservable(true),
		capabilities: constObservable({ supportsMultipleChats: false }),
		changesets: constObservable(undefined),
		changes: constObservable([]),
	});
}

suite('Session Context Keys', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes Git availability independently to scoped context key services', () => {
		const firstHasGit = observableValue('firstHasGit', false);
		const secondHasGit = observableValue('secondHasGit', true);
		const firstContext = new MockContextKeyService();
		const secondContext = new MockContextKeyService();
		const firstSession = createSession(firstHasGit);
		const secondSession = createSession(secondHasGit);

		store.add(autorun(reader => setSessionContextKeys(firstSession, firstContext, reader)));
		store.add(autorun(reader => setSessionContextKeys(secondSession, secondContext, reader)));
		firstHasGit.set(true, undefined);

		assert.deepStrictEqual({
			first: firstContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
			second: secondContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
		}, {
			first: true,
			second: true,
		});

		firstHasGit.set(false, undefined);

		assert.deepStrictEqual({
			first: firstContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
			second: secondContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
		}, {
			first: false,
			second: true,
		});
	});
});
