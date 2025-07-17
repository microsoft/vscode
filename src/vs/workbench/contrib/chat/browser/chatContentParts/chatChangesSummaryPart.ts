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
import { IChatChangesSummary } from '../../common/chatService.js';

export class ChatChangesSummaryContentPart extends Disposable implements IChatContentPart {

	private _domNode: HTMLElement | undefined;

	private readonly listPool: CollapsibleListPool;
	private readonly changes: ReadonlyArray<IChatChangesSummary>;

	constructor(
		content: IChatChangesSummaryPart,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.changes = content.changes;
		this.listPool = this._register(instantiationService.createInstance(CollapsibleListPool, () => Disposable.None, undefined, undefined));
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
		const ref = this._register(this.listPool.get());
		const list = ref.object;
		this._register(list.onDidOpen((e) => {
			console.log('Open event:', e);
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
