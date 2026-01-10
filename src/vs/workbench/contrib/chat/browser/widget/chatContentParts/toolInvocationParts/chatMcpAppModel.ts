/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { softAssertNever } from '../../../../../../../base/common/assert.js';
import { disposableTimeout } from '../../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable, derived, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../../../base/common/strings.js';
import { hasKey, isDefined } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IMcpAppResourceContent, McpToolCallUI } from '../../../../../mcp/browser/mcpToolCallUI.js';
import { McpResourceURI } from '../../../../../mcp/common/mcpTypes.js';
import { MCP } from '../../../../../mcp/common/modelContextProtocol.js';
import { McpApps } from '../../../../../mcp/common/modelContextProtocolApps.js';
import { IWebviewElement, IWebviewService, WebviewContentPurpose, WebviewOriginStore } from '../../../../../webview/browser/webview.js';
import { IChatRequestVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { isToolResultInputOutputDetails, IToolResult } from '../../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../../chat.js';
import { IMcpAppRenderData } from './chatMcpAppSubPart.js';

/** Storage key for persistent webview origins */
const ORIGIN_STORE_KEY = 'chatMcpApp.origins';

/**
 * Load state for the MCP App model.
 */
export type McpAppLoadState =
	| { readonly status: 'loading' }
	| { readonly status: 'loaded' }
	| { readonly status: 'error'; readonly error: Error };

/**
 * Model that owns an MCP App webview and all its state/logic.
 * The webview is created lazily on first claim and survives across re-renders.
 */
export class ChatMcpAppModel extends Disposable {
	/** Origin store for persistent webview origins per server */
	private readonly _originStore: WebviewOriginStore;

	/** The webview element instance */
	private readonly _webview: IWebviewElement;

	/** Tool call UI for loading resources and proxying calls */
	private readonly _mcpToolCallUI: McpToolCallUI;

	/** Cancellation source for async operations */
	private readonly _disposeCts = this._register(new CancellationTokenSource());

	/** Whether ui/initialize has been called and capabilities announced */
	private _announcedCapabilities = false;

	/** Current height of the webview */
	private _height: number = 300;

	/** The persistent webview origin */
	private readonly _webviewOrigin: string;

	/** Observable for load state */
	private readonly _loadState = observableValue<McpAppLoadState>(this, { status: 'loading' });
	public readonly loadState: IObservable<McpAppLoadState> = this._loadState;

	/** Event fired when height changes */
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	/** Full host context for the MCP App */
	public readonly hostContext: IObservable<McpApps.McpUiHostContext>;

	constructor(
		public readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		public readonly renderData: IMcpAppRenderData,
		private readonly _container: HTMLElement,
		maxHeight: IObservable<number>,
		currentWidth: IObservable<number>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IStorageService storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();

		this._originStore = new WebviewOriginStore(ORIGIN_STORE_KEY, storageService);
		this._webviewOrigin = this._originStore.getOrigin('mcpApp', renderData.serverDefinitionId);
		this._mcpToolCallUI = this._register(this._instantiationService.createInstance(McpToolCallUI, renderData));

		// Create the webview element
		this._webview = this._register(this._webviewService.createWebviewElement({
			origin: this._webviewOrigin,
			title: localize('mcpAppTitle', 'MCP App'),
			options: {
				purpose: WebviewContentPurpose.ChatOutputItem,
				enableFindWidget: false,
				disableServiceWorker: true,
				retainContextWhenHidden: true,
			},
			contentOptions: {
				allowMultipleAPIAcquire: true,
				allowScripts: true,
				allowForms: true,
			},
			extension: undefined,
		}));

		// Mount the webview to the container
		const targetWindow = dom.getWindow(this._container);
		this._webview.mountTo(this._container, targetWindow);

		// Build host context observable
		this.hostContext = this._mcpToolCallUI.hostContext.map((context, reader) => ({
			...context,
			containerDimensions: {
				width: currentWidth.read(reader),
				maxHeight: maxHeight.read(reader),
			},
			toolCall: {
				toolCallId: this.toolInvocation.toolCallId,
				toolName: this.toolInvocation.toolId,
			},
		}));

		// Set up host context change notifications
		this._register(autorun(reader => {
			const context = this.hostContext.read(reader);
			if (this._announcedCapabilities) {
				this._sendNotification({
					method: 'ui/notifications/host-context-changed',
					params: context
				});
			}
		}));

		// Set up message handling
		this._register(this._webview.onMessage(async ({ message }) => {
			await this._handleWebviewMessage(message as McpApps.AppMessage);
		}));

		const canScrollWithin = derived(reader => {
			const contentSize = this._webview.intrinsicContentSize.read(reader);
			const maxHeightValue = maxHeight.read(reader);
			if (!contentSize) {
				return false;
			}

			return contentSize.height > maxHeightValue;
		});

		// Handle wheel events for scroll delegation when the webview can scroll
		this._register(autorun(reader => {
			if (!canScrollWithin.read(reader)) {
				const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
				reader.store.add(this._webview.onDidWheel(e => {
					widget?.delegateScrollFromMouseWheelEvent({
						...e,
						preventDefault: () => { },
						stopPropagation: () => { }
					});
				}));
			}
		}));

		// Start loading the content
		this._loadContent();
	}

	/**
	 * Gets the current height of the webview.
	 */
	public get height(): number {
		return this._height;
	}

	public remount() {
		this._webview.reinitializeAfterDismount();
		this._announcedCapabilities = false;
	}

	/**
	 * Retries loading the MCP App content.
	 */
	public retry(): void {
		this._loadState.set({ status: 'loading' }, undefined);
		this._loadContent();
	}

	/**
	 * Loads the MCP App content into the webview.
	 */
	private async _loadContent(): Promise<void> {
		const token = this._disposeCts.token;

		try {
			// Load the UI resource from the MCP server
			const resourceContent = await this._mcpToolCallUI.loadResource(token);
			if (token.isCancellationRequested) {
				return;
			}

			// Inject CSP into the HTML
			const htmlWithCsp = this._injectPreamble(resourceContent);

			// Reset the state
			this._announcedCapabilities = false;

			// Set the HTML content
			this._webview.setHtml(htmlWithCsp);

			this._loadState.set({ status: 'loaded' }, undefined);
		} catch (error) {
			this._logService.error('[MCP App] Error loading app:', error);
			this._loadState.set({ status: 'error', error: error as Error }, undefined);
		}
	}

	/**
	 * Injects a Content-Security-Policy meta tag into the HTML.
	 */
	private _injectPreamble({ html, csp }: IMcpAppResourceContent): string {
		// Note: this is not bulletproof against malformed domains. However it does not
		// need to be. The server is the one giving us both the CSP as well as the HTML
		// to render in the iframe. MCP Apps give the CSP separately so that systems that
		// proxy the HTML from a server can set it in a header, but the CSP and the HTML
		// come from the same source and are within the same trust boundary. We only
		// process the CSP enough (escaping HTML special characters) to avoid breaking it.
		//
		// It would certainly be more durable to use `DOMParser.parseFromString` here
		// and operate on the DocumentFragment of the HTML, however (even though keeping
		// it solely as a detached document is safe) this requires making the HTML trusted
		// in the renderer and bypassing various tsec warnings. I consider the string
		// munging here to be the lesser of two evils.
		const cleanDomains = (s: string[] | undefined) => (s?.join(' ') || '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;');

		const cspContent = `
			default-src 'none';
			script-src 'self' 'unsafe-inline' ${cleanDomains(csp?.resourceDomains)};
			style-src 'self' 'unsafe-inline' ${cleanDomains(csp?.resourceDomains)};
			connect-src 'self' ${cleanDomains(csp?.connectDomains)};
			img-src 'self' data: ${cleanDomains(csp?.resourceDomains)};
			font-src 'self' ${cleanDomains(csp?.resourceDomains)};
			media-src 'self' data: ${cleanDomains(csp?.resourceDomains)};
			frame-src 'none';
			object-src 'none';
			base-uri 'self';
		`;

		const cspTag = `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`;

		// window.top and window.parent get reset to `window` after the vscode API is made.
		// However, the MCP App SDK by default tries to use these for postMessage. So, wrap them.
		// We also need to wrap the event listeners otherwise the event.source won't match
		// the wrapped window.parent/window.top.
		// https://github.com/microsoft/vscode/blob/2a4c8f5b8a715d45dd2a36778906b5810e4a1905/src/vs/workbench/contrib/webview/browser/pre/index.html#L242-L244
		const postMessageRehoist = `
			<script>(() => {
				const api = acquireVsCodeApi();
				const setMessageSource = (obj, src) => new Proxy(obj, {
					get: (target, prop) => {
						if (prop === 'source')  {
							return src;
						}
						return target[prop];
					}
				});

				const wrappedFns = new WeakMap();

				let patchedPostMessage = (message, transfer) => api.postMessage(message, transfer);
				const wrap = target => new Proxy(target, {
					set: (obj, prop, value) => {
						if (prop === 'postMessage') {
							patchedPostMessage = (message, transfer) => value.call(target, message, transfer);
						} else {
							obj[prop] = value;
						}
						return true;
					},
					get: (obj, prop) => {
						if (prop === 'postMessage') {
							return patchedPostMessage;
						}
						return obj[prop];
					},
				});

				const originalAddEventListener = window.addEventListener.bind(window);
				window.addEventListener = (type, listener, options) => {
					if (type === 'message') {
						const originalListener = listener;
						const wrappedListener = (event) => {
							if (event.source.origin === document.location.origin && event.source !== window) { event = setMessageSource(event, window.parent); }
							originalListener(event);
						};
						wrappedFns.set(originalListener, wrappedListener);
						listener = wrappedListener;
					}

					return originalAddEventListener(type, listener, options);
				};

				const originalRemoveEventListener = window.removeEventListener.bind(window);
				window.removeEventListener = (type, listener, options) => {
					const wrappedListener = wrappedFns.get(listener) || listener;
					return originalRemoveEventListener(type, wrappedListener, options);
				};

				window.parent = wrap(window.parent);
			})();</script>
		`;

		return this._prependToHead(html, cspTag + postMessageRehoist);
	}

	private _prependToHead(html: string, content: string): string {
		// Try to inject into <head>
		const headMatch = html.match(/<head[^>]*>/i);
		if (headMatch) {
			const insertIndex = headMatch.index! + headMatch[0].length;
			return html.slice(0, insertIndex) + '\n' + content + html.slice(insertIndex);
		}

		// If no <head>, try to inject after <html>
		const htmlMatch = html.match(/<html[^>]*>/i);
		if (htmlMatch) {
			const insertIndex = htmlMatch.index! + htmlMatch[0].length;
			return html.slice(0, insertIndex) + '\n<head>' + content + '</head>' + html.slice(insertIndex);
		}

		// If no <html>, prepend
		return `<!DOCTYPE html><html><head>${content}</head><body>${html}</body></html>`;
	}

	/**
	 * Handles incoming JSON-RPC messages from the webview.
	 */
	private async _handleWebviewMessage(message: McpApps.AppMessage): Promise<void> {
		const request = message;
		const token = this._disposeCts.token;

		try {
			let result: McpApps.HostResult = {};

			switch (request.method) {
				case 'ui/initialize':
					result = await this._handleInitialize(request.params);
					break;

				case 'tools/call':
					result = await this._handleToolsCall(request.params, token);
					break;

				case 'resources/read':
					result = await this._handleResourcesRead(request.params, token);
					break;

				case 'ping':
					break;

				case 'ui/notifications/size-changed':
					this._handleSizeChanged(request.params);
					break;

				case 'ui/open-link':
					result = await this._handleOpenLink(request.params);
					break;

				case 'ui/request-display-mode':
					break; // not supported

				case 'ui/notifications/initialized':
					break;

				case 'ui/message':
					result = await this._handleUiMessage(request.params);
					break;

				case 'notifications/message':
					await this._mcpToolCallUI.log(request.params);
					break;

				default: {
					softAssertNever(request);
					const cast = request as MCP.JSONRPCRequest;
					if (cast.id !== undefined) {
						await this._sendError(cast.id, -32601, `Method not found: ${cast.method}`);
					}
					return;
				}
			}

			// Send response if this was a request (has id)
			if (hasKey(request, { id: true })) {
				await this._sendResponse(request.id, result);
			}

		} catch (error) {
			this._logService.error(`[MCP App] Error handling ${request.method}:`, error);
			if (hasKey(request, { id: true })) {
				const message = error instanceof Error ? error.message : String(error);
				await this._sendError(request.id, -32000, message);
			}
		}
	}

	/**
	 * Handles the ui/initialize request from the MCP App.
	 */
	private async _handleInitialize(_params: McpApps.McpUiInitializeRequest['params']): Promise<McpApps.McpUiInitializeResult> {
		this._announcedCapabilities = true;

		// "Host MUST send this notification with the complete tool arguments after the Guest UI's initialize request completes"
		// Cast to `any` due to https://github.com/modelcontextprotocol/ext-apps/issues/197
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let args: any;
		try {
			args = JSON.parse(this.renderData.input);
		} catch {
			args = this.renderData.input;
		}

		const timeout = this._register(disposableTimeout(async () => {
			this._store.delete(timeout);
			await this._sendNotification({
				method: 'ui/notifications/tool-input',
				params: { arguments: args }
			});

			if (this.toolInvocation.kind === 'toolInvocationSerialized') {
				this._sendToolResult(this.toolInvocation.resultDetails);
			} else if (this.toolInvocation.kind === 'toolInvocation') {
				const invocation = this.toolInvocation;
				this._register(autorunSelfDisposable(reader => {
					const state = invocation.state.read(reader);
					if (state.type === IChatToolInvocation.StateKind.Completed) {
						this._sendToolResult(state.resultDetails);
						reader.dispose();
					}
				}));
			}
		}));

		return {
			protocolVersion: McpApps.LATEST_PROTOCOL_VERSION,
			hostInfo: {
				name: this._productService.nameLong,
				version: this._productService.version,
			},
			hostCapabilities: {
				openLinks: {},
				serverTools: { listChanged: true },
				serverResources: { listChanged: true },
				logging: {},
			},
			hostContext: this.hostContext.get(),
		} satisfies Required<McpApps.McpUiInitializeResult>;
	}

	/**
	 * Sends the tool result notification when the result becomes available.
	 */
	private _sendToolResult(resultDetails: IToolResult['toolResultDetails'] | IChatToolInvocationSerialized['resultDetails']): void {
		if (isToolResultInputOutputDetails(resultDetails) && resultDetails.mcpOutput) {
			this._sendNotification({
				method: 'ui/notifications/tool-result',
				params: resultDetails.mcpOutput as MCP.CallToolResult,
			});
		}
	}

	private async _handleUiMessage(params: McpApps.McpUiMessageRequest['params']): Promise<McpApps.McpUiMessageResult> {
		const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
		if (!widget) {
			return { isError: true };
		}

		if (!isFalsyOrWhitespace(widget.getInput())) {
			return { isError: true };
		}

		widget.setInput(params.content.filter(c => c.type === 'text').map(c => c.text).join('\n\n'));
		widget.attachmentModel.clearAndSetContext(...params.content.map((c, i): IChatRequestVariableEntry | undefined => {
			const id = `mcpui-${i}-${Date.now()}`;
			if (c.type === 'image') {
				return { kind: 'image', value: decodeBase64(c.data).buffer, id, name: 'Image' };
			} else if (c.type === 'resource_link') {
				const uri = McpResourceURI.fromServer({ id: this.renderData.serverDefinitionId, label: '' }, c.uri);
				return { kind: 'file', value: uri, id, name: basename(uri) };
			} else {
				return undefined;
			}
		}).filter(isDefined));
		widget.focusInput();

		return { isError: false };
	}

	private _handleSizeChanged(params: McpApps.McpUiSizeChangedNotification['params']): void {
		if (params.height !== undefined) {
			this._height = params.height;
			this._onDidChangeHeight.fire();
		}
	}

	private async _handleOpenLink(params: McpApps.McpUiOpenLinkRequest['params']): Promise<McpApps.McpUiOpenLinkResult> {
		const ok = await this._openerService.open(params.url);
		return { isError: !ok };
	}

	/**
	 * Handles tools/call requests from the MCP App.
	 */
	private async _handleToolsCall(params: MCP.CallToolRequestParams, token: CancellationToken): Promise<MCP.CallToolResult> {
		if (!params?.name) {
			throw new Error('Missing tool name in tools/call request');
		}

		return this._mcpToolCallUI.callTool(params.name, params.arguments || {}, token);
	}

	/**
	 * Handles resources/read requests from the MCP App.
	 */
	private async _handleResourcesRead(params: MCP.ReadResourceRequestParams, token: CancellationToken): Promise<MCP.ReadResourceResult> {
		if (!params?.uri) {
			throw new Error('Missing uri in resources/read request');
		}

		return this._mcpToolCallUI.readResource(params.uri, token);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async _sendResponse(id: number | string, result: any): Promise<void> {
		await this._webview.postMessage({
			jsonrpc: '2.0',
			id,
			result,
		} satisfies MCP.JSONRPCResponse);
	}

	private async _sendError(id: number | string, code: number, message: string): Promise<void> {
		await this._webview.postMessage({
			jsonrpc: '2.0',
			id,
			error: { code, message },
		} satisfies MCP.JSONRPCError);
	}

	private async _sendNotification(message: McpApps.HostNotification): Promise<void> {
		await this._webview.postMessage({
			jsonrpc: '2.0',
			...message,
		});
	}

	public override dispose(): void {
		this._disposeCts.dispose(true);
		super.dispose();
	}
}
