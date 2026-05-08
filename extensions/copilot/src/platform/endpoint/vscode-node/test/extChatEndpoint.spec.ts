/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { ExtensionContributedChatEndpoint } from '../extChatEndpoint';

class MockLanguageModelChat implements Partial<vscode.LanguageModelChat> {
	public readonly vendor = 'mock-vendor';
	public readonly id = 'mock-id';
	public readonly name = 'Mock Model';
	public readonly version = '1.0.0';
	public readonly family = 'mock-family';
	public readonly maxInputTokens = 4096;
	public readonly capabilities = {
		supportsToolCalling: false,
		supportsImageToText: false,
		editToolsHint: [],
	};

	countTokens(input: string | vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2): Thenable<number> {
		if (typeof input === 'string') {
			return Promise.resolve(input.split(/\s+/).filter(Boolean).length);
		}

		return Promise.resolve(0);
	}
}

type EndpointConstructor = typeof ExtensionContributedChatEndpoint;
type EndpointConstructorArgs = ConstructorParameters<EndpointConstructor>;

type TestInstantiationService = {
	createInstance(
		ctor: EndpointConstructor,
		languageModel: vscode.LanguageModelChat,
		maxTokensOverride?: number
	): ExtensionContributedChatEndpoint;
};

function createInstantiationService(otelService: unknown) {
	const instantiationService: TestInstantiationService = {
		createInstance(ctor: EndpointConstructor, languageModel: vscode.LanguageModelChat, maxTokensOverride?: number): ExtensionContributedChatEndpoint {
			return new ctor(
				languageModel,
				maxTokensOverride,
				instantiationService as unknown as EndpointConstructorArgs[2],
				otelService as EndpointConstructorArgs[3]
			);
		}
	};

	return instantiationService;
}

describe('ExtensionContributedChatEndpoint', () => {
	it('cloneWithTokenOverride preserves prototype-based language model methods', async () => {
		const languageModel = new MockLanguageModelChat() as unknown as vscode.LanguageModelChat;
		const otelService = {};
		const instantiationService = createInstantiationService(otelService);

		const endpoint = instantiationService.createInstance(ExtensionContributedChatEndpoint, languageModel, undefined);
		const clonedEndpoint = endpoint.cloneWithTokenOverride(128);

		expect(endpoint.modelMaxPromptTokens).toBe(4096);
		expect(clonedEndpoint.modelMaxPromptTokens).toBe(128);
		await expect(clonedEndpoint.acquireTokenizer().tokenLength('hello world')).resolves.toBe(2);
	});
});