/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatExtensionsContent.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ExtensionsList, getExtensions } from '../../../extensions/browser/extensionsViewer.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IChatExtensionsContent } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem, ChatViewId, IChatCodeBlockInfo } from '../chat.js';
import { IChatContentPart } from './chatContentParts.js';
import { PagedModel } from '../../../../../base/common/paging.js';

export class ChatExtensionsContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public get codeblocks(): IChatCodeBlockInfo[] {
		return [];
	}

	public get codeblocksPartId(): string | undefined {
		return undefined;
	}

	constructor(
		private readonly extensionsContent: IChatExtensionsContent,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-extensions-content-part');

		const extensionsList = dom.append(this.domNode, dom.$('.extensions-list'));
		const list = this._register(instantiationService.createInstance(ExtensionsList, extensionsList, ChatViewId, { alwaysConsumeMouseWheel: false }, { onFocus: Event.None, onBlur: Event.None, filters: {} }));
		getExtensions(extensionsContent.extensions, extensionsWorkbenchService).then(extensions => {
			if (this._store.isDisposed) {
				return;
			}
			list.setModel(new PagedModel(extensions));
			list.layout();
			this._onDidChangeHeight.fire();
		});
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'extensions' && other.extensions.length === this.extensionsContent.extensions.length && other.extensions.every(ext => this.extensionsContent.extensions.includes(ext));
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
