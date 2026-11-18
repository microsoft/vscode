/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { canOpenChatRequestHistoryEntryIn, IChatRequestHistoryEntry, IChatRequestHistoryService } from '../../common/requestHistory/chatRequestHistory.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { chatRequestHistoryWhen } from './searchRequestHistoryTool.js';

export const SEARCH_CHAT_REQUEST_HISTORY_ACTION_ID = 'workbench.action.chat.searchRequestHistory';
export const CLEAR_CHAT_REQUEST_HISTORY_ACTION_ID = 'workbench.action.chat.clearRequestHistory';

/** The most characters of a request a picker row shows. */
const MAX_LABEL_LENGTH = 200;

interface IChatRequestHistoryPickItem extends IQuickPickItem {
	readonly entry: IChatRequestHistoryEntry;
}

const copyLinkButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.link),
	tooltip: localize('requestHistory.copyLink', "Copy Request Link"),
};

const removeButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.close),
	tooltip: localize('requestHistory.remove', "Remove from Request History"),
};

const clearButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.clearAll),
	tooltip: localize('requestHistory.clear', "Clear Request History..."),
};

/** The request's text on one line, shortened to fit a picker row. */
export function toRequestHistoryLabel(prompt: string): string {
	const text = prompt.replace(/\s+/g, ' ').trim();
	return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH)}…` : text;
}

function toPickItem(entry: IChatRequestHistoryEntry, windowRemoteAuthority: string | undefined): IChatRequestHistoryPickItem {
	const label = toRequestHistoryLabel(entry.prompt);
	const sent = fromNow(entry.timestamp, true);
	const description = [entry.title, entry.host].filter(part => !!part).join(' · ');
	const detail = canOpenChatRequestHistoryEntryIn(entry, windowRemoteAuthority)
		? sent
		: localize('requestHistory.item.otherWindow', "{0} · Opens in another window", sent);
	return {
		entry,
		label,
		description,
		detail,
		// The history's search decides which entries match, so the picker shows them all.
		alwaysShow: true,
		ariaLabel: description
			? localize('requestHistory.item.ariaLabel', "{0}, {1}, sent {2}", label, description, detail)
			: localize('requestHistory.item.ariaLabelNoChat', "{0}, sent {1}", label, detail),
		buttons: [copyLinkButton, removeButton],
	};
}

async function confirmClear(dialogService: IDialogService): Promise<boolean> {
	const { confirmed } = await dialogService.confirm({
		type: 'warning',
		message: localize('requestHistory.clear.message', "Clear the request history of this machine?"),
		detail: localize('requestHistory.clear.detail', "This removes every request from the history in all windows. Your chats are not affected."),
		primaryButton: localize({ key: 'requestHistory.clear.button', comment: ['&& denotes a mnemonic'] }, "&&Clear History"),
	});
	return confirmed;
}

class SearchChatRequestHistoryAction extends Action2 {
	constructor() {
		super({
			id: SEARCH_CHAT_REQUEST_HISTORY_ACTION_ID,
			title: localize2('requestHistory.search', "Search Request History..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: chatRequestHistoryWhen,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const history = accessor.get(IChatRequestHistoryService);
		const openerService = accessor.get(IOpenerService);
		const clipboardService = accessor.get(IClipboardService);
		const dialogService = accessor.get(IDialogService);
		const notificationService = accessor.get(INotificationService);
		const windowRemoteAuthority = accessor.get(IWorkbenchEnvironmentService).remoteAuthority;

		const store = new DisposableStore();
		const picker = store.add(quickInputService.createQuickPick<IChatRequestHistoryPickItem>());
		picker.title = localize('requestHistory.title', "Request History");
		picker.placeholder = localize('requestHistory.placeholder', "Search the requests you sent from this machine");
		picker.matchOnLabel = false;
		picker.sortByLabel = false;
		picker.buttons = [clearButton];

		const update = () => {
			picker.items = history.search(picker.value).map(entry => toPickItem(entry, windowRemoteAuthority));
		};
		store.add(autorun(reader => {
			history.entries.read(reader);
			update();
		}));
		store.add(picker.onDidChangeValue(() => update()));
		store.add(picker.onDidTriggerItemButton(async ({ item, button }) => {
			if (button === copyLinkButton) {
				await clipboardService.writeText(item.entry.link);
				status(localize('requestHistory.copyLink.status', "Request link copied to clipboard"));
			} else if (button === removeButton) {
				history.remove(entry => entry.id === item.entry.id);
				status(localize('requestHistory.removed.status', "Removed from request history"));
			}
		}));
		store.add(picker.onDidTriggerButton(async button => {
			if (button === clearButton && await confirmClear(dialogService)) {
				history.clear();
			}
		}));
		store.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			const openToSide = picker.keyMods.alt;
			picker.hide();
			if (!item) {
				return;
			}
			const { entry } = item;
			if (!canOpenChatRequestHistoryEntryIn(entry, windowRemoteAuthority)) {
				notificationService.info(entry.remoteAuthority
					? localize('requestHistory.open.remoteWindow', "This request ran on {0}. Open it from a window connected to {0}.", entry.host ?? entry.remoteAuthority)
					: localize('requestHistory.open.localWindow', "This request ran on this computer. Open it from a local window."));
				return;
			}
			openerService.open(URI.parse(entry.link), { fromUserGesture: true, openToSide }).then(opened => {
				if (!opened) {
					notificationService.info(localize('requestHistory.open.unavailable', "Could not open this request. Its agent host may be disconnected, or its chat may have been removed."));
				}
			}, error => notificationService.error(localize('requestHistory.open.failed', "Could not open this request: {0}", toErrorMessage(error))));
		}));
		store.add(picker.onDidHide(() => store.dispose()));
		picker.show();
	}
}

class ClearChatRequestHistoryAction extends Action2 {
	constructor() {
		super({
			id: CLEAR_CHAT_REQUEST_HISTORY_ACTION_ID,
			title: localize2('requestHistory.clearAction', "Clear Request History..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: chatRequestHistoryWhen,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const history = accessor.get(IChatRequestHistoryService);
		if (await confirmClear(accessor.get(IDialogService))) {
			history.clear();
		}
	}
}

export function registerChatRequestHistoryActions(): void {
	registerAction2(SearchChatRequestHistoryAction);
	registerAction2(ClearChatRequestHistoryAction);
}
