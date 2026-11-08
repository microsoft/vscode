/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import type { ChatRequest, LanguageModelChat, LanguageModelToolInformation } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { StaticGitHubAuthenticationService } from '../../../../platform/authentication/common/staticGitHubAuthenticationService';
import { ChatFetchResponseType, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import type { IChatEndpoint, IEmbeddingsEndpoint } from '../../../../platform/networking/common/networking';
import { GenAiAttr, StdAttr } from '../../../../platform/otel/common/genAiAttributes';
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

class IdentityTestLoop extends ToolCallingLoop<IToolCallingLoopOptions> {
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

/** Avoid model metadata caches and network requests: only the invocation boundary is exercised. */
class IdentityTestEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = Event.None;
	constructor(@IInstantiationService private readonly _instantiationService: IInstantiationService) { }
	async getAllCompletionModels() { return []; }
	async getAllChatEndpoints(): Promise<IChatEndpoint[]> { return [await this.getChatEndpoint()]; }
	async getChatEndpoint(): Promise<IChatEndpoint> { return this._instantiationService.createInstance(MockEndpoint, 'test'); }
	async getEmbeddingsEndpoint(): Promise<IEmbeddingsEndpoint> { throw new Error('Not used by identity tests'); }
}

class IdentityTestAuthentication extends StaticGitHubAuthenticationService {
	setAccount(name: string | undefined): void {
		this._anyGitHubSession = name === undefined ? undefined : {
			id: name, accessToken: 'test-token', scopes: [], account: { id: name, label: name },
		};
	}
}

function request(subagent: boolean): ChatRequest {
	return {
		prompt: 'hello', command: undefined, references: [], location: 1, location2: undefined,
		attempt: 0, enableCommandDetection: false, isParticipantDetected: false, toolReferences: [],
		toolInvocationToken: {} as ChatRequest['toolInvocationToken'], model: { family: 'test' } as LanguageModelChat,
		tools: new Map(), id: generateUuid(), sessionId: generateUuid(),
		sessionResource: {} as ChatRequest['sessionResource'], hasHooksEnabled: false,
		...(subagent ? { subAgentInvocationId: 'child', subAgentName: 'search' } : {}),
	};
}

describe('ToolCallingLoop identity attribution', () => {
	const disposables = new DisposableStore();
	let otel: InMemoryOTelService;
	afterEach(async () => {
		disposables.clear();
		await otel?.shutdown();
	});

	it.each([false, true])('reads the current account for top-level and subagent spans (capture=%s)', async captureIdentity => {
		const services = disposables.add(createExtensionUnitTestingServices());
		services.define(IEndpointProvider, new SyncDescriptor(IdentityTestEndpointProvider));
		services.define(IAuthenticationService, new SyncDescriptor(IdentityTestAuthentication, [undefined]));
		otel = new InMemoryOTelService(resolveOTelConfig({
			env: {}, settingEnabled: true, settingCaptureIdentity: captureIdentity, settingCaptureContent: false,
			extensionVersion: 'test', sessionId: 'test',
		}));
		services.define(IOTelService, otel);
		const accessor = disposables.add(services.createTestingAccessor());
		const instantiation = accessor.get(IInstantiationService);
		const auth = accessor.get(IAuthenticationService);
		expect(auth).toBeInstanceOf(IdentityTestAuthentication);
		if (!(auth instanceof IdentityTestAuthentication)) {
			throw new Error('Identity test authentication was not registered');
		}
		const completed: ICompletedSpanData[] = [];
		disposables.add(otel.onDidCompleteSpan(span => completed.push(span)));
		for (const [account, subagent] of [['first', false], ['first', true], ['second', true], [undefined, false]] as const) {
			auth.setAccount(account);
			const chatRequest = request(subagent);
			const loop = disposables.add(instantiation.createInstance(IdentityTestLoop, {
				request: chatRequest, toolCallLimit: 1,
				conversation: new Conversation(generateUuid(), [new Turn(generateUuid(), { type: 'user', message: 'hello' })]),
			}));
			await loop.run(undefined, CancellationToken.None);
		}
		expect(completed.filter(span => span.attributes[GenAiAttr.OPERATION_NAME] === 'invoke_agent')
			.map(span => span.attributes[StdAttr.USER_NAME])).toEqual(captureIdentity ? ['first', 'first', 'second', undefined] : [undefined, undefined, undefined, undefined]);
	});
});
