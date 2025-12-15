/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { UriTemplate } from '../../common/uriTemplate.js';
import * as assert from 'assert';

suite('UriTemplate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Helper function to test template parsing and component extraction
	 */
	function testParsing(template: string, expectedComponents: unknown[]) {
		const templ = UriTemplate.parse(template);
		assert.deepStrictEqual(templ.components.filter(c => typeof c === 'object'), expectedComponents);
		return templ;
	}

	/**
	 * Helper function to test template resolution
	 */
	function testResolution(template: string, variables: Record<string, any>, expected: string) {
		const templ = UriTemplate.parse(template);
		const result = templ.resolve(variables);
		assert.strictEqual(result, expected);
	}

	test('simple replacement', () => {
		const templ = UriTemplate.parse('http://example.com/{var}');
		assert.deepStrictEqual(templ.components, ['http://example.com/', {
			expression: '{var}',
			operator: '',
			variables: [{ explodable: false, name: 'var', optional: false, prefixLength: undefined, repeatable: false }]
		}, '']);
		const result = templ.resolve({ var: 'value' });
		assert.strictEqual(result, 'http://example.com/value');
	});

	test('parsing components correctly', () => {
		// Simple component
		testParsing('http://example.com/{var}', [{
			expression: '{var}',
			operator: '',
			variables: [{ explodable: false, name: 'var', optional: false, prefixLength: undefined, repeatable: false }]
		}]);

		// Component with operator
		testParsing('http://example.com/{+path}', [{
			expression: '{+path}',
			operator: '+',
			variables: [{ explodable: false, name: 'path', optional: false, prefixLength: undefined, repeatable: false }]
		}]);

		// Component with multiple variables
		testParsing('http://example.com/{x,y}', [{
			expression: '{x,y}',
			operator: '',
			variables: [
				{ explodable: false, name: 'x', optional: false, prefixLength: undefined, repeatable: false },
				{ explodable: false, name: 'y', optional: false, prefixLength: undefined, repeatable: false }
			]
		}]);

		// Component with value modifiers
		testParsing('http://example.com/{var:3}', [{
			expression: '{var:3}',
			operator: '',
			variables: [{ explodable: false, name: 'var', optional: false, prefixLength: 3, repeatable: false }]
		}]);

		testParsing('http://example.com/{list*}', [{
			expression: '{list*}',
			operator: '',
			variables: [{ explodable: true, name: 'list', optional: false, prefixLength: undefined, repeatable: true }]
		}]);

		// Multiple components
		testParsing('http://example.com/{x}/path/{y}', [
			{
				expression: '{x}',
				operator: '',
				variables: [{ explodable: false, name: 'x', optional: false, prefixLength: undefined, repeatable: false }]
			},
			{
				expression: '{y}',
				operator: '',
				variables: [{ explodable: false, name: 'y', optional: false, prefixLength: undefined, repeatable: false }]
			}
		]);
	});

	test('Level 1 - Simple string expansion', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			hello: 'Hello World!'
		};

		testResolution('{var}', variables, 'value');
		testResolution('{hello}', variables, 'Hello%20World%21');
	});

	test('Level 2 - Reserved expansion', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			hello: 'Hello World!',
			path: '/foo/bar'
		};

		testResolution('{+var}', variables, 'value');
		testResolution('{+hello}', variables, 'Hello%20World!');
		testResolution('{+path}/here', variables, '/foo/bar/here');
		testResolution('here?ref={+path}', variables, 'here?ref=/foo/bar');
	});

	test('Level 2 - Fragment expansion', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			hello: 'Hello World!'
		};

		testResolution('X{#var}', variables, 'X#value');
		testResolution('X{#hello}', variables, 'X#Hello%20World!');
	});

	test('Level 3 - String expansion with multiple variables', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			hello: 'Hello World!',
			empty: '',
			path: '/foo/bar',
			x: '1024',
			y: '768'
		};

		testResolution('map?{x,y}', variables, 'map?1024,768');
		testResolution('{x,hello,y}', variables, '1024,Hello%20World%21,768');
	});

	test('Level 3 - Reserved expansion with multiple variables', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			hello: 'Hello World!',
			path: '/foo/bar',
			x: '1024',
			y: '768'
		};

		testResolution('{+x,hello,y}', variables, '1024,Hello%20World!,768');
		testResolution('{+path,x}/here', variables, '/foo/bar,1024/here');
	});

	test('Level 3 - Fragment expansion with multiple variables', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			hello: 'Hello World!',
			path: '/foo/bar',
			x: '1024',
			y: '768'
		};

		testResolution('{#x,hello,y}', variables, '#1024,Hello%20World!,768');
		testResolution('{#path,x}/here', variables, '#/foo/bar,1024/here');
	});

	test('Level 3 - Label expansion with dot-prefix', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			x: '1024',
			y: '768'
		};

		testResolution('X{.var}', variables, 'X.value');
		testResolution('X{.x,y}', variables, 'X.1024.768');
	});

	test('Level 3 - Path segments expansion', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			x: '1024'
		};

		testResolution('{/var}', variables, '/value');
		testResolution('{/var,x}/here', variables, '/value/1024/here');
	});

	test('Level 3 - Path-style parameter expansion', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			x: '1024',
			y: '768',
			empty: ''
		};

		testResolution('{;x,y}', variables, ';x=1024;y=768');
		testResolution('{;x,y,empty}', variables, ';x=1024;y=768;empty');
	});

	test('Level 3 - Form-style query expansion', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			x: '1024',
			y: '768',
			empty: ''
		};

		testResolution('{?x,y}', variables, '?x=1024&y=768');
		testResolution('{?x,y,empty}', variables, '?x=1024&y=768&empty=');
	});

	test('Level 3 - Form-style query continuation', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			x: '1024',
			y: '768',
			empty: ''
		};

		testResolution('?fixed=yes{&x}', variables, '?fixed=yes&x=1024');
		testResolution('{&x,y,empty}', variables, '&x=1024&y=768&empty=');
	});

	test('Level 4 - String expansion with value modifiers', () => {
		// Test cases from RFC 6570 Section 1.2
		const variables = {
			var: 'value',
			hello: 'Hello World!',
			path: '/foo/bar',
			list: ['red', 'green', 'blue'],
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('{var:3}', variables, 'val');
		testResolution('{var:30}', variables, 'value');
		testResolution('{list}', variables, 'red,green,blue');
		testResolution('{list*}', variables, 'red,green,blue');
	});

	test('Level 4 - Reserved expansion with value modifiers', () => {
		// Test cases related to Level 4 features
		const variables = {
			var: 'value',
			hello: 'Hello World!',
			path: '/foo/bar',
			list: ['red', 'green', 'blue'],
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('{+path:6}/here', variables, '/foo/b/here');
		testResolution('{+list}', variables, 'red,green,blue');
		testResolution('{+list*}', variables, 'red,green,blue');
		testResolution('{+keys}', variables, 'semi,;,dot,.,comma,,');
		testResolution('{+keys*}', variables, 'semi=;,dot=.,comma=,');
	});

	test('Level 4 - Fragment expansion with value modifiers', () => {
		// Test cases related to Level 4 features
		const variables = {
			var: 'value',
			hello: 'Hello World!',
			path: '/foo/bar',
			list: ['red', 'green', 'blue'],
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('{#path:6}/here', variables, '#/foo/b/here');
		testResolution('{#list}', variables, '#red,green,blue');
		testResolution('{#list*}', variables, '#red,green,blue');
		testResolution('{#keys}', variables, '#semi,;,dot,.,comma,,');
		testResolution('{#keys*}', variables, '#semi=;,dot=.,comma=,');
	});

	test('Level 4 - Label expansion with value modifiers', () => {
		// Test cases related to Level 4 features
		const variables = {
			var: 'value',
			list: ['red', 'green', 'blue'],
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('X{.var:3}', variables, 'X.val');
		testResolution('X{.list}', variables, 'X.red,green,blue');
		testResolution('X{.list*}', variables, 'X.red.green.blue');
		testResolution('X{.keys}', variables, 'X.semi,;,dot,.,comma,,');
		testResolution('X{.keys*}', variables, 'X.semi=;.dot=..comma=,');
	});

	test('Level 4 - Path expansion with value modifiers', () => {
		// Test cases related to Level 4 features
		const variables = {
			var: 'value',
			list: ['red', 'green', 'blue'],
			path: '/foo/bar',
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('{/var:1,var}', variables, '/v/value');
		testResolution('{/list}', variables, '/red,green,blue');
		testResolution('{/list*}', variables, '/red/green/blue');
		testResolution('{/list*,path:4}', variables, '/red/green/blue/%2Ffoo');
		testResolution('{/keys}', variables, '/semi,;,dot,.,comma,,');
		testResolution('{/keys*}', variables, '/semi=%3B/dot=./comma=%2C');
	});

	test('Level 4 - Path-style parameters with value modifiers', () => {
		// Test cases related to Level 4 features
		const variables = {
			var: 'value',
			list: ['red', 'green', 'blue'],
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('{;hello:5}', { hello: 'Hello World!' }, ';hello=Hello');
		testResolution('{;list}', variables, ';list=red,green,blue');
		testResolution('{;list*}', variables, ';list=red;list=green;list=blue');
		testResolution('{;keys}', variables, ';keys=semi,;,dot,.,comma,,');
		testResolution('{;keys*}', variables, ';semi=;;dot=.;comma=,');
	});

	test('Level 4 - Form-style query with value modifiers', () => {
		// Test cases related to Level 4 features
		const variables = {
			var: 'value',
			list: ['red', 'green', 'blue'],
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('{?var:3}', variables, '?var=val');
		testResolution('{?list}', variables, '?list=red,green,blue');
		testResolution('{?list*}', variables, '?list=red&list=green&list=blue');
		testResolution('{?keys}', variables, '?keys=semi,;,dot,.,comma,,');
		testResolution('{?keys*}', variables, '?semi=;&dot=.&comma=,');
	});

	test('Level 4 - Form-style query continuation with value modifiers', () => {
		// Test cases related to Level 4 features
		const variables = {
			var: 'value',
			list: ['red', 'green', 'blue'],
			keys: {
				semi: ';',
				dot: '.',
				comma: ','
			}
		};

		testResolution('?fixed=yes{&var:3}', variables, '?fixed=yes&var=val');
		testResolution('?fixed=yes{&list}', variables, '?fixed=yes&list=red,green,blue');
		testResolution('?fixed=yes{&list*}', variables, '?fixed=yes&list=red&list=green&list=blue');
		testResolution('?fixed=yes{&keys}', variables, '?fixed=yes&keys=semi,;,dot,.,comma,,');
		testResolution('?fixed=yes{&keys*}', variables, '?fixed=yes&semi=;&dot=.&comma=,');
	});

	test('handling undefined or null values', () => {
		// Test handling of undefined/null values for different operators
		const variables = {
			defined: 'value',
			undef: undefined,
			null: null,
			empty: ''
		};

		// Simple string expansion
		testResolution('{defined,undef,null,empty}', variables, 'value,');

		// Reserved expansion
		testResolution('{+defined,undef,null,empty}', variables, 'value,');

		// Fragment expansion
		testResolution('{#defined,undef,null,empty}', variables, '#value,');

		// Label expansion
		testResolution('X{.defined,undef,null,empty}', variables, 'X.value');

		// Path segments
		testResolution('{/defined,undef,null}', variables, '/value');

		// Path-style parameters
		testResolution('{;defined,empty}', variables, ';defined=value;empty');

		// Form-style query
		testResolution('{?defined,undef,null,empty}', variables, '?defined=value&undef=&null=&empty=');

		// Form-style query continuation
		testResolution('{&defined,undef,null,empty}', variables, '&defined=value&undef=&null=&empty=');
	});

	test('complex templates', () => {
		// Test more complex template combinations
		const variables = {
			domain: 'example.com',
			user: 'fred',
			path: ['path', 'to', 'resource'],
			query: 'search',
			page: 5,
			lang: 'en',
			sessionId: '123abc',
			filters: ['color:blue', 'shape:square'],
			coordinates: { lat: '37.7', lon: '-122.4' }
		};

		// RESTful URL pattern
		testResolution('https://{domain}/api/v1/users/{user}{/path*}{?query,page,lang}',
			variables,
			'https://example.com/api/v1/users/fred/path/to/resource?query=search&page=5&lang=en');

		// Complex query parameters
		testResolution('https://{domain}/search{?query,filters,coordinates*}',
			variables,
			'https://example.com/search?query=search&filters=color:blue,shape:square&lat=37.7&lon=-122.4');

		// Multiple expression types
		testResolution('https://{domain}/users/{user}/profile{.lang}{?sessionId}{#path}',
			variables,
			'https://example.com/users/fred/profile.en?sessionId=123abc#path,to,resource');
	});

	test('literals and escaping', () => {
		// Test literal segments and escaping
		testParsing('http://example.com/literal', []);
		testParsing('http://example.com/{var}literal{var2}', [
			{
				expression: '{var}',
				operator: '',
				variables: [{ explodable: false, name: 'var', optional: false, prefixLength: undefined, repeatable: false }]
			},
			{
				expression: '{var2}',
				operator: '',
				variables: [{ explodable: false, name: 'var2', optional: false, prefixLength: undefined, repeatable: false }]
			}
		]);

		// Test that escaped braces are treated as literals
		// Note: The current implementation might not handle this case
		testResolution('http://example.com/{{var}}', { var: 'value' }, 'http://example.com/{var}');
	});

	test('edge cases', () => {
		// Empty template
		testResolution('', {}, '');

		// Template with only literals
		testResolution('http://example.com/path', {}, 'http://example.com/path');

		// No variables provided for resolution
		testResolution('{var}', {}, '');

		// Multiple sequential expressions
		testResolution('{a}{b}{c}', { a: '1', b: '2', c: '3' }, '123');

		// Expressions with special characters in variable names
		testResolution('{_hidden.var-name$}', { '_hidden.var-name$': 'value' }, 'value');
	});
});
