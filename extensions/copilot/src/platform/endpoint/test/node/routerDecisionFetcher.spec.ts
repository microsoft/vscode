/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, vi } from 'vitest';
import { RouterDecisionFetcher } from '../../node/routerDecisionFetcher';

describe('RouterDecisionFetcher', () => {
	test('includes copilot_plan in request body from rawCopilotPlan', async () => {
		let capturedBody: string | undefined;

		const mockAuthService = {
			getCopilotToken: vi.fn().mockResolvedValue({
				token: 'test-token',
				rawCopilotPlan: 'individual_edu',
				copilotPlan: 'individual', // normalized — should NOT be used
			}),
			onDidChangeCopilotToken: vi.fn(),
		};

		const mockResponse = {
			ok: true,
			text: vi.fn().mockResolvedValue(JSON.stringify({
				predicted_label: 'no_reasoning',
				confidence: 0.9,
				latency_ms: 10,
				candidate_models: ['gpt-4.1'],
				scores: { needs_reasoning: 0.1, no_reasoning: 0.9 },
			})),
		};

		const mockCapiClient = {
			makeRequest: vi.fn().mockImplementation((opts: { body?: string }) => {
				capturedBody = opts.body;
				return Promise.resolve(mockResponse);
			}),
		};

		const mockLogService = {
			trace: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		};

		const mockTelemetryService = {
			sendMSFTTelemetryEvent: vi.fn(),
			sendEnhancedGHTelemetryEvent: vi.fn(),
		};

		const mockRequestLogger = {
			addEntry: vi.fn(),
		};

		const fetcher = new RouterDecisionFetcher(
			mockCapiClient as any,
			mockAuthService as any,
			mockLogService as any,
			mockTelemetryService as any,
			mockRequestLogger as any,
		);

		await fetcher.getRouterDecision(
			'what is 2+2',
			'session-token',
			['gpt-4.1', 'claude-haiku-4.5'],
		);

		expect(capturedBody).toBeDefined();
		const parsed = JSON.parse(capturedBody!);
		expect(parsed.copilot_plan).toBe('individual_edu');
		expect(parsed.prompt).toBe('what is 2+2');
		expect(parsed.available_models).toEqual(['gpt-4.1', 'claude-haiku-4.5']);
	});
});
