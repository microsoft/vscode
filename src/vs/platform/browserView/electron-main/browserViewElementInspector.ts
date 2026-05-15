/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { browserViewIsolatedWorldId, IElementData, IElementAncestor, IBrowserViewTheme } from '../common/browserView.js';
import { collapseToShorthands, formatMatchedStyles, keyComputedProperties, type IMatchedStyles } from '../common/cssHelpers.js';
import { ICDPConnection } from '../common/cdp/types.js';
import type { BrowserView } from './browserView.js';

type Quad = [number, number, number, number, number, number, number, number];

interface IBoxModel {
	content: Quad;
	padding: Quad;
	border: Quad;
	margin: Quad;
	width: number;
	height: number;
}

interface INode {
	nodeId: number;
	backendNodeId: number;
	parentId?: number;
	localName: string;
	attributes: string[];
	children?: INode[];
	pseudoElements?: INode[];
}

interface ILayoutMetricsResult {
	cssVisualViewport?: {
		scale?: number;
	};
}

interface IActiveSelection extends IDisposable {
	readonly isCDP: boolean;
}

export interface IElementHandle extends IDisposable {
	addToChat(): Promise<void>;
	highlight(): Promise<void>;
	hideHighlight(): Promise<void>;
}

/**
 * Well-known ids understood by `__vscode_helpers.getElement(id)` in
 * `preload-browserView.ts`. Any other string is treated as the id of a
 * dynamically tracked element.
 */
export const enum BrowserViewInspectElementId {
	/** The page's `document.activeElement`. */
	Active = 'active',
	/** The element targeted by the most recent `contextmenu` event. */
	ContextMenuTarget = 'context-menu-target',
}

function useScopedDisposal() {
	const store = new DisposableStore() as DisposableStore & { [Symbol.dispose](): void };
	store[Symbol.dispose] = () => store.dispose();
	return store;
}

/**
 * Manages element inspection on a browser view.
 *
 * Attaches a persistent CDP session in the constructor; methods wait for
 * it to be ready before issuing commands.
 */
export class BrowserViewElementInspector extends Disposable {

	private readonly _connectionPromise: Promise<ICDPConnection>;

	private readonly _onDidSelectElement = this._register(new Emitter<IElementData>());
	readonly onDidSelectElement: Event<IElementData> = this._onDidSelectElement.event;

	private readonly _onDidChangeElementSelectionActive = this._register(new Emitter<boolean>());
	readonly onDidChangeElementSelectionActive: Event<boolean> = this._onDidChangeElementSelectionActive.event;

	private _elementSelectionActive = false;
	get isElementSelectionActive(): boolean { return this._elementSelectionActive; }

	private readonly _activeSelection = this._register(new MutableDisposable<IActiveSelection>());
	private _theme: IBrowserViewTheme = {};

	constructor(private readonly browser: BrowserView) {
		super();
		this._connectionPromise = this._createConnection();
		this._registerListeners().catch(() => { });
	}

	private async _createConnection(): Promise<ICDPConnection> {
		const conn = await this.browser.debugger.attach();

		try {
			// Initialize CDP domains up-front rather than during selection:
			// some (e.g. CSS.enable) hang if sent while the debugger is paused,
			// but succeed when enabled before any pause.
			await conn.sendCommand('DOM.enable');
			await conn.sendCommand('Overlay.enable');
			await conn.sendCommand('CSS.enable');
			await conn.sendCommand('Runtime.enable');
		} catch (error) {
			conn.dispose();
			throw error;
		}

		if (this._store.isDisposed) {
			conn.dispose();
			throw new Error('Inspector disposed before connection was ready');
		}
		this._register(conn);

		return conn;
	}

