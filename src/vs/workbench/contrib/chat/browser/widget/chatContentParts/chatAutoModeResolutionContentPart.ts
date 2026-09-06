/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { autoModeRoutingTitle } from '../../../common/chatAutoModeExplainability.js';
import { IChatAutoModeResolutionPart } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatThinkingStyleContentPart } from './chatThinkingStyleContentPart.js';

/**
 * Explains Auto's routing decision on one line, so the chosen model is
 * readable without a click.
 */
export class ChatAutoModeResolutionContentPart extends ChatThinkingStyleContentPart {

	private readonly isRouting: boolean;

	constructor(
		private readonly content: IChatAutoModeResolutionPart,
		context: IChatContentPartRenderContext,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(autoModeRoutingTitle(content), context, undefined, hoverService, configurationService);

		this.isRouting = !content.resolved;
		this.setThinkingActive(this.isRouting);
		// The title says everything, so this is a status line, not a disclosure.
		this.setExpandable(false);
		if (this.isRouting) {
			this.setShimmerTitle(autoModeRoutingTitle(content));
		}
	}

	protected override shouldPrepareContentAnimation(): boolean {
		return false;
	}

	protected override initContent(): HTMLElement {
		// Never reached: the row does not expand, so its body is never built.
		return this.createThinkingBody();
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		if (other.kind !== 'autoModeResolution') {
			return false;
		}
		// Once the response ends, a row still routing is re-rendered so the
		// renderer can drop it rather than leave it shimmering forever.
		if (this.isRouting && element.isComplete) {
			return false;
		}
		return other.resolved?.id === this.content.resolved?.id;
	}
}
