/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { areNodesEqual } from '../util/previewNodeEquality';

suite('markdown.previewNodeEquality', () => {
	class FakeNode {
		constructor(
			readonly nodeType: number,
			readonly nodeValue: string | null,
			readonly tagName: string,
			readonly attributes: readonly { readonly name: string; readonly value: string }[],
			readonly childNodes: readonly FakeNode[],
		) { }

		isEqualNode(other: FakeNode): boolean {
			return this.toString() === other.toString();
		}

		toString(): string {
			if (this.nodeType !== 1) {
				return `#${this.nodeType}:${this.nodeValue}`;
			}
			const attributes = this.attributes.map(attr => ` ${attr.name}="${attr.value}"`).join('');
			return `<${this.tagName}${attributes}>${this.childNodes.join('')}</${this.tagName}>`;
		}
	}

	function element(tagName: string, attributes: Record<string, string>, ...children: (FakeNode | string)[]): FakeNode {
		return new FakeNode(
			1,
			null,
			tagName,
			Object.entries(attributes).map(([name, value]) => ({ name, value })),
			children.map(child => typeof child === 'string' ? new FakeNode(3, child, '', [], []) : child),
		);
	}

	function paragraph(line: string, ...children: (FakeNode | string)[]): FakeNode {
		return element('p', { 'data-line': line, 'class': 'code-line', 'dir': 'auto' }, ...children);
	}

	test('detects text moving around otherwise identical inline elements', () => {
		const link = () => element('a', { href: 'https://example.com' }, 'hello');
		const bold = () => element('strong', {}, 'hello');
		const details = (attributes: Record<string, string>) => element('details', attributes, element('summary', { 'data-line': '1' }, 'Summary'));
		assert.deepStrictEqual({
			movedLink: areNodesEqual(paragraph('2', 'hello ', link()), paragraph('2', link(), ' hello')),
			movedBold: areNodesEqual(paragraph('2', 'hello ', bold()), paragraph('2', bold(), ' hello')),
			changedNestedText: areNodesEqual(paragraph('2', element('em', {}, 'a')), paragraph('2', element('em', {}, 'b'))),
			movedUnchangedBlock: areNodesEqual(paragraph('2', 'hello ', link()), paragraph('4', 'hello ', link())),
			toggledDetails: areNodesEqual(details({ open: '' }), details({})),
		}, {
			movedLink: false,
			movedBold: false,
			changedNestedText: false,
			movedUnchangedBlock: true,
			toggledDetails: true,
		});
	});
});
