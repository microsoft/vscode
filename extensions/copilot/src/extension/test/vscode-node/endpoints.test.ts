/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SinonSandbox, createSandbox } from 'sinon';
import { LanguageModelChat } from 'vscode';
import { CHAT_MODEL } from '../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { IModelMetadataFetcher } from '../../../platform/endpoint/node/modelMetadataFetcher';
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
	async getChatModelFromFamily(modelId: string): Promise<IChatModelInformation> {
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
