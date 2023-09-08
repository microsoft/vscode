/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
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

	async show(links: { viewport: IDetectedLinks; all: Promise<IDetectedLinks> }): Promise<void> {
		// Get raw link picks
		const wordPicks = links.viewport.wordLinks ? await this._generatePicks(links.viewport.wordLinks) : undefined;
		const filePicks = links.viewport.fileLinks ? await this._generatePicks(links.viewport.fileLinks) : undefined;
		const folderPicks = links.viewport.folderLinks ? await this._generatePicks(links.viewport.folderLinks) : undefined;
		const webPicks = links.viewport.webLinks ? await this._generatePicks(links.viewport.webLinks) : undefined;

		const picks: LinkQuickPickItem[] = [];
		if (webPicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.urlLinks', "Url") });
			picks.push(...webPicks);
		}
		if (filePicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.localFileLinks', "File") });
			picks.push(...filePicks);
		}
		if (folderPicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.localFolderLinks', "Folder") });
			picks.push(...folderPicks);
		}
		if (wordPicks) {
			picks.push({ type: 'separator', label: localize('terminal.integrated.searchLinks', "Workspace Search") });
			picks.push(...wordPicks);
		}

		// Create and show quick pick
		const pick = this._quickInputService.createQuickPick<IQuickPickItem | ITerminalLinkQuickPickItem>();
		pick.items = picks;
		pick.placeholder = localize('terminal.integrated.openDetectedLink', "Select the link to open, type to filter all links");
		pick.sortByLabel = false;
		pick.show();

		// Show all results only when filtering begins, this is done so the quick pick will show up
		// ASAP with only the viewport entries.
		let accepted = false;
		const disposables = new DisposableStore();
		disposables.add(Event.once(pick.onDidChangeValue)(async () => {
			const allLinks = await links.all;
			if (accepted) {
				return;
			}
			const wordIgnoreLinks = [...(allLinks.fileLinks ?? []), ...(allLinks.folderLinks ?? []), ...(allLinks.webLinks ?? [])];

			const wordPicks = allLinks.wordLinks ? await this._generatePicks(allLinks.wordLinks, wordIgnoreLinks) : undefined;
			const filePicks = allLinks.fileLinks ? await this._generatePicks(allLinks.fileLinks) : undefined;
			const folderPicks = allLinks.folderLinks ? await this._generatePicks(allLinks.folderLinks) : undefined;
			const webPicks = allLinks.webLinks ? await this._generatePicks(allLinks.webLinks) : undefined;
			const picks: LinkQuickPickItem[] = [];
			if (webPicks) {
				picks.push({ type: 'separator', label: localize('terminal.integrated.urlLinks', "Url") });
				picks.push(...webPicks);
			}
			if (filePicks) {
				picks.push({ type: 'separator', label: localize('terminal.integrated.localFileLinks', "File") });
				picks.push(...filePicks);
			}
			if (folderPicks) {
				picks.push({ type: 'separator', label: localize('terminal.integrated.localFolderLinks', "Folder") });
				picks.push(...folderPicks);
			}
			if (wordPicks) {
				picks.push({ type: 'separator', label: localize('terminal.integrated.searchLinks', "Workspace Search") });
				picks.push(...wordPicks);
			}
			pick.items = picks;
		}));

		return new Promise(r => {
			disposables.add(pick.onDidHide(() => {
				disposables.dispose();
				r();
			}));
			disposables.add(Event.once(pick.onDidAccept)(() => {
				accepted = true;
				const event = new TerminalLinkQuickPickEvent(EventType.CLICK);
				const activeItem = pick.activeItems?.[0];
				if (activeItem && 'link' in activeItem) {
					activeItem.link.activate(event, activeItem.label);
				}
				disposables.dispose();
				r();
			}));
		});
	}

	/**
	 * @param ignoreLinks Links with labels to not include in the picks.
	 */
	private async _generatePicks(links: ILink[], ignoreLinks?: ILink[]): Promise<ITerminalLinkQuickPickItem[] | undefined> {
		if (!links) {
			return;
		}
		const linkKeys: Set<string> = new Set();
		const picks: ITerminalLinkQuickPickItem[] = [];
		for (const link of links) {
			const label = link.text;
			if (!linkKeys.has(label) && (!ignoreLinks || !ignoreLinks.some(e => e.text === label))) {
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
