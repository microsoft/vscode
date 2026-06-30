/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { dirname } from '../../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IWebviewService, WebviewContentPurpose, IWebviewElement } from '../../../../webview/browser/webview.js';
import { asWebviewUri, webviewGenericCspSource } from '../../../../webview/common/webview.js';
import { IChatGenerativeUIInset } from '../../../common/model/chatModel.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { deregisterInset, registerInset } from './chatGenerativeUIInsetRegistry.js';

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
		@ICommandService private readonly _commandService: ICommandService,
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
				// The runtime bundle lives on disk next to the extension; allow the
				// webview to load local resources from its containing directory so the
				// `<script src>` (rewritten via asWebviewUri) actually resolves.
				localResourceRoots: [dirname(this._content.runtimeUri)],
			},
			extension: undefined,
		}));
		this._webview.mountTo(this.domNode, dom.getWindow(this.domNode));

		this._register(this._webview.onMessage(({ message }) => {
			const msg = message as InsetToHostMessage;
			// When the runtime signals it has mounted, push the initial document so
			// it has something to render. (Post-render updates arrive via STATE_DELTA
			// through the registry/command path.)
			if (msg.type === 'READY' && this._content.initialDoc !== undefined) {
				this.postToInset({ type: 'RENDER', doc: this._content.initialDoc as object });
			}
			// Forward inset interactions back to the extension for routing. The
			// extension registers `_a2ui.routeInteraction` (mirrors the reverse
			// `_a2ui.postToSurface` convention); core hardcodes the string because
			// it must not import the extension/runtime packages. Wrapped in a
			// try/catch and a rejection handler because the command may be
			// unregistered (extension not installed/activated yet).
			if (msg.type === 'INTERACTION') {
				try {
					this._commandService.executeCommand('_a2ui.routeInteraction', this._content.surfaceId, msg)
						.then(undefined, () => { /* extension not listening — ignore */ });
				} catch {
					/* command not registered — ignore */
				}
			}
			this._onDidPostMessage.fire(msg);
		}));
		this._register(autorun(reader => {
			const size = this._webview.intrinsicContentSize.read(reader);
			if (size) {
				this.domNode.style.height = `${size.height}px`;
			}
		}));

		// Rewrite the on-disk runtime URI into a webview-loadable URI. Core webviews
		// cannot load `file:` URIs directly; resources must be requested through the
		// `vscode-resource`/`vscode-cdn` authority (served by the webview service
		// worker) and the source directory must be in `localResourceRoots` (above).
		const runtimeSrc = asWebviewUri(this._content.runtimeUri).toString(true);
		this._webview.setHtml(this._buildHtml(runtimeSrc));

		// Register in the cross-fork transport registry so the extension can push
		// post-render messages (STATE_DELTA / DISPOSE) to THIS inset by surfaceId
		// via the `_a2ui.postToSurface` command. Deregister on dispose.
		const surfaceId = this._content.surfaceId;
		registerInset(surfaceId, this);
		this._register({ dispose: () => deregisterInset(surfaceId, this) });
	}

	public postToInset(msg: HostToInsetMessage): void {
		this._webview.postMessage(msg);
	}

	private _buildHtml(runtimeSrc: string): string {
		// Strict CSP: only the bundled runtime script (served from the webview
		// resource authority) may run; no inline handlers, no remote scripts.
		return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webviewGenericCspSource}; style-src 'unsafe-inline';">
</head><body><div id="root"></div><script src="${runtimeSrc}"></script></body></html>`;
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === 'generativeUIRuntimeInset'
			&& other.surfaceId === this._content.surfaceId
			&& other.version === this._content.version;
	}
}
