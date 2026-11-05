/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICopilotHomeService } from '../../../environment/common/copilotHome.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams, IAgent } from '../../common/agent.js';
import { copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import { authenticationAccountMeta } from '../../common/meta/agentAuthenticationAccount.js';
import { copilotAccountOperationMeta, readCopilotAccountOperation, type CopilotAccountOperation } from '../../common/meta/copilotAccountOperation.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostClientConnectionService, IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { CopilotAccountService } from '../../node/copilot/copilotAccountService.js';

type LoginStep = Awaited<ReturnType<CopilotSession['rpc']['accounts']['login']['advance']>>;
type AccountResult = Awaited<ReturnType<CopilotSession['rpc']['accounts']['get']>>;

suite('Copilot account context', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const contexts: CopilotAccountService[] = [];
	teardown(async () => {
		await Promise.all(contexts.splice(0).map(context => context.reset()));
	});

	const choices = [
		{ kind: 'loki' as const, host: 'https://m365.example', login: 'Microsoft display name', selectionId: 'opaque-m365' },
		{ kind: 'entraEmu' as const, host: 'https://github.com', login: 'different-emu-login', selectionId: 'opaque-emu' },
	];
	const both: LoginStep = { kind: 'completed', result: { status: 'needs-account-selection', accounts: choices } };

	function fixture(enabled = true) {
		const connection = store.add(new CancellationTokenSource());
		const connections = store.add(new AgentHostClientConnectionService());
		store.add(connections.registerSource({
			hasSeenClient: () => true, isClientConnected: () => !connection.token.isCancellationRequested,
			isLocalClient: () => true, usesLegacyChatUris: () => false,
			getConnectedClientTransportCounts: () => new Map([['owner', 1]]),
			requestWorkspaceTrust: async () => false, requestMcpAuthentication: async () => false,
		}));
		const published: string[] = [];
		const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const services = new ServiceCollection(
			[IAgentHostAuthenticationService, authentication],
			[ILogService, new NullLogService()],
			[IAgentHostClientConnectionService, connections],
			[ICopilotHomeService, upcastPartial<ICopilotHomeService>({ home: URI.file('/test-copilot-home') })],
			[IAgentConfigurationService, upcastPartial<IAgentConfigurationService>({
				copilotM365EnabledAtStartup: enabled,
				publishRootTransientValues: () => { published.push('published'); },
			})],
		);
		const instantiation = store.add(new InstantiationService(services, true));
		const context = store.add(instantiation.createInstance(CopilotAccountService));
		contexts.push(context);
		const state = {
			step: both, selected: '', activeSelection: undefined as string | undefined,
			disconnected: 0, deleted: 0, cancelled: 0, advances: [] as (string | undefined)[],
			activation: undefined as DeferredPromise<LoginStep> | undefined,
			accountResult: undefined as AccountResult | undefined,
			confirmation: undefined as DeferredPromise<AccountResult> | undefined,
			confirmationStarted: undefined as DeferredPromise<void> | undefined,
			cleanup: undefined as DeferredPromise<void> | undefined,
			cleanupStarted: undefined as DeferredPromise<void> | undefined,
			created: 0,
		};
		const session = new class extends mock<CopilotSession>() {
			override readonly sessionId = 'private-auth-session';
			override get rpc() {
				return upcastPartial<CopilotSession['rpc']>({
					accounts: {
						login: {
							begin: async () => ({ flowId: 'opaque-flow', step: { kind: 'awaiting' } }),
							advance: async request => {
								state.advances.push(request.input);
								if (!request.input) {
									return state.step;
								}
								state.selected = request.input;
								return state.activation?.p ?? { kind: 'completed', result: { status: 'completed' } };
							},
							cancel: async () => {
								state.cancelled++;
								state.cleanupStarted?.complete();
								await state.cleanup?.p;
							},
						},
						get: async () => {
							state.confirmationStarted?.complete();
							return state.confirmation?.p ?? state.accountResult ?? {
								kind: 'activeAccount',
								account: { ...choices.find(choice => choice.selectionId === (state.activeSelection ?? state.selected))!, active: true, derivedFrom: 'opaque-runtime-base' },
							};
						},
						set: async () => { throw new Error('Account verification must not switch accounts'); },
						enumerate: async () => ({ kind: 'accounts', items: [] }),
					},
				});
			}
			override async disconnect() { state.disconnected++; }
		}();
		const client = new class extends mock<CopilotClient>() {
			override async createSession() { state.created++; return session; }
			override async deleteSession() { state.deleted++; }
		}();
		const credential = (operation: CopilotAccountOperation, service?: 'github' | 'm365', accountId = 'entra-identity'): AuthenticateParams => {
			const audience = service === 'github' ? copilotEntraEmuAudience : copilotEntraM365Audience;
			return {
				resource: service ? copilotEntraResources.get(audience)! : copilotEntraDiscoveryResource,
				scopes: service ? [`${audience}/${service === 'github' ? 'user_impersonation' : '.default'}`] : ['User.Read'], token: 'synthetic-only',
				_meta: { ...authenticationAccountMeta({ providerId: 'microsoft', accountId }), ...copilotAccountOperationMeta(operation) },
			};
		};
		const runtime = Promise.resolve(client);
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return context.getProtectedResources(); }
			override async authenticate() { return false; }
			override async handleAuthenticationToken(params: AuthenticateParams) {
				if (readCopilotAccountOperation(params)) {
					await context.authenticate(runtime, params, connection.token);
					return true;
				}
				return context.acceptCredential(params, connection.token) || await context.authentication!.authenticate(params, connection.token);
			}
		}();
		const prepare = async () => {
			await context.authenticate(runtime, credential({ kind: 'discover' }), connection.token);
			for (const service of ['github', 'm365'] as const) {
				const params = credential({ kind: 'discover' }, service);
				await authentication.authenticate({ ...params, _meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: 'entra-identity' }) }, [provider], undefined, connection.token);
			}
		};
		const discover = async () => {
			if (context.state.get().kind !== 'ready' && context.state.get().kind !== 'choiceRequired') {
				await prepare();
			}
			await context.authenticate(runtime, credential({ kind: 'discover' }), connection.token);
		};
		const select = (service: 'github' | 'm365') => context.authenticate(runtime, credential({ kind: 'select', discoveryId: 'opaque-flow', selectionId: service === 'github' ? 'opaque-emu' : 'opaque-m365' }, service), connection.token);
		return { context, client, runtime, session, state, published, connection, credential, discover, select, authentication, provider, prepare };
	}

	test('initial discovery advertises credential preparation without running native discovery or publishing availability', async () => {
		const f = fixture();
		await f.context.authenticate(f.runtime, f.credential({ kind: 'discover' }), f.connection.token);
		await f.context.authenticate(f.runtime, f.credential({ kind: 'discover' }), f.connection.token);
		assert.deepStrictEqual({ state: f.context.state.get(), nativeSessions: f.state.created, resources: f.context.getProtectedResources().map(resource => resource.resource) }, {
			state: { kind: 'incomplete', entraAccountId: 'entra-identity' }, nativeSessions: 0,
			resources: [copilotEntraDiscoveryResource, ...copilotEntraResources.values()],
		});
	});

	test('preparing credentials never activates a service and rejects a different identity', async () => {
		const f = fixture();
		await f.prepare();
		assert.throws(() => f.context.acceptCredential(f.credential({ kind: 'discover' }, 'm365', 'another'), f.connection.token), /original account/);
		assert.deepStrictEqual({ kind: f.context.state.get().kind, nativeSessions: f.state.created, selected: f.state.selected }, {
			kind: 'incomplete', nativeSessions: 0, selected: '',
		});
	});

	for (const service of ['github', 'm365'] as const) {
		test(`waits for choice and confirms ${service} identity before readiness`, async () => {
			const f = fixture();
			await f.discover();
			assert.throws(() => f.context.requireReady(), /Choose a usable/);
			const afterDiscovery = f.context.state.get();
			await f.select(service);
			const ready = f.context.requireReady();
			assert.deepStrictEqual({
				discovery: afterDiscovery.kind, choices: afterDiscovery.kind === 'choiceRequired' && afterDiscovery.choices.map(choice => choice.service),
				selected: f.state.selected, service: ready.choice.service, identity: ready.entraAccountId,
				derivedFrom: ready.derivedFrom, display: ready.choice.displayName, published: f.published.length > 1,
			}, {
				discovery: 'choiceRequired', choices: ['m365', 'github'],
				selected: service === 'github' ? 'opaque-emu' : 'opaque-m365', service, identity: 'entra-identity',
				derivedFrom: 'opaque-runtime-base', display: service === 'github' ? 'different-emu-login' : 'Microsoft display name', published: true,
			});
		});
	}

	test('does not expose readiness while activation is pending', async () => {
		const f = fixture();
		await f.discover();
		f.state.activation = new DeferredPromise<LoginStep>();
		const selecting = f.select('m365');
		assert.strictEqual(f.context.state.get().kind, 'activating');
		f.state.activation.complete({ kind: 'completed', result: { status: 'completed' } });
		await selecting;
		assert.strictEqual(f.context.state.get().kind, 'ready');
	});

	test('rejects identity/service substitution after runtime activation', async () => {
		const f = fixture();
		await f.discover();
		f.state.activeSelection = 'opaque-emu';
		await assert.rejects(f.select('m365'), /intended Copilot account/);
		assert.deepStrictEqual(f.context.state.get(), { kind: 'error', entraAccountId: 'entra-identity', stage: 'activation' });
	});

	for (const choice of choices) {
		test(`uses best-effort automatic ${choice.kind} completion only after confirming the runtime account`, async () => {
			const f = fixture();
			f.state.step = { kind: 'completed', result: { status: 'completed', host: choice.host, login: choice.login } };
			f.state.activeSelection = choice.selectionId;
			await f.discover();
			const ready = f.context.requireReady();
			await f.discover();
			await f.select(ready.choice.service);
			assert.deepStrictEqual({
				ready,
				resources: f.context.getProtectedResources().map(resource => resource.resource),
				advances: f.state.advances,
			}, {
				ready: {
					kind: 'ready', entraAccountId: 'entra-identity', discoveryId: 'opaque-flow',
					choice: {
						service: choice.kind === 'loki' ? 'm365' : 'github',
						resource: copilotEntraResources.get(choice.kind === 'loki' ? copilotEntraM365Audience : copilotEntraEmuAudience),
						host: choice.host, selectionId: choice.selectionId, accountName: choice.login, displayName: choice.login,
					},
					derivedFrom: 'opaque-runtime-base',
				},
				resources: [copilotEntraDiscoveryResource, ready.choice.resource],
				advances: [undefined],
			});
		});
	}

	test('rejects automatic completion without a matching supported active derived account', async () => {
		const active = { ...choices[0], active: true, derivedFrom: 'opaque-runtime-base' };
		const results: AccountResult[] = [
			{ kind: 'activeAccount' },
			{ kind: 'activeAccount', account: { ...active, active: false } },
			{ kind: 'activeAccount', account: { ...active, host: 'https://other.example' } },
			{ kind: 'activeAccount', account: { ...active, login: 'other-account' } },
			{ kind: 'activeAccount', account: { ...active, selectionId: undefined } },
			{ kind: 'activeAccount', account: active, authSelectionId: 'another-selection' },
			{ kind: 'activeAccount', account: { ...active, derivedFrom: undefined } },
			{ kind: 'activeAccount', account: { ...active, kind: 'githubDotCom' } },
			{ kind: 'activeAccount', account: { ...choices[1], active: true, derivedFrom: 'opaque-runtime-base' } },
		];
		const states = [];
		for (const result of results) {
			const f = fixture();
			f.state.step = { kind: 'completed', result: { status: 'completed', host: choices[0].host, login: choices[0].login } };
			f.state.accountResult = result;
			await assert.rejects(f.discover());
			states.push(f.context.state.get());
		}
		assert.deepStrictEqual(states, results.map(() => ({ kind: 'error', entraAccountId: 'entra-identity', stage: 'discovery' })));
	});

	test('confirms the active authentication handle when the account is not a switch target', async () => {
		const f = fixture();
		f.state.step = { kind: 'completed', result: { status: 'completed', host: choices[0].host, login: choices[0].login } };
		f.state.accountResult = {
			kind: 'activeAccount', authSelectionId: choices[0].selectionId,
			account: { ...choices[0], selectionId: undefined, switchable: false, active: true, derivedFrom: 'opaque-runtime-base' },
		};
		await f.discover();
		const ready = f.context.requireReady();
		await f.context.verifySessionContext(f.session, ready);
		assert.deepStrictEqual({ kind: ready.kind, service: ready.choice.service, selectionId: ready.choice.selectionId, advances: f.state.advances }, {
			kind: 'ready', service: 'm365', selectionId: choices[0].selectionId, advances: [undefined],
		});
	});

	test('does not publish automatic readiness before confirmation or after authority withdrawal', async () => {
		const f = fixture();
		f.state.step = { kind: 'completed', result: { status: 'completed', host: choices[0].host, login: choices[0].login } };
		f.state.confirmation = new DeferredPromise<AccountResult>();
		f.state.confirmationStarted = new DeferredPromise<void>();
		const states: string[] = [];
		store.add(autorun(reader => states.push(f.context.state.read(reader).kind)));
		const discovery = f.discover();
		await f.state.confirmationStarted.p;
		assert.throws(() => f.context.requireReady());
		const rejected = assert.rejects(discovery);
		await f.context.authentication!.authenticate({ resource: copilotEntraDiscoveryResource, token: '' }, f.connection.token);
		f.state.confirmation.complete({ kind: 'activeAccount', account: { ...choices[0], active: true, derivedFrom: 'opaque-runtime-base' } });
		await rejected;
		assert.deepStrictEqual(states, ['signedOut', 'incomplete', 'discovering', 'signedOut']);
	});

	for (const step of [
		{ kind: 'error', message: 'discovery failed' },
		{ kind: 'completed', result: { status: 'needs-account-selection', accounts: [] } },
		{ kind: 'completed', result: { status: 'needs-account-selection', accounts: [choices[0], { ...choices[1], selectionId: choices[0].selectionId }] } },
		{ kind: 'completed', result: { status: 'needs-plaintext-consent' } },
		{ kind: 'completed', result: { status: 'completed' } },
		{ kind: 'open-url', url: 'https://unexpected-runtime-auth.example' },
	] satisfies LoginStep[]) {
		test(`does not interpret ${JSON.stringify(step)} as no services or ready`, async () => {
			const f = fixture();
			f.state.step = step;
			await assert.rejects(f.discover());
			assert.deepStrictEqual(f.context.state.get(), { kind: 'error', entraAccountId: 'entra-identity', stage: 'discovery' });
		});
	}

	test('waits for failed discovery cleanup before starting a retry', async () => {
		const f = fixture();
		f.state.step = { kind: 'error', message: 'discovery failed' };
		f.state.cleanup = new DeferredPromise<void>();
		f.state.cleanupStarted = new DeferredPromise<void>();
		const failed = assert.rejects(f.discover(), /discovery failed/);
		await f.state.cleanupStarted.p;
		f.state.step = both;
		const retry = f.discover();
		await timeout(0);
		const whileReleasing = { created: f.state.created, kind: f.context.state.get().kind };
		f.state.cleanup.complete();
		await Promise.all([failed, retry]);
		assert.deepStrictEqual({ whileReleasing, created: f.state.created, kind: f.context.state.get().kind }, {
			whileReleasing: { created: 1, kind: 'error' }, created: 2, kind: 'choiceRequired',
		});
	});

	test('rejects stale choices and another Microsoft identity without activating', async () => {
		const f = fixture();
		await f.discover();
		for (const params of [
			f.credential({ kind: 'select', discoveryId: 'old-flow', selectionId: 'opaque-m365' }, 'm365'),
			f.credential({ kind: 'select', discoveryId: 'opaque-flow', selectionId: 'opaque-m365' }, 'm365', 'other'),
			f.credential({ kind: 'select', discoveryId: 'opaque-flow', selectionId: 'opaque-m365' }, 'github'),
		]) {
			await assert.rejects(f.context.authenticate(f.runtime, params, f.connection.token));
		}
		assert.deepStrictEqual({ kind: f.context.state.get().kind, selected: f.state.selected }, { kind: 'choiceRequired', selected: '' });
	});

	test('withdraws readiness immediately on sign-out and rejects late activation', async () => {
		const f = fixture();
		await f.discover();
		f.state.activation = new DeferredPromise<LoginStep>();
		const selecting = f.select('m365');
		await f.context.authentication!.authenticate({ resource: copilotEntraDiscoveryResource, token: '' }, f.connection.token);
		f.state.activation.complete({ kind: 'completed', result: { status: 'completed' } });
		await assert.rejects(selecting);
		assert.deepStrictEqual(f.context.state.get(), { kind: 'signedOut' });
	});

	test('requires authentication after the owning connection disconnects', async () => {
		const f = fixture();
		await f.discover();
		await f.select('m365');
		const states: string[] = [];
		store.add(autorun(reader => states.push(f.context.state.read(reader).kind)));
		f.connection.cancel();
		await assert.rejects(f.select('m365'));
		assert.deepStrictEqual(states, ['ready', 'signedOut']);
	});

	test('leaving a choice unanswered preserves Microsoft identity and reoffers the same choices', async () => {
		const f = fixture();
		await f.discover();
		const offered = f.context.state.get();
		await f.discover();
		assert.deepStrictEqual({
			context: f.context.state.get(), selected: f.state.selected,
			resources: f.context.authentication!.getProtectedResources().map(resource => resource.resource),
			released: f.state.disconnected,
		}, { context: offered, selected: '', resources: [copilotEntraDiscoveryResource], released: 0 });
	});

	test('ordinary credential pushes cannot select an advertised service', async () => {
		const f = fixture();
		await f.discover();
		const params = f.credential({ kind: 'select', discoveryId: 'opaque-flow', selectionId: 'opaque-m365' }, 'm365');
		await assert.rejects(f.context.authentication!.authenticate({ ...params, _meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: 'entra-identity' }) }, f.connection.token));
		assert.deepStrictEqual({ kind: f.context.state.get().kind, selected: f.state.selected }, { kind: 'choiceRequired', selected: '' });
	});

	test('another authenticated window observes the existing choice without taking authority', async () => {
		const f = fixture();
		await f.discover();
		const other = store.add(new CancellationTokenSource());
		await f.context.authenticate(f.runtime, f.credential({ kind: 'discover' }), other.token);
		other.cancel();
		await f.select('m365');
		assert.strictEqual(f.context.state.get().kind, 'ready');
	});

	test('verifies a matching conversation without switching accounts and rejects a different account', async () => {
		const f = fixture();
		await f.discover();
		await f.select('m365');
		await f.context.verifySessionContext(f.session, f.context.requireReady());
		f.state.activeSelection = 'opaque-emu';
		await assert.rejects(f.context.verifySessionContext(f.session, f.context.requireReady()), /intended Copilot account/);
		assert.deepStrictEqual({ setupHidden: f.context.isAuthenticationSession(f.session.sessionId), otherHidden: f.context.isAuthenticationSession('other') }, { setupHidden: true, otherHidden: false });
	});

	test('rejects a launch captured before an account context change', async () => {
		const f = fixture();
		await f.discover();
		await f.select('m365');
		const original = f.context.requireReady();
		await f.context.reset();
		await f.discover();
		await f.select('github');
		await assert.rejects(f.context.verifySessionContext(f.session, original));
	});

	test('does not expose the setup session after its account changes', async () => {
		const f = fixture();
		await f.discover();
		await f.select('m365');
		const context = f.context.requireReady();
		assert.strictEqual(await f.context.getSession(context), f.session);
		f.state.activeSelection = 'opaque-emu';
		await assert.rejects(f.context.getSession(context), /intended Copilot account/);
	});

	test('gate-off exposes no Microsoft bridge and rejects programmatic setup', async () => {
		const f = fixture(false);
		await assert.rejects(f.discover(), /unavailable/);
		assert.deepStrictEqual({ authentication: f.context.authentication, published: f.published, advances: f.state.advances }, { authentication: undefined, published: ['published'], advances: [] });
	});

	test('sign-out during runtime startup cannot reestablish authority or discovery', async () => {
		const f = fixture();
		await f.prepare();
		const starting = new DeferredPromise<CopilotClient>();
		const discovery = f.context.authenticate(starting.p, f.credential({ kind: 'discover' }), f.connection.token);
		await f.context.authentication!.authenticate({ resource: copilotEntraDiscoveryResource, token: '' }, f.connection.token);
		starting.complete(f.client);
		await assert.rejects(discovery);
		assert.deepStrictEqual({ context: f.context.state.get(), advances: f.state.advances }, { context: { kind: 'signedOut' }, advances: [] });
	});
});
