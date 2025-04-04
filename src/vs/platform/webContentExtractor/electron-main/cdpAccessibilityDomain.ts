/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region Types

import { URI } from '../../../base/common/uri.js';

export interface AXValue {
	type: AXValueType;
	value?: any;
	relatedNodes?: AXNode[];
	sources?: AXValueSource[];
}

export interface AXValueSource {
	type: AXValueSourceType;
	value?: AXValue;
	attribute?: string;
	attributeValue?: string;
	superseded?: boolean;
	nativeSource?: AXValueNativeSourceType;
	nativeSourceValue?: string;
	invalid?: boolean;
	invalidReason?: string;
}

export interface AXNode {
	nodeId: string;
	ignored: boolean;
	ignoredReasons?: AXProperty[];
	role?: AXValue;
	chromeRole?: AXValue;
	name?: AXValue;
	description?: AXValue;
	value?: AXValue;
	properties?: AXProperty[];
	childIds?: string[];
	backendDOMNodeId?: number;
}

export interface AXProperty {
	name: AXPropertyName;
	value: AXValue;
}

export type AXValueType = 'boolean' | 'tristate' | 'booleanOrUndefined' | 'idref' | 'idrefList' | 'integer' | 'node' | 'nodeList' | 'number' | 'string' | 'computedString' | 'token' | 'tokenList' | 'domRelation' | 'role' | 'internalRole' | 'valueUndefined';

export type AXValueSourceType = 'attribute' | 'implicit' | 'style' | 'contents' | 'placeholder' | 'relatedElement';

export type AXValueNativeSourceType = 'description' | 'figcaption' | 'label' | 'labelfor' | 'labelwrapped' | 'legend' | 'rubyannotation' | 'tablecaption' | 'title' | 'other';

export type AXPropertyName = 'url' | 'busy' | 'disabled' | 'editable' | 'focusable' | 'focused' | 'hidden' | 'hiddenRoot' | 'invalid' | 'keyshortcuts' | 'settable' | 'roledescription' | 'live' | 'atomic' | 'relevant' | 'root' | 'autocomplete' | 'hasPopup' | 'level' | 'multiselectable' | 'orientation' | 'multiline' | 'readonly' | 'required' | 'valuemin' | 'valuemax' | 'valuetext' | 'checked' | 'expanded' | 'pressed' | 'selected' | 'activedescendant' | 'controls' | 'describedby' | 'details' | 'errormessage' | 'flowto' | 'labelledby' | 'owns';

//#endregion

interface AXNodeTree {
	readonly node: AXNode;
	readonly children: AXNodeTree[];
	parent: AXNodeTree | null;
}

function createNodeTree(nodes: AXNode[]): AXNodeTree | null {
	if (nodes.length === 0) {
		return null;
	}

	// Create a map of node IDs to their corresponding nodes for quick lookup
	const nodeLookup = new Map<string, AXNode>();
	for (const node of nodes) {
		nodeLookup.set(node.nodeId, node);
	}

	// Helper function to get all non-ignored descendants of a node
	function getNonIgnoredDescendants(nodeId: string): string[] {
		const node = nodeLookup.get(nodeId);
		if (!node || !node.childIds) {
			return [];
		}

		const result: string[] = [];
		for (const childId of node.childIds) {
			const childNode = nodeLookup.get(childId);
			if (!childNode) {
				continue;
			}

			if (childNode.ignored) {
				// If child is ignored, add its non-ignored descendants instead
				result.push(...getNonIgnoredDescendants(childId));
			} else {
				// Otherwise, add the child itself
				result.push(childId);
			}
		}
		return result;
	}

	// Create tree nodes only for non-ignored nodes
	const nodeMap = new Map<string, AXNodeTree>();
	for (const node of nodes) {
		if (!node.ignored) {
			nodeMap.set(node.nodeId, { node, children: [], parent: null });
		}
	}

	// Establish parent-child relationships, bypassing ignored nodes
	for (const node of nodes) {
		if (node.ignored) {
			continue;
		}

		const treeNode = nodeMap.get(node.nodeId)!;
		if (node.childIds) {
			for (const childId of node.childIds) {
				const childNode = nodeLookup.get(childId);
				if (!childNode) {
					continue;
				}

				if (childNode.ignored) {
					// If child is ignored, connect its non-ignored descendants to this node
					const nonIgnoredDescendants = getNonIgnoredDescendants(childId);
					for (const descendantId of nonIgnoredDescendants) {
						const descendantTreeNode = nodeMap.get(descendantId);
						if (descendantTreeNode) {
							descendantTreeNode.parent = treeNode;
							treeNode.children.push(descendantTreeNode);
						}
					}
				} else {
					// Normal case: add non-ignored child directly
					const childTreeNode = nodeMap.get(childId);
					if (childTreeNode) {
						childTreeNode.parent = treeNode;
						treeNode.children.push(childTreeNode);
					}
				}
			}
		}
	}

	// Find the root node (a node without a parent)
	for (const node of nodeMap.values()) {
		if (!node.parent) {
			return node;
		}
	}

	return null;
}

