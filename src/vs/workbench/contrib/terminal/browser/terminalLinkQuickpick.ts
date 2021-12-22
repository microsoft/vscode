/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IKeyMods, IPickOptions, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { TerminalLinkProviderType } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { ILink } from 'xterm';

export class TerminalLinkQuickpick {
	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IClipboardService private readonly _clipboardService: IClipboardService
	) { }

	async show(type: TerminalLinkProviderType, links: ILink[] | undefined): Promise<void> {
		let keyMods: IKeyMods | undefined;
		const picks = await this._generatePicks(links);
		const options: IPickOptions<ITerminalLinkQuickPickItem> = {
			placeHolder: type === TerminalLinkProviderType.Validated ? localize('terminal.integrated.openValidatedLink', "Select the link to open") : localize('terminal.integrated.copyWordLink', "Select the link to copy"),
			onKeyMods: mods => keyMods = mods
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
			//TODO: get to work, also other link types?
			// add test for terminallink quickpick
			const event = new TermMouseEvent(EventType.CLICK);
			// const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
			// document.createEvent(EventType.CLICK, keyMods);
			// if (editorConf.multiCursorModifier === 'ctrlCmd') {
			// 	event.altKey = true;
			// }
			// if (isMacintosh) {
			// 	event.metaKey = true;
			// } else {
			// 	event.ctrlKey = true;
			// }
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

export class TermMouseEvent extends MouseEvent {
	override altKey: boolean = true;
	override ctrlKey: boolean = true;
	override metaKey: boolean = true;
}

