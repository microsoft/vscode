/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SinonSandbox, createSandbox } from 'sinon';
import { LanguageModelChat, lm } from 'vscode';
import { CHAT_MODEL, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../platform/configuration/test/common/inMemoryConfigurationService';
import { DefaultsOnlyConfigurationService } from '../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { IModelMetadataFetcher } from '../../../platform/endpoint/node/modelMetadataFetcher';
import { CopilotChatEndpoint } from '../../../platform/endpoint/node/copilotChatEndpoint';
import { ExtensionContributedChatEndpoint } from '../../../platform/endpoint/vscode-node/extChatEndpoint';
import { ITestingServicesAccessor } from '../../../platform/test/node/services';
import { TokenizerType } from '../../../util/common/tokenizer';
import { Event } from '../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ProductionEndpointProvider } from '../../prompt/vscode-node/endpointProviderImpl';
import { createExtensionTestingServices } from './services';

class FakeModelMetadataFetcher implements IModelMetadataFetcher {
	public onDidModelsRefresh = Event.None;
	async getAllChatModels(): Promise<IChatModelInformation[]> {
		return [];
	}
	async getAllCompletionModels(forceRefresh: boolean): Promise<ICompletionModelInformation[]> {
		return [];
	}
	async getChatModelFromApiModel(model: LanguageModelChat): Promise<IChatModelInformation | undefined> {
		return undefined;
	}
	async getCopilotUtilityModel(): Promise<IChatModelInformation> {
		return this._fakeChatModel('copilot-utility');
	}
	async getChatModelFromCapiFamily(family: string): Promise<IChatModelInformation> {
		return this._fakeChatModel(family);
	}

	private _fakeChatModel(modelId: string): IChatModelInformation {
		return {
			id: modelId,
			vendor: 'fake-vendor',
			name: 'fake-name',
			version: 'fake-version',
			model_picker_enabled: false,
			is_chat_default: false,
			is_chat_fallback: false,
			capabilities: {
				supports: { streaming: true },
				type: 'chat',
				tokenizer: TokenizerType.O200K,
				family: 'fake-family'
			}
		};
	}

	async getEmbeddingsModel(): Promise<IEmbeddingModelInformation> {
		return {
			id: 'text-embedding-3-small',
			name: 'fake-name',
			vendor: 'fake-vendor',
			version: 'fake-version',
			model_picker_enabled: false,
			is_chat_default: false,
			is_chat_fallback: false,
			capabilities: {
				type: 'embeddings',
				tokenizer: TokenizerType.O200K,
				family: 'text-embedding-3-small',
				limits: { max_inputs: 256 }
			}
		};
	}
}

suite('Endpoint Class Test', function () {
	let accessor: ITestingServicesAccessor;
	let endpointProvider: ProductionEndpointProvider;
	let sandbox: SinonSandbox;

	setup(() => {
		accessor = createExtensionTestingServices().createTestingAccessor();
		endpointProvider = accessor.get(IInstantiationService).createInstance(ProductionEndpointProvider);
		sandbox = createSandbox();
		//@ts-expect-error
		sandbox.replace(endpointProvider, '_modelFetcher', new FakeModelMetadataFetcher());
	});

	teardown(() => {
		sandbox.restore();
	});

	test('Model names have proper casing', async function () {
		assert.strictEqual(CHAT_MODEL.GPT41, 'gpt-4.1-2025-04-14', 'Incorrect GPT 41 model name, changing this will break requests.');
		assert.strictEqual(CHAT_MODEL.GPT4OMINI, 'gpt-4o-mini', 'Incorrect GPT 4o mini model name, changing this will break requests.');
	});
});

class CopilotMatchableModelMetadataFetcher implements IModelMetadataFetcher {
	public onDidModelsRefresh = Event.None;
	constructor(private readonly _models: IChatModelInformation[]) { }
	async getAllChatModels(): Promise<IChatModelInformation[]> {
		return this._models;
	}
	async getAllCompletionModels(): Promise<ICompletionModelInformation[]> {
		return [];
	}
	async getChatModelFromApiModel(): Promise<IChatModelInformation | undefined> {
		return undefined;
	}
	async getCopilotUtilityModel(): Promise<IChatModelInformation> {
		return makeChatModel('copilot-utility');
	}
	async getChatModelFromCapiFamily(family: string): Promise<IChatModelInformation> {
		return makeChatModel(family);
	}
	async getEmbeddingsModel(): Promise<IEmbeddingModelInformation> {
		return {
			id: 'text-embedding-3-small',
			name: 'fake-name',
			vendor: 'fake-vendor',
			version: 'fake-version',
			model_picker_enabled: false,
			is_chat_default: false,
			is_chat_fallback: false,
			capabilities: {
				type: 'embeddings',
				tokenizer: TokenizerType.O200K,
				family: 'text-embedding-3-small',
				limits: { max_inputs: 256 }
			}
		};
	}
}

function makeChatModel(modelId: string, overrides: Partial<IChatModelInformation> = {}): IChatModelInformation {
	return {
		id: modelId,
		vendor: 'copilot',
		name: `name-${modelId}`,
		version: 'fake-version',
		model_picker_enabled: false,
		is_chat_default: false,
		is_chat_fallback: false,
		capabilities: {
			supports: { streaming: true },
			type: 'chat',
			tokenizer: TokenizerType.O200K,
			family: 'fake-family',
		},
		...overrides,
	};
}

suite('ProductionEndpointProvider — utility model overrides', () => {
	let configService: InMemoryConfigurationService;
	let endpointProvider: ProductionEndpointProvider;
	let sandbox: SinonSandbox;

	setup(() => {
		const collection = createExtensionTestingServices();
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		collection.define(IConfigurationService, configService);
		const accessor = collection.createTestingAccessor();
		endpointProvider = accessor.get(IInstantiationService).createInstance(ProductionEndpointProvider);
		sandbox = createSandbox();
	});

	teardown(() => {
		sandbox.restore();
	});

	function setFetcher(models: IChatModelInformation[]): void {
		// @ts-expect-error — replacing private member for the test.
		endpointProvider._modelFetcher = new CopilotMatchableModelMetadataFetcher(models);
	}

	function makeFakeLanguageModelChat(overrides: Partial<LanguageModelChat>): LanguageModelChat {
		return {
			id: 'fake-id',
			vendor: 'fake-vendor',
			name: 'fake-name',
			family: 'fake-family',
			version: 'fake-version',
			maxInputTokens: 100_000,
			capabilities: { supportsToolCalling: false, supportsImageToText: false },
			...overrides,
		} as LanguageModelChat;
	}

	test('no override configured — falls through to default copilot-utility resolution', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});

	test('copilot-vendor override resolves to the matching model from the model fetcher', async () => {
		setFetcher([makeChatModel('copilot-utility'), makeChatModel('gpt-4o-mini')]);
		await configService.setNonExtensionConfig('chat.utilityModel', 'copilot/gpt-4o-mini');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.ok(endpoint instanceof CopilotChatEndpoint);
		assert.strictEqual(endpoint.model, 'gpt-4o-mini');
	});

	test('copilot-vendor override falls back to default when no copilot model matches', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		await configService.setNonExtensionConfig('chat.utilityModel', 'copilot/gpt-4o-mini');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});

	test('copilot-vendor override falls back to default when more than one copilot model matches (ambiguous)', async () => {
		setFetcher([
			makeChatModel('copilot-utility'),
			makeChatModel('gpt-4o-mini'),
			makeChatModel('gpt-4o-mini'),
		]);
		await configService.setNonExtensionConfig('chat.utilityModel', 'copilot/gpt-4o-mini');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});

	test('malformed override falls back to default', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		await configService.setNonExtensionConfig('chat.utilityModel', 'no-slash');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});

	test('non-string override values fall back to default and do not throw', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		// Users can hand-edit settings.json with arbitrary JSON; the
		// `getNonExtensionConfig<string>` API is only a TS cast.
		await configService.setNonExtensionConfig('chat.utilityModel', 42 as unknown as string);

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});

	test('configuration change fires onDidModelsRefresh so cached endpoints get invalidated', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		let refreshCount = 0;
		const sub = endpointProvider.onDidModelsRefresh(() => refreshCount++);
		try {
			await configService.setNonExtensionConfig('chat.utilityModel', 'copilot/gpt-4o-mini');
			await configService.setNonExtensionConfig('chat.utilitySmallModel', 'copilot/gpt-4o-mini');
			assert.strictEqual(refreshCount, 2);
		} finally {
			sub.dispose();
		}
	});

	test('non-copilot vendor override resolves to an extension-contributed endpoint', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		const fakeModel = makeFakeLanguageModelChat({ vendor: 'anthropic', id: 'claude-haiku-4.5' });
		sandbox.stub(lm, 'selectChatModels').resolves([fakeModel]);
		await configService.setNonExtensionConfig('chat.utilityModel', 'anthropic/claude-haiku-4.5');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.ok(endpoint instanceof ExtensionContributedChatEndpoint);
		assert.strictEqual(endpoint.model, 'claude-haiku-4.5');
	});

	test('non-copilot vendor override falls back when lm.selectChatModels returns no matches', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		sandbox.stub(lm, 'selectChatModels').resolves([]);
		await configService.setNonExtensionConfig('chat.utilityModel', 'anthropic/claude-haiku-4.5');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});

	test('non-copilot vendor override falls back when lm.selectChatModels returns multiple matches (ambiguous)', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		const m1 = makeFakeLanguageModelChat({ vendor: 'anthropic', id: 'claude-haiku-4.5' });
		const m2 = makeFakeLanguageModelChat({ vendor: 'anthropic', id: 'claude-haiku-4.5' });
		sandbox.stub(lm, 'selectChatModels').resolves([m1, m2]);
		await configService.setNonExtensionConfig('chat.utilityModel', 'anthropic/claude-haiku-4.5');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});

	test('non-copilot vendor override falls back when lm.selectChatModels throws', async () => {
		setFetcher([makeChatModel('copilot-utility')]);
		sandbox.stub(lm, 'selectChatModels').rejects(new Error('boom'));
		await configService.setNonExtensionConfig('chat.utilityModel', 'anthropic/claude-haiku-4.5');

		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		assert.strictEqual(endpoint.model, 'copilot-utility');
	});
});
