/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { getWindow } from '../../../../../../base/browser/dom.js';
import { softAssertNever } from '../../../../../../base/common/assert.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { basename } from '../../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { hasKey, isDefined } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { McpToolCallUI } from '../../../../mcp/browser/mcpToolCallUI.js';
import { IMcpToolCallUIData, McpResourceURI } from '../../../../mcp/common/mcpTypes.js';
import { MCP } from '../../../../mcp/common/modelContextProtocol.js';
import { McpApps } from '../../../../mcp/common/modelContextProtocolApps.js';
import { IWebviewElement, IWebviewService, WebviewContentPurpose, WebviewOriginStore } from '../../../../webview/browser/webview.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatRequestVariableEntry } from '../../../common/chatVariableEntries.js';
import { IToolResultInputOutputDetails, ToolMcpUiOutput } from '../../../common/languageModelToolsService.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

/**
 * State cached per MCP App webview for height persistence across re-renders.
 */
interface McpAppState {
	readonly webviewOrigin: string;
	height: number;
}

const maxWebviewHeightPct = 0.8;

/**
 * Sub-part for rendering MCP App webviews in chat tool output.
 * Implements the MCP Apps specification for bidirectional JSON-RPC communication.
 */
export class ChatMcpAppSubPart extends BaseChatToolInvocationSubPart {

	/** Origin store for persistent webview origins per server */
	private static readonly _originStore = 'chatMcpApp.origins';

	/** Cached states per view model for height persistence */
	private static readonly _cachedStates = new ResourceMap<Map<string, McpAppState>>();

	public readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	private readonly _disposeCts = this._register(new CancellationTokenSource());
	private readonly _mcpToolCallUI: McpToolCallUI;
	private readonly _originStore: WebviewOriginStore;
	private _announcedCapabilities = false;

	private readonly hostContext: IObservable<McpApps.McpUiHostContext>;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly _uiOutput: ToolMcpUiOutput,
		private readonly _details: IToolResultInputOutputDetails,
		private readonly _context: IChatContentPartRenderContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IStorageService storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super(toolInvocation);

		this._originStore = new WebviewOriginStore(ChatMcpAppSubPart._originStore, storageService);
		this._mcpToolCallUI = this._register(this._instantiationService.createInstance(McpToolCallUI, this._uiOutput.uiData));

		this.domNode = dom.$('div.mcp-app-part');
		const container = this._createWebviewContainer();
		this.domNode.appendChild(container);

		const viewportObs = observableValue<McpApps.McpUiHostContext['viewport']>(this, undefined);
		const updateViewportSize = () => viewportObs.set({
			width: container.clientWidth,
			height: container.clientHeight,
			maxWidth: container.clientWidth,
			maxHeight: getWindow(container).innerHeight * maxWebviewHeightPct,
		}, undefined);

		this.hostContext = this._mcpToolCallUI.hostContext.map((context, reader) => ({
			...context,
			viewport: viewportObs.read(reader),
			toolCall: {
				toolCallId: this.toolInvocation.toolCallId,
				toolName: this.toolInvocation.toolId,
			},
		}));

