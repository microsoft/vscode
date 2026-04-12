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
    function testParsing(template, expectedComponents) {
        const templ = UriTemplate.parse(template);
        assert.deepStrictEqual(templ.components.filter(c => typeof c === 'object'), expectedComponents);
        return templ;
    }
    /**
     * Helper function to test template resolution
     */
    function testResolution(template, variables, expected) {
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
        testResolution('https://{domain}/api/v1/users/{user}{/path*}{?query,page,lang}', variables, 'https://example.com/api/v1/users/fred/path/to/resource?query=search&page=5&lang=en');
        // Complex query parameters
        testResolution('https://{domain}/search{?query,filters,coordinates*}', variables, 'https://example.com/search?query=search&filters=color:blue,shape:square&lat=37.7&lon=-122.4');
        // Multiple expression types
        testResolution('https://{domain}/users/{user}/profile{.lang}{?sessionId}{#path}', variables, 'https://example.com/users/fred/profile.en?sessionId=123abc#path,to,resource');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpVGVtcGxhdGUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC90ZXN0L2NvbW1vbi91cmlUZW1wbGF0ZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUVqQyxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUN6Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDOztPQUVHO0lBQ0gsU0FBUyxXQUFXLENBQUMsUUFBZ0IsRUFBRSxrQkFBNkI7UUFDbkUsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssUUFBUSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNoRyxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRDs7T0FFRztJQUNILFNBQVMsY0FBYyxDQUFDLFFBQWdCLEVBQUUsU0FBOEIsRUFBRSxRQUFnQjtRQUN6RixNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELElBQUksQ0FBQyxvQkFB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