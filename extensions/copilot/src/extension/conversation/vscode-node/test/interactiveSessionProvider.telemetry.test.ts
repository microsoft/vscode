/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { ICopilotTokenManager } from '../../../../platform/authentication/common/copilotTokenManager';
import { SimulationTestCopilotTokenManager } from '../../../../platform/authentication/test/node/simulationTestCopilotTokenManager';
import { allEvents, withTelemetryCapture } from '../../../../platform/test/node/telemetry';
import { SpyChatResponseStream } from '../../../../util/common/test/mockChatResponseStream';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatParticipantRequestHandler } from '../../../prompt/node/chatParticipantRequestHandler';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { createExtensionTestingServices } from '../../../test/vscode-node/services';


suite('Conversation telemetry tests - Integration tests', function () {
	this.timeout(10000);

	test.skip('Telemetry for user message', async function () {
		const testingServiceCollection = createExtensionTestingServices();
		testingServiceCollection.define(ICopilotTokenManager, new SyncDescriptor(SimulationTestCopilotTokenManager));
		const messageText = 'Write me a function that returns the square root of a number.';

		const [messages] = await withTelemetryCapture(testingServiceCollection, async (accessor) => {
			const token = new vscode.CancellationTokenSource().token;
			const request: vscode.ChatRequest = new TestChatRequest(messageText);
			const stream = new SpyChatResponseStream();
			const instantiationService = accessor.get(IInstantiationService);
			const session = instantiationService.createInstance(ChatParticipantRequestHandler,
				[],
				request,
				stream,
				token,
				{ agentName: '', agentId: '' },
				() => false,
				undefined);
			await session.getResult(); // and throw away the result
		});
		assert.ok(allEvents(messages));
		const names = messages
			.map(message => message.data.baseData.name.split('/')[1])
			// in case we need a new Copilot token, we don't care about the messages that triggers
			.filter(name => !['auth.new_login', 'auth.new_token'].includes(name));

		// Check client telemetry events
		orderMatches(
			[
				'conversation.message',
				'conversation.messageText',
				'request.sent',
				'request.response',
				'engine.messages',
				'engine.messages.length',
				'model.request.added',
				'model.message.added',
				'model.modelCall.input',
				'model.request.options.added',
				'request.shownWarning',
			].sort(),
			names.filter(name => name !== 'log').sort()
		);

		// Check there exists a conversation.message event for the user with the correct properties and measurements
		const userMessage = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'conversation.message' &&
				message.data.baseData.properties.source === 'user'
		);
		const userMessageId = userMessage?.data.baseData.properties.messageId;
		// conversation.message event exists
		assert.ok(userMessage, 'conversation.message event for user message does not exist');
		// Turn index is 0 because this is the first message in the conversation
		assert.ok(
			userMessage.data.baseData.properties.turnIndex === '0',
			'conversation.message event for user message has turn index != 0'
		);
		// Message length equals the length of the message text
		assert.ok(
			userMessage.data.baseData.measurements.messageCharLen === messageText.length,
			'conversation.message event for user message has incorrect message length'
		);
		// Check there exists a conversation.messageText event for the user with the correct properties and measurements
		const userMessageText = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'conversation.messageText' &&
				message.data.baseData.properties.messageId === userMessageId
		);
		// conversation.messageText event exists with matching messageId
		assert.ok(userMessageText, 'conversation.messageText event for user message does not exist');
		assert.ok(
			userMessageText.data.baseData.properties.messageText === messageText,
			'conversation.messageText event for user message has incorrect message text'
		);

		// Check there exists a request.sent event with matching messageId
		const userMessageRequest = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'request.sent' &&
				message.data.baseData.properties.messageId === userMessageId
		);
		// request.sent event exists with matching messageId
		assert.ok(userMessageRequest, 'request.sent event for user message does not exist');

		// Check there exists a request.response event with matching messageId
		const userMessageResponse = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'request.response' &&
				message.data.baseData.properties.messageId === userMessageId
		);
		// request.sent event exists with matching messageId
		assert.ok(userMessageResponse, 'request.response event for user message does not exist');

		// Check there exists a engine.messages event with matching messageId
		const userMessageEngine = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'engine.messages' &&
				message.data.baseData.properties.messageId === userMessageId
		);
		// engine.messages event exists with matching messageId
		assert.ok(userMessageEngine, 'engine.messages event for user message does not exist');
		// Check that the engine.messages event has a messagesJson property with length greater than or equal to message
		assert.ok(
			userMessageEngine.data.baseData.properties.messagesJson.length >= messageText.length,
			'engine.messages event for user message has messagesJson property with length < message length'
		);

		// Check there exists a engine.messages.length event with matching messageId
		const userMessageEngineLength = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'engine.messages.length' &&
				message.data.baseData.properties.messageId === userMessageId
		);
		assert.ok(userMessageEngineLength, 'engine.messages.length event for user message does not exist');

		// Check there exists a model.request.added event with matching headerRequestId
		const modelRequestAdded = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'model.request.added' &&
				message.data.baseData.properties.headerRequestId
		);
		assert.ok(modelRequestAdded, 'model.request.added event for user message does not exist');

		// Check there exists a model.message.added event with messageUuid
		const modelMessageAdded = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'model.message.added' &&
				message.data.baseData.properties.messageUuid
		);
		assert.ok(modelMessageAdded, 'model.message.added event for user message does not exist');

		// Check there exists a model.modelCall.input event with modelCallId
		const modelCallInput = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'model.modelCall.input' &&
				message.data.baseData.properties.modelCallId
		);
		assert.ok(modelCallInput, 'model.modelCall.input event for user message does not exist');

		// Check there exists a model.request.options.added event with requestOptionsId
		const modelRequestOptionsAdded = messages.find(
			message =>
				message.data.baseData.name.split('/')[1] === 'model.request.options.added' &&
				message.data.baseData.properties.requestOptionsId
		);
		assert.ok(modelRequestOptionsAdded, 'model.request.options.added event for user message does not exist');
	});
});

function orderMatches(list1: string[], list2: string[]) {
	const filteredList2 = list2.filter(el => list1.includes(el));
	const result = list1.every((el, index) => el === filteredList2[index]);
	assert.ok(result, `Expected members\n[${list2.join(', ')}]\nto be in order\n[${list1.join(', ')}].`);
}
