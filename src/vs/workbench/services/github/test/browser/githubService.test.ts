/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTransport.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService, TELEMETRY_SETTING_ID, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { WorkbenchGitHubService, WorkbenchGitHubTokenProvider } from '../../browser/githubService.js';

suite('Workbench GitHub service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('enterprise endpoints require an available URL', () => {
		let baseUrl: string | undefined = 'https://tenant.ghe.com/';
		const service = store.add(new WorkbenchGitHubService(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override getDefaultAccountAuthenticationProvider() {
					return { id: 'github-enterprise', name: 'GitHub Enterprise', enterprise: true };
				}
				override resolveGitHubUrl(path: string): string | undefined {
					return baseUrl ? `${baseUrl}${path}` : undefined;
				}
			}(),
			new NullLogService(),
			NullTelemetryService,
			new class extends mock<IProductService>() {
				override readonly applicationName = 'code-insiders';
				override readonly version = '1.141.0';
			}(),
			new class extends mock<IConfigurationService>() {
				override readonly onDidChangeConfiguration = Event.None;
			}(),
		));
		const endpoints = [service.endpoint.getApiBaseUri(), service.endpoint.getGraphQlUri()];
		baseUrl = undefined;

		assert.deepStrictEqual(endpoints, ['https://api.tenant.ghe.com', 'https://api.tenant.ghe.com/graphql']);
		assert.throws(() => service.endpoint.getApiBaseUri(), GitHubRequestError);
		assert.throws(() => service.endpoint.getGraphQlUri(), GitHubRequestError);
	});

	test('drops pending GitHub telemetry when configuration opts out and back in while idle', async () => {
		const configuration = new TestConfigurationService({ [TELEMETRY_SETTING_ID]: 'all' });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const events: string[] = [];
		const service = store.add(new WorkbenchGitHubService(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
			}(),
			new NullLogService(),
			new class extends mock<ITelemetryService>() {
				override readonly telemetryLevel = TelemetryLevel.USAGE;
				override publicLog2(name: string): void { events.push(name); }
			}(),
			new class extends mock<IProductService>() {
				override readonly applicationName = 'code-insiders';
				override readonly version = '1.141.0';
			}(),
			configuration,
		));
		const controller = new AbortController();
		const reason = new Error('cancelled');
		controller.abort(reason);
		await assert.rejects(service.transport.rest({ host: 'api.github.com', accountId: '1' }, 'token', {
			method: 'GET', url: 'https://api.github.com/user',
		}, controller.signal), error => error === reason);
		for (const level of ['off', 'all']) {
			await configuration.setUserConfiguration(TELEMETRY_SETTING_ID, level);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(key: string): boolean { return key === TELEMETRY_SETTING_ID; }
			}());
		}
		service.dispose();
		assert.deepStrictEqual(events, []);
	});

	test('reuses a repo-capable session with additional scopes', async () => {
		const sessions: AuthenticationSession[] = [{
			id: 'session',
			accessToken: 'token',
			account: { id: 'account', label: 'Account' },
			scopes: ['repo', 'user:email'],
		}];
		const requestedScopes: (readonly string[] | undefined)[] = [];
		const tokenProvider = new WorkbenchGitHubTokenProvider(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
				override async getSessions(_id: string, scopes?: readonly string[]): Promise<readonly AuthenticationSession[]> {
					requestedScopes.push(scopes);
					return sessions;
				}
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override readonly currentDefaultAccount = null;
				override getDefaultAccountAuthenticationProvider() {
					return { id: 'github', name: 'GitHub', enterprise: false };
				}
				override async getDefaultAccount() {
					return null;
				}
			}(),
			new NullLogService(),
		);

		assert.deepStrictEqual({
			token: await tokenProvider.getToken(),
			requestedScopes,
		}, {
			token: 'token',
			requestedScopes: [[]],
		});
	});
});
