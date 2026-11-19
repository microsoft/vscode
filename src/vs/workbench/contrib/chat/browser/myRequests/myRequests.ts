/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Sequencer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { parseOpenSessionLinkConnectionAuthority, parseOpenSessionLinkTurnId, parseOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { isRequestVM } from '../../common/model/chatViewModel.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { createAgentHostRequestLink } from '../agentSessions/agentHost/agentHostRequestLink.js';
import { IAgentHostUntitledProvisionalSessionService } from '../agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { unwrapChatContextMenuActionContext } from '../chat.js';
import { IMyRequest, maxRecordedRequests, MyRequestsStore } from './myRequestsStore.js';

function currentStore(accessor: ServicesAccessor): MyRequestsStore {
	return new MyRequestsStore(accessor.get(IUserDataProfileService).currentProfile.id);
}

export class MyRequestsRecorder extends Disposable {
	static readonly ID = 'workbench.chat.myRequestsRecorder';

	constructor(
		@IChatService chat: IChatService,
		@IUserDataProfileService profiles: IUserDataProfileService,
		@IAgentHostConnectionsService connections: IAgentHostConnectionsService,
		@IAgentHostUntitledProvisionalSessionService provisional: IAgentHostUntitledProvisionalSessionService,
		@IWorkbenchEnvironmentService environment: IWorkbenchEnvironmentService,
		@INotificationService notifications: INotificationService,
	) {
		super();
		const writes = new Sequencer();
		const warn = () => notifications.warn(localize('myRequests.recordFailed', "Could not update Search My Requests. Your chat submission was not affected."));
		this._register(chat.onDidAcceptRequest(({ chatSessionResource, userSubmission }) => {
			if (!userSubmission) {
				return;
			}
			const store = new MyRequestsStore(profiles.currentProfile.id);
			const recording = store.recording();
			void writes.queue(async () => {
				const epoch = await recording;
				if (epoch && store.profileId === profiles.currentProfile.id) {
					const link = await createAgentHostRequestLink(chatSessionResource, userSubmission.requestId, connections, provisional, environment.remoteAuthority);
					if (link) {
						await store.record(epoch, userSubmission.text, link);
					}
				}
			}).catch(warn);
		}));
		this._register(chat.onDidResolvePendingRequest(({ chatSessionResource, pendingRequestId, requestId }) => {
			const store = new MyRequestsStore(profiles.currentProfile.id);
			void writes.queue(async () => {
				const previous = await createAgentHostRequestLink(chatSessionResource, pendingRequestId, connections, provisional, environment.remoteAuthority);
				const next = previous && await createAgentHostRequestLink(chatSessionResource, requestId, connections, provisional, environment.remoteAuthority);
				if (previous && next) {
					await store.replaceLink(previous, next);
				}
			}).catch(warn);
		}));
	}
}

export function registerMyRequestsActions(): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({ id: 'workbench.action.chat.configureMyRequestRecording', title: localize2('myRequests.configure', "Configure My Request Recording..."), category: CHAT_CATEGORY, precondition: ChatContextKeys.enabled, f1: true });
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const store = currentStore(accessor);
			const dialogs = accessor.get(IDialogService);
			const enabled = !!await store.recording();
			if ((await dialogs.confirm({
				message: enabled ? localize('myRequests.stop', "Stop recording requests?") : localize('myRequests.start', "Record future Agent Host requests in this profile?"),
				detail: enabled
					? localize('myRequests.stopDetail', "Existing requests stay searchable until you forget or clear them.")
					: localize('myRequests.startDetail', "Keep your last {0} submissions on this device. Only the text you sent and a link to the request are saved. Nothing is imported or synced.", maxRecordedRequests),
				primaryButton: enabled ? localize('myRequests.stopButton', "Stop Recording") : localize('myRequests.startButton', "Start Recording"),
			})).confirmed) {
				await store.setRecording(!enabled);
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({ id: 'workbench.action.chat.searchMyRequests', title: localize2('myRequests.search', "Search My Requests"), category: CHAT_CATEGORY, precondition: ChatContextKeys.enabled, f1: true });
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const store = currentStore(accessor);
			const quickInput = accessor.get(IQuickInputService);
			const dialogs = accessor.get(IDialogService);
			const opener = accessor.get(IOpenerService);
			const clipboard = accessor.get(IClipboardService);
			const requests = await store.search();
			if (!requests.length) {
				await dialogs.info(localize('myRequests.empty', "No requests recorded in this profile."), localize('myRequests.emptyDetail', "Use Chat: Configure My Request Recording to start saving future Agent Host requests."));
				return;
			}
			const picked = await quickInput.pick(requests.map(request => ({ label: request.text.replace(/\s+/g, ' '), description: request.link, request })), {
				title: localize('myRequests.title', "Search My Requests"),
				placeHolder: localize('myRequests.filter', "Type words from your request, then select it to read the full text"),
				sortByLabel: false,
			});
			if (!picked) {
				return;
			}
			const { request } = picked;
			await dialogs.prompt({
				message: localize('myRequests.saved', "Saved request"),
				detail: request.text,
				buttons: [
					{
						label: localize('myRequests.open', "Open Request"), run: async () => {
							if (!parseOpenSessionLinkUri(request.link) || !parseOpenSessionLinkConnectionAuthority(request.link) || !parseOpenSessionLinkTurnId(request.link) || !await opener.open(request.link, { allowContributedOpeners: false })) {
								await dialogs.info(localize('myRequests.unavailable', "The original request is unavailable in this window. Reconnect its Agent Host and try again."));
							}
						}
					},
					{ label: localize('myRequests.copyLink', "Copy Link to Request"), run: () => clipboard.writeText(request.link) },
					{ label: localize('myRequests.forget', "Forget Request"), run: () => store.forget(request) },
				],
				cancelButton: true,
			});
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({ id: 'workbench.action.chat.clearMyRequests', title: localize2('myRequests.clear', "Clear My Recorded Requests..."), category: CHAT_CATEGORY, precondition: ChatContextKeys.enabled, f1: true });
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const store = currentStore(accessor);
			if ((await accessor.get(IDialogService).confirm({
				message: localize('myRequests.clearConfirm', "Forget all recorded requests in this profile?"),
				detail: localize('myRequests.clearDetail', "This clears the local search index, not the original chats. Your recording preference will not change."),
				primaryButton: localize('myRequests.clearButton', "Clear Requests"),
			})).confirmed) {
				await store.clear();
			}
		}
	});

	registerAction2(CopyLinkToRequestAction);
	CommandsRegistry.registerCommand('workbench.action.chat.requestMyRequestMatches', requestMyRequestMatches);
}

