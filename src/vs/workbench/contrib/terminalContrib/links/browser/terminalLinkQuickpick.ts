/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { QuickPickItem, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IDetectedLinks } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager';
import { TerminalLinkQuickPickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { ILink } from 'xterm';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class TerminalLinkQuickpick extends DisposableStore {

	private readonly _onDidRequestMoreLinks = this.add(new Emitter<void>());
	readonly onDidRequestMoreLinks = this._onDidRequestMoreLinks.event;

	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService
	) {
		super();
	}

	async show(links: IDetectedLinks): Promise<void> {
		const wordPicks = links.wordLinks ? await this._generatePicks(links.wordLinks) : undefined;
		const filePicks = links.fileLinks ? await this._generatePicks(links.fileLinks) : undefined;
		const webPicks = links.webLinks ? await this._generatePicks(links.webLinks) : undefined;
		const options = {
			placeHolder: localize('terminal.integrated.openDetectedLink', "Select the link to open"),
			canPickMany: false,

		};
		const picks: LinkQuickPickItem[] = [];
		if (webPicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.urlLinks', "Url") });
			picks.push(...webPicks);
		}
		if (filePicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.localFileLinks', "Local File") });
			picks.push(...filePicks);
		}
		if (wordPicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.searchLinks', "Workspace Search") });
			picks.push(...wordPicks);
		}
		picks.push({ type: 'separator' });
		if (!links.noMoreResults) {
			const showMoreItem = { label: localize('terminal.integrated.showMoreLinks', "Show more links") };
			picks.push(showMoreItem);
		}
		const pick = await this._quickInputService.pick(picks, options);
		if (!pick) {
			return;
		}
		const event = new TerminalLinkQuickPickEvent(EventType.CLICK);
		if ('link' in pick) {
			pick.link.activate(event, pick.label);
		} else {
			this._onDidRequestMoreLinks.fire();
		}
		return;
	}

	private async _generatePicks(links: ILink[]): Promise<ITerminalLinkQuickPickItem[] | undefined> {
		if (!links) {
			return;
		}
		const linkKeys: Set<string> = new Set();
		const picks: ITerminalLinkQuickPickItem[] = [];
		for (const link of links) {
			const label = link.text;
			if (!linkKeys.has(label)) {
				linkKeys.add(label);
				picks.push({ label, link });
			}
		}
		return picks.length > 0 ? picks : undefined;
	}
}

export interface ITerminalLinkQuickPickItem extends IQuickPickItem {
	link: ILink;
}

type LinkQuickPickItem = ITerminalLinkQuickPickItem | QuickPickItem;
