/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IKeyMods, IPickOptions, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { TerminalLinkProviderType } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { TerminalLinkQuickpickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILink } from 'xterm';

export class TerminalLinkQuickpick {
	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IClipboardService private readonly _clipboardService: IClipboardService
	) { }

	async show(type: TerminalLinkProviderType, links: ILink[] | undefined): Promise<void> {
		const picks = await this._generatePicks(links);
		const options: IPickOptions<ITerminalLinkQuickPickItem> = {
			placeHolder: type === TerminalLinkProviderType.Validated ? localize('terminal.integrated.openValidatedLink', "Select the link to open") : localize('terminal.integrated.copyWordLink', "Select the link to copy"),
		};
		const result = await this._quickInputService.pick(picks, options);
		const label = result?.label;
		if (!label) {
			return;
		}
		if (type === TerminalLinkProviderType.Word) {
			// copy
			this._clipboardService.writeText(label);
		} else {
			// open link
			//TODO: also other link types?
			// add test for terminallink quickpick
			const event = new TerminalLinkQuickpickEvent(EventType.CLICK);
			result.link.activate(event, label);
		}
		return;
	}

	private async _generatePicks(links: ILink[] | undefined): Promise<ITerminalLinkQuickPickItem[]> {
		const picks: ITerminalLinkQuickPickItem[] = [];
		if (links) {
			for (const l of links) {
				picks.push({
					label: l.text,
					link: l,
					keyMods: undefined
				});
			}
		}
		return picks;
	}
}

export interface ITerminalLinkQuickPickItem extends IQuickPickItem {
	link: ILink,
	keyMods?: IKeyMods
}



