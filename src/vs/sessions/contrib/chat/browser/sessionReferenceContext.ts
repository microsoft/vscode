/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { SessionReferenceContextPickerPick } from '../../../../workbench/contrib/chat/browser/actions/chatContext.js';
import { IChatContextPicker, IChatContextPickerItem, IChatContextPickService } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { createChatReferenceVariableEntry, hasIncompatibleSessionContext, IChatRequestVariableEntry, withSessionContextSource } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getChatHarness, IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionReferenceContextPicker extends Disposable implements IChatContextPickerItem {
	readonly type = 'pickerPick';
	readonly icon = Codicon.comment;
	readonly label = localize('sessionContext.sessions', "Sessions...");
	readonly ordinal = -400;

	private readonly fallback: SessionReferenceContextPickerPick;

	constructor(
		private readonly widget: IChatWidget,
		private readonly getTarget: () => { session: ISession; chat: IChat } | undefined,
		@IChatContextPickService contextPickService: IChatContextPickService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.fallback = instantiationService.createInstance(SessionReferenceContextPickerPick);
		this._register(contextPickService.registerChatContextItem(this));
	}

	isEnabled(widget: IChatWidget): boolean {
		if (widget !== this.widget || this.chatEntitlementService.sentiment.hidden || widget.location !== ChatAgentLocation.Chat) {
			return false;
		}
		const target = this.getTarget();
		const provider = target && this.sessionsProvidersService.getProvider(target.session.providerId);
		if (!target || !provider) {
			return false;
		}
		return isAgentHostProvider(provider) && getChatHarness(target.session, target.chat) === 'copilot'
			? this.getHost(target.session) !== undefined
			: this.fallback.isEnabled(widget);
	}

	validateAttachments(attachments: readonly IChatRequestVariableEntry[]): boolean {
		const target = this.getTarget();
		if (!hasIncompatibleSessionContext(attachments, target && this.getHost(target.session))) {
			return true;
		}
		this.notificationService.warn(localize('sessionContext.unavailable', "An attached session is not available on the selected agent host. Remove it or switch back to its host before sending."));
		return false;
	}

	asPicker(widget: IChatWidget): IChatContextPicker {
		if (!this.isEnabled(widget)) {
			return { placeholder: localize('sessionContext.placeholder', "Select a session"), picks: Promise.resolve([]) };
		}
		const target = this.getTarget();
		const targetProvider = target && this.sessionsProvidersService.getProvider(target.session.providerId);
		if (!target || !targetProvider || !isAgentHostProvider(targetProvider) || getChatHarness(target.session, target.chat) !== 'copilot') {
			return this.fallback.asPicker(widget);
		}
		const host = target && this.getHost(target.session);
		const sessions = target && host !== undefined && this.isEnabled(widget) ? this.sessionsManagementService.getSessions()
			.filter(session => !isEqual(session.resource, target.session.resource) && this.getAttachment(session, host) !== undefined)
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime()) : [];
		return {
			placeholder: localize('sessionContext.placeholder', "Select a session"),
			picks: Promise.resolve(sessions.map(session => ({
				label: session.title.get() || localize('sessionContext.untitled', "Untitled session"),
				description: session.updatedAt.get().toLocaleString(),
				asAttachment: () => {
					const current = this.getTarget();
					if (!this.isEnabled(widget) || !isEqual(target?.chat.resource, current?.chat.resource) || host !== (current && this.getHost(current.session))) {
						this.notificationService.warn(localize('sessionContext.targetChanged', "The chat target changed. Select the session context again."));
						return 'noop';
					}
					const source = this.sessionsManagementService.getSessions().find(candidate => isEqual(candidate.resource, session.resource));
					const attachment = source && host !== undefined ? this.getAttachment(source, host) : undefined;
					if (!attachment) {
						this.notificationService.warn(localize('sessionContext.sourceUnavailable', "The selected session context is no longer available."));
						return 'noop';
					}
					return attachment;
				},
			}))),
		};
	}

	private getHost(session: ISession): string | undefined {
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider) || (session.status.get() === SessionStatus.Untitled && provider.isDevContainerRequested?.(session.sessionId))) {
			return undefined;
		}
		const authority = this.connectionsService.resolveSessionResourceIdentity(session.resource)?.connectionAuthority
			?? (provider.remoteAddress ? agentHostAuthority(provider.remoteAddress) : AMBIENT_AGENT_HOST_AUTHORITY);
		return this.connectionsService.getConnectionByAuthority(authority)?.resourceUris.authority ?? authority;
	}

	private getAttachment(session: ISession, host: string): IChatRequestVariableEntry | undefined {
		const name = session.title.get() || localize('sessionContext.untitled', "Untitled session");
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		const chat = session.mainChat.get();
		if (!provider || !isAgentHostProvider(provider) || this.getHost(session) !== host || getChatHarness(session, chat) !== 'copilot') {
			return undefined;
		}
		const backendChat = provider.getBackendChatResource(chat.resource);
		return backendChat ? withSessionContextSource(createChatReferenceVariableEntry(backendChat, undefined, name), host) : undefined;
	}
}
