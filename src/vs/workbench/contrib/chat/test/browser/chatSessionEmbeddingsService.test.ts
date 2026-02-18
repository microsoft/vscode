/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatModel, IChatRequestModel, IChatRequestVariableData } from '../../common/model/chatModel.js';
import { IParsedChatRequest } from '../../common/requestParser/chatParserTypes.js';
import { ChatSendResult, IChatDetail, IChatModelReference, IChatProviderInfo, IChatService, IChatSessionContext, IChatUserActionEvent, ResponseModelState } from '../../common/chatService/chatService.js';
import { IAiEmbeddingVectorProvider, IAiEmbeddingVectorService } from '../../../../services/aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { ChatSessionEmbeddingsService } from '../../browser/chatSessionEmbeddingsServiceImpl.js';

// Minimal mock of IChatModel for testing
function createMockChatModel(sessionId: string, title: string, requests: { userMessage: string; responseMarkdown: string }[]): IChatModel {
	const sessionResource = URI.from({ scheme: Schemas.vscodeLocalChatSession, path: `/${sessionId}` });
	const mockRequests = requests.map((r, i) => ({
		id: `req-${i}`,
		timestamp: Date.now(),
		version: 1,
		session: {} as IChatModel,
		message: { text: r.userMessage, parts: [{ text: r.userMessage, promptText: r.userMessage, kind: 'text', range: { start: 0, endExclusive: r.userMessage.length }, editorRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: r.userMessage.length } }] } as IParsedChatRequest,
		attempt: 0,
		variableData: { variables: [], selections: [] } as IChatRequestVariableData,
		isCompleteAddedRequest: true,
		shouldBeRemovedOnSend: undefined,
		shouldBeBlocked: observableValue('blocked', false),
		setShouldBeBlocked: () => { },
		response: {
			response: {
				value: [{
					kind: 'markdownContent',
					content: { value: r.responseMarkdown }
				}]
			},
			state: ResponseModelState.Complete,
		},
	} as unknown as IChatRequestModel));

	return {
		sessionResource,
		sessionId,
		title,
		hasCustomTitle: !!title,
		hasRequests: requests.length > 0,
		lastRequest: mockRequests[mockRequests.length - 1],
		getRequests: () => mockRequests,
		dispose: () => { },
	} as unknown as IChatModel;
}

class MockChatServiceForEmbeddings implements IChatService {
	chatModels: IObservable<Iterable<IChatModel>> = observableValue('chatModels', []);
	requestInProgressObs = observableValue('name', false);
	edits2Enabled: boolean = false;
	_serviceBrand: undefined;
	editingSessions = [];
	transferredSessionResource: URI | undefined;
	readonly onDidSubmitRequest = Event.None;
	readonly onDidCreateModel = Event.None;
	readonly onDidPerformUserAction: Event<IChatUserActionEvent> = Event.None;
	readonly onDidReceiveQuestionCarouselAnswer = Event.None;
	readonly onDidDisposeSession: Event<{ sessionResource: URI[]; reason: 'cleared' }> = Event.None;

	private readonly _models = new Map<string, IChatModel>();

	addModel(model: IChatModel): void {
		this._models.set(model.sessionResource.toString(), model);
	}

	async getLiveSessionItems(): Promise<IChatDetail[]> {
		return Array.from(this._models.values()).map(model => ({
			sessionResource: model.sessionResource,
			title: model.title,
			lastMessageDate: Date.now(),
			timing: { created: Date.now(), lastRequestStarted: Date.now(), lastRequestEnded: Date.now() },
			isActive: true,
			lastResponseState: ResponseModelState.Complete,
		}));
	}

	async getHistorySessionItems(): Promise<IChatDetail[]> { return []; }
	async getMetadataForSession(sessionResource: URI): Promise<IChatDetail | undefined> {
		const model = this._models.get(sessionResource.toString());
		if (!model) { return undefined; }
		return {
			sessionResource,
			title: model.title,
			lastMessageDate: Date.now(),
			timing: { created: Date.now(), lastRequestStarted: Date.now(), lastRequestEnded: Date.now() },
			isActive: true,
			lastResponseState: ResponseModelState.Complete,
		};
	}

