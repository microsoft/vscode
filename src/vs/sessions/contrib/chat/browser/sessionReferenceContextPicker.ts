/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatContextPicker, IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { buildHostLocalEventsPath, parseRemoteAuthorityFromScheme } from '../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ICopilotHomeService } from '../../../../workbench/services/environment/common/copilotHomeService.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';

/**
 * The "Sessions..." attachment picker for the Agents window.
 *
 * The editor window's picker lists sessions from chat session item controllers,
 * which the Agents window does not register. This picker lists the same sessions
 * the Agents window sidebar shows instead.
 */
export class SessionReferenceContextPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly icon = Codicon.comment;
	readonly label = localize('chatContext.sessions', 'Sessions...');
	readonly ordinal = -400;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ICopilotHomeService private readonly _copilotHomeService: ICopilotHomeService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
	) { }

	isEnabled(widget: IChatWidget): boolean {
		return widget.location === ChatAgentLocation.Chat;
	}

	asPicker(widget: IChatWidget): IChatContextPicker {
		const currentSession = widget.viewModel?.sessionResource;
		// The agent can only read event logs on the host it runs on (undefined means local).
		const currentHost = currentSession && parseRemoteAuthorityFromScheme(currentSession.scheme);
		const picks = this._sessionsManagementService.getSessions()
			.filter(session => !isEqual(session.resource, currentSession)
				&& parseRemoteAuthorityFromScheme(session.resource.scheme) === currentHost
				&& this._hasReadableEventLog(session))
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime())
			.map(session => this._toPick(session));

		return {
			placeholder: localize('chatContext.sessions.placeholder', 'Select a session'),
			picks: Promise.resolve(picks),
		};
	}

	/** A session can only be attached when the agent can read its Copilot CLI event log. */
	private _hasReadableEventLog(session: ISession): boolean {
		return !!buildHostLocalEventsPath(
			session.resource,
			this._copilotHomeService.home,
			authority => this._remoteAgentHostService.connections.find(connection => agentHostAuthority(connection.address) === authority),
		);
	}

	private _toPick(session: ISession): IChatContextPickerPickItem {
		const title = session.title.get();
		return {
			label: title,
			description: session.updatedAt.get().toLocaleString(),
			asAttachment: () => ({
				kind: 'sessionReference',
				id: session.resource.toString(),
				name: title,
				value: session.resource,
				icon: session.icon,
			}),
		};
	}
}

class SessionReferenceContextPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionReferenceContextPicker';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatContextPickService contextPickService: IChatContextPickService,
	) {
		super();
		this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(SessionReferenceContextPickerPick)));
	}
}

registerWorkbenchContribution2(SessionReferenceContextPickerContribution.ID, SessionReferenceContextPickerContribution, WorkbenchPhase.AfterRestored);
