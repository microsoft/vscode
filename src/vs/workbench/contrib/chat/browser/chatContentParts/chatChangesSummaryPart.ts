/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatChangesSummaryPart, IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CollapsibleListPool } from './chatReferencesContentPart.js';
import { IChatChangesSummary, IChatService, IChatUndoStop } from '../../common/chatService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { findLast } from '../../../../../base/common/arraysFind.js';

export class ChatChangesSummaryContentPart extends Disposable implements IChatContentPart {

	private _domNode: HTMLElement | undefined;

	private readonly listPool: CollapsibleListPool;
	private readonly changes: ReadonlyArray<IChatChangesSummary>;

	constructor(
		content: IChatChangesSummaryPart,
		private readonly context: IChatContentPartRenderContext,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		console.log('ChatChangesSummaryContentPart constructor');
		console.log('this.changes', content.changes);
		console.log('this.changes.length', content.changes.length);
		this.changes = content.changes;
		this.listPool = this._register(instantiationService.createInstance(CollapsibleListPool, () => Disposable.None, undefined, undefined));
		const list = this.listPool.get().object;
		list.splice(0, list.length, this.changes);
	}

	get domNode(): HTMLElement {
		this._domNode ??= this.init();
		return this._domNode;
	}

	private init(): HTMLElement {
		console.log('init');
		const buttonElement = $('.chat-used-context-label', undefined);
		this._domNode = $('.chat-used-context', undefined, buttonElement);
		const content = this.initContent();
		this._domNode.appendChild(content);
		console.log('this._domNode', this._domNode);
		return this._domNode;
	}

	private initContent(): HTMLElement {
		console.log('initContent');
		console.log('this.changes', this.changes);
		const ref = this._register(this.listPool.get());
		const list = ref.object;
		this._register(list.onDidOpen((e) => {
			console.log('Open event:', e);
			if (e.element?.kind !== 'changesSummary') {
				return;
			}
			const sessionId = e.element.sessionId;
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
			const uri = e.element.reference;
			const modifiedEntry = editSession.getEntry(uri);
			if (!modifiedEntry) {
				return;
			}
			const requestId = e.element.requestId;
			if (!requestId) {
				return;
			}
			const inUndoStop = (findLast(this.context.content, e => e.kind === 'undoStop', this.context.contentIndex) as IChatUndoStop | undefined)?.id;
			const diffBetweenStops: IEditSessionEntryDiff | undefined = editSession.getEntryDiffBetweenStops(modifiedEntry.modifiedURI, requestId, inUndoStop)?.get();
			if (!diffBetweenStops) {
				return;
			}
			this.editorService.openEditor({
				original: { resource: diffBetweenStops.originalURI },
				modified: { resource: diffBetweenStops.modifiedURI },
				options: { transient: true },
			});
		}));
		this._register(list.onContextMenu(e => {
			console.log('Context menu event:', e);
		}));
		const maxItemsShown = 6;
		const itemsShown = Math.min(this.changes.length, maxItemsShown);
		const height = itemsShown * 22;
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, this.changes);
		return list.getHTMLElement().parentElement!;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'changesSummary' && other.changes.length === this.changes.length;
	}
}
