/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ILinkPresentation, ILinkPresentationService } from '../../../../../../../platform/dataChannel/common/dataChannel.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IChatSessionTargetData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatRichLink } from '../chatRichLink.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatSessionCreatedResult.css';

/**
 * Renders the target title of a completed `create_session`, `create_chat`, or
 * `send_message` tool call as an interactive pill. The target comes from the
 * tool call's structured {@link IChatSessionTargetData} rather than the model's prose.
 */
export class ChatSessionTargetResultPillSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly data: IChatSessionTargetData,
		_context: IChatContentPartRenderContext,
		_renderer: IMarkdownRenderer,
		@ILinkPresentationService linkPresentationService: ILinkPresentationService,
		@IHoverService hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super(toolInvocation);

		this.domNode = dom.$('.chat-open-session-result');
		const link = dom.append(this.domNode, dom.$('a.monaco-link', { href: this.data.openLink }));
		const richLink = this._register(ChatRichLink.mount(link, dom.$('span', undefined, this.data.label)));
		const fallbackPresentation: ILinkPresentation = {
			kind: this.data.isChat ? 'chat' : 'session',
			title: this.data.fullTitle ?? this.data.label,
		};
		richLink.update(fallbackPresentation);
		const hover = this._register(hoverService.setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			link,
			this.data.fullTitle ?? this.data.label,
		));
		this._register(registerSessionTargetPillActivationListeners(link, options => this._open(options)));
		const resource = URI.parse(this.data.openLink);
		const rule = linkPresentationService.getLinkPresentationRule(resource);
		const watcher = rule ? linkPresentationService.createLinkPresentationWatcher(rule.id, resource) : undefined;
		if (watcher) {
			this._register(watcher);
			this._register(autorun(reader => {
				const presentation = watcher.presentation.read(reader) ?? fallbackPresentation;
				richLink.update(presentation);
				hover.update(presentation.tooltip ?? presentation.title ?? this.data.fullTitle ?? this.data.label);
			}));
		}
	}

	private _open(options: ISessionTargetPillActivationOptions): void {
		void this.openerService.open(URI.parse(this.data.openLink), { fromUserGesture: true, allowContributedOpeners: true, openToSide: options.openToSide });
	}
}

interface ISessionTargetPillActivationOptions {
	readonly openToSide: boolean;
}

function registerSessionTargetPillActivationListeners(element: HTMLElement, onActivate: (options: ISessionTargetPillActivationOptions) => void): IDisposable {
	const store = new DisposableStore();
	store.add(dom.addDisposableListener(element, dom.EventType.CLICK, event => {
		dom.EventHelper.stop(event, true);
		onActivate({ openToSide: event.altKey });
	}));
	store.add(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, event => {
		const keyboardEvent = new StandardKeyboardEvent(event);
		if (keyboardEvent.keyCode !== KeyCode.Enter && keyboardEvent.keyCode !== KeyCode.Space) {
			return;
		}
		dom.EventHelper.stop(event, true);
		onActivate({ openToSide: keyboardEvent.keyCode === KeyCode.Enter && keyboardEvent.altKey });
	}));
	return store;
}
