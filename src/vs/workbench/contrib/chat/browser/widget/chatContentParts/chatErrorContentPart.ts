/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatErrorLevel, IChatWarningMuteAction } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { getCompactCodicon } from '../../chatIcons.js';
import { IChatContentPart } from './chatContentParts.js';
import '../input/media/chatInputNotice.css';

const $ = dom.$;

export class ChatErrorContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		kind: ChatErrorLevel,
		content: IMarkdownString,
		private readonly errorDetails: IChatRendererContent,
		renderer: IMarkdownRenderer,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.domNode = this._register(new ChatErrorWidget(kind, content, renderer)).domNode;
		if (errorDetails.kind === 'warning' && errorDetails.mute) {
			this.renderMuteAction(errorDetails.mute);
		}
	}

	/** Adds a bell-slash button on the right, styled as the chat input notifications' mute action. */
	private renderMuteAction(mute: IChatWarningMuteAction): void {
		const container = dom.append(this.domNode, $('.chat-input-notice-action.chat-notification-widget-action'));
		const actionBar = this._register(new ActionBar(container));
		actionBar.push(this._register(new Action('chatWarning.mute', mute.tooltip, ThemeIcon.asClassName(getCompactCodicon(Codicon.bellSlash)), true,
			async () => {
				this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: mute.commandId, from: 'chatWarning' });
				await this.commandService.executeCommand(mute.commandId, ...(mute.commandArgs ?? []));
			})), { icon: true, label: false });
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, mute.tooltip));
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === this.errorDetails.kind;
	}
}

export class ChatErrorWidget extends Disposable {
	public readonly domNode: HTMLElement;

	constructor(
		kind: ChatErrorLevel,
		content: IMarkdownString,
		renderer: IMarkdownRenderer,
	) {
		super();

		this.domNode = $('.chat-notification-widget');
		this.domNode.tabIndex = 0;
		let icon;
		let iconClass;
		switch (kind) {
			case ChatErrorLevel.Warning:
				icon = Codicon.warning;
				iconClass = '.chat-warning-codicon';
				break;
			case ChatErrorLevel.Error:
				icon = Codicon.error;
				iconClass = '.chat-error-codicon';
				break;
			case ChatErrorLevel.Info:
				icon = Codicon.info;
				iconClass = '.chat-info-codicon';
				break;
		}
		this.domNode.appendChild($(iconClass, undefined, renderIcon(icon)));
		const markdownContent = this._register(renderer.render(content));
		this.domNode.appendChild(markdownContent.element);
	}
}
