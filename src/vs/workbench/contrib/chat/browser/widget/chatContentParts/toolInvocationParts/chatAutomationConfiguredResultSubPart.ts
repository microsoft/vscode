/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatAutomationConfiguredData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatSessionCreatedResult.css';

/**
 * Renders a deterministic automation create/update result as a secondary
 * button that opens and focuses the affected automation.
 */
export class ChatAutomationConfiguredResultSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		data: IChatAutomationConfiguredData,
		_context: IChatContentPartRenderContext,
		_renderer: IMarkdownRenderer,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(toolInvocation);

		this.domNode = dom.$('.chat-open-session-result');
		const label = data.operation === 'created'
			? localize('automationConfigured.created', "Created an automation: {0}", data.automationName)
			: localize('automationConfigured.updated', "Edited an automation: {0}", data.automationName);
		// `ButtonWithIcon` keeps the `codicon-*` classes off the button root, where they would restyle the label text.
		const button = this._register(new ButtonWithIcon(this.domNode, {
			...defaultButtonStyles,
			secondary: true,
			title: localize('automationConfigured.open', "Open automation {0}", data.automationName),
		}));
		button.element.classList.add('chat-open-session-button');
		button.label = label;
		button.icon = Codicon.watch;
		this._register(button.onDidClick(() => this.commandService.executeCommand(
			'sessionsView.manageAutomations',
		)));
	}
}