	private async _registerListeners(): Promise<void> {
		const webContents = this.browser.webContents;
		const onPicked = async (_event: unknown, pickId: string) => {
			if (!pickId) {
				return;
			}

			this._activeSelection.clear();

			try {
				const handle = await this.getElementHandle(pickId);
				await handle?.addToChat();
			} catch {
				// Best effort; user can re-pick.
			}
		};
		webContents.ipc.on('vscode:browserView:elementPicked', onPicked);
		this._register({
			dispose: () => webContents.ipc.removeListener('vscode:browserView:elementPicked', onPicked)
		});
		const onPickStopped = () => {
			if (this._activeSelection.value) {
				this._elementSelectionActive = false;
				this._onDidChangeElementSelectionActive.fire(false);
				this._activeSelection.clearAndLeak();
			}
		};
		webContents.ipc.on('vscode:browserView:elementPickStopped', onPickStopped);
		this._register({
			dispose: () => webContents.ipc.removeListener('vscode:browserView:elementPickStopped', onPickStopped)
		});

		// Navigation to a new document destroys the preload's page-side overlay
		// and resets the CDP inspect mode. Clear the active selection so the
		// workbench reflects the actual state.
		const onNavigated = () => this._activeSelection.clear();
		webContents.on('did-navigate', onNavigated);
		this._register({
			dispose: () => webContents.removeListener('did-navigate', onNavigated)
		});

		const connection = await this._connectionPromise;
		this._register(connection.onEvent(async (event) => {
			if (event.method !== 'Overlay.inspectNodeRequested') {
				return;
			}

			if (!this._activeSelection.value?.isCDP) {
				return;
			}

			const params = event.params as { backendNodeId: number };
			if (!params?.backendNodeId) {
				return;
			}

			this._activeSelection.clear();

			try {
				const nodeData = await extractNodeData(connection, { backendNodeId: params.backendNodeId });
				this._onDidSelectElement.fire({
					...nodeData,
					url: this.browser.getURL()
				});
			} catch (err) {
				// Best effort; ignore errors and let the user try again if they want.
			}
		}));

		webContents.on('ipc-message', async (event, channel) => {
			if (channel === 'vscode:browserView:preloadReady' && event.senderFrame === webContents.mainFrame) {
				this.setTheme(this._theme);
			}
		});
		this._register({
			dispose: () => webContents.removeAllListeners('ipc-message')
		});
	}

