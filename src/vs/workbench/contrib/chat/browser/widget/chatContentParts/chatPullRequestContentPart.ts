/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPullRequestContent.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IChatPullRequestContent } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatContentPart } from './chatContentParts.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { addDisposableListener } from '../../../../../../base/browser/dom.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';

export class ChatPullRequestContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		private readonly pullRequestContent: IChatPullRequestContent,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super();

		this.domNode = dom.$('.chat-pull-request-content-part');
		const container = dom.append(this.domNode, dom.$('.container'));
		const contentContainer = dom.append(container, dom.$('.content-container'));

		const titleContainer = dom.append(contentContainer, dom.$('.title-container'));
		const icon = dom.append(titleContainer, dom.$('.icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitPullRequest));
		const titleLink: HTMLAnchorElement = dom.append(titleContainer, dom.$('a.title'));
		titleLink.textContent = `${this.pullRequestContent.title} - ${this.pullRequestContent.author}`;
		titleLink.href = this.pullRequestContent.uri.toString();
		this._register(addDisposableListener(titleLink, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openerService.open(this.pullRequestContent.uri, { allowCommands: true });
		}));
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'pullRequest';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
