/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatDebugLogLevel, IChatDebugService } from '../../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../common/chatDebugServiceImpl.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { PromptsDebugContribution } from '../../browser/promptsDebugContribution.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
function createLocalPromptPath(path, name) {
    return {
        uri: URI.file(path),
        name,
        storage: PromptsStorage.local,
        type: PromptsType.instructions,
    };
}
function isGenericEvent(event) {
    return event.kind === 'generic';
}
async function flushAsyncLogging() {
    await new Promise(resolve => setTimeout(resolve, 0));
}
suite('PromptsDebugContribution', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let chatDebugService;
    let willInvokeAgentEmitter;
    let instaService;
    let promptsService;
    const emptyDiscoveryInfo = (type) => ({ type, files: [], durationInMillis: 0 });
    setup(() => {
        instaService = disposables.add(new TestInstantiationService());
        chatDebugService = disposables.add(new ChatDebugServiceImpl());
        instaService.stub(IChatDebugService, chatDebugService);
        willInvokeAgentEmitter = disposables.add(new Emitter());
        instaService.stub(IChatAgentService, { onWillInvokeAgent: willInvokeAgentEmitter.event });
        promptsService = {
            getDiscoveryInfo: async (type) => emptyDiscoveryInfo(type),
        };
        instaService.stub(IPromptsService, promptsService);
    });
    test('should forward discovery events to chat debug service', async () => {
        disposables.add(instaService.createInstance(PromptsDebugContribution));
        const firedEvents = [];
        disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));
        promptsService.getDiscoveryInfo = async (type) => ({
            type,
            durationInMillis: 7,
            files: type === PromptsType.instructions ? [{
                    status: 'loaded',
                    promptPath: createLocalPromptPath('/workspace/.github/instructions/test.instructions.md', 'test.instructions.md'),
                }] : [],
        });
        willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } });
        await flushAsyncLogging();
        assert.strictEqual(firedEvents.length, 5);
        const event = firedEvents.find((e) => isGenericEvent(e) && e.name === 'Load Instructions');
        assert.ok(event);
        assert.strictEqual(event.kind, 'generic');
        assert.ok(event.sessionResource);
        assert.strictEqual(event.name, 'Load Instructions');
        assert.ok(event.details?.includes('Resolved 1 instruction'));
        assert.strictEqual(event.category, 'discovery');
    });
    test('should store discoveryInfo and resolve via resolveEvent', async () => {
        disposables.add(instaService.createInstance(PromptsDebugContribution));
        const firedEvents = [];
        disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));
        const discoveryInfo = {
            type: PromptsType.instructions,
            durationInMillis: 11,
            files: [{
                    status: 'loaded',
                    promptPath: createLocalPromptPath('/workspace/.github/instructions/test.instructions.md', 'test.instructions.md'),
                }],
            sourceFolders: [{
                    uri: URI.file('/workspace/.github/instructions'),
                    storage: PromptsStorage.local,
                }],
        };
        promptsService.getDiscoveryInfo = async (type) => type === PromptsType.instructions ? discoveryInfo : emptyDiscoveryInfo(type);
        willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } });
        await flushAsyncLogging();
        const instructionsEvent = firedEvents.find((e) => isGenericEvent(e) && e.name === 'Load Instructions');
        assert.ok(instructionsEvent);
        const eventId = instructionsEvent.id;
        assert.ok(eventId, 'Event should have an ID for resolution');
        const resolved = await chatDebugService.resolveEvent(eventId);
        assert.ok(resolved);
        assert.strictEqual(resolved.kind, 'fileList');
        if (resolved.kind === 'fileList') {
            assert.strictEqual(resolved.discoveryType, 'instructions');
            assert.strictEqual(resolved.durationInMillis, 11);
            assert.strictEqual(resolved.files.length, 1);
            assert.strictEqual(resolved.files[0].name, 'test.instructions.md');
            assert.strictEqual(resolved.files[0].status, 'loaded');
            assert.strictEqual(resolved.sourceFolders?.length, 1);
        }
    });
    test('should return undefined for unknown event ids', async () => {
        disposables.add(instaService.createInstance(PromptsDebugContribution));
        const resolved = await chatDebugService.resolveEvent('nonexistent-id');
        assert.strictEqual(resolved, undefined);
    });
    test('should assign event id when discoveryInfo is empty', async () => {
        disposables.add(instaService.createInstance(PromptsDebugContribution));
        const firedEvents = [];
        disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));
        promptsService.getDiscoveryInfo = async (type) => emptyDiscoveryInfo(type);
        willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } });
        await flushAsyncLogging();
        assert.strictEqual(firedEvents.length, 5);
        assert.ok(firedEvents.every(e => e.id !== undefined), 'Events with discovery info should have an id');
    });
    test('should handle discoveryInfo with skipped files', async () => {
        disposables.add(instaService.createInstance(PromptsDebugContribution));
        const firedEvents = [];
        disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));
        const discoveryInfo = {
            type: PromptsType.instructions,
            durationInMillis: 5,
            files: [
                {
                    status: 'loaded',
                    promptPath: createLocalPromptPath('/workspace/.github/instructions/loaded.instructions.md', 'loaded.instructions.md'),
                },
                {
                    status: 'skipped',
                    promptPath: createLocalPromptPath('/workspace/.github/instructions/skipped.instructions.md', 'skipped.instructions.md'),
                    skipReason: 'disabled',
                },
            ],
        };
        promptsService.getDiscoveryInfo = async (type) => type === PromptsType.instructions ? discoveryInfo : emptyDiscoveryInfo(type);
        willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } });
        await flushAsyncLogging();
        const eventId = firedEvents.find((e) => isGenericEvent(e) && e.name === 'Load Instructions').id;
        const resolved = await chatDebugService.resolveEvent(eventId);
        assert.ok(resolved);
        if (resolved.kind === 'fileList') {
            assert.strictEqual(resolved.files.length, 2);
            assert.strictEqual(resolved.files[0].status, 'loaded');
            assert.strictEqual(resolved.files[1].status, 'skipped');
            assert.strictEqual(resolved.files[1].skipReason, 'disabled');
        }
    });
    test('should handle level as undefined (defaults to Info)', async () => {
        disposables.add(instaService.createInstance(PromptsDebugContribution));
        const firedEvents = [];
        disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));
        promptsService.getDiscoveryInfo = async (type) => emptyDiscoveryInfo(type);
        willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } });
        await flushAsyncLogging();
        const event = firedEvents[0];
        assert.strictEqual(event.level, ChatDebugLogLevel.Info, 'Default level should be Info');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9wcm9tcHRzRGVidWdDb250cmlidXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsaUJBQWlCLEVBQTJDLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlCQUFpQixFQUE2QixNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3JGLE9BQU8sRUFBMEMsZUFBZSxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzlJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUV2RSxTQUFTLHFCQUFxQixDQUFDLElBQVksRUFBRSxJQUFZO0lBQ3hELE9BQU87UUFDTixHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDbkIsSUFBSTtRQUNKLE9BQU8sRUFBRSxjQUFj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