export function convertAXTreeToMarkdown(uri: URI, axNodes: AXNode[]): string {
	const tree = createNodeTree(axNodes);
	if (!tree) {
		return ''; // Return empty string for empty tree
	}

	// Process tree to extract main content and navigation links
	const mainContent = extractMainContent(uri, tree);
	const navLinks = collectNavigationLinks(tree);

	// Combine main content and navigation links
	return mainContent + (navLinks.length > 0 ? '\n\n## Additional Links\n' + navLinks.join('\n') : '');
}

function extractMainContent(uri: URI, tree: AXNodeTree): string {
	const contentBuffer: string[] = [];
	processNode(uri, tree, contentBuffer, 0, true);
	return contentBuffer.join('');
}

function processNode(uri: URI, node: AXNodeTree, buffer: string[], depth: number, semanticLineBreak: boolean): void {
	const role = getNodeRole(node.node);

	switch (role) {
		case 'navigation':
			return; // Skip navigation nodes

		case 'heading':
			processHeadingNode(uri, node, buffer, depth);
			return;

		case 'paragraph':
			processParagraphNode(uri, node, buffer, depth, semanticLineBreak);
			return;

		case 'list':
			processListNode(uri, node, buffer, depth);
			return;

		case 'listitem':
			// Individual list items are handled in processListNode
			return;

		case 'link':
			if (!isNavigationLink(node)) {
				const linkText = getNodeText(node.node, semanticLineBreak);
				const url = getLinkUrl(node.node);
				if (!isSameUriIgnoringQueryAndFragment(uri, node.node)) {
					buffer.push(`[${linkText}](${url})`);
				} else {
					buffer.push(linkText);
				}
			}
			return;
		case 'StaticText': {
			const staticText = getNodeText(node.node, semanticLineBreak);
			if (staticText) {
				buffer.push(staticText);
			}
			break;
		}
		case 'image': {
			const altText = getNodeText(node.node, semanticLineBreak) || 'Image';
			const imageUrl = getImageUrl(node.node);
			if (imageUrl) {
				buffer.push(`![${altText}](${imageUrl})\n\n`);
			} else {
				buffer.push(`[Image: ${altText}]\n\n`);
			}
			break;
		}

		case 'DescriptionList':
			processDescriptionListNode(uri, node, buffer, depth);
			return;

		case 'blockquote':
			buffer.push('> ' + getNodeText(node.node, semanticLineBreak).replace(/\n/g, '\n> ') + '\n\n');
			break;

		// TODO: Is this the correct way to handle the generic role?
		case 'generic':
			buffer.push(' ');
			break;

		case 'code': {
			processCodeNode(uri, node, buffer, depth);
			return;
		}

		case 'pre':
			buffer.push('```\n' + getNodeText(node.node, false) + '\n```\n\n');
			break;

		case 'table':
			processTableNode(node, buffer);
			return;
	}

	// Process children if not already handled in specific cases
	for (const child of node.children) {
		processNode(uri, child, buffer, depth + 1, semanticLineBreak);
	}
}

function getNodeRole(node: AXNode): string {
	return node.role?.value as string || '';
}

function getNodeText(node: AXNode, semanticLineBreak: boolean): string {
	const text = node.name?.value as string || node.value?.value as string || '';
	if (!semanticLineBreak) {
		return text;
	}

	// Insert line breaks after punctuation followed by space
	return text.replace(/([.!?:;])\s/g, '$1\n');
}

function getHeadingLevel(node: AXNode): number {
	const levelProp = node.properties?.find(p => p.name === 'level');
	return levelProp ? Math.min(Number(levelProp.value.value) || 1, 6) : 1;
}

function getLinkUrl(node: AXNode): string {
	// Find URL in properties
	const urlProp = node.properties?.find(p => p.name === 'url');
	return urlProp?.value.value as string || '#';
}

function getImageUrl(node: AXNode): string | null {
	// Find URL in properties
	const urlProp = node.properties?.find(p => p.name === 'url');
	return urlProp?.value.value as string || null;
}

