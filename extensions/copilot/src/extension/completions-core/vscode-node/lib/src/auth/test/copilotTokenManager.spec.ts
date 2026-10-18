/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IAuthenticationService } from '../../../../../../../platform/authentication/common/authentication';
import { StaticGitHubAuthenticationService } from '../../../../../../../platform/authentication/common/staticGitHubAuthenticationService';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../../../../platform/authentication/common/copilotToken';
import { ICopilotTokenManager } from '../../../../../../../platform/authentication/common/copilotTokenManager';
import { ICopilotTokenStore } from '../../../../../../../platform/authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../../../../../platform/log/common/logService';
import { createPlatformServices, ITestingServicesAccessor } from '../../../../../../../platform/test/node/services';
import { FetchBlockedError } from '../../../../../../../shared-fetch-utils/common/fetchTypes';
import { Event } from '../../../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../../../util/vs/base/common/lifecycle';
import { CopilotTokenManagerImpl } from '../copilotTokenManager';

describe('CopilotTokenManagerImpl', () => {
	let accessor: ITestingServicesAccessor;
	let disposables: DisposableStore;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(100);
		disposables = new DisposableStore();
		accessor = disposables.add(createPlatformServices().createTestingAccessor());
	});

	afterEach(() => {
		disposables.dispose();
		vi.useRealTimers();
	});

	it('caches ordinary failures for five seconds', async () => {
		const tokenManager = new FailingCopilotTokenManager(() => new Error('network failure'));
		const manager = createManager(tokenManager);

		await expect(manager.getToken()).rejects.toThrow('network failure');
		await expect(manager.getToken()).rejects.toThrow('network failure');
		expect(tokenManager.calls).toBe(1);

		vi.advanceTimersByTime(4_999);
		await expect(manager.getToken()).rejects.toThrow('network failure');
		expect(tokenManager.calls).toBe(1);

		vi.advanceTimersByTime(1);
		await expect(manager.getToken()).rejects.toThrow('network failure');
		expect(tokenManager.calls).toBe(2);
	});

	it('prefers a server retry delay over the fallback cooldown', async () => {
		const tokenManager = new FailingCopilotTokenManager(() => new FetchBlockedError('rate limited', 30_000));
		const manager = createManager(tokenManager);

		await expect(manager.getToken()).rejects.toThrow('rate limited');
		vi.advanceTimersByTime(5_000);
		await expect(manager.getToken()).rejects.toThrow('rate limited');
		expect(tokenManager.calls).toBe(1);

		vi.advanceTimersByTime(25_000);
		await expect(manager.getToken()).rejects.toThrow('rate limited');
		expect(tokenManager.calls).toBe(2);
	});

	it('foreground calls still fail after a successful token fetch', async () => {
		const token = new CopilotToken(createTestExtendedTokenInfo({ token: 'tid=success' }));
		const tokenManager = new ScriptedCopilotTokenManager([
			token,
			new Error('signed out'),
		]);
		const manager = createManager(tokenManager);

		await expect(manager.getToken()).resolves.toBe(token);
		await expect(manager.getToken()).rejects.toThrow('signed out');
		await expect(manager.primeToken()).resolves.toBe(false);

		expect(manager.token).toBe(token);
		expect(tokenManager.calls).toBe(2);
	});

	function createManager(tokenManager: ICopilotTokenManager): CopilotTokenManagerImpl {
		const authenticationService: IAuthenticationService = disposables.add(new StaticGitHubAuthenticationService(
			() => 'github-token',
			accessor.get(ILogService),
			accessor.get(ICopilotTokenStore),
			tokenManager,
			accessor.get(IConfigurationService),
		));
		return disposables.add(new CopilotTokenManagerImpl(false, authenticationService));
	}
});

class FailingCopilotTokenManager implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;
	readonly onDidCopilotTokenRefresh = Event.None;
	calls = 0;

	constructor(private readonly createError: () => Error) { }

	async getCopilotToken(): Promise<CopilotToken> {
		this.calls++;
		throw this.createError();
	}

	resetCopilotToken(): void { }
}

class ScriptedCopilotTokenManager implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;
	readonly onDidCopilotTokenRefresh = Event.None;
	calls = 0;

	constructor(private readonly results: Array<CopilotToken | Error>) { }

	async getCopilotToken(): Promise<CopilotToken> {
		this.calls++;
		const result = this.results.shift();
		if (!result) {
			throw new Error('No scripted token result');
		}
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}

	resetCopilotToken(): void { }
}
