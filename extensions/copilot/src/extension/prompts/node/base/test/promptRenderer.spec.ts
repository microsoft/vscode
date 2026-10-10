/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, OutputMode } from '@vscode/prompt-tsx';
import { describe, expect, test, vi } from 'vitest';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { IRequestLogger } from '../../../../../platform/requestLogger/common/requestLogger';
import { ITokenizerProvider } from '../../../../../platform/tokenizer/node/tokenizer';
import { Event } from '../../../../../util/vs/base/common/event';
import { ITokenizer } from '../../../../../util/common/tokenizer';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { CompositeElement } from '../common';
import { PromptRenderer, renderPromptElementJSON } from '../promptRenderer';

const renderError = new Error('render failed');

class ThrowingElement extends PromptElement<BasePromptElementProps> {
	render(): never {
		throw renderError;
	}
}

class ThrowingEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = Event.None;
	async getChatEndpoint(): Promise<never> { throw new Error('no utility model'); }
	async getEmbeddingsEndpoint(): Promise<never> { throw new Error('not implemented'); }
	async getAllChatEndpoints(): Promise<never[]> { return []; }
	async getAllCompletionModels(): Promise<never[]> { return []; }
}

describe('renderPromptElementJSON', () => {
	test('falls back to a stub endpoint when no utility model is available', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(IEndpointProvider, new ThrowingEndpointProvider());
		const accessor = testingServiceCollection.createTestingAccessor();

		const result = await renderPromptElementJSON(
			accessor.get(IInstantiationService),
			CompositeElement,
			{},
		);

		expect(result.node).toBeDefined();
	});
});

describe('PromptRenderer', () => {
	test('disposes the hydrated service when render fails', async () => {
		const dispose = vi.fn();
		const instantiationService = {
			createInstance: (ctor: new (...args: any[]) => unknown, ...args: any[]) => new ctor(...args),
			dispose,
		} as unknown as IInstantiationService;
		const tokenizer = {
			mode: OutputMode.Raw,
			tokenLength: async () => 1,
			countMessageTokens: async () => 1,
			countMessagesTokens: async () => 1,
			countToolTokens: async () => 1,
		} as unknown as ITokenizer;
		const endpoint = { tokenizer: 'cl100k_base' } as unknown as IChatEndpoint;
		const tokenizerProvider = { acquireTokenizer: () => tokenizer } as unknown as ITokenizerProvider;
		const requestLogger = { addPromptTrace: vi.fn() } as unknown as IRequestLogger;
		const logService = { warn: vi.fn() };
		const configurationService = { getConfig: () => false } as unknown as IConfigurationService;
		const renderer = new PromptRenderer(
			instantiationService,
			endpoint,
			ThrowingElement,
			{},
			tokenizerProvider,
			requestLogger,
			logService as any,
			configurationService,
		);

		await expect(renderer.render()).rejects.toBe(renderError);
		expect(dispose).toHaveBeenCalledOnce();
	});
});
