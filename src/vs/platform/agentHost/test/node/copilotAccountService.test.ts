/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CopilotClient, CopilotSession, EntraTokenProvider } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICopilotHomeService } from '../../../environment/common/copilotHome.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams, IAgent } from '../../common/agent.js';
import { copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import { authenticationAccountMeta } from '../../common/meta/agentAuthenticationAccount.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { CopilotAccountService } from '../../node/copilot/copilotAccountService.js';

type LoginStep = Awaited<ReturnType<CopilotSession['rpc']['accounts']['login']['advance']>>;

suite('Copilot account resource authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const contexts: CopilotAccountService[] = [];
	teardown(async () => { await Promise.all(contexts.splice(0).map(context => context.reset())); });

	const choices = [
		{ kind: 'loki' as const, host: 'https://m365.example', login: 'Microsoft name', selectionId: 'opaque-m365' },
		{ kind: 'entraEmu' as const, host: 'https://github.com', login: 'emu-login', selectionId: 'opaque-emu' },
	];
	const both: LoginStep = { kind: 'completed', result: { status: 'needs-account-selection', accounts: choices } };

	function fixture(enabled = true) {
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const instantiation = store.add(new InstantiationService(new ServiceCollection(
			[IAgentHostAuthenticationService, authentication], [ILogService, new NullLogService()],
			[ICopilotHomeService, upcastPartial<ICopilotHomeService>({ home: URI.file('/test-copilot-home') })],
			[IAgentConfigurationService, upcastPartial<IAgentConfigurationService>({ copilotM365EnabledAtStartup: enabled })],
		), true));
		const context = store.add(instantiation.createInstance(CopilotAccountService));
		contexts.push(context);
		const state = {
			step: both as LoginStep, selected: '', created: 0, disconnected: 0, deleted: 0,
			discovery: undefined as DeferredPromise<LoginStep> | undefined,
			starting: undefined as DeferredPromise<CopilotSession> | undefined,
			started: new DeferredPromise<void>(),
			creating: new DeferredPromise<void>(),
		};
		const session = new class extends mock<CopilotSession>() {
			override get sessionId() { return 'setup-session'; }
			override get rpc() {
				return upcastPartial<CopilotSession['rpc']>({
					accounts: {
						login: {
							begin: async () => ({ flowId: 'opaque-flow', step: { kind: 'awaiting' } }),
							advance: async request => {
								state.started.complete();
								if (!request.input) {
									return state.discovery?.p ?? state.step;
								}
								state.selected = request.input;
								return { kind: 'completed', result: { status: 'completed' } };
							},
							cancel: async () => { },
						},
						get: async () => ({
							kind: 'activeAccount',
							account: { ...choices.find(choice => choice.selectionId === state.selected)!, active: true, derivedFrom: 'runtime-base' },
						}),
						enumerate: async () => ({ kind: 'accounts', items: [] }),
						set: async () => { throw new Error('Verification must not change the active account'); },
					},
				});
			}
			override async disconnect() { state.disconnected++; }
		}();
		const client = new class extends mock<CopilotClient>() {
			override async createSession() { state.created++; state.creating.complete(); return state.starting?.p ?? session; }
			override async deleteSession() { state.deleted++; }
		}();
		const runtime = Promise.resolve(client);
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return context.getProtectedResources(); }
			override async authenticate() { return false; }
			override validateAuthentication(params: AuthenticateParams) {
				context.authentication?.validateAuthentication(params, context.getProtectedResources().find(resource => resource.resource === params.resource));
			}
			override async handleAuthenticationToken(params: AuthenticateParams) {
				if (!await context.authentication?.authenticate(params, context.getProtectedResources().find(resource => resource.resource === params.resource))) {
					return false;
				}
				return true;
			}
			override async completeAuthentication(params: AuthenticateParams) {
				if (params.token && (params.resource === copilotEntraDiscoveryResource || context.state.get().kind === 'choiceRequired')) {
					await context.authenticate(runtime, params);
				}
			}
		}();
		const credential = (service?: 'github' | 'm365', accountId = 'entra-identity'): AuthenticateParams => {
			const audience = service === 'github' ? copilotEntraEmuAudience : copilotEntraM365Audience;
			return {
				resource: service ? copilotEntraResources.get(audience)! : copilotEntraDiscoveryResource,
				scopes: service ? [`${audience}/${service === 'github' ? 'user_impersonation' : '.default'}`] : ['User.Read'],
				token: 'synthetic-only', _meta: authenticationAccountMeta({ providerId: 'microsoft', accountId }),
			};
		};
		const authenticate = (params = credential()) => authentication.authenticate(params, [provider]);
		return { context, state, session, client, runtime, credential, authenticate };
	}

	function conversationSession(scenario: 'normal' | 'automatic' | 'duplicate' | 'wrong-host' | 'declined' | 'missing-active' | 'wrong-active-service' | 'wrong-active-handle' | 'wrong-active-login' = 'normal') {
		const calls: string[] = [];
		const offered = choices.map(choice => ({ ...choice, selectionId: `conversation-${choice.selectionId}`, login: `conversation-${choice.login}` }));
		if (scenario === 'duplicate') {
			offered.push({ ...offered[0], selectionId: 'duplicate' });
		}
		if (scenario === 'wrong-host') {
			offered[0] = { ...offered[0], host: 'https://other.example' };
		}
		let selected = offered[0];
		const session = new class extends mock<CopilotSession>() {
			override get sessionId() { return 'conversation'; }
			override get rpc() {
				return upcastPartial<CopilotSession['rpc']>({
					accounts: {
						login: {
							begin: async request => {
								calls.push(`begin:${request.kind}`);
								return {
									flowId: 'conversation-flow', step: scenario === 'automatic'
										? { kind: 'completed', result: { status: 'completed', host: selected.host, login: selected.login } }
										: { kind: 'awaiting' },
								};
							},
							advance: async request => {
								if (scenario === 'declined') {
									return { kind: 'completed', result: { status: 'declined' } };
								}
								if (!request.input) {
									return { kind: 'completed', result: { status: 'needs-account-selection', accounts: offered } };
								}
								calls.push(`select:${request.input}`);
								selected = offered.find(choice => choice.selectionId === request.input)!;
								return { kind: 'completed', result: { status: 'completed', host: selected.host, login: selected.login } };
							},
							cancel: async () => { calls.push('cancel'); },
						},
						get: async () => ({
							kind: 'activeAccount', account: scenario === 'missing-active' ? undefined : {
								...(scenario === 'wrong-active-service' ? offered[1] : selected),
								...(scenario === 'wrong-active-handle' ? { selectionId: 'other-flow-selection' } : {}),
								...(scenario === 'wrong-active-login' ? { login: 'other-flow-login' } : {}),
								active: true, derivedFrom: 'conversation-specific-lineage',
							},
						}),
						enumerate: async () => ({ kind: 'accounts', items: [] }),
						set: async () => { assert.fail('Restoration must never switch account'); },
					},
				});
			}
			override async disconnect() { calls.push('disconnect'); }
		}();
		return { session, calls };
	}

	for (const service of ['github', 'm365'] as const) {
		test(`ordinary resource authentication discovers and activates ${service} without operation metadata`, async () => {
			const f = fixture();
			const discovery = await f.authenticate();
			const offered = f.context.getProtectedResources().map(resource => resource.resource);
			const beforeChoice = f.context.state.get().kind;
			const selection = await f.authenticate(f.credential(service));
			const current = f.context.requireReady();
			assert.deepStrictEqual({ discovery, beforeChoice, offered, selection, service: current.choice.service, selected: f.state.selected }, {
				discovery: { authenticated: true }, beforeChoice: 'choiceRequired',
				offered: [copilotEntraDiscoveryResource, ...choices.map(choice => copilotEntraResources.get(choice.kind === 'loki' ? copilotEntraM365Audience : copilotEntraEmuAudience))],
				selection: { authenticated: true }, service, selected: service === 'github' ? 'opaque-emu' : 'opaque-m365',
			});
		});
	}

	test('a target is not accepted before discovery or for a different Microsoft identity', async () => {
		const f = fixture();
		await assert.rejects(f.authenticate(f.credential('m365')));
		await f.authenticate();
		await assert.rejects(f.authenticate(f.credential('m365', 'another-account')));
		assert.deepStrictEqual({ kind: f.context.state.get().kind, selected: f.state.selected }, { kind: 'choiceRequired', selected: '' });
	});

	test('selection honors the runtime-advertised scopes rather than a fixed service scope', async () => {
		const f = fixture();
		await f.authenticate();
		const scopes = [`${copilotEntraEmuAudience}/.default`];
		await f.context.authenticationOptions!.tokenProvider!({
			kind: 'token', clientId: copilotEntraClientId, accountId: 'entra-identity', reason: 'renewal',
			audience: copilotEntraEmuAudience, scopes, skipCachedAccessToken: false,
		}, CancellationToken.None as Parameters<EntraTokenProvider>[1]);
		const offered = f.context.getProtectedResources().find(resource => resource.resource === f.credential('github').resource)?.scopes_supported;
		const result = await f.authenticate({ ...f.credential('github'), scopes });
		assert.deepStrictEqual({ offered, result, service: f.context.requireReady().choice.service }, {
			offered: scopes, result: { authenticated: true }, service: 'github',
		});
	});

	test('discovery acquires a challenged credential through normal authentication before completing', async () => {
		const f = fixture();
		f.state.discovery = new DeferredPromise<LoginStep>();
		const discovering = f.authenticate();
		await f.state.started.p;
		const credential = f.credential('m365');
		const token = f.context.authenticationOptions!.tokenProvider!({
			kind: 'token', clientId: copilotEntraClientId, accountId: 'entra-identity', reason: 'renewal',
			audience: copilotEntraM365Audience, scopes: [...credential.scopes!], skipCachedAccessToken: false,
		}, CancellationToken.None as Parameters<EntraTokenProvider>[1]);
		const accepted = await f.authenticate(credential);
		const acquired = await token;
		f.state.discovery.complete(both);
		assert.deepStrictEqual({ accepted, token: acquired, discovery: await discovering, kind: f.context.state.get().kind, selected: f.state.selected }, {
			accepted: { authenticated: true }, token: { kind: 'token', accountId: 'entra-identity', accessToken: 'synthetic-only' },
			discovery: { authenticated: true }, kind: 'choiceRequired', selected: '',
		});
	});

	test('a ready conversation returns a credential challenge without waiting and retries after delivery', async () => {
		const f = fixture();
		await f.authenticate();
		await f.authenticate(f.credential('github'));
		const context = f.context.requireReady();
		const credential = f.credential('m365');
		const request: Parameters<EntraTokenProvider>[0] = {
			kind: 'token', clientId: copilotEntraClientId, accountId: 'entra-identity', reason: 'renewal',
			audience: copilotEntraM365Audience, scopes: [...credential.scopes!], skipCachedAccessToken: false,
		};
		const challenged = await f.context.authenticationOptions!.tokenProvider!(request, CancellationToken.None as Parameters<EntraTokenProvider>[1]);
		const accepted = await f.authenticate(credential);
		const retried = await f.context.authenticationOptions!.tokenProvider!(request, CancellationToken.None as Parameters<EntraTokenProvider>[1]);
		assert.deepStrictEqual({ challenged, accepted, retried, selectionUnchanged: f.context.state.get() === context }, {
			challenged: { kind: 'unavailable' }, accepted: { authenticated: true },
			retried: { kind: 'token', accountId: 'entra-identity', accessToken: 'synthetic-only' }, selectionUnchanged: true,
		});
	});

	test('credential waiting honors SDK cancellation without a second client operation', async () => {
		const f = fixture();
		f.state.discovery = new DeferredPromise<LoginStep>();
		const discovering = f.authenticate();
		await f.state.started.p;
		const cancellation = store.add(new CancellationTokenSource());
		const token = f.context.authenticationOptions!.tokenProvider!({
			kind: 'token', clientId: copilotEntraClientId, accountId: 'entra-identity', reason: 'renewal',
			audience: copilotEntraM365Audience, scopes: [`${copilotEntraM365Audience}/.default`], skipCachedAccessToken: false,
		}, cancellation.token as Parameters<EntraTokenProvider>[1]);
		cancellation.cancel();
		f.state.discovery.complete(both);
		await discovering;
		assert.deepStrictEqual(await token, { kind: 'cancelled' });
	});

	test('a confirmed automatic service remains usable without claiming complete discovery', async () => {
		const f = fixture();
		f.state.selected = 'opaque-m365';
		f.state.step = { kind: 'completed', result: { status: 'completed', host: choices[0].host, login: choices[0].login } };
		const result = await f.authenticate();
		assert.deepStrictEqual({ result, kind: f.context.state.get().kind, service: f.context.requireReady().choice.service }, {
			result: { authenticated: true }, kind: 'ready', service: 'm365',
		});
	});

	test('runtime replacement restores the selected service without another client authentication', async () => {
		const f = fixture();
		await f.authenticate();
		await f.authenticate(f.credential('m365'));
		const selected = f.context.requireReady();
		await f.context.releaseSession();
		await Promise.all([f.context.getSession(selected, f.runtime), f.context.getSession(selected, f.runtime)]);
		assert.deepStrictEqual({ contextUnchanged: f.context.requireReady() === selected, created: f.state.created, released: f.state.deleted }, {
			contextUnchanged: true, created: 2, released: 1,
		});
	});

	test('a failed runtime restoration can be retried unless the runtime disowns the selected service', async () => {
		const f = fixture();
		await f.authenticate();
		await f.authenticate(f.credential('m365'));
		const selected = f.context.requireReady();
		await f.context.releaseSession();
		f.state.step = { kind: 'error', message: 'offline' };
		await assert.rejects(f.context.getSession(selected, f.runtime), /offline/);
		const afterTransientFailure = f.context.state.get() === selected;
		f.state.selected = 'opaque-emu';
		f.state.step = { kind: 'completed', result: { status: 'completed', host: choices[1].host, login: choices[1].login } };
		await assert.rejects(f.context.getSession(selected, f.runtime), /no longer available/);
		assert.deepStrictEqual({ afterTransientFailure, state: f.context.state.get(), released: f.state.deleted }, {
			afterTransientFailure: true, state: { kind: 'error', entraAccountId: 'entra-identity', stage: 'discovery' }, released: 3,
		});
	});

	test('a new conversation authenticates the selected service using its own offered handle', async () => {
		const f = fixture();
		await f.authenticate();
		await f.authenticate(f.credential('m365'));
		const conversation = conversationSession();
		await f.context.authenticateSession(conversation.session, f.client, f.context.requireReady(), CancellationToken.None);
		assert.deepStrictEqual(conversation.calls, ['begin:entra', 'select:conversation-opaque-m365', 'cancel']);
	});

	test('signing in a new conversation restores the setup session and keeps the ready context', async () => {
		const f = fixture();
		await f.authenticate();
		await f.authenticate(f.credential('m365'));
		const context = f.context.requireReady();
		await f.context.releaseSession();
		const conversation = conversationSession();
		await f.context.authenticateSession(conversation.session, f.client, context, CancellationToken.None);
		assert.deepStrictEqual({ contextUnchanged: f.context.state.get() === context, calls: conversation.calls, created: f.state.created }, {
			contextUnchanged: true, calls: ['begin:entra', 'select:conversation-opaque-m365', 'cancel'], created: 2,
		});
	});

	test('a new conversation accepts automatic login with its own registration and completion', async () => {
		const f = fixture();
		await f.authenticate();
		await f.authenticate(f.credential('m365'));
		const conversation = conversationSession('automatic');
		await f.context.authenticateSession(conversation.session, f.client, f.context.requireReady(), CancellationToken.None);
		assert.deepStrictEqual(conversation.calls, ['begin:entra', 'cancel']);
	});

	for (const scenario of ['duplicate', 'wrong-host', 'declined', 'missing-active', 'wrong-active-service', 'wrong-active-handle', 'wrong-active-login'] as const) {
		test(`new conversation rejects ${scenario} and ends its login without changing setup`, async () => {
			const f = fixture();
			await f.authenticate();
			await f.authenticate(f.credential('m365'));
			const context = f.context.requireReady();
			const conversation = conversationSession(scenario);
			await assert.rejects(f.context.authenticateSession(conversation.session, f.client, context, CancellationToken.None));
			assert.deepStrictEqual({ loginEnded: conversation.calls.at(-1), setupUnchanged: f.context.state.get() === context }, { loginEnded: 'cancel', setupUnchanged: true });
		});
	}

	test('a conversation is not signed in to an account that is no longer selected', async () => {
		const f = fixture();
		await f.authenticate();
		await f.authenticate(f.credential('m365'));
		const stale = f.context.requireReady();
		await f.context.reset();
		await f.authenticate();
		await f.authenticate(f.credential('m365'));
		const conversation = conversationSession();
		await assert.rejects(f.context.authenticateSession(conversation.session, f.client, stale, CancellationToken.None), isCancellationError);
		assert.deepStrictEqual(conversation.calls, []);
	});

	for (const source of ['request', 'authority'] as const) {
		test(`${source} cancellation ends a pending conversation login and its late flow`, async () => {
			const f = fixture();
			await f.authenticate();
			await f.authenticate(f.credential('m365'));
			const started = new DeferredPromise<void>();
			const begin = new DeferredPromise<Awaited<ReturnType<CopilotSession['rpc']['accounts']['login']['begin']>>>();
			const cancelled = new DeferredPromise<void>();
			const cancellation = store.add(new CancellationTokenSource());
			const calls: string[] = [];
			const conversation = upcastPartial<CopilotSession>({
				sessionId: 'conversation',
				rpc: upcastPartial<CopilotSession['rpc']>({
					accounts: upcastPartial<CopilotSession['rpc']['accounts']>({
						login: {
							begin: async () => { started.complete(); return begin.p; },
							advance: async () => { assert.fail('Cancelled login cannot advance'); },
							cancel: async () => { calls.push('cancel'); cancelled.complete(); },
						},
					}),
				}),
			});
			const rejected = assert.rejects(f.context.authenticateSession(conversation, f.client, f.context.requireReady(), cancellation.token), isCancellationError);
			await started.p;
			if (source === 'request') {
				cancellation.cancel();
			} else {
				await f.context.reset();
			}
			await rejected;
			const beforeLateFlow = [...calls];
			begin.complete({ flowId: 'late', step: { kind: 'awaiting' } });
			await cancelled.p;
			assert.deepStrictEqual({ beforeLateFlow, calls }, { beforeLateFlow: [], calls: ['cancel'] });
		});
	}

	test('failed discovery exposes neither invented choices nor readiness', async () => {
		const f = fixture();
		f.state.step = { kind: 'completed', result: { status: 'needs-account-selection', accounts: [] } };
		const result = await f.authenticate();
		assert.deepStrictEqual({ result, state: f.context.state.get(), resources: f.context.getProtectedResources().map(resource => resource.resource), deleted: f.state.deleted }, {
			result: { authenticated: false }, state: { kind: 'error', entraAccountId: 'entra-identity', stage: 'discovery' },
			resources: [copilotEntraDiscoveryResource], deleted: 1,
		});
	});

	test('sign-out cancels pending discovery without publishing late choices', async () => {
		const f = fixture();
		f.state.discovery = new DeferredPromise<LoginStep>();
		const discovering = f.authenticate();
		await f.state.started.p;
		await f.authenticate({ resource: copilotEntraDiscoveryResource, token: '' });
		f.state.discovery.complete(both);
		assert.deepStrictEqual({ result: await discovering, state: f.context.state.get(), disconnected: f.state.disconnected, deleted: f.state.deleted }, {
			result: { authenticated: false }, state: { kind: 'legacy' }, disconnected: 1, deleted: 1,
		});
	});

	test('a setup session created after sign-out is still released', async () => {
		const f = fixture();
		f.state.starting = new DeferredPromise<CopilotSession>();
		const discovering = f.authenticate();
		await f.state.creating.p;
		await f.context.reset();
		f.state.starting.complete(f.session);
		await discovering;
		assert.deepStrictEqual({ state: f.context.state.get(), disconnected: f.state.disconnected, deleted: f.state.deleted }, {
			state: { kind: 'legacy' }, disconnected: 1, deleted: 1,
		});
	});

	test('the startup gate rejects Microsoft discovery', async () => {
		const f = fixture(false);
		await assert.rejects(f.context.authenticate(f.runtime, f.credential()), /unavailable/);
		assert.deepStrictEqual({ state: f.context.state.get(), created: f.state.created }, { state: { kind: 'legacy' }, created: 0 });
	});
});
