/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mockObject } from '../../../../../../base/test/common/mock.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService, nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatAgentService, IChatAgentCommand, IChatAgentData, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestParser } from '../../../common/requestParser/chatRequestParser.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSlashCommandService } from '../../../common/participants/chatSlashCommands.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatVariablesService } from '../../../common/attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IToolData, ToolDataSource, ToolSet } from '../../../common/tools/languageModelToolsService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { MockChatService } from '../chatService/mockChatService.js';
import { MockChatVariablesService } from '../mockChatVariables.js';
import { MockPromptsService } from '../promptSyntax/service/mockPromptsService.js';

const testSessionUri = LocalChatSessionUri.forSession('test-session');

suite('ChatRequestParser', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: ChatRequestParser;

	let variableService: MockChatVariablesService;
	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IPromptsService, testDisposables.add(new MockPromptsService()));

		variableService = new MockChatVariablesService();
		instantiationService.stub(IChatVariablesService, variableService);
	});

	test('plain text', async () => {
		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, 'test');
		await assertSnapshot(result);
	});

	test('plain text with newlines', async () => {
		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'line 1\nline 2\r\nline 3';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('slash in text', async () => {
		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'can we add a new file for an Express router to handle the / route';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('slash command', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/fix this';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('invalid slash command', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/explain this';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('multiple slash commands', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/fix /fix';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('slash command not first', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'Hello /fix';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('slash command after whitespace', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '    /fix';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('prompt slash command', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		const promptSlashCommandService = mockObject<IPromptsService>()({});
		promptSlashCommandService.isValidSlashCommandName.callsFake((command: string) => {
			return !!command.match(/^[\w_\-\.]+$/);
		});
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IPromptsService, promptSlashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '    /prompt';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('prompt slash command after text', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		const promptSlashCommandService = mockObject<IPromptsService>()({});
		promptSlashCommandService.isValidSlashCommandName.callsFake((command: string) => {
			return !!command.match(/^[\w_\-\.]+$/);
		});
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IPromptsService, promptSlashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = 'handle the / route and the request of /search-option';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('prompt slash command after slash', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		const promptSlashCommandService = mockObject<IPromptsService>()({});
		promptSlashCommandService.isValidSlashCommandName.callsFake((command: string) => {
			return !!command.match(/^[\w_\-\.]+$/);

		});
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IPromptsService, promptSlashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/ route and the request of /search-option';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	test('prompt slash command with numbers', async () => {
		const slashCommandService = mockObject<IChatSlashCommandService>()({});
		slashCommandService.getCommands.returns([{ command: 'fix' }]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatSlashCommandService, slashCommandService as any);

		const promptSlashCommandService = mockObject<IPromptsService>()({});
		promptSlashCommandService.isValidSlashCommandName.callsFake((command: string) => {
			return !!command.match(/^[\w_\-\.]+$/);
		});
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IPromptsService, promptSlashCommandService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const text = '/001-sample this is a test';
		const result = parser.parseChatRequest(testSessionUri, text);
		await assertSnapshot(result);
	});

	// test('variables', async () => {
	// 	varService.hasVariable.returns(true);
	// 	varService.getVariable.returns({ id: 'copilot.selection' });

	// 	parser = instantiationService.createInstance(ChatRequestParser);
	// 	const text = 'What does #selection mean?';
	// 	const result = parser.parseChatRequest(testSessionUri, text);
	// 	await assertSnapshot(result);
	// });

	// test('variable with question mark', async () => {
	// 	varService.hasVariable.returns(true);
	// 	varService.getVariable.returns({ id: 'copilot.selection' });

	// 	parser = instantiationService.createInstance(ChatRequestParser);
	// 	const text = 'What is #selection?';
	// 	const result = parser.parseChatRequest(testSessionUri, text);
	// 	await assertSnapshot(result);
	// });

	// test('invalid variables', async () => {
	// 	varService.hasVariable.returns(false);

	// 	parser = instantiationService.createInstance(ChatRequestParser);
	// 	const text = 'What does #selection mean?';
	// 	const result = parser.parseChatRequest(testSessionUri, text);
	// 	await assertSnapshot(result);
	// });

	const getAgentWithSlashCommands = (slashCommands: IChatAgentCommand[]) => {
		return { id: 'agent', name: 'agent', extensionId: nullExtensionDescription.identifier, extensionVersion: undefined, publisherDisplayName: '', extensionDisplayName: '', extensionPublisherId: '', locations: [ChatAgentLocation.Chat], modes: [ChatModeKind.Ask], metadata: {}, slashCommands, disambiguation: [] } satisfies IChatAgentData;
	};

	test('agent with subcommand after text', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '@agent Please do /subCommand thanks');
		await assertSnapshot(result);
	});

	test('agents, subCommand', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '@agent /subCommand Please do thanks');
		await assertSnapshot(result);
	});

	test('agent but edit mode', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '@agent hello', undefined, { mode: ChatModeKind.Edit });
		await assertSnapshot(result);
	});

	test('agent with question mark', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '@agent? Are you there');
		await assertSnapshot(result);
	});

	test('agent and subcommand with leading whitespace', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '    \r\n\t   @agent \r\n\t   /subCommand Thanks');
		await assertSnapshot(result);
	});

	test('agent and subcommand after newline', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '    \n@agent\n/subCommand Thanks');
		await assertSnapshot(result);
	});

	test('agent not first', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, 'Hello Mr. @agent');
		await assertSnapshot(result);
	});

	test('agents and tools and multiline', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		variableService.setSelectedToolAndToolSets(testSessionUri, new Map([
			[{ id: 'get_selection', toolReferenceName: 'selection', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true],
			[{ id: 'get_debugConsole', toolReferenceName: 'debugConsole', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true]
		] satisfies [IToolData | ToolSet, boolean][]));

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '@agent /subCommand \nPlease do with #selection\nand #debugConsole');
		await assertSnapshot(result);
	});

	test('agents and tools and multiline, part2', async () => {
		const agentsService = mockObject<IChatAgentService>()({});
		agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IChatAgentService, agentsService as any);

		variableService.setSelectedToolAndToolSets(testSessionUri, new Map([
			[{ id: 'get_selection', toolReferenceName: 'selection', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true],
			[{ id: 'get_debugConsole', toolReferenceName: 'debugConsole', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true]
		] satisfies [IToolData | ToolSet, boolean][]));

		parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest(testSessionUri, '@agent Please \ndo /subCommand with #selection\nand #debugConsole');
		await assertSnapshot(result);
	});
});
