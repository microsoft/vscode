/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import typeResolution = require('vs/languages/css/common/services/typeResolution');
import _parser = require('vs/languages/css/common/parser/cssParser');

suite('CSS - types', () => {

	function assertTypes(input:string, parser: _parser.Parser, f: ()=>nodes.Node, simple:boolean):void {
		var node= parser.internalParse(input, f);
		var type = typeResolution.typeFromNode(node);
		assert.equal(type.isSimpleType(), simple);
	}

	test('simple types [term]', function() {

		var parser = new _parser.Parser();

		assertTypes('3', parser, parser._parseTerm.bind(parser), true);
		assertTypes('3px', parser, parser._parseTerm.bind(parser), true);
		assertTypes('3pt', parser, parser._parseTerm.bind(parser), true);
		assertTypes('3mm', parser, parser._parseTerm.bind(parser), true);
		assertTypes('3in', parser, parser._parseTerm.bind(parser), true);
		assertTypes('3somedimension', parser, parser._parseTerm.bind(parser), true);
		assertTypes('3s', parser, parser._parseTerm.bind(parser), true);
		assertTypes('3ms', parser, parser._parseTerm.bind(parser), true);

		assertTypes('green', parser, parser._parseTerm.bind(parser), true);
		assertTypes('"string"', parser, parser._parseTerm.bind(parser), true);
		assertTypes('url("foo/bar")', parser, parser._parseTerm.bind(parser), true);
		assertTypes('url(foo/bar)', parser, parser._parseTerm.bind(parser), true);

		assertTypes('rgba()', parser, parser._parseTerm.bind(parser), true);
		assertTypes('rgb()', parser, parser._parseTerm.bind(parser), true);
		assertTypes('hsl()', parser, parser._parseTerm.bind(parser), true);
		assertTypes('hsla()', parser, parser._parseTerm.bind(parser), true);

		assertTypes('somefunction()', parser, parser._parseTerm.bind(parser), true);
		assertTypes('calc()', parser, parser._parseTerm.bind(parser), true);

		assertTypes('calc(3px)', parser, parser._parseTerm.bind(parser), true);
		assertTypes('calc(3in)', parser, parser._parseTerm.bind(parser), true);
	});

	test('multi types [expression]', function() {

		var parser = new _parser.Parser();
		assertTypes('green', parser, parser._parseExpr.bind(parser), true);
		assertTypes('calc(3in, 3pc)', parser, parser._parseExpr.bind(parser), false);
		assertTypes('calc(3in 3pc)', parser, parser._parseExpr.bind(parser), false);
		assertTypes('3in 3pc', parser, parser._parseExpr.bind(parser), false);
		assertTypes('3in, 3pc', parser, parser._parseExpr.bind(parser), false);
		assertTypes('thin solid green', parser, parser._parseExpr.bind(parser), false);
	});
});