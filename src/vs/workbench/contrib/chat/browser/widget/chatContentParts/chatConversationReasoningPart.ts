/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';

/**
 * A reasoning run listed among the tool calls of a Conversation section. It names how long
 * the run thought and shows its text once expanded.
 */
export class ChatConversationReasoningPart extends ChatCollapsibleContentPart {

	/** Holds the run's reasoning text, whether or not the row has been expanded yet. */
	readonly content = $('.chat-used-context-list.chat-thinking-reasoning-content');

	constructor(
		private rowTitle: string,
		context: IChatContentPartRenderContext,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(rowTitle, context, undefined, hoverService, configurationService, telemetryService);
		this.domNode.classList.add('chat-thinking-reasoning');
	}

	protected override get collapsibleKind(): string {
		return 'reasoning';
	}

	protected override get collapsibleInThinking(): boolean {
		return true;
	}

	protected override initContent(): HTMLElement {
		return this.content;
	}

	updateTitle(title: string): void {
		if (title !== this.rowTitle) {
			this.rowTitle = title;
			this.setTitle(title);
		}
	}

	/** Opens the row, which attaches and shows its reasoning text. */
	expand(): void {
		this.setExpanded(true);
	}

	hasSameContent(_other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return false;
	}
}
