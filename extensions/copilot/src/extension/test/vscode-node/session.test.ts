/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { authentication, AuthenticationGetSessionOptions, AuthenticationSession, AuthenticationSessionAccountInformation, AuthenticationWwwAuthenticateRequest, ConfigurationScope, ConfigurationTarget, workspace, WorkspaceConfiguration } from 'vscode';
import { GITHUB_SCOPE_ALIGNED, GITHUB_SCOPE_READ_USER, GITHUB_SCOPE_USER_EMAIL } from '../../../platform/authentication/common/authentication';
import { getAlignedSession, getAnyAuthSession } from '../../../platform/authentication/vscode-node/session';
import { AuthProviderId, Config, ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../platform/configuration/test/common/inMemoryConfigurationService';
import { ITelemetryUserConfig, TelemetryUserConfigImpl } from '../../../platform/telemetry/common/telemetry';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { createExtensionTestingServices } from './services';

suite('Session tests', function () {
	const testingServiceCollection = createExtensionTestingServices();
	testingServiceCollection.define(ITelemetryUserConfig, new SyncDescriptor(TelemetryUserConfigImpl, ['test', false]));
	const accessor = testingServiceCollection.createTestingAccessor();

	let sandbox: sinon.SinonSandbox;
	let getSessionStub: sinon.SinonStub<[providerId: string, scopeListOrRequest: readonly string[] | AuthenticationWwwAuthenticateRequest, options?: AuthenticationGetSessionOptions | undefined], Thenable<AuthenticationSession | undefined>>;
	let getAccountsStub: sinon.SinonStub<[providerId: string], Thenable<readonly AuthenticationSessionAccountInformation[]>>;
	let configurationStub: sinon.SinonStub<[section?: string | undefined, scope?: ConfigurationScope | null | undefined], WorkspaceConfiguration>;

	function seedSessions(sessions: AuthenticationSession[]) {

		getAccountsStub.resolves(sessions.map(session => session.account));

		const sessionsByScope = new Map<string, AuthenticationSession[]>();
		for (const session of sessions) {
			const scopeKey = session.scopes.join(' ');
			const sessionsWithScope = sessionsByScope.get(scopeKey) || [];
			sessionsWithScope.push(session);
			sessionsByScope.set(scopeKey, sessionsWithScope);
		}

		getSessionStub.callsFake((_providerId: string, scopeListOrRequest: readonly string[] | AuthenticationWwwAuthenticateRequest, options?: AuthenticationGetSessionOptions | undefined) => {
			const scopes = scopeListOrRequest as readonly string[];
			let sessionsWithScope = sessionsByScope.get(scopes.join(' '));
			if (sessionsWithScope) {
				if (options?.account) {
					sessionsWithScope = sessionsWithScope.filter(session => session.account.label === options.account?.label);
				}
				return Promise.resolve(sessionsWithScope[0]);
			}

			return Promise.resolve(undefined);
		});

	}

	setup(() => {
		sandbox = sinon.createSandbox();
		getSessionStub = sandbox.stub(authentication, 'getSession');
		// default to no session
		getSessionStub.resolves(undefined);
		getAccountsStub = sandbox.stub(authentication, 'getAccounts');
		// default to no accounts
		getAccountsStub.resolves([]);
		configurationStub = sandbox.stub(workspace, 'getConfiguration');
		configurationStub.returns(new class implements WorkspaceConfiguration {
			private _data = new Map<string, any>();
			get<T>(section: string): T | undefined;
			get<T>(section: string, defaultValue: T): T;
			get<T>(section: unknown, defaultValue?: unknown): T | undefined {
				return this._data.get(section as string) ?? defaultValue;
			}
			has(section: string): boolean {
				return !!this._data.get(section);
			}
			inspect<T>(section: string): undefined {
				return undefined;
			}
			update(section: string, value: any, configurationTarget?: boolean | ConfigurationTarget | null | undefined, overrideInLanguage?: boolean | undefined): Thenable<void> {
				this._data.set(section, value);
				return Promise.resolve();
			}
		});
	});

	teardown(() => {
		sandbox.restore();
	});

	suite('getAnyAuthSession', () => {
		test('should return a session with ["user:email"] scope if it is available', async () => {
			const scopes = GITHUB_SCOPE_USER_EMAIL;
			const sessionId = 'session-id-1';

			seedSessions([{ id: sessionId, scopes, accessToken: 'token', account: { id: 'account', label: 'account-label' } }]);

			const result = await getAnyAuthSession(accessor.get(IConfigurationService));

			assert.strictEqual((result as AuthenticationSession)?.id, sessionId);
		});

		test('should return a session with ["read:user"] scope if it is available', async () => {
			const scopes = GITHUB_SCOPE_READ_USER;
			const sessionId = 'session-id-1';

			seedSessions([{ id: sessionId, scopes, accessToken: 'token', account: { id: 'account', label: 'account-label' } }]);

			const result = await getAnyAuthSession(accessor.get(IConfigurationService));

			assert.strictEqual((result as AuthenticationSession)?.id, sessionId);
		});

		test('should return a session with aligned scopes if it is available', async () => {
			const scopes = GITHUB_SCOPE_ALIGNED;
			const sessionId = 'session-id-1';

			seedSessions([{ id: sessionId, scopes, accessToken: 'token', account: { id: 'account', label: 'account-label' } }]);

			const result = await getAnyAuthSession(accessor.get(IConfigurationService));

			assert.strictEqual((result as AuthenticationSession)?.id, sessionId);
		});

		test('should return a session with the ["user:email"] scope over ["read:user"] if it is available', async () => {
			const newSessionId = 'new-session-id-1';
			const oldSessionId = 'old-session-id-2';

			seedSessions([
				{
					id: oldSessionId,
					accessToken: 'old-token',
					scopes: GITHUB_SCOPE_READ_USER,
					account: { id: 'account', label: 'account-label' },
				},
				{
					id: newSessionId,
					accessToken: 'new-token',
					scopes: GITHUB_SCOPE_USER_EMAIL,
					account: { id: 'account', label: 'account-label' },
				}
			]);

			const result = await getAnyAuthSession(accessor.get(IConfigurationService));

			assert.strictEqual((result as AuthenticationSession)?.id, newSessionId);
		});

		test('should return a session with the aligned scopes if it is available', async () => {
			const newSessionId = 'new-session-id-1';
			const oldSessionId = 'old-session-id-2';
			const alignedSessionId = 'aligned-session-id-3';

			seedSessions([
				{
					id: alignedSessionId,
					accessToken: 'aligned-token',
					scopes: GITHUB_SCOPE_ALIGNED,
					account: { id: 'account', label: 'account-label' },
				},
				{
					id: oldSessionId,
					accessToken: 'old-token',
					scopes: GITHUB_SCOPE_READ_USER,
					account: { id: 'account', label: 'account-label' },
				},
				{
					id: newSessionId,
					accessToken: 'new-token',
					scopes: GITHUB_SCOPE_USER_EMAIL,
					account: { id: 'account', label: 'account-label' },
				},
			]);

			const result = await getAnyAuthSession(accessor.get(IConfigurationService));

			assert.strictEqual((result as AuthenticationSession)?.id, alignedSessionId);
		});

		test('should return undefined if there are no pre-existing sessions', async () => {
			const alignedScopeSessionStub = getSessionStub.withArgs('github', GITHUB_SCOPE_ALIGNED, sinon.match.any);
			const userEmailSessionStub = getSessionStub.withArgs('github', GITHUB_SCOPE_USER_EMAIL, sinon.match.any);
			const readUserScopeSessionStub = getSessionStub.withArgs('github', GITHUB_SCOPE_READ_USER, sinon.match.any);

			const result = await getAnyAuthSession(accessor.get(IConfigurationService));

			assert.strictEqual(result, undefined);
			assert.strictEqual(alignedScopeSessionStub.calledOnce, false);
			// Only call the user:email scope one since we have no accounts
			assert.strictEqual(userEmailSessionStub.calledOnce, true);
			assert.strictEqual(readUserScopeSessionStub.calledOnce, false);
		});

		test('should use the github-enterprise provider if configured', async () => {
			const configurationService = new InMemoryConfigurationService(
				new DefaultsOnlyConfigurationService(),
				new Map<Config<any>, unknown>([
					[ConfigKey.Shared.AuthProvider, AuthProviderId.GitHubEnterprise]
				]),
				undefined
			);

			const gheSessionId = 'ghe-session-id-1';

			getAccountsStub.resolves([{ id: 'account', label: 'ghe-session-label' }]);
			const gheSessionStub = getSessionStub.withArgs('github-enterprise', GITHUB_SCOPE_READ_USER, sinon.match.any);
			gheSessionStub.resolves({
				id: gheSessionId,
				accessToken: 'new-token',
				scopes: GITHUB_SCOPE_READ_USER,
				account: { id: 'account', label: 'ghe-session-label' },
			});
			const ghSessionStub = getSessionStub.withArgs('github', GITHUB_SCOPE_READ_USER, sinon.match.any);

			const result = await getAnyAuthSession(configurationService);

			assert.strictEqual((result as AuthenticationSession)?.id, gheSessionId);
			assert.strictEqual(gheSessionStub.calledOnce, true);
			assert.strictEqual(ghSessionStub.notCalled, true);
		});
	});

	suite('getAlignedSession', () => {
		test('should return a session with more permissive scopes if there is one', async () => {
			const alignedSessionId = 'session-id';

			seedSessions([
				{
					id: alignedSessionId,
					accessToken: 'token',
					scopes: GITHUB_SCOPE_ALIGNED,
					account: { id: 'account', label: 'account-label' },
				}
			]);

			const result = await getAlignedSession(accessor.get(IConfigurationService), { silent: true });

			assert.strictEqual((result as AuthenticationSession)?.id, alignedSessionId);
		});

		test('should return undefined if there is no session with permissive scopes', async () => {
			const alignedSessionId = 'session-id';

			seedSessions([
				{
					id: alignedSessionId,
					accessToken: 'token',
					scopes: GITHUB_SCOPE_USER_EMAIL,
					account: { id: 'account', label: 'account-label' },
				}
			]);

			const result = await getAlignedSession(accessor.get(IConfigurationService), { silent: true });
			assert.strictEqual(result, undefined);
		});
	});
});
