/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelChat, LanguageModelChatMessage, LanguageModelChatMessage2 } from 'vscode';
import { afterEach, describe, expect, it } from 'vitest';
import { createExtensionUnitTestingServices } from '../../../../extension/test/node/services';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ExtensionContributedChatEndpoint } from '../extChatEndpoint';

class MockLanguageModelChat implements Partial<LanguageModelChat> {
	readonly id = 'test-model';
	readonly vendor = 'customoai';
	readonly name = 'Test Model';
	readonly version = '1.0';
	readonly family = 'test-family';
	readonly maxInputTokens = 4096;
	readonly maxOutputTokens = 2048;
	readonly capabilities = { supportsToolCalling: true } as LanguageModelChat['capabilities'];

	countTokens(_input: string | LanguageModelChatMessage | LanguageModelChatMessage2): Thenable<number> {
		return Promise.resolve(17);
	}

	sendRequest(): Thenable<never> {
		throw new Error('not implemented');
	}
}

describe('ExtensionContributedChatEndpoint', () => {
	const disposables = new DisposableStore();

	afterEach(() => {
		disposables.clear();
	});

	it('should clone with a max prompt token override without stripping language model prototype methods', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices(disposables);
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instaService = accessor.get(IInstantiationService);
		const endpoint = instaService.createInstance(ExtensionContributedChatEndpoint, new MockLanguageModelChat() as LanguageModelChat);

		const clone = endpoint.cloneWithTokenOverride(1234);
		const tokenLength = await clone.acquireTokenizer().tokenLength('hello');

		expect({
			original: endpoint.modelMaxPromptTokens,
			clone: clone.modelMaxPromptTokens,
			tokenLength
		}).toEqual({
			original: 4096,
			clone: 1234,
			tokenLength: 17
		});
	});
});
