/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {assertNodes} from '../css/nodes.test';
import * as nodes from '../../parser/cssNodes';
import {LESSParser} from '../../parser/lessParser';

suite('LESS - Nodes', () => {

	function ruleset(input: string): nodes.RuleSet {
		let parser = new LESSParser();
		let node = parser.internalParse(input, parser._parseRuleset);
		return node;
	}

	test('RuleSet', function () {
		assertNodes(ruleset, 'selector { prop: value }', 'ruleset,...,selector,...,declaration,...,property,...,expression');
		assertNodes(ruleset, 'selector { prop; }', 'ruleset,...,selector,...,selector');
		assertNodes(ruleset, 'selector { prop {} }', 'ruleset,...,ruleset');
	});
});
