/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, errorHandler, isCancellationError, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { readChatSurfaceMeta } from '../../../../../platform/agentHost/common/meta/agentChatSurfaceMeta.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatModelReference, IChatService, IChatSessionStartOptions } from '../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatNewSessionRequest, IChatSessionItem, IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../chat/common/chatSessionsService.js';
import { InlineChatSessionResolver } from '../../browser/inlineChatSessionResolver.js';

const editorInlineContribution: ResolvedChatSessionsExtensionPoint = {
	type: SessionType.AgentHostCopilot,
	name: 'Agent Host Copilot',
	displayName: 'Agent Host Copilot',
	description: 'Test contribution',
	icon: undefined,
	locations: [ChatAgentLocation.EditorInline],
};

const agentHostItem: IChatSessionItem = {
	resource: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/inline-chat-session' }),
	label: 'Inline chat session',
	timing: { created: 0, lastRequestStarted: 0, lastRequestEnded: 0 },
};
const targetUri = URI.file('/workspace/inline.ts');

class TestModelReference extends mock<IChatModelReference>() {
	override readonly object = {} as IChatModelReference['object'];
	disposed = false;

	override dispose(): void {
		this.disposed = true;
	}
}

class TestConfigurationService extends mock<IConfigurationService>() {
	agentHostEnabled = true;

	override getValue<T>(): T {
		return this.agentHostEnabled as T;
	}
}

class TestChatSessionsService extends mock<IChatSessionsService>() {
	contribution: ResolvedChatSessionsExtensionPoint | undefined = editorInlineContribution;
	item: IChatSessionItem | undefined = agentHostItem;
	error: Error | undefined;
	readonly contributionLookups: string[] = [];
	readonly creationCalls: Array<{ sessionType: string; request: IChatNewSessionRequest }> = [];

	override getChatSessionContribution(sessionType: string): ResolvedChatSessionsExtensionPoint | undefined {
		this.contributionLookups.push(sessionType);
		return this.contribution;
	}

	override async createNewChatSessionItem(sessionType: string, request: IChatNewSessionRequest): Promise<IChatSessionItem | undefined> {
		this.creationCalls.push({ sessionType, request });
		if (this.error) {
			throw this.error;
		}
		return this.item;
	}
}

class TestChatService extends mock<IChatService>() {
	agentHostReference: IChatModelReference | undefined;
	agentHostResult: Promise<IChatModelReference | undefined> | undefined;
	agentHostError: Error | undefined;
	readonly localReference = new TestModelReference();
	readonly acquisitionStarted = new DeferredPromise<void>();
	readonly acquisitionCalls: Array<{ location: ChatAgentLocation; debugOwner: string | undefined }> = [];
	readonly localSessionCalls: Array<{ location: ChatAgentLocation; options: IChatSessionStartOptions | undefined }> = [];

	override async acquireOrLoadSession(_sessionResource: URI, location: ChatAgentLocation, _token: CancellationToken, debugOwner?: string): Promise<IChatModelReference | undefined> {
		this.acquisitionCalls.push({ location, debugOwner });
		this.acquisitionStarted.complete();
		if (this.agentHostError) {
			throw this.agentHostError;
		}
		return this.agentHostResult ?? this.agentHostReference;
	}

	override startNewLocalSession(location: ChatAgentLocation, options?: IChatSessionStartOptions): IChatModelReference {
		this.localSessionCalls.push({ location, options });
		return this.localReference;
	}
}