	setTheme(theme: IBrowserViewTheme): void {
		this._theme = theme;
		const webContents = this.browser.webContents;
		const themeJson = JSON.stringify(theme);
		webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [
			{ code: `window.browserViewAPI?.setTheme?.(${themeJson})` }
		]).catch(() => { /* best effort — page may not be loaded yet */ });
	}

	/**
	 * Toggle element selection mode on the browser view.
	 *
	 * When enabled, mounts a page-side overlay (see `preload-browserView.ts`) that
	 * lets the user click an element or drag a region (region → deepest common
	 * ancestor). When the debugger is paused, falls back to Chromium's built-in
	 * `Overlay.setInspectMode`.
	 *
	 * Each pick fires {@link onDidSelectElement}; state changes are delivered via
	 * {@link onDidChangeElementSelectionActive}.
	 *
	 * @param enabled Whether to enable or disable. Omit to toggle.
	 */
	async toggleElementSelection(enabled?: boolean): Promise<void> {
		const newEnabled = enabled ?? !this._elementSelectionActive;
		if (newEnabled === this._elementSelectionActive) {
			return;
		}

		if (!newEnabled) {
			this._activeSelection.clear();
			return;
		}

		const useCDP = this.browser.debugger.isPaused;
		const start = useCDP ? async () => {
			const connection = await this._connectionPromise;
			await connection.sendCommand('Overlay.setInspectMode', {
				mode: 'searchForNode',
				highlightConfig: inspectHighlightConfig,
			});
		} : async () => {
			const webContents = this.browser.webContents;
			const started = await webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [
				{ code: `window.browserViewAPI?.pickElement?.start?.() ?? false` }
			]);
			if (!started) {
				throw new Error('Preload element picker not available');
			}
		};
		const stop = useCDP ? async () => {
			const connection = await this._connectionPromise;
			await connection.sendCommand('Overlay.setInspectMode', {
				mode: 'none',
				highlightConfig: { showInfo: false, showStyles: false }
			});
			await connection.sendCommand('Overlay.hideHighlight');
		} : async () => {
			const webContents = this.browser.webContents;
			await webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [
				{ code: 'window.browserViewAPI?.pickElement?.stop?.()' }
			]);
		};

		const selection: IActiveSelection = {
			isCDP: useCDP,
			dispose: () => {
				if (this._activeSelection.value === selection) {
					this._elementSelectionActive = false;
					this._onDidChangeElementSelectionActive.fire(false);
					this._activeSelection.clearAndLeak();
					void stop().catch(() => { /* best-effort cleanup */ });
				}
			}
		};
		this._activeSelection.value = selection;

		try {
			await start();
			if (this._activeSelection.value === selection) {
				this._elementSelectionActive = true;
				this._onDidChangeElementSelectionActive.fire(true);
			}
		} catch {
			this._activeSelection.clear();
		}
	}

	/**
	 * Resolve a handle to the element identified by `id`.
	 *
	 * `id` is interpreted by `__vscode_helpers.getElement(id)` in the page
	 * preload (see {@link BrowserViewSelectedElementId} for well-known values).
	 * Returns `undefined` if no element is found.
	 */
	async getElementHandle(id: string): Promise<IElementHandle | undefined> {
		const connection = await this._connectionPromise;

		const { result } = await connection.sendCommand('Runtime.evaluate', {
			expression: `window.__vscode_helpers?.getElement(${JSON.stringify(id)})`,
			returnByValue: false,
		}) as { result: { objectId?: string } };

		if (!result?.objectId) {
			return undefined;
		}

		const objectId = result.objectId;
		const elementId = id;
		let disposed = false;

		return {
			addToChat: async () => {
				const nodeData = await extractNodeData(connection, { objectId });
				this._onDidSelectElement.fire({
					...nodeData,
					url: this.browser.getURL()
				});
			},
			highlight: async () => {
				const webContents = this.browser.webContents;
				await webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [
					{ code: `window.browserViewAPI?.highlightElement?.(${JSON.stringify(elementId)})` }
				]);
			},
			hideHighlight: async () => {
				const webContents = this.browser.webContents;
				await webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [
					{ code: 'window.browserViewAPI?.hideHighlight?.()' }
				]);
			},
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				const webContents = this.browser.webContents;
				void webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [
					{ code: 'window.browserViewAPI?.hideHighlight?.()' }
				]).catch(() => { /* best effort */ });
			}
		};
	}

	async getVisualViewportScale(): Promise<number> {
		try {
			const connection = await this._connectionPromise;
			const result = await connection.sendCommand('Page.getLayoutMetrics') as ILayoutMetricsResult;
			if (typeof result.cssVisualViewport?.scale === 'number') {
				const scale = Number(result.cssVisualViewport.scale);
				if (Number.isFinite(scale) && scale > 0) {
					return scale;
				}
			}
		} catch {
			// Ignore execution errors while loading and use defaults.
		}

		return 1;
	}
}

