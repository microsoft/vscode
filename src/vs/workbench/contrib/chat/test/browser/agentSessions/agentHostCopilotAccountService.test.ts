/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { AuthenticateParams } from '../../../../../../platform/agentHost/common/agent.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { copilotAccountContextKey, type CopilotAccountContext } from '../../../../../../platform/agentHost/common/copilotAccountContext.js';
import { copilotEntraAuthorizationServer, copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience, copilotEntraResources } from '../../../../../../platform/agentHost/common/copilotEntraAuthentication.js';
import { authenticationAccountMeta, readAuthenticationAccount } from '../../../../../../platform/agentHost/common/meta/agentAuthenticationAccount.js';
import { readCopilotAccountOperation } from '../../../../../../platform/agentHost/common/meta/copilotAccountOperation.js';
import type { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationService, type AuthenticationSession, type AuthenticationSessionsChangeEvent } from '../../../../../services/authentication/common/authentication.js';
import type { IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { AgentHostCopilotAccountService } from '../../../browser/agentSessions/agentHost/agentHostCopilotAccountService.js';

suite('Agent Host Copilot account setup', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const choices = [
		{ service: 'm365' as const, resource: 'https://service.example/m365', host: 'https://service.example', accountName: 'm365-coordinate', selectionId: 'selection-A', displayName: 'First service' },
		{ service: 'github' as const, resource: 'https://service.example/github', host: 'https://github.example', accountName: 'emu-login', selectionId: 'selection-B', displayName: 'Second service' },
	];
	const offered: CopilotAccountContext = { kind: 'choiceRequired', discoveryId: 'opaque-flow', entraAccountId: 'account-id', choices };
	const discoveryIntent = { kind: 'discover', context: { kind: 'signedOut' } } as const;

	function fixture(discoveryResult: CopilotAccountContext = offered) {
		const changed = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const rootChanged = store.add(new Emitter<RootState>());
		const rootFailed = store.add(new Emitter<Error>());
		const sentimentChanged = store.add(new Emitter<void>());
		const root: RootState = {
			agents: [{
				provider: 'opaque-provider', displayName: 'Provider', description: '', models: [],
				protectedResources: choices.map(choice => ({ resource: choice.resource, scopes_supported: [`${copilotEntraM365Audience}/.default`] })),
			}],
			config: { schema: { type: 'object', properties: {} }, values: { [copilotAccountContextKey]: { kind: 'signedOut' } } },
		};
		const identity: AuthenticationSession = { id: 'session-id', account: { id: 'account-id', label: 'Intended Microsoft account' }, scopes: ['User.Read'], accessToken: 'synthetic-only' };
		const requests: AuthenticateParams[] = [];
		const state = {
			pending: undefined as DeferredPromise<readonly AuthenticationSession[]> | undefined, hidden: false, disabledInWorkspace: false, rejectDiscovery: false,
			discoveryResults: [] as CopilotAccountContext[], missingScopes: [] as string[],
			delivery: undefined as DeferredPromise<boolean> | undefined,
			rootError: undefined as Error | undefined,
		};
		const setContext = (context: CopilotAccountContext | undefined) => {
			root.config!.values[copilotAccountContextKey] = context;
			rootChanged.fire(root);
		};
		const connection = upcastPartial<IAgentConnection>({
			rootState: upcastPartial<IAgentConnection['rootState']>({ get value() { return state.rootError ?? root; }, onDidChange: rootChanged.event, onDidError: rootFailed.event }),
			authenticate: async params => {
				requests.push(params);
				const operation = readCopilotAccountOperation(params);
				if (!params.token) {
					setContext({ kind: 'signedOut' });
				} else if (operation?.kind === 'discover') {
					if (state.rejectDiscovery) {
						return { authenticated: false };
					}
					setContext(state.discoveryResults.shift() ?? discoveryResult);
				} else if (operation?.kind === 'select') {
					setContext({ kind: 'ready', entraAccountId: identity.account.id, discoveryId: operation.discoveryId, choice: choices.find(choice => choice.selectionId === operation.selectionId)!, derivedFrom: 'opaque-runtime-base' });
				} else if (operation?.kind === 'useLegacy') {
					const accepted = state.delivery ? await state.delivery.p : true;
					if (accepted) {
						setContext({ kind: 'legacy' });
					}
					return { authenticated: accepted };
				} else if (state.delivery) {
					return { authenticated: await state.delivery.p };
				}
				return { authenticated: true };
			},
		});
		const authentication = upcastPartial<IAuthenticationService>({
			onDidChangeSessions: changed.event,
			getSessions: async (_provider, scopes) => Array.isArray(scopes) && scopes.some(scope => state.missingScopes.includes(scope)) ? [] : scopes && state.pending ? state.pending.p : [{ ...identity, scopes: Array.isArray(scopes) ? scopes : identity.scopes }],
			createSession: async () => { assert.fail('Setup credential preparation must remain silent'); },
		});
		const entitlement = upcastPartial<IChatEntitlementService>({ onDidChangeSentiment: sentimentChanged.event, get sentiment(): IChatSentiment { return { hidden: state.hidden, disabledInWorkspace: state.disabledInWorkspace }; } });
		const service = store.add(new AgentHostCopilotAccountService(authentication, entitlement, new TestConfigurationService(), new NullLogService()));
		return { service, connection, requests, identity, setContext, changed, state, rootFailed, sentimentChanged, root };
	}

	test('explicit GitHub handoff uses the existing credential request and retires its Microsoft binding after acceptance', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		const credential: AuthenticateParams = {
			resource: 'https://api.github.example', token: 'github-only', scopes: ['read:user', 'user:email'], expiresIn: 60,
			_meta: authenticationAccountMeta({ providerId: 'github', accountId: 'github-account' }),
		};
		await f.service.selectLegacy(f.connection, credential);
		f.changed.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], changed: [], removed: [f.identity] } });
		assert.deepStrictEqual({ last: f.requests.at(-1), tokens: f.requests.map(request => request.token) }, {
			last: { ...credential, _meta: { ...credential._meta, 'vscode.copilot.accountOperation': { kind: 'useLegacy', context: offered } } },
			tokens: ['synthetic-only', 'github-only'],
		});
	});

	test('a rejected direct handoff does not complete setup or lose existing Microsoft sign-out authority', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		f.state.delivery = new DeferredPromise<boolean>();
		f.state.delivery.complete(false);
		await assert.rejects(f.service.selectLegacy(f.connection, {
			resource: 'https://api.github.example', token: 'rejected-github',
			_meta: authenticationAccountMeta({ providerId: 'github', accountId: 'github-account' }),
		}), /did not accept/);
		await f.service.signOut(f.connection);
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only', 'rejected-github', '']);
	});

	test('an accepted direct reply cannot complete against replacement or failed root state', async () => {
		for (const disconnected of [false, true]) {
			const f = fixture();
			f.connection.authenticate = async () => {
				if (disconnected) {
					f.rootFailed.fire(new Error('Disconnected'));
					f.state.rootError = new Error('Disconnected');
				} else {
					f.setContext({ kind: 'incomplete', entraAccountId: 'other-account' });
				}
				return { authenticated: true };
			};
			await assert.rejects(f.service.selectLegacy(f.connection, {
				resource: 'https://api.github.example', token: 'github',
				_meta: authenticationAccountMeta({ providerId: 'github', accountId: 'github-account' }),
			}));
		}
	});

	test('separates Microsoft session id, identity, runtime choice and service', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		const ready = await f.service.select(f.connection, 'opaque-flow', 'selection-A');
		assert.deepStrictEqual({
			operations: f.requests.map(readCopilotAccountOperation), identities: f.requests.map(request => readAuthenticationAccount(request)?.accountId),
			resources: f.requests.map(request => request.resource), ready,
		}, {
			operations: [discoveryIntent, undefined, { kind: 'select', discoveryId: 'opaque-flow', selectionId: 'selection-A' }],
			identities: ['account-id', 'account-id', 'account-id'],
			resources: [copilotEntraDiscoveryResource, choices[0].resource, choices[0].resource],
			ready: { kind: 'ready', entraAccountId: 'account-id', discoveryId: 'opaque-flow', choice: choices[0], derivedFrom: 'opaque-runtime-base' },
		});
	});

	test('discovery alone never authenticates both offered targets', async () => {
		const f = fixture();
		const state = await f.service.discover(f.connection, f.identity.id);
		assert.deepStrictEqual({ kind: state.kind, resources: f.requests.map(request => request.resource) }, {
			kind: 'choiceRequired', resources: [copilotEntraDiscoveryResource],
		});
	});

	function preparingFixture() {
		const incomplete: CopilotAccountContext = { kind: 'incomplete', entraAccountId: 'account-id' };
		const f = fixture(offered);
		f.state.discoveryResults.push(incomplete);
		f.root.agents[0].protectedResources = [...copilotEntraResources].map(([audience, resource]) => ({
			resource, authorization_servers: [copilotEntraAuthorizationServer],
			scopes_supported: [`${audience}/${audience === copilotEntraEmuAudience ? 'user_impersonation' : '.default'}`],
		}));
		return f;
	}

	test('forwards millisecond credential lifetimes as seconds throughout discovery and selection', async () => {
		const results: (number | undefined)[][] = [];
		for (const expiresAfter of [undefined, 1, 1501, 60_000]) {
			const f = preparingFixture();
			f.identity.expiresAfter = expiresAfter;
			await f.service.discover(f.connection, f.identity.id);
			f.root.agents[0].protectedResources = choices.map(choice => ({ resource: choice.resource, scopes_supported: [`${copilotEntraM365Audience}/.default`] }));
			await f.service.select(f.connection, 'opaque-flow', 'selection-A');
			results.push(f.requests.map(request => request.expiresIn));
		}
		assert.deepStrictEqual(results, [
			[undefined, undefined, undefined, undefined, undefined, undefined],
			[1, 1, 1, 1, 1, 1],
			[2, 2, 2, 2, 2, 2],
			[60, 60, 60, 60, 60, 60],
		]);
	});

	test('waits for accepted same-account delivery before one discovery retry and skips an optional EMU miss silently', async () => {
		const f = preparingFixture();
		f.state.missingScopes.push(`${copilotEntraEmuAudience}/user_impersonation`);
		f.state.delivery = new DeferredPromise<boolean>();
		const started = new DeferredPromise<void>();
		const authenticate = f.connection.authenticate;
		f.connection.authenticate = async params => {
			if (!readCopilotAccountOperation(params)) {
				started.complete();
			}
			return authenticate(params);
		};
		const discovery = f.service.discover(f.connection, f.identity.id);
		await started.p;
		const beforeAccepted = f.requests.map(readCopilotAccountOperation);
		f.state.delivery.complete(true);
		const result = await discovery;
		assert.deepStrictEqual({ beforeAccepted, operations: f.requests.map(readCopilotAccountOperation), resources: f.requests.map(request => request.resource), result }, {
			beforeAccepted: [discoveryIntent, undefined],
			operations: [discoveryIntent, undefined, { kind: 'discover', context: { kind: 'incomplete', entraAccountId: 'account-id' } }],
			resources: [copilotEntraDiscoveryResource, copilotEntraResources.get(copilotEntraM365Audience), copilotEntraDiscoveryResource],
			result: offered,
		});
	});

	test('missing service credentials leave discovery incomplete, not zero available services', async () => {
		const f = preparingFixture();
		f.state.missingScopes.push(`${copilotEntraEmuAudience}/user_impersonation`, `${copilotEntraM365Audience}/.default`);
		const result = await f.service.discover(f.connection, f.identity.id);
		assert.deepStrictEqual({ result, operations: f.requests.map(readCopilotAccountOperation) }, {
			result: { kind: 'incomplete', entraAccountId: 'account-id' }, operations: [discoveryIntent],
		});
	});

	test('a failed native discovery after preparation does not trigger another retry or become availability', async () => {
		const f = preparingFixture();
		const authenticate = f.connection.authenticate;
		let discoveries = 0;
		f.connection.authenticate = async params => {
			if (readCopilotAccountOperation(params)?.kind === 'discover' && ++discoveries === 2) {
				f.setContext({ kind: 'error', stage: 'discovery', entraAccountId: 'account-id' });
				throw new Error('Native discovery unavailable');
			}
			return authenticate(params);
		};
		await assert.rejects(f.service.discover(f.connection, f.identity.id), /Native discovery unavailable/);
		assert.strictEqual(discoveries, 2);
	});

	for (const stop of ['rejected', 'signedOut', 'disconnected', 'otherWindowSignOut'] as const) {
		test(`${stop} credential preparation cannot retry discovery`, async () => {
			const f = preparingFixture();
			f.state.missingScopes.push(`${copilotEntraEmuAudience}/user_impersonation`);
			f.state.delivery = new DeferredPromise<boolean>();
			const started = new DeferredPromise<void>();
			const authenticate = f.connection.authenticate;
			f.connection.authenticate = async params => {
				if (!readCopilotAccountOperation(params)) {
					started.complete();
				}
				return authenticate(params);
			};
			const rejected = assert.rejects(f.service.discover(f.connection, f.identity.id));
			await started.p;
			if (stop === 'signedOut') {
				await f.service.signOut(f.connection);
			} else if (stop === 'disconnected') {
				f.rootFailed.fire(new Error('Disconnected'));
			} else if (stop === 'otherWindowSignOut') {
				f.setContext({ kind: 'signedOut' });
			}
			f.state.delivery.complete(stop !== 'rejected');
			await rejected;
			assert.deepStrictEqual(f.requests.map(readCopilotAccountOperation).filter(Boolean), [discoveryIntent]);
		});
	}

	test('a missing discovery credential never creates an interactive sign-in automatically', async () => {
		const f = fixture();
		f.state.missingScopes.push('User.Read');
		await assert.rejects(f.service.discover(f.connection, f.identity.id), /additional permissions/);
		assert.deepStrictEqual(f.requests, []);
	});

	test('a selected credential must be accepted before activation and cannot outlive its offered choice', async () => {
		const f = fixture();
		f.setContext(offered);
		f.state.delivery = new DeferredPromise<boolean>();
		const started = new DeferredPromise<void>();
		const authenticate = f.connection.authenticate;
		f.connection.authenticate = async params => {
			started.complete();
			return authenticate(params);
		};
		const rejected = assert.rejects(f.service.select(f.connection, 'opaque-flow', 'selection-A'));
		await started.p;
		f.setContext({ ...offered, discoveryId: 'replacement-flow' });
		f.state.delivery.complete(true);
		await rejected;
		assert.deepStrictEqual(f.requests.map(readCopilotAccountOperation), [undefined]);
	});

	for (const operation of ['discover', 'select'] as const) {
		for (const label of ['Updated Microsoft display', '']) {
			test(`${operation} forwards the validated credential's ${label ? 'current' : 'omitted blank'} label without changing identity`, async () => {
				const f = fixture();
				if (operation === 'select') {
					f.setContext(offered);
				}
				f.state.pending = new DeferredPromise<readonly AuthenticationSession[]>();
				f.state.pending.complete([{
					...f.identity,
					account: { ...f.identity.account, label },
					scopes: operation === 'discover' ? ['User.Read'] : [`${copilotEntraM365Audience}/.default`],
				}]);
				if (operation === 'discover') {
					await f.service.discover(f.connection, f.identity.id);
				} else {
					await f.service.select(f.connection, 'opaque-flow', 'selection-A');
				}
				assert.deepStrictEqual(f.requests.filter(request => readCopilotAccountOperation(request)).map(readAuthenticationAccount), [{
					providerId: 'microsoft', accountId: f.identity.account.id, ...(label ? { label } : {}),
				}]);
			});
		}
	}

	test('returns the host-confirmed automatic context without requesting another selection', async () => {
		const ready: CopilotAccountContext = {
			kind: 'ready', discoveryId: 'opaque-flow', entraAccountId: 'account-id',
			choice: choices[0], derivedFrom: 'opaque-runtime-base',
		};
		const f = fixture(ready);
		const context = await f.service.discover(f.connection, f.identity.id);
		assert.deepStrictEqual({ context, operations: f.requests.map(readCopilotAccountOperation) }, {
			context: ready, operations: [discoveryIntent],
		});
	});

	test('rejects stale choice and unknown service without sending credentials', async () => {
		const f = fixture();
		f.setContext(offered);
		await assert.rejects(f.service.select(f.connection, 'old-flow', 'selection-A'));
		await assert.rejects(f.service.select(f.connection, 'opaque-flow', 'not-offered'));
		assert.deepStrictEqual(f.requests, []);
	});

	test('sign-out rejects a credential lookup that finishes later', async () => {
		const f = fixture();
		f.state.pending = new DeferredPromise<readonly AuthenticationSession[]>();
		const discovering = f.service.discover(f.connection, f.identity.id);
		await Promise.resolve();
		await f.service.signOut(f.connection);
		f.state.pending.complete([f.identity]);
		await assert.rejects(discovering);
		assert.deepStrictEqual(f.requests, []);
	});

	test('a pending Microsoft identity lookup cannot override another window direct choice', async () => {
		const f = fixture();
		f.setContext(offered);
		const original = f.service.discover(f.connection, f.identity.id);
		f.setContext({ kind: 'legacy' });
		await assert.rejects(original);
		assert.deepStrictEqual(f.requests, []);
	});

	test('withdrawing the selected authentication session revokes host authority', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		f.changed.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], changed: [], removed: [f.identity] } });
		assert.strictEqual(f.requests.at(-1)?.token, '');
	});

	test('same-account session replacement preserves authority', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		f.changed.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [{ ...f.identity, id: 'replacement' }], changed: [], removed: [f.identity] } });
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only']);
	});

	test('an unauthenticated window cannot revoke another window context', async () => {
		const f = fixture();
		f.setContext(offered);
		await assert.rejects(f.service.signOut(f.connection), /has not supplied/);
		assert.deepStrictEqual(f.requests, []);
	});

	test('an old local identity cannot revoke a replacement shared account', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		f.setContext({ kind: 'discovering', entraAccountId: 'another-account' });
		f.changed.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], changed: [], removed: [f.identity] } });
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only']);
	});

	test('a rejected discovery cannot revoke a different shared account', async () => {
		const f = fixture();
		f.setContext({ ...offered, entraAccountId: 'another-account' });
		f.state.rejectDiscovery = true;
		await assert.rejects(f.service.discover(f.connection, f.identity.id), /did not accept/);
		await f.service.signOut(f.connection);
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only']);
	});

	test('a rejected first delivery cannot revoke the same account supplied by another window', async () => {
		const f = fixture();
		f.setContext(offered);
		f.state.rejectDiscovery = true;
		await assert.rejects(f.service.discover(f.connection, f.identity.id), /did not accept/);
		await f.service.signOut(f.connection);
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only']);
	});

	test('a rejected later delivery preserves previously accepted sign-out authority', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		f.state.rejectDiscovery = true;
		await assert.rejects(f.service.discover(f.connection, f.identity.id), /did not accept/);
		await f.service.signOut(f.connection);
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only', 'synthetic-only', '']);
	});

	test('disabling AI during credential acquisition prevents forwarding the late result', async () => {
		const f = fixture();
		f.state.pending = new DeferredPromise<readonly AuthenticationSession[]>();
		const discovering = f.service.discover(f.connection, f.identity.id);
		await Promise.resolve();
		f.state.hidden = true;
		f.state.pending.complete([f.identity]);
		await assert.rejects(discovering);
		assert.deepStrictEqual(f.requests, []);
	});

	test('disabling AI in one workspace blocks local setup without signing the shared host out', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		f.state.disabledInWorkspace = true;
		f.sentimentChanged.fire();
		await assert.rejects(f.service.select(f.connection, 'opaque-flow', 'selection-A'), /unavailable/);
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only']);
	});

	test('a failed connection discards in-flight credentials instead of replaying them', async () => {
		const f = fixture();
		f.state.pending = new DeferredPromise<readonly AuthenticationSession[]>();
		const discovering = f.service.discover(f.connection, f.identity.id);
		await Promise.resolve();
		f.rootFailed.fire(new Error('Disconnected'));
		f.state.pending.complete([f.identity]);
		await assert.rejects(discovering);
		assert.deepStrictEqual(f.requests, []);
	});

	test('does not impose the optional account flow on other hosts or hidden AI', async () => {
		const f = fixture();
		f.state.hidden = true;
		await assert.rejects(f.service.discover(f.connection, f.identity.id), /unavailable/);
		f.state.hidden = false;
		f.setContext(undefined);
		await assert.rejects(f.service.discover(f.connection, f.identity.id), /unavailable/);
		assert.deepStrictEqual(f.requests, []);
	});
});
