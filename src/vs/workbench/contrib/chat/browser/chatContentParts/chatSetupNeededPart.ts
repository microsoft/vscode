/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatResponseViewModel } from '../../common/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';

const $ = dom.$;

export class ChatSetupNeededPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		element: IChatResponseViewModel,
		renderer: MarkdownRenderer,
		@ICommandService commandService: ICommandService
	) {
		super();

		const errorDetails = element.errorDetails;
		assertType(!!errorDetails, 'errorDetails');

		this.domNode = $('.chat-setup-needed-widget');
		const icon = dom.append(this.domNode, $('span'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));

		const messageContainer = dom.append(this.domNode, $('.chat-setup-needed-error-message'));
		const markdownContent = renderer.render(new MarkdownString(errorDetails.message));
		dom.append(messageContainer, markdownContent.element);

		const button1 = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
		button1.label = localize('upgradeToCopilotPro', "Use Copilot for Free");
		button1.element.classList.add('chat-setup-needed-button');

		this._register(button1.onDidClick(async () => {
			await commandService.executeCommand('workbench.action.chat.triggerSetup');
		}));
	}

	hasSameContent(other: unknown): boolean {
		// Not currently used
		return true;
	}
}
