/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, errorHandler, isCancellationError, setUnexpectedErrorHandler } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatModelReference, IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../chat/common/constants.js';
import { IChatNewSessionRequest, IChatSessionItem, IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../chat/common/chatSessionsService.js';
import { getTerminalChatSessionMeta, TerminalChatSessionResolver } from '../../browser/terminalChatSessionResolver.js';

const terminalContribution: ResolvedChatSessionsExtensionPoint = {
	type: SessionType.AgentHostCopilot,
	name: 'Agent Host Copilot',
	displayName: 'Agent Host Copilot',
	description: 'Test contribution',
	icon: undefined,
	locations: [ChatAgentLocation.Terminal],
};

const agentHostItem: IChatSessionItem = {
	resource: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/terminal-session' }),
	label: 'Terminal session',
	timing: { created: 0, lastRequestStarted: 0, lastRequestEnded: 0 },
};

const terminalShellType = 'pwsh';
const terminalOperatingSystem = OperatingSystem.Windows;

class TestModelReference extends mock<IChatModelReference>() {
	disposeCalls = 0;

	override dispose(): void {
		this.disposeCalls++;
	}
}

class TestChatSessionsService extends mock<IChatSessionsService>() {
	contribution: ResolvedChatSessionsExtensionPoint | undefined = terminalContribution;
	item: IChatSessionItem | undefined = agentHostItem;
	error: Error | undefined;
	contributionLookups = 0;
	creationCalls = 0;
	request: IChatNewSessionRequest | undefined;

	override getChatSessionContribution(): ResolvedChatSessionsExtensionPoint | undefined {
		this.contributionLookups++;
		return this.contribution;
	}

	override async createNewChatSessionItem(_chatSessionType: string, request: IChatNewSessionRequest): Promise<IChatSessionItem | undefined> {
		this.creationCalls++;
		this.request = request;
		if (this.error) {
			throw this.error;
		}
		return this.item;
	}
}

class TestChatService extends mock<IChatService>() {
	agentHostReference: IChatModelReference | undefined;
	agentHostResult: Promise<IChatModelReference | undefined> | undefined;
	localReference = new TestModelReference();
	localSessionStarts = 0;
	agentHostAcquisitions = 0;
	readonly acquisitionStarted = new DeferredPromise<void>();

	override async acquireOrLoadSession(): Promise<IChatModelReference | undefined> {
		this.agentHostAcquisitions++;
		this.acquisitionStarted.complete();
		return this.agentHostResult ?? this.agentHostReference;
	}

	override startNewLocalSession(): IChatModelReference {
		this.localSessionStarts++;
		return this.localReference;
	}
}

suite('TerminalChatSessionResolver', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let chatSessionsService: TestChatSessionsService;
	let chatService: TestChatService;
	let configurationService: TestConfigurationService;
	let resolver: TerminalChatSessionResolver;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		chatSessionsService = new TestChatSessionsService();
		chatService = new TestChatService();
		configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.TerminalAgentHostEnabled, true);
		instantiationService.stub(IChatSessionsService, chatSessionsService);
		instantiationService.stub(IChatService, chatService);
		instantiationService.stub(IConfigurationService, configurationService);
		resolver = instantiationService.createInstance(TerminalChatSessionResolver);
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the Agent Host session when it supports the terminal location', async () => {
		const agentHostReference = new TestModelReference();
		chatService.agentHostReference = agentHostReference;
		const meta = getTerminalChatSessionMeta(terminalShellType, terminalOperatingSystem);

		const result = await resolver.resolve(CancellationToken.None, terminalShellType, terminalOperatingSystem);

		assert.deepStrictEqual({
			usesAgentHostReference: result?.modelRef === agentHostReference,
			lockToAgent: result?.lockToAgent?.type,
			request: chatSessionsService.request,
			creationCalls: chatSessionsService.creationCalls,
			agentHostAcquisitions: chatService.agentHostAcquisitions,
			localSessionStarts: chatService.localSessionStarts,
		}, {
			usesAgentHostReference: true,
			lockToAgent: SessionType.AgentHostCopilot,
			request: { prompt: '', isEphemeral: true, _meta: meta },
			creationCalls: 1,
			agentHostAcquisitions: 1,
			localSessionStarts: 0,
		});
	});

	test('produces terminal surface metadata when the shell is not yet known', () => {
		assert.deepStrictEqual(getTerminalChatSessionMeta(undefined, OperatingSystem.Linux), {
			'vscode.chat.surface': { surface: 'terminal', osName: 'Linux' },
		});
	});

	test('uses the local session without attempting Agent Host when disabled', async () => {
		configurationService.setUserConfiguration(ChatConfiguration.TerminalAgentHostEnabled, false);

		const result = await resolver.resolve(CancellationToken.None, terminalShellType, terminalOperatingSystem);

		assert.deepStrictEqual({
			usesLocalReference: result?.modelRef === chatService.localReference,
			lockToAgent: result?.lockToAgent?.type,
			contributionLookups: chatSessionsService.contributionLookups,
			creationCalls: chatSessionsService.creationCalls,
			agentHostAcquisitions: chatService.agentHostAcquisitions,
			localSessionStarts: chatService.localSessionStarts,
		}, {
			usesLocalReference: true,
			lockToAgent: undefined,
			contributionLookups: 0,
			creationCalls: 0,
			agentHostAcquisitions: 0,
			localSessionStarts: 1,
		});
	});

	test('falls back to a local session when Agent Host returns undefined', async () => {
		chatService.agentHostReference = undefined;

		const result = await resolver.resolve(CancellationToken.None, terminalShellType, terminalOperatingSystem);

		assert.deepStrictEqual({
			usesLocalReference: result?.modelRef === chatService.localReference,
			lockToAgent: result?.lockToAgent?.type,
			creationCalls: chatSessionsService.creationCalls,
			agentHostAcquisitions: chatService.agentHostAcquisitions,
			localSessionStarts: chatService.localSessionStarts,
		}, {
			usesLocalReference: true,
			lockToAgent: undefined,
			creationCalls: 1,
			agentHostAcquisitions: 1,
			localSessionStarts: 1,
		});
	});

	test('falls back to a local session and reports Agent Host failures', async () => {
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const reportedErrors: string[] = [];
		chatSessionsService.error = new Error('Agent Host unavailable');
		setUnexpectedErrorHandler(error => reportedErrors.push(error instanceof Error ? error.message : String(error)));
		try {
			const result = await resolver.resolve(CancellationToken.None, terminalShellType, terminalOperatingSystem);

			assert.deepStrictEqual({
				usesLocalReference: result?.modelRef === chatService.localReference,
				lockToAgent: result?.lockToAgent?.type,
				creationCalls: chatSessionsService.creationCalls,
				localSessionStarts: chatService.localSessionStarts,
				reportedErrors,
			}, {
				usesLocalReference: true,
				lockToAgent: undefined,
				creationCalls: 1,
				localSessionStarts: 1,
				reportedErrors: ['Agent Host unavailable'],
			});
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});

	test('propagates Agent Host cancellation without creating a local session', async () => {
		chatSessionsService.error = new CancellationError();
		let cancellationPropagated = false;
		try {
			await resolver.resolve(CancellationToken.None, terminalShellType, terminalOperatingSystem);
		} catch (error) {
			cancellationPropagated = isCancellationError(error);
		}

		assert.deepStrictEqual({
			cancellationPropagated,
			creationCalls: chatSessionsService.creationCalls,
			localSessionStarts: chatService.localSessionStarts,
		}, {
			cancellationPropagated: true,
			creationCalls: 1,
			localSessionStarts: 0,
		});
	});

	test('disposes an Agent Host session acquired after cancellation', async () => {
		const agentHostReference = new TestModelReference();
		const pendingAcquisition = new DeferredPromise<IChatModelReference | undefined>();
		const cancellationSource = store.add(new CancellationTokenSource());
		chatService.agentHostResult = pendingAcquisition.p;

		const resolving = resolver.resolve(cancellationSource.token, terminalShellType, terminalOperatingSystem);
		await chatService.acquisitionStarted.p;
		cancellationSource.cancel();
		pendingAcquisition.complete(agentHostReference);
		const result = await resolving;

		assert.deepStrictEqual({
			result,
			localSessionStarts: chatService.localSessionStarts,
			disposeCalls: agentHostReference.disposeCalls,
		}, {
			result: undefined,
			localSessionStarts: 0,
			disposeCalls: 1,
		});
	});

	test('reports the contribution to lock to, and none for local fallbacks', async () => {
		chatService.agentHostReference = new TestModelReference();
		const agentHostResolution = await resolver.resolve(CancellationToken.None, terminalShellType, terminalOperatingSystem);
		chatService.agentHostReference = undefined;
		const localResolution = await resolver.resolve(CancellationToken.None, terminalShellType, terminalOperatingSystem);

		assert.deepStrictEqual({
			agentHostLocksToContribution: agentHostResolution?.lockToAgent === terminalContribution,
			agentHostLockAgentId: agentHostResolution?.lockToAgent?.type,
			localLockToAgent: localResolution?.lockToAgent,
		}, {
			agentHostLocksToContribution: true,
			agentHostLockAgentId: SessionType.AgentHostCopilot,
			localLockToAgent: undefined,
		});
	});
});
