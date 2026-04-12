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
import { webContents } from 'electron';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IBrowserViewMainService } from '../../browserView/electron-main/browserViewMainService.js';
export const INativeBrowserElementsMainService = createDecorator('browserElementsMainService');
const MAX_CONSOLE_LOG_ENTRIES = 1000;
/** Stores captured console log entries, keyed by a locator string. */
const consoleLogStore = new Map();
function locatorKey(locator) {
    return locator.browserViewId ?? locator.webviewId;
}
let NativeBrowserElementsMainService = class NativeBrowserElementsMainService extends Disposable {
    constructor(windowsMainService, auxiliaryWindowsMainService, browserViewMainService) {
        super();
        this.windowsMainService = windowsMainService;
        this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
        this.browserViewMainService = browserViewMainService;
    }
    get windowId() { throw new Error('Not implemented in electron-main'); }
    async getConsoleLogs(windowId, locator) {
        const key = locatorKey(locator);
        if (!key) {
            return undefined;
        }
        const entries = consoleLogStore.get(key);
        if (!entries || entries.length === 0) {
            return undefined;
        }
        return entries.join('\n');
    }
    async startConsoleSession(windowId, token, locator, cancelAndDetachId) {
        const window = this.windowById(windowId);
        if (!window?.win) {
            return undefined;
        }
        const windowWebContents = window.win.webContents;
        // For BrowserView targets, listen to the console-message event directly
        // on the BrowserView's webContents. No CDP needed.
        let targetWebContents;
        if (locator.browserViewId) {
            targetWebContents = this.browserViewMainService.tryGetBrowserView(locator.browserViewId)?.webContents;
        }
        if (!targetWebContents) {
            return undefined;
        }
        const key = locatorKey(locator);
        if (!key) {
            return undefined;
        }
        // Initialize log store for this locator if it doesn't exist yet (don't clear on restart)
        if (!consoleLogStore.has(key)) {
            consoleLogStore.set(key, []);
        }
        const levelMap = { 0: 'log', 1: 'warning', 2: 'error' };
        const onConsoleMessage = (_event, level, message, _line, _sourceId) => {
            const levelName = levelMap[level] ?? 'log';
            const formatted = `[${levelName}] ${message}`;
            const current = consoleLogStore.get(key) ?? [];
            current.push(formatted);
            if (current.length > MAX_CONSOLE_LOG_ENTRIES) {
                current.splice(0, current.length - MAX_CONSOLE_LOG_ENTRIES);
            }
            consoleLogStore.set(key, current);
        };
        const cleanupListeners = () => {
            targetWebContents?.off('console-message', onConsoleMessage);
            targetWebContents?.off('destroyed', onTargetDestroyed);
            windowWebContents.off('ipc-message', onIpcMessage);
        };
        const onIpcMessage = (_event, channel, closedCancelAndDetachId) => {
            if (channel === `vscode:cancelConsoleSession${cancelAndDetachId}`) {
                if (cancelAndDetachId !== closedCancelAndDetachId) {
                    return;
                }
                cleanupListeners();
            }
        };
        const onTargetDestroyed = () => {
            cleanupListeners();
        };
        targetWebContents.on('console-message', onConsoleMessage);
        targetWebContents.on('destroyed', onTargetDestroyed);
        windowWebContents.on('ipc-message', onIpcMessage);
    }
    /**
     * Find the webview target that matches the given locator.
     * Checks either webviewId or browserViewId depending on what's provided.
     */
    async findWebviewTarget(debuggers, locator) {
        const { targetInfos } = await debuggers.sendCommand('Target.getTargets');
        if (locator.webviewId) {
            let extensionId = '';
            for (const targetInfo of targetInfos) {
                try {
                    const url = new URL(targetInfo.url);
                    if (url.searchParams.get('id') === locator.webviewId) {
                        extensionId = url.searchParams.get('extensionId') || '';
                        break;
                    }
                }
                catch (err) {
                    // ignore
                }
            }
            if (!extensionId) {
                return undefined;
            }
            // search for webview via search parameters
            const target = targetInfos.find((targetInfo) => {
                try {
                    const url = new URL(targetInfo.url);
                    const isLiveServer = extensionId === 'ms-vscode.live-server' && url.searchParams.get('serverWindowId') === locator.webviewId;
                    const isSimpleBrowser = extensionId === 'vscode.simple-browser' && url.searchParams.get('id') === locator.webviewId && url.searchParams.has('vscodeBrowserReqId');
                    if (isLiveServer || isSimpleBrowser) {
                        return true;
                    }
                    return false;
                }
                catch (e) {
                    return false;
                }
            });
            return target?.targetId;
        }
        if (locator.browserViewId) {
            const webContentsInstance = this.browserViewMainService.tryGetBrowserView(locator.browserViewId)?.webContents;
            const target = targetInfos.find((targetInfo) => {
                if (targetInfo.type !== 'page') {
                    return false;
                }
                return webContents.fromDevToolsTargetId(targetInfo.targetId) === webContentsInstance;
            });
            return target?.targetId;
        }
        return undefined;
    }
    async waitForWebviewTargets(debuggers, locator) {
        const start = Date.now();
        const timeout = 10000;
        while (Date.now() - start < timeout) {
            const targetId = await this.findWebviewTarget(debuggers, locator);
            if (targetId) {
                return targetId;
            }
            // Wait for a short period before checking again
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        debuggers.detach();
        return undefined;
    }
    async startDebugSession(windowId, token, locator, cancelAndDetachId) {
        const window = this.windowById(windowId);
        if (!window?.win) {
            return undefined;
        }
        // Find the simple browser webview
        const allWebContents = webContents.getAllWebContents();
        const simpleBrowserWebview = allWebContents.find(webContent => webContent.id === window.id);
        if (!simpleBrowserWebview) {
            return undefined;
        }
        const debuggers = simpleBrowserWebview.debugger;
        if (!debuggers.isAttached()) {
            debuggers.attach();
        }
        try {
            const matchingTargetId = await this.waitForWebviewTargets(debuggers, locator);
            if (!matchingTargetId) {
                if (debuggers.isAttached()) {
                    debuggers.detach();
                }
                throw new Error('No target found');
            }
        }
        catch (e) {
            if (debuggers.isAttached()) {
                debuggers.detach();
            }
            throw new Error('No target found');
        }
        window.win.webContents.on('ipc-message', async (event, channel, closedCancelAndDetachId) => {
            if (channel === `vscode:cancelCurrentSession${cancelAndDetachId}`) {
                if (cancelAndDetachId !== closedCancelAndDetachId) {
                    return;
                }
                if (debuggers.isAttached()) {
                    debuggers.detach();
                }
                if (window.win) {
                    window.win.webContents.removeAllListeners('ipc-message');
                }
            }
        });
    }
    async finishOverlay(debuggers, sessionId) {
        if (debuggers.isAttached() && sessionId) {
            await debuggers.sendCommand('Overlay.setInspectMode', {
                mode: 'none',
                highlightConfig: {
                    showInfo: false,
                    showStyles: false
                }
            }, sessionId);
            await debuggers.sendCommand('Overlay.hideHighlight', {}, sessionId);
            await debuggers.sendCommand('Overlay.disable', {}, sessionId);
            debuggers.detach();
        }
    }
    async getElementData(windowId, rect, token, locator, cancellationId) {
        const window = this.windowById(windowId);
        if (!window?.win) {
            return undefined;
        }
        // Find the simple browser webview
        const allWebContents = webContents.getAllWebContents();
        const simpleBrowserWebview = allWebContents.find(webContent => webContent.id === window.id);
        if (!simpleBrowserWebview) {
            return undefined;
        }
        const debuggers = simpleBrowserWebview.debugger;
        if (!debuggers.isAttached()) {
            debuggers.attach();
        }
        let targetSessionId = undefined;
        try {
            const targetId = await this.findWebviewTarget(debuggers, locator);
            const { sessionId } = await debuggers.sendCommand('Target.attachToTarget', {
                targetId: targetId,
                flatten: true,
            });
            targetSessionId = sessionId;
            await debuggers.sendCommand('DOM.enable', {}, sessionId);
            await debuggers.sendCommand('CSS.enable', {}, sessionId);
            await debuggers.sendCommand('Overlay.enable', {}, sessionId);
            await debuggers.sendCommand('Debugger.enable', {}, sessionId);
            await debuggers.sendCommand('Runtime.enable', {}, sessionId);
            await debuggers.sendCommand('Runtime.evaluate', {
                expression: `(function() {
							const style = document.createElement('style');
							style.id = '__pseudoBlocker__';
							style.textContent = '*::before, *::after { pointer-events: none !important; }';
							document.head.appendChild(style);
						})();`,
            }, sessionId);
            // slightly changed default CDP debugger inspect colors
            await debuggers.sendCommand('Overlay.setInspectMode', {
                mode: 'searchForNode',
                highlightConfig: {
                    showInfo: true,
                    showRulers: false,
                    showStyles: true,
                    showAccessibilityInfo: true,
                    showExtensionLines: false,
                    contrastAlgorithm: 'aa',
                    contentColor: { r: 173, g: 216, b: 255, a: 0.8 },
                    paddingColor: { r: 150, g: 200, b: 255, a: 0.5 },
                    borderColor: { r: 120, g: 180, b: 255, a: 0.7 },
                    marginColor: { r: 200, g: 220, b: 255, a: 0.4 },
                    eventTargetColor: { r: 130, g: 160, b: 255, a: 0.8 },
                    shapeColor: { r: 130, g: 160, b: 255, a: 0.8 },
                    shapeMarginColor: { r: 130, g: 160, b: 255, a: 0.5 },
                    gridHighlightConfig: {
                        rowGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
                        rowHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
                        columnGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
                        columnHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
                        rowLineColor: { r: 120, g: 180, b: 255 },
                        columnLineColor: { r: 120, g: 180, b: 255 },
                        rowLineDash: true,
                        columnLineDash: true
                    },
                    flexContainerHighlightConfig: {
                        containerBorder: {
                            color: { r: 120, g: 180, b: 255 },
                            pattern: 'solid'
                        },
                        itemSeparator: {
                            color: { r: 140, g: 190, b: 255 },
                            pattern: 'solid'
                        },
                        lineSeparator: {
                            color: { r: 140, g: 190, b: 255 },
                            pattern: 'solid'
                        },
                        mainDistributedSpace: {
                            hatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
                            fillColor: { r: 140, g: 190, b: 255, a: 0.4 }
                        },
                        crossDistributedSpace: {
                            hatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
                            fillColor: { r: 140, g: 190, b: 255, a: 0.4 }
                        },
                        rowGapSpace: {
                            hatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
                            fillColor: { r: 140, g: 190, b: 255, a: 0.4 }
                        },
                        columnGapSpace: {
                            hatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
                            fillColor: { r: 140, g: 190, b: 255, a: 0.4 }
                        }
                    },
                    flexItemHighlightConfig: {
                        baseSizeBox: {
                            hatchColor: { r: 130, g: 170, b: 255, a: 0.6 }
                        },
                        baseSizeBorder: {
                            color: { r: 120, g: 180, b: 255 },
                            pattern: 'solid'
                        },
                        flexibilityArrow: {
                            color: { r: 130, g: 190, b: 255 }
                        }
                    },
                },
            }, sessionId);
        }
        catch (e) {
            debuggers.detach();
            throw new Error('No target found', { cause: e });
        }
        if (!targetSessionId) {
            debuggers.detach();
            throw new Error('No target session id found');
        }
        const nodeData = await this.getNodeData(targetSessionId, debuggers, window.win, cancellationId);
        await this.finishOverlay(debuggers, targetSessionId);
        const zoomFactor = simpleBrowserWebview.getZoomFactor();
        const absoluteBounds = {
            x: rect.x + nodeData.bounds.x,
            y: rect.y + nodeData.bounds.y,
            width: nodeData.bounds.width,
            height: nodeData.bounds.height
        };
        const clippedBounds = {
            x: Math.max(absoluteBounds.x, rect.x),
            y: Math.max(absoluteBounds.y, rect.y),
            width: Math.max(0, Math.min(absoluteBounds.x + absoluteBounds.width, rect.x + rect.width) - Math.max(absoluteBounds.x, rect.x)),
            height: Math.max(0, Math.min(absoluteBounds.y + absoluteBounds.height, rect.y + rect.height) - Math.max(absoluteBounds.y, rect.y))
        };
        const scaledBounds = {
            x: clippedBounds.x * zoomFactor,
            y: clippedBounds.y * zoomFactor,
            width: clippedBounds.width * zoomFactor,
            height: clippedBounds.height * zoomFactor
        };
        return {
            outerHTML: nodeData.outerHTML,
            computedStyle: nodeData.computedStyle,
            bounds: scaledBounds,
            ancestors: nodeData.ancestors,
            attributes: nodeData.attributes,
            computedStyles: nodeData.computedStyles,
            dimensions: nodeData.dimensions,
            innerText: nodeData.innerText,
        };
    }
    async getFocusedElementData(windowId, rect, _token, locator, _cancellationId) {
        const window = this.windowById(windowId);
        if (!window?.win) {
            return undefined;
        }
        const allWebContents = webContents.getAllWebContents();
        const simpleBrowserWebview = allWebContents.find(webContent => webContent.id === window.id);
        if (!simpleBrowserWebview) {
            return undefined;
        }
        const debuggers = simpleBrowserWebview.debugger;
        if (!debuggers.isAttached()) {
            debuggers.attach();
        }
        let sessionId;
        try {
            const targetId = await this.findWebviewTarget(debuggers, locator);
            if (!targetId) {
                return undefined;
            }
            const attach = await debuggers.sendCommand('Target.attachToTarget', { targetId, flatten: true });
            sessionId = attach.sessionId;
            await debuggers.sendCommand('Runtime.enable', {}, sessionId);
            const { result } = await debuggers.sendCommand('Runtime.evaluate', {
                expression: `(() => {
					const el = document.activeElement;
					if (!el || el.nodeType !== 1) {
						return undefined;
					}
					const r = el.getBoundingClientRect();
					const attrs = {};
					for (let i = 0; i < el.attributes.length; i++) {
						attrs[el.attributes[i].name] = el.attributes[i].value;
					}
					const ancestors = [];
					let n = el;
					while (n && n.nodeType === 1) {
						const entry = { tagName: n.tagName.toLowerCase() };
						if (n.id) {
							entry.id = n.id;
						}
						if (typeof n.className === 'string' && n.className.trim().length > 0) {
							entry.classNames = n.className.trim().split(/\\s+/).filter(Boolean);
						}
						ancestors.unshift(entry);
						n = n.parentElement;
					}
					const css = getComputedStyle(el);
					const computedStyles = {};
					for (let i = 0; i < css.length; i++) {
						const name = css[i];
						computedStyles[name] = css.getPropertyValue(name);
					}
					const text = (el.innerText || '').trim();
					return {
						outerHTML: el.outerHTML,
						computedStyle: '',
						bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
						ancestors,
						attributes: attrs,
						computedStyles,
						dimensions: { top: r.top, left: r.left, width: r.width, height: r.height },
						innerText: text.length > 100 ? text.slice(0, 100) + '\\u2026' : text
					};
				})();`,
                returnByValue: true
            }, sessionId);
            const focusedData = result?.value;
            if (!focusedData) {
                return undefined;
            }
            const zoomFactor = simpleBrowserWebview.getZoomFactor();
            const absoluteBounds = {
                x: rect.x + focusedData.bounds.x,
                y: rect.y + focusedData.bounds.y,
                width: focusedData.bounds.width,
                height: focusedData.bounds.height
            };
            const clippedBounds = {
                x: Math.max(absoluteBounds.x, rect.x),
                y: Math.max(absoluteBounds.y, rect.y),
                width: Math.max(0, Math.min(absoluteBounds.x + absoluteBounds.width, rect.x + rect.width) - Math.max(absoluteBounds.x, rect.x)),
                height: Math.max(0, Math.min(absoluteBounds.y + absoluteBounds.height, rect.y + rect.height) - Math.max(absoluteBounds.y, rect.y))
            };
            return {
                outerHTML: focusedData.outerHTML,
                computedStyle: focusedData.computedStyle,
                bounds: {
                    x: clippedBounds.x * zoomFactor,
                    y: clippedBounds.y * zoomFactor,
                    width: clippedBounds.width * zoomFactor,
                    height: clippedBounds.height * zoomFactor
                },
                ancestors: focusedData.ancestors,
                attributes: focusedData.attributes,
                computedStyles: focusedData.computedStyles,
                dimensions: focusedData.dimensions,
                innerText: focusedData.innerText,
            };
        }
        finally {
            if (debuggers.isAttached()) {
                debuggers.detach();
            }
        }
    }
    async getNodeData(sessionId, debuggers, window, cancellationId) {
        return new Promise((resolve, reject) => {
            const onMessage = async (event, method, params) => {
                if (method === 'Overlay.inspectNodeRequested') {
                    debuggers.off('message', onMessage);
                    await debuggers.sendCommand('Runtime.evaluate', {
                        expression: `(() => {
										const style = document.getElementById('__pseudoBlocker__');
										if (style) style.remove();
									})();`,
                    }, sessionId);
                    const backendNodeId = params?.backendNodeId;
                    if (!backendNodeId) {
                        throw new Error('Missing backendNodeId in inspectNodeRequested event');
                    }
                    try {
                        await debuggers.sendCommand('DOM.getDocument', {}, sessionId);
                        const { nodeIds } = await debuggers.sendCommand('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [backendNodeId] }, sessionId);
                        if (!nodeIds || nodeIds.length === 0) {
                            throw new Error('Failed to get node IDs.');
                        }
                        const nodeId = nodeIds[0];
                        const { model } = await debuggers.sendCommand('DOM.getBoxModel', { nodeId }, sessionId);
                        if (!model) {
                            throw new Error('Failed to get box model.');
                        }
                        const content = model.content;
                        const margin = model.margin;
                        const x = Math.min(margin[0], content[0]);
                        const y = Math.min(margin[1], content[1]);
                        const width = Math.max(margin[2] - margin[0], content[2] - content[0]);
                        const height = Math.max(margin[5] - margin[1], content[5] - content[1]);
                        const matched = await debuggers.sendCommand('CSS.getMatchedStylesForNode', { nodeId }, sessionId);
                        if (!matched) {
                            throw new Error('Failed to get matched css.');
                        }
                        const formatted = this.formatMatchedStyles(matched);
                        const { outerHTML } = await debuggers.sendCommand('DOM.getOuterHTML', { nodeId }, sessionId);
                        if (!outerHTML) {
                            throw new Error('Failed to get outerHTML.');
                        }
                        // Extract additional structured data for rich hover
                        let ancestors;
                        let attributes;
                        let computedStyles;
                        let innerText;
                        try {
                            // Build ancestor chain using JavaScript evaluation (more reliable than DOM.describeNode for parent walking)
                            const { object: resolvedNode } = await debuggers.sendCommand('DOM.resolveNode', { nodeId }, sessionId);
                            if (resolvedNode?.objectId) {
                                const { result: ancestorResult } = await debuggers.sendCommand('Runtime.callFunctionOn', {
                                    objectId: resolvedNode.objectId,
                                    functionDeclaration: `function() {
										var chain = [];
										var el = this;
										while (el && el.nodeType === 1) {
											var entry = { tagName: el.tagName.toLowerCase() };
											if (el.id) { entry.id = el.id; }
											if (el.className && typeof el.className === 'string') {
												var cls = el.className.trim().split(/\\s+/).filter(Boolean);
												if (cls.length > 0) { entry.classNames = cls; }
											}
											chain.unshift(entry);
											el = el.parentElement;
										}
										return chain;
									}`,
                                    returnByValue: true,
                                }, sessionId);
                                if (ancestorResult?.value && Array.isArray(ancestorResult.value)) {
                                    ancestors = ancestorResult.value;
                                }
                                // Get attributes from the element
                                const { result: attrResult } = await debuggers.sendCommand('Runtime.callFunctionOn', {
                                    objectId: resolvedNode.objectId,
                                    functionDeclaration: `function() {
										var attrs = {};
										for (var i = 0; i < this.attributes.length; i++) {
											attrs[this.attributes[i].name] = this.attributes[i].value;
										}
										return attrs;
									}`,
                                    returnByValue: true,
                                }, sessionId);
                                if (attrResult?.value) {
                                    attributes = attrResult.value;
                                }
                                // Get inner text (truncated)
                                const { result: innerTextResult } = await debuggers.sendCommand('Runtime.callFunctionOn', {
                                    objectId: resolvedNode.objectId,
                                    functionDeclaration: 'function() { return this.innerText; }',
                                    returnByValue: true,
                                }, sessionId);
                                if (innerTextResult?.value) {
                                    const text = String(innerTextResult.value).trim();
                                    innerText = text.length > 100 ? text.substring(0, 100) + '\u2026' : text;
                                }
                            }
                            // Capture all computed styles for model-facing element context.
                            const { computedStyle: computedStyleArray } = await debuggers.sendCommand('CSS.getComputedStyleForNode', { nodeId }, sessionId);
                            if (computedStyleArray) {
                                computedStyles = {};
                                for (const prop of computedStyleArray) {
                                    if (prop.name && typeof prop.value === 'string') {
                                        computedStyles[prop.name] = prop.value;
                                    }
                                }
                            }
                        }
                        catch {
                            // Non-critical: if any enrichment fails, we still have the core data
                        }
                        // TODO: computedStyle here is actually the matched styles
                        resolve({
                            outerHTML,
                            computedStyle: formatted,
                            bounds: { x, y, width, height },
                            ancestors,
                            attributes,
                            computedStyles,
                            dimensions: { top: y, left: x, width, height },
                            innerText,
                        });
                    }
                    catch (err) {
                        debuggers.off('message', onMessage);
                        debuggers.detach();
                        reject(err);
                    }
                }
            };
            window.webContents.on('ipc-message', async (event, channel, closedCancellationId) => {
                if (channel === `vscode:cancelElementSelection${cancellationId}`) {
                    if (cancellationId !== closedCancellationId) {
                        return;
                    }
                    debuggers.off('message', onMessage);
                    await this.finishOverlay(debuggers, sessionId);
                    window.webContents.removeAllListeners('ipc-message');
                }
            });
            debuggers.on('message', onMessage);
        });
    }
    formatMatchedStyles(matched) {
        const lines = [];
        // inline
        if (matched.inlineStyle?.cssProperties?.length) {
            lines.push('/* Inline style */');
            lines.push('element {');
            for (const prop of matched.inlineStyle.cssProperties) {
                if (prop.name && prop.value) {
                    lines.push(`  ${prop.name}: ${prop.value};`);
                }
            }
            lines.push('}\n');
        }
        // matched
        if (matched.matchedCSSRules?.length) {
            for (const ruleEntry of matched.matchedCSSRules) {
                const rule = ruleEntry.rule;
                const selectors = rule.selectorList.selectors.map(s => s.text).join(', ');
                lines.push(`/* Matched Rule from ${rule.origin} */`);
                lines.push(`${selectors} {`);
                for (const prop of rule.style.cssProperties) {
                    if (prop.name && prop.value) {
                        lines.push(`  ${prop.name}: ${prop.value};`);
                    }
                }
                lines.push('}\n');
            }
        }
        // inherited rules
        if (matched.inherited?.length) {
            let level = 1;
            for (const inherited of matched.inherited) {
                const inline = inherited.inlineStyle;
                if (inline) {
                    lines.push(`/* Inherited from ancestor level ${level} (inline) */`);
                    lines.push('element {');
                    lines.push(inline.cssText);
                    lines.push('}\n');
                }
                const rules = inherited.matchedCSSRules || [];
                for (const ruleEntry of rules) {
                    const rule = ruleEntry.rule;
                    const selectors = rule.selectorList.selectors.map(s => s.text).join(', ');
                    lines.push(`/* Inherited from ancestor level ${level} (${rule.origin}) */`);
                    lines.push(`${selectors} {`);
                    for (const prop of rule.style.cssProperties) {
                        if (prop.name && prop.value) {
                            lines.push(`  ${prop.name}: ${prop.value};`);
                        }
                    }
                    lines.push('}\n');
                }
                level++;
            }
        }
        return '\n' + lines.join('\n');
    }
    windowById(windowId, fallbackCodeWindowId) {
        return this.codeWindowById(windowId) ?? this.auxiliaryWindowById(windowId) ?? this.codeWindowById(fallbackCodeWindowId);
    }
    codeWindowById(windowId) {
        if (typeof windowId !== 'number') {
            return undefined;
        }
        return this.windowsMainService.getWindowById(windowId);
    }
    auxiliaryWindowById(windowId) {
        if (typeof windowId !== 'number') {
            return undefined;
        }
        const contents = webContents.fromId(windowId);
        if (!contents) {
            return undefined;
        }
        return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
    }
};
NativeBrowserElementsMainService = __decorate([
    __param(0, IWindowsMainService),
    __param(1, IAuxiliaryWindowsMainService),
    __param(2, IBrowserViewMainService)
], NativeBrowserElementsMainService);
export { NativeBrowserElementsMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlQnJvd3NlckVsZW1lbnRzTWFpblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyRWxlbWVudHMvZWxlY3Ryb24tbWFpbi9uYXRpdmVCcm93c2VyRWxlbWVudHNNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUtoRyxPQUFPLEVBQWlCLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUd0RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRXBHLE1BQU0sQ0FBQyxNQUFNLGlDQUFpQyxHQUFHLGVBQWUsQ0FBb0MsNEJBQTRCLENBQUMsQ0FBQztBQWNsSSxNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQztBQUVyQyxzRUFBc0U7QUFDdEUsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLEVBQW9CLENBQUM7QUFFcEQsU0FBUyxVQUFVLENBQUMsT0FBOEI7SUFDakQsT0FBTyxPQUFPLENBQUMsYUFBYSxJQUFJLE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFDbkQsQ0FBQztBQUVNLElBQU0sZ0NBQWdDLEdBQXRDLE1BQU0sZ0NBQWlDLFNBQVEsVUFBVTtJQUcvRCxZQUN1QyxrQkFBdUMsRUFDOUIsMkJBQXlELEVBQzlELHNCQUErQztRQUV6RixLQUFLLEVBQUUsQ0FBQztRQUo4Qix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQzlCLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBOEI7UUFDOUQsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF5QjtJQUcxRixDQUFDO0lBRUQsSUFBSSxRQUFRLEtBQVksTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUU5RSxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQTRCLEVBQUUsT0FBOEI7UUFDaEYsTUFBTSxHQUFHLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNWLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsUUFBNEIsRUFBRSxLQUF3QixFQUFFLE9BQThCLEVBQUUsaUJBQTBCO1FBQzNJLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUNsQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQztRQUVqRCx3RUFBd0U7UUFDeEUsbURBQW1EO1FBQ25ELElBQUksaUJBQW1ELENBQUM7UUFDeEQsSUFBSSxPQUFPLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDM0IsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxXQUFXLENBQUM7UUFDdkcsQ0FBQztRQUVELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ1YsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELHlGQUF5RjtRQUN6RixJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQy9CLGVBQWUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBMkIsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDO1FBQ2hGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxNQUFzQixFQUFFLEtBQWEsRUFBRSxPQUFlLEVBQUUsS0FBYSxFQUFFLFNBQWlCLEVBQUUsRUFBRTtZQUNySCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO1lBQzNDLE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQzlDLE1BQU0sT0FBTyxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQy9DLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDeEIsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLHVCQUF1QixFQUFFLENBQUM7Z0JBQzlDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEdBQUcsdUJBQXVCLENBQUMsQ0FBQztZQUM3RCxDQUFDO1lBQ0QsZUFBZSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbkMsQ0FBQyxDQUFDO1FBRUYsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLEVBQUU7WUFDN0IsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFDNUQsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3ZELGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDcEQsQ0FBQyxDQUFDO1FBRUYsTUFBTSxZQUFZLEdBQUcsQ0FBQyxNQUFzQixFQUFFLE9BQWUsRUFBRSx1QkFBK0IsRUFBRSxFQUFFO1lBQ2pHLElBQUksT0FBTyxLQUFLLDhCQUE4QixpQkFBaUIsRUFBRSxFQUFFLENBQUM7Z0JBQ25FLElBQUksaUJBQWlCLEtBQUssdUJBQXVCLEVBQUUsQ0FBQztvQkFDbkQsT0FBTztnQkFDUixDQUFDO2dCQUNELGdCQUFnQixFQUFFLENBQUM7WUFDcEIsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLE1BQU0saUJBQWlCLEdBQUcsR0FBRyxFQUFFO1lBQzlCLGdCQUFnQixFQUFFLENBQUM7UUFDcEIsQ0FBQyxDQUFDO1FBRUYsaUJBQWlCLENBQUMsRUFBRSxDQUFDLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDMUQsaUJBQWlCLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3JELGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVEOzs7T0FHRztJQUNLLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxTQUE0QixFQUFFLE9BQThCO1FBQzNGLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxNQUFNLFNBQVMsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUV6RSxJQUFJLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN2QixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7WUFDckIsS0FBSyxNQUFNLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDdEMsSUFBSSxDQUFDO29CQUNKLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDcEMsSUFBSSxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7d0JBQ3RELFdBQVcsR0FBRyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ3hELE1BQU07b0JBQ1AsQ0FBQztnQkFDRixDQUFDO2dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2QsU0FBUztnQkFDVixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDbEIsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUVELDJDQUEyQztZQUMzQyxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsVUFBMkIsRUFBRSxFQUFFO2dCQUMvRCxJQUFJLENBQUM7b0JBQ0osTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNwQyxNQUFNLFlBQVksR0FBRyxXQUFXLEtBQUssdUJBQXVCLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxPQUFPLENBQUMsU0FBUyxDQUFDO29CQUM3SCxNQUFNLGVBQWUsR0FBRyxXQUFXLEtBQUssdUJBQXVCLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssT0FBTyxDQUFDLFNBQVMsSUFBSSxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO29CQUNsSyxJQUFJLFlBQVksSUFBSSxlQUFlLEVBQUUsQ0FBQzt3QkFDckMsT0FBTyxJQUFJLENBQUM7b0JBQ2IsQ0FBQztvQkFDRCxPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO2dCQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ1osT0FBTyxLQUFLLENBQUM7Z0JBQ2QsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxNQUFNLEVBQUUsUUFBUSxDQUFDO1FBQ3pCLENBQUM7UUFFRCxJQUFJLE9BQU8sQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUMzQixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsV0FBVyxDQUFDO1lBQzlHLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUE4QyxFQUFFLEVBQUU7Z0JBQ2xGLElBQUksVUFBVSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztvQkFDaEMsT0FBTyxLQUFLLENBQUM7Z0JBQ2QsQ0FBQztnQkFFRCxPQUFPLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEtBQUssbUJBQW1CLENBQUM7WUFDdEYsQ0FBQyxDQUFDLENBQUM7WUFDSCxPQUFPLE1BQU0sRUFBRSxRQUFRLENBQUM7UUFDekIsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLENBQUMscUJBQXFCLENBQUMsU0FBNEIsRUFBRSxPQUE4QjtRQUN2RixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekIsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBRXRCLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEtBQUssR0FBRyxPQUFPLEVBQUUsQ0FBQztZQUNyQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEUsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxPQUFPLFFBQVEsQ0FBQztZQUNqQixDQUFDO1lBRUQsZ0RBQWdEO1lBQ2hELE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUVELFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNuQixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFFBQTRCLEVBQUUsS0FBd0IsRUFBRSxPQUE4QixFQUFFLGlCQUEwQjtRQUN6SSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUM7WUFDbEIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLGNBQWMsR0FBRyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN2RCxNQUFNLG9CQUFvQixHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU1RixJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUMzQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFDO1FBQ2hELElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUM3QixTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDcEIsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzlFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN2QixJQUFJLFNBQVMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO29CQUM1QixTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3BCLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3BDLENBQUM7UUFFRixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLElBQUksU0FBUyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7Z0JBQzVCLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNwQixDQUFDO1lBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLEVBQUU7WUFDMUYsSUFBSSxPQUFPLEtBQUssOEJBQThCLGlCQUFpQixFQUFFLEVBQUUsQ0FBQztnQkFDbkUsSUFBSSxpQkFBaUIsS0FBSyx1QkFBdUIsRUFBRSxDQUFDO29CQUNuRCxPQUFPO2dCQUNSLENBQUM7Z0JBQ0QsSUFBSSxTQUFTLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztvQkFDNUIsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNwQixDQUFDO2dCQUNELElBQUksTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO29CQUNoQixNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQTRCLEVBQUUsU0FBNkI7UUFDOUUsSUFBSSxTQUFTLENBQUMsVUFBVSxFQUFFLElBQUksU0FBUyxFQUFFLENBQUM7WUFDekMsTUFBTSxTQUFTLENBQUMsV0FBVyxDQUFDLHdCQUF3QixFQUFFO2dCQUNyRCxJQUFJLEVBQUUsTUFBTTtnQkFDWixlQUFlLEVBQUU7b0JBQ2hCLFFBQVEsRUFBRSxLQUFLO29CQUNmLFVBQVUsRUFBRSxLQUFLO2lCQUNqQjthQUNELEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDZCxNQUFNLFNBQVMsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sU0FBUyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDOUQsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3BCLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUE0QixFQUFFLElBQWdCLEVBQUUsS0FBd0IsRUFBRSxPQUE4QixFQUFFLGNBQXVCO1FBQ3JKLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUNsQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLE1BQU0sY0FBYyxHQUFHLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3ZELE1BQU0sb0JBQW9CLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRTVGLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzNCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLENBQUM7UUFDaEQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQzdCLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBRUQsSUFBSSxlQUFlLEdBQXVCLFNBQVMsQ0FBQztRQUNwRCxJQUFJLENBQUM7WUFDSixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE1BQU0sU0FBUyxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDMUUsUUFBUSxFQUFFLFFBQVE7Z0JBQ2xCLE9BQU8sRUFBRSxJQUFJO2FBQ2IsQ0FBQyxDQUFDO1lBRUgsZUFBZSxHQUFHLFNBQVMsQ0FBQztZQUU1QixNQUFNLFNBQVMsQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RCxNQUFNLFNBQVMsQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RCxNQUFNLFNBQVMsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzdELE1BQU0sU0FBUyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDOUQsTUFBTSxTQUFTLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUU3RCxNQUFNLFNBQVMsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUU7Z0JBQy9DLFVBQVUsRUFBRTs7Ozs7WUFLSjthQUNSLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFZCx1REFBdUQ7WUFDdkQsTUFBTSxTQUFTLENBQUMsV0FBVyxDQUFDLHdCQUF3QixFQUFFO2dCQUNyRCxJQUFJLEVBQUUsZUFBZTtnQkFDckIsZUFBZSxFQUFFO29CQUNoQixRQUFRLEVBQUUsSUFBSTtvQkFDZCxVQUFVLEVBQUUsS0FBSztvQkFDakIsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLHFCQUFxQixFQUFFLElBQUk7b0JBQzNCLGtCQUFrQixFQUFFLEtBQUs7b0JBQ3pCLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLFlBQVksRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7b0JBQ2hELFlBQVksRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7b0JBQ2hELFdBQVcsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7b0JBQy9DLFdBQVcsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7b0JBQy9DLGdCQUFnQixFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtvQkFDcEQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtvQkFDOUMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO29CQUNwRCxtQkFBbUIsRUFBRTt3QkFDcEIsV0FBVyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTt3QkFDL0MsYUFBYSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTt3QkFDakQsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTt3QkFDbEQsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO3dCQUNwRCxZQUFZLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTt3QkFDeEMsZUFBZSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7d0JBQzNDLFdBQVcsRUFBRSxJQUFJO3dCQUNqQixjQUFjLEVBQUUsSUFBSTtxQkFDcEI7b0JBQ0QsNEJBQTRCLEVBQUU7d0JBQzdCLGVBQWUsRUFBRTs0QkFDaEIsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7NEJBQ2pDLE9BQU8sRUFBRSxPQUFPO3lCQUNoQjt3QkFDRCxhQUFhLEVBQUU7NEJBQ2QsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7NEJBQ2pDLE9BQU8sRUFBRSxPQUFPO3lCQUNoQjt3QkFDRCxhQUFhLEVBQUU7NEJBQ2QsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7NEJBQ2pDLE9BQU8sRUFBRSxPQUFPO3lCQUNoQjt3QkFDRCxvQkFBb0IsRUFBRTs0QkFDckIsVUFBVSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTs0QkFDOUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTt5QkFDN0M7d0JBQ0QscUJBQXFCLEVBQUU7NEJBQ3RCLFVBQVUsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7NEJBQzlDLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7eUJBQzdDO3dCQUNELFdBQVcsRUFBRTs0QkFDWixVQUFVLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFOzRCQUM5QyxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO3lCQUM3Qzt3QkFDRCxjQUFjLEVBQUU7NEJBQ2YsVUFBVSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTs0QkFDOUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTt5QkFDN0M7cUJBQ0Q7b0JBQ0QsdUJBQXVCLEVBQUU7d0JBQ3hCLFdBQVcsRUFBRTs0QkFDWixVQUFVLEVBQUUsRUFBRSxDQUFDLEVBQUUs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