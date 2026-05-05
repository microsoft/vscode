/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { Config, ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { createStaleSessionWarningActionResult, createStaleSessionWarningResult, formatStaleSessionIdleTime, formatStaleSessionTokenCount, removeStaleSessionWarningHistory, shouldWarnAboutStaleSession, StaleSessionProviderKind, StaleSessionWarningAction } from '../staleSessionWarning/staleSessionWarning';

describe('staleSessionWarning', () => {
	it('requires both the idle-time and token thresholds to be exceeded', () => {
		const config = createConfigurationService();
		const now = 10 * 60 * 60 * 1000;

		expect([
			shouldWarnAboutStaleSession(config, { providerKind: StaleSessionProviderKind.Local, modelId: 'gpt-test', tokenCount: 79_999, lastActivityTime: 0, now }),
			shouldWarnAboutStaleSession(config, { providerKind: StaleSessionProviderKind.Local, modelId: 'gpt-test', tokenCount: 80_000, lastActivityTime: now - (7 * 60 * 60 * 1000), now }),
			shouldWarnAboutStaleSession(config, { providerKind: StaleSessionProviderKind.Local, modelId: 'gpt-test', tokenCount: 80_000, lastActivityTime: 0, now })?.providerKind,
		]).toEqual([undefined, undefined, StaleSessionProviderKind.Local]);
	});

	it('uses model-specific threshold overrides', () => {
		const config = createConfigurationService({
			[ConfigKey.Advanced.StaleSessionWarningThresholdsByModel.fullyQualifiedId]: {
				'gpt-large': { timeHours: 2, tokens: 10_000 },
			},
		});
		const now = 3 * 60 * 60 * 1000;

		expect([
			shouldWarnAboutStaleSession(config, { providerKind: StaleSessionProviderKind.CopilotCLI, modelId: 'gpt-small', tokenCount: 50_000, lastActivityTime: 0, now }),
			shouldWarnAboutStaleSession(config, { providerKind: StaleSessionProviderKind.CopilotCLI, modelId: 'gpt-large', tokenCount: 50_000, lastActivityTime: 0, now })?.thresholds,
		]).toEqual([undefined, { timeHours: 2, tokens: 10_000 }]);
	});

	it('respects the enabled flag and excluded providers', () => {
		const disabled = createConfigurationService({
			[ConfigKey.Advanced.StaleSessionWarningEnabled.fullyQualifiedId]: false,
		});
		const excluded = createConfigurationService({
			[ConfigKey.Advanced.StaleSessionWarningExcludedProviders.fullyQualifiedId]: [StaleSessionProviderKind.Claude],
		});
		const input = { providerKind: StaleSessionProviderKind.Claude, modelId: 'claude-test', tokenCount: 100_000, lastActivityTime: 0, now: 10 * 60 * 60 * 1000 };

		expect([
			shouldWarnAboutStaleSession(disabled, input),
			shouldWarnAboutStaleSession(excluded, input),
		]).toEqual([undefined, undefined]);
	});

	it('formats idle time for minutes, hours, and days', () => {
		expect([
			formatStaleSessionIdleTime(4 * 1000),
			formatStaleSessionIdleTime(45 * 60 * 1000),
			formatStaleSessionIdleTime(90 * 60 * 1000),
			formatStaleSessionIdleTime(25 * 60 * 60 * 1000),
			formatStaleSessionIdleTime(49 * 60 * 60 * 1000),
		]).toEqual([
			'about 1 minute ago',
			'about 45 minutes ago',
			'about 2 hours ago',
			'1 day ago',
			'2 days ago',
		]);
	});

	it('formats token counts as exact values below 1K and thousands above that', () => {
		expect([
			formatStaleSessionTokenCount(1),
			formatStaleSessionTokenCount(999),
			formatStaleSessionTokenCount(1000),
			formatStaleSessionTokenCount(1999),
			formatStaleSessionTokenCount(80_500),
		]).toEqual([
			'1 token',
			'999 tokens',
			'1K tokens',
			'1K tokens',
			'80K tokens',
		]);
	});

	it('removes warning-only turns from history', () => {
		const warningMetadata = {
			kind: 'staleSessionWarning' as const,
			providerKind: StaleSessionProviderKind.Local,
			originalPrompt: 'continue this task',
			sessionId: 'session',
			modelId: 'gpt-test',
		};
		const before = { prompt: 'before' };
		const warningRequest = { prompt: warningMetadata.originalPrompt };
		const warningResponse = { result: createStaleSessionWarningResult(warningMetadata) };
		const after = { prompt: 'after' };

		expect(removeStaleSessionWarningHistory([before, warningRequest, warningResponse, after] as never)).toEqual([before, after]);
	});

	it('removes start-new confirmation turns from history', () => {
		const actionMetadata = {
			kind: 'staleSessionWarning' as const,
			providerKind: StaleSessionProviderKind.Local,
			action: StaleSessionWarningAction.StartNewSession,
			originalPrompt: 'continue this task',
			sessionId: 'session',
			modelId: 'gpt-test',
		};
		const before = { prompt: 'before' };
		const actionRequest = { prompt: 'Start New Session: "Long, idle session"' };
		const actionResponse = { result: createStaleSessionWarningActionResult(actionMetadata) };
		const after = { prompt: 'after' };

		expect(removeStaleSessionWarningHistory([before, actionRequest, actionResponse, after] as never)).toEqual([before, after]);
	});
});

function createConfigurationService(overrides: Record<string, unknown> = {}): IConfigurationService {
	const partial: Pick<IConfigurationService, 'getConfig'> = {
		getConfig<T>(key: Config<T>): T {
			return (overrides[key.fullyQualifiedId] ?? key.defaultValue) as T;
		},
	};
	return partial as IConfigurationService;
}
