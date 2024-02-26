/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { QuickPickItem, IQuickInputService, IQuickPickItem, QuickInputHideReason } from 'vs/platform/quickinput/common/quickInput';
import { IDetectedLinks } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager';
import { TerminalLinkQuickPickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { ILink } from '@xterm/xterm';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import type { TerminalLink } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLink';
import { Sequencer } from 'vs/base/common/async';
import { EditorViewState } from 'vs/workbench/browser/quickaccess';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { getLinkSuffix } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkParsing';
import { TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import type { IFilesConfiguration } from 'vs/workbench/contrib/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';

export class TerminalLinkQuickpick extends DisposableStore {

	private readonly _editorSequencer = new Sequencer();
	private readonly _editorViewState: EditorViewState;

	private readonly _onDidRequestMoreLinks = this.add(new Emitter<void>());
	readonly onDidRequestMoreLinks = this._onDidRequestMoreLinks.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@ILabelService private readonly _labelService: ILabelService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService
	) {
		super();
		this._editorViewState = new EditorViewState(_editorService);
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
		if (pick.activeItems.length > 0) {
			this._previewItem(pick.activeItems[0]);
		}

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

		disposables.add(pick.onDidChangeActive(async () => {
			const [item] = pick.activeItems;
			this._previewItem(item);
		}));

		return new Promise(r => {
			disposables.add(pick.onDidHide(({ reason }) => {
				// Restore view state upon cancellation if we changed it
				// but only when the picker was closed via explicit user
				// gesture and not e.g. when focus was lost because that
				// could mean the user clicked into the editor directly.
				if (reason === QuickInputHideReason.Gesture) {
					this._editorViewState.restore(true);
				}
				disposables.dispose();
				if (pick.selectedItems.length === 0) {
					this._accessibleViewService.showLastProvider(AccessibleViewProviderId.Terminal);
				}
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
	private async _generatePicks(links: (ILink | TerminalLink)[], ignoreLinks?: ILink[]): Promise<ITerminalLinkQuickPickItem[] | undefined> {
		if (!links) {
			return;
		}
		const linkTextKeys: Set<string> = new Set();
		const linkUriKeys: Set<string> = new Set();
		const picks: ITerminalLinkQuickPickItem[] = [];
		for (const link of links) {
			let label = link.text;
			if (!linkTextKeys.has(label) && (!ignoreLinks || !ignoreLinks.some(e => e.text === label))) {
				linkTextKeys.add(label);

				// Add a consistently formatted resolved URI label to the description if applicable
				let description: string | undefined;
				if ('uri' in link && link.uri) {
					// For local files and folders, mimic the presentation of go to file
					if (
						link.type === TerminalBuiltinLinkType.LocalFile ||
						link.type === TerminalBuiltinLinkType.LocalFolderInWorkspace ||
						link.type === TerminalBuiltinLinkType.LocalFolderOutsideWorkspace
					) {
						label = basenameOrAuthority(link.uri);
						description = this._labelService.getUriLabel(dirname(link.uri), { relative: true });
					}

					// Add line and column numbers to the label if applicable
					if (link.type === TerminalBuiltinLinkType.LocalFile) {
						if (link.parsedLink?.suffix?.row !== undefined) {
							label += `:${link.parsedLink.suffix.row}`;
							if (link.parsedLink?.suffix?.rowEnd !== undefined) {
								label += `-${link.parsedLink.suffix.rowEnd}`;
							}
							if (link.parsedLink?.suffix?.col !== undefined) {
								label += `:${link.parsedLink.suffix.col}`;
								if (link.parsedLink?.suffix?.colEnd !== undefined) {
									label += `-${link.parsedLink.suffix.colEnd}`;
								}
							}
						}
					}

					// Skip the link if it's a duplicate URI + line/col
					if (description) {
						if (linkUriKeys.has(label + '|' + description)) {
							continue;
						}
						linkUriKeys.add(label + '|' + description);
					}
				}

				picks.push({ label, link, description });
			}
		}
		return picks.length > 0 ? picks : undefined;
	}

	private _previewItem(item: ITerminalLinkQuickPickItem | IQuickPickItem) {
		if (!item || !('link' in item) || !item.link || !('uri' in item.link) || !item.link.uri) {
			return;
		}

		const link = item.link;
		if (link.type !== TerminalBuiltinLinkType.LocalFile) {
			return;
		}

		// Don't open if preview editors are disabled as it may open many editor
		const config = this._configurationService.getValue<IFilesConfiguration>();
		if (!config.workbench?.editor?.enablePreview) {
			return;
		}

		const linkSuffix = link.parsedLink ? link.parsedLink.suffix : getLinkSuffix(link.text);
		const selection = linkSuffix?.row === undefined ? undefined : {
			startLineNumber: linkSuffix.row ?? 1,
			startColumn: linkSuffix.col ?? 1,
			endLineNumber: linkSuffix.rowEnd,
			endColumn: linkSuffix.colEnd
		};

		this._editorViewState.set();
		this._editorSequencer.queue(async () => {
			// disable and re-enable history service so that we can ignore this history entry
			const disposable = this._historyService.suspendTracking();
			try {
				await this._editorService.openEditor({
					resource: link.uri,
					options: { preserveFocus: true, revealIfOpened: true, ignoreError: true, selection, }
				});
			} finally {
				disposable.dispose();
			}
		});
	}
}

export interface ITerminalLinkQuickPickItem extends IQuickPickItem {
	link: ILink | TerminalLink;
}

type LinkQuickPickItem = ITerminalLinkQuickPickItem | QuickPickItem;
