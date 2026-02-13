/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { localize } from '../../../../../../nls.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import './media/chatDisabledClaudeHooksContent.css';

export class ChatDisabledClaudeHooksContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		_context: IChatContentPartRenderContext,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
	) {
		super();

		this.domNode = dom.$('.chat-disabled-claude-hooks');
		const messageContainer = dom.$('.chat-disabled-claude-hooks-message');

		const icon = dom.$('.chat-disabled-claude-hooks-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));

		const enableLink = createMarkdownCommandLink({
			title: localize('chat.disabledClaudeHooks.enableLink', "Enable"),
			id: 'workbench.action.openSettings',
			arguments: [PromptsConfig.USE_CLAUDE_HOOKS],
		});
		const message = localize('chat.disabledClaudeHooks.message', "Claude Code hooks are available for this workspace. {0}", enableLink);
		const content = new MarkdownString(message, { isTrusted: true });

		const rendered = this._register(this._markdownRendererService.render(content, {
			actionHandler: (href) => openLinkFromMarkdown(this._openerService, href, true),
		}));

		messageContainer.appendChild(icon);
		messageContainer.appendChild(rendered.element);
		this.domNode.appendChild(messageContainer);
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === 'disabledClaudeHooks';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
