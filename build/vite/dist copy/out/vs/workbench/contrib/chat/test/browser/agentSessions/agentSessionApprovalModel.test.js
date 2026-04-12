/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionApprovalModel } from '../../../browser/agentSessions/agentSessionApprovalModel.js';
import { MockChatModel } from '../../common/model/mockChatModel.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
function makeToolInvocationPart(options) {
    return {
        kind: 'toolInvocation',
        presentation: undefined,
        originMessage: undefined,
        invocationMessage: options.invocationMessage ?? 'Running tool...',
        pastTenseMessage: undefined,
        source: undefined,
        toolId: 'test-tool',
        toolCallId: 'call-1',
        state: observableValue('toolState', options.state),
        toolSpecificData: options.toolSpecificData,
        isAttachedToThinking: false,
        toJSON: () => undefined,
    };
}
function makeTerminalToolData(overrides) {
    return {
        kind: 'terminal',
        commandLine: { original: 'echo hello' },
        language: 'sh',
        ...overrides,
    };
}
function makeWaitingState(confirm) {
    return {
        type: 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */,
        parameters: {},
        confirm: confirm ?? (() => { }),
    };
}
function makePostApprovalState(confirm) {
    return {
        type: 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */,
        parameters: {},
        confirmed: { type: 4 /* ToolConfirmKind.UserAction */ },
        resultDetails: undefined,
        confirm: confirm ?? (() => { }),
        contentForModel: [],
    };
}
function makeExecutingState() {
    return {
        type: 2 /* IChatToolInvocation.StateKind.Executing */,
        parameters: {},
        confirmed: { type: 4 /* ToolConfirmKind.UserAction */ },
        progress: observableValue('progress', { message: undefined, progress: undefined }),
    };
}
/** Creates a minimal mock that satisfies the response chain: lastRequest.response.response.value */
function mockModelWithResponse(model, parts) {
    const response = {
        response: { value: parts, getMarkdown: () => '', getFinalResponse: () => '', toString: () => '' },
    };
    const request = {
        response: response,
    };
    model.lastRequest = request;
}
class MockLanguageService {
    getLanguageIdByLanguageName(name) {
        switch (name) {
            case 'bash': return 'sh';
            case 'python': return 'python';
            case 'powershell': return 'pwsh';
            default: return name;
        }
    }
}
suite('AgentSessionApprovalModel', () => {
    const disposables = new DisposableStore();
    let chatService;
    let chatModelsObs;
    let langservice;
    setup(() => {
        chatService = new MockChatService();
        langservice = new MockLanguageService();
        chatModelsObs = chatService.chatModels;
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createModel() {
        const model = new AgentSessionApprovalModel(chatService, langservice);
        disposables.add(model);
        return model;
    }
    function addChatModel(uri) {
        const chatModel = disposables.add(new MockChatModel(uri ?? URI.parse(`test://session/${Math.random()}`)));
        chatModelsObs.set([...Array.from(chatModelsObs.get()), chatModel], undefined);
        return chatModel;
    }
    function getApproval(approvalModel, chatModel) {
        return approvalModel.getApproval(chatModel.sessionResource).get();
    }
    test('returns undefined when no models exist', () => {
        const approvalModel = createModel();
        const result = approvalModel.getApproval(URI.parse('test://nonexistent')).get();
        assert.strictEqual(result, undefined);
    });
    test('returns undefined when model has no requestNeedsInput', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
    test('returns undefined when requestNeedsInput is set but no response exists', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
    test('returns undefined when response has no tool invocation parts', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        mockModelWithResponse(chatModel, []);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
    test('returns undefined when tool invocation is in Executing state', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({ state: makeExecutingState() });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
    test('returns approval info for WaitingForConfirmation state with terminal data', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData(),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        const result = getApproval(approvalModel, chatModel);
        assert.deepStrictEqual({
            label: result?.label,
            language: result?.languageId,
        }, {
            label: 'echo hello',
            language: 'sh',
        });
    });
    test('returns approval info for WaitingForPostApproval state', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makePostApprovalState(),
            toolSpecificData: makeTerminalToolData({ commandLine: { original: 'npm install' } }),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        const result = getApproval(approvalModel, chatModel);
        assert.deepStrictEqual({
            label: result?.label,
            language: result?.languageId,
        }, {
            label: 'npm install',
            language: 'sh',
        });
    });
    test('prefers presentationOverrides.commandLine and language', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({
                commandLine: { original: 'python -c "print(1)"' },
                language: 'sh',
                presentationOverrides: { commandLine: 'print(1)', language: 'python' },
            }),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        const result = getApproval(approvalModel, chatModel);
        assert.deepStrictEqual({
            label: result?.label,
            language: result?.languageId,
        }, {
            label: 'print(1)',
            language: 'python',
        });
    });
    test('uses forDisplay from commandLine when available', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({
                commandLine: { original: 'echo raw', forDisplay: 'echo display' },
            }),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel)?.label, 'echo display');
    });
    test('uses userEdited from commandLine when forDisplay is not set', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({
                commandLine: { original: 'orig', userEdited: 'user-edited' },
            }),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel)?.label, 'user-edited');
    });
    test('uses toolEdited from commandLine as fallback', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({
                commandLine: { original: 'orig', toolEdited: 'tool-edited' },
            }),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel)?.label, 'tool-edited');
    });
    test('uses needsInput.detail when tool is not terminal', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({ state: makeWaitingState() });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test', detail: 'Custom detail message' }, undefined);
        const result = getApproval(approvalModel, chatModel);
        assert.deepStrictEqual({
            label: result?.label,
            language: result?.languageId,
        }, {
            label: 'Custom detail message',
            language: undefined,
        });
    });
    test('uses invocationMessage string when no terminal data and no detail', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            invocationMessage: 'Searching files...',
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        const result = getApproval(approvalModel, chatModel);
        assert.deepStrictEqual({
            label: result?.label,
            language: result?.languageId,
        }, {
            label: 'Searching files...',
            language: undefined,
        });
    });
    test('uses invocationMessage MarkdownString when no terminal data and no detail', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            invocationMessage: new MarkdownString('**Running** tool'),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel)?.label, 'Running tool');
    });
    test('confirm() delegates to tool state confirm with UserAction', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        let confirmedWith;
        const part = makeToolInvocationPart({
            state: makeWaitingState(reason => { confirmedWith = reason; }),
            toolSpecificData: makeTerminalToolData(),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        getApproval(approvalModel, chatModel)?.confirm();
        assert.deepStrictEqual(confirmedWith, { type: 4 /* ToolConfirmKind.UserAction */ });
    });
    test('reacts to requestNeedsInput becoming undefined', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData(),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.ok(getApproval(approvalModel, chatModel));
        chatModel.requestNeedsInput.set(undefined, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
    test('reacts to tool state changing from waiting to executing', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const stateObs = observableValue('toolState', makeWaitingState());
        const part = {
            ...makeToolInvocationPart({ state: makeWaitingState(), toolSpecificData: makeTerminalToolData() }),
            state: stateObs,
        };
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.ok(getApproval(approvalModel, chatModel));
        stateObs.set(makeExecutingState(), undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
    test('tracks multiple models independently', () => {
        const approvalModel = createModel();
        const chatModel1 = addChatModel(URI.parse('test://session/1'));
        const chatModel2 = addChatModel(URI.parse('test://session/2'));
        const part1 = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({ commandLine: { original: 'cmd1' } }),
        });
        mockModelWithResponse(chatModel1, [part1]);
        chatModel1.requestNeedsInput.set({ title: 'Session 1' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel1)?.label, 'cmd1');
        assert.strictEqual(getApproval(approvalModel, chatModel2), undefined);
    });
    test('clears approval when model is removed', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData(),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.ok(getApproval(approvalModel, chatModel));
        // Remove model from chatModels
        chatModelsObs.set([], undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
    test('picks the first WaitingForConfirmation part when multiple parts exist', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const executingPart = makeToolInvocationPart({ state: makeExecutingState() });
        const waitingPart = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({ commandLine: { original: 'second-cmd' } }),
        });
        mockModelWithResponse(chatModel, [executingPart, waitingPart]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel)?.label, 'second-cmd');
    });
    test('handles model added after approval model is created', () => {
        const approvalModel = createModel();
        // No models yet
        const uri = URI.parse('test://session/late');
        assert.strictEqual(approvalModel.getApproval(uri).get(), undefined);
        // Add model later
        const chatModel = addChatModel(uri);
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({ commandLine: { original: 'late-cmd' } }),
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel)?.label, 'late-cmd');
    });
    test('handles legacy terminal tool data', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        // Legacy format has `command` instead of `commandLine`
        const legacyData = { kind: 'terminal', command: 'legacy-cmd', language: 'bash' };
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: legacyData,
        });
        mockModelWithResponse(chatModel, [part]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        const result = getApproval(approvalModel, chatModel);
        assert.deepStrictEqual({
            label: result?.label,
            language: result?.languageId,
        }, {
            label: 'legacy-cmd',
            language: 'sh',
        });
    });
    test('observable is reused for the same session resource', () => {
        const approvalModel = createModel();
        const uri = URI.parse('test://session/same');
        const obs1 = approvalModel.getApproval(uri);
        const obs2 = approvalModel.getApproval(uri);
        assert.strictEqual(obs1, obs2);
    });
    test('skips non-toolInvocation parts', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        const markdownPart = { kind: 'markdownContent', content: new MarkdownString('hello') };
        const waitingPart = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData({ commandLine: { original: 'the-cmd' } }),
        });
        mockModelWithResponse(chatModel, [markdownPart, waitingPart]);
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel)?.label, 'the-cmd');
    });
    test('updating requestNeedsInput triggers re-evaluation', () => {
        const approvalModel = createModel();
        const chatModel = addChatModel();
        // Initially no requestNeedsInput
        const part = makeToolInvocationPart({
            state: makeWaitingState(),
            toolSpecificData: makeTerminalToolData(),
        });
        mockModelWithResponse(chatModel, [part]);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
        // Set requestNeedsInput
        chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);
        assert.ok(getApproval(approvalModel, chatModel));
        // Clear again
        chatModel.requestNeedsInput.set(undefined, undefined);
        assert.strictEqual(getApproval(approvalModel, chatModel), undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQXVCLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLHlCQUF5QixFQUE2QixNQUFNLDZEQUE2RCxDQUFDO0FBQ25JLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFLOUUsU0FBUyxzQkFBc0IsQ0FBQyxPQUkvQjtJQUNBLE9BQU87UUFDTixJQUFJLEVBQUUsZ0JBQWdCO1FBQ3RCLFlBQVksRUFBRSxTQUFVO1FBQ3hCLGFBQWEsRUFBRSxTQUFTO1FBQ3hCLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsSUFBSSxpQkFBaUI7UUFDakUsZ0JBQWdCLEVBQUUsU0FBUztRQUMzQixNQUFNLEVBQUUsU0FBVTtRQUNsQixNQUFNLEVBQUUsV0FBVztRQUNuQixVQUFVLEVBQUUsUUFBUTtRQUNwQixLQUFLLEVBQUUsZUFBZSxDQUFDLFdBQVcsRUFB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