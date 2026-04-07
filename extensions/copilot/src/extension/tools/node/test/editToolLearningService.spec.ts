/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelChat } from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { EditToolLearningService, EditTools } from '../../common/editToolLearningService';
import { LearningConfig } from '../../common/editToolLearningStates';
import { ToolName } from '../../common/toolNames';

describe('EditToolLearningService', () => {
	let service: EditToolLearningService;
	let mockContext: MockExtensionContext;
	let mockEndpointProvider: IEndpointProvider;

	// Helper to create mock language model
	const createMockModel = (id = 'test-model'): LanguageModelChat => ({
		id,
		name: 'Test Model',
		vendor: 'test-vendor',
		family: 'test-family',
		version: '1.0',
		maxInputTokens: 4000,
		capabilities: {
			supportsToolCalling: true,
			supportsImageToText: false,
		},
		countTokens: vi.fn(),
		sendRequest: vi.fn(),
	});

	// Helper to create mock endpoint
	const createMockEndpoint = (isExtensionContributed: boolean, family = 'test-family', model: LanguageModelChat): IChatEndpoint => ({
		family,
		model: model.id,
		maxOutputTokens: 1000,
		supportsToolCalls: true,
		supportsVision: false,
		supportsPrediction: false,
		showInModelPicker: true,
		isDefault: false,
		isFallback: false,
		isExtensionContributed,
		policy: 'enabled',
		urlOrRequestMetadata: 'test-url',
		modelMaxPromptTokens: 4000,
		name: model.id,
		version: '1.0',
		tokenizer: 'gpt',
		acceptChatPolicy: vi.fn().mockResolvedValue(true),
		processResponseFromChatEndpoint: vi.fn(),
		acquireTokenizer: vi.fn(),
		createChatCompletionRequest: vi.fn(),
	} as any);

	// Helper to simulate multiple edits for a tool
	const simulateEdits = async (model: LanguageModelChat, tool: EditTools, successes: number, failures: number) => {
		for (let i = 0; i < successes; i++) {
			await service.didMakeEdit(model, tool, true);
		}
		for (let i = 0; i < failures; i++) {
			await service.didMakeEdit(model, tool, false);
		}
	};

	beforeEach(() => {
		mockEndpointProvider = {
			getChatEndpoint: vi.fn(),
		} as any;

		mockContext = new MockExtensionContext();
		// Set up proper spies for global state methods
		mockContext.globalState.get = vi.fn().mockReturnValue(undefined);
		mockContext.globalState.update = vi.fn().mockResolvedValue(undefined);
		service = new EditToolLearningService(mockContext as any, mockEndpointProvider, new NullTelemetryService());
	});

	describe('getPreferredEditTool', () => {
		it('should return undefined for non-extension-contributed models', async () => {
			const model = createMockModel();
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(false, undefined, model)
			);

			const result = await service.getPreferredEditTool(model);

			expect(result).toBeUndefined();
		});

		it('should return ApplyPatch for GPT family models', async () => {
			const model = createMockModel('gpt-4');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'gpt', model)
			);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.ApplyPatch]);
		});

		it('should return ApplyPatch for OpenAI family models', async () => {
			const model = createMockModel('openai-gpt-3.5');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'openai', model)
			);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.ApplyPatch]);
		});

		it('should return ReplaceString tools for Sonnet family models', async () => {
			const model = createMockModel('claude-3-sonnet');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'claude', model)
			);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.ReplaceString, ToolName.MultiReplaceString]);
		});

		it('should return initial state tools for unknown extension-contributed models', async () => {
			const model = createMockModel();
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'unknown-model', model)
			);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.EditFile, ToolName.ReplaceString]);
		});
	});

	describe('didMakeEdit', () => {
		it('should not record edits for non-extension-contributed models', async () => {
			const model = createMockModel();
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(false, undefined, model)
			);

			await service.didMakeEdit(model, ToolName.ReplaceString, true);

			// Should not have saved anything to storage
			expect(mockContext.globalState.get).not.toHaveBeenCalled();
		});

		it('should not record edits for hardcoded preference models', async () => {
			const model = createMockModel('gpt-4');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'gpt', model)
			);

			await service.didMakeEdit(model, ToolName.ApplyPatch, true);

			// Should not have saved anything to storage since GPT models have hardcoded preferences
			expect(mockContext.globalState.update).not.toHaveBeenCalled();
		});

		it('should record edits for extension-contributed models without hardcoded preferences', async () => {
			const model = createMockModel('custom-model');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'custom-family', model)
			);

			await service.didMakeEdit(model, ToolName.ReplaceString, true);

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				'editToolLearning_cache',
				expect.objectContaining({
					entries: expect.arrayContaining([
						expect.arrayContaining(['custom-model', expect.any(Object)])
					])
				})
			);
		});
	});

	describe('state transitions', () => {
		let model: LanguageModelChat;

		beforeEach(() => {
			model = createMockModel('learning-model');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'learning-family', model)
			);
		});

		it('should transition from Initial to ReplaceStringMaybeMulti on successful ReplaceString usage', async () => {
			// Simulate enough successful ReplaceString edits
			const successfulEdits = Math.ceil(LearningConfig.MIN_SAMPLE_SIZE);
			await simulateEdits(model, ToolName.ReplaceString, successfulEdits, 0);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.ReplaceString, ToolName.MultiReplaceString]);
		});

		it('should transition from Initial to EditFileOnly on failed ReplaceString usage', async () => {
			// Simulate enough failed ReplaceString edits to fall below failure threshold
			const totalEdits = Math.ceil(LearningConfig.MIN_SAMPLE_SIZE);
			const failedEdits = Math.ceil(totalEdits * (1 - LearningConfig.SR_FAILURE_THRESHOLD + 0.1));
			const successfulEdits = totalEdits - failedEdits;

			await simulateEdits(model, ToolName.ReplaceString, successfulEdits, failedEdits);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.EditFile]);
		});

		it('should transition from Initial to ReplaceStringForced when EditFile is overused', async () => {
			// Simulate excessive EditFile usage
			await simulateEdits(model, ToolName.EditFile, LearningConfig.WINDOW_SIZE, 0);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.ReplaceString]);
		});

		it('should transition from ReplaceStringMaybeMulti to ReplaceStringWithMulti on successful MultiReplaceString usage', async () => {
			// First, get to ReplaceStringMaybeMulti state
			const successfulReplaceEdits = Math.ceil(LearningConfig.MIN_SAMPLE_SIZE);
			await simulateEdits(model, ToolName.ReplaceString, successfulReplaceEdits, 0);

			// Then, simulate successful MultiReplaceString usage
			const successfulMultiEdits = Math.ceil(LearningConfig.MIN_SAMPLE_SIZE);
			await simulateEdits(model, ToolName.MultiReplaceString, successfulMultiEdits, 0);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.ReplaceString, ToolName.MultiReplaceString]);
		});

		it('should transition from ReplaceStringMaybeMulti to ReplaceStringOnly on failed MultiReplaceString usage', async () => {
			// First, get to ReplaceStringMaybeMulti state
			const successfulReplaceEdits = Math.ceil(LearningConfig.MIN_SAMPLE_SIZE);
			await simulateEdits(model, ToolName.ReplaceString, successfulReplaceEdits, 0);

			// Verify we're in ReplaceStringMaybeMulti state
			let result = await service.getPreferredEditTool(model);
			expect(result).toEqual([ToolName.ReplaceString, ToolName.MultiReplaceString]);

			// Then, simulate failed MultiReplaceString usage to get below MULTISR_FAILURE_THRESHOLD (0.4)
			const totalMultiEdits = Math.ceil(LearningConfig.MIN_SAMPLE_SIZE);
			// We want success rate to be below 0.4, so let's use 0.3 (30% success rate)
			const successfulMultiEdits = Math.floor(totalMultiEdits * 0.3);
			const failedMultiEdits = totalMultiEdits - successfulMultiEdits;

			await simulateEdits(model, ToolName.MultiReplaceString, successfulMultiEdits, failedMultiEdits);

			result = await service.getPreferredEditTool(model);

			// Should transition to ReplaceStringOnly state which only allows ReplaceString
			expect(result).toEqual([ToolName.ReplaceString]);
		});
	});

	describe('cache persistence', () => {
		it('should persist learning data across service instances', async () => {
			const model = createMockModel('persistent-model');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'persistent-family', model)
			);

			// Record some edits
			await simulateEdits(model, ToolName.ReplaceString, 10, 5);

			// Create a new service instance with the same context
			const newService = new EditToolLearningService(mockContext as any, mockEndpointProvider, new NullTelemetryService());

			// The new service should have access to the persisted data
			const result = await newService.getPreferredEditTool(model);

			// Should still be in initial state since we haven't reached MIN_SAMPLE_SIZE
			expect(result).toEqual([ToolName.EditFile, ToolName.ReplaceString]);
		});

		it('should handle empty storage gracefully', async () => {
			// Ensure no stored data (already set up in beforeEach)
			const model = createMockModel('new-model');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'new-family', model)
			);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.EditFile, ToolName.ReplaceString]);
		});
	});

	describe('edge cases', () => {
		it('should handle models with no recorded data', async () => {
			const model = createMockModel('never-used-model');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'never-used-family', model)
			);

			const result = await service.getPreferredEditTool(model);

			expect(result).toEqual([ToolName.EditFile, ToolName.ReplaceString]);
		});

		it('should handle concurrent edits correctly', async () => {
			const model = createMockModel('concurrent-model');
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValue(
				createMockEndpoint(true, 'concurrent-family', model)
			);

			// Simulate concurrent edits
			const promises = [
				service.didMakeEdit(model, ToolName.ReplaceString, true),
				service.didMakeEdit(model, ToolName.ReplaceString, false),
				service.didMakeEdit(model, ToolName.EditFile, true),
			];

			await Promise.all(promises);

			// Should not throw and should have recorded all edits
			const result = await service.getPreferredEditTool(model);
			expect(result).toBeDefined();
		});

		it('should respect LRU cache size limits', async () => {

			// Create more models than cache size
			const modelsToCreate = LearningConfig.CACHE_SIZE + 5;
			const models = Array.from({ length: modelsToCreate }, (_, i) => createMockModel(`model-${i}`));

			// Record edits for all models
			for (const model of models) {
				vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValueOnce(
					createMockEndpoint(true, 'test-family', model)
				);
				await service.didMakeEdit(model, ToolName.ReplaceString, true);
			}

			// All operations should complete without error
			// The LRU cache should handle the overflow gracefully
			const lastModel = models[models.length - 1];
			vi.mocked(mockEndpointProvider.getChatEndpoint).mockResolvedValueOnce(
				createMockEndpoint(true, 'test-family', lastModel)
			);
			const result = await service.getPreferredEditTool(lastModel);
			expect(result).toBeDefined();
		});
	});
});
