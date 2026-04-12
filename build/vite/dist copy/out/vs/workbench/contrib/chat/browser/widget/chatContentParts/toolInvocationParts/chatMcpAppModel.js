/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatMcpAppModel_1;
import * as dom from '../../../../../../../base/browser/dom.js';
import { softAssertNever } from '../../../../../../../base/common/assert.js';
import { disposableTimeout } from '../../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { hash } from '../../../../../../../base/common/hash.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable, observableValue } from '../../../../../../../base/common/observable.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../../../base/common/strings.js';
import { hasKey, isDefined } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IChatResponseResourceFileSystemProvider } from '../../../../common/widget/chatResponseResourceFileSystemProvider.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { McpToolCallUI } from '../../../../../mcp/browser/mcpToolCallUI.js';
import { McpResourceURI } from '../../../../../mcp/common/mcpTypes.js';
import { McpApps } from '../../../../../mcp/common/modelContextProtocolApps.js';
import { IWebviewService, WebviewOriginStore } from '../../../../../webview/browser/webview.js';
import { isToolResultInputOutputDetails } from '../../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../../chat.js';
/** Storage key for persistent webview origins */
const ORIGIN_STORE_KEY = 'chatMcpApp.origins';
/**
 * Model that owns an MCP App webview and all its state/logic.
 * The webview is created lazily on first claim and survives across re-renders.
 */
