/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { CellUri } from '../../../../notebook/common/notebookCommon.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatModel, ChatResponseResource, isExportableSessionData, isSerializableSessionData, normalizeSerializableChatData, Response } from '../../../common/model/chatModel.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { IChatService, IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { MockChatService } from '../chatService/mockChatService.js';
suite('ChatModel', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    setup(async () => {
        instantiationService = testDisposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IExtensionService, new TestExtensionService());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
        instantiationService.stub(IConfigurationService, new TestConfigurationService());
        instantiationService.stub(IChatService, new MockChatService());
    });
    test('initialization with exported data only (imported)', async () => {
        const exportedData = {
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
            responderUsername: 'bot',
        };
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, { value: exportedData, serializer: undefined }, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        assert.strictEqual(model.isImported, true);
        assert.ok(model.sessionId); // Should have generated ID
        assert.ok(model.timestamp > 0); // Should have generated timestamp
    });
    test('initialization with full serializable data (not imported)', async () => {
        const now = Date.now();
        const serializableData = {
            version: 3,
            sessionId: 'existing-session',
            creationDate: now - 1000,
            customTitle: 'My Chat',
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
            responderUsername: 'bot',
        };
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, { value: serializableData, serializer: undefined }, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        assert.strictEqual(model.isImported, false);
        assert.strictEqual(model.sessionId, 'existing-session');
        assert.strictEqual(model.timestamp, now - 1000);
        assert.strictEqual(model.customTitle, 'My Chat');
    });
    test('initialization with invalid data', async () => {
        const invalidData = {
            // Missing required fields
            requests: 'not-an-array'
        };
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, { value: invalidData, serializer: undefined }, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        // Should handle gracefully with empty state
        assert.strictEqual(model.getRequests().length, 0);
        assert.ok(model.sessionId); // Should have generated ID
    });
    test('initialization without data', async () => {
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        assert.strictEqual(model.isImported, false);
        assert.strictEqual(model.getRequests().length, 0);
        assert.ok(model.sessionId);
        assert.ok(model.timestamp > 0);
    });
    test('removeRequest', async () => {
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        const text = 'hello';
        model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
        const requests = model.getRequests();
        assert.strictEqual(requests.length, 1);
        model.removeRequest(requests[0].id);
        assert.strictEqual(model.getRequests().length, 0);
    });
    test('adoptRequest', async function () {
        const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.EditorInline, canUseTools: true }));
        const model2 = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        const text = 'hello';
        const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
        assert.strictEqual(model1.getRequests().length, 1);
        assert.strictEqual(model2.getRequests().length, 0);
        assert.ok(request1.session === model1);
        assert.ok(request1.response?.session === model1);
        model2.adoptRequest(request1);
        assert.strictEqual(model1.getRequests().length, 0);
        assert.strictEqual(model2.getRequests().length, 1);
        assert.ok(request1.session === model2);
        assert.ok(request1.response?.session === model2);
        model2.acceptResponseProgress(request1, { content: new MarkdownString('Hello'), kind: 'markdownContent' });
        assert.strictEqual(request1.response.response.toString(), 'Hello');
    });
    test('addCompleteRequest', async function () {
        const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        const text = 'hello';
        const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0, undefined, undefined, undefined, undefined, undefined, undefined, true);
        assert.strictEqual(request1.isCompleteAddedRequest, true);
        assert.strictEqual(request1.response.isCompleteAddedRequest, true);
        assert.strictEqual(request1.shouldBeRemovedOnSend, undefined);
        assert.strictEqual(request1.response.shouldBeRemovedOnSend, undefined);
    });
    test('deserialization marks unused question carousels as used', async () => {
        const serializableData = {
            version: 3,
            sessionId: 'test-session',
            creationDate: Date.now(),
            customTitle: undefined,
            initialLocation: ChatAgentLocation.Chat,
            requests: [{
                    requestId: 'req1',
                    message: { text: 'hello', parts: [] },
                    variableData: { variables: [] },
                    response: [
                        { value: 'some text', isTrusted: false },
                        {
                            kind: 'questionCarousel',
                            questions: [{ id: 'q1', title: 'Question 1', type: 'text' }],
                            allowSkip: true,
                            resolveId: 'resolve1',
                            isUsed: false,
                        },
                    ],
                    modelState: { value: 2 /* ResponseModelState.Cancelled */, completedAt: Date.now() },
                }],
            responderUsername: 'bot',
        };
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, { value: serializableData, serializer: undefined }, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        const requests = model.getRequests();
        assert.strictEqual(requests.length, 1);
        const response = requests[0].response;
        // The question carousel should be marked as used after deserialization
        const carouselPart = response.response.value.find(p => p.kind === 'questionCarousel');
        assert.ok(carouselPart);
        assert.strictEqual(carouselPart.isUsed, true);
        // The response should be complete (not stuck in NeedsInput)
        assert.strictEqual(response.isComplete, true);
    });
    test('inputModel.toJSON filters extension-contributed contexts', async function () {
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        const fileAttachment = {
            kind: 'file',
            value: URI.parse('file:///test.ts'),
            id: 'file-id',
            name: 'test.ts',
        };
        const stringContextValue = {
            value: 'pr-content',
            name: 'PR #123',
            icon: Codicon.gitPullRequest,
            uri: URI.parse('pr://123'),
            handle: 1
        };
        const stringAttachment = {
            kind: 'string',
            value: 'pr-content',
            id: 'string-id',
            name: 'PR #123',
            icon: Codicon.gitPullRequest,
            uri: URI.parse('pr://123'),
            handle: 1
        };
        const implicitWithStringContext = {
            kind: 'implicit',
            isFile: true,
            value: stringContextValue,
            uri: URI.parse('pr://123'),
            isSelection: false,
            enabled: true,
            id: 'implicit-string-id',
            name: 'PR Context',
        };
        const implicitWithUri = {
            kind: 'implicit',
            isFile: true,
            value: URI.parse('file:///current.ts'),
            uri: URI.parse('file:///current.ts'),
            isSelection: false,
            enabled: true,
            id: 'implicit-uri-id',
            name: 'current.ts',
        };
        model.inputModel.setState({
            attachments: [fileAttachment, stringAttachment, implicitWithStringContext, implicitWithUri],
            inputText: 'test'
        });
        const serialized = model.inputModel.toJSON();
        assert.ok(serialized);
        // Should filter out string attachments and implicit attachments with StringChatContextValue
        // Should keep file attachments and implicit attachments with URI values
        assert.deepStrictEqual(serialized.attachments, [fileAttachment, implicitWithUri]);
    });
    test('modeInfo roundtrips through serialization', async () => {
        const modeInfo = {
            kind: ChatModeKind.Agent,
            isBuiltin: false,
            modeId: 'custom',
            modeInstructions: {
                name: 'plan',
                content: 'You are a planning agent',
                toolReferences: [],
            },
            applyCodeBlockSuggestionId: undefined,
        };
        const serializableData = {
            version: 3,
            sessionId: 'test-modeinfo-session',
            creationDate: Date.now(),
            customTitle: undefined,
            initialLocation: ChatAgentLocation.Chat,
            responderUsername: 'bot',
            requests: [{
                    requestId: 'req1',
                    message: { text: 'plan something', parts: [] },
                    variableData: { variables: [] },
                    response: [{ value: 'Here is my plan', isTrusted: false }],
                    modelState: { value: 1 /* ResponseModelState.Complete */, completedAt: Date.now() },
                    modeInfo,
                }],
        };
        const model = testDisposables.add(instantiationService.createInstance(ChatModel, { value: serializableData, serializer: undefined }, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
        const requests = model.getRequests();
        assert.strictEqual(requests.length, 1);
        assert.deepStrictEqual(requests[0].modeInfo, modeInfo);
        // Verify roundtrip through toExport
        const exported = model.toExport();
        assert.strictEqual(exported.requests.length, 1);
        assert.deepStrictEqual(exported.requests[0].modeInfo, modeInfo);
    });
});
suite('Response', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('mergeable markdown', async () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('markdown1'), kind: 'markdownContent' });
        response.updateContent({ content: new MarkdownString('markdown2'), kind: 'markdownContent' });
        await assertSnapshot(response.value);
        assert.strictEqual(response.toString(), 'markdown1markdown2');
    });
    test('not mergeable markdown', async () => {
        const response = store.add(new Response([]));
        const md1 = new MarkdownString('markdown1');
        md1.supportHtml = true;
        response.updateContent({ content: md1, kind: 'markdownContent' });
        response.updateContent({ content: new MarkdownString('markdown2'), kind: 'markdownContent' });
        await assertSnapshot(response.value);
    });
    test('inline reference', async () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('text before '), kind: 'markdownContent' });
        response.updateContent({ inlineReference: URI.parse('https://microsoft.com/'), kind: 'inlineReference' });
        response.updateContent({ content: new MarkdownString(' text after'), kind: 'markdownContent' });
        await assertSnapshot(response.value);
        assert.strictEqual(response.toString(), 'text before https://microsoft.com/ text after');
    });
    test('consolidated edit summary', () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('Some content before edits'), kind: 'markdownContent' });
        response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file1.ts'), edits: [], state: undefined, done: true });
        response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file2.ts'), edits: [], state: undefined, done: true });
        response.updateContent({ content: new MarkdownString('Some content after edits'), kind: 'markdownContent' });
        // Should have single "Made changes." at the end instead of multiple entries
        const responseString = response.toString();
        const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
        assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message');
        assert.ok(responseString.includes('Some content before edits'), 'Should include content before edits');
        assert.ok(responseString.includes('Some content after edits'), 'Should include content after edits');
        assert.ok(responseString.endsWith('Made changes.'), 'Should end with "Made changes."');
    });
    test('no edit summary when no edits', () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('Some content'), kind: 'markdownContent' });
        response.updateContent({ content: new MarkdownString('More content'), kind: 'markdownContent' });
        // Should not have "Made changes." when there are no edit groups
        const responseString = response.toString();
        assert.ok(!responseString.includes('Made changes.'), 'Should not include "Made changes." when no edits present');
        assert.strictEqual(responseString, 'Some contentMore content');
    });
    test('consolidated edit summary with clear operation', () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('Initial content'), kind: 'markdownContent' });
        response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file1.ts'), edits: [], state: undefined, done: true });
        response.updateContent({ kind: 'clearToPreviousToolInvocation', reason: 1 });
        response.updateContent({ content: new MarkdownString('Content after clear'), kind: 'markdownContent' });
        response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file2.ts'), edits: [], state: undefined, done: true });
        // Should only show "Made changes." for edits after the clear operation
        const responseString = response.toString();
        const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
        assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message after clear');
        assert.ok(responseString.includes('Content after clear'), 'Should include content after clear');
        assert.ok(!responseString.includes('Initial content'), 'Should not include content before clear');
        assert.ok(responseString.endsWith('Made changes.'), 'Should end with "Made changes."');
    });
    test('textEdit merges edits for same URI when not done', () => {
        const response = store.add(new Response([]));
        const uri = URI.parse('file:///file1.ts');
        response.updateContent({
            kind: 'textEdit',
            uri,
            edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
            done: false,
            isExternalEdit: true
        });
        response.updateContent({
            kind: 'textEdit',
            uri,
            edits: [{ range: new Range(2, 1, 2, 1), text: 'edit2' }],
            done: true
        });
        const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
        assert.strictEqual(textEditGroups.length, 1, 'Should have exactly one textEditGroup');
        assert.strictEqual(textEditGroups[0].edits.length, 2, 'Should have two edit batches merged');
        assert.strictEqual(textEditGroups[0].done, true, 'Should be marked as done after final edit');
        assert.strictEqual(textEditGroups[0].isExternalEdit, true, 'Should preserve isExternalEdit flag from first edit');
    });
    test('textEdit does not merge edits when previous is done', () => {
        const response = store.add(new Response([]));
        const uri = URI.parse('file:///file1.ts');
        response.updateContent({
            kind: 'textEdit',
            uri,
            edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
            done: true
        });
        response.updateContent({
            kind: 'textEdit',
            uri,
            edits: [{ range: new Range(2, 1, 2, 1), text: 'edit2' }],
            done: true
        });
        const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
        assert.strictEqual(textEditGroups.length, 2, 'Should have two separate textEditGroups');
    });
    test('textEdit does not merge edits for different URIs', () => {
        const response = store.add(new Response([]));
        response.updateContent({
            kind: 'textEdit',
            uri: URI.parse('file:///file1.ts'),
            edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
            done: false
        });
        response.updateContent({
            kind: 'textEdit',
            uri: URI.parse('file:///file2.ts'),
            edits: [{ range: new Range(1, 1, 1, 1), text: 'edit2' }],
            done: true
        });
        const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
        assert.strictEqual(textEditGroups.length, 2, 'Should have two separate textEditGroups for different URIs');
    });
    test('notebookEdit merges edits for same notebook URI when not done', () => {
        const response = store.add(new Response([]));
        const notebookUri = URI.parse('file:///notebook.ipynb');
        response.updateContent({
            kind: 'notebookEdit',
            uri: notebookUri,
            edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
            done: false,
            isExternalEdit: true
        });
        response.updateContent({
            kind: 'notebookEdit',
            uri: notebookUri,
            edits: [{ editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [] }],
            done: true
        });
        const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
        assert.strictEqual(notebookEditGroups.length, 1, 'Should have exactly one notebookEditGroup');
        assert.strictEqual(notebookEditGroups[0].edits.length, 2, 'Should have two edit batches merged');
        assert.strictEqual(notebookEditGroups[0].done, true, 'Should be marked as done after final edit');
        assert.strictEqual(notebookEditGroups[0].isExternalEdit, true, 'Should preserve isExternalEdit flag from first edit');
    });
    test('notebookEdit does not merge edits when previous is done', () => {
        const response = store.add(new Response([]));
        const notebookUri = URI.parse('file:///notebook.ipynb');
        response.updateContent({
            kind: 'notebookEdit',
            uri: notebookUri,
            edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
            done: true
        });
        response.updateContent({
            kind: 'notebookEdit',
            uri: notebookUri,
            edits: [{ editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [] }],
            done: true
        });
        const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
        assert.strictEqual(notebookEditGroups.length, 2, 'Should have two separate notebookEditGroups');
    });
    test('notebookEdit does not merge edits for different notebook URIs', () => {
        const response = store.add(new Response([]));
        response.updateContent({
            kind: 'notebookEdit',
            uri: URI.parse('file:///notebook1.ipynb'),
            edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
            done: false
        });
        response.updateContent({
            kind: 'notebookEdit',
            uri: URI.parse('file:///notebook2.ipynb'),
            edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
            done: true
        });
        const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
        assert.strictEqual(notebookEditGroups.length, 2, 'Should have two separate notebookEditGroups for different URIs');
    });
    test('textEdit to notebook cell creates notebookEditGroup', () => {
        const response = store.add(new Response([]));
        const notebookUri = URI.parse('file:///notebook.ipynb');
        const cellUri = CellUri.generate(notebookUri, 1);
        response.updateContent({
            kind: 'textEdit',
            uri: cellUri,
            edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
            done: true
        });
        const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
        const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
        assert.strictEqual(textEditGroups.length, 0, 'Should not have textEditGroup for cell edits');
        assert.strictEqual(notebookEditGroups.length, 1, 'Should have notebookEditGroup for cell edits');
    });
    test('external terminal tool updates preserve toolSpecificData when completing an existing invocation', () => {
        const response = store.add(new Response([]));
        const toolSpecificData = {
            kind: 'terminal',
            language: 'bash',
            commandLine: { original: 'npm test' },
            terminalCommandOutput: { text: 'all green' },
            terminalCommandState: { exitCode: 0 },
        };
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-call-1',
            toolName: 'run_in_terminal',
            isComplete: false,
            invocationMessage: 'Running npm test',
        });
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-call-1',
            toolName: 'run_in_terminal',
            isComplete: true,
            pastTenseMessage: 'Ran npm test',
            toolSpecificData,
        });
        assert.strictEqual(response.value.length, 1);
        assert.strictEqual(response.value[0].kind, 'toolInvocation');
        assert.deepStrictEqual(response.value[0].toolSpecificData, toolSpecificData);
        assert.strictEqual(IChatToolInvocation.isComplete(response.value[0]), true);
    });
    test('external terminal tool updates preserve toolSpecificData when first pushed as complete', () => {
        const response = store.add(new Response([]));
        const toolSpecificData = {
            kind: 'terminal',
            language: 'bash',
            commandLine: { original: 'npm test' },
            terminalCommandOutput: { text: 'all green' },
            terminalCommandState: { exitCode: 0 },
        };
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-call-2',
            toolName: 'run_in_terminal',
            isComplete: true,
            invocationMessage: 'Running npm test',
            pastTenseMessage: 'Ran npm test',
            toolSpecificData,
        });
        assert.strictEqual(response.value.length, 1);
        assert.strictEqual(response.value[0].kind, 'toolInvocation');
        assert.deepStrictEqual(response.value[0].toolSpecificData, toolSpecificData);
        assert.strictEqual(IChatToolInvocation.isComplete(response.value[0]), true);
    });
    test('response stringification prefers terminal display command over sandbox wrapper', () => {
        const response = store.add(new Response([]));
        const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" -c 'npm test'`;
        const toolSpecificData = {
            kind: 'terminal',
            language: 'bash',
            commandLine: {
                original: sandboxWrappedCommand,
                toolEdited: sandboxWrappedCommand,
                forDisplay: 'npm test',
                isSandboxWrapped: true,
            },
            terminalCommandOutput: { text: 'all green' },
            terminalCommandState: { exitCode: 0 },
        };
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-call-display-command',
            toolName: 'run_in_terminal',
            isComplete: true,
            pastTenseMessage: 'Ran npm test',
            toolSpecificData,
        });
        const responseString = response.toString();
        assert.strictEqual(responseString, 'Ran terminal command: npm test');
        assert.ok(!responseString.includes('sandbox-runtime'));
        assert.ok(!responseString.includes('ELECTRON_RUN_AS_NODE=1'));
    });
    test('response stringification prefers terminal presentation override over display command', () => {
        const response = store.add(new Response([]));
        const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" -c 'python -c "print(1)"'`;
        const toolSpecificData = {
            kind: 'terminal',
            language: 'python',
            commandLine: {
                original: sandboxWrappedCommand,
                toolEdited: sandboxWrappedCommand,
                forDisplay: 'python -c "print(1)"',
                isSandboxWrapped: true,
            },
            presentationOverrides: {
                commandLine: 'print(1)',
                language: 'python',
            },
            terminalCommandOutput: { text: '1' },
            terminalCommandState: { exitCode: 0 },
        };
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-call-presentation-override',
            toolName: 'run_in_terminal',
            isComplete: true,
            pastTenseMessage: 'Ran python command',
            toolSpecificData,
        });
        const responseString = response.toString();
        assert.strictEqual(responseString, 'Ran terminal command: print(1)');
        assert.ok(!responseString.includes('sandbox-runtime'));
        assert.ok(!responseString.includes('python -c "print(1)"'));
    });
    test('getFinalResponse returns last contiguous markdown after tool call', () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('Early text'), kind: 'markdownContent' });
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-1',
            toolName: 'some_tool',
            isComplete: true,
            invocationMessage: 'Ran tool',
        });
        response.updateContent({ content: new MarkdownString('Final text'), kind: 'markdownContent' });
        assert.strictEqual(response.getFinalResponse(), 'Final text');
    });
    test('getFinalResponse skips trailing empty markdown and tool calls', () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('Before tool'), kind: 'markdownContent' });
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-1',
            toolName: 'some_tool',
            isComplete: true,
            invocationMessage: 'Ran tool',
        });
        response.updateContent({ content: new MarkdownString('The answer is 42.'), kind: 'markdownContent' });
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-2',
            toolName: 'some_tool',
            isComplete: true,
            invocationMessage: 'Ran another tool',
        });
        response.updateContent({ content: new MarkdownString(''), kind: 'markdownContent' });
        assert.strictEqual(response.getFinalResponse(), 'The answer is 42.');
    });
    test('getFinalResponse includes inline references in final block', () => {
        const response = store.add(new Response([]));
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-1',
            toolName: 'some_tool',
            isComplete: true,
            invocationMessage: 'Ran tool',
        });
        response.updateContent({ content: new MarkdownString('See '), kind: 'markdownContent' });
        response.updateContent({ inlineReference: URI.parse('https://example.com/'), kind: 'inlineReference' });
        response.updateContent({ content: new MarkdownString(' for details.'), kind: 'markdownContent' });
        assert.strictEqual(response.getFinalResponse(), 'See https://example.com/ for details.');
    });
    test('getFinalResponse returns empty string when no markdown', () => {
        const response = store.add(new Response([]));
        response.updateContent({
            kind: 'externalToolInvocationUpdate',
            toolCallId: 'tool-1',
            toolName: 'some_tool',
            isComplete: true,
            invocationMessage: 'Ran tool',
        });
        assert.strictEqual(response.getFinalResponse(), '');
    });
    test('getFinalResponse returns all markdown when there are no tool calls', () => {
        const response = store.add(new Response([]));
        response.updateContent({ content: new MarkdownString('Hello '), kind: 'markdownContent' });
        response.updateContent({ content: new MarkdownString('World'), kind: 'markdownContent' });
        assert.strictEqual(response.getFinalResponse(), 'Hello World');
    });
});
suite('normalizeSerializableChatData', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('v1', () => {
        const v1Data = {
            creationDate: Date.now(),
            initialLocation: undefined,
            requests: [],
            responderUsername: 'bot',
            sessionId: 'session1',
        };
        const newData = normalizeSerializableChatData(v1Data);
        assert.strictEqual(newData.creationDate, v1Data.creationDate);
        assert.strictEqual(newData.version, 3);
    });
    test('v2', () => {
        const v2Data = {
            version: 2,
            creationDate: 100,
            initialLocation: undefined,
            requests: [],
            responderUsername: 'bot',
            sessionId: 'session1',
            computedTitle: 'computed title'
        };
        const newData = normalizeSerializableChatData(v2Data);
        assert.strictEqual(newData.version, 3);
        assert.strictEqual(newData.creationDate, v2Data.creationDate);
        assert.strictEqual(newData.customTitle, v2Data.computedTitle);
    });
    test('old bad data', () => {
        const v1Data = {
            // Testing the scenario where these are missing
            sessionId: undefined,
            creationDate: undefined,
            initialLocation: undefined,
            requests: [],
            responderUsername: 'bot',
        };
        const newData = normalizeSerializableChatData(v1Data);
        assert.strictEqual(newData.version, 3);
        assert.ok(newData.creationDate > 0);
        assert.ok(newData.sessionId);
    });
    test('v3 with bug', () => {
        const v3Data = {
            // Test case where old data was wrongly normalized and these fields were missing
            creationDate: undefined,
            version: 3,
            initialLocation: undefined,
            requests: [],
            responderUsername: 'bot',
            sessionId: 'session1',
            customTitle: 'computed title'
        };
        const newData = normalizeSerializableChatData(v3Data);
        assert.strictEqual(newData.version, 3);
        assert.ok(newData.creationDate > 0);
        assert.ok(newData.sessionId);
    });
});
suite('isExportableSessionData', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('valid exportable data', () => {
        const validData = {
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
            responderUsername: 'bot',
        };
        assert.strictEqual(isExportableSessionData(validData), true);
    });
    test('invalid - missing requests', () => {
        const invalidData = {
            initialLocation: ChatAgentLocation.Chat,
            responderUsername: 'bot',
        };
        assert.strictEqual(isExportableSessionData(invalidData), false);
    });
    test('invalid - requests not array', () => {
        const invalidData = {
            initialLocation: ChatAgentLocation.Chat,
            requests: 'not-an-array',
            responderUsername: 'bot',
        };
        assert.strictEqual(isExportableSessionData(invalidData), false);
    });
    test('invalid - missing responderUsername', () => {
        const invalidData = {
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
        };
        assert.strictEqual(isExportableSessionData(invalidData), false);
    });
    test('invalid - responderUsername not string', () => {
        const invalidData = {
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
            responderUsername: 123,
        };
        assert.strictEqual(isExportableSessionData(invalidData), false);
    });
    test('invalid - null', () => {
        assert.strictEqual(isExportableSessionData(null), false);
    });
    test('invalid - undefined', () => {
        assert.strictEqual(isExportableSessionData(undefined), false);
    });
});
suite('isSerializableSessionData', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('valid serializable data', () => {
        const validData = {
            version: 3,
            sessionId: 'session1',
            creationDate: Date.now(),
            customTitle: undefined,
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
            responderUsername: 'bot',
        };
        assert.strictEqual(isSerializableSessionData(validData), true);
    });
    test('valid - with usedContext', () => {
        const validData = {
            version: 3,
            sessionId: 'session1',
            creationDate: Date.now(),
            customTitle: undefined,
            initialLocation: ChatAgentLocation.Chat,
            requests: [{
                    requestId: 'req1',
                    message: 'test',
                    variableData: { variables: [] },
                    response: undefined,
                    usedContext: { documents: [], kind: 'usedContext' }
                }],
            responderUsername: 'bot',
        };
        assert.strictEqual(isSerializableSessionData(validData), true);
    });
    test('invalid - missing sessionId', () => {
        const invalidData = {
            version: 3,
            creationDate: Date.now(),
            customTitle: undefined,
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
            responderUsername: 'bot',
        };
        assert.strictEqual(isSerializableSessionData(invalidData), false);
    });
    test('invalid - missing creationDate', () => {
        const invalidData = {
            version: 3,
            sessionId: 'session1',
            customTitle: undefined,
            initialLocation: ChatAgentLocation.Chat,
            requests: [],
            responderUsername: 'bot',
        };
        assert.strictEqual(isSerializableSessionData(invalidData), false);
    });
    test('invalid - not exportable', () => {
        const invalidData = {
            version: 3,
            sessionId: 'session1',
            creationDate: Date.now(),
            customTitle: undefined,
            initialLocation: ChatAgentLocation.Chat,
            requests: 'not-an-array',
            responderUsername: 'bot',
        };
        assert.strictEqual(isSerializableSessionData(invalidData), false);
    });
});
suite('ChatResponseModel', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    setup(async () => {
        instantiationService = testDisposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IExtensionService, new TestExtensionService());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
        instantiationService.stub(IConfigurationService, new TestConfigurationService());
        instantiationService.stub(IChatService, new MockChatService());
    });
    test('timestamp and confirmationAdjustedTimestamp', async () => {
        const clock = sinon.useFakeTimers();
        try {
            const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
            const start = Date.now();
            const text = 'hello';
            const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
            const response = request.response;
            assert.strictEqual(response.timestamp, start);
            assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
            // Advance time, no pending confirmation
            clock.tick(1000);
            assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
            // Add pending confirmation via tool invocation
            const toolState = observableValue('state', { type: 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */, confirmationMessages: { title: 'Please confirm' } });
            const toolInvocation = {
                kind: 'toolInvocation',
                invocationMessage: 'calling tool',
                state: toolState
            };
            model.acceptResponseProgress(request, toolInvocation);
            // Advance time while pending
            clock.tick(2000);
            // Timestamp should still be start (it includes the wait time while waiting)
            assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
            // Resolve confirmation
            toolState.set({ type: 4 /* IChatToolInvocation.StateKind.Completed */ }, undefined);
            // Now adjusted timestamp should reflect the wait time
            // The wait time was 2000ms.
            // confirmationAdjustedTimestamp = start + waitTime = start + 2000
            assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2000);
            // Advance time again
            clock.tick(1000);
            assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2000);
        }
        finally {
            clock.restore();
        }
    });
});
suite('ChatModel - Pending Requests', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    function createModel() {
        return testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    }
    function addRequestToModel(model, text) {
        return model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    }
    setup(async () => {
        instantiationService = testDisposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IExtensionService, new TestExtensionService());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
        instantiationService.stub(IConfigurationService, new TestConfigurationService());
        instantiationService.stub(IChatService, new MockChatService());
    });
    test('addPendingRequest - queued messages are added at the end', () => {
        const model = createModel();
        const request1 = addRequestToModel(model, 'first');
        const request2 = addRequestToModel(model, 'second');
        model.addPendingRequest(request1, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.addPendingRequest(request2, "queued" /* ChatRequestQueueKind.Queued */, {});
        const pending = model.getPendingRequests();
        assert.strictEqual(pending.length, 2);
        assert.strictEqual(pending[0].request.id, request1.id);
        assert.strictEqual(pending[1].request.id, request2.id);
    });
    test('addPendingRequest - steering messages are inserted before queued messages', () => {
        const model = createModel();
        const queued = addRequestToModel(model, 'queued');
        const steering = addRequestToModel(model, 'steering');
        model.addPendingRequest(queued, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.addPendingRequest(steering, "steering" /* ChatRequestQueueKind.Steering */, {});
        const pending = model.getPendingRequests();
        assert.strictEqual(pending.length, 2);
        assert.strictEqual(pending[0].request.id, steering.id);
        assert.strictEqual(pending[0].kind, "steering" /* ChatRequestQueueKind.Steering */);
        assert.strictEqual(pending[1].request.id, queued.id);
        assert.strictEqual(pending[1].kind, "queued" /* ChatRequestQueueKind.Queued */);
    });
    test('addPendingRequest - multiple steering messages maintain order', () => {
        const model = createModel();
        const [steering1, steering2, queued] = ['s1', 's2', 'q'].map(t => addRequestToModel(model, t));
        model.addPendingRequest(queued, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.addPendingRequest(steering1, "steering" /* ChatRequestQueueKind.Steering */, {});
        model.addPendingRequest(steering2, "steering" /* ChatRequestQueueKind.Steering */, {});
        const pending = model.getPendingRequests();
        assert.strictEqual(pending.length, 3);
        assert.strictEqual(pending[0].request.id, steering1.id);
        assert.strictEqual(pending[1].request.id, steering2.id);
        assert.strictEqual(pending[2].request.id, queued.id);
    });
    test('addPendingRequest - fires onDidChangePendingRequests event', () => {
        const model = createModel();
        const request = addRequestToModel(model, 'test');
        let eventFired = false;
        testDisposables.add(model.onDidChangePendingRequests(() => { eventFired = true; }));
        model.addPendingRequest(request, "queued" /* ChatRequestQueueKind.Queued */, {});
        assert.strictEqual(eventFired, true);
    });
    test('removePendingRequest - removes specified request', () => {
        const model = createModel();
        const [request1, request2] = ['r1', 'r2'].map(t => addRequestToModel(model, t));
        model.addPendingRequest(request1, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.addPendingRequest(request2, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.removePendingRequest(request1.id);
        const pending = model.getPendingRequests();
        assert.strictEqual(pending.length, 1);
        assert.strictEqual(pending[0].request.id, request2.id);
    });
    test('removePendingRequest - no-op for non-existent request', () => {
        const model = createModel();
        const request = addRequestToModel(model, 'test');
        model.addPendingRequest(request, "queued" /* ChatRequestQueueKind.Queued */, {});
        let eventCount = 0;
        testDisposables.add(model.onDidChangePendingRequests(() => { eventCount++; }));
        model.removePendingRequest('non-existent-id');
        assert.strictEqual(model.getPendingRequests().length, 1);
        assert.strictEqual(eventCount, 0);
    });
    test('dequeuePendingRequest - returns and removes first request', () => {
        const model = createModel();
        const [request1, request2] = ['r1', 'r2'].map(t => addRequestToModel(model, t));
        model.addPendingRequest(request1, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.addPendingRequest(request2, "queued" /* ChatRequestQueueKind.Queued */, {});
        const dequeued = model.dequeuePendingRequest();
        assert.strictEqual(dequeued?.request.id, request1.id);
        assert.strictEqual(model.getPendingRequests().length, 1);
        assert.strictEqual(model.getPendingRequests()[0].request.id, request2.id);
    });
    test('dequeuePendingRequest - returns undefined when empty', () => {
        const model = createModel();
        assert.strictEqual(model.dequeuePendingRequest(), undefined);
    });
    test('dequeuePendingRequest - fires event when request dequeued', () => {
        const model = createModel();
        const request = addRequestToModel(model, 'test');
        model.addPendingRequest(request, "queued" /* ChatRequestQueueKind.Queued */, {});
        let eventFired = false;
        testDisposables.add(model.onDidChangePendingRequests(() => { eventFired = true; }));
        model.dequeuePendingRequest();
        assert.strictEqual(eventFired, true);
    });
    test('clearPendingRequests - removes all pending requests', () => {
        const model = createModel();
        ['r1', 'r2', 'r3'].forEach(t => {
            model.addPendingRequest(addRequestToModel(model, t), "queued" /* ChatRequestQueueKind.Queued */, {});
        });
        model.clearPendingRequests();
        assert.strictEqual(model.getPendingRequests().length, 0);
    });
    test('clearPendingRequests - no event when already empty', () => {
        const model = createModel();
        let eventFired = false;
        testDisposables.add(model.onDidChangePendingRequests(() => { eventFired = true; }));
        model.clearPendingRequests();
        assert.strictEqual(eventFired, false);
    });
    test('setPendingRequests - reorders existing pending requests', () => {
        const model = createModel();
        const [r1, r2, r3] = ['r1', 'r2', 'r3'].map(t => addRequestToModel(model, t));
        model.addPendingRequest(r1, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.addPendingRequest(r2, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.addPendingRequest(r3, "steering" /* ChatRequestQueueKind.Steering */, {});
        // Reverse the order
        model.setPendingRequests([
            { requestId: r2.id, kind: "queued" /* ChatRequestQueueKind.Queued */ },
            { requestId: r1.id, kind: "steering" /* ChatRequestQueueKind.Steering */ }, // Change kind
        ]);
        const pending = model.getPendingRequests();
        assert.strictEqual(pending.length, 2);
        assert.strictEqual(pending[0].request.id, r2.id);
        assert.strictEqual(pending[1].request.id, r1.id);
        assert.strictEqual(pending[1].kind, "steering" /* ChatRequestQueueKind.Steering */);
    });
    test('setPendingRequests - ignores non-existent request IDs', () => {
        const model = createModel();
        const request = addRequestToModel(model, 'test');
        model.addPendingRequest(request, "queued" /* ChatRequestQueueKind.Queued */, {});
        model.setPendingRequests([
            { requestId: 'non-existent', kind: "queued" /* ChatRequestQueueKind.Queued */ },
            { requestId: request.id, kind: "queued" /* ChatRequestQueueKind.Queued */ },
        ]);
        const pending = model.getPendingRequests();
        assert.strictEqual(pending.length, 1);
        assert.strictEqual(pending[0].request.id, request.id);
    });
    test('pending requests preserve send options', () => {
        const model = createModel();
        const request = addRequestToModel(model, 'test');
        const sendOptions = { agentId: 'test-agent', attempt: 3 };
        const pending = model.addPendingRequest(request, "queued" /* ChatRequestQueueKind.Queued */, sendOptions);
        assert.strictEqual(pending.sendOptions.agentId, 'test-agent');
        assert.strictEqual(pending.sendOptions.attempt, 3);
    });
});
suite('ChatResponseResource', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('createUri roundtrips through parseUri without basename', () => {
        const sessionResource = URI.parse('vscode-chat-session://local/session1');
        const uri = ChatResponseResource.createUri(sessionResource, 'call-123', 2);
        const parsed = ChatResponseResource.parseUri(uri);
        assert.ok(parsed);
        assert.strictEqual(parsed.sessionResource.toString(), sessionResource.toString());
        assert.strictEqual(parsed.toolCallId, 'call-123');
        assert.strictEqual(parsed.index, 2);
    });
    test('createUri roundtrips through parseUri with basename', () => {
        const sessionResource = URI.parse('vscode-chat-session://local/session1');
        const uri = ChatResponseResource.createUri(sessionResource, 'call-456', 0, 'file.txt');
        const parsed = ChatResponseResource.parseUri(uri);
        assert.ok(parsed);
        assert.strictEqual(parsed.sessionResource.toString(), sessionResource.toString());
        assert.strictEqual(parsed.toolCallId, 'call-456');
        assert.strictEqual(parsed.index, 0);
    });
    test('parseUri rejects paths with fewer than 4 segments', () => {
        // path "/tool/callId/0" splits into ['', 'tool', 'callId', '0'] = 4 parts => valid
        // path "/tool/callId" splits into ['', 'tool', 'callId'] = 3 parts => invalid
        const base = URI.from({ scheme: ChatResponseResource.scheme, authority: 'abc', path: '/tool/callId' });
        assert.strictEqual(ChatResponseResource.parseUri(base), undefined);
        const tooShort = URI.from({ scheme: ChatResponseResource.scheme, authority: 'abc', path: '/tool' });
        assert.strictEqual(ChatResponseResource.parseUri(tooShort), undefined);
        const empty = URI.from({ scheme: ChatResponseResource.scheme, authority: 'abc', path: '/' });
        assert.strictEqual(ChatResponseResource.parseUri(empty), undefined);
    });
    test('parseUri rejects wrong scheme', () => {
        const uri = URI.from({ scheme: 'file', path: '/tool/callId/0' });
        assert.strictEqual(ChatResponseResource.parseUri(uri), undefined);
    });
    test('parseUri rejects wrong kind', () => {
        const uri = URI.from({ scheme: ChatResponseResource.scheme, authority: 'abc', path: '/notTool/callId/0' });
        assert.strictEqual(ChatResponseResource.parseUri(uri), undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL21vZGVsL2NoYXRNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDekYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDbkgsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztB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