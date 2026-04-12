/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mockObject } from '../../../../../../base/test/common/mock.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Event } from '../../../../../../base/common/event.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService, nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestParser } from '../../../common/requestParser/chatRequestParser.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSlashCommandService } from '../../../common/participants/chatSlashCommands.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatVariablesService } from '../../../common/attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { MockChatService } from '../chatService/mockChatService.js';
import { MockChatVariablesService } from '../mockChatVariables.js';
import { MockPromptsService } from '../promptSyntax/service/mockPromptsService.js';
const testSessionUri = LocalChatSessionUri.forSession('test-session');
suite('ChatRequestParser', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let parser;
    let variableService;
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
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = '/fix this';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('invalid slash command', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = '/explain this';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('multiple slash commands', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = '/fix /fix';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('slash command not first', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = 'Hello /fix';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('slash command after whitespace', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = '    /fix';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('prompt slash command', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        const promptSlashCommandService = mockObject()({ _serviceBrand: undefined });
        promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
            return !!command.match(/^[\w_\-\.]+$/);
        });
        instantiationService.stub(IPromptsService, promptSlashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = '    /prompt';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('prompt slash command after text', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        const promptSlashCommandService = mockObject()({ _serviceBrand: undefined });
        promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
            return !!command.match(/^[\w_\-\.]+$/);
        });
        instantiationService.stub(IPromptsService, promptSlashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = 'handle the / route and the request of /search-option';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('prompt slash command after slash', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        const promptSlashCommandService = mockObject()({ _serviceBrand: undefined });
        promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
            return !!command.match(/^[\w_\-\.]+$/);
        });
        instantiationService.stub(IPromptsService, promptSlashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const text = '/ route and the request of /search-option';
        const result = parser.parseChatRequest(testSessionUri, text);
        await assertSnapshot(result);
    });
    test('prompt slash command with numbers', async () => {
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        const promptSlashCommandService = mockObject()({ _serviceBrand: undefined });
        promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
            return !!command.match(/^[\w_\-\.]+$/);
        });
        instantiationService.stub(IPromptsService, promptSlashCommandService);
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
    const getAgentWithSlashCommands = (slashCommands) => {
        return { id: 'agent', name: 'agent', extensionId: nullExtensionDescription.identifier, extensionVersion: undefined, publisherDisplayName: '', extensionDisplayName: '', extensionPublisherId: '', locations: [ChatAgentLocation.Chat], modes: [ChatModeKind.Ask], metadata: {}, slashCommands, disambiguation: [] };
    };
    test('agent with subcommand after text', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent Please do /subCommand thanks');
        await assertSnapshot(result);
    });
    test('agents, subCommand', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /subCommand Please do thanks');
        await assertSnapshot(result);
    });
    test('agent but edit mode', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([])]);
        instantiationService.stub(IChatAgentService, agentsService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent hello', undefined, { mode: ChatModeKind.Edit });
        await assertSnapshot(result);
    });
    test('agent with question mark', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent? Are you there');
        await assertSnapshot(result);
    });
    test('agent and subcommand with leading whitespace', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '    \r\n\t   @agent \r\n\t   /subCommand Thanks');
        await assertSnapshot(result);
    });
    test('agent and subcommand after newline', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '    \n@agent\n/subCommand Thanks');
        await assertSnapshot(result);
    });
    test('agent not first', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, 'Hello Mr. @agent');
        await assertSnapshot(result);
    });
    test('agents and tools and multiline', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        variableService.setSelectedToolAndToolSets(testSessionUri, new Map([
            [{ id: 'get_selection', toolReferenceName: 'selection', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true],
            [{ id: 'get_debugConsole', toolReferenceName: 'debugConsole', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true]
        ]));
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /subCommand \nPlease do with #selection\nand #debugConsole');
        await assertSnapshot(result);
    });
    test('agents and tools and multiline, part2', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        variableService.setSelectedToolAndToolSets(testSessionUri, new Map([
            [{ id: 'get_selection', toolReferenceName: 'selection', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true],
            [{ id: 'get_debugConsole', toolReferenceName: 'debugConsole', canBeReferencedInPrompt: true, displayName: '', modelDescription: '', source: ToolDataSource.Internal }, true]
        ]));
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent Please \ndo /subCommand with #selection\nand #debugConsole');
        await assertSnapshot(result);
    });
    test('prompt slash command with agent and supportsPromptAttachments', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        const promptSlashCommandService = mockObject()({ _serviceBrand: undefined });
        promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
            return !!command.match(/^[\w_\-\.]+$/);
        });
        instantiationService.stub(IPromptsService, promptSlashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /myPrompt do something', undefined, {
            attachmentCapabilities: { supportsPromptAttachments: true }
        });
        await assertSnapshot(result);
    });
    test('prompt slash command with agent but no supportsPromptAttachments', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        const promptSlashCommandService = mockObject()({ _serviceBrand: undefined });
        promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
            return !!command.match(/^[\w_\-\.]+$/);
        });
        instantiationService.stub(IPromptsService, promptSlashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /myPrompt do something', undefined, {
            attachmentCapabilities: { supportsPromptAttachments: false }
        });
        await assertSnapshot(result);
    });
    test('agent subcommand still takes priority with supportsPromptAttachments', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        const promptSlashCommandService = mockObject()({ _serviceBrand: undefined });
        promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
            return !!command.match(/^[\w_\-\.]+$/);
        });
        instantiationService.stub(IPromptsService, promptSlashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /subCommand do something', undefined, {
            attachmentCapabilities: { supportsPromptAttachments: true }
        });
        await assertSnapshot(result);
    });
    test('slash command with agent and supportsPromptAttachments', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /fix this', undefined, {
            attachmentCapabilities: { supportsPromptAttachments: true }
        });
        await assertSnapshot(result);
    });
    test('silent slash command with agent and no supportsPromptAttachments', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'clear', silent: true }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /clear', undefined, {
            attachmentCapabilities: { supportsPromptAttachments: false }
        });
        await assertSnapshot(result);
    });
    test('non-silent slash command with agent and no supportsPromptAttachments', async () => {
        const agentsService = mockObject()({ _serviceBrand: undefined, hasToolsAgent: false, onDidChangeAgents: Event.None });
        agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: 'subCommand', description: '' }])]);
        instantiationService.stub(IChatAgentService, agentsService);
        const slashCommandService = mockObject()({ _serviceBrand: undefined });
        slashCommandService.getCommands.returns([{ command: 'fix' }]);
        instantiationService.stub(IChatSlashCommandService, slashCommandService);
        parser = instantiationService.createInstance(ChatRequestParser);
        const result = parser.parseChatRequest(testSessionUri, '@agent /fix this', undefined, {
            attachmentCapabilities: { supportsPromptAttachments: false }
        });
        await assertSnapshot(result);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlcXVlc3RQYXJzZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UmVxdWVzdFBhcnNlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxnQkFBZ0IsRUFBcUMsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNwSSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFD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