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
import { copilotEntraDiscoveryResource, copilotEntraM365Audience } from '../../../../../../platform/agentHost/common/copilotEntraAuthentication.js';
import { readAuthenticationAccount } from '../../../../../../platform/agentHost/common/meta/agentAuthenticationAccount.js';
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
		const state = { pending: undefined as DeferredPromise<readonly AuthenticationSession[]> | undefined, hidden: false, disabledInWorkspace: false, rejectDiscovery: false };
		const setContext = (context: CopilotAccountContext | undefined) => {
			root.config!.values[copilotAccountContextKey] = context;
			rootChanged.fire(root);
		};
		const connection = upcastPartial<IAgentConnection>({
			rootState: upcastPartial<IAgentConnection['rootState']>({ value: root, onDidChange: rootChanged.event, onDidError: rootFailed.event }),
			authenticate: async params => {
				requests.push(params);
				const operation = readCopilotAccountOperation(params);
				if (!params.token) {
					setContext({ kind: 'signedOut' });
				} else if (operation?.kind === 'discover') {
					if (state.rejectDiscovery) {
						return { authenticated: false };
					}
					setContext(discoveryResult);
				} else if (operation?.kind === 'select') {
					setContext({ kind: 'ready', entraAccountId: identity.account.id, discoveryId: operation.discoveryId, choice: choices.find(choice => choice.selectionId === operation.selectionId)!, derivedFrom: 'opaque-runtime-base' });
				}
				return { authenticated: true };
			},
		});
		const authentication = upcastPartial<IAuthenticationService>({
			onDidChangeSessions: changed.event,
			getSessions: async (_provider, scopes) => scopes && state.pending ? state.pending.p : [{ ...identity, scopes: Array.isArray(scopes) ? scopes : identity.scopes }],
		});
		const entitlement = upcastPartial<IChatEntitlementService>({ onDidChangeSentiment: sentimentChanged.event, get sentiment(): IChatSentiment { return { hidden: state.hidden, disabledInWorkspace: state.disabledInWorkspace }; } });
		const service = store.add(new AgentHostCopilotAccountService(authentication, entitlement, new TestConfigurationService(), new NullLogService()));
		return { service, connection, requests, identity, setContext, changed, state, rootFailed, sentimentChanged };
	}

	test('separates Microsoft session id, identity, runtime choice and service', async () => {
		const f = fixture();
		await f.service.discover(f.connection, f.identity.id);
		const ready = await f.service.select(f.connection, 'opaque-flow', 'selection-A');
		assert.deepStrictEqual({
			operations: f.requests.map(readCopilotAccountOperation), identities: f.requests.map(request => readAuthenticationAccount(request)?.accountId),
			resources: f.requests.map(request => request.resource), ready,
		}, {
			operations: [{ kind: 'discover' }, { kind: 'select', discoveryId: 'opaque-flow', selectionId: 'selection-A' }],
			identities: ['account-id', 'account-id'],
			resources: [copilotEntraDiscoveryResource, choices[0].resource],
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

	test('returns the host-confirmed automatic context without requesting another selection', async () => {
		const ready: CopilotAccountContext = {
			kind: 'ready', discoveryId: 'opaque-flow', entraAccountId: 'account-id',
			choice: choices[0], derivedFrom: 'opaque-runtime-base',
		};
		const f = fixture(ready);
		const context = await f.service.discover(f.connection, f.identity.id);
		assert.deepStrictEqual({ context, operations: f.requests.map(readCopilotAccountOperation) }, {
			context: ready, operations: [{ kind: 'discover' }],
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
		await assert.rejects(f.service.signOut(f.connection));
		assert.deepStrictEqual(f.requests.map(request => request.token), ['synthetic-only']);
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
