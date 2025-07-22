/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatChangesSummaryPart, IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from './chatReferencesContentPart.js';
import { IChatChangesSummary, IChatService } from '../../common/chatService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

export class ChatChangesSummaryContentPart extends Disposable implements IChatContentPart {

	public readonly domNode: HTMLElement;

	private listPool: CollapsibleListPool | undefined;
	private changes: ReadonlyArray<IChatChangesSummary> = [];

	private _isExpanded: boolean = false;

	constructor(
		content: IChatChangesSummaryPart,
		private readonly context: IChatContentPartRenderContext,
		@ICommandService commandService: ICommandService,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		console.log('this.changes', content.changes);

		const viewAllFileChanges = $('.chat-view-changes-icon');
		viewAllFileChanges.style.float = 'right';
		viewAllFileChanges.style.cursor = 'pointer';
		viewAllFileChanges.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));

		const buttonElement = $('.chat-used-context-label', undefined);
		buttonElement.style.float = 'left';
		const collapseButton = this._register(new ButtonWithIcon(buttonElement, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		}));
		collapseButton.element.appendChild(viewAllFileChanges);

		this._register(dom.addDisposableListener(viewAllFileChanges, 'click', (e) => {
			const resources: { originalUri: URI; modifiedUri: URI }[] = [];
			this.changes.forEach(e => {
				const sessionId = e.sessionId;
				if (!sessionId) {
					return;
				}
				const session = this.chatService.getSession(sessionId);
				if (!session || !session.editingSessionObs) {
					return;
				}
				const editSession = session.editingSessionObs.promiseResult.get()?.data;
				if (!editSession) {
					return;
				}
				const uri = e.reference;
				const modifiedEntry = editSession.getEntry(uri);
				if (!modifiedEntry) {
					return;
				}
				const requestId = e.requestId;
				if (!requestId) {
					return;
				}
				const undoStops = this.context.content.filter(e => e.kind === 'undoStop');
				const undoStopsMapped = undoStops.map(e => e.id);
				for (let i = undoStopsMapped.length - 1; i >= 0; i--) {
					const specificUndoStop = undoStopsMapped[i];
					const diffBetweenStops: IEditSessionEntryDiff | undefined = editSession.getEntryDiffBetweenStops(modifiedEntry.modifiedURI, requestId, specificUndoStop)?.get();
					if (!diffBetweenStops) {
						continue;
					}
					resources.push({
						originalUri: diffBetweenStops.originalURI,
						modifiedUri: diffBetweenStops.modifiedURI,
					});
					break;
				}
			});
			commandService.executeCommand('chatEditing.viewFileChangesSummary', resources);
			dom.EventHelper.stop(e, true);
		}));
		const fileChangesSummary = $('.container-file-changes-summary', undefined, buttonElement);
		fileChangesSummary.style.display = 'flex';
		fileChangesSummary.style.justifyContent = 'space-between';

		this.changes = content.changes;
		this.listPool = this._register(instantiationService.createInstance(CollapsibleListPool, () => Disposable.None, undefined, undefined));
		const list = this.listPool.get().object;
		list.splice(0, list.length, this.changes);

		this.domNode = $('.chat-file-changes-summary', undefined, fileChangesSummary);
		this.domNode.tabIndex = 0;
		if (this.changes.length === 1) {
			collapseButton.label = `Changed 1 file`;
		} else {
			collapseButton.label = `Changed ${this.changes.length} files`;
		}

		const maxItemsShown = 6;
		const itemsShown = Math.min(this.changes.length, maxItemsShown);
		const height = itemsShown * 22;
		const listElement = list.getHTMLElement();
		listElement.style.height = `${height}px`;
		list.layout(height);
		list.splice(0, list.length, this.getChatCollapsibleItems(this.changes));
		const innerDomNode = listElement.parentElement!;
		this.domNode.appendChild(innerDomNode);

		this.registerCollapseButtonListeners(collapseButton);
		this.registerListListeners(list);
		this.registerContextMenuListener(innerDomNode);
	}

	private registerContextMenuListener(domNode: HTMLElement): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.CONTEXT_MENU, domEvent => {
			dom.EventHelper.stop(domEvent, true);
		}));
	}

	private getChatCollapsibleItems(changes: readonly IChatChangesSummary[]): IChatCollapsibleListItem[] {
		const items: IChatCollapsibleListItem[] = [];
		for (const change of changes) {
			const insertionsAndDeletions = this.getInsertionsAndDeletions(change);
			const additionalData: { description: string; className: string }[] = [];
			if (insertionsAndDeletions) {
				additionalData.push({
					description: ` +${insertionsAndDeletions.insertions} `,
					className: 'insertions',
				});
				additionalData.push({
					description: ` -${insertionsAndDeletions.deletions} `,
					className: 'deletions',
				});
			}
			const modifiedChange: IChatCollapsibleListItem = {
				...change,
				additionalData
			};
			items.push(modifiedChange);
		}
		console.log('items : ', items);
		return items;
	}

	private getInsertionsAndDeletions(change: IChatChangesSummary): { insertions: number; deletions: number } | undefined {
		console.log('getInsertionsAndDeletions change : ', change);
		const sessionId = change.sessionId;
		if (!sessionId) {
			console.log('return 1');
			return;
		}
		const session = this.chatService.getSession(sessionId);
		if (!session || !session.editingSessionObs) {
			console.log('return 2');
			return;
		}
		console.log('session : ', session);
		const editSession = session.editingSessionObs.promiseResult.get()?.data;
		console.log('editSession : ', editSession);
		if (!editSession) {
			console.log('return 3');
			return;
		}
		const uri = change.reference;
		const modifiedEntry = editSession.getEntry(uri);
		if (!modifiedEntry) {
			console.log('return 4');
			return;
		}
		const requestId = change.requestId;
		if (!requestId) {
			console.log('return 5');
			return;
		}
		const undoStops = this.context.content.filter(e => e.kind === 'undoStop');
		const undoStopsMapped = undoStops.map(e => e.id);
		console.log('undoStopsMapped : ', undoStopsMapped);
		for (let i = undoStopsMapped.length - 1; i >= 0; i--) {
			const specificUndoStop = undoStopsMapped[i];
			const diffBetweenStops: IEditSessionEntryDiff | undefined = editSession.getEntryDiffBetweenStops(modifiedEntry.modifiedURI, requestId, specificUndoStop)?.get();
			if (!diffBetweenStops) {
				continue;
			}
			return {
				insertions: diffBetweenStops.added,
				deletions: diffBetweenStops.removed
			};
		}
		return;
	}

	private registerCollapseButtonListeners(collapseButton: ButtonWithIcon): void {
		const setExpanded = () => {
			collapseButton.icon = this._isExpanded ? Codicon.chevronDown : Codicon.chevronRight;
			this.domNode.classList.toggle('chat-used-context-collapsed', !this._isExpanded);
		};
		const definingIcon = () => {
			this._isExpanded = !this._isExpanded;
			console.log('!this._isExpanded : ', !this._isExpanded);
			setExpanded();
		};
		this._register(collapseButton.onDidClick(() => {
			definingIcon();
		}));
		setExpanded();
	}

	private registerListListeners(list: WorkbenchList<IChatCollapsibleListItem>): void {
		this._register(list.onDidOpen((e) => {
			if (e.element?.kind !== 'changesSummary') {
				console.log('return 1');
				return;
			}
			const sessionId = e.element.sessionId;
			if (!sessionId) {
				console.log('return 2');
				return;
			}
			const session = this.chatService.getSession(sessionId);
			if (!session || !session.editingSessionObs) {
				console.log('return 3');
				return;
			}
			const editSession = session.editingSessionObs.promiseResult.get()?.data;
			if (!editSession) {
				console.log('return 4');
				return;
			}
			const uri = e.element.reference;
			const modifiedEntry = editSession.getEntry(uri);
			if (!modifiedEntry) {
				console.log('return 5');
				return;
			}
			const requestId = e.element.requestId;
			if (!requestId) {
				console.log('return 6');
				return;
			}
			console.log('this.context.content : ', this.context.content);
			console.log('this.context.contentIndex : ', this.context.contentIndex);
			console.log('modifiedEntry.modifiedURI : ', modifiedEntry.modifiedURI);
			console.log('requestId : ', requestId);

			const undoStops = this.context.content.filter(e => e.kind === 'undoStop');
			const undoStopsMapped = undoStops.map(e => e.id);
			for (let i = undoStopsMapped.length - 1; i >= 0; i--) {
				const specificUndoStop = undoStopsMapped[i];
				const diffBetweenStops: IEditSessionEntryDiff | undefined = editSession.getEntryDiffBetweenStops(modifiedEntry.modifiedURI, requestId, specificUndoStop)?.get();
				if (!diffBetweenStops) {
					continue;
				}
				const input = {
					original: { resource: diffBetweenStops.originalURI },
					modified: { resource: diffBetweenStops.modifiedURI },
					options: { transient: true },
				};
				return this.editorService.openEditor(input);
			}
			return this.editorService.openEditor({ resource: uri });
		}));
		this._register(list.onContextMenu(e => {
			console.log('Context menu event:', e);
		}));
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'changesSummary' && other.changes.length === this.changes.length;
	}
}
