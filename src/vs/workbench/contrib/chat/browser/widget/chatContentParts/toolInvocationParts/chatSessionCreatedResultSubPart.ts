/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ILinkPresentationService } from '../../../../../../../platform/dataChannel/common/dataChannel.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IChatSessionCreatedData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatSessionCreatedResult.css';

/**
 * Renders the target title of a completed `create_session`, `create_chat`, or
 * `send_message` tool call as a link. The link comes from the tool call's
 * structured {@link IChatSessionCreatedData} rather than the model's prose.
 */
export class ChatSessionCreatedResultSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly data: IChatSessionCreatedData,
		_context: IChatContentPartRenderContext,
		_renderer: IMarkdownRenderer,
		@ILinkPresentationService linkPresentationService: ILinkPresentationService,
		@IHoverService hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super(toolInvocation);

		this.domNode = dom.$('.chat-open-session-result');
		const link = dom.append(this.domNode, dom.$('a.monaco-link', { href: this.data.openLink }, this.data.label));
		const hover = this._register(hoverService.setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			link,
			this.data.fullTitle ?? this.data.label,
		));
		this._register(dom.addDisposableListener(link, dom.EventType.CLICK, event => {
			dom.EventHelper.stop(event, true);
			void this.openerService.open(URI.parse(this.data.openLink), { fromUserGesture: true, allowContributedOpeners: true });
		}));

		const resource = URI.parse(this.data.openLink);
		const rule = linkPresentationService.getLinkPresentationRule(resource);
		const watcher = rule ? linkPresentationService.createLinkPresentationWatcher(rule.id, resource) : undefined;
		if (watcher) {
			this._register(watcher);
			this._register(autorun(reader => {
				const presentation = watcher.presentation.read(reader);
				const fullTitle = presentation?.title ?? this.data.fullTitle ?? this.data.label;
				const label = fullTitle.length > 60 ? `${fullTitle.slice(0, 57)}…` : fullTitle;
				link.textContent = label;
				hover.update(fullTitle);
			}));
		}
	}
}
