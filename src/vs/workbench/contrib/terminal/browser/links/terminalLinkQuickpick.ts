/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IDetectedLinks } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { TerminalLinkQuickPickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILink } from 'xterm';

export class TerminalLinkQuickpick {
	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService
	) { }

	async show(links: IDetectedLinks): Promise<void> {
		const wordPicks = links.wordLinks ? await this._generatePicks(links.wordLinks) : undefined;
		const filePicks = links.fileLinks ? await this._generatePicks(links.fileLinks) : undefined;
		const webPicks = links.webLinks ? await this._generatePicks(links.webLinks) : undefined;
		const options = {
			placeHolder: localize('terminal.integrated.openWebLink', "Select the link to open"),
			canPickMany: false
		};
		const picks: LinkQuickPickItem[] = [];
		if (webPicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.webLinks', "Web") });
			picks.push(...webPicks);
		}
		if (filePicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.fileLinks', "File") });
			picks.push(...filePicks);
		}
		if (wordPicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.wordLinks', "Word") });
			picks.push(...wordPicks);
		}

		const pick = await this._quickInputService.pick(picks, options);
		if (!pick) {
			return;
		}
		const event = new TerminalLinkQuickPickEvent(EventType.CLICK);
		pick.link.activate(event, pick.label);
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
	link: ILink
}

type LinkQuickPickItem = ITerminalLinkQuickPickItem | IQuickPickSeparator;
