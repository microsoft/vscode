/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../../base/browser/dom.js';
import { softAssertNever } from '../../../../../../base/common/assert.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { basename } from '../../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../../base/common/strings.js';
import { hasKey, isDefined } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IMcpAppResourceContent, McpToolCallUI } from '../../../../mcp/browser/mcpToolCallUI.js';
import { McpResourceURI } from '../../../../mcp/common/mcpTypes.js';
import { MCP } from '../../../../mcp/common/modelContextProtocol.js';
import { McpApps } from '../../../../mcp/common/modelContextProtocolApps.js';
import { IOverlayWebview, IWebviewService, WebviewContentPurpose, WebviewOriginStore } from '../../../../webview/browser/webview.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatRequestVariableEntry } from '../../../common/chatVariableEntries.js';
import { isToolResultInputOutputDetails, IToolResult } from '../../../common/languageModelToolsService.js';
import { IChatWidgetService } from '../../chat.js';
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
	public static maxWebviewHeightPct = 0.8;

	/** Origin store for persistent webview origins per server */
	private readonly _originStore: WebviewOriginStore;

	/** The overlay webview instance */
	private readonly _webview: IOverlayWebview;

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

	/** Host context observable combining tool call UI context with viewport */
	private readonly _viewportObs = observableValue<McpApps.McpUiHostContext['viewport']>(this, undefined);

	/** Full host context for the MCP App */
	public readonly hostContext: IObservable<McpApps.McpUiHostContext>;

	/** Disposable for autorun that sends host context updates */
	private readonly _hostContextAutorun = this._register(new DisposableStore());

	/** The current claimant of the webview */
	private _currentClaimant: object | undefined;

	constructor(
		public readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		public readonly renderData: IMcpAppRenderData,
		container: HTMLElement | undefined,
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

		// Create the overlay webview
		this._webview = this._register(this._webviewService.createWebviewOverlay({
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
			container,
		}));


		// Build host context observable
		this.hostContext = this._mcpToolCallUI.hostContext.map((context, reader) => ({
			...context,
			viewport: this._viewportObs.read(reader),
			toolCall: {
				toolCallId: this.toolInvocation.toolCallId,
				toolName: this.toolInvocation.toolId,
			},
		}));

		// Set up message handling
		this._register(this._webview.onMessage(async ({ message }) => {
			await this._handleWebviewMessage(message as McpApps.AppMessage);
		}));

		// Handle wheel events for scroll delegation
		this._register(this._webview.onDidWheel(e => {
			this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource)?.delegateScrollFromMouseWheelEvent({
				...e,
				preventDefault: () => { },
				stopPropagation: () => { }
			});
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

	/**
	 * Claims the webview for rendering.
	 */
	public claim(claimant: object, domNode: HTMLElement): void {
		this._currentClaimant = claimant;

		const targetWindow = getWindow(domNode);
		this._webview.claim(claimant, targetWindow, undefined);

		// Set up host context change notifications
		this._hostContextAutorun.add(autorun(reader => {
			const context = this.hostContext.read(reader);
			if (this._announcedCapabilities) {
				this._sendNotification({
					method: 'ui/notifications/host-context-changed',
					params: context
				});
			}
		}));

		const listener = () => {
			this._viewportObs.set({
				width: targetWindow.innerWidth,
				height: targetWindow.innerHeight,
				maxWidth: targetWindow.innerWidth,
				maxHeight: targetWindow.innerHeight * ChatMcpAppModel.maxWebviewHeightPct,
			}, undefined);

			this._sendNotification({
				method: 'ui/notifications/size-changed',
				params: { width: domNode.clientWidth, height: domNode.clientHeight },
			});
		};

		const resizeObserver = new ResizeObserver(listener);
		resizeObserver.observe(domNode);
		this._hostContextAutorun.add(toDisposable(() => resizeObserver.disconnect()));
		listener();

		this._webview.container.style.zIndex = '1';
	}

	/**
	 * Releases the webview.
	 */
	public release(claimant: object): void {
		if (this._currentClaimant === claimant) {
			this._webview.release(claimant);
			this._currentClaimant = undefined;
			this._hostContextAutorun.clear();
		}
	}

	/**
	 * Layouts the webview over a placeholder element.
	 */
	public layoutOverElement(element: HTMLElement): void {
		this._webview.layoutWebviewOverElement(element);
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
		const cspContent = `
			default-src 'none';
			script-src 'self' 'unsafe-inline';
			style-src 'self' 'unsafe-inline';
			connect-src 'self' ${csp?.connectDomains?.join(' ') || ''};
			img-src 'self' data: ${csp?.resourceDomains?.join(' ') || ''};
			font-src 'self' ${csp?.resourceDomains?.join(' ') || ''};
			media-src 'self' data: ${csp?.resourceDomains?.join(' ') || ''};
			frame-src 'none';
			object-src 'none';
			base-uri 'self';
		`;

		const cspTag = `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`;

		// window.top and window.parent get reset to `window` after the vscode API is made.
		// However, the MCP App SDK by default tries to use these for postMessage. So, wrap them.
		// https://github.com/microsoft/vscode/blob/2a4c8f5b8a715d45dd2a36778906b5810e4a1905/src/vs/workbench/contrib/webview/browser/pre/index.html#L242-L244
		const postMessageRehoist = `
			<script>(() => {
				const api = acquireVsCodeApi();
				const wrap = target => new Proxy(target, {
					get: (obj, prop) => {
						if (prop === 'postMessage') {
							return (message, transfer) => api.postMessage(message, transfer);
						}
						return obj[prop];
					},
				});
				window.parent = wrap(window.parent);
				window.top = wrap(window.top);
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
				params: resultDetails.mcpOutput,
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
