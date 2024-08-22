/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MockObject, mockObject } from '../../../../../base/test/common/mock';
import { assertSnapshot } from '../../../../../base/test/common/snapshot';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log';
import { IStorageService } from '../../../../../platform/storage/common/storage';
import { ChatAgentLocation, ChatAgentService, IChatAgentCommand, IChatAgentData, IChatAgentService } from '../../common/chatAgents';
import { ChatRequestParser } from '../../common/chatRequestParser';
import { IChatService } from '../../common/chatService';
import { IChatSlashCommandService } from '../../common/chatSlashCommands';
import { IChatVariablesService } from '../../common/chatVariables';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService';
import { MockChatService } from './mockChatService';
import { MockLanguageModelToolsService } from './mockLanguageModelToolsService';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices';

suite('ChatRequestParser', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: ChatRequestParser;

	let varService: MockObject<IChatVariablesService>;
	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(ILanguageModelToolsService, new MockLanguageModelToolsService());
		instantiationService.stub(IChatAgentService, instantiationService.createInstance(ChatAgentService));

		varService = mockObject<IChatVariablesService>()({});
		varService.getDynamicVariables.returns([]);
		instantiationService.stub(IChatVariablesService, varService as any);
	});

	test('plain text', async () => {
		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', 'test');
		await assertSnapshot(result);
	});

	test('plain text with newlines', async () => {
		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'line 1\nline 2\r\nline 3';
		const result = parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('slash command', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/fix this';
		const result = parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('invalid slash command', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/explain this';
		const result = parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('multiple slash commands', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/fix /fix';
		const result = parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('variables', async () => {
		varService.hasVariable.returns(true);
		varService.getVariable.returns({ id: 'copilot.selection' });

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'What does #selection mean?';
		const result = parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('variable with question mark', async () => {
		varService.hasVariable.returns(true);
		varService.getVariable.returns({ id: 'copilot.selection' });

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'What is #selection?';
		const result = parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	test('invalid variables', async () => {
		varService.hasVariable.returns(false);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'What does #selection mean?';
		const result = parser.parseChatRequest('1', text);
		await assertSnapshot(result);
	});

	const getAgentWithSlashCommands = (slashCommands: IChatAgentCommand[]) => {
		return { id: 'agent', name: 'agent', extensionId: nullExtensionDescription.identifier, publisherDisplayName: '', extensionDisplayName: '', extensionPublisherId: '', locations: [ChatAgentLocation.Panel], metadata: {}, slashCommands, disambiguation: [], } satisfies IChatAgentData;
	};

	test('agent with subcommand after text', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', '@agent Please do /subCommand thanks');
		await assertSnapshot(result);
	});

	test('agents, subCommand', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', '@agent /subCommand Please do thanks');
		await assertSnapshot(result);
	});

	test('agent with question mark', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', '@agent? Are you there');
		await assertSnapshot(result);
	});

	test('agent and subcommand with leading whitespace', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', '    \r\n\t   @agent \r\n\t   /subCommand Thanks');
		await assertSnapshot(result);
	});

	test('agent and subcommand after newline', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', '    \n@agent\n/subCommand Thanks');
		await assertSnapshot(result);
	});

	test('agent not first', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', 'Hello Mr. @agent');
		await assertSnapshot(result);
	});

	test('agents and variables and multiline', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		varService.hasVariable.returns(true);
		varService.getVariable.onCall(0).returns({ id: 'copilot.selection' });
		varService.getVariable.onCall(1).returns({ id: 'copilot.debugConsole' });

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', '@agent /subCommand \nPlease do with #selection\nand #debugConsole');
		await assertSnapshot(result);
	});

	test('agents and variables and multiline, part2', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		instantiationService.stub(IChatAgentService, agentsService as any);

		varService.hasVariable.returns(true);
		varService.getVariable.onCall(0).returns({ id: 'copilot.selection' });
		varService.getVariable.onCall(1).returns({ id: 'copilot.debugConsole' });

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('1', '@agent Please \ndo /subCommand with #selection\nand #debugConsole');
		await assertSnapshot(result);
	});
});
