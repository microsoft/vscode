/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../contrib/chat/common/languageModels.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILocalAIService } from '../common/localAI.js';
import { LocalAIService } from './localAIService.js';
import { LocalAIModelProvider } from './localAIModelProvider.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { localize2 } from '../../../../nls.js';

/**
 * Register the Local AI service
 */
registerSingleton(ILocalAIService, LocalAIService, InstantiationType.Delayed);

/**
 * Workbench contribution that registers the local AI model provider
 */
class LocalAIProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.localAIProvider';

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		// Wait for extensions to be ready before registering the provider
		this.initializeProvider();
	}

	private async initializeProvider(): Promise<void> {
		console.log('[LocalAI] Waiting for extension service to be ready...');

		// Wait for the extension service to finish activating extensions
		await this.extensionService.whenInstalledExtensionsRegistered();

		console.log('[LocalAI] Extension service ready, registering provider...');

		// Register the local AI model provider with the language models service
		this.registerProvider();
	}

	private registerProvider(): void {
		console.log('[LocalAI] Registering local AI model provider...');

		// Create the provider instance
		const provider = this.instantiationService.createInstance(LocalAIModelProvider);

		// Register the provider with vendor 'local'
		// Note: The vendor must be registered in package.json contributes.languageModelChatProviders
		try {
			const registration = this.languageModelsService.registerLanguageModelProvider('local', provider);
			console.log('[LocalAI] Successfully registered local AI provider');

			this._register(registration);
			this._register(provider);
		} catch (error) {
			console.error('[LocalAI] Failed to register provider:', error);
		}
	}
}

/**
 * Register the contribution to run during workbench initialization
 * Use AfterRestored to ensure extensions (including our vendor registration) are loaded first
 */
registerWorkbenchContribution2(
	LocalAIProviderContribution.ID,
	LocalAIProviderContribution,
	WorkbenchPhase.AfterRestored
);

/**
 * Test command to list all available language models
 */
class ListLanguageModelsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.listLanguageModels',
			title: localize2('listLanguageModels', 'List All Language Models'),
			category: localize2('chatCategory', 'Chat'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const languageModelsService = accessor.get(ILanguageModelsService);
		const quickInputService = accessor.get(IQuickInputService);

		console.log('[LocalAI Test] Listing all language models...');

		// Get vendors BEFORE resolving
		const vendors = languageModelsService.getVendors();
		console.log('[LocalAI Test] Vendors (before resolve):', vendors);

		// IMPORTANT: selectLanguageModels triggers the provider's provideLanguageModelChatInfo
		// This populates the model cache
		console.log('[LocalAI Test] Resolving models from all vendors...');
		await languageModelsService.selectLanguageModels({});

		// NOW get all model IDs (from the populated cache)
		const modelIds = languageModelsService.getLanguageModelIds();
		console.log('[LocalAI Test] Model IDs (after resolve):', modelIds);

		// Show in quick pick
		const items = modelIds.map(id => {
			const model = languageModelsService.lookupLanguageModel(id);
			return {
				label: model?.name || id,
				description: `Vendor: ${model?.vendor}, Family: ${model?.family}`,
				detail: model?.tooltip
			};
		});

		if (items.length === 0) {
			console.warn('[LocalAI Test] No models found!');
		}

		await quickInputService.pick(items, {
			placeHolder: 'Available Language Models',
			canPickMany: false
		});
	}
}

registerAction2(ListLanguageModelsAction);

/**
 * Test command to directly invoke the local AI model
 */
class TestLocalAIModelAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.testLocalAI',
			title: localize2('testLocalAI', 'Test Local AI Model (Direct)'),
			category: localize2('chatCategory', 'Chat'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const languageModelsService = accessor.get(ILanguageModelsService);
		const quickInputService = accessor.get(IQuickInputService);

		console.log('[LocalAI Test] Testing local AI model directly...');

		// Select local models
		const modelIds = await languageModelsService.selectLanguageModels({ vendor: 'local' });
		console.log('[LocalAI Test] Found local models:', modelIds);

		if (modelIds.length === 0) {
			await quickInputService.input({
				prompt: 'No local models found. Make sure WebGPU is available.',
				value: 'WebGPU might not be available in your environment.'
			});
			return;
		}

		// Get the first local model
		const modelId = modelIds[0];
		const modelMetadata = languageModelsService.lookupLanguageModel(modelId);
		console.log('[LocalAI Test] Using model:', modelId, modelMetadata);

		// Get user input
		const userMessage = await quickInputService.input({
			prompt: `Testing ${modelMetadata?.name || modelId}. Enter your message:`,
			value: 'Hello! Tell me a joke.'
		});

		if (!userMessage) {
			return;
		}

		console.log('[LocalAI Test] Sending message:', userMessage);

		try {
			// Send a chat request using the language model API
			const request = await languageModelsService.sendChatRequest(
				modelId,
				new ExtensionIdentifier('vscode.local-ai'),
				[{
					role: ChatMessageRole.User,
					content: [{ type: 'text', value: userMessage }]
				}],
				{},
				CancellationToken.None
			);

			console.log('[LocalAI Test] Request sent, waiting for response...');

			// Collect the response
			let fullResponse = '';
			for await (const part of request.stream) {
				if (Array.isArray(part)) {
					// Handle array of parts
					for (const p of part) {
						if (p.type === 'text' && typeof (p as { value?: string }).value === 'string') {
							fullResponse += (p as { value: string }).value;
							console.log('[LocalAI Test] Received chunk:', (p as { value: string }).value);
						}
					}
				} else if (part && part.type === 'text' && typeof (part as { value?: string }).value === 'string') {
					// Handle single part
					fullResponse += (part as { value: string }).value;
					console.log('[LocalAI Test] Received chunk:', (part as { value: string }).value);
				}
			}

			console.log('[LocalAI Test] Full response:', fullResponse);

			// Show the response in a quick pick
			await quickInputService.pick([{
				label: 'Response from Local AI',
				description: fullResponse || '(empty response)',
				detail: `Model: ${modelMetadata?.name || modelId}`
			}], {
				placeHolder: 'Local AI Response'
			});

		} catch (error) {
			console.error('[LocalAI Test] Error:', error);
			await quickInputService.input({
				prompt: 'Error occurred',
				value: String(error)
			});
		}
	}
}

registerAction2(TestLocalAIModelAction);
