/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from 'vs/languages/css/common/parser/cssNodes';
import * as lessParser from 'vs/languages/less/common/parser/lessParser';
import * as nodesTest from 'vs/languages/css/test/common/nodes.test';

export function assertNodes(fn:(input:string)=>nodes.Node, input:string, expected:string):void {
	nodesTest.assertNodes(fn, input, expected);
}

suite('LESS - Nodes', () => {

	function ruleset(input:string):nodes.RuleSet{
		var parser = new lessParser.LessParser();
		var node = parser.internalParse(input, parser._parseRuleset);
		return node;
	}

	test('nodes - RuleSet', function() {
		assertNodes(ruleset, 'selector { prop: value }', 'ruleset,...,selector,...,declaration,...,property,...,expression');
		assertNodes(ruleset, 'selector { prop; }', 'ruleset,...,selector,...,selector');
		assertNodes(ruleset, 'selector { prop {} }', 'ruleset,...,ruleset');
	});
});
