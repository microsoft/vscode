/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IPickOptions, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IDetectedLinks } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { TerminalLinkQuickPickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILink } from 'xterm';

export class TerminalLinkQuickpick {
	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IClipboardService private readonly _clipboardService: IClipboardService
	) { }

	async show(links: IDetectedLinks): Promise<void> {
		const wordPicks = links.wordLinks ? await this._generatePicks(links.wordLinks) : undefined;
		const filePicks = links.fileLinks ? await this._generatePicks(links.fileLinks) : undefined;
		const webPicks = links.webLinks ? await this._generatePicks(links.webLinks) : undefined;

		const picks: IQuickPickItem[] = [];
		if (wordPicks) {
			picks.push({ label: localize('terminal.integrated.wordLinks', "Word") });
		}
		if (filePicks) {
			picks.push({ label: localize('terminal.integrated.fileLinks', "File") });
		}
		if (webPicks) {
			picks.push({ label: localize('terminal.integrated.webLinks', "Web") });
		}

		const typeOptions: IPickOptions<IQuickPickItem> = {
			placeHolder: localize('terminal.integrated.selectLinkType', "Select link type"),
		};

		const linkType = await this._quickInputService.pick(picks, typeOptions);
		if (!linkType) {
			return;
		}

		let options: IPickOptions<ITerminalLinkQuickPickItem> = {};
		let linkPicks: ITerminalLinkQuickPickItem[] = [];
		if (linkType.label === 'Word' && wordPicks) {
			options = {
				placeHolder: localize('terminal.integrated.copyWordLink', "Select the link to copy"),
				canPickMany: false
			};
			linkPicks = wordPicks;
		} else if (linkType.label === 'Web' && webPicks) {
			options = {
				placeHolder: localize('terminal.integrated.openWebLink', "Select the link to open"),
				canPickMany: false
			};
			linkPicks = webPicks;
		} else if (filePicks) {
			options = {
				placeHolder: localize('terminal.integrated.openFileLink', "Select the link to open"),
				canPickMany: false
			};
			linkPicks = filePicks;
		}
		const pick = await this._quickInputService.pick(linkPicks, options);
		if (!pick) {
			return;
		}
		if (linkType.label === 'Word') {
			this._clipboardService.writeText(pick.label);
		} else {
			const event = new TerminalLinkQuickPickEvent(EventType.CLICK);
			pick.link.activate(event, pick.label);
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
	link: ILink
}



