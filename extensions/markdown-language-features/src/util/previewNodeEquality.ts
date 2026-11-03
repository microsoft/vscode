/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface PreviewNode {
	readonly nodeType: number;
	readonly nodeValue: string | null;
	readonly childNodes: ArrayLike<PreviewNode>;
}

interface PreviewElement extends PreviewNode {
	readonly tagName: string;
	readonly attributes: ArrayLike<{ readonly name: string; readonly value: string }>;
	isEqualNode(other: this): boolean;
}

const elementNodeType = 1;

const skippedAttributes = new Set([
	'open', // for details
]);

function isElement(node: PreviewNode): node is PreviewElement {
	return node.nodeType === elementNodeType;
}

/**
 * Compares two preview elements for morphdom to see if they are equal.
 *
 * Child nodes, including text, are compared in order. This skips some attributes that should not cause equality
 * to fail and ignores `data-line` values, which are synchronized separately.
 */
export function areNodesEqual<T extends PreviewElement>(a: T, b: T): boolean {
	if (a.isEqualNode(b)) {
		return true;
	}

	if (a.tagName !== b.tagName) {
		return false;
	}

	const aAttrs = Array.from(a.attributes).filter(attr => !skippedAttributes.has(attr.name));
	const bAttrs = Array.from(b.attributes).filter(attr => !skippedAttributes.has(attr.name));
	if (aAttrs.length !== bAttrs.length) {
		return false;
	}

	for (let i = 0; i < aAttrs.length; ++i) {
		const aAttr = aAttrs[i];
		const bAttr = bAttrs[i];
		if (aAttr.name !== bAttr.name) {
			return false;
		}
		if (aAttr.value !== bAttr.value && aAttr.name !== 'data-line') {
			return false;
		}
	}

	const aChildren = a.childNodes;
	const bChildren = b.childNodes;
	if (aChildren.length !== bChildren.length) {
		return false;
	}

	for (let i = 0; i < aChildren.length; ++i) {
		const aChild = aChildren[i];
		const bChild = bChildren[i];
		if (aChild.nodeType !== bChild.nodeType) {
			return false;
		}
		if (isElement(aChild) && isElement(bChild)) {
			if (!areNodesEqual(aChild, bChild)) {
				return false;
			}
		} else if (aChild.nodeValue !== bChild.nodeValue) {
			return false;
		}
	}

	return true;
}
