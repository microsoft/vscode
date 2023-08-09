/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtHostChatShape, ExtHostContext, IChatRequestDto, IChatResponseProgressDto, MainContext, MainThreadChatShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IChat, IChatDynamicRequest, IChatProgress, IChatRequest, IChatResponse, IChatResponseProgressFileTreeData, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadChat)
export class MainThreadChat extends Disposable implements MainThreadChatShape {

	private readonly _providerRegistrations = this._register(new DisposableMap<number>());
	private readonly _activeRequestProgressCallbacks = new Map<string, (progress: IChatProgress) => (DeferredPromise<string> | void)>();
	private readonly _stateEmitters = new Map<number, Emitter<any>>();

	private readonly _proxy: ExtHostChatShape;

	private _responsePartHandlePool = 0;
	private readonly _activeResponsePartPromises = new Map<string, DeferredPromise<string | { treeData: IChatResponseProgressFileTreeData }>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatContributionService private readonly chatContribService: IChatContributionService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChat);

		this._register(this._chatService.onDidPerformUserAction(e => {
			this._proxy.$onDidPerformUserAction(e);
		}));
	}

	async $registerSlashCommandProvider(handle: number, chatProviderId: string): Promise<void> {
		const unreg = this._chatService.registerSlashCommandProvider({
			chatProviderId,
			provideSlashCommands: async token => {
				return this._proxy.$provideProviderSlashCommands(handle, token);
			},
			resolveSlashCommand: async (command, token) => {
				return this._proxy.$resolveSlashCommand(handle, command, token);
			}
		});

		this._providerRegistrations.set(handle, unreg);
	}

	async $unregisterSlashCommandProvider(handle: number): Promise<void> {
		this._providerRegistrations.deleteAndDispose(handle);
	}

	$transferChatSession(sessionId: number, toWorkspace: UriComponents): void {
		const sessionIdStr = this._chatService.getSessionId(sessionId);
		if (!sessionIdStr) {
			throw new Error(`Failed to transfer session. Unknown session provider ID: ${sessionId}`);
		}

		const widget = this._chatWidgetService.getWidgetBySessionId(sessionIdStr);
		const inputValue = widget?.inputEditor.getValue() ?? '';
		this._chatService.transferChatSession({ sessionId: sessionIdStr, inputValue: inputValue }, URI.revive(toWorkspace));
	}

	async $registerChatProvider(handle: number, id: string): Promise<void> {
		const registration = this.chatContribService.registeredProviders.find(staticProvider => staticProvider.id === id);
		if (!registration) {
			throw new Error(`Provider ${id} must be declared in the package.json.`);
		}

		const unreg = this._chatService.registerProvider({
			id,
			displayName: registration.label,
			prepareSession: async (initialState, token) => {
				const session = await this._proxy.$prepareChat(handle, initialState, token);
				if (!session) {
					return undefined;
				}

				const responderAvatarIconUri = session.responderAvatarIconUri ?
					URI.revive(session.responderAvatarIconUri) :
					registration.extensionIcon;

				const emitter = new Emitter<any>();
				this._stateEmitters.set(session.id, emitter);
				return <IChat>{
					id: session.id,
					requesterUsername: session.requesterUsername,
					requesterAvatarIconUri: URI.revive(session.requesterAvatarIconUri),
					responderUsername: session.responderUsername,
					responderAvatarIconUri,
					inputPlaceholder: session.inputPlaceholder,
					onDidChangeState: emitter.event,
					dispose: () => {
						emitter.dispose();
						this._stateEmitters.delete(session.id);
						this._proxy.$releaseSession(session.id);
					}
				};
			},
			resolveRequest: async (session, context, token) => {
				const dto = await this._proxy.$resolveRequest(handle, session.id, context, token);
				return <IChatRequest>{
					session,
					...dto
				};
			},
			provideReply: async (request, progress, token) => {
				const id = `${handle}_${request.session.id}`;
				this._activeRequestProgressCallbacks.set(id, progress);
				try {
					const requestDto: IChatRequestDto = {
						message: request.message,
					};
					const dto = await this._proxy.$provideReply(handle, request.session.id, requestDto, token);
					return <IChatResponse>{
						session: request.session,
						...dto
					};
				} finally {
					this._activeRequestProgressCallbacks.delete(id);
				}
			},
			provideWelcomeMessage: (token) => {
				return this._proxy.$provideWelcomeMessage(handle, token);
			},
			provideSlashCommands: (session, token) => {
				return this._proxy.$provideSlashCommands(handle, session.id, token);
			},
			provideFollowups: (session, token) => {
				return this._proxy.$provideFollowups(handle, session.id, token);
			},
			removeRequest: (session, requestId) => {
				return this._proxy.$removeRequest(handle, session.id, requestId);
			}
		});

		this._providerRegistrations.set(handle, unreg);
	}

	async $acceptResponseProgress(handle: number, sessionId: number, progress: IChatResponseProgressDto, responsePartHandle?: number): Promise<number | void> {
		const id = `${handle}_${sessionId}`;

		if ('placeholder' in progress) {
			const responsePartId = `${id}_${++this._responsePartHandlePool}`;
			const deferredContentPromise = new DeferredPromise<string | { treeData: IChatResponseProgressFileTreeData }>();
			this._activeResponsePartPromises.set(responsePartId, deferredContentPromise);
			this._activeRequestProgressCallbacks.get(id)?.({ ...progress, resolvedContent: deferredContentPromise.p });
			return this._responsePartHandlePool;
		} else if (responsePartHandle) {
			// Complete an existing deferred promise with resolved content
			const responsePartId = `${id}_${responsePartHandle}`;
			const deferredContentPromise = this._activeResponsePartPromises.get(responsePartId);
			if (deferredContentPromise && 'treeData' in progress) {
				const withRevivedUris = revive<{ treeData: IChatResponseProgressFileTreeData }>(progress);
				deferredContentPromise.complete(withRevivedUris);
				this._activeResponsePartPromises.delete(responsePartId);
			} else if (deferredContentPromise && 'content' in progress) {
				deferredContentPromise.complete(progress.content);
				this._activeResponsePartPromises.delete(responsePartId);
			}
			return;
		}

		// No need to support standalone tree data that's not attached to a placeholder
		if ('treeData' in progress) {
			return;
		}

		this._activeRequestProgressCallbacks.get(id)?.(progress);
	}

	async $acceptChatState(sessionId: number, state: any): Promise<void> {
		this._stateEmitters.get(sessionId)?.fire(state);
	}

	$addRequest(context: any): void {
		this._chatService.addRequest(context);
	}

	async $sendRequestToProvider(providerId: string, message: IChatDynamicRequest): Promise<void> {
		const widget = await this._chatWidgetService.revealViewForProvider(providerId);
		if (widget && widget.viewModel) {
			this._chatService.sendRequestToProvider(widget.viewModel.sessionId, message);
		}
	}

	async $unregisterChatProvider(handle: number): Promise<void> {
		this._providerRegistrations.deleteAndDispose(handle);
	}
}