export class CopyLinkToRequestAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.copyLinkToRequest',
			title: localize2('myRequests.copyLink', "Copy Link to Request"),
			category: CHAT_CATEGORY,
			menu: { id: MenuId.ChatContext, group: 'copy', when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.isRequest, ChatContextKeys.chatIsAgentHostSession) },
		});
	}

	override async run(accessor: ServicesAccessor, context: unknown): Promise<void> {
		const item = unwrapChatContextMenuActionContext(context);
		if (!isRequestVM(item)) {
			return;
		}
		const clipboard = accessor.get(IClipboardService);
		const link = await createAgentHostRequestLink(item.sessionResource, item.id, accessor.get(IAgentHostConnectionsService), accessor.get(IAgentHostUntitledProvisionalSessionService), accessor.get(IWorkbenchEnvironmentService).remoteAuthority);
		if (!link) {
			throw new Error(localize('myRequests.noLink', "This request does not yet have a stable Agent Host link."));
		}
		await clipboard.writeText(link);
		status(localize('myRequests.copied', "Request link copied"));
	}
}

export async function requestMyRequestMatches(accessor: ServicesAccessor, query: unknown): Promise<IMyRequest[]> {
	if (accessor.get(IChatEntitlementService).sentiment.hidden) {
		return [];
	}
	if (typeof query !== 'string' || !query.trim()) {
		throw new Error(localize('myRequests.queryRequired', "Provide words to search for in recorded requests."));
	}
	const profiles = accessor.get(IUserDataProfileService);
	const store = currentStore(accessor);
	const quickInput = accessor.get(IQuickInputService);
	const dialogs = accessor.get(IDialogService);
	const matches = await store.search(query);
	const picked = await quickInput.pick(matches.map(request => ({ label: request.text.replace(/\s+/g, ' '), description: request.link, request })), {
		title: localize('myRequests.shareTitle', "Choose a Request to Share"),
		placeHolder: localize('myRequests.shareHint', "Matches for '{0}'. Select one to review, or press Escape to share nothing.", query),
	});
	if (!picked || !(await dialogs.confirm({
		message: localize('myRequests.shareConfirm', "Share this request text and link with the caller?"),
		detail: `${picked.request.text}\n\n${picked.request.link}`,
		primaryButton: localize('myRequests.share', "Share Request"),
	})).confirmed || profiles.currentProfile.id !== store.profileId) {
		return [];
	}
	// Revocation in another window while the picker was open takes precedence over its snapshot.
	const shared = (await store.search(query)).find(request => request.link === picked.request.link && request.text === picked.request.text);
	return shared ? [shared] : [];
}
