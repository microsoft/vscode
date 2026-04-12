/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { IChatService } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { MockChatService } from '../../../common/chatService/mockChatService.js';
import { ChatSelectedTools } from '../../../../browser/widget/input/chatSelectedTools.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { Iterable } from '../../../../../../../base/common/iterator.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ChatMode } from '../../../../common/chatModes.js';
suite('ChatSelectedTools', () => {
    let store;
    let toolsService;
    let selectedTools;
    setup(() => {
        store = new DisposableStore();
        const instaService = workbenchInstantiationService({
            contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService)),
        }, store);
        instaService.stub(IChatService, new MockChatService());
        instaService.stub(ILanguageModelToolsService, instaService.createInstance(LanguageModelToolsService));
        store.add(instaService);
        toolsService = instaService.get(ILanguageModelToolsService);
        selectedTools = store.add(instaService.createInstance(ChatSelectedTools, constObservable(ChatMode.Agent), constObservable(undefined)));
    });
    teardown(function () {
        store.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    const mcpSource = { type: 'mcp', label: 'MCP', collectionId: '', definitionId: '', instructions: '', serverLabel: '' };
    test('Can\'t enable/disable MCP tools directly #18161', () => {
        return runWithFakedTimers({}, async () => {
            const toolData1 = {
                id: 'testTool1',
                modelDescription: 'Test Tool 1',
                displayName: 'Test Tool 1',
                canBeReferencedInPrompt: true,
                toolReferenceName: 't1',
                source: mcpSource,
            };
            const toolData2 = {
                id: 'testTool2',
                modelDescription: 'Test Tool 2',
                displayName: 'Test Tool 2',
                source: mcpSource,
                canBeReferencedInPrompt: true,
                toolReferenceName: 't2',
            };
            const toolData3 = {
                id: 'testTool3',
                modelDescription: 'Test Tool 3',
                displayName: 'Test Tool 3',
                source: mcpSource,
                canBeReferencedInPrompt: true,
                toolReferenceName: 't3',
            };
            const toolset = toolsService.createToolSet(mcpSource, 'mcp', 'mcp');
            store.add(toolsService.registerToolData(toolData1));
            store.add(toolsService.registerToolData(toolData2));
            store.add(toolsService.registerToolData(toolData3));
            store.add(toolset);
            store.add(toolset.addTool(toolData1));
            store.add(toolset.addTool(toolData2));
            store.add(toolset.addTool(toolData3));
            assert.strictEqual(Iterable.length(toolsService.getTools(undefined)), 3);
            const size = Iterable.length(toolset.getTools());
            assert.strictEqual(size, 3);
            await timeout(1000); // UGLY the tools service updates its state sync but emits the event async (750ms) delay. This affects the observable that depends on the event
            assert.strictEqual(selectedTools.entriesMap.get().size, 8); // 1 toolset (+4 vscode, execute, read, agent toolsets), 3 tools
            const toSet = new Map([[toolData1, true], [toolData2, false], [toolData3, false], [toolset, false]]);
            selectedTools.set(toSet, false);
            const userSelectedTools = selectedTools.userSelectedTools.get();
            assert.strictEqual(Object.keys(userSelectedTools).length, 3); // 3 tools
            assert.strictEqual(userSelectedTools[toolData1.id], true);
            assert.strictEqual(userSelectedTools[toolData2.id], false);
            assert.strictEqual(userSelectedTools[toolData3.id], false);
        });
    });
    test('Can still enable/disable user toolsets #251640', () => {
        return runWithFakedTimers({}, async () => {
            const toolData1 = {
                id: 'testTool1',
                modelDescription: 'Test Tool 1',
                displayName: 'Test Tool 1',
                canBeReferencedInPrompt: true,
                toolReferenceName: 't1',
                source: ToolDataSource.Internal,
            };
            const toolData2 = {
                id: 'testTool2',
                modelDescription: 'Test Tool 2',
                displayName: 'Test Tool 2',
                source: mcpSource,
                canBeReferencedInPrompt: true,
                toolReferenceName: 't2',
            };
            const toolData3 = {
                id: 'testTool3',
                modelDescription: 'Test Tool 3',
                displayName: 'Test Tool 3',
                source: ToolDataSource.Internal,
                canBeReferencedInPrompt: true,
                toolReferenceName: 't3',
            };
            const toolset = toolsService.createToolSet({ type: 'user', label: 'User Toolset', file: URI.file('/userToolset.json') }, 'userToolset', 'userToolset');
            store.add(toolsService.registerToolData(toolData1));
            store.add(toolsService.registerToolData(toolData2));
            store.add(toolsService.registerToolData(toolData3));
            store.add(toolset);
            store.add(toolset.addTool(toolData1));
            store.add(toolset.addTool(toolData2));
            store.add(toolset.addTool(toolData3));
            assert.strictEqual(Iterable.length(toolsService.getTools(undefined)), 3);
            const size = Iterable.length(toolset.getTools());
            assert.strictEqual(size, 3);
            await timeout(1000); // UGLY the tools service updates its state sync but emits the event async (750ms) delay. This affects the observable that depends on the event
            assert.strictEqual(selectedTools.entriesMap.get().size, 8); // 1 toolset (+4 vscode, execute, read, agent toolsets), 3 tools
            // Toolset is checked, tools 2 and 3 are unchecked
            const toSet = new Map([[toolData1, true], [toolData2, false], [toolData3, false], [toolset, true]]);
            selectedTools.set(toSet, false);
            const userSelectedTools = selectedTools.userSelectedTools.get();
            assert.strictEqual(Object.keys(userSelectedTools).length, 3); // 3 tools
            // User toolset is enabled - all tools are enabled
            assert.strictEqual(userSelectedTools[toolData1.id], true);
            assert.strictEqual(userSelectedTools[toolData2.id], true);
            assert.strictEqual(userSelectedTools[toolData3.id], true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlbGVjdGVkVG9vbHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0U2VsZWN0ZWRUb29scy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLDBCQUEwQixFQUFhLGNBQWMsRUFBVyxNQUFNLHVEQUF1RCxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FB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