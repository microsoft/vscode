/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contains types from https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/
 */

export interface AXProperty {
	name: string;
	value: AXValue;
}

export interface AXValue {
	type: string;
	value: any;
}

export interface AXNode {
	nodeId: string;
	ignored?: boolean;
	ignoredReasons?: AXProperty[];
	role?: AXValue;
	chromeRole?: AXValue;
	name?: AXValue;
	description?: AXValue;
	value?: AXValue;
	properties?: AXProperty[];
	parentId?: string;
	childIds?: string[];
	backendDOMNodeId?: number;
	frameId?: string;
}

/**
 * Converts an array of AXNode objects to a readable format.
 * It processes the nodes to extract their text content, ignoring navigation elements and
 * formatting them in a structured way.
 *
 * @remarks We can do more here, but this is a good start.
 * @param axNodes - The array of AXNode objects to be converted to a readable format.
 * @returns string
 */
export function convertToReadibleFormat(axNodes: AXNode[]): string {
	if (!axNodes.length) {
		return '';
	}

	const nodeMap = new Map<string, AXNode>();
	const processedNodes = new Set<string>();
	const rootNodes: AXNode[] = [];

	// Build node map and identify root nodes
	for (const node of axNodes) {
		nodeMap.set(node.nodeId, node);
		if (!node.parentId || !axNodes.some(n => n.nodeId === node.parentId)) {
			rootNodes.push(node);
		}
	}

	function isNavigationElement(node: AXNode): boolean {
		// Skip navigation and UI elements that don't contribute to content
		const skipRoles = [
			'navigation',
			'banner',
			'complementary',
			'toolbar',
			'menu',
			'menuitem',
			'tab',
			'tablist'
		];
		const skipTexts = [
			'Skip to main content',
			'Toggle navigation',
			'Previous',
			'Next',
			'Copy',
			'Direct link to',
			'On this page',
			'Edit this page',
			'Search',
			'Command+K'
		];

		const text = getNodeText(node);
		const role = node.role?.value?.toString().toLowerCase() || '';
		// allow-any-unicode-next-line
		return skipRoles.includes(role) ||
			skipTexts.some(skipText => text.includes(skipText)) ||
			text.startsWith('Direct link to') ||
			text.startsWith('\xAB ') || // Left-pointing double angle quotation mark
			text.endsWith(' \xBB') || // Right-pointing double angle quotation mark
			/^#\s*$/.test(text) || // Skip standalone # characters
			text === '\u200B'; // Zero-width space character
	}

	function getNodeText(node: AXNode): string {
		const parts: string[] = [];

		// Add name if available
		if (node.name?.value) {
			parts.push(String(node.name.value));
		}

		// Add value if available and different from name
		if (node.value?.value && node.value.value !== node.name?.value) {
			parts.push(String(node.value.value));
		}

		// Add description if available and different from name and value
		if (node.description?.value &&
			node.description.value !== node.name?.value &&
			node.description.value !== node.value?.value) {
			parts.push(String(node.description.value));
		}

		return parts.join(' ').trim();
	}

	function isCodeBlock(node: AXNode): boolean {
		return node.role?.value === 'code' ||
			(node.properties || []).some(p => p.name === 'code-block' || p.name === 'pre');
	}

	function processNode(node: AXNode, depth: number = 0, parentContext: { inCodeBlock: boolean; codeText: string[] } = { inCodeBlock: false, codeText: [] }): string[] {
		if (!node || node.ignored || processedNodes.has(node.nodeId)) {
			return [];
		}

		if (isNavigationElement(node)) {
			return [];
		}

		processedNodes.add(node.nodeId);
		const lines: string[] = [];
		const text = getNodeText(node);
		const currentIsCode = isCodeBlock(node);
		const context = currentIsCode ? { inCodeBlock: true, codeText: [] } : parentContext;

		if (text) {
			const indent = '  '.repeat(depth);
			if (currentIsCode || context.inCodeBlock) {
				// For code blocks, collect text without adding newlines
				context.codeText.push(text.trim());
			} else {
				lines.push(indent + text);
			}
		}

		// Process children
		if (node.childIds) {
			for (const childId of node.childIds) {
				const child = nodeMap.get(childId);
				if (child) {
					const childLines = processNode(child, depth + 1, context);
					lines.push(...childLines);
				}
			}
		}

		// If this is the root code block node, join all collected code text
		if (currentIsCode && context.codeText.length > 0) {
			const indent = '  '.repeat(depth);
			lines.push(indent + context.codeText.join(' '));
		}

		return lines;
	}

	// Process all nodes starting from roots
	const allLines: string[] = [];
	for (const node of rootNodes) {
		const nodeLines = processNode(node);
		if (nodeLines.length > 0) {
			allLines.push(...nodeLines);
		}
	}

	// Process any remaining unprocessed nodes
	for (const node of axNodes) {
		if (!processedNodes.has(node.nodeId)) {
			const nodeLines = processNode(node);
			if (nodeLines.length > 0) {
				allLines.push(...nodeLines);
			}
		}
	}

	// Clean up empty lines and trim
	return allLines
		.filter((line, index, array) => {
			// Keep the line if it's not empty or if it's not adjacent to another empty line
			return line.trim() || (index > 0 && array[index - 1].trim());
		})
		.join('\n')
		.trim();
}
