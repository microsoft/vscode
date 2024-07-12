/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { QuickPickItem, IQuickInputService, IQuickPickItem, QuickInputHideReason } from 'vs/platform/quickinput/common/quickInput';
import { IDetectedLinks } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager';
import { TerminalLinkQuickPickEvent, type IDetachedTerminalInstance, type ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { ILink } from '@xterm/xterm';
import { DisposableStore } from 'vs/base/common/lifecycle';
import type { TerminalLink } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLink';
import { Sequencer, timeout } from 'vs/base/common/async';
import { PickerEditorState } from 'vs/workbench/browser/quickaccess';
import { getLinkSuffix } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkParsing';
import { TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { ILabelService } from 'vs/platform/label/common/label';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AccessibleViewProviderId, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';

export class TerminalLinkQuickpick extends DisposableStore {

	private readonly _editorSequencer = new Sequencer();
	private readonly _editorViewState: PickerEditorState;

	private _instance: ITerminalInstance | IDetachedTerminalInstance | undefined;

	private readonly _onDidRequestMoreLinks = this.add(new Emitter<void>());
	readonly onDidRequestMoreLinks = this._onDidRequestMoreLinks.event;

	constructor(
		@ILabelService private readonly _labelService: ILabelService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._editorViewState = this.add(instantiationService.createInstance(PickerEditorState));
	}

	async show(instance: ITerminalInstance | IDetachedTerminalInstance, links: { viewport: IDetectedLinks; all: Promise<IDetectedLinks> }): Promise<void> {
		this._instance = instance;

		// Allow all links a small amount of time to elapse to finish, if this is not done in this
		// time they will be loaded upon the first filter.
		const result = await Promise.race([links.all, timeout(500)]);
		const usingAllLinks = typeof result === 'object';
		const resolvedLinks = usingAllLinks ? result : links.viewport;

		// Get raw link picks
		const wordPicks = resolvedLinks.wordLinks ? await this._generatePicks(resolvedLinks.wordLinks) : undefined;
		const filePicks = resolvedLinks.fileLinks ? await this._generatePicks(resolvedLinks.fileLinks) : undefined;
		const folderPicks = resolvedLinks.folderLinks ? await this._generatePicks(resolvedLinks.folderLinks) : undefined;
		const webPicks = resolvedLinks.webLinks ? await this._generatePicks(resolvedLinks.webLinks) : undefined;

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
		if (!usingAllLinks) {
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
		}

		disposables.add(pick.onDidChangeActive(async () => {
			const [item] = pick.activeItems;
			this._previewItem(item);
		}));

		return new Promise(r => {
			disposables.add(pick.onDidHide(({ reason }) => {

				// Restore terminal scroll state
				if (this._terminalScrollStateSaved) {
					const markTracker = this._instance?.xterm?.markTracker;
					if (markTracker) {
						markTracker.restoreScrollState();
						markTracker.clear();
						this._terminalScrollStateSaved = false;
					}
				}

				// Restore view state upon cancellation if we changed it
				// but only when the picker was closed via explicit user
				// gesture and not e.g. when focus was lost because that
				// could mean the user clicked into the editor directly.
				if (reason === QuickInputHideReason.Gesture) {
					this._editorViewState.restore();
				}
				disposables.dispose();
				if (pick.selectedItems.length === 0) {
					this._accessibleViewService.showLastProvider(AccessibleViewProviderId.Terminal);
				}
				r();
			}));
			disposables.add(Event.once(pick.onDidAccept)(() => {
				// Restore terminal scroll state
				if (this._terminalScrollStateSaved) {
					const markTracker = this._instance?.xterm?.markTracker;
					if (markTracker) {
						markTracker.restoreScrollState();
						markTracker.clear();
						this._terminalScrollStateSaved = false;
					}
				}

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
					if (linkUriKeys.has(label + '|' + (description ?? ''))) {
						continue;
					}
					linkUriKeys.add(label + '|' + (description ?? ''));
				}

				picks.push({ label, link, description });
			}
		}
		return picks.length > 0 ? picks : undefined;
	}

	private _previewItem(item: ITerminalLinkQuickPickItem | IQuickPickItem) {
		if (!item || !('link' in item) || !item.link) {
			return;
		}

		// Any link can be previewed in the termninal
		const link = item.link;
		this._previewItemInTerminal(link);

		if (!('uri' in link) || !link.uri) {
			return;
		}

		if (link.type !== TerminalBuiltinLinkType.LocalFile) {
			return;
		}

		this._previewItemInEditor(link);
	}

	private _previewItemInEditor(link: TerminalLink) {
		const linkSuffix = link.parsedLink ? link.parsedLink.suffix : getLinkSuffix(link.text);
		const selection = linkSuffix?.row === undefined ? undefined : {
			startLineNumber: linkSuffix.row ?? 1,
			startColumn: linkSuffix.col ?? 1,
			endLineNumber: linkSuffix.rowEnd,
			endColumn: linkSuffix.colEnd
		};

		this._editorViewState.set();
		this._editorSequencer.queue(async () => {
			await this._editorViewState.openTransientEditor({
				resource: link.uri,
				options: { preserveFocus: true, revealIfOpened: true, ignoreError: true, selection, }
			});
		});
	}

	private _terminalScrollStateSaved: boolean = false;
	private _previewItemInTerminal(link: ILink) {
		const xterm = this._instance?.xterm;
		if (!xterm) {
			return;
		}
		if (!this._terminalScrollStateSaved) {
			xterm.markTracker.saveScrollState();
			this._terminalScrollStateSaved = true;
		}
		xterm.markTracker.revealRange(link.range);
	}
}

export interface ITerminalLinkQuickPickItem extends IQuickPickItem {
	link: ILink | TerminalLink;
}

type LinkQuickPickItem = ITerminalLinkQuickPickItem | QuickPickItem;