let ChatMcpAppModel = class ChatMcpAppModel extends Disposable {
    static { ChatMcpAppModel_1 = this; }
    static { this.heightCache = new WeakMap(); }
    constructor(toolInvocation, renderData, _container, maxHeight, currentWidth, _instantiationService, _chatWidgetService, _webviewService, storageService, _chatResponseResourceFsProvider, _logService, _productService, _openerService) {
        super();
        this.toolInvocation = toolInvocation;
        this.renderData = renderData;
        this._container = _container;
        this._instantiationService = _instantiationService;
        this._chatWidgetService = _chatWidgetService;
        this._webviewService = _webviewService;
        this._chatResponseResourceFsProvider = _chatResponseResourceFsProvider;
        this._logService = _logService;
        this._productService = _productService;
        this._openerService = _openerService;
        /** Cancellation source for async operations */
        this._disposeCts = this._register(new CancellationTokenSource());
        /** Whether ui/initialize has been called and capabilities announced */
        this._announcedCapabilities = false;
        /** Latest CSP used for the frame */
        this._latestCsp = undefined;
        /** Observable for load state */
        this._loadState = observableValue(this, { status: 'loading' });
        this.loadState = this._loadState;
        /** Event fired when height changes */
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        /** Accumulated download resource parts from ui/download-file calls */
        this._downloadParts = observableValue(this, []);
        this.downloadParts = this._downloadParts;
        this._originStore = new WebviewOriginStore(ORIGIN_STORE_KEY, storageService);
        this._webviewOrigin = this._originStore.getOrigin('mcpApp', renderData.serverDefinitionId);
        this._mcpToolCallUI = this._register(this._instantiationService.createInstance(McpToolCallUI, renderData));
        this._height = ChatMcpAppModel_1.heightCache.get(this.toolInvocation) ?? 300;
        // Create the webview element
        this._webview = this._register(this._webviewService.createWebviewElement({
            origin: this._webviewOrigin,
            title: localize('mcpAppTitle', 'MCP App'),
            options: {
                purpose: "chatOutputItem" /* WebviewContentPurpose.ChatOutputItem */,
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
            await this._handleWebviewMessage(message);
        }));
        // Start loading the content
        this._loadContent();
    }
    /**
     * Gets the current height of the webview.
     */
    get height() {
        return this._height;
    }
    remount() {
        this._webview.reinitializeAfterDismount();
        this._announcedCapabilities = false;
    }
    /**
     * Retries loading the MCP App content.
     */
    retry() {
        this._loadState.set({ status: 'loading' }, undefined);
        this._loadContent();
    }
    /**
     * Loads the MCP App content into the webview.
     */
    async _loadContent() {
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
            this._latestCsp = resourceContent.csp;
            // Set the HTML content
            this._webview.setHtml(htmlWithCsp);
            this._loadState.set({ status: 'loaded' }, undefined);
        }
        catch (error) {
            this._logService.error('[MCP App] Error loading app:', error);
            this._loadState.set({ status: 'error', error: error }, undefined);
        }
    }
    /**
     * Injects a Content-Security-Policy meta tag into the HTML.
     */
    _injectPreamble({ html, csp }) {
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
        const cleanDomains = (s) => (s?.join(' ') || '')
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
			frame-src ${cleanDomains(csp?.frameDomains) || `'none'`};
			object-src 'none';
			base-uri ${cleanDomains(csp?.baseUriDomains) || `'self'`};
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
							if (event.origin === document.location.origin && event.source !== window) { event = setMessageSource(event, window.parent); }
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

				// Scroll boundary detection: bubble wheel events to parent when at scroll boundaries
				const shouldBubbleScroll = (event) => {
					// First check element-level scrolling (for elements with overflow: auto/scroll)
					for (let node = event.target; node; node = node.parentNode) {
						if (!(node instanceof Element)) {
							continue;
						}

						// Skip HTML and BODY - we check document-level scroll separately
						if (node === document.documentElement || node === document.body) {
							continue;
						}

						// Check if the element can actually scroll
						const overflow = window.getComputedStyle(node).overflowY;
						if (overflow === 'hidden' || overflow === 'visible') {
							continue;
						}

						// Scroll up: if there's content above (scrollTop > 0), don't bubble
						if (event.deltaY < 0 && node.scrollTop > 0) {
							return false;
						}

						// Scroll down: if there's content below, don't bubble
						if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
							// Account for rounding: scrollTop isn't rounded but scrollHeight/clientHeight are
							if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
								continue;
							}
							return false;
						}
					}

					// Check document-level scrolling (works even with overflow: visible on html/body)
					const docEl = document.documentElement;
					const scrollTop = window.scrollY || docEl.scrollTop || document.body.scrollTop || 0;
					const scrollHeight = Math.max(docEl.scrollHeight, document.body.scrollHeight);
					const clientHeight = docEl.clientHeight;
					const scrollableDistance = scrollHeight - clientHeight;

					if (scrollableDistance > 2) {
						// Document is scrollable
						if (event.deltaY < 0 && scrollTop > 0) {
							return false;
						}
						if (event.deltaY > 0 && scrollTop < scrollableDistance - 2) {
							return false;
						}
					}

					return true;
				};

				window.addEventListener('wheel', (event) => {
					if (event.defaultPrevented || !shouldBubbleScroll(event)) {
						return;
					}
					api.postMessage({
						method: 'ui/notifications/sandbox-wheel',
						params: {
							deltaMode: event.deltaMode,
							deltaX: event.deltaX,
							deltaY: event.deltaY,
							deltaZ: event.deltaZ,
						}
					});
				}, { passive: true });
			})();</script>
		`;
        return this._prependToHead(html, cspTag + postMessageRehoist);
    }
    _prependToHead(html, content) {
        // Try to inject into <head>
        const headMatch = html.match(/<head[^>]*>/i);
        if (headMatch) {
            const insertIndex = headMatch.index + headMatch[0].length;
            return html.slice(0, insertIndex) + '\n' + content + html.slice(insertIndex);
        }
        // If no <head>, try to inject after <html>
        const htmlMatch = html.match(/<html[^>]*>/i);
        if (htmlMatch) {
            const insertIndex = htmlMatch.index + htmlMatch[0].length;
            return html.slice(0, insertIndex) + '\n<head>' + content + '</head>' + html.slice(insertIndex);
        }
        // If no <html>, prepend
        return `<!DOCTYPE html><html><head>${content}</head><body>${html}</body></html>`;
    }
    /**
     * Handles incoming JSON-RPC messages from the webview.
     */
    async _handleWebviewMessage(message) {
        const request = message;
        const token = this._disposeCts.token;
        try {
            let result = {};
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
                case 'ui/download-file':
                    result = await this._handleDownloadFile(request.params);
                    break;
                case 'ui/request-display-mode':
                    // VS Code only supports inline display mode
                    result = { mode: 'inline' };
                    break;
                case 'ui/notifications/initialized':
                    break;
                case 'ui/message':
                    result = await this._handleUiMessage(request.params);
                    break;
                case 'ui/update-model-context':
                    result = await this._handleUpdateModelContext(request.params);
                    break;
                case 'notifications/message':
                    await this._mcpToolCallUI.log(request.params);
                    break;
                case 'ui/notifications/sandbox-wheel':
                    this._handleSandboxWheel(request.params);
                    break;
                default: {
                    softAssertNever(request);
                    const cast = request;
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
        }
        catch (error) {
            this._logService.error(`[MCP App] Error handling ${request.method}:`, error);
            if (hasKey(request, { id: true })) {
                const message = error instanceof Error ? error.message : String(error);
                await this._sendError(request.id, -32000, message);
            }
        }
    }
    /**
     * Handles the ui/initialize request from the MCP App View.
     */
    async _handleInitialize(_params) {
        this._announcedCapabilities = true;
        // "Host MUST send this notification with the complete tool arguments after the Guest UI's initialize request completes"
        // Cast to `any` due to https://github.com/modelcontextprotocol/ext-apps/issues/197
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let args;
        try {
            args = JSON.parse(this.renderData.input);
        }
        catch {
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
            }
            else if (this.toolInvocation.kind === 'toolInvocation') {
                const invocation = this.toolInvocation;
                this._register(autorunSelfDisposable(reader => {
                    const state = invocation.state.read(reader);
                    if (state.type === 4 /* IChatToolInvocation.StateKind.Completed */) {
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
                sandbox: {
                    csp: this._latestCsp,
                    permissions: { clipboardWrite: {} },
                },
                updateModelContext: {
                    audio: {},
                    image: {},
                    resourceLink: {},
                    resource: {},
                    structuredContent: {},
                },
                downloadFile: {},
            },
            hostContext: this.hostContext.get(),
        };
    }
    /**
     * Sends the tool result notification when the result becomes available.
     */
    _sendToolResult(resultDetails) {
        if (isToolResultInputOutputDetails(resultDetails) && resultDetails.mcpOutput) {
            this._sendNotification({
                method: 'ui/notifications/tool-result',
                params: resultDetails.mcpOutput,
            });
        }
    }
    async _handleUiMessage(params) {
        const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
        if (!widget) {
            return { isError: true };
        }
        if (!isFalsyOrWhitespace(widget.getInput())) {
            return { isError: true };
        }
        widget.setInput(params.content.filter(c => c.type === 'text').map(c => c.text).join('\n\n'));
        widget.attachmentModel.clearAndSetContext(...params.content.map((c, i) => {
            const id = `mcpui-${i}-${Date.now()}`;
            if (c.type === 'image') {
                return { kind: 'image', value: decodeBase64(c.data).buffer, id, name: 'Image' };
            }
            else if (c.type === 'resource_link') {
                const uri = McpResourceURI.fromServer({ id: this.renderData.serverDefinitionId, label: '' }, c.uri);
                return { kind: 'file', value: uri, id, name: basename(uri) };
            }
            else {
                return undefined;
            }
        }).filter(isDefined));
        widget.focusInput();
        return { isError: false };
    }
    async _handleUpdateModelContext(params) {
        const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
        if (!widget) {
            return {};
        }
        const idPrefix = `mcpui-context-${hash(this.renderData.serverDefinitionId)}-`;
        const toDelete = widget.attachmentModel.getAttachmentIDs();
        const idsToDelete = Array.from(toDelete).filter(id => id.startsWith(idPrefix));
        const entries = [];
        let entryIndex = 0;
        if (params.content) {
            for (const block of params.content) {
                const id = `${idPrefix}${entryIndex++}`;
                if (block.type === 'image') {
                    entries.push({
                        kind: 'image',
                        value: decodeBase64(block.data).buffer,
                        id,
                        name: 'Image',
                        mimeType: block.mimeType,
                    });
                }
                else if (block.type === 'resource_link') {
                    const uri = McpResourceURI.fromServer({ id: this.renderData.serverDefinitionId, label: '' }, block.uri);
                    entries.push({
                        kind: 'file',
                        value: uri,
                        id,
                        name: basename(uri),
                    });
                }
                else if (block.type === 'text') {
                    const preview = block.text.replaceAll(/\s+/g, ' ').trim();
                    const truncateTo = 20;
                    entries.push({
                        kind: 'generic',
                        value: block.text,
                        id,
                        tooltip: new MarkdownString().appendCodeblock('plaintext', block.text),
                        name: preview.length > truncateTo ? preview.slice(0, truncateTo) + '…' : preview,
                    });
                }
            }
        }
        if (params.structuredContent && Object.keys(params.structuredContent).length > 0) {
            const id = `${idPrefix}structured`;
            const value = JSON.stringify(params.structuredContent, null, 2);
            entries.push({
                kind: 'generic',
                value,
                tooltip: new MarkdownString().appendCodeblock('json', value),
                id,
                name: 'UI Data',
            });
        }
        widget.attachmentModel.updateContext(idsToDelete, entries);
        return {};
    }
    _handleSizeChanged(params) {
        if (params.height !== undefined && params.height !== this._height) {
            this._height = params.height;
            ChatMcpAppModel_1.heightCache.set(this.toolInvocation, params.height);
            this._onDidChangeHeight.fire();
        }
    }
    _handleSandboxWheel(params) {
        let defaultPrevented = false;
        const evt = {
            wheelDeltaX: params.deltaX,
            wheelDeltaY: -params.deltaY,
            wheelDelta: Math.abs(params.deltaY),
            deltaX: params.deltaX,
            deltaY: -params.deltaY,
            deltaZ: params.deltaZ,
            deltaMode: params.deltaMode,
            preventDefault: () => {
                defaultPrevented = true;
            },
            stopPropagation: () => { },
            get defaultPrevented() {
                return defaultPrevented;
            }
        };
        const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
        widget?.delegateScrollFromMouseWheelEvent(evt);
    }
    async _handleDownloadFile(params) {
        const newParts = [];
        let hadError = false;
        for (const content of params.contents) {
            try {
                if (content.type === 'resource') {
                    // EmbeddedResource — associate inline content with the chat response FS
                    const resource = content.resource;
                    const parsed = URI.parse(resource.uri);
                    const data = hasKey(resource, { text: true })
                        ? new TextEncoder().encode(resource.text)
                        : { base64: resource.blob };
                    const uri = this._chatResponseResourceFsProvider.associate(this.renderData.sessionResource, data, basename(parsed));
                    newParts.push({ kind: 'data', mimeType: resource.mimeType, uri });
                }
                else if (content.type === 'resource_link') {
                    // ResourceLink — create a part with an MCP resource URI, resolved lazily on save
                    const mcpUri = McpResourceURI.fromServer({ id: this.renderData.serverDefinitionId, label: '' }, content.uri);
                    newParts.push({ kind: 'data', mimeType: content.mimeType, uri: mcpUri });
                }
            }
            catch (error) {
                hadError = true;
                this._logService.warn('[MCP App] Failed to process ui/download-file content', error);
            }
        }
        if (newParts.length > 0) {
            const existing = this._downloadParts.get();
            this._downloadParts.set([...existing, ...newParts], undefined);
        }
        return hadError ? { isError: true } : {};
    }
    async _handleOpenLink(params) {
        const ok = await this._openerService.open(params.url);
        return { isError: !ok };
    }
    /**
     * Handles tools/call requests from the MCP App.
     */
    async _handleToolsCall(params, token) {
        if (!params?.name) {
            throw new Error('Missing tool name in tools/call request');
        }
        return this._mcpToolCallUI.callTool(params.name, params.arguments || {}, token);
    }
    /**
     * Handles resources/read requests from the MCP App.
     */
    async _handleResourcesRead(params, token) {
        if (!params?.uri) {
            throw new Error('Missing uri in resources/read request');
        }
        return this._mcpToolCallUI.readResource(params.uri, token);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async _sendResponse(id, result) {
        await this._webview.postMessage({
            jsonrpc: '2.0',
            id,
            result,
        });
    }
    async _sendError(id, code, message) {
        await this._webview.postMessage({
            jsonrpc: '2.0',
            id,
            error: { code, message },
        });
    }
    async _sendNotification(message) {
        await this._webview.postMessage({
            jsonrpc: '2.0',
            ...message,
        });
    }
    dispose() {
        this._disposeCts.dispose(true);
        super.dispose();
    }
};
ChatMcpAppModel = ChatMcpAppModel_1 = __decorate([
    __param(5, IInstantiationService),
    __param(6, IChatWidgetService),
    __param(7, IWebviewService),
    __param(8, IStorageService),
    __param(9, IChatResponseResourceFileSystemProvider),
    __param(10, ILogService),
    __param(11, IProductService),
    __param(12, IOpenerService)
], ChatMcpAppModel);
export { ChatMcpAppModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1jcEFwcE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdE1jcEFwcE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLDBDQUEwQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixFQUFlLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNsRixPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFP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