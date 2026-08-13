/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionRoutingDispatchResult, IChatSessionRoutingProvider, IChatSessionRoutingProviderService, IRoutableSession } from '../../../../workbench/contrib/chat/common/sessionRouter.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService, WorkspaceNotTrustedError } from '../../../services/sessions/common/sessionsManagement.js';

interface ISessionRoutingTarget {
	readonly session: ISession;
	readonly chat: IChat;
}

export class OmniSessionRoutingAdapter extends Disposable implements IChatSessionRoutingProvider {

	private readonly sessions = new Map<string, ISession>();

	constructor(
		private readonly sessionsManagementService: ISessionsManagementService,
		private readonly sessionsService: ISessionsService,
	) {
		super();
		this._refreshSessions();
		this._register(this.sessionsManagementService.onDidChangeSessions(() => this._refreshSessions()));
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => this._refreshSessions()));
	}

	getCandidateSessions(token: CancellationToken): readonly IRoutableSession[] {
		if (token.isCancellationRequested) {
			return [];
		}
		this._refreshSessions();
		return [...this.sessions.values()].map(session => this._toCandidate(session));
	}

	resolveSessionResource(sessionId: string): URI | undefined {
		return this._resolveTarget(sessionId)?.session.resource;
	}

	async dispatchToSession(sessionId: string, message: string, options: IChatSendRequestOptions, token: CancellationToken): Promise<IChatSessionRoutingDispatchResult> {
		if (token.isCancellationRequested) {
			return this._cancelled();
		}
		const target = this._resolveTarget(sessionId);
		if (!target) {
			return {
				status: 'rejected',
				reasonCode: 'providerRemoved',
				reason: localize('omniSessionRouting.sessionUnavailable', "The selected session is no longer available."),
			};
		}
		const unsupported = this._getUnsupportedOptions(options);
		if (unsupported) {
			return unsupported;
		}

		try {
			await this.sessionsManagementService.sendRequest(target.session, target.chat, {
				query: message,
				attachedContext: options.attachedContext?.length ? [...options.attachedContext] : undefined,
				background: true,
			});
			return { status: 'sent', resource: target.session.resource };
		} catch (error) {
			return this._toRejectedResult(error, target.session.resource);
		}
	}

	async dispatchToNewSession(folder: URI | undefined, message: string, options: IChatSendRequestOptions, token: CancellationToken): Promise<IChatSessionRoutingDispatchResult> {
		if (token.isCancellationRequested) {
			return this._cancelled();
		}
		const unsupported = this._getUnsupportedOptions(options);
		if (unsupported) {
			return unsupported;
		}

		const sendOptions: ISendRequestOptions = {
			query: message,
			attachedContext: options.attachedContext?.length ? [...options.attachedContext] : undefined,
			background: true,
		};
		const createOptions = this._toCreateOptions(options);
		try {
			const session = folder
				? await this.sessionsManagementService.createAndSendNewChatRequest(folder, sendOptions, createOptions, token)
				: await this.sessionsManagementService.createAndSendQuickChatRequest(sendOptions, createOptions, token);
			if (!session) {
				return {
					status: 'rejected',
					reasonCode: 'providerRemoved',
					reason: localize('omniSessionRouting.sessionNotCreated', "The Sessions provider could not create the new session."),
				};
			}
			return { status: 'sent', resource: session.resource };
		} catch (error) {
			return this._toRejectedResult(error);
		}
	}

	revealSession(resource: URI): Promise<void> {
		return this.sessionsService.openSession(resource);
	}

	private _refreshSessions(): void {
		this.sessions.clear();
		for (const session of this.sessionsManagementService.getSessions()) {
			if (this._getRoutableChat(session)) {
				this.sessions.set(session.sessionId, session);
			}
		}
	}

	private _resolveTarget(sessionId: string): ISessionRoutingTarget | undefined {
		this._refreshSessions();
		const session = this.sessions.get(sessionId) ?? this._findSessionByResource(sessionId);
		if (!session) {
			return undefined;
		}
		const chat = this._findChatByResource(session, sessionId) ?? this._getRoutableChat(session);
		return chat ? { session, chat } : undefined;
	}

	private _findSessionByResource(value: string): ISession | undefined {
		let resource: URI;
		try {
			resource = URI.parse(value);
		} catch {
			return undefined;
		}
		const session = this.sessionsManagementService.getSession(resource)
			?? this.sessionsManagementService.getSessionForChatResource(resource)?.session;
		return session && this.sessions.has(session.sessionId) ? session : undefined;
	}

	private _findChatByResource(session: ISession, value: string): IChat | undefined {
		return session.chats.get().find(chat => chat.resource.toString() === value && this._isRoutableChat(chat));
	}

	private _getRoutableChat(session: ISession): IChat | undefined {
		if (session.status.get() === SessionStatus.Untitled
			|| session.isArchived.get()
			|| session.isAutomation?.get()) {
			return undefined;
		}
		const mainChat = session.mainChat.get();
		if (this._isRoutableChat(mainChat)) {
			return mainChat;
		}
		return [...session.chats.get()]
			.filter(chat => this._isRoutableChat(chat))
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime())[0];
	}

	private _isRoutableChat(chat: IChat): boolean {
		return chat.status.get() !== SessionStatus.Untitled
			&& !chat.isArchived.get()
			&& chat.interactivity.get() === ChatInteractivity.Full;
	}

	private _toCandidate(session: ISession): IRoutableSession {
		const workspace = session.workspace.get();
		const folder = workspace?.folders[0];
		const gitHubInfo = folder?.gitRepository?.gitHubInfo.get();
		return {
			sessionId: session.sessionId,
			label: session.title.get(),
			repo: gitHubInfo ? `${gitHubInfo.owner}/${gitHubInfo.repo}` : undefined,
			cwd: folder?.workingDirectory.path,
			status: this._statusToString(session.status.get()),
			lastActivity: session.lastTurnEnd.get()?.getTime() ?? session.updatedAt.get().getTime(),
			description: this._markdownToText(session.description.get()),
		};
	}

	private _statusToString(status: SessionStatus): string {
		switch (status) {
			case SessionStatus.InProgress: return 'working';
			case SessionStatus.NeedsInput: return 'needsInput';
			case SessionStatus.Completed: return 'idle';
			case SessionStatus.Error: return 'failed';
			case SessionStatus.Untitled: return 'draft';
		}
	}

	private _markdownToText(value: IMarkdownString | undefined): string | undefined {
		const text = value?.value.trim();
		return text || undefined;
	}

	private _getUnsupportedOptions(options: IChatSendRequestOptions): IChatSessionRoutingDispatchResult | undefined {
		if (options.userSelectedModelConfiguration && Object.keys(options.userSelectedModelConfiguration).length) {
			return this._unsupported(localize('omniSessionRouting.modelConfigurationUnsupported', "The selected model configuration cannot be sent through Sessions."));
		}
		// The chat widget snapshots every default-enabled tool as `true`. Sessions
		// providers own that default tool set, so only an actual disabled-tool
		// override is unsupported and must be rejected rather than dropped.
		if (options.userSelectedTools && Object.values(options.userSelectedTools.get()).some(enabled => !enabled)) {
			return this._unsupported(localize('omniSessionRouting.toolsUnsupported', "The selected tool configuration cannot be sent through Sessions."));
		}
		if (options.resolvedVariables?.length) {
			return this._unsupported(localize('omniSessionRouting.variablesUnsupported', "Resolved request variables cannot be sent through Sessions."));
		}
		if (options.agentHostSessionConfig && Object.keys(options.agentHostSessionConfig).length) {
			return this._unsupported(localize('omniSessionRouting.sessionConfigurationUnsupported', "The selected Agent Host session configuration cannot be sent through Sessions."));
		}
		return undefined;
	}

	private _toCreateOptions(options: IChatSendRequestOptions): ICreateNewSessionOptions | undefined {
		const modeId = options.modeInfo?.modeInstructions?.uri?.toString()
			?? options.modeInfo?.modeInstructions?.name
			?? options.modeInfo?.kind;
		const createOptions: ICreateNewSessionOptions = {
			modelId: options.userSelectedModelId,
			modeId,
			permissionLevel: options.modeInfo?.permissionLevel,
		};
		return createOptions.modelId || createOptions.modeId || createOptions.permissionLevel ? createOptions : undefined;
	}

	private _unsupported(reason: string): IChatSessionRoutingDispatchResult {
		return { status: 'rejected', reasonCode: 'unsupportedOptions', reason };
	}

	private _cancelled(resource?: URI): IChatSessionRoutingDispatchResult {
		return {
			status: 'rejected',
			resource,
			reasonCode: 'cancelled',
			reason: localize('omniSessionRouting.cancelled', "The request was cancelled."),
		};
	}

	private _toRejectedResult(error: unknown, resource?: URI): IChatSessionRoutingDispatchResult {
		if (isCancellationError(error)) {
			return this._cancelled(resource);
		}
		if (error instanceof WorkspaceNotTrustedError) {
			return {
				status: 'rejected',
				resource,
				reasonCode: 'workspaceNotTrusted',
				reason: localize('omniSessionRouting.workspaceNotTrusted', "The selected workspace or folder is not trusted."),
			};
		}
		return { status: 'rejected', resource, reason: getErrorMessage(error) };
	}
}

class OmniSessionRoutingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.omniSessionRouting';

	constructor(
		@IChatSessionRoutingProviderService routingProviderService: IChatSessionRoutingProviderService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsService sessionsService: ISessionsService,
	) {
		super();
		const adapter = this._register(new OmniSessionRoutingAdapter(sessionsManagementService, sessionsService));
		this._register(routingProviderService.registerProvider(adapter));
	}
}

registerWorkbenchContribution2(OmniSessionRoutingContribution.ID, OmniSessionRoutingContribution, WorkbenchPhase.BlockRestore);
