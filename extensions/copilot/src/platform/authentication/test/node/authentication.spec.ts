/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { IDomainService } from '../../../endpoint/common/domainService';
import { IEnvService } from '../../../env/common/envService';
import { ILogService } from '../../../log/common/logService';
import { IFetcherService } from '../../../networking/common/fetcherService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { createPlatformServices } from '../../../test/node/services';
import { StaticGitHubAuthenticationService } from '../../common/staticGitHubAuthenticationService';
import { CopilotToken, createTestExtendedTokenInfo } from '../../common/copilotToken';
import { ICopilotTokenStore } from '../../common/copilotTokenStore';
import { FixedCopilotTokenManager } from '../../node/copilotTokenManager';

suite('AuthenticationService', function () {
	let disposables: DisposableStore;
	// These will be used to test the authentication service, but eventually these will
	// be folded into the authentication service itself.
	let copilotTokenManager: FixedCopilotTokenManager;
	let authenticationService: StaticGitHubAuthenticationService;

	const testToken = 'tid=test';

	beforeEach(async () => {
		disposables = new DisposableStore();
		const accessor = disposables.add(createPlatformServices().createTestingAccessor());
		copilotTokenManager = new FixedCopilotTokenManager(
			testToken,
			accessor.get(ILogService),
			accessor.get(ITelemetryService),
			accessor.get(ICAPIClientService),
			accessor.get(IDomainService),
			accessor.get(IFetcherService),
			accessor.get(IEnvService)
		);
		authenticationService = new StaticGitHubAuthenticationService(
			() => testToken,
			accessor.get(ILogService),
			accessor.get(ICopilotTokenStore),
			copilotTokenManager,
			accessor.get(IConfigurationService)
		);
		disposables.add(authenticationService);
	});

	afterEach(() => {
		disposables.dispose();
	});

	test('Can get anyGitHubToken', async () => {
		const token = await authenticationService.getGitHubSession('any', { silent: true });
		expect(token?.accessToken).toBe(testToken);
		expect(authenticationService.anyGitHubSession?.accessToken).toBe(testToken);
	});

	test('Can get permissiveGitHubToken', async () => {
		const token = await authenticationService.getGitHubSession('permissive', { silent: true });
		expect(token?.accessToken).toBe(testToken);
		expect(authenticationService.permissiveGitHubSession?.accessToken).toBe(testToken);
	});

	test('Can get copilotToken', async () => {
		const token = await authenticationService.getCopilotToken();
		expect(token.token).toBe(testToken);
		expect(authenticationService.copilotToken?.token).toBe(testToken);
	});

	test('Emits onDidAuthenticationChange when a Copilot Token change is notified', async () => {
		const promise = Event.toPromise(authenticationService.onDidAuthenticationChange);
		const newToken = 'tid=new';
		authenticationService.setCopilotToken(new CopilotToken(createTestExtendedTokenInfo({
			token: newToken,
			username: 'fake',
			copilot_plan: 'unknown',
		})));
		await promise;
		expect(authenticationService.copilotToken?.token).toBe(newToken);
	});

	test.skip('Emits onDidAuthenticationChange when a Copilot Token change is notified from the manager', async () => {
		const promise = Event.toPromise(authenticationService.onDidAuthenticationChange);
		const newToken = 'tid=new';
		copilotTokenManager.completionsToken = newToken;
		await promise;
		expect(authenticationService.copilotToken?.token).toBe(newToken);
	});
});
