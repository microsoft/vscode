/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, expect, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ICopilotTokenStore } from '../../../../platform/authentication/common/copilotTokenStore';
import { ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../../platform/log/common/logService';
import { IRequestLogger } from '../../../../platform/requestLogger/common/requestLogger';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { PromptCategorizerService } from '../promptCategorizer';

vi.mock('../../../prompts/node/base/promptRenderer', async importOriginal => {
	const actual = await importOriginal<typeof import('../../../prompts/node/base/promptRenderer')>();
	return {
		...actual,
		renderPromptElement: vi.fn(async () => ({
			messages: [],
			tokenCount: 0,
			metadatas: new Map(),
			references: [],
		})),
	};
});

suite('PromptCategorizerService', () => {
	let endpointProvider: { getChatEndpoint: ReturnType<typeof vi.fn> };
	let requestLogger: { captureInvocation: ReturnType<typeof vi.fn> };
	let telemetryService: {
		sendMSFTTelemetryEvent: ReturnType<typeof vi.fn>;
		sendInternalMSFTTelemetryEvent: ReturnType<typeof vi.fn>;
	};
	let logService: {
		debug: ReturnType<typeof vi.fn>;
		warn: ReturnType<typeof vi.fn>;
		error: ReturnType<typeof vi.fn>;
	};
	let service: PromptCategorizerService;

	beforeEach(() => {
		endpointProvider = {
			getChatEndpoint: vi.fn(),
		};

		requestLogger = {
			captureInvocation: vi.fn(),
		};

		telemetryService = {
			sendMSFTTelemetryEvent: vi.fn(),
			sendInternalMSFTTelemetryEvent: vi.fn(),
		};

		logService = {
			debug: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		};

		const experimentationService = {
			getTreatmentVariable: vi.fn().mockReturnValue(true),
		};

		const tabsAndEditorsService = {
			activeTextEditor: undefined,
		};

		const copilotTokenStore = {
			copilotToken: { isInternal: true },
		};

		service = new PromptCategorizerService(
			logService as unknown as ILogService,
			endpointProvider as unknown as IEndpointProvider,
			{} as IInstantiationService,
			telemetryService as unknown as ITelemetryService,
			experimentationService as unknown as IExperimentationService,
			tabsAndEditorsService as unknown as ITabsAndEditorsService,
			copilotTokenStore as unknown as ICopilotTokenStore,
			requestLogger as unknown as IRequestLogger,
		);
	});

	test('skips prompt categorization when main endpoint is BYOK', async () => {
		const request = {
			location2: undefined,
			subAgentName: undefined,
			attempt: 0,
			prompt: 'help me debug this',
			references: [],
			toolReferences: [],
			sessionId: 'test-session-id',
			id: 'test-request-id',
		} as unknown as vscode.ChatRequest;

		const context = {
			history: [],
		} as unknown as vscode.ChatContext;

		endpointProvider.getChatEndpoint.mockResolvedValue({
			urlOrRequestMetadata: 'https://byok.example/v1/chat/completions',
		});

		service.categorizePrompt(request, context, 'telemetry-message-id');

		// categorizePrompt is fire-and-forget; allow the async branch to complete
		await new Promise(setImmediate);

		expect(endpointProvider.getChatEndpoint).toHaveBeenCalledTimes(1);
		expect(endpointProvider.getChatEndpoint).toHaveBeenCalledWith(request);
		expect(logService.debug).toHaveBeenCalledWith('[PromptCategorizer] Skipping categorization because main model is BYOK');
		expect(requestLogger.captureInvocation).not.toHaveBeenCalled();
		expect(telemetryService.sendMSFTTelemetryEvent).not.toHaveBeenCalled();
		expect(telemetryService.sendInternalMSFTTelemetryEvent).not.toHaveBeenCalled();
	});

	test('runs prompt categorization when main endpoint is non-BYOK', async () => {
		const request = {
			location2: undefined,
			subAgentName: undefined,
			attempt: 0,
			prompt: 'help me debug this',
			references: [],
			toolReferences: [],
			sessionId: 'test-session-id',
			id: 'test-request-id',
		} as unknown as vscode.ChatRequest;

		const context = {
			history: [],
		} as unknown as vscode.ChatContext;

		endpointProvider.getChatEndpoint
			.mockResolvedValueOnce({
				urlOrRequestMetadata: { requestPath: '/chat/completions' },
			})
			.mockResolvedValueOnce({
				urlOrRequestMetadata: { requestPath: '/chat/completions' },
				makeChatRequest2: vi.fn().mockResolvedValue({
					type: ChatFetchResponseType.Success,
				}),
			});

		requestLogger.captureInvocation.mockImplementation(async (_capturingToken, fn) => fn());

		service.categorizePrompt(request, context, 'telemetry-message-id');

		// categorizePrompt is fire-and-forget; allow the async branch to complete
		await new Promise(setImmediate);

		expect(endpointProvider.getChatEndpoint).toHaveBeenCalledTimes(2);
		expect(endpointProvider.getChatEndpoint).toHaveBeenNthCalledWith(1, request);
		expect(endpointProvider.getChatEndpoint).toHaveBeenNthCalledWith(2, 'copilot-utility-small');
		expect(requestLogger.captureInvocation).toHaveBeenCalledTimes(1);
		expect(telemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledTimes(1);
		expect(telemetryService.sendInternalMSFTTelemetryEvent).toHaveBeenCalledTimes(1);
	});
});
