/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { NewWorktreeChoice } from '../../../browser/chat/newWorktreeChoice.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../common/sessionsProvider.js';

suite('NewWorktreeChoice', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Drafts of the local agent host, whose isolation starts as its agent remembers it, a new worktree, until their
	 * configuration resolves; the writes the choice makes apply as the agent takes them, later.
	 */
	function create(options?: { readOnly?: boolean }) {
		const values = new Map<string, Record<string, unknown>>();
		const resolved = new Set<string>();
		const writes: string[] = [];
		const pending: (() => void)[] = [];
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID,
			getCreateSessionConfig: sessionId => values.get(sessionId),
			getSessionConfig: sessionId => resolved.has(sessionId) ? {
				schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], default: 'folder', readOnly: options?.readOnly } } },
				values: values.get(sessionId) ?? {},
			} : undefined,
			setSessionConfigValue: async (sessionId, _chat, property, value) => {
				writes.push(`${sessionId}=${value}`);
				pending.push(() => values.set(sessionId, { ...values.get(sessionId), [property]: value }));
			},
			trackSessionConfigOperation: () => { },
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: <T extends ISessionsProvider>() => provider as unknown as T }));
		const session = observableValue<ISession | undefined>('session', undefined);
		const choice = instantiationService.createInstance(NewWorktreeChoice, session);
		const draft = (sessionId: string) => {
			values.set(sessionId, { isolation: 'worktree' });
			return upcastPartial<ISession>({
				sessionId,
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				status: constObservable(SessionStatus.Untitled),
				mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse(`test:/${sessionId}`) })),
			});
		};
		return {
			choice,
			show: (sessionId: string) => session.set(draft(sessionId), undefined),
			resolve: (sessionId: string) => resolved.add(sessionId),
			applyWrites: () => pending.splice(0).forEach(apply => apply()),
			writes,
			state: () => ({ available: choice.isAvailable(), selected: choice.isSelected() }),
		};
	}

	test('a draft works in its folder by default, also where its agent remembers a new worktree, and in a new worktree once the user chooses one', () => {
		const { choice, show, resolve, applyWrites, writes, state } = create();
		show('a');
		// Its configuration is not known yet: nothing to change
		choice.applyDefault();
		const unresolved = state();
		resolve('a');
		choice.applyDefault();
		applyWrites();
		const byDefault = state();
		choice.setSelected(true);
		applyWrites();
		// As its configuration changes again, the user's choice stays
		choice.applyDefault();

		assert.deepStrictEqual({ unresolved, byDefault, chosen: state(), writes }, {
			unresolved: { available: false, selected: false },
			byDefault: { available: true, selected: false },
			chosen: { available: true, selected: true },
			writes: ['a=folder', 'a=worktree'],
		});
	});

	test('picking another folder after New Worktree: the folder\'s new draft works in it, as its configuration resolves after the pick', () => {
		const { choice, show, resolve, applyWrites, writes, state } = create();
		show('a');
		resolve('a');
		// Chosen where its agent's remembered isolation is a new worktree already: nothing to write
		choice.setSelected(true);
		applyWrites();
		// The folder is picked: the picker leaves New Worktree, then the folder's draft replaces the first
		choice.setSelected(false);
		show('b');
		choice.applyDefault();
		const beforeResolved = state();
		resolve('b');
		choice.applyDefault();
		applyWrites();

		assert.deepStrictEqual({ beforeResolved, afterResolved: state(), writes }, {
			beforeResolved: { available: false, selected: false },
			afterResolved: { available: true, selected: false },
			writes: ['a=folder', 'b=folder'],
		});
	});

	test('offers nothing and writes nothing where the isolation is read-only, also from a menu that showed it before', () => {
		const { choice, show, resolve, writes, state } = create({ readOnly: true });
		show('a');
		resolve('a');
		choice.setSelected(true);
		choice.applyDefault();

		assert.deepStrictEqual({ state: state(), writes }, { state: { available: false, selected: false }, writes: [] });
	});
});
