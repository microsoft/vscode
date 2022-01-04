/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IPickOptions, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { TerminalLinkProviderType } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { TerminalLinkQuickpickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILink } from 'xterm';

export class TerminalLinkQuickpick {
	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IClipboardService private readonly _clipboardService: IClipboardService
	) { }

	async show(type: TerminalLinkProviderType, links: ILink[]): Promise<void> {
		const picks = await this._generatePicks(links);
		const options: IPickOptions<ITerminalLinkQuickPickItem> = {
			placeHolder: type === TerminalLinkProviderType.Validated ? localize('terminal.integrated.openValidatedOrProtocolLink', "Select the link to open") : localize('terminal.integrated.copyWordLink', "Select the link to copy"),
		};
		if (!picks) {
			return;
		}
		const pick = await this._quickInputService.pick(picks, options);
		if (!pick) {
			return;
		}
		if (type === TerminalLinkProviderType.Word) {
			this._clipboardService.writeText(pick.label);
		} else {
			const event = new TerminalLinkQuickpickEvent(EventType.CLICK);
			pick.link.activate(event, pick.label);
		}
		return;
	}

	private async _generatePicks(links: ILink[] | undefined): Promise<ITerminalLinkQuickPickItem[] | undefined> {
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



