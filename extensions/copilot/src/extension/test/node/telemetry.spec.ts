/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { createPlatformServices } from '../../../platform/test/node/services';
import { allEvents, withTelemetryCapture } from '../../../platform/test/node/telemetry';
import { createTelemetryWithId, getCodeBlocks, sendConversationalMessageTelemetry, sendUserActionTelemetry } from '../../prompt/node/telemetry';

// TODO @lramos15 Re-enable once telemetry has been fully cleaned up
suite.skip('Conversation telemetry tests', { timeout: 10000 }, function () {

	test('Test telemetryMessage', async function () {
		// Set up inputs
		const testingServiceCollection = createPlatformServices();
		const document = undefined;
		const messageText = 'hello world!';
		const messageLen = 12;
		const prompt = 'You are a programming assistant. Respond to the question hello world!';
		const source = 'user';
		const turnIndex = 0;
		const intentClassifierScore = 1;
		const intentClassifierLatency = 10;

		// Call function
		const [messages] = await withTelemetryCapture(testingServiceCollection, async accessor => {
			const telemetryData = sendConversationalMessageTelemetry(
				accessor.get(ITelemetryService),
				document,
				ChatLocation.Panel,
				messageText,
				{ source: source, turnIndex: turnIndex.toString() },
				{
					messageCharLen: messageLen,
					promptCharLen: prompt.length,
					intentClassifierScore: intentClassifierScore,
					intentClassifierLatency: intentClassifierLatency,
				},
				createTelemetryWithId()
			);

			// Check that properties and measurements for standard telemetry are correct
			assert.strictEqual(telemetryData.properties.source, source);
			assert.strictEqual(telemetryData.properties.turnIndex, turnIndex.toString());
			assert.strictEqual(telemetryData.measurements.messageCharLen, messageText.length);
			assert.strictEqual(telemetryData.measurements.promptCharLen, prompt.length);
			assert.strictEqual(telemetryData.measurements.intentClassifierScore, intentClassifierScore);
			assert.strictEqual(telemetryData.measurements.intentClassifierLatency, intentClassifierLatency);

			// Check that enhanced telemetry fields are not in standard telemetry data
			assert(!('messageText' in telemetryData.properties));
		});

		// All of the below adapted from the ghostText telemetry integration tests
		assert.ok(allEvents(messages));
		const names = messages
			.map(message => message.data.baseData.name.split('/')[1])
			// In case we need a new Copilot token, we don't care about the messages that triggers
			.filter(name => !['auth.new_login', 'auth.new_token'].includes(name));
		// Correct events are created
		assert.deepStrictEqual(
			names.filter(name => !name.startsWith('engine.') && name !== 'log').sort(),
			['conversation.message', 'conversation.messageText'].sort()
		);
		// Correct properties are attached to the message events
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.message')
				.every(message => message.data.baseData.properties.source === source)
		);
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.message')
				.every(message => message.data.baseData.properties.turnIndex === turnIndex.toString())
		);
		// Correct measurements are attached to the message events
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.message')
				.every(message => message.data.baseData.measurements.messageCharLen === messageLen)
		);
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.message')
				.every(message => message.data.baseData.measurements.promptCharLen === prompt.length)
		);
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.message')
				.every(message => message.data.baseData.measurements.intentClassifierScore === intentClassifierScore)
		);
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.message')
				.every(message => message.data.baseData.measurements.intentClassifierLatency === intentClassifierLatency)
		);
		// Correct properties are attached to the messageText events
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.messageText')
				.every(message => message.data.baseData.properties.messageText === messageText)
		);
	});

	test('Test telemetryUserAction', async function () {
		// Set up inputs
		const testingServiceCollection = createPlatformServices();
		const document = undefined;
		const rating = 'positive';
		const messageId = '12345';
		const name = 'conversation.messageRating';

		// Call function
		const [messages] = await withTelemetryCapture(testingServiceCollection, async accessor => {
			const telemetryData = sendUserActionTelemetry(accessor.get(ITelemetryService), document, { rating: rating, messageId: messageId }, {}, name);

			// Check that properties and measurements for standard telemetry are correct
			assert.strictEqual(telemetryData.properties.rating, rating);
			assert.strictEqual(telemetryData.properties.messageId, messageId);
		});

		// All of the below adapted from the ghostText telemetry integration tests
		assert.ok(allEvents(messages));
		const names = messages
			.map(message => message.data.baseData.name.split('/')[1])
			// In case we need a new Copilot token, we don't care about the messages that triggers
			.filter(name => !['auth.new_login', 'auth.new_token'].includes(name));
		// Correct events are created
		assert.deepStrictEqual(
			names.filter(name => !name.startsWith('engine.') && name !== 'log').sort(),
			['conversation.messageRating'].sort()
		);
		// Correct properties are attached to the message events
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.messageRating')
				.every(message => message.data.baseData.properties.rating === rating)
		);
		assert.ok(
			messages
				.filter(message => message.data.baseData.name.split('/')[1] === 'conversation.messageRating')
				.every(message => message.data.baseData.properties.messageId === messageId)
		);
	});

	test('Test getCodeBlocks with no code', async function () {
		// Set up inputs
		const noCode = 'hello world';

		// Test no code case
		const noCodeResult = getCodeBlocks(noCode);
		assert.strictEqual(noCodeResult.length, 0, 'Length of no code result should be 0');
	});

	test('Test getCodeBlocks with one code block, no language', async function () {
		// Set up inputs
		const basicNoLang = '\n```\nhello world\n```';

		// Test basic no lang case
		const basicNoLangResult = getCodeBlocks(basicNoLang);
		assert.deepEqual(basicNoLangResult, [''], 'Basic no lang result should be an array with an empty string');
	});

	test('Test getCodeBlocks with one code block with language', async function () {
		// Set up inputs
		const basicWithLang = '\n```python\nhello world\n```';

		// Test basic with lang case
		const basicWithLangResult = getCodeBlocks(basicWithLang);
		assert.deepEqual(
			basicWithLangResult,
			['python'],
			'Basic with lang result should be an array with a single string'
		);
	});

	test('Test getCodeBlocks with nested code blocks', async function () {
		// Set up inputs
		const nested = '\n```\n```python\ndef hello_world():\n    print("Hello, world!")\n```\n```\n\n';

		// Test nested case
		const nestedResult = getCodeBlocks(nested);
		assert.deepEqual(
			nestedResult,
			[''],
			'Nested result should be an array with one empty string, ignoring backticks within the code block'
		);
	});

	test('Test getCodeBlocks with multiple nested code blocks', async function () {
		// Set up inputs
		const multiNested =
			'\n```\n```python\ndef hello_world():\n    print(\'Hello, world!\'\')\n```\n```\n\nThis will render as:\n\n```python\ndef hello_world():\n    print(\'Hello, world!\'\')\n```';

		// Test multi nested case
		const multiNestedResult = getCodeBlocks(multiNested);
		assert.deepEqual(
			multiNestedResult,
			['', ''],
			'Multi nested result should be an array with two empty strings, ignoring backticks within the code block'
		);
	});

	test('Test getCodeBlocks with escaped backticks', async function () {
		// Set up inputs
		const escaped =
			'\n\n\\`\\`\\`python\nprint("Hello, world!")\n\\`\\`\\`\n\nThis will produce:\n\n```python\nprint("Hello, world!")\n```';

		// Test escaped case
		const escapedResult = getCodeBlocks(escaped);
		assert.deepEqual(
			escapedResult,
			['python'],
			'Escaped result should be an array with a single string, ignoring escaped backticks'
		);
	});
});
