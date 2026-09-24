/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../../../base/browser/markdownRenderer.js';
import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../../../nls.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { AccessibilityWorkbenchSettingId } from '../../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

const skipHref = '#skip';

export class ChatOtherClientToolProgressPart extends BaseChatToolInvocationSubPart {
	readonly domNode: HTMLElement;
	readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		renderer: IMarkdownRenderer,
		announcedToolProgressKeys: Set<string> | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(toolInvocation);

		const invocationMessage = typeof toolInvocation.invocationMessage === 'string'
			? toolInvocation.invocationMessage
			: renderAsPlaintext(toolInvocation.invocationMessage);
		const content = localize(
			'agentHost.otherClientTool.runningWithSkip',
			'{0} [Skip?](#skip)',
			escapeMarkdownSyntaxTokens(invocationMessage),
		);
		let cancelled = false;
		const rendered = this._register(renderer.render(new MarkdownString(content, { isTrusted: true }), {
			actionHandler: href => {
				if (href === skipHref && !cancelled) {
					cancelled = true;
					toolInvocation.otherClientToolCall?.cancel();
				}
			},
		}));
		// eslint-disable-next-line no-restricted-syntax
		const skipLink = rendered.element.querySelector<HTMLAnchorElement>(`a[data-href="${skipHref}"]`);
		if (skipLink) {
			skipLink.setAttribute('role', 'button');
			skipLink.href = '';
		}

		const announcementKey = `progress:${toolInvocation.toolCallId}`;
		if (announcedToolProgressKeys
			&& configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)
			&& !announcedToolProgressKeys.has(announcementKey)) {
			announcedToolProgressKeys.add(announcementKey);
			status(localize('agentHost.otherClientTool.runningWithSkip.a11y', '{0} Skip?', invocationMessage));
		}

		this.domNode = this._register(instantiationService.createInstance(
			ChatProgressSubPart,
			rendered.element,
			Codicon.check,
			undefined,
		)).domNode;
	}
}
