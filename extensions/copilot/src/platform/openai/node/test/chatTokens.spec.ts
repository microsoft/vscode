/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import assert from 'assert';
import { suite, test } from 'vitest';
import { createPlatformServices } from '../../../../platform/test/node/services';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { toTextParts } from '../../../chat/common/globalStringUtils';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { ITokenizerProvider, TokenizerProvider } from '../../../tokenizer/node/tokenizer';

suite('Chat tokens', function () {
	test('counts tokens of messages', async function () {
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.System,
				content: toTextParts(
					'You are a helpful, pattern-following assistant that translates corporate jargon into plain English.'),
			},
			{ role: Raw.ChatRole.System, name: 'example_user', content: toTextParts('New synergies will help drive top-line growth.') },
			{
				role: Raw.ChatRole.System,
				name: 'example_assistant',
				content: toTextParts('Things working well together will increase revenue.'),
			},
			{
				role: Raw.ChatRole.System,
				name: 'example_user',
				content: toTextParts(
					`Let's circle back when we have more bandwidth to touch base on opportunities for increased leverage.`),
			},
			{
				role: Raw.ChatRole.System,
				name: 'example_assistant',
				content: toTextParts(`Let's talk later when we're less busy about how to do better.`),
			},
			{
				role: Raw.ChatRole.User,
				content: toTextParts(`This late pivot means we don't have time to boil the ocean for the client deliverable.`),
			},
		];

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(ITokenizerProvider, new TokenizerProvider(false, new NullTelemetryService()));
		const accessor = testingServiceCollection.createTestingAccessor();
		const tokens = await accessor.get(ITokenizerProvider).acquireTokenizer({ tokenizer: TokenizerType.CL100K }).countMessagesTokens(messages);

		assert.deepStrictEqual(tokens, 129);
	});
});
