/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Node, HTMLDocument, parse} from '../parser/htmlParser';

suite('HTML Parser', () => {

	function toJSON(node: Node): any {
		return { tag: node.tag, start: node.start, end: node.end, children: node.children.map(toJSON) };
	}

	function assertDocument(input: string, expected: any) {
		let document = parse(input);
		assert.deepEqual(document.roots.map(toJSON), expected);
	}

	function assertNodeBefore(input: string, offset: number, expectedTag: string) {
		let document = parse(input);
		let node = document.findNodeBefore(offset);
		assert.equal(node ? node.tag : '', expectedTag);
	}

	test('Simple', () => {
		assertDocument('<html></html>', [ { tag: 'html', start: 0, end: 13, children: []}] );
		assertDocument('<html><body></body></html>', [ { tag: 'html', start: 0, end: 26, children: [ { tag: 'body', start: 6, end: 19, children: [] }]}] );
		assertDocument('<html><head></head><body></body></html>', [ { tag: 'html', start: 0, end: 39, children: [ { tag: 'head', start: 6, end: 19, children: [] }, { tag: 'body', start: 19, end: 32, children: [] }]}] );
	});

	test('SelfClose', () => {
		assertDocument('<br/>', [ { tag: 'br', start: 0, end: 5, children: []}] );
		assertDocument('<div><br/><span></span></div>', [ { tag: 'div', start: 0, end: 29, children: [{ tag: 'br', start: 5, end: 10, children: [] }, { tag: 'span', start: 10, end: 23, children: [] }]}] );
	});

	test('EmptyTag', () => {
		assertDocument('<meta>', [ { tag: 'meta', start: 0, end: 6, children: []}] );
		assertDocument('<div><input type="button"><span><br><br></span></div>', [ { tag: 'div', start: 0, end: 53, children: [
			{ tag: 'input', start: 5, end: 26, children: [] },
			{ tag: 'span', start: 26, end: 47, children: [{ tag: 'br', start: 32, end: 36, children: [] }, { tag: 'br', start: 36, end: 40, children: [] }] }
		]}] );
	});
	test('MissingTags', () => {
		assertDocument('</meta>', [] );
		assertDocument('<div></div></div>', [ { tag: 'div', start: 0, end: 11, children: [] }] );
		assertDocument('<div><div></div>', [ { tag: 'div', start: 0, end: 16, children: [ { tag: 'div', start: 5, end: 16, children: [] } ] }] );
		assertDocument('<title><div></title>', [ { tag: 'title', start: 0, end: 20, children: [ { tag: 'div', start: 7, end: 12, children: [] } ] }] );
	});


	test('FindNodeBefore', () => {
		let str = '<div><input type="button"><span><br><hr></span></div>';
		assertNodeBefore(str, 0, void 0);
		assertNodeBefore(str, 1, 'div');
		assertNodeBefore(str, 5, 'div');
		assertNodeBefore(str, 6, 'input');
		assertNodeBefore(str, 25, 'input');
		assertNodeBefore(str, 26, 'input');
		assertNodeBefore(str, 27, 'span');
		assertNodeBefore(str, 32, 'span');
		assertNodeBefore(str, 33, 'br');
		assertNodeBefore(str, 36, 'br');
		assertNodeBefore(str, 37, 'hr');
		assertNodeBefore(str, 40, 'hr');
		assertNodeBefore(str, 41, 'hr');
		assertNodeBefore(str, 41, 'hr');
		assertNodeBefore(str, 47, 'hr');
		assertNodeBefore(str, 48, 'span');
	});

});