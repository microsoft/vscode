/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
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
	function create(options?: { readOnly?: boolean; synchronous?: boolean; ignoresWrites?: boolean; deferred?: boolean; initial?: string }) {
		const values = new Map<string, Record<string, unknown>>();
		const resolved = new Set<string>();
		const writes: string[] = [];
		const pending: (() => void)[] = [];
		const rejects: (() => void)[] = [];
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID,
			getCreateSessionConfig: sessionId => values.get(sessionId),
			getSessionConfig: sessionId => resolved.has(sessionId) ? {
				schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], default: 'folder', readOnly: options?.readOnly } } },
				values: values.get(sessionId) ?? {},
			} : undefined,
			setSessionConfigValue: async (sessionId, _chat, property, value) => {
				writes.push(`${sessionId}=${value}`);
				const apply = () => values.set(sessionId, { ...values.get(sessionId), [property]: value });
				if (options?.ignoresWrites) {
					// An agent that keeps its isolation: its configuration resolves again, unchanged, and it tells of it
					onDidChangeSessionConfig();
					return;
				}
				if (options?.deferred) {
					// A write the agent does not take, as one it cancels, which is not reported as an unexpected error
					return new Promise<void>((_resolve, reject) => rejects.push(() => reject(new CancellationError())));
				}
				if (options?.synchronous) {
					// As the agent host's provider does: its cache changes and it tells at once, which applies the default
					apply();
					onDidChangeSessionConfig();
				} else {
					pending.push(apply);
				}
			},
			trackSessionConfigOperation: () => { },
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: <T extends ISessionsProvider>() => provider as unknown as T }));
		const session = observableValue<ISession | undefined>('session', undefined);
		const enabled = observableValue('enabled', true);
		const choice = instantiationService.createInstance(NewWorktreeChoice, session, enabled);
		// As the composer does on each change of its draft's configuration
		const onDidChangeSessionConfig = () => choice.applyDefault();
		const draft = (sessionId: string) => {
			values.set(sessionId, { isolation: options?.initial ?? 'worktree' });
			return upcastPartial<ISession>({
				sessionId,
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				status: constObservable(SessionStatus.Untitled),
				mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse(`test:/${sessionId}`) })),
			});
		};
		return {
			choice,
			enabled,
			/** A composer that shows the same drafts again, such as as its editor moves to another group. */
			another: () => instantiationService.createInstance(NewWorktreeChoice, session, enabled),
			show: (sessionId: string) => {
				const shown = draft(sessionId);
				session.set(shown, undefined);
				return shown;
			},
			/** Shows a draft again, such as one the composer adopts again. */
			showAgain: (shown: ISession) => session.set(shown, undefined),
			resolve: (sessionId: string) => resolved.add(sessionId),
			applyWrites: () => pending.splice(0).forEach(apply => apply()),
			writes,
			rejects,
			remember: (sessionId: string, isolation: string) => values.set(sessionId, { isolation }),
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

	test('the user\'s New Worktree stays where its agent takes it, and tells of the change, at once', () => {
		const { choice, show, resolve, writes, state } = create({ synchronous: true });
		show('a');
		resolve('a');
		choice.applyDefault();
		choice.setSelected(true);

		assert.deepStrictEqual({ state: state(), writes }, { state: { available: true, selected: true }, writes: ['a=folder', 'a=worktree'] });
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

	test('sets a draft to its folder by default once: where its agent keeps a new worktree and tells of it again, it writes no more, and shows the new worktree', async () => {
		const { choice, show, resolve, writes, state } = create({ ignoresWrites: true });
		show('a');
		resolve('a');
		choice.applyDefault();
		choice.applyDefault();
		await timeout(0);

		assert.deepStrictEqual({ state: state(), writes }, { state: { available: true, selected: true }, writes: ['a=folder'] });
	});

	test('tells of what the draft shows as its agent keeps a new worktree after the last change of its configuration, as its write settles', async () => {
		const { choice, show, resolve, state } = create({ ignoresWrites: true });
		const shown: boolean[] = [];
		store.add(choice.onDidChange(() => shown.push(state().selected)));
		show('a');
		resolve('a');
		// The agent tells of its configuration, unchanged, before its write settles: the draft shows as in its folder until then
		choice.applyDefault();
		const before = state().selected;
		await timeout(0);

		assert.deepStrictEqual({ before, shown, after: state().selected }, { before: false, shown: [true], after: true });
	});

	test('undoes only the user\'s latest choice as its agent rejects it', async () => {
		const { choice, show, resolve, writes, rejects, remember } = create({ deferred: true, initial: 'folder' });
		show('a');
		resolve('a');
		// New Worktree, then the folder and New Worktree again before the agent answers: the user's latest choice stands
		// as the agent rejects the first
		choice.setSelected(true);
		choice.setSelected(false);
		choice.setSelected(true);
		rejects.shift()!();
		await timeout(0);
		remember('a', 'worktree');
		choice.applyDefault();
		const afterStaleRejection = [...writes];

		// A draft whose latest choice is rejected is as before: it works in its folder by default
		show('b');
		resolve('b');
		choice.setSelected(true);
		rejects.pop()!();
		await timeout(0);
		remember('b', 'worktree');
		choice.applyDefault();

		assert.deepStrictEqual({ afterStaleRejection, writes }, {
			afterStaleRejection: ['a=worktree', 'a=folder', 'a=worktree'],
			writes: ['a=worktree', 'a=folder', 'a=worktree', 'b=worktree', 'b=folder'],
		});
	});

	test('keeps what it knows of each draft only as long as the draft: a new draft defaults, also under a known ID, a stale rejection leaves the current draft, and a draft shown again keeps its choice', async () => {
		const { choice, show, showAgain, resolve, writes, rejects, remember } = create({ deferred: true, initial: 'folder' });
		resolve('a');
		resolve('b');
		// The user chooses New Worktree for a draft, which the composer then leaves for another before the agent answers
		const first = show('a');
		choice.setSelected(true);
		const second = show('b');
		choice.setSelected(true);
		rejects.shift()!();
		await timeout(0);
		// The second draft's choice stands as the first's write is rejected
		remember('b', 'worktree');
		choice.applyDefault();
		const afterStaleRejection = [...writes];
		// The first draft, shown again, is as before its rejected choice: it works in its folder by default
		showAgain(first);
		remember('a', 'worktree');
		choice.applyDefault();
		// A new draft, as after a background send, defaults once again, also where it reuses the ID of one that went
		show('a');
		remember('a', 'worktree');
		choice.applyDefault();
		// The second draft, shown again, keeps its choice
		showAgain(second);
		choice.applyDefault();

		assert.deepStrictEqual({ afterStaleRejection, writes }, {
			afterStaleRejection: ['a=worktree', 'b=worktree'],
			writes: ['a=worktree', 'b=worktree', 'a=folder', 'a=folder'],
		});
	});

	test('the user\'s final choice wins where the agent has not taken the earlier ones yet', () => {
		const { choice, show, resolve, applyWrites, writes, state } = create({ initial: 'folder' });
		show('a');
		resolve('a');
		choice.setSelected(true);
		choice.setSelected(false);
		choice.setSelected(true);
		const beforeTaken = state();
		applyWrites();

		assert.deepStrictEqual({ beforeTaken, taken: state(), writes }, {
			beforeTaken: { available: true, selected: true },
			taken: { available: true, selected: true },
			writes: ['a=worktree', 'a=folder', 'a=worktree'],
		});
	});

	test('offers nothing and defaults nothing where the composer is not restricted to folders, and does as it becomes restricted', () => {
		const { choice, enabled, show, resolve, applyWrites, writes, state } = create();
		show('a');
		resolve('a');
		enabled.set(false, undefined);
		choice.applyDefault();
		const unrestricted = state();
		enabled.set(true, undefined);
		choice.applyDefault();
		applyWrites();

		assert.deepStrictEqual({ unrestricted, restricted: state(), writes }, {
			unrestricted: { available: false, selected: false },
			restricted: { available: true, selected: false },
			writes: ['a=folder'],
		});
	});

	test('a composer that shows the draft again keeps the user\'s choice, and its default, as another composer', () => {
		const { choice, another, show, resolve, applyWrites, writes } = create();
		show('a');
		resolve('a');
		choice.applyDefault();
		choice.setSelected(true);
		applyWrites();
		const other = another();
		other.applyDefault();
		applyWrites();

		assert.deepStrictEqual({ selected: other.isSelected(), writes }, { selected: true, writes: ['a=folder', 'a=worktree'] });
	});
});