	async getOrRestoreSession(sessionResource: URI): Promise<IChatModelReference | undefined> {
		const model = this._models.get(sessionResource.toString());
		if (!model) { return undefined; }
		return { object: model, dispose: () => { } } as IChatModelReference;
	}

	// Stub methods
	setSaveModelsEnabled(): void { }
	isEnabled(): boolean { return true; }
	hasSessions(): boolean { return true; }
	getProviderInfos(): IChatProviderInfo[] { return []; }
	startSession(): IChatModelReference { throw new Error('Not implemented'); }
	addSession(): void { }
	getSession(): IChatModel | undefined { return undefined; }
	getSessionTitle(): string | undefined { return undefined; }
	loadSessionFromContent(): IChatModelReference | undefined { return undefined; }
	loadSessionForResource(): Promise<IChatModelReference | undefined> { return Promise.resolve(undefined); }
	getActiveSessionReference(): IChatModelReference | undefined { return undefined; }
	setTitle(): void { }
	appendProgress(): void { }
	processPendingRequests(): void { }
	sendRequest(): Promise<ChatSendResult> { throw new Error('Not implemented'); }
	resendRequest(): Promise<void> { throw new Error('Not implemented'); }
	adoptRequest(): Promise<void> { throw new Error('Not implemented'); }
	removeRequest(): Promise<void> { throw new Error('Not implemented'); }
	cancelCurrentRequestForSession(): void { }
	setYieldRequested(): void { }
	removePendingRequest(): void { }
	setPendingRequests(): void { }
	addCompleteRequest(): void { }
	async getLocalSessionHistory(): Promise<IChatDetail[]> {
		return Array.from(this._models.values()).map(model => ({
			sessionResource: model.sessionResource,
			title: model.title,
			lastMessageDate: Date.now(),
			timing: { created: Date.now(), lastRequestStarted: Date.now(), lastRequestEnded: Date.now() },
			isActive: true,
			lastResponseState: ResponseModelState.Complete,
		}));
	}
	async clearAllHistoryEntries(): Promise<void> { }
	async removeHistoryEntry(): Promise<void> { }
	notifyUserAction(): void { }
	notifyQuestionCarouselAnswer(): void { }
	async transferChatSession(): Promise<void> { }
	setChatSessionTitle(): void { }
	isEditingLocation(): boolean { return false; }
	getChatStorageFolder(): URI { return URI.file('/tmp'); }
	logChatIndex(): void { }
	activateDefaultAgent(): Promise<void> { return Promise.resolve(); }
	getChatSessionFromInternalUri(): IChatSessionContext | undefined { return undefined; }
	waitForModelDisposals(): Promise<void> { return Promise.resolve(); }
}

class MockAiEmbeddingVectorService implements IAiEmbeddingVectorService {
	_serviceBrand: undefined;
	isEnabled(): boolean { return false; }
	getEmbeddingVector(str: string, token: CancellationToken): Promise<number[]>;
	getEmbeddingVector(strings: string[], token: CancellationToken): Promise<number[][]>;
	getEmbeddingVector(): Promise<number[] | number[][]> { throw new Error('Not implemented'); }
	registerAiEmbeddingVectorProvider(model: string, provider: IAiEmbeddingVectorProvider): IDisposable { return { dispose: () => { } }; }
}