suite('InlineChatSessionResolver', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let chatSessionsService: TestChatSessionsService;
	let chatService: TestChatService;
	let resolver: InlineChatSessionResolver;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		configurationService = new TestConfigurationService();
		chatSessionsService = new TestChatSessionsService();
		chatService = new TestChatService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatSessionsService, chatSessionsService);
		instantiationService.stub(IChatService, chatService);
		resolver = instantiationService.createInstance(InlineChatSessionResolver);
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses a local session without consulting Agent Host when disabled', async () => {
		configurationService.agentHostEnabled = false;

		const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);

		assert.deepStrictEqual({
			usesLocalReference: result?.modelRef === chatService.localReference,
			lockToAgent: result?.lockToAgent,
			contributionLookups: chatSessionsService.contributionLookups,
			creationCalls: chatSessionsService.creationCalls,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			usesLocalReference: true,
			lockToAgent: undefined,
			contributionLookups: [],
			creationCalls: [],
			localSessionCalls: [{ location: ChatAgentLocation.EditorInline, options: { canUseTools: false, sessionTypeSelectionReason: undefined } }],
		});
	});

	test('uses an ephemeral Agent Host session for editor inline chat', async () => {
		const agentHostReference = new TestModelReference();
		chatService.agentHostReference = agentHostReference;

		const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);
		const creation = chatSessionsService.creationCalls[0];

		assert.deepStrictEqual({
			usesAgentHostReference: result?.modelRef === agentHostReference,
			locksToExactContribution: result?.lockToAgent === editorInlineContribution,
			creation: creation && {
				sessionType: creation.sessionType,
				request: creation.request,
				surfaceMeta: readChatSurfaceMeta(creation.request),
			},
			acquisitionCalls: chatService.acquisitionCalls,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			usesAgentHostReference: true,
			locksToExactContribution: true,
			creation: {
				sessionType: SessionType.AgentHostCopilot,
				request: {
					prompt: '',
					isEphemeral: true,
					_meta: {
						'vscode.chat.surface': { surface: 'editorInline', languageId: 'typescript', targetUri: 'file:///workspace/inline.ts' },
					},
				},
				surfaceMeta: { surface: 'editorInline', languageId: 'typescript', targetUri: 'file:///workspace/inline.ts' },
			},
			acquisitionCalls: [{ location: ChatAgentLocation.EditorInline, debugOwner: 'InlineChatSessionResolver#resolve' }],
			localSessionCalls: [],
		});
	});

	test('falls back to a local session when the contribution is missing', async () => {
		chatSessionsService.contribution = undefined;

		const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);

		assert.deepStrictEqual({
			usesLocalReference: result?.modelRef === chatService.localReference,
			lockToAgent: result?.lockToAgent,
			creationCalls: chatSessionsService.creationCalls,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			usesLocalReference: true,
			lockToAgent: undefined,
			creationCalls: [],
			localSessionCalls: [{ location: ChatAgentLocation.EditorInline, options: { canUseTools: false, sessionTypeSelectionReason: undefined } }],
		});
	});

	test('falls back to a local session when the contribution does not support editor inline chat', async () => {
		chatSessionsService.contribution = { ...editorInlineContribution, locations: [ChatAgentLocation.Chat, ChatAgentLocation.Terminal] };

		const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);

		assert.deepStrictEqual({
			usesLocalReference: result?.modelRef === chatService.localReference,
			lockToAgent: result?.lockToAgent,
			creationCalls: chatSessionsService.creationCalls,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			usesLocalReference: true,
			lockToAgent: undefined,
			creationCalls: [],
			localSessionCalls: [{ location: ChatAgentLocation.EditorInline, options: { canUseTools: false, sessionTypeSelectionReason: undefined } }],
		});
	});

	test('falls back to a local session when Agent Host does not create an item', async () => {
		chatSessionsService.item = undefined;

		const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);

		assert.deepStrictEqual({
			usesLocalReference: result?.modelRef === chatService.localReference,
			lockToAgent: result?.lockToAgent,
			creationCalls: chatSessionsService.creationCalls.length,
			acquisitionCalls: chatService.acquisitionCalls,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			usesLocalReference: true,
			lockToAgent: undefined,
			creationCalls: 1,
			acquisitionCalls: [],
			localSessionCalls: [{ location: ChatAgentLocation.EditorInline, options: { canUseTools: false, sessionTypeSelectionReason: 'agentHostUnavailable' } }],
		});
	});

	test('falls back to a local session when Agent Host acquisition returns no model', async () => {
		const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);

		assert.deepStrictEqual({
			usesLocalReference: result?.modelRef === chatService.localReference,
			acquisitionCalls: chatService.acquisitionCalls,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			usesLocalReference: true,
			acquisitionCalls: [{ location: ChatAgentLocation.EditorInline, debugOwner: 'InlineChatSessionResolver#resolve' }],
			localSessionCalls: [{ location: ChatAgentLocation.EditorInline, options: { canUseTools: false, sessionTypeSelectionReason: 'agentHostUnavailable' } }],
		});
	});

	test('swallows a non-cancellation Agent Host error and falls back to a local session', async () => {
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const reportedErrors: string[] = [];
		chatSessionsService.error = new Error('Agent Host unavailable');
		setUnexpectedErrorHandler(error => reportedErrors.push(error instanceof Error ? error.message : String(error)));
		try {
			const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);

			assert.deepStrictEqual({
				usesLocalReference: result?.modelRef === chatService.localReference,
				lockToAgent: result?.lockToAgent,
				localSessionCalls: chatService.localSessionCalls,
				reportedErrors,
			}, {
				usesLocalReference: true,
				lockToAgent: undefined,
				localSessionCalls: [{ location: ChatAgentLocation.EditorInline, options: { canUseTools: false, sessionTypeSelectionReason: 'agentHostUnavailable' } }],
				reportedErrors: ['Agent Host unavailable'],
			});
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});

	test('swallows a non-cancellation Agent Host acquisition error and falls back to a local session', async () => {
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const reportedErrors: string[] = [];
		chatService.agentHostError = new Error('Agent Host acquisition failed');
		setUnexpectedErrorHandler(error => reportedErrors.push(error instanceof Error ? error.message : String(error)));
		try {
			const result = await resolver.resolve(CancellationToken.None, 'typescript', targetUri);

			assert.deepStrictEqual({
				usesLocalReference: result?.modelRef === chatService.localReference,
				localSessionCalls: chatService.localSessionCalls,
				reportedErrors,
			}, {
				usesLocalReference: true,
				localSessionCalls: [{ location: ChatAgentLocation.EditorInline, options: { canUseTools: false, sessionTypeSelectionReason: 'agentHostUnavailable' } }],
				reportedErrors: ['Agent Host acquisition failed'],
			});
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});

	test('does not create a local session when Agent Host is cancelled', async () => {
		chatSessionsService.error = new CancellationError();

		await assert.rejects(
			resolver.resolve(CancellationToken.None, 'typescript', targetUri),
			isCancellationError,
		);

		assert.deepStrictEqual({
			creationCalls: chatSessionsService.creationCalls.length,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			creationCalls: 1,
			localSessionCalls: [],
		});
	});

	test('does not create a local session when the token is already cancelled', async () => {
		const cancellationSource = store.add(new CancellationTokenSource());
		cancellationSource.cancel();

		const result = await resolver.resolve(cancellationSource.token, 'typescript', targetUri);

		assert.deepStrictEqual({
			result,
			contributionLookups: chatSessionsService.contributionLookups,
			creationCalls: chatSessionsService.creationCalls,
			localSessionCalls: chatService.localSessionCalls,
		}, {
			result: undefined,
			contributionLookups: [],
			creationCalls: [],
			localSessionCalls: [],
		});
	});

	test('disposes an Agent Host model reference acquired after cancellation', async () => {
		const agentHostReference = new TestModelReference();
		const pendingAcquisition = new DeferredPromise<IChatModelReference | undefined>();
		const cancellationSource = store.add(new CancellationTokenSource());
		chatService.agentHostResult = pendingAcquisition.p;

		const resolving = resolver.resolve(cancellationSource.token, 'typescript', targetUri);
		await chatService.acquisitionStarted.p;
		cancellationSource.cancel();
		pendingAcquisition.complete(agentHostReference);
		const result = await resolving;

		assert.deepStrictEqual({
			result,
			localSessionCalls: chatService.localSessionCalls,
			disposed: agentHostReference.disposed,
		}, {
			result: undefined,
			localSessionCalls: [],
			disposed: true,
		});
	});
});
