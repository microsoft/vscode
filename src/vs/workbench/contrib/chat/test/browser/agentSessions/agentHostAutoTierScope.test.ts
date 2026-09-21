/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { NullAgentHostService } from '../../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AgentHostAutoTierScope } from '../../../browser/agentSessions/agentHost/agentHostAutoTierScope.js';

suite('AgentHostAutoTierScope', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account: IDefaultAccount = {
		accountName: 'test', sessionId: 'default-session', enterprise: false,
		authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
	};
	const session: AuthenticationSession = {
		id: 'default-session', account: { id: 'default-account', label: 'test' }, scopes: ['read'],
		accessToken: 'test-only',
	};

	function setup(options: { native?: boolean; remoteAuthority?: string; pending?: boolean } = {}) {
		const changed = store.add(new Emitter<void>());
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const pending = observableValue('test.authPending', options.pending ?? false);
		let sessions: readonly AuthenticationSession[] = [session];
		let getAccount = async (): Promise<IDefaultAccount | null> => account;
		let selectedProvider = 'github';
		let reads = 0;
		const host = upcastPartial<IAgentHostService>({
			authenticationPending: pending,
			rootState: upcastPartial<IAgentHostService['rootState']>({
				onDidChange: Event.None,
				value: { agents: [{
					provider: 'copilotcli', displayName: 'Copilot', description: '', models: [],
					protectedResources: [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com'], scopes_supported: ['read'] }],
				}] },
			}),
		});
		const auth = upcastPartial<IAuthenticationService>({
			onDidChangeSessions: Event.map(changed.event, () => ({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [] } })),
			onDidRegisterAuthenticationProvider: Event.None,
			getOrActivateProviderIdForServer: async () => selectedProvider,
			getSessions: async provider => { reads++; return provider === 'github' ? sessions : [{ ...session, id: 'other-provider-session' }]; },
		});
		const defaults = upcastPartial<IDefaultAccountService>({
			onDidChangeDefaultAccount: accountChanged.event,
			getDefaultAccount: () => getAccount(),
		});
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const scope = store.add(new AgentHostAutoTierScope(options.native ?? true, host, defaults, auth,
			upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: options.remoteAuthority }),
			configuration, new NullLogService()));
		return {
			scope, pending, changed, accountChanged,
			setSessions: (value: readonly AuthenticationSession[]) => { sessions = value; changed.fire(); },
			setAccount: (value: () => Promise<IDefaultAccount | null>) => { getAccount = value; accountChanged.fire(null); },
			setProvider: (value: string) => { selectedProvider = value; changed.fire(); },
			get reads() { return reads; },
		};
	}

	test('deduplicates same-account scope variants, withdraws on ambiguity, and recovers when removed', async () => {
		const fixture = setup();
		await waitForState(fixture.scope.allowed, value => value);
		fixture.setSessions([session, { ...session, id: 'wider', scopes: ['read', 'write'] }]);
		await waitForState(fixture.scope.allowed, value => value);
		fixture.setSessions([session, { ...session, id: 'second', account: { id: 'other', label: 'other' } }]);
		await timeout(0);
		const ambiguous = fixture.scope.allowed.get();
		fixture.setSessions([session]);
		await waitForState(fixture.scope.allowed, value => value);
		fixture.setProvider('different-provider');
		await timeout(0);
		assert.deepStrictEqual({ ambiguous, otherProvider: fixture.scope.allowed.get() }, { ambiguous: false, otherProvider: false });
	});

	for (const options of [{ native: false }, { remoteAuthority: 'ssh-remote+test' }, { pending: true }]) {
		test(`does not project to an unverified execution context ${JSON.stringify(options)}`, async () => {
			const fixture = setup(options);
			await timeout(0);
			assert.deepStrictEqual({ allowed: fixture.scope.allowed.get(), reads: fixture.reads }, { allowed: false, reads: 0 });
		});
	}

	test('waits for authentication and rejects stale account resolutions after a switch', async () => {
		const fixture = setup({ pending: true });
		const stale = new DeferredPromise<IDefaultAccount | null>();
		fixture.setAccount(() => stale.p);
		fixture.pending.set(false, undefined);
		await timeout(0);
		fixture.setAccount(async () => ({ ...account, sessionId: 'unavailable-new-account-session' }));
		stale.complete(account);
		await timeout(0);
		const afterSwitch = fixture.scope.allowed.get();
		fixture.setAccount(async () => account);
		await waitForState(fixture.scope.allowed, value => value);
		fixture.pending.set(true, undefined);
		assert.deepStrictEqual({ afterSwitch, reauthenticating: fixture.scope.allowed.get() }, { afterSwitch: false, reauthenticating: false });
	});

	test('web and remote windows never access the unsupported native host state', () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const scopes = [{ native: false }, { native: true, remoteAuthority: 'ssh-remote+test' }].map(options =>
			store.add(new AgentHostAutoTierScope(options.native, new NullAgentHostService(),
				upcastPartial<IDefaultAccountService>({}), upcastPartial<IAuthenticationService>({}),
				upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: options.remoteAuthority }),
				configuration, new NullLogService())));
		assert.deepStrictEqual(scopes.map(scope => scope.allowed.get()), [false, false]);
	});

	test('disposed scope ignores a pending account match', async () => {
		const fixture = setup({ pending: true });
		const match = new DeferredPromise<IDefaultAccount | null>();
		fixture.setAccount(() => match.p);
		fixture.pending.set(false, undefined);
		fixture.scope.dispose();
		match.complete(account);
		await timeout(0);
		assert.strictEqual(fixture.scope.allowed.get(), false);
	});
});
