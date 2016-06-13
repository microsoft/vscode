/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as nodes from '../../parser/cssNodes';
import {Parser} from '../../parser/cssParser';

export class PrintingVisitor implements nodes.IVisitor {

	public tree: string[] = [];

	public visitNode(node: nodes.Node): boolean {
		this.tree.push(nodes.NodeType[node.type].toLowerCase());
		return true;
	}
}

export function assertNodes(fn: (input: string) => nodes.Node, input: string, expected: string): void {
	let node = fn(input);
	let visitor = new PrintingVisitor();

	node.accept(visitor);

	let actual = visitor.tree.join(',') + ',';
	let segments = expected.split(',');
	let oldIndex: number = undefined;
	let index = -1;

	while (segments.length > 0) {
		let segment = segments.shift();
		if (segment === '...') {
			continue;
		}
		index = actual.indexOf(segment + ',', oldIndex);
		if (index <= oldIndex) {
			assert.ok(false, segment + ' NOT found in ' + actual);
		}
		oldIndex = index + segment.length;
	}

	assert.ok(true);
}

suite('CSS - Nodes', () => {

	test('Test Node', function () {

		let node = new nodes.Node();
		assert.equal(node.offset, -1);
		assert.equal(node.length, -1);
		assert.equal(node.parent, null);
		assert.equal(node.getChildren().length, 0);

		let c = 0;
		node.accept((n: nodes.Node) => {
			assert.ok(n === node);
			c += 1;
			return true;
		});
		assert.equal(c, 1);

		let child = new nodes.Node();
		node.adoptChild(child);

		c = 0;
		let expects = [node, child];
		node.accept((n: nodes.Node) => {
			assert.ok(n === expects[c]);
			c += 1;
			return true;
		});
		assert.equal(c, 2);
	});

	test('Test Adopting', function () {

		let child = new nodes.Node();
		let p1 = new nodes.Node();
		let p2 = new nodes.Node();

		assert.ok(child.parent === null);
		assert.equal(p1.getChildren().length, 0);
		assert.equal(p2.getChildren().length, 0);

		p1.adoptChild(child);
		assert.ok(child.parent === p1);
		assert.equal(p1.getChildren().length, 1);
		assert.equal(p2.getChildren().length, 0);

		p2.adoptChild(child);
		assert.ok(child.parent === p2);
		assert.equal(p1.getChildren().length, 0);
		assert.equal(p2.getChildren().length, 1);
	});

	function ruleset(input: string): nodes.RuleSet {
		let parser = new Parser();
		let node = parser.internalParse(input, parser._parseRuleset);
		return node;
	}

	test('RuleSet', function () {
		assertNodes(ruleset, 'selector { prop: value }', 'ruleset,...,selector,...,declaration,...,property,...,expression');
		assertNodes(ruleset, 'selector { prop; }', 'ruleset,...,selector,...,selector');
	});

	test('Keyframe', function () {
		function fn(input: string): nodes.Node {
			let parser = new Parser();
			let node = parser.internalParse(input, parser._parseKeyframe);
			return node;
		};
		assertNodes(fn, '@keyframes name { from { top: 0px} to { top: 100px } }', 'keyframe,identifier,keyframeselector,declaration,keyframeselector,declaration');
	});
});