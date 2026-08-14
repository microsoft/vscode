/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../../blockedSessions/browser/blockedSessions.js';
import { IBlockedSessionsCIFixModel } from '../../browser/blockedSessionsCIFixModel.js';
import { OmniCIFailureProvider } from '../../browser/omniCIFailureContribution.js';
import { ISessionCIFixState } from '../../browser/views/sessionsList.js';

suite('OmniCIFailureProvider', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createProvider(enabled = true): {
		provider: OmniCIFailureProvider;
		blockedSessions: TestBlockedSessions;
		ciFixModel: TestCIFixModel;
	} {
		const blockedSessions = new TestBlockedSessions();
		const ciFixModel = new TestCIFixModel();
		const provider = store.add(new OmniCIFailureProvider(
			blockedSessions as unknown as BlockedSessions,
			ciFixModel as unknown as IBlockedSessionsCIFixModel,
			enabled,
		));
		return { provider, blockedSessions, ciFixModel };
	}

	function snapshot(provider: OmniCIFailureProvider) {
		return provider.failures.get().map(failure => ({
			resource: failure.sessionResource.toString(),
			occurrenceId: failure.occurrenceId,
			label: failure.label,
			failed: failure.failed,
			pending: failure.pending,
			updatedAt: failure.updatedAt,
		}));
	}

	test('publishes only actionable failing CI sessions', () => {
		const { provider, blockedSessions, ciFixModel } = createProvider();
		const failing = new TestSession('failing', 'Failing CI', 2000);
		const needsInput = new TestSession('input', 'Needs Input', 3000);
		const alreadyFixed = new TestSession('fixed', 'Already Fixed', 1000);
		blockedSessions.setBlocked([
			blocked(needsInput, BlockedSessionReason.NeedsInput, 'needsInput'),
			blocked(failing, BlockedSessionReason.FailingCI, 'failingCI:sha1'),
			blocked(alreadyFixed, BlockedSessionReason.FailingCI, 'failingCI:sha2'),
		]);
		ciFixModel.setState(failing, { failed: 2, pending: 1 });
		ciFixModel.setState(alreadyFixed, undefined);

		assert.deepStrictEqual(snapshot(provider), [{
			resource: 'test-session:/failing',
			occurrenceId: 'failingCI:sha1',
			label: 'Failing CI',
			failed: 2,
			pending: 1,
			updatedAt: 2000,
		}]);
	});

	test('updates counts and hides fixes in flight', () => {
		const { provider, blockedSessions, ciFixModel } = createProvider();
		const session = new TestSession('session', 'Session', 1000);
		blockedSessions.setBlocked([blocked(session, BlockedSessionReason.FailingCI, 'failingCI:sha1')]);
		ciFixModel.setState(session, { failed: 1, pending: 2 });
		assert.deepStrictEqual(snapshot(provider).map(({ failed, pending }) => ({ failed, pending })), [{ failed: 1, pending: 2 }]);

		ciFixModel.setState(session, { failed: 3, pending: 0 });
		assert.deepStrictEqual(snapshot(provider).map(({ failed, pending }) => ({ failed, pending })), [{ failed: 3, pending: 0 }]);

		ciFixModel.setHidden(['session']);
		assert.deepStrictEqual(snapshot(provider), []);
	});

	test('dispatches a fix once to the current failing session and respects gating', () => {
		const { provider, blockedSessions, ciFixModel } = createProvider();
		const session = new TestSession('session', 'Session', 1000);
		blockedSessions.setBlocked([blocked(session, BlockedSessionReason.FailingCI, 'failingCI:sha1')]);
		ciFixModel.setState(session, { failed: 1, pending: 0 });

		provider.fixCI(session.resource);
		provider.fixCI(URI.parse('test-session:/missing'));

		const disabled = createProvider(false);
		disabled.blockedSessions.setBlocked([blocked(session, BlockedSessionReason.FailingCI, 'failingCI:sha1')]);
		disabled.ciFixModel.setState(session, { failed: 1, pending: 0 });
		assert.deepStrictEqual({
			fixed: ciFixModel.fixedSessionIds,
			disabledFailures: snapshot(disabled.provider),
		}, {
			fixed: ['session'],
			disabledFailures: [],
		});
	});
});

function blocked(session: TestSession, reason: BlockedSessionReason, occurrenceId: string): IBlockedSession {
	return { session: session as unknown as ISession, reason, occurrenceId };
}

class TestSession {
	readonly resource: URI;
	readonly title: IObservable<string>;
	readonly updatedAt: IObservable<Date>;

	constructor(
		readonly sessionId: string,
		title: string,
		updatedAt: number,
	) {
		this.resource = URI.parse(`test-session:/${sessionId}`);
		this.title = observableValue(`test.title.${sessionId}`, title);
		this.updatedAt = observableValue(`test.updatedAt.${sessionId}`, new Date(updatedAt));
	}
}

class TestBlockedSessions {
	private readonly _blocked = observableValue<readonly IBlockedSession[]>('test.blocked', []);
	readonly blockedSessionsWithReasons: IObservable<readonly IBlockedSession[]> = this._blocked;

	setBlocked(blocked: readonly IBlockedSession[]): void {
		this._blocked.set(blocked, undefined);
	}
}

class TestCIFixModel {
	private readonly _hidden = observableValue<ReadonlySet<string>>('test.hidden', new Set());
	readonly hiddenSessions: IObservable<ReadonlySet<string>> = this._hidden;
	private readonly _states = new Map<ISession, ISettableObservable<ISessionCIFixState | undefined>>();
	readonly fixedSessionIds: string[] = [];

	getCIFix(session: ISession): IObservable<ISessionCIFixState | undefined> {
		return this._stateFor(session);
	}

	private _stateFor(session: ISession): ISettableObservable<ISessionCIFixState | undefined> {
		let state = this._states.get(session);
		if (!state) {
			state = observableValue(`test.ci.${session.sessionId}`, undefined);
			this._states.set(session, state);
		}
		return state;
	}

	setState(session: TestSession, state: ISessionCIFixState | undefined): void {
		this._stateFor(session as unknown as ISession).set(state, undefined);
	}

	setHidden(sessionIds: readonly string[]): void {
		this._hidden.set(new Set(sessionIds), undefined);
	}

	fixCI(session: ISession): void {
		this.fixedSessionIds.push(session.sessionId);
	}
}
