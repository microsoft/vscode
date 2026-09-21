/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { agentSessionApprovalId, AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../browser/agentSessions/agentSessionApprovalModel.js';
import { MockChatModel } from '../../common/model/mockChatModel.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { IChatService, IChatToolInvocation, IChatTerminalToolInvocationData, ToolConfirmKind, ConfirmedReason } from '../../../common/chatService/chatService.js';
import { ChatModel, IChatChangeEvent, IChatModel, IChatRequestModel, IChatResponseModel, IResponse, IChatProgressResponseContent } from '../../../common/model/chatModel.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

function makeToolInvocationPart(options: {
	state: IChatToolInvocation.State;
	toolSpecificData?: IChatToolInvocation['toolSpecificData'];
	invocationMessage?: string | MarkdownString;
	toolCallId?: string;
}): IChatToolInvocation {
	return {
		kind: 'toolInvocation',
		presentation: undefined!,
		originMessage: undefined,
		invocationMessage: options.invocationMessage ?? 'Running tool...',
		pastTenseMessage: undefined,
		source: undefined!,
		toolId: 'test-tool',
		toolCallId: options.toolCallId ?? 'call-1',
		state: observableValue('toolState', options.state),
		toolSpecificData: options.toolSpecificData,
		toolSpecificDataKind: observableValue('test', options.toolSpecificData?.kind),
		isAttachedToThinking: false,
		toJSON: () => undefined!,
	};
}

function makeTerminalToolData(overrides?: Partial<IChatTerminalToolInvocationData>): IChatTerminalToolInvocationData {
	return {
		kind: 'terminal',
		commandLine: { original: 'echo hello' },
		language: 'sh',
		...overrides,
	};
}

function makeWaitingState(confirm?: (reason: ConfirmedReason) => void): IChatToolInvocation.State {
	return {
		type: IChatToolInvocation.StateKind.WaitingForConfirmation,
		parameters: {},
		confirm: confirm ?? (() => { }),
	} as IChatToolInvocation.State;
}

function makePostApprovalState(confirm?: (reason: ConfirmedReason) => void): IChatToolInvocation.State {
	return {
		type: IChatToolInvocation.StateKind.WaitingForPostApproval,
		parameters: {},
		confirmed: { type: ToolConfirmKind.UserAction },
		resultDetails: undefined,
		confirm: confirm ?? (() => { }),
		contentForModel: [],
	} as IChatToolInvocation.State;
}

function makeExecutingState(): IChatToolInvocation.State {
	return {
		type: IChatToolInvocation.StateKind.Executing,
		parameters: {},
		confirmed: { type: ToolConfirmKind.UserAction },
		progress: observableValue('progress', { message: undefined, progress: undefined }),
	} as IChatToolInvocation.State;
}

class TestChatModel extends MockChatModel {
	private readonly _onRequestsChanged = this._register(new Emitter<IChatChangeEvent>());
	override readonly onDidChange = this._onRequestsChanged.event;

	override getRequests(): IChatRequestModel[] { return this.requests; }

	setRequest(request: IChatRequestModel): void {
		this.requests = [request];
		this._onRequestsChanged.fire({ kind: 'addRequest', request });
	}
}

function mockModelWithResponse(model: TestChatModel, parts: IChatProgressResponseContent[]): void {
	const response = upcastPartial<IChatResponseModel>({
		response: { value: parts, getMarkdown: () => '', getFinalResponse: () => '', toString: () => '' } satisfies IResponse,
		onDidChange: Event.None,
		isPendingConfirmation: model.requestNeedsInput.map(info => info ? { startedWaitingAt: 0, detail: info.detail } : undefined),
	});
	model.setRequest(upcastPartial<IChatRequestModel>({ id: 'request', response }));
}

class MockLanguageService {
	getLanguageIdByLanguageName(name: string): string | undefined {
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
	let chatService: MockChatService;
	let chatModelsObs: ISettableObservable<Iterable<IChatModel>>;
	let langservice: MockLanguageService;

	setup(() => {
		chatService = new MockChatService();
		langservice = new MockLanguageService();
		chatModelsObs = chatService.chatModels as ISettableObservable<Iterable<IChatModel>>;
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(): AgentSessionApprovalModel {
		const model = new AgentSessionApprovalModel(chatService, langservice as ILanguageService);
		disposables.add(model);
		return model;
	}

	function addChatModel(uri?: URI): TestChatModel {
		const chatModel = disposables.add(new TestChatModel(uri ?? URI.parse(`test://session/${Math.random()}`)));
		chatModelsObs.set([...Array.from(chatModelsObs.get()), chatModel], undefined);
		return chatModel;
	}

	function addLiveChatModel(): ChatModel {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChatService, chatService);
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		chatModelsObs.set([...chatModelsObs.get(), model], undefined);
		return model;
	}

	function pendingSubagentTool(toolCallId: string): ChatToolInvocation {
		return new ChatToolInvocation({
			invocationMessage: `Run ${toolCallId}`,
			confirmationMessages: { title: 'Run in terminal?', message: new MarkdownString(toolCallId) },
			toolSpecificData: { kind: 'terminal', commandLine: { original: toolCallId }, language: 'sh' },
		}, { id: 'bash', displayName: 'Run Shell Command', modelDescription: 'Test command', source: ToolDataSource.Internal },
			toolCallId, 'retained-agent', {});
	}

	function getApproval(approvalModel: AgentSessionApprovalModel, chatModel: IChatModel): IAgentSessionApprovalInfo | undefined {
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

		let confirmedWith: ConfirmedReason | undefined;
		const part = makeToolInvocationPart({
			state: makeWaitingState(reason => { confirmedWith = reason; }),
			toolSpecificData: makeTerminalToolData(),
		});
		mockModelWithResponse(chatModel, [part]);
		chatModel.requestNeedsInput.set({ title: 'Test' }, undefined);

		getApproval(approvalModel, chatModel)?.confirm();
		assert.deepStrictEqual(confirmedWith, { type: ToolConfirmKind.UserAction });
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

		const stateObs = observableValue<IChatToolInvocation.State>('toolState', makeWaitingState());
		const part: IChatToolInvocation = {
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

	test('keeps approval identity stable when a chat model reloads', () => {
		const approvalModel = createModel();
		const uri = URI.parse('test://session/reloaded');
		const firstModel = addChatModel(uri);
		mockModelWithResponse(firstModel, [makeToolInvocationPart({ state: makeWaitingState(), toolCallId: 'stable-call' })]);
		firstModel.requestNeedsInput.set({ title: 'Test' }, undefined);
		const firstId = agentSessionApprovalId(getApproval(approvalModel, firstModel)!);

		chatModelsObs.set([], undefined);
		const restoredModel = addChatModel(uri);
		mockModelWithResponse(restoredModel, [makeToolInvocationPart({ state: makeWaitingState(), toolCallId: 'stable-call' })]);
		restoredModel.requestNeedsInput.set({ title: 'Test' }, undefined);

		assert.deepStrictEqual([firstId, agentSessionApprovalId(getApproval(approvalModel, restoredModel)!)], ['stable-call', 'stable-call']);
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

	test('surfaces retained subagent approvals from an earlier response and confirms them independently', () => {
		const approvalModel = createModel();
		const chatModel = addLiveChatModel();
		const original = chatModel.addRequest({ text: 'Launch reviewers', parts: [] }, { variables: [] }, 0);
		original.response!.complete();
		const latest = chatModel.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
		latest.response!.complete();
		const first = pendingSubagentTool('compiler-check');
		const second = pendingSubagentTool('helper-tests');
		original.response!.updateContent(first);
		const firstApproval = getApproval(approvalModel, chatModel);
		original.response!.updateContent(second);
		const stableApproval = getApproval(approvalModel, chatModel) === firstApproval;
		firstApproval?.confirm();
		const nextApproval = getApproval(approvalModel, chatModel);
		const afterFirst = { first: first.state.get().type, second: second.state.get().type };
		nextApproval?.confirm();

		assert.deepStrictEqual({
			latestNeedsInput: chatModel.requestNeedsInput.get(),
			firstApproval: firstApproval?.label,
			stableApproval,
			nextApproval: nextApproval?.label,
			afterFirst,
			afterBoth: getApproval(approvalModel, chatModel)?.label,
			secondState: second.state.get().type,
		}, {
			latestNeedsInput: undefined,
			firstApproval: 'compiler-check',
			stableApproval: true,
			nextApproval: 'helper-tests',
			afterFirst: { first: IChatToolInvocation.StateKind.Executing, second: IChatToolInvocation.StateKind.WaitingForConfirmation },
			afterBoth: undefined,
			secondState: IChatToolInvocation.StateKind.Executing,
		});
	});

	test('retains current-request approval precedence and drops removed historical approvals', () => {
		const approvalModel = createModel();
		const chatModel = addLiveChatModel();
		const original = chatModel.addRequest({ text: 'Launch reviewers', parts: [] }, { variables: [] }, 0);
		original.response!.complete();
		const latest = chatModel.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
		original.response!.updateContent(pendingSubagentTool('old-check'));
		latest.response!.updateContent(pendingSubagentTool('new-check'));
		const currentApproval = getApproval(approvalModel, chatModel);
		currentApproval?.confirm();
		const historicalApproval = getApproval(approvalModel, chatModel)?.label;
		chatModel.removeRequest(original.id);

		assert.deepStrictEqual({
			currentApproval: currentApproval?.label,
			historicalApproval,
			afterRemoval: getApproval(approvalModel, chatModel)?.label,
		}, { currentApproval: 'new-check', historicalApproval: 'old-check', afterRemoval: undefined });
	});

	test('surfaces a single-choice file approval but leaves multi-choice file operations in chat', () => {
		const approvalModel = createModel();
		const chatModel = addLiveChatModel();
		const original = chatModel.addRequest({ text: 'Start work', parts: [] }, { variables: [] }, 0);
		original.response!.complete();
		chatModel.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0).response!.complete();
		const choice = new ChatToolInvocation({
			confirmationMessages: { title: 'Move or copy files?', message: new MarkdownString('Choose a destination.') },
			toolSpecificData: { kind: 'modifiedFilesConfirmation', options: ['Move', 'Copy'], modifiedFiles: [] },
		}, { id: 'confirm', displayName: 'Confirm', modelDescription: 'File choice', source: ToolDataSource.Internal }, 'choice', 'retained-agent', {});
		original.response!.updateContent(choice);
		const unsupported = getApproval(approvalModel, chatModel)?.label;
		const edit = new ChatToolInvocation({
			confirmationMessages: { title: 'Create file?', message: new MarkdownString('Create the requested file.') },
			toolSpecificData: { kind: 'modifiedFilesConfirmation', options: ['Allow'], modifiedFiles: [] },
		}, { id: 'apply_patch', displayName: 'Apply Patch', modelDescription: 'File edit', source: ToolDataSource.Internal }, 'edit', 'retained-agent', {});
		original.response!.updateContent(edit);
		const approval = getApproval(approvalModel, chatModel);
		approval?.confirm();
		const state = edit.state.get();

		assert.deepStrictEqual({
			unsupported, label: approval?.label,
			confirmed: state.type === IChatToolInvocation.StateKind.Executing ? state.confirmed : undefined,
			choiceState: choice.state.get().type,
			remainingApproval: getApproval(approvalModel, chatModel)?.label,
		}, {
			unsupported: undefined, label: 'Create file?',
			confirmed: { type: ToolConfirmKind.UserAction, selectedButton: 'Allow' },
			choiceState: IChatToolInvocation.StateKind.WaitingForConfirmation,
			remainingApproval: undefined,
		});
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
		const legacyData = { kind: 'terminal' as const, command: 'legacy-cmd', language: 'bash' };
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

		const markdownPart = { kind: 'markdownContent' as const, content: new MarkdownString('hello') };
		const waitingPart = makeToolInvocationPart({
			state: makeWaitingState(),
			toolSpecificData: makeTerminalToolData({ commandLine: { original: 'the-cmd' } }),
		});
		mockModelWithResponse(chatModel, [markdownPart as unknown as IChatProgressResponseContent, waitingPart]);
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
