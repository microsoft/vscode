/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import type { ChatRequest, LanguageModelChat, LanguageModelToolInformation } from 'vscode';
import { ChatFetchResponseType, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { AutoChatEndpoint } from '../../../../platform/endpoint/node/autoChatEndpoint';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import type { IChatEndpoint, IEmbeddingsEndpoint } from '../../../../platform/networking/common/networking';
import { GenAiAttr, GitHubCopilotAttr } from '../../../../platform/otel/common/genAiAttributes';
import { resolveOTelConfig } from '../../../../platform/otel/common/otelConfig';
import { ICompletedSpanData, IOTelService } from '../../../../platform/otel/common/otelService';
import { InMemoryOTelService } from '../../../../platform/otel/node/inMemoryOTelService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { ToolCallRound } from '../../../prompt/common/toolCallRound';
import { IBuildPromptResult, nullRenderPromptResult } from '../../../prompt/node/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IToolCallingLoopOptions, IToolCallSingleResult, ToolCallingLoop } from '../../node/toolCallingLoop';

class AutoModeTestLoop extends ToolCallingLoop<IToolCallingLoopOptions> {
	protected override async buildPrompt(): Promise<IBuildPromptResult> { return nullRenderPromptResult(); }
	protected override async getAvailableTools(): Promise<LanguageModelToolInformation[]> { return []; }
	protected override async fetch(): Promise<ChatResponse> { throw new Error('Not used by invocation tests'); }
	override async runOne(): Promise<IToolCallSingleResult> {
		return {
			response: { type: ChatFetchResponseType.Success, value: 'answer', requestId: 'test', serverRequestId: undefined, usage: undefined, resolvedModel: 'test' },
			round: new ToolCallRound('answer'),
			hadIgnoredFiles: false,
			lastRequestMessages: [],
			availableTools: [],
		};
	}
}

/** Gives a mock endpoint the `AutoChatEndpoint` identity while keeping its own behavior. */
function withAutoIdentity(endpoint: IChatEndpoint): IChatEndpoint {
	return Object.create(AutoChatEndpoint.prototype, {
		...Object.getOwnPropertyDescriptors(Object.getPrototypeOf(endpoint)),
		...Object.getOwnPropertyDescriptors(endpoint),
	});
}

/** Avoid model metadata caches and network requests: only the invocation boundary is exercised. */
class AutoModeTestEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = Event.None;
	constructor(
		private readonly _auto: boolean,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }
	async getAllCompletionModels() { return []; }
	async getAllChatEndpoints(): Promise<IChatEndpoint[]> { return [await this.getChatEndpoint()]; }
	async getChatEndpoint(): Promise<IChatEndpoint> {
		const endpoint = this._instantiationService.createInstance(MockEndpoint, 'test');
		return this._auto ? withAutoIdentity(endpoint) : endpoint;
	}
	async getEmbeddingsEndpoint(): Promise<IEmbeddingsEndpoint> { throw new Error('Not used by auto mode tests'); }
}

function request(): ChatRequest {
	return {
		prompt: 'hello', command: undefined, references: [], location: 1, location2: undefined,
		attempt: 0, enableCommandDetection: false, isParticipantDetected: false, toolReferences: [],
		toolInvocationToken: {} as ChatRequest['toolInvocationToken'], model: { family: 'test' } as LanguageModelChat,
		tools: new Map(), id: generateUuid(), sessionId: generateUuid(),
		sessionResource: {} as ChatRequest['sessionResource'], hasHooksEnabled: false,
	};
}

describe('ToolCallingLoop auto mode attribution', () => {
	const disposables = new DisposableStore();
	let otel: InMemoryOTelService;
	afterEach(async () => {
		disposables.clear();
		await otel?.shutdown();
	});

	it.each([
		{ auto: true, expected: { model: 'test', autoMode: true } },
		{ auto: false, expected: { model: 'test', autoMode: undefined } },
	])('marks the invoke_agent span with auto_mode (auto=$auto)', async ({ auto, expected }) => {
		const services = disposables.add(createExtensionUnitTestingServices());
		services.define(IEndpointProvider, new SyncDescriptor(AutoModeTestEndpointProvider, [auto]));
		otel = new InMemoryOTelService(resolveOTelConfig({
			env: {}, settingEnabled: true, settingCaptureContent: false,
			extensionVersion: 'test', sessionId: 'test',
		}));
		services.define(IOTelService, otel);
		const accessor = disposables.add(services.createTestingAccessor());
		const instantiation = accessor.get(IInstantiationService);
		const completed: ICompletedSpanData[] = [];
		disposables.add(otel.onDidCompleteSpan(span => completed.push(span)));

		const loop = disposables.add(instantiation.createInstance(AutoModeTestLoop, {
			request: request(), toolCallLimit: 1,
			conversation: new Conversation(generateUuid(), [new Turn(generateUuid(), { type: 'user', message: 'hello' })]),
		}));
		await loop.run(undefined, CancellationToken.None);

		const [span] = completed.filter(s => s.attributes[GenAiAttr.OPERATION_NAME] === 'invoke_agent');
		expect({
			model: span?.attributes[GenAiAttr.REQUEST_MODEL],
			autoMode: span?.attributes[GitHubCopilotAttr.AUTO_MODE],
		}).toEqual(expected);
	});
});
