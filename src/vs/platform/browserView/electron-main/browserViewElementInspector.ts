/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IElementData, IElementAncestor } from '../common/browserView.js';
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

interface ICSSStyle {
	cssText?: string;
	cssProperties: Array<{ name: string; value: string }>;
}

interface ISelectorList {
	selectors: Array<{ text: string }>;
}

interface ICSSRule {
	selectorList: ISelectorList;
	origin: string;
	style: ICSSStyle;
}

interface IRuleMatch {
	rule: ICSSRule;
}

interface IInheritedStyleEntry {
	inlineStyle?: ICSSStyle;
	matchedCSSRules: IRuleMatch[];
}

interface IMatchedStyles {
	inlineStyle?: ICSSStyle;
	matchedCSSRules?: IRuleMatch[];
	inherited?: IInheritedStyleEntry[];
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

	constructor(private readonly browser: BrowserView) {
		super();

		this._connectionPromise = browser.attach().then(
			async conn => {
				try {
					// Important: don't use `Runtime.*` commands so we can support inspection during debugging.
					// We also initialize here rather than during selection as CSS.enable will hang if debugging is paused, but works if enabled beforehand.
					await conn.sendCommand('DOM.enable');
					await conn.sendCommand('Overlay.enable');
					await conn.sendCommand('CSS.enable');

					if (this._store.isDisposed) {
						conn.dispose();
						throw new Error('Inspector disposed before connection was ready');
					}
					this._register(conn);
					return conn;
				} catch (error) {
					conn.dispose();
					throw error;
				}
			}
		);
	}

	/**
	 * Start element inspection mode on the browser view. Sets up an
	 * overlay that highlights elements on hover. When the user clicks, the
	 * element data is returned and the overlay is removed.
	 *
	 * @param token Cancellation token to abort the inspection.
	 */
	async getElementData(token: CancellationToken): Promise<IElementData | undefined> {
		const connection = await this._connectionPromise;
		const store = new DisposableStore();
		const result = new Promise<IElementData | undefined>((resolve, reject) => {
			store.add(token.onCancellationRequested(() => {
				resolve(undefined);
			}));

			store.add(connection.onEvent(async (event) => {
				if (event.method !== 'Overlay.inspectNodeRequested') {
					return;
				}

				const params = event.params as { backendNodeId: number };
				if (!params?.backendNodeId) {
					reject(new Error('Missing backendNodeId in inspectNodeRequested event'));
					return;
				}

				try {
					const nodeData = await extractNodeData(connection, { backendNodeId: params.backendNodeId });
					resolve({
						...nodeData,
						url: this.browser.getURL()
					});
				} catch (err) {
					reject(err);
				}
			}));
		});

		try {
			await connection.sendCommand('Overlay.setInspectMode', {
				mode: 'searchForNode',
				highlightConfig: inspectHighlightConfig,
			});
			return await result;
		} finally {
			try {
				await connection.sendCommand('Overlay.setInspectMode', {
					mode: 'none',
					highlightConfig: { showInfo: false, showStyles: false }
				});
				await connection.sendCommand('Overlay.hideHighlight');
			} catch {
				// Best effort cleanup
			}
			store.dispose();
		}
	}

	/**
	 * Get element data for the currently focused element.
	 */
	async getFocusedElementData(): Promise<IElementData | undefined> {
		const connection = await this._connectionPromise;

		await connection.sendCommand('Runtime.enable');
		const { result } = await connection.sendCommand('Runtime.evaluate', {
			expression: 'document.activeElement',
			returnByValue: false,
		}) as { result: { objectId?: string } };

		if (!result?.objectId) {
			return undefined;
		}

		const nodeData = await extractNodeData(connection, { objectId: result.objectId });
		return {
			...nodeData,
			url: this.browser.getURL()
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

	const computedStyle = formatMatchedStyles(matched as IMatchedStyles);
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

	let computedStyles: Record<string, string> | undefined;
	try {
		const { computedStyle: computedStyleArray } = await connection.sendCommand('CSS.getComputedStyleForNode', { nodeId }) as { computedStyle?: Array<{ name: string; value: string }> };
		if (computedStyleArray) {
			computedStyles = {};
			for (const prop of computedStyleArray) {
				if (prop.name && typeof prop.value === 'string') {
					computedStyles[prop.name] = prop.value;
				}
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

function formatMatchedStyles(matched: IMatchedStyles): string {
	const lines: string[] = [];

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

	if (matched.matchedCSSRules?.length) {
		for (const ruleEntry of matched.matchedCSSRules) {
			const rule = ruleEntry.rule;
			const selectors = rule.selectorList.selectors.map((s: { text: string }) => s.text).join(', ');
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

	if (matched.inherited?.length) {
		let level = 1;
		for (const inherited of matched.inherited) {
			if (inherited.inlineStyle) {
				lines.push(`/* Inherited from ancestor level ${level} (inline) */`);
				lines.push('element {');
				lines.push(inherited.inlineStyle.cssText || '');
				lines.push('}\n');
			}

			const rules = inherited.matchedCSSRules || [];
			for (const ruleEntry of rules) {
				const rule = ruleEntry.rule;
				const selectors = rule.selectorList.selectors.map((s: { text: string }) => s.text).join(', ');
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
