/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElementData, IElementAncestor, INativeBrowserElementsService, IBrowserTargetLocator } from '../common/browserElements.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IRectangle } from '../../window/common/window.js';
import { BrowserWindow, webContents } from 'electron';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { AddFirstParameterToFunctions } from '../../../base/common/types.js';
import { IBrowserViewMainService } from '../../browserView/electron-main/browserViewMainService.js';

export const INativeBrowserElementsMainService = createDecorator<INativeBrowserElementsMainService>('browserElementsMainService');
export interface INativeBrowserElementsMainService extends AddFirstParameterToFunctions<INativeBrowserElementsService, Promise<unknown> /* only methods, not events */, number | undefined /* window ID */> { }

interface NodeDataResponse {
	outerHTML: string;
	computedStyle: string;
	bounds: IRectangle;
	ancestors?: IElementAncestor[];
	attributes?: Record<string, string>;
	computedStyles?: Record<string, string>;
	dimensions?: { top: number; left: number; width: number; height: number };
	innerText?: string;
}

const MAX_CONSOLE_LOG_ENTRIES = 1000;

/** Stores captured console log entries, keyed by a locator string. */
const consoleLogStore = new Map<string, string[]>();

function locatorKey(locator: IBrowserTargetLocator): string | undefined {
	return locator.browserViewId ?? locator.webviewId;
}

export class NativeBrowserElementsMainService extends Disposable implements INativeBrowserElementsMainService {
	_serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService,
		@IBrowserViewMainService private readonly browserViewMainService: IBrowserViewMainService
	) {
		super();
	}

	get windowId(): never { throw new Error('Not implemented in electron-main'); }

	async getConsoleLogs(windowId: number | undefined, locator: IBrowserTargetLocator): Promise<string | undefined> {
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

	async startConsoleSession(windowId: number | undefined, token: CancellationToken, locator: IBrowserTargetLocator, cancelAndDetachId?: number): Promise<void> {
		const window = this.windowById(windowId);
		if (!window?.win) {
			return undefined;
		}
		const windowWebContents = window.win.webContents;

		// For BrowserView targets, listen to the console-message event directly
		// on the BrowserView's webContents. No CDP needed.
		let targetWebContents: Electron.WebContents | undefined;
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

		const levelMap: Record<number, string> = { 0: 'log', 1: 'warning', 2: 'error' };
		const onConsoleMessage = (_event: Electron.Event, level: number, message: string, _line: number, _sourceId: string) => {
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

		const onIpcMessage = (_event: Electron.Event, channel: string, closedCancelAndDetachId: number) => {
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
		token.onCancellationRequested(cleanupListeners);
	}

	/**
	 * Find the webview target that matches the given locator.
	 * Checks either webviewId or browserViewId depending on what's provided.
	 */
	private async findWebviewTarget(debuggers: Electron.Debugger, locator: IBrowserTargetLocator): Promise<string | undefined> {
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
				} catch (err) {
					// ignore
				}
			}
			if (!extensionId) {
				return undefined;
			}

			// search for webview via search parameters
			const target = targetInfos.find((targetInfo: { url: string }) => {
				try {
					const url = new URL(targetInfo.url);
					const isLiveServer = extensionId === 'ms-vscode.live-server' && url.searchParams.get('serverWindowId') === locator.webviewId;
					const isSimpleBrowser = extensionId === 'vscode.simple-browser' && url.searchParams.get('id') === locator.webviewId && url.searchParams.has('vscodeBrowserReqId');
					if (isLiveServer || isSimpleBrowser) {
						return true;
					}
					return false;
				} catch (e) {
					return false;
				}
			});
			return target?.targetId;
		}

		if (locator.browserViewId) {
			const webContentsInstance = this.browserViewMainService.tryGetBrowserView(locator.browserViewId)?.webContents;
			const target = targetInfos.find((targetInfo: { targetId: string; type: string }) => {
				if (targetInfo.type !== 'page') {
					return false;
				}

				return webContents.fromDevToolsTargetId(targetInfo.targetId) === webContentsInstance;
			});
			return target?.targetId;
		}

		return undefined;
	}

	async waitForWebviewTargets(debuggers: Electron.Debugger, locator: IBrowserTargetLocator): Promise<string | undefined> {
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

	async startDebugSession(windowId: number | undefined, token: CancellationToken, locator: IBrowserTargetLocator, cancelAndDetachId?: number): Promise<void> {
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

		} catch (e) {
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

	async finishOverlay(debuggers: Electron.Debugger, sessionId: string | undefined): Promise<void> {
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

	async getElementData(windowId: number | undefined, rect: IRectangle, token: CancellationToken, locator: IBrowserTargetLocator, cancellationId?: number): Promise<IElementData | undefined> {
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

		let targetSessionId: string | undefined = undefined;
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
		} catch (e) {
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

	async getNodeData(sessionId: string, debuggers: Electron.Debugger, window: BrowserWindow, cancellationId?: number): Promise<NodeDataResponse> {
		return new Promise((resolve, reject) => {
			const onMessage = async (event: Electron.Event, method: string, params: { backendNodeId: number }) => {
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
						let ancestors: IElementAncestor[] | undefined;
						let attributes: Record<string, string> | undefined;
						let computedStyles: Record<string, string> | undefined;
						let innerText: string | undefined;

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
						} catch {
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
					} catch (err) {
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

	formatMatchedStyles(matched: { inlineStyle?: { cssProperties?: Array<{ name: string; value: string }> }; matchedCSSRules?: Array<{ rule: { selectorList: { selectors: Array<{ text: string }> }; origin: string; style: { cssProperties: Array<{ name: string; value: string }> } } }>; inherited?: Array<{ inlineStyle?: { cssText: string }; matchedCSSRules?: Array<{ rule: { selectorList: { selectors: Array<{ text: string }> }; origin: string; style: { cssProperties: Array<{ name: string; value: string }> } } }> }> }): string {
		const lines: string[] = [];

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

	private windowById(windowId: number | undefined, fallbackCodeWindowId?: number): ICodeWindow | IAuxiliaryWindow | undefined {
		return this.codeWindowById(windowId) ?? this.auxiliaryWindowById(windowId) ?? this.codeWindowById(fallbackCodeWindowId);
	}

	private codeWindowById(windowId: number | undefined): ICodeWindow | undefined {
		if (typeof windowId !== 'number') {
			return undefined;
		}

		return this.windowsMainService.getWindowById(windowId);
	}

	private auxiliaryWindowById(windowId: number | undefined): IAuxiliaryWindow | undefined {
		if (typeof windowId !== 'number') {
			return undefined;
		}

		const contents = webContents.fromId(windowId);
		if (!contents) {
			return undefined;
		}

		return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
	}
}
