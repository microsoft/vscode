/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { IChatCommandButton } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';

const $ = dom.$;

export class ChatCommandButtonContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		commandButton: IChatCommandButton,
		context: IChatContentPartRenderContext,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.domNode = $('.chat-command-button');
		const enabled = !isResponseVM(context.element) || !context.element.isStale;
		const tooltip = enabled ?
			commandButton.command.tooltip :
			localize('commandButtonDisabled', "Button not available in restored chat");
		const button = this._register(new Button(this.domNode, { ...defaultButtonStyles, supportIcons: true, title: tooltip }));
		button.label = commandButton.command.title;
		button.enabled = enabled;

		// TODO still need telemetry for command buttons
		this._register(button.onDidClick(() => this.commandService.executeCommand(commandButton.command.id, ...(commandButton.command.arguments ?? []))));
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'command';
	}
}