		const resizeObserver = new ResizeObserver(updateViewportSize);
		resizeObserver.observe(this.domNode);
		this._register(toDisposable(() => resizeObserver.disconnect()));
	}

	public override dispose(): void {
		this._disposeCts.dispose(true);
		super.dispose();
	}

	private _createWebviewContainer(): HTMLElement {
		const container = dom.$('div.mcp-app-webview');
		container.style.maxHeight = `${maxWebviewHeightPct * 100}vh`;
		container.style.minHeight = '100px';

		// Get or create cached state for this tool invocation
		let state: McpAppState = {
			height: 300,
			webviewOrigin: this._getOrCreateOrigin(this._uiOutput.uiData),
		};

		let allStates = ChatMcpAppSubPart._cachedStates.get(this._context.element.sessionResource);
		if (!allStates) {
			allStates = new Map<string, McpAppState>();
			ChatMcpAppSubPart._cachedStates.set(this._context.element.sessionResource, allStates);
		}

		const cachedState = allStates.get(this.toolInvocation.toolCallId);
		if (cachedState) {
			state = cachedState;
		} else {
			allStates.set(this.toolInvocation.toolCallId, state);
		}

		if (state.height) {
			container.style.height = `${state.height}px`;
		}

		// Show loading progress
		const progressMessage = dom.$('span');
		progressMessage.textContent = localize('loadingMcpApp', 'Loading MCP App...');
		const progressPart = this._register(this._instantiationService.createInstance(
			ChatProgressSubPart,
			progressMessage,
			ThemeIcon.modify(Codicon.loading, 'spin'),
			undefined
		));
		container.appendChild(progressPart.domNode);

		// Load and render the MCP App
		this._loadAndRenderApp(container, state, progressPart).catch(error => {
			this._logService.error('[MCP App] Error loading app:', error);
			this._showError(container, progressPart.domNode, error);
		});

		return container;
	}

	private _getOrCreateOrigin(uiData: IMcpToolCallUIData): string {
		// Use server definition ID as the key for origin persistence
		return this._originStore.getOrigin('mcpApp', uiData.serverDefinitionId);
	}

	private async _loadAndRenderApp(
		container: HTMLElement,
		state: McpAppState,
		progressPart: ChatProgressSubPart
	): Promise<void> {
		const token = this._disposeCts.token;

		// Load the UI resource from the MCP server
		const resourceContent = await this._mcpToolCallUI.loadResource(token);
		if (token.isCancellationRequested) {
			return;
		}

		// Inject CSP into the HTML
		const htmlWithCsp = this._injectPreamble(resourceContent.html, resourceContent.csp);

		// Create the webview
		const webview = this._register(this._webviewService.createWebviewElement({
			origin: state.webviewOrigin,
			title: localize('mcpAppTitle', 'MCP App'),
			options: {
				purpose: WebviewContentPurpose.ChatOutputItem,
				enableFindWidget: false,
				disableServiceWorker: true,
			},
			contentOptions: {
				allowMultipleAPIAcquire: true,
				allowScripts: true,
				allowForms: true,
			},
			extension: undefined,
		}));

		// Mount the webview
		webview.mountTo(container, getWindow(container));

		// Set the HTML content
		webview.setHtml(htmlWithCsp);

		// Remove progress indicator
		progressPart.domNode.remove();
		this._onDidChangeHeight.fire();


		// Set up message handling for JSON-RPC communication
		this._register(webview.onMessage(async ({ message }) => {
			await this._handleWebviewMessage(message as McpApps.AppRequest, webview, container, state);
		}));

		// Handle host context changes
		this._register(autorun(reader => {
			const context = this.hostContext.read(reader);
			if (this._announcedCapabilities) {
				this._sendNotification(webview, {
					method: 'ui/notifications/host-context-changed',
					params: context
				});
			}
		}));

		// Handle wheel events for scroll delegation
		this._register(webview.onDidWheel(e => {
			this._chatWidgetService.getWidgetBySessionResource(this._context.element.sessionResource)?.delegateScrollFromMouseWheelEvent({
				...e,
				preventDefault: () => { },
				stopPropagation: () => { }
			});
		}));

		// Handle widget show/hide for webview reinitialization
		const widget = this._chatWidgetService.getWidgetBySessionResource(this._context.element.sessionResource);
		if (widget) {
			this._register(widget.onDidShow(() => {
				webview.reinitializeAfterDismount();
			}));
		}
	}

	/**
	 * Injects a Content-Security-Policy meta tag into the HTML.
	 */
	private _injectPreamble(html: string, csp?: readonly string[]): string {
		// Build CSP directive
		const cspDomains = csp?.join(' ') || '';
		const noneSrc = `'none'`;
		const cspContent = [
			`default-src ${noneSrc}`,
			`script-src 'unsafe-inline' ${cspDomains}`.trim(),
			`style-src 'unsafe-inline' ${cspDomains}`.trim(),
			`img-src data: https: ${cspDomains}`.trim(),
			`font-src data: https: ${cspDomains}`.trim(),
			`connect-src ${cspDomains || noneSrc}`.trim(),
		].join('; ');

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

		return this._prependToHead(
			html,
			cspTag + postMessageRehoist
		);
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
	private async _handleWebviewMessage(message: McpApps.AppMessage, webview: IWebviewElement, container: HTMLElement, state: { height: number }): Promise<void> {
		const request = message;
		const token = this._disposeCts.token;

		try {
			let result: McpApps.HostResult = {};

			switch (request.method) {
				case 'ui/initialize':
					result = await this._handleInitialize(request.params, webview);
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
					this._handleSizeChanged(request.params, container, state);
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
						await this._sendError(webview, cast.id, -32601, `Method not found: ${cast.method}`);
					}
					return;
				}
			}

			// Send response if this was a request (has id)
			if (hasKey(request, { id: true })) {
				await this._sendResponse(webview, request.id, result);
			}

		} catch (error) {
			this._logService.error(`[MCP App] Error handling ${request.method}:`, error);
			if (hasKey(request, { id: true })) {
				const message = error instanceof Error ? error.message : String(error);
				await this._sendError(webview, request.id, -32000, message);
			}
		}
	}

	private async _handleUiMessage(params: McpApps.McpUiMessageRequest['params']): Promise<McpApps.McpUiMessageResult> {
		const widget = this._chatWidgetService.getWidgetBySessionResource(this._context.element.sessionResource);
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
				const uri = McpResourceURI.fromServer({ id: this._uiOutput.uiData.serverDefinitionId, label: '' }, c.uri);
				return { kind: 'file', value: uri, id, name: basename(uri) };
			} else {
				return undefined;
			}
		}).filter(isDefined));
		widget.focusInput();

		return { isError: false };

	}

	private _handleSizeChanged(params: McpApps.McpUiSizeChangedNotification['params'], container: HTMLElement, state: { height: number }): void {
		if (params.height !== undefined) {
			state.height = params.height;
			container.style.height = `${state.height}px`;
			this._onDidChangeHeight.fire();
		}
	}

	private async _handleOpenLink(params: McpApps.McpUiOpenLinkRequest['params']): Promise<McpApps.McpUiOpenLinkResult> {
		const ok = await this._openerService.open(params.url);
		return { isError: !ok };
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async _sendResponse(webview: IWebviewElement, id: number | string, result: any): Promise<void> {
		await webview.postMessage({
			jsonrpc: '2.0',
			id,
			result,
		} satisfies MCP.JSONRPCResponse);
	}

	private async _sendError(webview: IWebviewElement, id: number | string, code: number, message: string): Promise<void> {
		await webview.postMessage({
			jsonrpc: '2.0',
			id,
			error: { code, message },
		} satisfies MCP.JSONRPCError);
	}

	private async _sendNotification(webview: IWebviewElement, message: McpApps.HostNotification): Promise<void> {
		await webview.postMessage({
			jsonrpc: '2.0',
			...message,
		});
	}

	/**
	 * Handles the ui/initialize request from the MCP App.
	 */
	private async _handleInitialize(_params: McpApps.McpUiInitializeRequest['params'], webview: IWebviewElement): Promise<McpApps.McpUiInitializeResult> {
		this._announcedCapabilities = true;
		// "Host MUST send this notification with the complete tool arguments after the Guest UI's initialize request completes"
		// Cast to `any` due to https://github.com/modelcontextprotocol/ext-apps/issues/197
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let args: any;
		try {
			args = JSON.parse(this._details.input);
		} catch {
			args = this._details.input;
		}

		const timeout = this._register(disposableTimeout(async () => {
			this._store.delete(timeout);
			await this._sendNotification(webview, {
				method: 'ui/notifications/tool-input',
				params: { arguments: args }
			});
			await this._sendNotification(webview, {
				method: 'ui/notifications/tool-result',
				params: this._uiOutput.uiData.rawToolOutput,
			});
		}));

		return {
			protocolVersion: McpApps.LATEST_PROTOCOL_VERSION,
			capabilities: {},
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
		};
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

	/**
	 * Shows an error message in the container.
	 */
	private _showError(container: HTMLElement, replaceNode: HTMLElement, error: Error): void {
		const errorNode = dom.$('.mcp-app-error');

		const errorHeaderNode = dom.$('.mcp-app-error-header');
		dom.append(errorNode, errorHeaderNode);

		const iconElement = dom.$('div');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
		errorHeaderNode.append(iconElement);

		const errorTitleNode = dom.$('.mcp-app-error-title');
		errorTitleNode.textContent = localize('mcpAppError', 'Error loading MCP App');
		errorHeaderNode.append(errorTitleNode);

		const errorMessageNode = dom.$('.mcp-app-error-details');
		errorMessageNode.textContent = error.message || String(error);
		errorNode.append(errorMessageNode);

		replaceNode.replaceWith(errorNode);
		this._onDidChangeHeight.fire();
	}
}
