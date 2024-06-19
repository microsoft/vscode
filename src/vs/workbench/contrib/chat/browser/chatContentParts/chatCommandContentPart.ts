/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatCommandButton } from 'vs/workbench/contrib/chat/common/chatService';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

const $ = dom.$;

export class ChatCommandButtonContentPart extends Disposable {
	public readonly element: HTMLElement;

	constructor(
		commandButton: IChatCommandButton,
		element: ChatTreeItem,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.element = $('.chat-command-button');
		const enabled = !isResponseVM(element) || !element.isStale;
		const tooltip = enabled ?
			commandButton.command.tooltip :
			localize('commandButtonDisabled', "Button not available in restored chat");
		const button = this._register(new Button(this.element, { ...defaultButtonStyles, supportIcons: true, title: tooltip }));
		button.label = commandButton.command.title;
		button.enabled = enabled;

		// TODO still need telemetry for command buttons
		this._register(button.onDidClick(() => this.commandService.executeCommand(commandButton.command.id, ...(commandButton.command.arguments ?? []))));
	}
}
