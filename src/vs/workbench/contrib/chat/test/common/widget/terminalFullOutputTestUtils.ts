/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, type IReference } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents, type ComponentToState, type TerminalState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatService, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { ChatResponseResource, IChatRequestModel, IChatResponseModel, Response } from '../../../common/model/chatModel.js';
import { ChatResponseResourceFileSystemProvider } from '../../../common/widget/chatResponseResourceFileSystemProvider.js';
import { MockChatModel } from '../model/mockChatModel.js';

export function createTerminalOutputTestFixture(
	store: Pick<DisposableStore, 'add'>,
	sessionResource: URI,
	invocation: IChatToolInvocation | IChatToolInvocationSerialized,
	authority: string,
	read: (uri: URI) => Promise<TerminalState>,
	options?: { readonly loadSessionOnDemand?: boolean },
) {
	const data = invocation.toolSpecificData;
	assert.ok(data?.kind === 'terminal' && hasKey(data, { commandLine: true }));
	const terminal = URI.revive(data.terminalCommandUri);
	assert.ok(terminal);
	const resource = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, terminal, `terminal-output-${invocation.toolCallId}.txt`);
	const response = store.add(new Response(invocation.kind === 'toolInvocationSerialized' ? [invocation] : []));
	if (invocation.kind === 'toolInvocation') {
		response.updateContent(invocation);
	}
	const request = new class extends mock<IChatRequestModel>() {
		override readonly response = new class extends mock<IChatResponseModel>() {
			override readonly entireResponse = response;
		}();
	}();
	const model = store.add(new class extends MockChatModel {
		override getRequests(): IChatRequestModel[] {
			return [request];
		}
	}(sessionResource));
	let loaded = !options?.loadSessionOnDemand;
	let acquisitions = 0;
	let releases = 0;
	const chatService = new class extends mock<IChatService>() {
		override readonly onDidDisposeSession = Event.None;
		override getSession(resource: URI) {
			return loaded && !model.isDisposed && isEqual(resource, sessionResource) ? model : undefined;
		}
		override async acquireOrLoadSession(resource: URI) {
			if (model.isDisposed || !isEqual(resource, sessionResource)) {
				return undefined;
			}
			acquisitions++;
			loaded = true;
			return {
				object: model,
				dispose: () => {
					releases++;
					loaded = false;
				},
			};
		}
	}();
	const subscriptions: URI[] = [];
	let subscriptionReleases = 0;
	class TestTerminalSubscription extends Disposable implements IAgentSubscription<TerminalState> {
		private readonly _onDidChange = this._register(new Emitter<TerminalState>());
		readonly onDidChange = this._onDidChange.event;
		private readonly _onDidError = this._register(new Emitter<Error>());
		readonly onDidError = this._onDidError.event;
		readonly onWillApplyAction = Event.None;
		readonly onDidApplyAction = Event.None;
		value: TerminalState | Error | undefined;
		get verifiedValue(): TerminalState | undefined { return this.value instanceof Error ? undefined : this.value; }
		constructor(uri: URI) {
			super();
			queueMicrotask(() => {
				void read(uri).then(state => {
					this.value = state;
					this._onDidChange.fire(state);
				}, error => {
					const value = error instanceof Error ? error : new Error(String(error));
					this.value = value;
					this._onDidError.fire(value);
				});
			});
		}
		receiveEnvelope(): void { }
	}
	const connection = new class extends mock<IAgentConnection>() {
		override getSubscription<T extends StateComponents>(kind: T, uri: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
			assert.strictEqual(kind, StateComponents.Terminal);
			subscriptions.push(uri);
			const terminalSubscription = new TestTerminalSubscription(uri);
			const available: { [K in StateComponents]?: IAgentSubscription<ComponentToState[K]> } = {
				[StateComponents.Terminal]: terminalSubscription,
			};
			const subscription = available[kind];
			assert.ok(subscription);
			return {
				object: subscription,
				dispose: () => {
					subscriptionReleases++;
					terminalSubscription.dispose();
				},
			};
		}
	}();
	const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
		override resolveSessionResource(resource: URI) {
			return isEqual(resource, sessionResource) ? { connectionAuthority: authority, backendSession: sessionResource, connection } : undefined;
		}
	}();
	const fileService = store.add(new FileService(new NullLogService()));
	const provider = store.add(new ChatResponseResourceFileSystemProvider(chatService, fileService, connectionsService));
	store.add(fileService.registerProvider(ChatResponseResource.scheme, provider));
	return {
		resource,
		provider,
		fileService,
		model,
		subscriptions,
		get subscriptionReleases() { return subscriptionReleases; },
		get acquisitions() { return acquisitions; },
		get releases() { return releases; },
	};
}
