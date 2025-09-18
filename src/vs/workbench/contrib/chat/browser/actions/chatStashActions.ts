/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatStashService, IStashedChatSession } from '../../common/chatStashService.js';
import { showChatView } from '../chat.js';

interface IStashQuickPickItem extends IQuickPickItem {
	stashId: string;
	stash: IStashedChatSession;
}

class StashCurrentChatSessionAction extends Action2 {
	static readonly ID = 'workbench.action.chat.stashCurrentSession';

	constructor() {
		super({
			id: StashCurrentChatSessionAction.ID,
			title: localize2('stashCurrentSession', "Stash Current Chat Session"),
			category: CHAT_CATEGORY,
			icon: Codicon.gitStash,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.canStashCurrentSession)
			},
			menu: [
				{
					id: MenuId.ChatInput,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.canStashCurrentSession),
					group: 'stash',
					order: 1
				},
				{
					id: MenuId.CommandPalette,
					when: ChatContextKeys.enabled
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const chatService = accessor.get(IChatService);
		const quickInputService = accessor.get(IQuickInputService);

		try {
			// Ask for optional title
			const title = await quickInputService.input({
				prompt: localize2('stashTitle', "Enter a title for this stash (optional)").value,
				placeHolder: localize2('stashTitlePlaceholder', "Auto-generated from first message").value,
				validateInput: async (value) => {
					if (value && value.trim().length > 100) {
						return localize2('stashTitleTooLong', "Title cannot exceed 100 characters").value;
					}
					return undefined;
				}
			});

			if (title === undefined) {
				// User cancelled
				return;
			}

			const stashId = await chatService.stashCurrentSession(title.trim() || undefined);
			if (stashId) {
				// Show success message
				// TODO: Consider showing a toast notification when that's available
			}
		} catch (error) {
			console.error('Failed to stash chat session:', error);
		}
	}
}

class ResumeStashedChatSessionAction extends Action2 {
	static readonly ID = 'workbench.action.chat.resumeStashedSession';

	constructor() {
		super({
			id: ResumeStashedChatSessionAction.ID,
			title: localize2('resumeStashedSession', "Resume Stashed Chat Session"),
			category: CHAT_CATEGORY,
			icon: Codicon.gitStashPop,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.hasStashedSessions)
			},
			menu: [
				{
					id: MenuId.ChatInput,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.hasStashedSessions),
					group: 'stash',
					order: 2
				},
				{
					id: MenuId.CommandPalette,
					when: ChatContextKeys.enabled
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, stashId?: string): Promise<void> {
		const chatService = accessor.get(IChatService);
		const chatStashService = accessor.get(IChatStashService);
		const quickInputService = accessor.get(IQuickInputService);
		const viewsService = accessor.get(IViewsService);

		try {
			let targetStashId = stashId;

			// If no specific stash ID provided, show quick pick
			if (!targetStashId) {
				const stashes = await chatStashService.getStashedSessions();
				if (stashes.length === 0) {
					return;
				}

				const quickPickItems: IStashQuickPickItem[] = stashes.map(stash => ({
					label: stash.stashTitle || 'Untitled Chat',
					description: this.formatStashDescription(stash),
					detail: this.formatStashDetail(stash),
					stashId: stash.stashId,
					stash
				}));

				const selectedItem = await quickInputService.pick(quickPickItems, {
					placeHolder: localize2('selectStashToResume', "Select a stashed chat session to resume").value,
					matchOnDescription: true,
					matchOnDetail: true
				});

				if (!selectedItem) {
					return;
				}

				targetStashId = selectedItem.stashId;
			}

			// Resume the stashed session
			const restoredModel = await chatService.resumeStashedSession(targetStashId);
			if (restoredModel) {
				// Open chat view to show the resumed session
				await showChatView(viewsService);
			}
		} catch (error) {
			console.error('Failed to resume stashed chat session:', error);
		}
	}

	private formatStashDescription(stash: IStashedChatSession): string {
		const messageCount = stash.requests.length;
		const timeAgo = this.getTimeAgo(stash.stashTimestamp);
		return `${messageCount} message${messageCount !== 1 ? 's' : ''} • ${timeAgo}`;
	}

	private formatStashDetail(stash: IStashedChatSession): string {
		// Show a preview of the first user message
		if (stash.requests.length > 0) {
			const firstRequest = stash.requests[0];
			const firstMessage = typeof firstRequest.message === 'string' ? firstRequest.message : firstRequest.message.text;
			if (firstMessage) {
				return firstMessage.length > 80 ? `${firstMessage.substring(0, 77)}...` : firstMessage;
			}
		}
		return 'Empty session';
	}

	private getTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / (1000 * 60));
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days > 0) {
			return `${days} day${days !== 1 ? 's' : ''} ago`;
		} else if (hours > 0) {
			return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
		} else if (minutes > 0) {
			return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
		} else {
			return 'Just now';
		}
	}
}

class ListStashedChatSessionsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.listStashedSessions';

	constructor() {
		super({
			id: ListStashedChatSessionsAction.ID,
			title: localize2('listStashedSessions', "Manage Stashed Chat Sessions"),
			category: CHAT_CATEGORY,
			icon: Codicon.listSelection,
			menu: [
				{
					id: MenuId.CommandPalette,
					when: ChatContextKeys.enabled
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const chatStashService = accessor.get(IChatStashService);
		const quickInputService = accessor.get(IQuickInputService);
		const dialogService = accessor.get(IDialogService);

		try {
			const stashes = await chatStashService.getStashedSessions();
			if (stashes.length === 0) {
				await dialogService.info(
					localize2('noStashedSessions', "No Stashed Sessions").value,
					localize2('noStashedSessionsMessage', "You don't have any stashed chat sessions.").value
				);
				return;
			}

			const quickPickItems: (IStashQuickPickItem | QuickPickInput)[] = stashes.map(stash => ({
				label: `$(history) ${stash.stashTitle || 'Untitled Chat'}`,
				description: this.formatStashDescription(stash),
				detail: this.formatStashDetail(stash),
				stashId: stash.stashId,
				stash
			}));

			// Add management options
			quickPickItems.push(
				{ type: 'separator', label: 'Actions' },
				{
					label: `$(trash) ${localize2('clearAllStashes', "Clear All Stashed Sessions").value}`,
					description: localize2('clearAllStashesDescription', "Delete all stashed chat sessions").value,
					stashId: '__clear_all__',
					stash: undefined as any
				}
			);

			const selectedItem = await quickInputService.pick(quickPickItems, {
				placeHolder: localize2('selectStashAction', "Select a stashed session to resume or choose an action").value,
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (!selectedItem || !('stashId' in selectedItem)) {
				return;
			}

			const item = selectedItem as IStashQuickPickItem;

			if (item.stashId === '__clear_all__') {
				const confirmed = await dialogService.confirm({
					message: localize2('confirmClearAllStashes', "Clear All Stashed Sessions").value,
					detail: localize2('confirmClearAllStashesDetail', "This will permanently delete all stashed chat sessions. This action cannot be undone.").value,
					primaryButton: localize2('clearAllStashesButton', "Clear All").value
				});

				if (confirmed.confirmed) {
					await chatStashService.clearAllStashedSessions();
				}
			} else {
				// Resume the selected stash
				const resumeAction = new ResumeStashedChatSessionAction();
				await resumeAction.run(accessor, item.stashId);
			}
		} catch (error) {
			console.error('Failed to manage stashed chat sessions:', error);
		}
	}

	private formatStashDescription(stash: IStashedChatSession): string {
		const messageCount = stash.requests.length;
		const timeAgo = this.getTimeAgo(stash.stashTimestamp);
		return `${messageCount} message${messageCount !== 1 ? 's' : ''} • ${timeAgo}`;
	}

	private formatStashDetail(stash: IStashedChatSession): string {
		if (stash.requests.length > 0) {
			const firstRequest = stash.requests[0];
			const firstMessage = typeof firstRequest.message === 'string' ? firstRequest.message : firstRequest.message.text;
			if (firstMessage) {
				return firstMessage.length > 80 ? `${firstMessage.substring(0, 77)}...` : firstMessage;
			}
		}
		return 'Empty session';
	}

	private getTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / (1000 * 60));
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days > 0) {
			return `${days} day${days !== 1 ? 's' : ''} ago`;
		} else if (hours > 0) {
			return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
		} else if (minutes > 0) {
			return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
		} else {
			return 'Just now';
		}
	}
}

class ClearAllStashedSessionsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.clearAllStashedSessions';

	constructor() {
		super({
			id: ClearAllStashedSessionsAction.ID,
			title: localize2('clearAllStashedSessions', "Clear All Stashed Chat Sessions"),
			category: CHAT_CATEGORY,
			icon: Codicon.clearAll,
			menu: [
				{
					id: MenuId.CommandPalette,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.hasStashedSessions)
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const chatStashService = accessor.get(IChatStashService);
		const dialogService = accessor.get(IDialogService);

		try {
			const stashCount = await chatStashService.getStashCount();
			if (stashCount === 0) {
				return;
			}

			const confirmed = await dialogService.confirm({
				message: localize2('confirmClearAllStashes', "Clear All Stashed Sessions").value,
				detail: localize2('confirmClearAllStashesMessage', "This will permanently delete all {0} stashed chat sessions. This action cannot be undone.", stashCount).value,
				primaryButton: localize2('clearAllStashesButton', "Clear All").value
			});

			if (confirmed.confirmed) {
				await chatStashService.clearAllStashedSessions();
			}
		} catch (error) {
			console.error('Failed to clear all stashed chat sessions:', error);
		}
	}
}

export function registerChatStashActions(): void {
	registerAction2(StashCurrentChatSessionAction);
	registerAction2(ResumeStashedChatSessionAction);
	registerAction2(ListStashedChatSessionsAction);
	registerAction2(ClearAllStashedSessionsAction);
}
