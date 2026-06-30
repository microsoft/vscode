/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { IWebviewService, WebviewContentPurpose, IWebviewElement } from '../../../../webview/browser/webview.js';
import { IChatGenerativeUIInset } from '../../../common/model/chatModel.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

// Wire-protocol message shapes (mirrors @copilot/a2ui-runtime/src/protocol.ts; core must not import the runtime package).
type HostToInsetMessage = { type: 'RENDER' | 'STATE_DELTA' | 'DISPOSE';[k: string]: unknown };
type InsetToHostMessage = { type: 'READY' | 'INTERACTION' | 'RESIZE';[k: string]: unknown };

/**
 * Renders an interactive generative-UI webview inset inside a chat message bubble.
 * This is a generic, business-logic-free pipe: it hosts a webview, loads the
 * bundled runtime asset, relays messages in/out, tracks intrinsic height, and
 * applies a strict CSP. All A2UI/MCP semantics live outside core.
 */
export class ChatGenerativeUIInsetPart extends Disposable implements IChatContentPart {
	public domNode: HTMLElement;
	private readonly _webview: IWebviewElement;
	private readonly _onDidPostMessage = this._register(new Emitter<InsetToHostMessage>());
	public readonly onDidPostMessage: Event<InsetToHostMessage> = this._onDidPostMessage.event;

	constructor(
		private readonly _content: IChatGenerativeUIInset,
		context: IChatContentPartRenderContext,
		@IWebviewService webviewService: IWebviewService,
	) {
		super();
		this.domNode = dom.append(context.container, dom.$('div.a2ui-inset'));

		this._webview = this._register(webviewService.createWebviewElement({
			origin: 'a2ui-' + generateUuid(),
			title: 'Generative UI',
			options: {
				purpose: WebviewContentPurpose.ChatOutputItem,
				enableFindWidget: false,
				retainContextWhenHidden: true,
			},
			contentOptions: {
				allowScripts: true,
				allowForms: true,
				allowMultipleAPIAcquire: true,
			},
			extension: undefined,
		}));
		this._webview.mountTo(this.domNode, dom.getWindow(this.domNode));

		this._register(this._webview.onMessage(({ message }) => this._onDidPostMessage.fire(message as InsetToHostMessage)));
		this._register(autorun(reader => {
			const size = this._webview.intrinsicContentSize.read(reader);
			if (size) {
				this.domNode.style.height = `${size.height}px`;
			}
		}));

		this._webview.setHtml(this._buildHtml(this._content.runtimeUri.toString()));
	}

	public postToInset(msg: HostToInsetMessage): void {
		this._webview.postMessage(msg);
	}

	private _buildHtml(runtimeSrc: string): string {
		// Strict CSP: only the bundled runtime script may run; no inline handlers, no remote scripts.
		return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${runtimeSrc}; style-src 'unsafe-inline';">
</head><body><div id="root"></div><script src="${runtimeSrc}"></script></body></html>`;
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === 'generativeUIRuntimeInset'
			&& other.surfaceId === this._content.surfaceId
			&& other.version === this._content.version;
	}
}
