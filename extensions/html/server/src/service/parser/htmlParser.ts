/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Scanner, TokenType } from './htmlScanner';
import { findFirst } from '../utils/arrays';
import { isEmptyElement } from './htmlTags';

export class Node {
	public tag: string;
	constructor(public start: number, public end: number, public children: Node[], public parent: Node) {
	}
	public findNodeBefore(offset:number) : Node {
		let idx = findFirst(this.children, c => offset <= c.start) - 1;
		if (idx >= 0) {
			let child = this.children[idx];
			if (offset > child.start) {
				if (offset < child.end) {
					return child.findNodeBefore(offset);
				}
				return child;
			}
		}
		return this;
	}
}

export interface HTMLDocument {
	roots: Node[];
	findNodeBefore(offset:number) : Node;
}

export function parse(text: string) : HTMLDocument {
	let scanner = new Scanner();
	scanner.setSource(text);

	let htmlDocument = new Node(0, text.length, [], null);
	let curr = htmlDocument;

	let token = scanner.scan();
	while (token !== TokenType.EOS) {
		switch (token) {
			case TokenType.StartTagOpen:
				let child = new Node(scanner.tokenOffset, text.length, [], curr);
				curr.children.push(child);
				curr = child;
				break;
			case TokenType.StartTag:
				curr.tag = scanner.tokenText;
				break;
			case TokenType.StartTagClose:
				curr.end = scanner.position; // might be later set to end tag position
				if (isEmptyElement(curr.tag) && curr !== htmlDocument) {
					curr = curr.parent;
				}
				break;
			case TokenType.EndTag:
				let closeTag = scanner.tokenText;
				while (curr.tag !== closeTag && curr !== htmlDocument) {
					curr = curr.parent;
				}
				break;
			case TokenType.StartTagSelfClose:
			case TokenType.EndTagClose:
				if (curr !== htmlDocument) {
					curr.end = scanner.position;
					curr = curr.parent;
				}
				break;
		}
		token = scanner.scan();
	}
	while (curr !== htmlDocument) {
		curr.end = text.length;
		curr = curr.parent;
	}
	return {
		roots: htmlDocument.children,
		findNodeBefore: (offset:number) => {
			return htmlDocument.findNodeBefore(offset);
		}
	};

}