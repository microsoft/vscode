/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IChatChangesSummaryPart, IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool } from './chatReferencesContentPart.js';

export class ChatChangesSummaryContentPart extends Disposable implements IChatContentPart {

	public readonly domNode: HTMLElement;

	constructor(
		content: IChatChangesSummaryPart,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.domNode = dom.$('.chat-tool-invocation-part');
		const listPool = this._register(instantiationService.createInstance(CollapsibleListPool, () => Disposable.None, undefined, undefined));
		const collapsibleListPart = this._register(instantiationService.createInstance(
			ChatCollapsibleListContentPart,
			[],
			'',
			context,
			listPool,
		));
		this.domNode = collapsibleListPart.domNode;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		console.log('hadSameContent', other.kind === 'changesSummary');
		return false;
		// should actually be something along the lines of other.kind === 'changesSummary';
	}
}