function isNavigationLink(node: AXNodeTree): boolean {
	// Check if this link is part of navigation
	let current: AXNodeTree | null = node;
	while (current) {
		const role = getNodeRole(current.node);
		if (['navigation', 'menu', 'menubar'].includes(role)) {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function isSameUriIgnoringQueryAndFragment(uri: URI, node: AXNode): boolean {
	// Check if this link is an anchor link
	const link = getLinkUrl(node);
	try {
		const parsed = URI.parse(link);
		return parsed.scheme === uri.scheme && parsed.authority === uri.authority && parsed.path === uri.path;
	} catch (e) {
		return false;
	}
}

function processParagraphNode(uri: URI, node: AXNodeTree, buffer: string[], depth: number, semanticLineBreak: boolean): void {
	buffer.push('\n');
	// Process the children of the paragraph
	for (const child of node.children) {
		processNode(uri, child, buffer, depth + 1, semanticLineBreak);
	}
	buffer.push('\n\n');
}

function processHeadingNode(uri: URI, node: AXNodeTree, buffer: string[], depth: number): void {
	buffer.push('\n');
	const level = getHeadingLevel(node.node);
	buffer.push(`${'#'.repeat(level)} `);
	// Process children nodes of the heading
	for (const child of node.children) {
		if (getNodeRole(child.node) === 'StaticText') {
			buffer.push(getNodeText(child.node, false));
		} else {
			processNode(uri, child, buffer, depth + 1, false);
		}
	}
	buffer.push('\n\n');
}

function processDescriptionListNode(uri: URI, node: AXNodeTree, buffer: string[], depth: number): void {
	buffer.push('\n');

	// Process each child of the description list
	for (const child of node.children) {
		if (getNodeRole(child.node) === 'term') {
			buffer.push('- **');
			// Process term nodes
			for (const termChild of child.children) {
				processNode(uri, termChild, buffer, depth + 1, true);
			}
			buffer.push('** ');
		} else if (getNodeRole(child.node) === 'definition') {
			// Process description nodes
			for (const descChild of child.children) {
				processNode(uri, descChild, buffer, depth + 1, true);
			}
			buffer.push('\n');
		}
	}

	buffer.push('\n');
}

function processListNode(uri: URI, node: AXNodeTree, buffer: string[], depth: number): void {
	// Check if it's an ordered list
	// TODO: Verify that this is the correct way to check for ordered lists
	const isOrdered = getNodeRole(node.node).includes('ordered');

	let itemIndex = 1;
	buffer.push('\n');

	for (const child of node.children) {
		if (getNodeRole(child.node) === 'listitem') {
			const tempBuffer: string[] = [];
			// Process the children of the list item
			for (const descChild of child.children) {
				processNode(uri, descChild, tempBuffer, depth + 1, true);
			}
			const itemText = tempBuffer.join('').trim();
			if (isOrdered) {
				buffer.push(`${itemIndex++}. ${itemText}\n`);
			} else {
				buffer.push(`- ${itemText}\n`);
			}
		}
	}

	buffer.push('\n');
}

function processTableNode(node: AXNodeTree, buffer: string[]): void {
	buffer.push('\n');

	// Find rows
	const rows = node.children.filter(child => getNodeRole(child.node).includes('row'));

	if (rows.length > 0) {
		// First row as header
		const headerCells = rows[0].children.filter(cell => getNodeRole(cell.node).includes('cell'));

		// Generate header row
		const headerContent = headerCells.map(cell => getNodeText(cell.node, false) || ' ');
		buffer.push('| ' + headerContent.join(' | ') + ' |\n');

		// Generate separator row
		buffer.push('| ' + headerCells.map(() => '---').join(' | ') + ' |\n');

		// Generate data rows
		for (let i = 1; i < rows.length; i++) {
			const dataCells = rows[i].children.filter(cell => getNodeRole(cell.node).includes('cell'));
			const rowContent = dataCells.map(cell => getNodeText(cell.node, false) || ' ');
			buffer.push('| ' + rowContent.join(' | ') + ' |\n');
		}
	}

	buffer.push('\n');
}

function processCodeNode(uri: URI, node: AXNodeTree, buffer: string[], depth: number): void {
	const tempBuffer: string[] = [];
	// Process the children of the code node
	for (const child of node.children) {
		processNode(uri, child, tempBuffer, depth + 1, false);
	}
	const isCodeblock = tempBuffer.some(text => text.includes('\n'));
	if (isCodeblock) {
		buffer.push('\n```\n');
		// Append the processed text to the buffer
		buffer.push(tempBuffer.join(''));
		buffer.push('\n```\n');
	} else {
		buffer.push('`');
		let characterCount = 0;
		// Append the processed text to the buffer
		for (const tempItem of tempBuffer) {
			characterCount += tempItem.length;
			// Semantic line feed max of 80
			if (characterCount > 80) {
				buffer.push('\n');
				characterCount = 0;
			}
			buffer.push(tempItem);
			buffer.push('`');
		}
	}
}

function collectNavigationLinks(tree: AXNodeTree): string[] {
	const links: string[] = [];
	collectLinks(tree, links);
	return links;
}

function collectLinks(node: AXNodeTree, links: string[]): void {
	const role = getNodeRole(node.node);

	if (role === 'link' && isNavigationLink(node)) {
		const linkText = getNodeText(node.node, true);
		const url = getLinkUrl(node.node);
		const description = node.node.description?.value as string || '';

		links.push(`- [${linkText}](${url})${description ? ' - ' + description : ''}`);
	}

	// Process children
	for (const child of node.children) {
		collectLinks(child, links);
	}
}
