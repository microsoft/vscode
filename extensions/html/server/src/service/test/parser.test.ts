/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Node, HTMLDocument, parse} from '../parser/htmlParser';

suite('HTML Parser', () => {

	function toJSON(node: Node): any {
		return { tag: node.tag, start: node.start, end: node.end, endTagStart: node.endTagStart, closed: node.closed, children: node.children.map(toJSON) };
	}

	function assertDocument(input: string, expected: any) {
		let document = parse(input);
		assert.deepEqual(document.roots.map(toJSON), expected);
	}

	function assertNodeBefore(input: string, offset: number, expectedTag: string) {
		let document = parse(input);
		let node = document.findNodeBefore(offset);
		assert.equal(node ? node.tag : '', expectedTag, "offset " + offset);
	}

	test('Simple', () => {
		assertDocument('<html></html>', [ { tag: 'html', start: 0, end: 13, endTagStart: 6, closed: true, children: []}] );
		assertDocument('<html><body></body></html>', [ { tag: 'html', start: 0, end: 26, endTagStart: 19, closed: true, children: [ { tag: 'body', start: 6, end: 19, endTagStart: 12, closed: true, children: [] }]}] );
		assertDocument('<html><head></head><body></body></html>', [ { tag: 'html', start: 0, end: 39, endTagStart: 32, closed: true, children: [ { tag: 'head', start: 6, end: 19, endTagStart: 12, closed: true, children: [] }, { tag: 'body', start: 19, end: 32, endTagStart: 25, closed: true, children: [] }]}] );
	});

	test('SelfClose', () => {
		assertDocument('<br/>', [ { tag: 'br', start: 0, end: 5, endTagStart: void 0, closed: true, children: []}] );
		assertDocument('<div><br/><span></span></div>', [ { tag: 'div', start: 0, end: 29, endTagStart: 23, closed: true, children: [{ tag: 'br', start: 5, end: 10, endTagStart: void 0, closed: true, children: [] }, { tag: 'span', start: 10, end: 23, endTagStart: 16, closed: true, children: [] }]}] );
	});

	test('EmptyTag', () => {
		assertDocument('<meta>', [ { tag: 'meta', start: 0, end: 6, endTagStart: void 0, closed: true, children: []}] );
		assertDocument('<div><input type="button"><span><br><br></span></div>', [ { tag: 'div', start: 0, end: 53, endTagStart: 47, closed: true, children: [
			{ tag: 'input', start: 5, end: 26, endTagStart: void 0, closed: true, children: [] },
			{ tag: 'span', start: 26, end: 47, endTagStart: 40, closed: true, children: [{ tag: 'br', start: 32, end: 36, endTagStart: void 0, closed: true, children: [] }, { tag: 'br', start: 36, end: 40, endTagStart: void 0, closed: true, children: [] }] }
		]}] );
	});
	test('MissingTags', () => {
		assertDocument('</meta>', [] );
		assertDocument('<div></div></div>', [ { tag: 'div', start: 0, end: 11, endTagStart: 5, closed: true, children: [] }] );
		assertDocument('<div><div></div>', [ { tag: 'div', start: 0, end: 16, endTagStart: void 0, closed: false, children: [ { tag: 'div', start: 5, end: 16, endTagStart: 10, closed: true, children: [] } ] }] );
		assertDocument('<title><div></title>', [ { tag: 'title', start: 0, end: 20, endTagStart: 12, closed: true, children: [ { tag: 'div', start: 7, end: 12, endTagStart: void 0, closed: false, children: [] } ] }] );
		assertDocument('<h1><div><span></h1>', [ { tag: 'h1', start: 0, end: 20, endTagStart: 15, closed: true, children: [ { tag: 'div', start: 4, end: 15, endTagStart: void 0, closed: false, children: [ { tag: 'span', start: 9, end: 15, endTagStart: void 0, closed: false, children: [] }] } ] }] );
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
		assertNodeBefore(str, 42, 'hr');
		assertNodeBefore(str, 47, 'span');
		assertNodeBefore(str, 48, 'span');
		assertNodeBefore(str, 52, 'span');
		assertNodeBefore(str, 53, 'div');
	});

	test('FindNodeBefore - incomplete node', () => {
		let str = '<div><span><br></div>';
		assertNodeBefore(str, 15, 'br');
		assertNodeBefore(str, 18, 'br');
		assertNodeBefore(str, 21, 'div');
	});

});