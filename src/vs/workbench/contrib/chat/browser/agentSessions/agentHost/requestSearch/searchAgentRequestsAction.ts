/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { Delayer } from '../../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { fromNow } from '../../../../../../../base/common/date.js';
import { isCancellationError, onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { escapeIcons } from '../../../../../../../base/common/iconLabels.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../../nls.js';
import { parseAgentHostRequestSearchTerms } from '../../../../../../../platform/agentHost/common/agentHostRequestSearch.js';
import { Action2 } from '../../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../../../platform/quickinput/common/quickInput.js';
import { CHAT_CATEGORY } from '../../../actions/chatActions.js';
import { agentRequestSearchWhen } from './agentRequestSearch.js';
import { AgentRequestSearchHostStatus, IAgentRequestSearchMatch, IAgentRequestSearchResult, IAgentRequestSearchService } from './agentRequestSearchService.js';

export const SearchAgentRequestsActionId = 'workbench.action.chat.searchAgentRequests';

/** Typing pauses this long before the hosts are searched. */
const SEARCH_DELAY = 250;

interface IAgentRequestPickItem extends IQuickPickItem {
	readonly link?: string;
}

export class SearchAgentRequestsAction extends Action2 {
	constructor() {
		super({
			id: SearchAgentRequestsActionId,
			title: localize2('searchAgentRequests.title', "Search Agent Requests..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: agentRequestSearchWhen,
		});
	}

	run(accessor: ServicesAccessor, query?: unknown): void {
		const quickInputService = accessor.get(IQuickInputService);
		const searchService = accessor.get(IAgentRequestSearchService);
		const openerService = accessor.get(IOpenerService);

		const store = new DisposableStore();
		const picker = store.add(quickInputService.createQuickPick<IAgentRequestPickItem>({ useSeparators: true }));
		picker.placeholder = localize('searchAgentRequests.placeholder', "Search the requests you sent to agents on connected hosts");
		// The hosts filter and order the results.
		picker.matchOnLabel = false;
		picker.sortByLabel = false;
		picker.filterValue = () => '';
		const delayer = store.add(new Delayer<void>(SEARCH_DELAY));
		const pending = store.add(new MutableDisposable());
		const search = (value: string) => {
			const cancellation = new CancellationTokenSource();
			pending.value = toDisposable(() => cancellation.dispose(true));
			if (!parseAgentHostRequestSearchTerms(value)) {
				delayer.cancel();
				picker.busy = false;
				picker.items = [];
				return;
			}
			picker.busy = true;
			delayer.trigger(async () => {
				try {
					const result = await searchService.search(value, { remoteHosts: true }, cancellation.token);
					if (!cancellation.token.isCancellationRequested) {
						picker.items = toPickItems(result);
						picker.busy = false;
						status(localize('searchAgentRequests.status', "{0} matching requests", result.matches.length));
					}
				} catch (error) {
					if (!isCancellationError(error) && !cancellation.token.isCancellationRequested) {
						picker.busy = false;
						picker.items = [{ label: localize('searchAgentRequests.failed', "Search failed"), detail: escapeIcons(String(error instanceof Error ? error.message : error)), alwaysShow: true }];
					}
				}
			}).catch(error => {
				// A newer query supersedes a delayed search.
				if (!isCancellationError(error)) {
					onUnexpectedError(error);
				}
			});
		};
		store.add(picker.onDidChangeValue(search));
		store.add(picker.onDidAccept(() => {
			const link = picker.selectedItems[0]?.link;
			if (link) {
				picker.hide();
				void openerService.open(URI.parse(link), { fromUserGesture: true });
			}
		}));
		store.add(picker.onDidHide(() => store.dispose()));
		picker.show();
		if (typeof query === 'string' && query) {
			picker.value = query;
		}
	}
}

/** Builds the picker's items. Host-supplied text is shown as plain text: icon syntax in it is escaped. */
export function toPickItems(result: IAgentRequestSearchResult): (IAgentRequestPickItem | IQuickPickSeparator)[] {
	const items: (IAgentRequestPickItem | IQuickPickSeparator)[] = result.matches.map(toMatchItem);
	if (!items.length) {
		items.push({ label: localize('searchAgentRequests.noMatches', "No matching requests"), alwaysShow: true });
	}
	const skipped = result.hosts.filter(host => host.status !== 'searched');
	if (skipped.length) {
		items.push({ type: 'separator', label: localize('searchAgentRequests.notSearched', "Not Searched") });
		for (const host of skipped) {
			items.push({
				label: escapeIcons(host.label),
				description: describeHostStatus(host.status),
				...(host.reason ? { detail: escapeIcons(host.reason) } : {}),
				alwaysShow: true,
			});
		}
	}
	return items;
}

function toMatchItem(match: IAgentRequestSearchMatch): IAgentRequestPickItem {
	const title = match.chatTitle && match.sessionTitle
		? localize('searchAgentRequests.chatInSession', "{0} in {1}", match.chatTitle, match.sessionTitle)
		: match.chatTitle ?? match.sessionTitle ?? localize('searchAgentRequests.untitled', "Untitled chat");
	const time = Date.parse(match.time);
	const when = Number.isNaN(time) ? '' : fromNow(time, true);
	return {
		label: escapeIcons(match.snippet),
		description: escapeIcons(title),
		detail: escapeIcons(when ? localize('searchAgentRequests.detail', "{0} · {1}", match.host.label, when) : match.host.label),
		ariaLabel: localize('searchAgentRequests.ariaLabel', "{0}, {1}, on {2}, {3}", match.snippet, title, match.host.label, when),
		link: match.link,
		alwaysShow: true,
	};
}

function describeHostStatus(status: AgentRequestSearchHostStatus): string {
	switch (status) {
		case 'notSearched': return localize('searchAgentRequests.hostNotConnected', "Not connected");
		case 'unsupported': return localize('searchAgentRequests.hostUnsupported', "Update required");
		case 'disabled': return localize('searchAgentRequests.hostDisabled', "Search turned off");
		case 'failed': return localize('searchAgentRequests.hostFailed', "Failed");
		case 'searched': return '';
	}
}