async function extractNodeData(connection: ICDPConnection, id: { backendNodeId?: number; objectId?: string }): Promise<IElementData> {
	using store = useScopedDisposal();

	const discoveredNodesByNodeId: Record<number, INode> = {};
	store.add(connection.onEvent(event => {
		if (event.method === 'DOM.setChildNodes') {
			const { nodes } = event.params as { nodes: INode[] };
			for (const node of nodes) {
				discoveredNodesByNodeId[node.nodeId] = node;
				if (node.children) {
					for (const child of node.children) {
						discoveredNodesByNodeId[child.nodeId] = {
							...child,
							parentId: node.nodeId
						};
					}
				}
				if (node.pseudoElements) {
					for (const pseudo of node.pseudoElements) {
						discoveredNodesByNodeId[pseudo.nodeId] = {
							...pseudo,
							parentId: node.nodeId
						};
					}
				}
			}
		}
	}));

	await connection.sendCommand('DOM.getDocument');

	const { node } = await connection.sendCommand('DOM.describeNode', id) as { node: INode };
	if (!node) {
		throw new Error('Failed to describe node.');
	}
	let nodeId = node.nodeId;
	if (!nodeId) {
		const { nodeIds } = await connection.sendCommand('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [node.backendNodeId] }) as { nodeIds: number[] };
		if (!nodeIds?.length) {
			throw new Error('Failed to get node ID.');
		}
		nodeId = nodeIds[0];
	}

	const { model } = await connection.sendCommand('DOM.getBoxModel', { nodeId }) as { model: IBoxModel };
	if (!model) {
		throw new Error('Failed to get box model.');
	}

	const content = model.content;
	const margin = model.margin;
	const x = Math.min(margin[0], content[0]);
	const y = Math.min(margin[1], content[1]);
	const width = Math.max(margin[2] - margin[0], content[2] - content[0]);
	const height = Math.max(margin[5] - margin[1], content[5] - content[1]);

	const matched = await connection.sendCommand('CSS.getMatchedStylesForNode', { nodeId });
	if (!matched) {
		throw new Error('Failed to get matched css.');
	}

	const { rulesText, referencedVars, authorPropertyNames, userAgentPropertyNames } = formatMatchedStyles(matched as IMatchedStyles);
	const { outerHTML } = await connection.sendCommand('DOM.getOuterHTML', { nodeId }) as { outerHTML: string };
	if (!outerHTML) {
		throw new Error('Failed to get outerHTML.');
	}

	const attributes = attributeArrayToRecord(node.attributes);

	const ancestors: IElementAncestor[] = [];
	let currentNode: INode | undefined = discoveredNodesByNodeId[nodeId] ?? node;
	while (currentNode) {
		const attributes = attributeArrayToRecord(currentNode.attributes);
		ancestors.unshift({
			tagName: currentNode.localName,
			id: attributes.id,
			classNames: attributes.class?.trim().split(/\s+/).filter(Boolean)
		});
		currentNode = currentNode.parentId ? discoveredNodesByNodeId[currentNode.parentId] : undefined;
	}

	// Build the computed style string and filtered computedStyles record
	let computedStyle = rulesText;
	let computedStyles: Record<string, string> | undefined;
	try {
		const { computedStyle: computedStyleArray } = await connection.sendCommand('CSS.getComputedStyleForNode', { nodeId }) as { computedStyle?: Array<{ name: string; value: string }> };
		if (computedStyleArray) {
			computedStyles = {};

			// Collect resolved property values into a map for shorthand collapsing
			const resolvedMap = new Map<string, string>();
			const varLines: string[] = [];

			for (const prop of computedStyleArray) {
				if (!prop.name || typeof prop.value !== 'string') {
					continue;
				}

				// Include in computedStyles record: referenced vars + key UI properties
				if (referencedVars.has(prop.name) || keyComputedProperties.has(prop.name)) {
					computedStyles[prop.name] = prop.value;
				}

				// Include in resolved values: any property explicitly set by stylesheets
				if (authorPropertyNames.has(prop.name)) {
					resolvedMap.set(prop.name, prop.value);
				} else if (userAgentPropertyNames.has(prop.name)) {
					resolvedMap.set(prop.name, `${prop.value} /*UA*/`); // Mark it as coming from User Agent styles.
				}

				// Include referenced CSS variable values
				if (referencedVars.has(prop.name)) {
					varLines.push(`${prop.name}: ${prop.value};`);
				}
			}

			if (resolvedMap.size > 0) {
				const resolvedLines = collapseToShorthands(resolvedMap);
				computedStyle += '\n\n/* Resolved values */\n' + resolvedLines.join('\n');
			}
			if (varLines.length > 0) {
				computedStyle += '\n\n/* CSS variables */\n' + varLines.join('\n');
			}
		}
	} catch { }

	return {
		outerHTML,
		computedStyle,
		bounds: { x, y, width, height },
		ancestors,
		attributes,
		computedStyles,
		dimensions: { top: y, left: x, width, height }
	};
}

function attributeArrayToRecord(attributes: string[]): Record<string, string> {
	const record: Record<string, string> = {};
	for (let i = 0; i < attributes.length; i += 2) {
		const name = attributes[i];
		const value = attributes[i + 1];
		record[name] = value;
	}
	return record;
}

/** Slightly customised CDP debugger inspect highlight colours. */
const inspectHighlightConfig = {
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
		containerBorder: { color: { r: 120, g: 180, b: 255 }, pattern: 'solid' },
		itemSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: 'solid' },
		lineSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: 'solid' },
		mainDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
		crossDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
		rowGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
		columnGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
	},
	flexItemHighlightConfig: {
		baseSizeBox: { hatchColor: { r: 130, g: 170, b: 255, a: 0.6 } },
		baseSizeBorder: { color: { r: 120, g: 180, b: 255 }, pattern: 'solid' },
		flexibilityArrow: { color: { r: 130, g: 190, b: 255 } }
	},
};
