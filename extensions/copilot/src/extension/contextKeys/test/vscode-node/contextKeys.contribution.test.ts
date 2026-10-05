/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { commands } from 'vscode';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { ICopilotTokenManager } from '../../../../platform/authentication/common/copilotTokenManager';
import { CopilotTokenStore } from '../../../../platform/authentication/common/copilotTokenStore';
import { StaticGitHubAuthenticationService } from '../../../../platform/authentication/common/staticGitHubAuthenticationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { NullEnvService } from '../../../../platform/env/common/nullEnvService';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { ContextKeysContribution } from '../../vscode-node/contextKeys.contribution';

suite('ContextKeysContribution - explicit token refresh', () => {
	const store = new DisposableStore();

	teardown(() => store.clear());
	suiteTeardown(() => store.dispose());

	test('refreshes cached free-plan metadata after a plan change', async () => {
		const manager = new CachedTestTokenManager();
		const logService = new TestLogService();
		const configurationService = new DefaultsOnlyConfigurationService();
		const auth = store.add(new StaticGitHubAuthenticationService(
			undefined, logService, store.add(new CopilotTokenStore()), manager, configurationService,
		));
		await auth.getCopilotToken();
		store.add(new ContextKeysContribution(
			auth, new NullTelemetryService(), logService, configurationService, new NullEnvService(), new NullExperimentationService(),
		));

		manager.sku = 'copilot_individual';
		await commands.executeCommand('github.copilot.refreshToken');

		assert.deepStrictEqual({
			sku: auth.copilotToken?.sku,
			mints: manager.mints,
			forcedRefreshes: manager.forcedRefreshes,
		}, {
			sku: 'copilot_individual',
			mints: 2,
			forcedRefreshes: 1,
		});
	});
});

class CachedTestTokenManager implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;
	readonly onDidCopilotTokenRefresh = Event.None;
	sku = 'free_limited_copilot';
	mints = 0;
	forcedRefreshes = 0;
	private token: CopilotToken | undefined;

	async getCopilotToken(force?: boolean): Promise<CopilotToken> {
		if (force) {
			this.forcedRefreshes++;
		}
		if (!this.token || force) {
			this.mints++;
			this.token = new CopilotToken(createTestExtendedTokenInfo({
				token: `tid=test;mint=${this.mints}`,
				expires_at: Math.floor(Date.now() / 1000) + 1800,
				sku: this.sku,
				limited_user_quotas: { chat: 0, completions: 100 },
			}));
		}
		return this.token;
	}

	resetCopilotToken(): void {
		this.token = undefined;
	}
}
