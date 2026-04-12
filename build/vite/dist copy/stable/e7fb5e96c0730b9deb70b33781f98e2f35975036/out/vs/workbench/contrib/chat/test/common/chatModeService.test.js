/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatMode, ChatModeService } from '../../common/chatModes.js';
import { ChatModeKind } from '../../common/constants.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from './promptSyntax/service/mockPromptsService.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';
class TestChatAgentService {
    constructor() {
        this._hasToolsAgent = true;
        this._onDidChangeAgents = new Emitter();
        this.onDidChangeAgents = this._onDidChangeAgents.event;
    }
    get hasToolsAgent() {
        return this._hasToolsAgent;
    }
    setHasToolsAgent(value) {
        this._hasToolsAgent = value;
        this._onDidChangeAgents.fire(undefined);
    }
}
suite('ChatModeService', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    const workspaceSource = { storage: PromptsStorage.local };
    let instantiationService;
    let promptsService;
    let chatAgentService;
    let storageService;
    let configurationService;
    let chatModeService;
    setup(async () => {
        instantiationService = testDisposables.add(new TestInstantiationService());
        promptsService = new MockPromptsService();
        chatAgentService = new TestChatAgentService();
        storageService = testDisposables.add(new TestStorageService());
        configurationService = new TestConfigurationService();
        instantiationService.stub(IPromptsService, promptsService);
        instantiationService.stub(IChatAgentService, chatAgentService);
        instantiationService.stub(IStorageService, storageService);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IConfigurationService, configurationService);
        chatModeService = testDisposables.add(instantiationService.createInstance(ChatModeService));
    });
    test('should return builtin modes', () => {
        const modes = chatModeService.getModes();
        assert.strictEqual(modes.builtin.length, 3);
        assert.strictEqual(modes.custom.length, 0);
        // Check that Ask mode is always present
        const askMode = modes.builtin.find(mode => mode.id === ChatModeKind.Ask);
        assert.ok(askMode);
        assert.strictEqual(askMode.label.get(), 'Ask');
        assert.strictEqual(askMode.name.get(), 'ask');
        assert.strictEqual(askMode.kind, ChatModeKind.Ask);
    });
    test('should adjust builtin modes based on tools agent availability', () => {
        // Agent mode should always be present regardless of tools agent availability
        chatAgentService.setHasToolsAgent(true);
        let agents = chatModeService.getModes();
        assert.ok(agents.builtin.find(agent => agent.id === ChatModeKind.Agent));
        // Without tools agent - Agent mode should not be present
        chatAgentService.setHasToolsAgent(false);
        agents = chatModeService.getModes();
        assert.strictEqual(agents.builtin.find(agent => agent.id === ChatModeKind.Agent), undefined);
        // Ask and Edit modes should always be present
        assert.ok(agents.builtin.find(agent => agent.id === ChatModeKind.Ask));
        assert.ok(agents.builtin.find(agent => agent.id === ChatModeKind.Edit));
    });
    test('should find builtin modes by id', () => {
        const agentMode = chatModeService.findModeById(ChatModeKind.Agent);
        assert.ok(agentMode);
        assert.strictEqual(agentMode.id, ChatMode.Agent.id);
        assert.strictEqual(agentMode.kind, ChatModeKind.Agent);
    });
    test('should return undefined for non-existent mode', () => {
        const mode = chatModeService.findModeById('non-existent-mode');
        assert.strictEqual(mode, undefined);
    });
    test('should handle custom modes from prompts service', async () => {
        const customMode = {
            uri: URI.parse('file:///test/custom-mode.md'),
            name: 'Test Mode',
            description: 'A test custom mode',
            tools: ['tool1', 'tool2'],
            agentInstructions: { content: 'Custom mode body', toolReferences: [] },
            source: workspaceSource,
            target: Target.Undefined,
            visibility: { userInvocable: true, agentInvocable: true }
        };
        promptsService.setCustomModes([customMode]);
        // Wait for the service to refresh
        await timeout(0);
        const modes = chatModeService.getModes();
        assert.strictEqual(modes.custom.length, 1);
        const testMode = modes.custom[0];
        assert.strictEqual(testMode.id, customMode.uri.toString());
        assert.strictEqual(testMode.name.get(), customMode.name);
        assert.strictEqual(testMode.label.get(), customMode.name);
        assert.strictEqual(testMode.description.get(), customMode.description);
        assert.strictEqual(testMode.kind, ChatModeKind.Agent);
        assert.deepStrictEqual(testMode.customTools?.get(), customMode.tools);
        assert.deepStrictEqual(testMode.modeInstructions?.get(), customMode.agentInstructions);
        assert.deepStrictEqual(testMode.handOffs?.get(), customMode.handOffs);
        assert.strictEqual(testMode.uri?.get().toString(), customMode.uri.toString());
        assert.deepStrictEqual(testMode.source, workspaceSource);
    });
    test('should fire change event when custom modes are updated', async () => {
        let eventFired = false;
        testDisposables.add(chatModeService.onDidChangeChatModes(() => {
            eventFired = true;
        }));
        const customMode = {
            uri: URI.parse('file:///test/custom-mode.md'),
            name: 'Test Mode',
            description: 'A test custom mode',
            tools: [],
            agentInstructions: { content: 'Custom mode body', toolReferences: [] },
            source: workspaceSource,
            target: Target.Undefined,
            visibility: { userInvocable: true, agentInvocable: true }
        };
        promptsService.setCustomModes([customMode]);
        // Wait for the event to fire
        await timeout(0);
        assert.ok(eventFired);
    });
    test('should find custom modes by id', async () => {
        const customMode = {
            uri: URI.parse('file:///test/findable-mode.md'),
            name: 'Findable Mode',
            description: 'A findable custom mode',
            tools: [],
            agentInstructions: { content: 'Findable mode body', toolReferences: [] },
            source: workspaceSource,
            target: Target.Undefined,
            visibility: { userInvocable: true, agentInvocable: true }
        };
        promptsService.setCustomModes([customMode]);
        // Wait for the service to refresh
        await timeout(0);
        const foundMode = chatModeService.findModeById(customMode.uri.toString());
        assert.ok(foundMode);
        assert.strictEqual(foundMode.id, customMode.uri.toString());
        assert.strictEqual(foundMode.name.get(), customMode.name);
        assert.strictEqual(foundMode.label.get(), customMode.name);
    });
    test('should update existing custom mode instances when data changes', async () => {
        const uri = URI.parse('file:///test/updateable-mode.md');
        const initialMode = {
            uri,
            name: 'Initial Mode',
            description: 'Initial description',
            tools: ['tool1'],
            agentInstructions: { content: 'Initial body', toolReferences: [] },
            model: ['gpt-4'],
            source: workspaceSource,
            target: Target.Undefined,
            visibility: { userInvocable: true, agentInvocable: true }
        };
        promptsService.setCustomModes([initialMode]);
        await timeout(0);
        const initialModes = chatModeService.getModes();
        const initialCustomMode = initialModes.custom[0];
        assert.strictEqual(initialCustomMode.description.get(), 'Initial description');
        // Update the mode data
        const updatedMode = {
            ...initialMode,
            description: 'Updated description',
            tools: ['tool1', 'tool2'],
            agentInstructions: { content: 'Updated body', toolReferences: [] },
            model: ['Updated model']
        };
        promptsService.setCustomModes([updatedMode]);
        await timeout(0);
        const updatedModes = chatModeService.getModes();
        const updatedCustomMode = updatedModes.custom[0];
        // The instance should be the same (reused)
        assert.strictEqual(initialCustomMode, updatedCustomMode);
        // But the observable properties should be updated
        assert.strictEqual(updatedCustomMode.description.get(), 'Updated description');
        assert.deepStrictEqual(updatedCustomMode.customTools?.get(), ['tool1', 'tool2']);
        assert.deepStrictEqual(updatedCustomMode.modeInstructions?.get(), { content: 'Updated body', toolReferences: [] });
        assert.deepStrictEqual(updatedCustomMode.model?.get(), ['Updated model']);
        assert.deepStrictEqual(updatedCustomMode.source, workspaceSource);
    });
    test('should remove custom modes that no longer exist', async () => {
        const mode1 = {
            uri: URI.parse('file:///test/mode1.md'),
            name: 'Mode 1',
            description: 'First mode',
            tools: [],
            agentInstructions: { content: 'Mode 1 body', toolReferences: [] },
            source: workspaceSource,
            target: Target.Undefined,
            visibility: { userInvocable: true, agentInvocable: true }
        };
        const mode2 = {
            uri: URI.parse('file:///test/mode2.md'),
            name: 'Mode 2',
            description: 'Second mode',
            tools: [],
            agentInstructions: { content: 'Mode 2 body', toolReferences: [] },
            source: workspaceSource,
            target: Target.Undefined,
            visibility: { userInvocable: true, agentInvocable: true }
        };
        // Add both modes
        promptsService.setCustomModes([mode1, mode2]);
        await timeout(0);
        let modes = chatModeService.getModes();
        assert.strictEqual(modes.custom.length, 2);
        // Remove one mode
        promptsService.setCustomModes([mode1]);
        await timeout(0);
        modes = chatModeService.getModes();
        assert.strictEqual(modes.custom.length, 1);
        assert.strictEqual(modes.custom[0].id, mode1.uri.toString());
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL2NoYXRNb2RlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNoSCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxZ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