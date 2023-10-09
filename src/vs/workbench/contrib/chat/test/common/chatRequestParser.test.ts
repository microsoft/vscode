/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mockObject } from 'vs/base/test/common/mock';
import { assertSnapshot } from 'vs/base/test/common/snapshot';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ChatAgentService, IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestParser } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('ChatRequestParser', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: ChatRequestParser;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
	});

	test('plain text', async () => {
		parser = instantiationService.createInstance(ChatRequestParser);
		const result = await parser.parseChatRequest('1', 'test');
		await assertSnapshot(result);
	});

	test('plain text with newlines', async () => {
		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'line 1\nline 2\r\nline 3';
		const result = await parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('slash command', async () => {
		const chatService = mockObject<IChatService>()({});
		chatService.getSlashCommands.returns(Promise.resolve([{ command: 'fix' }]));
		instantiationService.stub(IChatService, chatService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/fix this';
		const result = await parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('invalid slash command', async () => {
		const chatService = mockObject<IChatService>()({});
		chatService.getSlashCommands.returns(Promise.resolve([{ command: 'fix' }]));
		instantiationService.stub(IChatService, chatService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/explain this';
		const result = await parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('multiple slash commands', async () => {
		const chatService = mockObject<IChatService>()({});
		chatService.getSlashCommands.returns(Promise.resolve([{ command: 'fix' }]));
		instantiationService.stub(IChatService, chatService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/fix /fix';
		const result = await parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('variables', async () => {
		const variablesService = mockObject<IChatVariablesService>()({});
		variablesService.hasVariable.returns(true);
		instantiationService.stub(IChatVariablesService, variablesService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'What does #selection mean?';
		const result = await parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('variable with question mark', async () => {
		const variablesService = mockObject<IChatVariablesService>()({});
		variablesService.hasVariable.returns(true);
		instantiationService.stub(IChatVariablesService, variablesService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'What is #selection?';
		const result = await parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('invalid variables', async () => {
		const variablesService = mockObject<IChatVariablesService>()({});
		variablesService.hasVariable.returns(false);
		instantiationService.stub(IChatVariablesService, variablesService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'What does #selection mean?';
		const result = await parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('agents', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgent.returns(<IChatAgentData>{ id: 'agent', metadata: { description: '', subCommands: [{ name: 'subCommand' }] } });
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = await parser.parseChatRequest('1', '@agent Please do /subCommand thanks');
		await assertSnapshot(result);
	});

	test('agent with question mark', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgent.returns(<IChatAgentData>{ id: 'agent', metadata: { description: '', subCommands: [{ name: 'subCommand' }] } });
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = await parser.parseChatRequest('1', 'Are you there @agent?');
		await assertSnapshot(result);
	});

	test('agent not first', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgent.returns(<IChatAgentData>{ id: 'agent', metadata: { description: '', subCommands: [{ name: 'subCommand' }] } });
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = await parser.parseChatRequest('1', 'Hello Mr. @agent /subCommand thanks');
		await assertSnapshot(result);
	});

	test('agents and variables and multiline', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgent.returns(<IChatAgentData>{ id: 'agent', metadata: { description: '', subCommands: [{ name: 'subCommand' }] } });
		instantiationService.stub(IChatAgentService, agentsService as any);

		const variablesService = mockObject<IChatVariablesService>()({});
		variablesService.hasVariable.returns(true);
		instantiationService.stub(IChatVariablesService, variablesService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = await parser.parseChatRequest('1', '@agent Please \ndo /subCommand with #selection\nand #debugConsole');
		await assertSnapshot(result);
	});
});