suite('ChatSessionEmbeddingsService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let chatService: MockChatServiceForEmbeddings;
	let embeddingsService: ChatSessionEmbeddingsService;

	setup(async () => {
		chatService = new MockChatServiceForEmbeddings();
		const logService = new NullLogService();
		const aiEmbeddingService = new MockAiEmbeddingVectorService();

		embeddingsService = testDisposables.add(new ChatSessionEmbeddingsService(
			chatService as unknown as IChatService,
			aiEmbeddingService,
			logService,
		));

		// Wait for initial index build
		await embeddingsService.rebuildIndex();
	});

	test('should start with empty index', () => {
		assert.strictEqual(embeddingsService.indexedSessionCount, 0);
		assert.strictEqual(embeddingsService.isReady, true);
	});

	test('should index sessions and search by content', async () => {
		chatService.addModel(createMockChatModel('session-1', 'TypeScript Generics Help', [
			{ userMessage: 'How do I use TypeScript generics?', responseMarkdown: 'TypeScript generics allow you to create reusable components that work with multiple types. Use angle brackets like `function identity<T>(arg: T): T { return arg; }`' },
		]));

		chatService.addModel(createMockChatModel('session-2', 'Python Data Analysis', [
			{ userMessage: 'How do I read CSV files in Python?', responseMarkdown: 'Use pandas library: `import pandas as pd; df = pd.read_csv("data.csv")`' },
		]));

		chatService.addModel(createMockChatModel('session-3', 'React Component Lifecycle', [
			{ userMessage: 'What are React lifecycle methods?', responseMarkdown: 'React class components have lifecycle methods like componentDidMount, componentDidUpdate, and componentWillUnmount.' },
		]));

		await embeddingsService.rebuildIndex();
		assert.strictEqual(embeddingsService.indexedSessionCount, 3);

		const cts = new CancellationTokenSource();
		testDisposables.add(cts);

		// Search for TypeScript-related content
		const results = await embeddingsService.search('TypeScript generics types', 10, cts.token);
		assert.ok(results.length > 0, 'Should find matches for TypeScript query');
		assert.strictEqual(results[0].title, 'TypeScript Generics Help');

		// Search for Python-related content
		const pythonResults = await embeddingsService.search('pandas CSV data python', 10, cts.token);
		assert.ok(pythonResults.length > 0, 'Should find matches for Python query');
		assert.strictEqual(pythonResults[0].title, 'Python Data Analysis');
	});

	test('should remove sessions from index', async () => {
		chatService.addModel(createMockChatModel('session-rm', 'Session to Remove', [
			{ userMessage: 'temporary question', responseMarkdown: 'temporary answer' },
		]));

		await embeddingsService.rebuildIndex();
		assert.strictEqual(embeddingsService.indexedSessionCount, 1);

		const sessionResource = URI.from({ scheme: Schemas.vscodeLocalChatSession, path: '/session-rm' });
		embeddingsService.removeSession(sessionResource);
		assert.strictEqual(embeddingsService.indexedSessionCount, 0);
	});

	test('should return empty results for empty query', async () => {
		chatService.addModel(createMockChatModel('session-x', 'Some Session', [
			{ userMessage: 'question', responseMarkdown: 'answer' },
		]));

		await embeddingsService.rebuildIndex();

		const cts = new CancellationTokenSource();
		testDisposables.add(cts);

		const results = await embeddingsService.search('', 10, cts.token);
		assert.strictEqual(results.length, 0);
	});

	test('should limit results to maxResults', async () => {
		// Create many sessions
		for (let i = 0; i < 15; i++) {
			chatService.addModel(createMockChatModel(`session-${i}`, `Testing Session ${i}`, [
				{ userMessage: `How do I implement testing pattern ${i}?`, responseMarkdown: `Here is how to implement testing pattern ${i} with assertions and mocking.` },
			]));
		}

		await embeddingsService.rebuildIndex();
		assert.strictEqual(embeddingsService.indexedSessionCount, 15);

		const cts = new CancellationTokenSource();
		testDisposables.add(cts);

		const results = await embeddingsService.search('testing pattern implement assertions', 5, cts.token);
		assert.ok(results.length <= 5, 'Should respect maxResults limit');
	});

	test('should fire onDidUpdateIndex when index changes', async () => {
		let updateCount = 0;
		testDisposables.add(embeddingsService.onDidUpdateIndex(() => updateCount++));

		chatService.addModel(createMockChatModel('session-event', 'Event Test', [
			{ userMessage: 'trigger update', responseMarkdown: 'response' },
		]));

		await embeddingsService.rebuildIndex();
		assert.ok(updateCount > 0, 'Should have fired update event');
	});
});
