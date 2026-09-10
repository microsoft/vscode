/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentMergeSessionOverrides, AgentMergeSessionState } from '../../../../../platform/agentHost/common/agentMerge.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatInteractivity, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { createPullRequestMessage, CreatePullRequestChatRequest } from '../../browser/createPullRequestChatRequest.js';
import { ISessionPullRequestContext, ISessionPullRequestCreation, ISessionPullRequestOptions } from '../../common/pullRequestCreation.js';

suite('CreatePullRequestChatRequest', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options: ISessionPullRequestOptions = {
		title: 'Edited PR title',
		description: '## Summary\nPreserve "user edits".',
		draft: false,
		agentMerge: false,
	};
	const agentMergeOptions = {
		addressReviews: false, fixCI: true, resolveConflicts: false, mergePullRequest: 'ifUnchanged',
	} as const;

	function setup(config?: { state?: AgentMergeSessionState; send?: () => Promise<void>; validate?: () => Promise<void>; configError?: boolean; archived?: boolean; chatArchived?: boolean; interactivity?: ChatInteractivity; providerId?: string; missingProvider?: boolean }) {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		const requests: { session: ISession; chat: IChat; options: ISendRequestOptions }[] = [];
		const warnings: string[] = [];
		const validatedContexts: ISessionPullRequestContext[] = [];
		const creation = new class extends mock<ISessionPullRequestCreation>() {
			override async validate(context: ISessionPullRequestContext): Promise<void> {
				calls.push('validate');
				validatedContexts.push(context);
				await config?.validate?.();
			}
		}();
		let state = config?.state;
		const chat = upcastPartial<IChat>({
			resource: URI.parse('agent-host-copilotcli:/original-session'),
			isArchived: constObservable(config?.chatArchived ?? false),
			interactivity: constObservable(config?.interactivity ?? ChatInteractivity.Full),
		});
		const session = upcastPartial<ISession>({
			sessionId: 'original-session',
			providerId: 'local-agent-host',
			mainChat: constObservable(chat),
			isArchived: constObservable(config?.archived ?? false),
		});
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = config?.providerId ?? session.providerId;
			override getAgentMergeSessionState(): AgentMergeSessionState | undefined { return state; }
			override async setAgentMergeOverrides(sessionId: string, overrides: AgentMergeSessionOverrides | undefined): Promise<void> {
				calls.push(`overrides:${sessionId}`);
				if (config?.configError) {
					throw new Error('Host disconnected');
				}
				state = { enabled: state?.enabled ?? false, overrides };
			}
			override async setAgentMergeEnabled(sessionId: string, enabled: boolean): Promise<void> {
				calls.push(`enabled:${sessionId}:${enabled}`);
				if (config?.configError) {
					throw new Error('Host disconnected');
				}
				state = { ...state, enabled };
			}
		}();
		instantiationService.stub(ISessionsProvidersService, {}, 'getProvider', () => config?.missingProvider ? undefined : provider);
		instantiationService.stub(ISessionsManagementService, {
			sendRequest: async (session, chat, options) => {
				calls.push('send');
				requests.push({ session, chat, options });
				await config?.send?.();
				calls.push('sent');
			},
		});
		instantiationService.stub(INotificationService, { warn: (message: string) => warnings.push(message) });
		return { request: instantiationService.createInstance(CreatePullRequestChatRequest), creation, validatedContexts, session, chat, calls, requests, warnings, state: () => state };
	}

	test('manual prompt includes exact user details without automation instructions', () => {
		assert.strictEqual(createPullRequestMessage(options), [
			'Create a pull request ready for review for this session\'s changes.',
			'Commit any uncommitted changes and push the source branch as needed.',
			`Use the following title and description exactly (provided as JSON):\n${JSON.stringify({ title: options.title, description: options.description }, undefined, 2)}`,
			'Do not merge the pull request or enable GitHub auto-merge.',
		].join('\n\n'));
	});

	const expectedContext: ISessionPullRequestContext = {
		workingDirectory: 'file:///repo', repository: 'microsoft/vscode', branchName: 'feature/test', baseBranchName: 'main',
	};

	test('validates prepared identity before sending and carries the branch constraints in the message', async () => {
		const fixture = setup();
		await fixture.request.send(fixture.session, { ...options, expectedContext }, fixture.creation);
		assert.deepStrictEqual({
			calls: fixture.calls,
			validated: fixture.validatedContexts,
			contextInMessage: fixture.requests[0].options.query.includes('repository microsoft/vscode, current branch feature/test, and base branch main'),
			stopsOnChanges: fixture.requests[0].options.query.includes('stop and ask me to review it before committing'),
		}, { calls: ['validate', 'send', 'sent'], validated: [expectedContext], contextInMessage: true, stopsOnChanges: true });
	});

	test('stale preparation prevents both sending and changing Agent Merge settings', async () => {
		const state = { enabled: false };
		const fixture = setup({ state, validate: async () => { throw new Error('Reopen Create PR'); } });
		await assert.rejects(() => fixture.request.send(fixture.session, { ...options, expectedContext, agentMerge: true, agentMergeOptions }, fixture.creation), /Reopen Create PR/);
		assert.deepStrictEqual({ calls: fixture.calls, requests: fixture.requests, state: fixture.state() }, { calls: ['validate'], requests: [], state });
	});

	test('the chat message creates a source branch when preparation was on the base branch', () => {
		const message = createPullRequestMessage({ ...options, expectedContext: { ...expectedContext, branchName: 'main' } });
		assert.ok(message.includes('Create and switch to a new source branch before committing changes.'));
	});

	test('draft and Agent Merge choices never add Agent Merge instructions to the message', () => {
		const draft = { ...options, draft: true };
		const message = createPullRequestMessage({ ...draft, agentMerge: true, agentMergeOptions });
		assert.deepStrictEqual({
			draft: message.startsWith('Create a draft pull request for this session\'s changes. Keep it in draft.'),
			sameAsManual: message === createPullRequestMessage(draft),
			mentionsAgentMerge: /agent.?merge|addressReviews|fixCI|resolveConflicts|ifUnchanged/i.test(message),
		}, { draft: true, sameAsManual: true, mentionsAgentMerge: false });
	});

	for (const [autoMergeMethod, description] of [['MERGE', 'a merge commit'], ['SQUASH', 'squash merging'], ['REBASE', 'rebase merging']] as const) {
		test(`prompt includes the ${autoMergeMethod} auto-merge strategy`, () => {
			const message = createPullRequestMessage({ ...options, autoMergeMethod });
			assert.ok(message.includes(`Enable GitHub auto-merge using ${description}, so the pull request merges when required checks and approvals pass. Do not bypass these requirements.`));
		});
	}

	test('sends to the originating main chat and only then enables selected session options', async () => {
		const completion = new DeferredPromise<void>();
		const fixture = setup({ state: { enabled: false, overrides: { fixCI: false } }, send: () => completion.p });
		const invocation = fixture.request.send(fixture.session, { ...options, agentMerge: true, agentMergeOptions }, fixture.creation);
		const beforeSent = [...fixture.calls];
		await completion.complete();
		await invocation;
		assert.deepStrictEqual({
			beforeSent, calls: fixture.calls, state: fixture.state(), warnings: fixture.warnings, requests: fixture.requests,
		}, {
			beforeSent: ['send'],
			calls: ['send', 'sent', 'overrides:original-session', 'enabled:original-session:true'],
			state: { enabled: true, overrides: agentMergeOptions },
			warnings: [],
			requests: [{ session: fixture.session, chat: fixture.chat, options: { query: createPullRequestMessage(options) } }],
		});
	});

	for (const autoMergeMethod of [undefined, 'SQUASH'] as const) {
		test(`disables previously enabled Agent Merge for ${autoMergeMethod ? 'auto' : 'manual'} merging`, async () => {
			const fixture = setup({ state: { enabled: true, overrides: agentMergeOptions } });
			await fixture.request.send(fixture.session, { ...options, autoMergeMethod }, fixture.creation);
			assert.deepStrictEqual({ calls: fixture.calls, state: fixture.state() }, {
				calls: ['send', 'sent', 'enabled:original-session:false'],
				state: { enabled: false, overrides: agentMergeOptions },
			});
		});
	}

	test('send failure leaves Agent Merge settings untouched', async () => {
		const initial = { enabled: false, overrides: { fixCI: false } };
		const fixture = setup({ state: initial, send: async () => { throw new Error('Request rejected'); } });
		await assert.rejects(() => fixture.request.send(fixture.session, { ...options, agentMerge: true, agentMergeOptions }, fixture.creation), /Request rejected/);
		assert.deepStrictEqual({ calls: fixture.calls, state: fixture.state(), warnings: fixture.warnings }, {
			calls: ['send'], state: initial, warnings: [],
		});
	});

	test('preserves existing session overrides when the form does not supply them', async () => {
		const fixture = setup({ state: { enabled: false, overrides: agentMergeOptions } });
		await fixture.request.send(fixture.session, { ...options, agentMerge: true }, fixture.creation);
		assert.deepStrictEqual({ calls: fixture.calls, state: fixture.state() }, {
			calls: ['send', 'sent', 'enabled:original-session:true'],
			state: { enabled: true, overrides: agentMergeOptions },
		});
	});

	test('reports configuration failure after sending without inviting duplicate submission', async () => {
		const fixture = setup({ configError: true });
		await fixture.request.send(fixture.session, { ...options, agentMerge: true }, fixture.creation);
		assert.deepStrictEqual({ calls: fixture.calls, warnings: fixture.warnings }, {
			calls: ['send', 'sent', 'enabled:original-session:true'],
			warnings: ['The Create PR message was sent, but the session\'s Agent Merge settings could not be updated: Host disconnected'],
		});
	});

	for (const config of [
		{ archived: true },
		{ chatArchived: true },
		{ interactivity: ChatInteractivity.ReadOnly },
		{ interactivity: ChatInteractivity.Hidden },
		{ providerId: 'default-copilot' },
		{ missingProvider: true },
	]) {
		test(`does not send or change session settings when unavailable: ${JSON.stringify(config)}`, async () => {
			const fixture = setup(config);
			await assert.rejects(() => fixture.request.send(fixture.session, options, fixture.creation), /read-only chat|provider is unavailable/);
			assert.deepStrictEqual(fixture.calls, []);
		});
	}
});
