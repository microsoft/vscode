/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TokenType, createScanner } from './htmlScanner';
import { findFirst } from '../utils/arrays';
import { isEmptyElement, isSameTag } from './htmlTags';

export class Node {
	public tag: string;
	public closed: boolean;
	public endTagStart: number;
	constructor(public start: number, public end: number, public children: Node[], public parent: Node) {

	}
	public get firstChild(): Node { return this.children[0]; }
	public get lastChild(): Node { return this.children.length ? this.children[this.children.length - 1] : void 0; }

	public findNodeBefore(offset:number) : Node {
		let idx = findFirst(this.children, c => offset <= c.start) - 1;
		if (idx >= 0) {
			let child = this.children[idx];
			if (offset > child.start) {
				if (offset < child.end) {
					return child.findNodeBefore(offset);
				}
				let lastChild = child.lastChild;
				if (lastChild && lastChild.end === child.end) {
					return child.findNodeBefore(offset);
				}
				return child;
			}
		}
		return this;
	}

	public findNodeAt(offset:number) : Node {
		let idx = findFirst(this.children, c => offset <= c.start) - 1;
		if (idx >= 0) {
			let child = this.children[idx];
			if (offset > child.start && offset <= child.end) {
				return child.findNodeAt(offset);
			}
		}
		return this;
	}
}

export interface HTMLDocument {
	roots: Node[];
	findNodeBefore(offset:number) : Node;
	findNodeAt(offset:number) : Node;
}

export function parse(text: string) : HTMLDocument {
	let scanner = createScanner(text);

	let htmlDocument = new Node(0, text.length, [], null);
	let curr = htmlDocument;
	let endTagStart : number = -1;
	let token = scanner.scan();
	while (token !== TokenType.EOS) {
		switch (token) {
			case TokenType.StartTagOpen:
				let child = new Node(scanner.getTokenOffset(), text.length, [], curr);
				curr.children.push(child);
				curr = child;
				break;
			case TokenType.StartTag:
				curr.tag = scanner.getTokenText();
				break;
			case TokenType.StartTagClose:
				curr.end = scanner.getTokenEnd(); // might be later set to end tag position
				if (isEmptyElement(curr.tag) && curr !== htmlDocument) {
					curr.closed = true;
					curr = curr.parent;
				}
				break;
			case TokenType.EndTagOpen:
				endTagStart = scanner.getTokenOffset();
				break;
			case TokenType.EndTag:
				let closeTag = scanner.getTokenText();
				while (!isSameTag(curr.tag, closeTag) && curr !== htmlDocument) {
					curr.end = endTagStart;
					curr.closed = false;
					curr = curr.parent;
				}
				if (curr !== htmlDocument) {
					curr.closed = true;
					curr.endTagStart = endTagStart;
				}
				break;
			case TokenType.StartTagSelfClose:
				if (curr !== htmlDocument) {
					curr.closed = true;
					curr.end = scanner.getTokenEnd();
					curr = curr.parent;
				}
				break;
			case TokenType.EndTagClose:
				if (curr !== htmlDocument) {
					curr.end = scanner.getTokenEnd();
					curr = curr.parent;
				}
				break;
		}
		token = scanner.scan();
	}
	while (curr !== htmlDocument) {
		curr.end = text.length;
		curr.closed = false;
		curr = curr.parent;
	}
	return {
		roots: htmlDocument.children,
		findNodeBefore: htmlDocument.findNodeBefore.bind(htmlDocument),
		findNodeAt: htmlDocument.findNodeAt.bind(htmlDocument)
	};

}