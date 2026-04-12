/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Choice, FormatString, Placeholder, Scanner, SnippetParser, Text, TextmateSnippet, Transform, Variable } from '../../browser/snippetParser.js';
suite('SnippetParser', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Scanner', () => {
        const scanner = new Scanner();
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('abc');
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('{{abc}}');
        assert.strictEqual(scanner.next().type, 3 /* TokenType.CurlyOpen */);
        assert.strictEqual(scanner.next().type, 3 /* TokenType.CurlyOpen */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 4 /* TokenType.CurlyClose */);
        assert.strictEqual(scanner.next().type, 4 /* TokenType.CurlyClose */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('abc() ');
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 10 /* TokenType.Format */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('abc 123');
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 10 /* TokenType.Format */);
        assert.strictEqual(scanner.next().type, 8 /* TokenType.Int */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('$foo');
        assert.strictEqual(scanner.next().type, 0 /* TokenType.Dollar */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('$foo_bar');
        assert.strictEqual(scanner.next().type, 0 /* TokenType.Dollar */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('$foo-bar');
        assert.strictEqual(scanner.next().type, 0 /* TokenType.Dollar */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 12 /* TokenType.Dash */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('${foo}');
        assert.strictEqual(scanner.next().type, 0 /* TokenType.Dollar */);
        assert.strictEqual(scanner.next().type, 3 /* TokenType.CurlyOpen */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 4 /* TokenType.CurlyClose */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('${1223:foo}');
        assert.strictEqual(scanner.next().type, 0 /* TokenType.Dollar */);
        assert.strictEqual(scanner.next().type, 3 /* TokenType.CurlyOpen */);
        assert.strictEqual(scanner.next().type, 8 /* TokenType.Int */);
        assert.strictEqual(scanner.next().type, 1 /* TokenType.Colon */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 4 /* TokenType.CurlyClose */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
        scanner.text('\\${}');
        assert.strictEqual(scanner.next().type, 5 /* TokenType.Backslash */);
        assert.strictEqual(scanner.next().type, 0 /* TokenType.Dollar */);
        assert.strictEqual(scanner.next().type, 3 /* TokenType.CurlyOpen */);
        assert.strictEqual(scanner.next().type, 4 /* TokenType.CurlyClose */);
        scanner.text('${foo/regex/format/option}');
        assert.strictEqual(scanner.next().type, 0 /* TokenType.Dollar */);
        assert.strictEqual(scanner.next().type, 3 /* TokenType.CurlyOpen */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 6 /* TokenType.Forwardslash */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 6 /* TokenType.Forwardslash */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 6 /* TokenType.Forwardslash */);
        assert.strictEqual(scanner.next().type, 9 /* TokenType.VariableName */);
        assert.strictEqual(scanner.next().type, 4 /* TokenType.CurlyClose */);
        assert.strictEqual(scanner.next().type, 14 /* TokenType.EOF */);
    });
    function assertText(value, expected) {
        const actual = SnippetParser.asInsertText(value);
        assert.strictEqual(actual, expected);
    }
    function assertMarker(input, ...ctors) {
        let marker;
        if (input instanceof TextmateSnippet) {
            marker = [...input.children];
        }
        else if (typeof input === 'string') {
            const p = new SnippetParser();
            marker = p.parse(input).children;
        }
        else {
            marker = [...input];
        }
        while (marker.length > 0) {
            const m = marker.pop();
            const ctor = ctors.pop();
            assert.ok(m instanceof ctor);
        }
        assert.strictEqual(marker.length, ctors.length);
        assert.strictEqual(marker.length, 0);
    }
    function assertTextAndMarker(value, escaped, ...ctors) {
        assertText(value, escaped);
        assertMarker(value, ...ctors);
    }
    function assertEscaped(value, expected) {
        const actual = SnippetParser.escape(value);
        assert.strictEqual(actual, expected);
    }
    test('Parser, escaped', function () {
        assertEscaped('foo$0', 'foo\\$0');
        assertEscaped('foo\\$0', 'foo\\\\\\$0');
        assertEscaped('f$1oo$0', 'f\\$1oo\\$0');
        assertEscaped('${1:foo}$0', '\\${1:foo\\}\\$0');
        assertEscaped('$', '\\$');
    });
    test('Parser, text', () => {
        assertText('$', '$');
        assertText('\\\\$', '\\$');
        assertText('{', '{');
        assertText('\\}', '}');
        assertText('\\abc', '\\abc');
        assertText('foo${f:\\}}bar', 'foo}bar');
        assertText('\\{', '\\{');
        assertText('I need \\\\\\$', 'I need \\$');
        assertText('\\', '\\');
        assertText('\\{{', '\\{{');
        assertText('{{', '{{');
        assertText('{{dd', '{{dd');
        assertText('}}', '}}');
        assertText('ff}}', 'ff}}');
        assertText('farboo', 'farboo');
        assertText('far{{}}boo', 'far{{}}boo');
        assertText('far{{123}}boo', 'far{{123}}boo');
        assertText('far\\{{123}}boo', 'far\\{{123}}boo');
        assertText('far{{id:bern}}boo', 'far{{id:bern}}boo');
        assertText('far{{id:bern {{basel}}}}boo', 'far{{id:bern {{basel}}}}boo');
        assertText('far{{id:bern {{id:basel}}}}boo', 'far{{id:bern {{id:basel}}}}boo');
        assertText('far{{id:bern {{id2:basel}}}}boo', 'far{{id:bern {{id2:basel}}}}boo');
    });
    test('Parser, TM text', () => {
        assertTextAndMarker('foo${1:bar}}', 'foobar}', Text, Placeholder, Text);
        assertTextAndMarker('foo${1:bar}${2:foo}}', 'foobarfoo}', Text, Placeholder, Placeholder, Text);
        assertTextAndMarker('foo${1:bar\\}${2:foo}}', 'foobar}foo', Text, Placeholder);
        const [, placeholder] = new SnippetParser().parse('foo${1:bar\\}${2:foo}}').children;
        const { children } = placeholder;
        assert.strictEqual(placeholder.index, 1);
        assert.ok(children[0] instanceof Text);
        assert.strictEqual(children[0].toString(), 'bar}');
        assert.ok(children[1] instanceof Placeholder);
        assert.strictEqual(children[1].toString(), 'foo');
    });
    test('Parser, placeholder', () => {
        assertTextAndMarker('farboo', 'farboo', Text);
        assertTextAndMarker('far{{}}boo', 'far{{}}boo', Text);
        assertTextAndMarker('far{{123}}boo', 'far{{123}}boo', Text);
        assertTextAndMarker('far\\{{123}}boo', 'far\\{{123}}boo', Text);
    });
    test('Parser, literal code', () => {
        assertTextAndMarker('far`123`boo', 'far`123`boo', Text);
        assertTextAndMarker('far\\`123\\`boo', 'far\\`123\\`boo', Text);
    });
    test('Parser, variables/tabstop', () => {
        assertTextAndMarker('$far-boo', '-boo', Variable, Text);
        assertTextAndMarker('\\$far-boo', '$far-boo', Text);
        assertTextAndMarker('far$farboo', 'far', Text, Variable);
        assertTextAndMarker('far${farboo}', 'far', Text, Variable);
        assertTextAndMarker('$123', '', Placeholder);
        assertTextAndMarker('$farboo', '', Variable);
        assertTextAndMarker('$far12boo', '', Variable);
        assertTextAndMarker('000_${far}_000', '000__000', Text, Variable, Text);
        assertTextAndMarker('FFF_${TM_SELECTED_TEXT}_FFF$0', 'FFF__FFF', Text, Variable, Text, Placeholder);
    });
    test('Parser, variables/placeholder with defaults', () => {
        assertTextAndMarker('${name:value}', 'value', Variable);
        assertTextAndMarker('${1:value}', 'value', Placeholder);
        assertTextAndMarker('${1:bar${2:foo}bar}', 'barfoobar', Placeholder);
        assertTextAndMarker('${name:value', '${name:value', Text);
        assertTextAndMarker('${1:bar${2:foobar}', '${1:barfoobar', Text, Placeholder);
    });
    test('Parser, variable transforms', function () {
        assertTextAndMarker('${foo///}', '', Variable);
        assertTextAndMarker('${foo/regex/format/gmi}', '', Variable);
        assertTextAndMarker('${foo/([A-Z][a-z])/format/}', '', Variable);
        // invalid regex
        assertTextAndMarker('${foo/([A-Z][a-z])/format/GMI}', '${foo/([A-Z][a-z])/format/GMI}', Text);
        assertTextAndMarker('${foo/([A-Z][a-z])/format/funky}', '${foo/([A-Z][a-z])/format/funky}', Text);
        assertTextAndMarker('${foo/([A-Z][a-z]/format/}', '${foo/([A-Z][a-z]/format/}', Text);
        // tricky regex
        assertTextAndMarker('${foo/m\\/atch/$1/i}', '', Variable);
        assertMarker('${foo/regex\/format/options}', Text);
        // incomplete
        assertTextAndMarker('${foo///', '${foo///', Text);
        assertTextAndMarker('${foo/regex/format/options', '${foo/regex/format/options', Text);
        // format string
        assertMarker('${foo/.*/${0:fooo}/i}', Variable);
        assertMarker('${foo/.*/${1}/i}', Variable);
        assertMarker('${foo/.*/$1/i}', Variable);
        assertMarker('${foo/.*/This-$1-encloses/i}', Variable);
        assertMarker('${foo/.*/complex${1:else}/i}', Variable);
        assertMarker('${foo/.*/complex${1:-else}/i}', Variable);
        assertMarker('${foo/.*/complex${1:+if}/i}', Variable);
        assertMarker('${foo/.*/complex${1:?if:else}/i}', Variable);
        assertMarker('${foo/.*/complex${1:/upcase}/i}', Variable);
    });
    test('Parser, placeholder transforms', function () {
        assertTextAndMarker('${1///}', '', Placeholder);
        assertTextAndMarker('${1/regex/format/gmi}', '', Placeholder);
        assertTextAndMarker('${1/([A-Z][a-z])/format/}', '', Placeholder);
        // tricky regex
        assertTextAndMarker('${1/m\\/atch/$1/i}', '', Placeholder);
        assertMarker('${1/regex\/format/options}', Text);
        // incomplete
        assertTextAndMarker('${1///', '${1///', Text);
        assertTextAndMarker('${1/regex/format/options', '${1/regex/format/options', Text);
    });
    test('No way to escape forward slash in snippet regex #36715', function () {
        assertMarker('${TM_DIRECTORY/src\\//$1/}', Variable);
    });
    test('No way to escape forward slash in snippet format section #37562', function () {
        assertMarker('${TM_SELECTED_TEXT/a/\\/$1/g}', Variable);
        assertMarker('${TM_SELECTED_TEXT/a/in\\/$1ner/g}', Variable);
        assertMarker('${TM_SELECTED_TEXT/a/end\\//g}', Variable);
    });
    test('Parser, placeholder with choice', () => {
        assertTextAndMarker('${1|one,two,three|}', 'one', Placeholder);
        assertTextAndMarker('${1|one|}', 'one', Placeholder);
        assertTextAndMarker('${1|one1,two2|}', 'one1', Placeholder);
        assertTextAndMarker('${1|one1\\,two2|}', 'one1,two2', Placeholder);
        assertTextAndMarker('${1|one1\\|two2|}', 'one1|two2', Placeholder);
        assertTextAndMarker('${1|one1\\atwo2|}', 'one1\\atwo2', Placeholder);
        assertTextAndMarker('${1|one,two,three,|}', '${1|one,two,three,|}', Text);
        assertTextAndMarker('${1|one,', '${1|one,', Text);
        const snippet = new SnippetParser().parse('${1|one,two,three|}');
        const expected = [
            m => m instanceof Placeholder,
            m => m instanceof Choice && m.options.length === 3 && m.options.every(x => x instanceof Text),
        ];
        snippet.walk(marker => {
            assert.ok(expected.shift()(marker));
            return true;
        });
    });
    test('Snippet choices: unable to escape comma and pipe, #31521', function () {
        assertTextAndMarker('console.log(${1|not\\, not, five, 5, 1   23|});', 'console.log(not, not);', Text, Placeholder, Text);
    });
    test('Marker, toTextmateString()', function () {
        function assertTextsnippetString(input, expected) {
            const snippet = new SnippetParser().parse(input);
            const actual = snippet.toTextmateString();
            assert.strictEqual(actual, expected);
        }
        assertTextsnippetString('$1', '$1');
        assertTextsnippetString('\\$1', '\\$1');
        assertTextsnippetString('console.log(${1|not\\, not, five, 5, 1   23|});', 'console.log(${1|not\\, not, five, 5, 1   23|});');
        assertTextsnippetString('console.log(${1|not\\, not, \\| five, 5, 1   23|});', 'console.log(${1|not\\, not, \\| five, 5, 1   23|});');
        assertTextsnippetString('${1|cho\\,ices,wi\\|th,esc\\\\aping,chall\\\\\\,enges|}', '${1|cho\\,ices,wi\\|th,esc\\\\aping,chall\\\\\\,enges|}');
        assertTextsnippetString('this is text', 'this is text');
        assertTextsnippetString('this ${1:is ${2:nested with $var}}', 'this ${1:is ${2:nested with ${var}}}');
        assertTextsnippetString('this ${1:is ${2:nested with $var}}}', 'this ${1:is ${2:nested with ${var}}}\\}');
    });
    test('Marker, toTextmateString() <-> identity', function () {
        function assertIdent(input) {
            // full loop: (1) parse input, (2) generate textmate string, (3) parse, (4) ensure both trees are equal
            const snippet = new SnippetParser().parse(input);
            const input2 = snippet.toTextmateString();
            const snippet2 = new SnippetParser().parse(input2);
            function checkCheckChildren(marker1, marker2) {
                assert.ok(marker1 instanceof Object.getPrototypeOf(marker2).constructor);
                assert.ok(marker2 instanceof Object.getPrototypeOf(marker1).constructor);
                assert.strictEqual(marker1.children.length, marker2.children.length);
                assert.strictEqual(marker1.toString(), marker2.toString());
                for (let i = 0; i < marker1.children.length; i++) {
                    checkCheckChildren(marker1.children[i], marker2.children[i]);
                }
            }
            checkCheckChildren(snippet, snippet2);
        }
        assertIdent('$1');
        assertIdent('\\$1');
        assertIdent('console.log(${1|not\\, not, five, 5, 1   23|});');
        assertIdent('console.log(${1|not\\, not, \\| five, 5, 1   23|});');
        assertIdent('this is text');
        assertIdent('this ${1:is ${2:nested with $var}}');
        assertIdent('this ${1:is ${2:nested with $var}}}');
        assertIdent('this ${1:is ${2:nested with $var}} and repeating $1');
    });
    test('Parser, choise marker', () => {
        const { placeholders } = new SnippetParser().parse('${1|one,two,three|}');
        assert.strictEqual(placeholders.length, 1);
        assert.ok(placeholders[0].choice instanceof Choice);
        assert.ok(placeholders[0].children[0] instanceof Choice);
        assert.strictEqual(placeholders[0].children[0].options.length, 3);
        assertText('${1|one,two,three|}', 'one');
        assertText('\\${1|one,two,three|}', '${1|one,two,three|}');
        assertText('${1\\|one,two,three|}', '${1\\|one,two,three|}');
        assertText('${1||}', '${1||}');
    });
    test('Backslash character escape in choice tabstop doesn\'t work #58494', function () {
        const { placeholders } = new SnippetParser().parse('${1|\\,,},$,\\|,\\\\|}');
        assert.strictEqual(placeholders.length, 1);
        assert.ok(placeholders[0].choice instanceof Choice);
    });
    test('Parser, only textmate', () => {
        const p = new SnippetParser();
        assertMarker(p.parse('far{{}}boo'), Text);
        assertMarker(p.parse('far{{123}}boo'), Text);
        assertMarker(p.parse('far\\{{123}}boo'), Text);
        assertMarker(p.parse('far$0boo'), Text, Placeholder, Text);
        assertMarker(p.parse('far${123}boo'), Text, Placeholder, Text);
        assertMarker(p.parse('far\\${123}boo'), Text);
    });
    test('Parser, real world', () => {
        let marker = new SnippetParser().parse('console.warn(${1: $TM_SELECTED_TEXT })').children;
        assert.strictEqual(marker[0].toString(), 'console.warn(');
        assert.ok(marker[1] instanceof Placeholder);
        assert.strictEqual(marker[2].toString(), ')');
        const placeholder = marker[1];
        assert.strictEqual(placeholder.index, 1);
        assert.strictEqual(placeholder.children.length, 3);
        assert.ok(placeholder.children[0] instanceof Text);
        assert.ok(placeholder.children[1] instanceof Variable);
        assert.ok(placeholder.children[2] instanceof Text);
        assert.strictEqual(placeholder.children[0].toString(), ' ');
        assert.strictEqual(placeholder.children[1].toString(), '');
        assert.strictEqual(placeholder.children[2].toString(), ' ');
        const nestedVariable = placeholder.children[1];
        assert.strictEqual(nestedVariable.name, 'TM_SELECTED_TEXT');
        assert.strictEqual(nestedVariable.children.length, 0);
        marker = new SnippetParser().parse('$TM_SELECTED_TEXT').children;
        assert.strictEqual(marker.length, 1);
        assert.ok(marker[0] instanceof Variable);
    });
    test('Parser, transform example', () => {
        const { children } = new SnippetParser().parse('${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0');
        //${1:name}
        assert.ok(children[0] instanceof Placeholder);
        assert.strictEqual(children[0].children.length, 1);
        assert.strictEqual(children[0].children[0].toString(), 'name');
        assert.strictEqual(children[0].transform, undefined);
        // :
        assert.ok(children[1] instanceof Text);
        assert.strictEqual(children[1].toString(), ' : ');
        //${2:type}
        assert.ok(children[2] instanceof Placeholder);
        assert.strictEqual(children[2].children.length, 1);
        assert.strictEqual(children[2].children[0].toString(), 'type');
        //${3/\\s:=(.*)/${1:+ :=}${1}/}
        assert.ok(children[3] instanceof Placeholder);
        assert.strictEqual(children[3].children.length, 0);
        assert.notStrictEqual(children[3].transform, undefined);
        const transform = children[3].transform;
        assert.deepStrictEqual(transform.regexp, /\s:=(.*)/);
        assert.strictEqual(transform.children.length, 2);
        assert.ok(transform.children[0] instanceof FormatString);
        assert.strictEqual(transform.children[0].index, 1);
        assert.strictEqual(transform.children[0].ifValue, ' :=');
        assert.ok(transform.children[1] instanceof FormatString);
        assert.strictEqual(transform.children[1].index, 1);
        assert.ok(children[4] instanceof Text);
        assert.strictEqual(children[4].toString(), ';\n');
    });
    // TODO @jrieken making this strictEqul causes circular json conversion errors
    test('Parser, default placeholder values', () => {
        assertMarker('errorContext: `${1:err}`, error: $1', Text, Placeholder, Text, Placeholder);
        const [, p1, , p2] = new SnippetParser().parse('errorContext: `${1:err}`, error:$1').children;
        assert.strictEqual(p1.index, 1);
        assert.strictEqual(p1.children.length, 1);
        assert.strictEqual(p1.children[0].toString(), 'err');
        assert.strictEqual(p2.index, 1);
        assert.strictEqual(p2.children.length, 1);
        assert.strictEqual(p2.children[0].toString(), 'err');
    });
    // TODO @jrieken making this strictEqul causes circular json conversion errors
    test('Parser, default placeholder values and one transform', () => {
        assertMarker('errorContext: `${1:err}`, error: ${1/err/ok/}', Text, Placeholder, Text, Placeholder);
        const [, p3, , p4] = new SnippetParser().parse('errorContext: `${1:err}`, error:${1/err/ok/}').children;
        assert.strictEqual(p3.index, 1);
        assert.strictEqual(p3.children.length, 1);
        assert.strictEqual(p3.children[0].toString(), 'err');
        assert.strictEqual(p3.transform, undefined);
        assert.strictEqual(p4.index, 1);
        assert.strictEqual(p4.children.length, 1);
        assert.strictEqual(p4.children[0].toString(), 'err');
        assert.notStrictEqual(p4.transform, undefined);
    });
    test('Repeated snippet placeholder should always inherit, #31040', function () {
        assertText('${1:foo}-abc-$1', 'foo-abc-foo');
        assertText('${1:foo}-abc-${1}', 'foo-abc-foo');
        assertText('${1:foo}-abc-${1:bar}', 'foo-abc-foo');
        assertText('${1}-abc-${1:foo}', 'foo-abc-foo');
    });
    test('backspace esapce in TM only, #16212', () => {
        const actual = SnippetParser.asInsertText('Foo \\\\${abc}bar');
        assert.strictEqual(actual, 'Foo \\bar');
    });
    test('colon as variable/placeholder value, #16717', () => {
        let actual = SnippetParser.asInsertText('${TM_SELECTED_TEXT:foo:bar}');
        assert.strictEqual(actual, 'foo:bar');
        actual = SnippetParser.asInsertText('${1:foo:bar}');
        assert.strictEqual(actual, 'foo:bar');
    });
    test('incomplete placeholder', () => {
        assertTextAndMarker('${1:}', '', Placeholder);
    });
    test('marker#len', () => {
        function assertLen(template, ...lengths) {
            const snippet = new SnippetParser().parse(template, true);
            snippet.walk(m => {
                const expected = lengths.shift();
                assert.strictEqual(m.len(), expected);
                return true;
            });
            assert.strictEqual(lengths.length, 0);
        }
        assertLen('text$0', 4, 0);
        assertLen('$1text$0', 0, 4, 0);
        assertLen('te$1xt$0', 2, 0, 2, 0);
        assertLen('errorContext: `${1:err}`, error: $0', 15, 0, 3, 10, 0);
        assertLen('errorContext: `${1:err}`, error: $1$0', 15, 0, 3, 10, 0, 3, 0);
        assertLen('$TM_SELECTED_TEXT$0', 0, 0);
        assertLen('${TM_SELECTED_TEXT:def}$0', 0, 3, 0);
    });
    test('parser, parent node', function () {
        let snippet = new SnippetParser().parse('This ${1:is ${2:nested}}$0', true);
        assert.strictEqual(snippet.placeholders.length, 3);
        let [first, second] = snippet.placeholders;
        assert.strictEqual(first.index, 1);
        assert.strictEqual(second.index, 2);
        assert.ok(second.parent === first);
        assert.ok(first.parent === snippet);
        snippet = new SnippetParser().parse('${VAR:default${1:value}}$0', true);
        assert.strictEqual(snippet.placeholders.length, 2);
        [first] = snippet.placeholders;
        assert.strictEqual(first.index, 1);
        assert.ok(snippet.children[0] instanceof Variable);
        assert.ok(first.parent === snippet.children[0]);
    });
    test('TextmateSnippet#enclosingPlaceholders', () => {
        const snippet = new SnippetParser().parse('This ${1:is ${2:nested}}$0', true);
        const [first, second] = snippet.placeholders;
        assert.deepStrictEqual(snippet.enclosingPlaceholders(first), []);
        assert.deepStrictEqual(snippet.enclosingPlaceholders(second), [first]);
    });
    test('TextmateSnippet#offset', () => {
        let snippet = new SnippetParser().parse('te$1xt', true);
        assert.strictEqual(snippet.offset(snippet.children[0]), 0);
        assert.strictEqual(snippet.offset(snippet.children[1]), 2);
        assert.strictEqual(snippet.offset(snippet.children[2]), 2);
        snippet = new SnippetParser().parse('${TM_SELECTED_TEXT:def}', true);
        assert.strictEqual(snippet.offset(snippet.children[0]), 0);
        assert.strictEqual(snippet.offset(snippet.children[0].children[0]), 0);
        // forgein marker
        assert.strictEqual(snippet.offset(new Text('foo')), -1);
    });
    test('TextmateSnippet#placeholder', () => {
        let snippet = new SnippetParser().parse('te$1xt$0', true);
        let placeholders = snippet.placeholders;
        assert.strictEqual(placeholders.length, 2);
        snippet = new SnippetParser().parse('te$1xt$1$0', true);
        placeholders = snippet.placeholders;
        assert.strictEqual(placeholders.length, 3);
        snippet = new SnippetParser().parse('te$1xt$2$0', true);
        placeholders = snippet.placeholders;
        assert.strictEqual(placeholders.length, 3);
        snippet = new SnippetParser().parse('${1:bar${2:foo}bar}$0', true);
        placeholders = snippet.placeholders;
        assert.strictEqual(placeholders.length, 3);
    });
    test('TextmateSnippet#replace 1/2', function () {
        const snippet = new SnippetParser().parse('aaa${1:bbb${2:ccc}}$0', true);
        assert.strictEqual(snippet.placeholders.length, 3);
        const [, second] = snippet.placeholders;
        assert.strictEqual(second.index, 2);
        const enclosing = snippet.enclosingPlaceholders(second);
        assert.strictEqual(enclosing.length, 1);
        assert.strictEqual(enclosing[0].index, 1);
        const nested = new SnippetParser().parse('ddd$1eee$0', true);
        snippet.replace(second, nested.children);
        assert.strictEqual(snippet.toString(), 'aaabbbdddeee');
        assert.strictEqual(snippet.placeholders.length, 4);
        assert.strictEqual(snippet.placeholders[0].index, 1);
        assert.strictEqual(snippet.placeholders[1].index, 1);
        assert.strictEqual(snippet.placeholders[2].index, 0);
        assert.strictEqual(snippet.placeholders[3].index, 0);
        const newEnclosing = snippet.enclosingPlaceholders(snippet.placeholders[1]);
        assert.ok(newEnclosing[0] === snippet.placeholders[0]);
        assert.strictEqual(newEnclosing.length, 1);
        assert.strictEqual(newEnclosing[0].index, 1);
    });
    test('TextmateSnippet#replace 2/2', function () {
        const snippet = new SnippetParser().parse('aaa${1:bbb${2:ccc}}$0', true);
        assert.strictEqual(snippet.placeholders.length, 3);
        const [, second] = snippet.placeholders;
        assert.strictEqual(second.index, 2);
        const nested = new SnippetParser().parse('dddeee$0', true);
        snippet.replace(second, nested.children);
        assert.strictEqual(snippet.toString(), 'aaabbbdddeee');
        assert.strictEqual(snippet.placeholders.length, 3);
    });
    test('Snippet order for placeholders, #28185', function () {
        const _10 = new Placeholder(10);
        const _2 = new Placeholder(2);
        assert.strictEqual(Placeholder.compareByIndex(_10, _2), 1);
    });
    test('Maximum call stack size exceeded, #28983', function () {
        new SnippetParser().parse('${1:${foo:${1}}}');
    });
    test('Snippet can freeze the editor, #30407', function () {
        const seen = new Set();
        seen.clear();
        new SnippetParser().parse('class ${1:${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}} < ${2:Application}Controller\n  $3\nend').walk(marker => {
            assert.ok(!seen.has(marker));
            seen.add(marker);
            return true;
        });
        seen.clear();
        new SnippetParser().parse('${1:${FOO:abc$1def}}').walk(marker => {
            assert.ok(!seen.has(marker));
            seen.add(marker);
            return true;
        });
    });
    test('Snippets: make parser ignore `${0|choice|}`, #31599', function () {
        assertTextAndMarker('${0|foo,bar|}', '${0|foo,bar|}', Text);
        assertTextAndMarker('${1|foo,bar|}', 'foo', Placeholder);
    });
    test('Transform -> FormatString#resolve', function () {
        // shorthand functions
        assert.strictEqual(new FormatString(1, 'upcase').resolve('foo'), 'FOO');
        assert.strictEqual(new FormatString(1, 'downcase').resolve('FOO'), 'foo');
        assert.strictEqual(new FormatString(1, 'capitalize').resolve('bar'), 'Bar');
        assert.strictEqual(new FormatString(1, 'capitalize').resolve('bar no repeat'), 'Bar no repeat');
        assert.strictEqual(new FormatString(1, 'pascalcase').resolve('bar-foo'), 'BarFoo');
        assert.strictEqual(new FormatString(1, 'pascalcase').resolve('bar-42-foo'), 'Bar42Foo');
        assert.strictEqual(new FormatString(1, 'pascalcase').resolve('snake_AndPascalCase'), 'SnakeAndPascalCase');
        assert.strictEqual(new FormatString(1, 'pascalcase').resolve('kebab-AndPascalCase'), 'KebabAndPascalCase');
        assert.strictEqual(new FormatString(1, 'pascalcase').resolve('_justPascalCase'), 'JustPascalCase');
        assert.strictEqual(new FormatString(1, 'camelcase').resolve('bar-foo'), 'barFoo');
        assert.strictEqual(new FormatString(1, 'camelcase').resolve('bar-42-foo'), 'bar42Foo');
        assert.strictEqual(new FormatString(1, 'camelcase').resolve('snake_AndCamelCase'), 'snakeAndCamelCase');
        assert.strictEqual(new FormatString(1, 'camelcase').resolve('kebab-AndCamelCase'), 'kebabAndCamelCase');
        assert.strictEqual(new FormatString(1, 'camelcase').resolve('_JustCamelCase'), 'justCamelCase');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('barFoo'), 'bar-foo');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('BarFoo'), 'bar-foo');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('ABarFoo'), 'a-bar-foo');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('bar42Foo'), 'bar42-foo');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('snake_AndPascalCase'), 'snake-and-pascal-case');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('kebab-AndCamelCase'), 'kebab-and-camel-case');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('_justPascalCase'), 'just-pascal-case');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('__UPCASE__'), 'upcase');
        assert.strictEqual(new FormatString(1, 'kebabcase').resolve('__BAR_FOO__'), 'bar-foo');
        assert.strictEqual(new FormatString(1, 'snakecase').resolve('bar-foo'), 'bar_foo');
        assert.strictEqual(new FormatString(1, 'snakecase').resolve('bar-42-foo'), 'bar_42_foo');
        assert.strictEqual(new FormatString(1, 'snakecase').resolve('snake_AndPascalCase'), 'snake_and_pascal_case');
        assert.strictEqual(new FormatString(1, 'snakecase').resolve('kebab-AndPascalCase'), 'kebab_and_pascal_case');
        assert.strictEqual(new FormatString(1, 'snakecase').resolve('_justPascalCase'), '_just_pascal_case');
        assert.strictEqual(new FormatString(1, 'notKnown').resolve('input'), 'input');
        // if
        assert.strictEqual(new FormatString(1, undefined, 'foo', undefined).resolve(undefined), '');
        assert.strictEqual(new FormatString(1, undefined, 'foo', undefined).resolve(''), '');
        assert.strictEqual(new FormatString(1, undefined, 'foo', undefined).resolve('bar'), 'foo');
        // else
        assert.strictEqual(new FormatString(1, undefined, undefined, 'foo').resolve(undefined), 'foo');
        assert.strictEqual(new FormatString(1, undefined, undefined, 'foo').resolve(''), 'foo');
        assert.strictEqual(new FormatString(1, undefined, undefined, 'foo').resolve('bar'), 'bar');
        // if-else
        assert.strictEqual(new FormatString(1, undefined, 'bar', 'foo').resolve(undefined), 'foo');
        assert.strictEqual(new FormatString(1, undefined, 'bar', 'foo').resolve(''), 'foo');
        assert.strictEqual(new FormatString(1, undefined, 'bar', 'foo').resolve('baz'), 'bar');
    });
    test('Unicode Variable Transformations', () => {
        const resolver = new class {
            resolve(variable) {
                const values = {
                    'RUSSIAN': 'одинДва',
                    'GREEK': 'έναςΔύο',
                    'TURKISH': 'istanbulLı',
                    'JAPANESE': 'こんにちは'
                };
                return values[variable.name];
            }
        };
        function assertTransform(transformName, varName, expected) {
            const p = new SnippetParser();
            const snippet = p.parse(`\${${varName}/(.*)/\${1:/${transformName}}/}`);
            const variable = snippet.children[0];
            variable.resolve(resolver);
            const resolved = variable.toString();
            assert.strictEqual(resolved, expected, `${transformName} failed for ${varName}`);
        }
        assertTransform('kebabcase', 'RUSSIAN', 'один-два');
        assertTransform('kebabcase', 'GREEK', 'ένας-δύο');
        assertTransform('snakecase', 'RUSSIAN', 'один_два');
        assertTransform('snakecase', 'GREEK', 'ένας_δύο');
        assertTransform('camelcase', 'RUSSIAN', 'одинДва');
        assertTransform('camelcase', 'GREEK', 'έναςΔύο');
        assertTransform('pascalcase', 'RUSSIAN', 'ОдинДва');
        assertTransform('pascalcase', 'GREEK', 'ΈναςΔύο');
        assertTransform('upcase', 'RUSSIAN', 'ОДИНДВА');
        assertTransform('downcase', 'RUSSIAN', 'одиндва');
        assertTransform('kebabcase', 'TURKISH', 'istanbul-lı');
        assertTransform('pascalcase', 'TURKISH', 'IstanbulLı');
        assertTransform('upcase', 'JAPANESE', 'こんにちは');
        assertTransform('kebabcase', 'JAPANESE', 'こんにちは');
    });
    test('Snippet variable transformation doesn\'t work if regex is complicated and snippet body contains \'$$\' #55627', function () {
        const snippet = new SnippetParser().parse('const fileName = "${TM_FILENAME/(.*)\\..+$/$1/}"');
        assert.strictEqual(snippet.toTextmateString(), 'const fileName = "${TM_FILENAME/(.*)\\..+$/${1}/}"');
    });
    test('[BUG] HTML attribute suggestions: Snippet session does not have end-position set, #33147', function () {
        const { placeholders } = new SnippetParser().parse('src="$1"', true);
        const [first, second] = placeholders;
        assert.strictEqual(placeholders.length, 2);
        assert.strictEqual(first.index, 1);
        assert.strictEqual(second.index, 0);
    });
    test('Snippet optional transforms are not applied correctly when reusing the same variable, #37702', function () {
        const transform = new Transform();
        transform.appendChild(new FormatString(1, 'upcase'));
        transform.appendChild(new FormatString(2, 'upcase'));
        transform.regexp = /^(.)|-(.)/g;
        assert.strictEqual(transform.resolve('my-file-name'), 'MyFileName');
        const clone = transform.clone();
        assert.strictEqual(clone.resolve('my-file-name'), 'MyFileName');
    });
    test('problem with snippets regex #40570', function () {
        const snippet = new SnippetParser().parse('${TM_DIRECTORY/.*src[\\/](.*)/$1/}');
        assertMarker(snippet, Variable);
    });
    test('Variable transformation doesn\'t work if undefined variables are used in the same snippet #51769', function () {
        const transform = new Transform();
        transform.appendChild(new Text('bar'));
        transform.regexp = new RegExp('foo', 'gi');
        assert.strictEqual(transform.toTextmateString(), '/foo/bar/ig');
    });
    test('Snippet parser freeze #53144', function () {
        const snippet = new SnippetParser().parse('${1/(void$)|(.+)/${1:?-\treturn nil;}/}');
        assertMarker(snippet, Placeholder);
    });
    test('snippets variable not resolved in JSON proposal #52931', function () {
        assertTextAndMarker('FOO${1:/bin/bash}', 'FOO/bin/bash', Text, Placeholder);
    });
    test('Mirroring sequence of nested placeholders not selected properly on backjumping #58736', function () {
        const snippet = new SnippetParser().parse('${3:nest1 ${1:nest2 ${2:nest3}}} $3');
        assert.strictEqual(snippet.children.length, 3);
        assert.ok(snippet.children[0] instanceof Placeholder);
        assert.ok(snippet.children[1] instanceof Text);
        assert.ok(snippet.children[2] instanceof Placeholder);
        function assertParent(marker) {
            marker.children.forEach(assertParent);
            if (!(marker instanceof Placeholder)) {
                return;
            }
            let found = false;
            let m = marker;
            while (m && !found) {
                if (m.parent === snippet) {
                    found = true;
                }
                m = m.parent;
            }
            assert.ok(found);
        }
        const [, , clone] = snippet.children;
        assertParent(clone);
    });
    test('Backspace can\'t be escaped in snippet variable transforms #65412', function () {
        const snippet = new SnippetParser().parse('namespace ${TM_DIRECTORY/[\\/]/\\\\/g};');
        assertMarker(snippet, Text, Variable, Text);
    });
    test('Snippet cannot escape closing bracket inside conditional insertion variable replacement #78883', function () {
        const snippet = new SnippetParser().parse('${TM_DIRECTORY/(.+)/${1:+import { hello \\} from world}/}');
        const variable = snippet.children[0];
        assert.strictEqual(snippet.children.length, 1);
        assert.ok(variable instanceof Variable);
        assert.ok(variable.transform);
        assert.strictEqual(variable.transform.children.length, 1);
        assert.ok(variable.transform.children[0] instanceof FormatString);
        assert.strictEqual(variable.transform.children[0].ifValue, 'import { hello } from world');
        assert.strictEqual(variable.transform.children[0].elseValue, undefined);
    });
    test('Snippet escape backslashes inside conditional insertion variable replacement #80394', function () {
        const snippet = new SnippetParser().parse('${CURRENT_YEAR/(.+)/${1:+\\\\}/}');
        const variable = snippet.children[0];
        assert.strictEqual(snippet.children.length, 1);
        assert.ok(variable instanceof Variable);
        assert.ok(variable.transform);
        assert.strictEqual(variable.transform.children.length, 1);
        assert.ok(variable.transform.children[0] instanceof FormatString);
        assert.strictEqual(variable.transform.children[0].ifValue, '\\');
        assert.strictEqual(variable.transform.children[0].elseValue, undefined);
    });
    test('Snippet placeholder empty right after expansion #152553', function () {
        const snippet = new SnippetParser().parse('${1:prog}: ${2:$1.cc} - $2');
        const actual = snippet.toString();
        assert.strictEqual(actual, 'prog: prog.cc - prog.cc');
        const snippet2 = new SnippetParser().parse('${1:prog}: ${3:${2:$1.cc}.33} - $2 $3');
        const actual2 = snippet2.toString();
        assert.strictEqual(actual2, 'prog: prog.cc.33 - prog.cc prog.cc.33');
        // cyclic references of placeholders
        const snippet3 = new SnippetParser().parse('${1:$2.one} <> ${2:$1.two}');
        const actual3 = snippet3.toString();
        assert.strictEqual(actual3, '.two.one.two.one <> .one.two.one.two');
    });
    test('Snippet choices are incorrectly escaped/applied #180132', function () {
        assertTextAndMarker('${1|aaa$aaa|}bbb\\$bbb', 'aaa$aaabbb$bbb', Placeholder, Text);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldFBhcnNlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc25pcHBldC90ZXN0L2Jyb3dzZXIvc25pcHBldFBhcnNlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBVSxXQUFXLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFhLFNBQVMsRUFBRSxRQUFRLEVBQW9CLE1BQU0sZ0NBQWdDLENBQUM7QUFFNUwsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7SUFFM0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtRQUVwQixNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUkseUJBQWdCLENBQUM7UUFFdkQsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLGlDQUF5QixDQUFDO1FBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUkseUJBQWdCLENBQUM7UUFFdkQsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLDhCQUFzQixDQUFD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