/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isEqual } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ChatInteractivity, IChat, isActiveSessionStatus, ISession, isSessionCreated, SessionStatus } from '../../../services/sessions/common/session.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { SessionsCategories } from '../common/categories.js';
import { SessionChatItemIsArchivedContext } from './views/sessionsList.js';
import { SessionIsArchivedContext } from '../common/contextkeys.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { Menus } from './menus.js';

interface IChatTarget extends IQuickPickItem {
	readonly session: ISession;
	readonly chat: IChat;
}

function canSendInstruction(session: ISession, chat: IChat): boolean {
	const connection = session.remoteConnectionStatus?.get();
	return isSessionCreated(session)
		&& session.capabilities.get().supportsBackgroundDispatch === true
		&& !session.isArchived.get()
		&& !chat.isArchived.get()
		&& chat.interactivity.get() === ChatInteractivity.Full
		&& chat.status.get() !== SessionStatus.Untitled
		&& !isActiveSessionStatus(chat.status.get())
		&& (!connection || connection.kind === 'connected');
}

/** Select existing chats and submit the same instruction without navigating or changing their configuration. */
export class SendInstructionToChatsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.sessions.sendInstructionToChats',
			title: localize2('sendInstructionToChats', "Send Instruction to Chats..."),
			category: SessionsCategories.Sessions,
			icon: Codicon.send,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: 'navigation',
				order: 20,
			}, {
				id: Menus.SessionItemContextMenu,
				group: 'navigation',
				order: 3,
				when: SessionIsArchivedContext.negate(),
			}, {
				id: Menus.SessionChatItemContext,
				group: 'navigation',
				order: 3,
				when: SessionChatItemIsArchivedContext.negate(),
			}, {
				id: Menus.AutomationsHistoryItemContext,
				group: 'navigation',
				order: 3,
				when: SessionIsArchivedContext.negate(),
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISession | ISession[] | { readonly session: ISession; readonly chat: IChat }): Promise<void> {
		const management = accessor.get(ISessionsManagementService);
		const quickInput = accessor.get(IQuickInputService);
		const notifications = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);
		const preselected = context
			? Array.isArray(context) ? context.map(session => session.mainChat.get())
				: hasKey(context, { session: true, chat: true }) ? [context.chat] : [context.mainChat.get()]
			: [];
		const targets = new Map<string, IChatTarget>();
		for (const session of management.getSessions()) {
			for (const chat of [session.mainChat.get(), ...session.chats.get()]) {
				if (canSendInstruction(session, chat)) {
					targets.set(chat.resource.toString(), {
						session,
						chat,
						label: chat.title.get(),
						description: session.title.get(),
						detail: session.isAutomation?.get()
							? localize('automationChatTarget', "Automation run: {0}", chat.workspace.get()?.label ?? '')
							: localize('agentChatTarget', "Agent chat: {0}", chat.workspace.get()?.label ?? ''),
						picked: preselected.some(selected => isEqual(selected.resource, chat.resource)),
					});
				}
			}
		}
		if (targets.size === 0) {
			notifications.warn(localize('noInstructionTargets', "No chats are available. Chats must support background instructions, be connected, idle, and editable, and must not be archived or waiting for approval."));
			return;
		}
		const selected = await quickInput.pick([...targets.values()], {
			title: localize('selectInstructionTargets', "Select Chats for a Shared Instruction"),
			placeHolder: localize('selectInstructionTargetsPlaceholder', "Select agent chats or automation-run chats"),
			prompt: localize('selectInstructionTargetsPrompt', "Only idle, connected, editable chats are shown."),
			canPickMany: true,
			matchOnDescription: true,
			matchOnDetail: true,
		});
		if (!selected?.length) {
			return;
		}
		const query = await quickInput.input({
			title: localize('sharedInstructionTitle', "Send Instruction to {0} Chats", selected.length),
			prompt: localize('sharedInstructionPrompt', "This instruction will be submitted to all {0} selected chats using their existing permissions. Automation schedules are not changed.", selected.length),
			validateInput: async value => value.trim() ? undefined : localize('emptySharedInstruction', "Enter an instruction."),
		});
		if (query === undefined) {
			return;
		}
		if (!query.trim()) {
			notifications.warn(localize('emptySharedInstruction', "Enter an instruction."));
			return;
		}

		const results = await progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('sendingSharedInstruction', "Submitting Instruction to {0} Chats", selected.length),
		}, async progress => {
			const limiter = new Limiter<void>(4);
			try {
				return await Promise.allSettled(selected.map(target => limiter.queue(async () => {
					const session = management.getSession(target.session.resource);
					const chat = session?.chats.get().find(chat => isEqual(chat.resource, target.chat.resource))
						?? (session && isEqual(session.mainChat.get().resource, target.chat.resource) ? session.mainChat.get() : undefined);
					if (!session || !chat || !canSendInstruction(session, chat)) {
						throw new Error(localize('instructionTargetUnavailable', "The chat is no longer available for an instruction."));
					}
					await management.sendRequestInBackground(session, chat, { query, preserveDraft: true });
					progress.report({ increment: 100 / selected.length });
				})));
			} finally {
				limiter.dispose();
			}
		});
		const failures = results.flatMap((result, index) => result.status === 'rejected'
			? [localize('instructionTargetFailed', "{0}: {1}", selected[index].label, toErrorMessage(result.reason))]
			: []);
		if (failures.length) {
			notifications.error(localize('sharedInstructionFailed', "Instruction submitted to {0} of {1} chats. Failed chats were not retried:\n{2}", selected.length - failures.length, selected.length, failures.join('\n')));
		} else {
			notifications.info(localize('sharedInstructionSubmitted', "Instruction submitted to {0} chats.", selected.length));
		}
	}
}
