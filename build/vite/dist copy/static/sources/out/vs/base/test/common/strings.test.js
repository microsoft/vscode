/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as strings from '../../common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('Strings', () => {
    test('equalsIgnoreCase', () => {
        assert(strings.equalsIgnoreCase('', ''));
        assert(!strings.equalsIgnoreCase('', '1'));
        assert(!strings.equalsIgnoreCase('1', ''));
        assert(strings.equalsIgnoreCase('a', 'a'));
        assert(strings.equalsIgnoreCase('abc', 'Abc'));
        assert(strings.equalsIgnoreCase('abc', 'ABC'));
        assert(strings.equalsIgnoreCase('Höhenmeter', 'HÖhenmeter'));
        assert(strings.equalsIgnoreCase('ÖL', 'Öl'));
    });
    test('equals', () => {
        assert(!strings.equals(undefined, 'abc'));
        assert(!strings.equals('abc', undefined));
        assert(strings.equals(undefined, undefined));
        assert(strings.equals('', ''));
        assert(strings.equals('a', 'a'));
        assert(!strings.equals('abc', 'Abc'));
        assert(strings.equals('abc', 'ABC', true));
        assert(!strings.equals('Höhenmeter', 'HÖhenmeter'));
        assert(!strings.equals('ÖL', 'Öl'));
        assert(strings.equals('ÖL', 'Öl', true));
    });
    test('startsWithIgnoreCase', () => {
        assert(strings.startsWithIgnoreCase('', ''));
        assert(!strings.startsWithIgnoreCase('', '1'));
        assert(strings.startsWithIgnoreCase('1', ''));
        assert(strings.startsWithIgnoreCase('a', 'a'));
        assert(strings.startsWithIgnoreCase('abc', 'Abc'));
        assert(strings.startsWithIgnoreCase('abc', 'ABC'));
        assert(strings.startsWithIgnoreCase('Höhenmeter', 'HÖhenmeter'));
        assert(strings.startsWithIgnoreCase('ÖL', 'Öl'));
        assert(strings.startsWithIgnoreCase('alles klar', 'a'));
        assert(strings.startsWithIgnoreCase('alles klar', 'A'));
        assert(strings.startsWithIgnoreCase('alles klar', 'alles k'));
        assert(strings.startsWithIgnoreCase('alles klar', 'alles K'));
        assert(strings.startsWithIgnoreCase('alles klar', 'ALLES K'));
        assert(strings.startsWithIgnoreCase('alles klar', 'alles klar'));
        assert(strings.startsWithIgnoreCase('alles klar', 'ALLES KLAR'));
        assert(!strings.startsWithIgnoreCase('alles klar', ' ALLES K'));
        assert(!strings.startsWithIgnoreCase('alles klar', 'ALLES K '));
        assert(!strings.startsWithIgnoreCase('alles klar', 'öALLES K '));
        assert(!strings.startsWithIgnoreCase('alles klar', ' '));
        assert(!strings.startsWithIgnoreCase('alles klar', 'ö'));
    });
    test('endsWithIgnoreCase', () => {
        assert(strings.endsWithIgnoreCase('', ''));
        assert(!strings.endsWithIgnoreCase('', '1'));
        assert(strings.endsWithIgnoreCase('1', ''));
        assert(!strings.endsWithIgnoreCase('abcd', 'abcde'));
        assert(strings.endsWithIgnoreCase('a', 'a'));
        assert(strings.endsWithIgnoreCase('abc', 'Abc'));
        assert(strings.endsWithIgnoreCase('abc', 'ABC'));
        assert(strings.endsWithIgnoreCase('Höhenmeter', 'HÖhenmeter'));
        assert(strings.endsWithIgnoreCase('ÖL', 'Öl'));
        assert(strings.endsWithIgnoreCase('alles klar', 'r'));
        assert(strings.endsWithIgnoreCase('alles klar', 'R'));
        assert(strings.endsWithIgnoreCase('alles klar', 's klar'));
        assert(strings.endsWithIgnoreCase('alles klar', 'S klar'));
        assert(strings.endsWithIgnoreCase('alles klar', 'S KLAR'));
        assert(strings.endsWithIgnoreCase('alles klar', 'alles klar'));
        assert(strings.endsWithIgnoreCase('alles klar', 'ALLES KLAR'));
        assert(!strings.endsWithIgnoreCase('alles klar', 'S KLAR '));
        assert(!strings.endsWithIgnoreCase('alles klar', ' S KLAR'));
        assert(!strings.endsWithIgnoreCase('alles klar', 'S KLARö'));
        assert(!strings.endsWithIgnoreCase('alles klar', ' '));
        assert(!strings.endsWithIgnoreCase('alles klar', 'ö'));
    });
    test('compareIgnoreCase', () => {
        function assertCompareIgnoreCase(a, b, recurse = true) {
            let actual = strings.compareIgnoreCase(a, b);
            actual = actual > 0 ? 1 : actual < 0 ? -1 : actual;
            let expected = strings.compare(a.toLowerCase(), b.toLowerCase());
            expected = expected > 0 ? 1 : expected < 0 ? -1 : expected;
            assert.strictEqual(actual, expected, `${a} <> ${b}`);
            if (recurse) {
                assertCompareIgnoreCase(b, a, false);
            }
        }
        assertCompareIgnoreCase('', '');
        assertCompareIgnoreCase('abc', 'ABC');
        assertCompareIgnoreCase('abc', 'ABc');
        assertCompareIgnoreCase('abc', 'ABcd');
        assertCompareIgnoreCase('abc', 'abcd');
        assertCompareIgnoreCase('foo', 'föo');
        assertCompareIgnoreCase('Code', 'code');
        assertCompareIgnoreCase('Code', 'cöde');
        assertCompareIgnoreCase('B', 'a');
        assertCompareIgnoreCase('a', 'B');
        assertCompareIgnoreCase('b', 'a');
        assertCompareIgnoreCase('a', 'b');
        assertCompareIgnoreCase('aa', 'ab');
        assertCompareIgnoreCase('aa', 'aB');
        assertCompareIgnoreCase('aa', 'aA');
        assertCompareIgnoreCase('a', 'aa');
        assertCompareIgnoreCase('ab', 'aA');
        assertCompareIgnoreCase('O', '/');
    });
    test('compareIgnoreCase (substring)', () => {
        function assertCompareIgnoreCase(a, b, aStart, aEnd, bStart, bEnd, recurse = true) {
            let actual = strings.compareSubstringIgnoreCase(a, b, aStart, aEnd, bStart, bEnd);
            actual = actual > 0 ? 1 : actual < 0 ? -1 : actual;
            let expected = strings.compare(a.toLowerCase().substring(aStart, aEnd), b.toLowerCase().substring(bStart, bEnd));
            expected = expected > 0 ? 1 : expected < 0 ? -1 : expected;
            assert.strictEqual(actual, expected, `${a} <> ${b}`);
            if (recurse) {
                assertCompareIgnoreCase(b, a, bStart, bEnd, aStart, aEnd, false);
            }
        }
        assertCompareIgnoreCase('', '', 0, 0, 0, 0);
        assertCompareIgnoreCase('abc', 'ABC', 0, 1, 0, 1);
        assertCompareIgnoreCase('abc', 'Aabc', 0, 3, 1, 4);
        assertCompareIgnoreCase('abcABc', 'ABcd', 3, 6, 0, 4);
    });
    test('format', () => {
        assert.strictEqual(strings.format('Foo Bar'), 'Foo Bar');
        assert.strictEqual(strings.format('Foo {0} Bar'), 'Foo {0} Bar');
        assert.strictEqual(strings.format('Foo {0} Bar', 'yes'), 'Foo yes Bar');
        assert.strictEqual(strings.format('Foo {0} Bar {0}', 'yes'), 'Foo yes Bar yes');
        assert.strictEqual(strings.format('Foo {0} Bar {1}{2}', 'yes'), 'Foo yes Bar {1}{2}');
        assert.strictEqual(strings.format('Foo {0} Bar {1}{2}', 'yes', undefined), 'Foo yes Bar undefined{2}');
        assert.strictEqual(strings.format('Foo {0} Bar {1}{2}', 'yes', 5, false), 'Foo yes Bar 5false');
        assert.strictEqual(strings.format('Foo {0} Bar. {1}', '(foo)', '.test'), 'Foo (foo) Bar. .test');
    });
    test('format2', () => {
        assert.strictEqual(strings.format2('Foo Bar', {}), 'Foo Bar');
        assert.strictEqual(strings.format2('Foo {oops} Bar', {}), 'Foo {oops} Bar');
        assert.strictEqual(strings.format2('Foo {foo} Bar', { foo: 'bar' }), 'Foo bar Bar');
        assert.strictEqual(strings.format2('Foo {foo} Bar {foo}', { foo: 'bar' }), 'Foo bar Bar bar');
        assert.strictEqual(strings.format2('Foo {foo} Bar {bar}{boo}', { foo: 'bar' }), 'Foo bar Bar {bar}{boo}');
        assert.strictEqual(strings.format2('Foo {foo} Bar {bar}{boo}', { foo: 'bar', bar: 'undefined' }), 'Foo bar Bar undefined{boo}');
        assert.strictEqual(strings.format2('Foo {foo} Bar {bar}{boo}', { foo: 'bar', bar: '5', boo: false }), 'Foo bar Bar 5false');
        assert.strictEqual(strings.format2('Foo {foo} Bar. {bar}', { foo: '(foo)', bar: '.test' }), 'Foo (foo) Bar. .test');
    });
    test('lcut', () => {
        assert.strictEqual(strings.lcut('foo bar', 0), '');
        assert.strictEqual(strings.lcut('foo bar', 1), 'bar');
        assert.strictEqual(strings.lcut('foo bar', 3), 'bar');
        assert.strictEqual(strings.lcut('foo bar', 4), 'bar'); // Leading whitespace trimmed
        assert.strictEqual(strings.lcut('foo bar', 5), 'foo bar');
        assert.strictEqual(strings.lcut('test string 0.1.2.3', 3), '2.3');
        assert.strictEqual(strings.lcut('foo bar', 0, '…'), '…');
        assert.strictEqual(strings.lcut('foo bar', 1, '…'), '…bar');
        assert.strictEqual(strings.lcut('foo bar', 3, '…'), '…bar');
        assert.strictEqual(strings.lcut('foo bar', 4, '…'), '…bar'); // Leading whitespace trimmed
        assert.strictEqual(strings.lcut('foo bar', 5, '…'), 'foo bar');
        assert.strictEqual(strings.lcut('test string 0.1.2.3', 3, '…'), '…2.3');
        assert.strictEqual(strings.lcut('', 10), '');
        assert.strictEqual(strings.lcut('a', 10), 'a');
        assert.strictEqual(strings.lcut(' a', 10), 'a');
        assert.strictEqual(strings.lcut('            a', 10), 'a');
        assert.strictEqual(strings.lcut(' bbbb       a', 10), 'bbbb       a');
        assert.strictEqual(strings.lcut('............a', 10), '............a');
        assert.strictEqual(strings.lcut('', 10, '…'), '');
        assert.strictEqual(strings.lcut('a', 10, '…'), 'a');
        assert.strictEqual(strings.lcut(' a', 10, '…'), 'a');
        assert.strictEqual(strings.lcut('            a', 10, '…'), 'a');
        assert.strictEqual(strings.lcut(' bbbb       a', 10, '…'), 'bbbb       a');
        assert.strictEqual(strings.lcut('............a', 10, '…'), '............a');
    });
    test('rcut', () => {
        assert.strictEqual(strings.rcut('foo bar', 0), '');
        assert.strictEqual(strings.rcut('foo bar', 1), '');
        assert.strictEqual(strings.rcut('foo bar', 3), 'foo');
        assert.strictEqual(strings.rcut('foo bar', 4), 'foo'); // Trailing whitespace trimmed
        assert.strictEqual(strings.rcut('foo bar', 5), 'foo');
        assert.strictEqual(strings.rcut('foo bar', 7), 'foo bar');
        assert.strictEqual(strings.rcut('foo bar', 10), 'foo bar');
        assert.strictEqual(strings.rcut('test string 0.1.2.3', 6), 'test');
        assert.strictEqual(strings.rcut('foo bar', 0, '…'), '…');
        assert.strictEqual(strings.rcut('foo bar', 1, '…'), '…');
        assert.strictEqual(strings.rcut('foo bar', 3, '…'), 'foo…');
        assert.strictEqual(strings.rcut('foo bar', 4, '…'), 'foo…'); // Trailing whitespace trimmed
        assert.strictEqual(strings.rcut('foo bar', 5, '…'), 'foo…');
        assert.strictEqual(strings.rcut('foo bar', 7, '…'), 'foo bar');
        assert.strictEqual(strings.rcut('foo bar', 10, '…'), 'foo bar');
        assert.strictEqual(strings.rcut('test string 0.1.2.3', 6, '…'), 'test…');
        assert.strictEqual(strings.rcut('', 10), '');
        assert.strictEqual(strings.rcut('a', 10), 'a');
        assert.strictEqual(strings.rcut('a ', 10), 'a');
        assert.strictEqual(strings.rcut('a            ', 10), 'a');
        assert.strictEqual(strings.rcut('a       bbbb ', 10), 'a       bbbb');
        assert.strictEqual(strings.rcut('a............', 10), 'a............');
        assert.strictEqual(strings.rcut('', 10, '…'), '');
        assert.strictEqual(strings.rcut('a', 10, '…'), 'a');
        assert.strictEqual(strings.rcut('a ', 10, '…'), 'a');
        assert.strictEqual(strings.rcut('a            ', 10, '…'), 'a');
        assert.strictEqual(strings.rcut('a       bbbb ', 10, '…'), 'a       bbbb');
        assert.strictEqual(strings.rcut('a............', 10, '…'), 'a............');
    });
    test('escape', () => {
        assert.strictEqual(strings.escape(''), '');
        assert.strictEqual(strings.escape('foo'), 'foo');
        assert.strictEqual(strings.escape('foo bar'), 'foo bar');
        assert.strictEqual(strings.escape('<foo bar>'), '&lt;foo bar&gt;');
        assert.strictEqual(strings.escape('<foo>Hello</foo>'), '&lt;foo&gt;Hello&lt;/foo&gt;');
    });
    test('ltrim', () => {
        assert.strictEqual(strings.ltrim('foo', 'f'), 'oo');
        assert.strictEqual(strings.ltrim('foo', 'o'), 'foo');
        assert.strictEqual(strings.ltrim('http://www.test.de', 'http://'), 'www.test.de');
        assert.strictEqual(strings.ltrim('/foo/', '/'), 'foo/');
        assert.strictEqual(strings.ltrim('//foo/', '/'), 'foo/');
        assert.strictEqual(strings.ltrim('/', ''), '/');
        assert.strictEqual(strings.ltrim('/', '/'), '');
        assert.strictEqual(strings.ltrim('///', '/'), '');
        assert.strictEqual(strings.ltrim('', ''), '');
        assert.strictEqual(strings.ltrim('', '/'), '');
        // Multi-character needle with consecutive repetitions
        assert.strictEqual(strings.ltrim('---hello', '---'), 'hello');
        assert.strictEqual(strings.ltrim('------hello', '---'), 'hello');
        assert.strictEqual(strings.ltrim('---------hello', '---'), 'hello');
        assert.strictEqual(strings.ltrim('hello---', '---'), 'hello---');
    });
    test('rtrim', () => {
        assert.strictEqual(strings.rtrim('foo', 'o'), 'f');
        assert.strictEqual(strings.rtrim('foo', 'f'), 'foo');
        assert.strictEqual(strings.rtrim('http://www.test.de', '.de'), 'http://www.test');
        assert.strictEqual(strings.rtrim('/foo/', '/'), '/foo');
        assert.strictEqual(strings.rtrim('/foo//', '/'), '/foo');
        assert.strictEqual(strings.rtrim('/', ''), '/');
        assert.strictEqual(strings.rtrim('/', '/'), '');
        assert.strictEqual(strings.rtrim('///', '/'), '');
        assert.strictEqual(strings.rtrim('', ''), '');
        assert.strictEqual(strings.rtrim('', '/'), '');
        // Multi-character needle with consecutive repetitions (bug fix)
        assert.strictEqual(strings.rtrim('hello---', '---'), 'hello');
        assert.strictEqual(strings.rtrim('hello------', '---'), 'hello');
        assert.strictEqual(strings.rtrim('hello---------', '---'), 'hello');
        assert.strictEqual(strings.rtrim('---hello', '---'), '---hello');
        assert.strictEqual(strings.rtrim('hello world' + '---'.repeat(10), '---'), 'hello world');
        assert.strictEqual(strings.rtrim('path/to/file///', '//'), 'path/to/file/');
    });
    test('trim', () => {
        assert.strictEqual(strings.trim(' foo '), 'foo');
        assert.strictEqual(strings.trim('  foo'), 'foo');
        assert.strictEqual(strings.trim('bar  '), 'bar');
        assert.strictEqual(strings.trim('   '), '');
        assert.strictEqual(strings.trim('foo bar', 'bar'), 'foo ');
    });
    test('trimWhitespace', () => {
        assert.strictEqual(' foo '.trim(), 'foo');
        assert.strictEqual('	 foo	'.trim(), 'foo');
        assert.strictEqual('  foo'.trim(), 'foo');
        assert.strictEqual('bar  '.trim(), 'bar');
        assert.strictEqual('   '.trim(), '');
        assert.strictEqual(' 	  '.trim(), '');
    });
    test('lastNonWhitespaceIndex', () => {
        assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t '), 2);
        assert.strictEqual(strings.lastNonWhitespaceIndex('abc'), 2);
        assert.strictEqual(strings.lastNonWhitespaceIndex('abc\t'), 2);
        assert.strictEqual(strings.lastNonWhitespaceIndex('abc '), 2);
        assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t '), 2);
        assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t abc \t \t '), 11);
        assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t abc \t \t ', 8), 2);
        assert.strictEqual(strings.lastNonWhitespaceIndex('  \t \t '), -1);
    });
    test('containsRTL', () => {
        assert.strictEqual(strings.containsRTL('a'), false);
        assert.strictEqual(strings.containsRTL(''), false);
        assert.strictEqual(strings.containsRTL(strings.UTF8_BOM_CHARACTER + 'a'), false);
        assert.strictEqual(strings.containsRTL('hello world!'), false);
        assert.strictEqual(strings.containsRTL('a📚📚b'), false);
        assert.strictEqual(strings.containsRTL('هناك حقيقة مثبتة منذ زمن طويل'), true);
        assert.strictEqual(strings.containsRTL('זוהי עובדה מבוססת שדעתו'), true);
    });
    test('issue #115221: isEmojiImprecise misses ⭐', () => {
        const codePoint = strings.getNextCodePoint('⭐', '⭐'.length, 0);
        assert.strictEqual(strings.isEmojiImprecise(codePoint), true);
    });
    test('isFullWidthCharacter', () => {
        // Fullwidth ASCII (FF01-FF5E)
        assert.strictEqual(strings.isFullWidthCharacter('Ａ'.charCodeAt(0)), true, 'Ａ U+FF21 fullwidth A');
        assert.strictEqual(strings.isFullWidthCharacter('？'.charCodeAt(0)), true, '？ U+FF1F fullwidth question mark');
        assert.strictEqual(strings.isFullWidthCharacter('＃'.charCodeAt(0)), true, '＃ U+FF03 fullwidth number sign');
        assert.strictEqual(strings.isFullWidthCharacter('＝'.charCodeAt(0)), true, '＝ U+FF1D fullwidth equals sign');
        // Hiragana (3040-309F)
        assert.strictEqual(strings.isFullWidthCharacter('あ'.charCodeAt(0)), true, 'あ U+3042 hiragana');
        // Fullwidth symbols (FFE0-FFE6)
        assert.strictEqual(strings.isFullWidthCharacter('￥'.charCodeAt(0)), true, '￥ U+FFE5 fullwidth yen sign');
        // Regular ASCII should not be full width
        assert.strictEqual(strings.isFullWidthCharacter('A'.charCodeAt(0)), false, 'A regular ASCII');
        assert.strictEqual(strings.isFullWidthCharacter('?'.charCodeAt(0)), false, '? regular ASCII');
    });
    test('isBasicASCII', () => {
        function assertIsBasicASCII(str, expected) {
            assert.strictEqual(strings.isBasicASCII(str), expected, str + ` (${str.charCodeAt(0)})`);
        }
        assertIsBasicASCII('abcdefghijklmnopqrstuvwxyz', true);
        assertIsBasicASCII('ABCDEFGHIJKLMNOPQRSTUVWXYZ', true);
        assertIsBasicASCII('1234567890', true);
        assertIsBasicASCII('`~!@#$%^&*()-_=+[{]}\\|;:\'",<.>/?', true);
        assertIsBasicASCII(' ', true);
        assertIsBasicASCII('\t', true);
        assertIsBasicASCII('\n', true);
        assertIsBasicASCII('\r', true);
        let ALL = '\r\t\n';
        for (let i = 32; i < 127; i++) {
            ALL += String.fromCharCode(i);
        }
        assertIsBasicASCII(ALL, true);
        assertIsBasicASCII(String.fromCharCode(31), false);
        assertIsBasicASCII(String.fromCharCode(127), false);
        assertIsBasicASCII('ü', false);
        assertIsBasicASCII('a📚📚b', false);
    });
    test('createRegExp', () => {
        // Empty
        assert.throws(() => strings.createRegExp('', false));
        // Escapes appropriately
        assert.strictEqual(strings.createRegExp('abc', false).source, 'abc');
        assert.strictEqual(strings.createRegExp('([^ ,.]*)', false).source, '\\(\\[\\^ ,\\.\\]\\*\\)');
        assert.strictEqual(strings.createRegExp('([^ ,.]*)', true).source, '([^ ,.]*)');
        // Whole word
        assert.strictEqual(strings.createRegExp('abc', false, { wholeWord: true }).source, '\\babc\\b');
        assert.strictEqual(strings.createRegExp('abc', true, { wholeWord: true }).source, '\\babc\\b');
        assert.strictEqual(strings.createRegExp(' abc', true, { wholeWord: true }).source, ' abc\\b');
        assert.strictEqual(strings.createRegExp('abc ', true, { wholeWord: true }).source, '\\babc ');
        assert.strictEqual(strings.createRegExp(' abc ', true, { wholeWord: true }).source, ' abc ');
        const regExpWithoutFlags = strings.createRegExp('abc', true);
        assert(!regExpWithoutFlags.global);
        assert(regExpWithoutFlags.ignoreCase);
        assert(!regExpWithoutFlags.multiline);
        const regExpWithFlags = strings.createRegExp('abc', true, { global: true, matchCase: true, multiline: true });
        assert(regExpWithFlags.global);
        assert(!regExpWithFlags.ignoreCase);
        assert(regExpWithFlags.multiline);
    });
    test('getLeadingWhitespace', () => {
        assert.strictEqual(strings.getLeadingWhitespace('  foo'), '  ');
        assert.strictEqual(strings.getLeadingWhitespace('  foo', 2), '');
        assert.strictEqual(strings.getLeadingWhitespace('  foo', 1, 1), '');
        assert.strictEqual(strings.getLeadingWhitespace('  foo', 0, 1), ' ');
        assert.strictEqual(strings.getLeadingWhitespace('  '), '  ');
        assert.strictEqual(strings.getLeadingWhitespace('  ', 1), ' ');
        assert.strictEqual(strings.getLeadingWhitespace('  ', 0, 1), ' ');
        assert.strictEqual(strings.getLeadingWhitespace('\t\tfunction foo(){', 0, 1), '\t');
        assert.strictEqual(strings.getLeadingWhitespace('\t\tfunction foo(){', 0, 2), '\t\t');
    });
    test('fuzzyContains', () => {
        assert.ok(!strings.fuzzyContains((undefined), null));
        assert.ok(strings.fuzzyContains('hello world', 'h'));
        assert.ok(!strings.fuzzyContains('hello world', 'q'));
        assert.ok(strings.fuzzyContains('hello world', 'hw'));
        assert.ok(strings.fuzzyContains('hello world', 'horl'));
        assert.ok(strings.fuzzyContains('hello world', 'd'));
        assert.ok(!strings.fuzzyContains('hello world', 'wh'));
        assert.ok(!strings.fuzzyContains('d', 'dd'));
    });
    test('startsWithUTF8BOM', () => {
        assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER));
        assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + 'a'));
        assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + 'aaaaaaaaaa'));
        assert(!strings.startsWithUTF8BOM(' ' + strings.UTF8_BOM_CHARACTER));
        assert(!strings.startsWithUTF8BOM('foo'));
        assert(!strings.startsWithUTF8BOM(''));
    });
    test('stripUTF8BOM', () => {
        assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER), '');
        assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER + 'foobar'), 'foobar');
        assert.strictEqual(strings.stripUTF8BOM('foobar' + strings.UTF8_BOM_CHARACTER), 'foobar' + strings.UTF8_BOM_CHARACTER);
        assert.strictEqual(strings.stripUTF8BOM('abc'), 'abc');
        assert.strictEqual(strings.stripUTF8BOM(''), '');
    });
    test('containsUppercaseCharacter', () => {
        [
            [null, false],
            ['', false],
            ['foo', false],
            ['föö', false],
            ['ناك', false],
            ['מבוססת', false],
            ['😀', false],
            ['(#@()*&%()@*#&09827340982374}{:">?></\'\\~`', false],
            ['Foo', true],
            ['FOO', true],
            ['FöÖ', true],
            ['FöÖ', true],
            ['\\Foo', true],
        ].forEach(([str, result]) => {
            assert.strictEqual(strings.containsUppercaseCharacter(str), result, `Wrong result for ${str}`);
        });
    });
    test('containsUppercaseCharacter (ignoreEscapedChars)', () => {
        [
            ['\\Woo', false],
            ['f\\S\\S', false],
            ['foo', false],
            ['Foo', true],
        ].forEach(([str, result]) => {
            assert.strictEqual(strings.containsUppercaseCharacter(str, true), result, `Wrong result for ${str}`);
        });
    });
    test('uppercaseFirstLetter', () => {
        [
            ['', ''],
            ['foo', 'Foo'],
            ['f', 'F'],
            ['123', '123'],
            ['.a', '.a'],
        ].forEach(([inStr, result]) => {
            assert.strictEqual(strings.uppercaseFirstLetter(inStr), result, `Wrong result for ${inStr}`);
        });
    });
    test('getNLines', () => {
        assert.strictEqual(strings.getNLines('', 5), '');
        assert.strictEqual(strings.getNLines('foo', 5), 'foo');
        assert.strictEqual(strings.getNLines('foo\nbar', 5), 'foo\nbar');
        assert.strictEqual(strings.getNLines('foo\nbar', 2), 'foo\nbar');
        assert.strictEqual(strings.getNLines('foo\nbar', 1), 'foo');
        assert.strictEqual(strings.getNLines('foo\nbar'), 'foo');
        assert.strictEqual(strings.getNLines('foo\nbar\nsomething', 2), 'foo\nbar');
        assert.strictEqual(strings.getNLines('foo', 0), '');
    });
    test('getGraphemeBreakType', () => {
        assert.strictEqual(strings.getGraphemeBreakType(0xBC1), 7 /* strings.GraphemeBreakType.SpacingMark */);
    });
    test('truncate', () => {
        assert.strictEqual('hello world', strings.truncate('hello world', 100));
        assert.strictEqual('hello…', strings.truncate('hello world', 5));
    });
    test('truncateMiddle', () => {
        assert.strictEqual('hello world', strings.truncateMiddle('hello world', 100));
        assert.strictEqual('he…ld', strings.truncateMiddle('hello world', 5));
    });
    test('replaceAsync', async () => {
        let i = 0;
        assert.strictEqual(await strings.replaceAsync('abcabcabcabc', /b(.)/g, async (match, after) => {
            assert.strictEqual(match, 'bc');
            assert.strictEqual(after, 'c');
            return `${i++}${after}`;
        }), 'a0ca1ca2ca3c');
    });
    suite('removeAnsiEscapeCodes', () => {
        function testSequence(sequence) {
            assert.strictEqual(strings.removeAnsiEscapeCodes(`hello${sequence}world`), 'helloworld', `expect to remove ${JSON.stringify(sequence)}`);
            assert.deepStrictEqual([...strings.forAnsiStringParts(`hello${sequence}world`)], [{ isCode: false, str: 'hello' }, { isCode: true, str: sequence }, { isCode: false, str: 'world' }], `expect to forAnsiStringParts ${JSON.stringify(sequence)}`);
        }
        test('CSI sequences', () => {
            const CSI = '\x1b[';
            const sequences = [
                // Base cases from https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Functions-using-CSI-_-ordered-by-the-final-character_s_
                `${CSI}42@`,
                `${CSI}42 @`,
                `${CSI}42A`,
                `${CSI}42 A`,
                `${CSI}42B`,
                `${CSI}42C`,
                `${CSI}42D`,
                `${CSI}42E`,
                `${CSI}42F`,
                `${CSI}42G`,
                `${CSI}42;42H`,
                `${CSI}42I`,
                `${CSI}42J`,
                `${CSI}?42J`,
                `${CSI}42K`,
                `${CSI}?42K`,
                `${CSI}42L`,
                `${CSI}42M`,
                `${CSI}42P`,
                `${CSI}#P`,
                `${CSI}3#P`,
                `${CSI}#Q`,
                `${CSI}3#Q`,
                `${CSI}#R`,
                `${CSI}42S`,
                `${CSI}?1;2;3S`,
                `${CSI}42T`,
                `${CSI}42;42;42;42;42T`,
                `${CSI}>3T`,
                `${CSI}42X`,
                `${CSI}42Z`,
                `${CSI}42^`,
                `${CSI}42\``,
                `${CSI}42a`,
                `${CSI}42b`,
                `${CSI}42c`,
                `${CSI}=42c`,
                `${CSI}>42c`,
                `${CSI}42d`,
                `${CSI}42e`,
                `${CSI}42;42f`,
                `${CSI}42g`,
                `${CSI}3h`,
                `${CSI}?3h`,
                `${CSI}42i`,
                `${CSI}?42i`,
                `${CSI}3l`,
                `${CSI}?3l`,
                `${CSI}3m`,
                `${CSI}>0;0m`,
                `${CSI}>0m`,
                `${CSI}?0m`,
                `${CSI}42n`,
                `${CSI}>42n`,
                `${CSI}?42n`,
                `${CSI}>42p`,
                `${CSI}!p`,
                `${CSI}0;0"p`,
                `${CSI}42$p`,
                `${CSI}?42$p`,
                `${CSI}#p`,
                `${CSI}3#p`,
                `${CSI}>42q`,
                `${CSI}42q`,
                `${CSI}42 q`,
                `${CSI}42"q`,
                `${CSI}#q`,
                `${CSI}42;42r`,
                `${CSI}?3r`,
                `${CSI}0;0;0;0;3$r`,
                `${CSI}s`,
                `${CSI}0;0s`,
                `${CSI}>42s`,
                `${CSI}?3s`,
                `${CSI}42;42;42t`,
                `${CSI}>3t`,
                `${CSI}42 t`,
                `${CSI}0;0;0;0;3$t`,
                `${CSI}u`,
                `${CSI}42 u`,
                `${CSI}0;0;0;0;0;0;0;0$v`,
                `${CSI}42$w`,
                `${CSI}0;0;0;0'w`,
                `${CSI}42x`,
                `${CSI}42*x`,
                `${CSI}0;0;0;0;0$x`,
                `${CSI}42#y`,
                `${CSI}0;0;0;0;0;0*y`,
                `${CSI}42;0'z`,
                `${CSI}0;1;2;4$z`,
                `${CSI}3'{`,
                `${CSI}#{`,
                `${CSI}3#{`,
                `${CSI}0;0;0;0\${`,
                `${CSI}0;0;0;0#|`,
                `${CSI}42$|`,
                `${CSI}42'|`,
                `${CSI}42*|`,
                `${CSI}#}`,
                `${CSI}42'}`,
                `${CSI}42$}`,
                `${CSI}42'~`,
                `${CSI}42$~`,
                // Common SGR cases:
                `${CSI}1;31m`, // multiple attrs
                `${CSI}105m`, // bright background
                `${CSI}48:5:128m`, // 256 indexed color
                `${CSI}48;5;128m`, // 256 indexed color alt
                `${CSI}38:2:0:255:255:255m`, // truecolor
                `${CSI}38;2;255;255;255m`, // truecolor alt
            ];
            for (const sequence of sequences) {
                testSequence(sequence);
            }
        });
        suite('OSC sequences', () => {
            function testOscSequence(prefix, suffix) {
                const sequenceContent = [
                    `633;SetMark;`,
                    `633;P;Cwd=/foo`,
                    `7;file://local/Users/me/foo/bar`
                ];
                const sequences = [];
                for (const content of sequenceContent) {
                    sequences.push(`${prefix}${content}${suffix}`);
                }
                for (const sequence of sequences) {
                    testSequence(sequence);
                }
            }
            test('ESC ] Ps ; Pt ESC \\', () => {
                testOscSequence('\x1b]', '\x1b\\');
            });
            test('ESC ] Ps ; Pt BEL', () => {
                testOscSequence('\x1b]', '\x07');
            });
            test('ESC ] Ps ; Pt ST', () => {
                testOscSequence('\x1b]', '\x9c');
            });
            test('OSC Ps ; Pt ESC \\', () => {
                testOscSequence('\x9d', '\x1b\\');
            });
            test('OSC Ps ; Pt BEL', () => {
                testOscSequence('\x9d', '\x07');
            });
            test('OSC Ps ; Pt ST', () => {
                testOscSequence('\x9d', '\x9c');
            });
        });
        test('ESC sequences', () => {
            const sequenceContent = [
                ` F`,
                ` G`,
                ` L`,
                ` M`,
                ` N`,
                `#3`,
                `#4`,
                `#5`,
                `#6`,
                `#8`,
                `%@`,
                `%G`,
                `(C`,
                `)C`,
                `*C`,
                `+C`,
                `-C`,
                `.C`,
                `/C`
            ];
            const sequences = [];
            for (const content of sequenceContent) {
                sequences.push(`\x1b${content}`);
            }
            for (const sequence of sequences) {
                testSequence(sequence);
            }
        });
        suite('regression tests', () => {
            test('#209937', () => {
                assert.strictEqual(strings.removeAnsiEscapeCodes(`localhost:\x1b[31m1234`), 'localhost:1234');
            });
        });
    });
    test('removeAnsiEscapeCodesFromPrompt', () => {
        assert.strictEqual(strings.removeAnsiEscapeCodesFromPrompt('\u001b[31m$ \u001b[0m'), '$ ');
        assert.strictEqual(strings.removeAnsiEscapeCodesFromPrompt('\n\\[\u001b[01;34m\\]\\w\\[\u001b[00m\\]\n\\[\u001b[1;32m\\]> \\[\u001b[0m\\]'), '\n\\w\n> ');
    });
    test('count', () => {
        assert.strictEqual(strings.count('hello world', 'o'), 2);
        assert.strictEqual(strings.count('hello world', 'l'), 3);
        assert.strictEqual(strings.count('hello world', 'z'), 0);
        assert.strictEqual(strings.count('hello world', 'hello'), 1);
        assert.strictEqual(strings.count('hello world', 'world'), 1);
        assert.strictEqual(strings.count('hello world', 'hello world'), 1);
        assert.strictEqual(strings.count('hello world', 'foo'), 0);
    });
    test('containsAmbiguousCharacter', () => {
        assert.strictEqual(strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter('abcd'), false);
        assert.strictEqual(strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter('üå'), false);
        assert.strictEqual(strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter('(*&^)'), false);
        assert.strictEqual(strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter('ο'), true);
        assert.strictEqual(strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter('abɡc'), true);
    });
    test('containsInvisibleCharacter', () => {
        assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter('abcd'), false);
        assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter(' '), true);
        assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter('a\u{e004e}b'), true);
        assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter('a\u{e015a}\u000bb'), true);
    });
    test('multibyteAwareBtoa', () => {
        assert.ok(strings.multibyteAwareBtoa('hello world').length > 0);
        assert.ok(strings.multibyteAwareBtoa('平仮名').length > 0);
        assert.ok(strings.multibyteAwareBtoa(new Array(100000).fill('vs').join('')).length > 0); // https://github.com/microsoft/vscode/issues/112013
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
test('htmlAttributeEncodeValue', () => {
    assert.strictEqual(strings.htmlAttributeEncodeValue(''), '');
    assert.strictEqual(strings.htmlAttributeEncodeValue('abc'), 'abc');
    assert.strictEqual(strings.htmlAttributeEncodeValue('<script>alert("Hello")</script>'), '&lt;script&gt;alert(&quot;Hello&quot;)&lt;/script&gt;');
    assert.strictEqual(strings.htmlAttributeEncodeValue('Hello & World'), 'Hello &amp; World');
    assert.strictEqual(strings.htmlAttributeEncodeValue('"Hello"'), '&quot;Hello&quot;');
    assert.strictEqual(strings.htmlAttributeEncodeValue('\'Hello\''), '&apos;Hello&apos;');
    assert.strictEqual(strings.htmlAttributeEncodeValue('<>&\'"'), '&lt;&gt;&amp;&apos;&quot;');
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaW5ncy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9zdHJpbmdzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxPQUFPLE1BQU0seUJBQXlCLENBQUM7QUFDbkQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXJFLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ3JCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7UUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNDLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMvQyxNQUFNLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDN0QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUs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QUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLE1BQU07Z0JBQ1osR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLFFBQVE7Z0JBQ2QsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLE1BQU07Z0JBQ1osR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLE1BQU07Z0JBQ1osR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLElBQUk7Z0JBQ1YsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLElBQUk7Z0JBQ1YsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLElBQUk7Z0JBQ1YsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLFNBQVM7Z0JBQ2YsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLGlCQUFpQjtnQkFDdkIsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLE1BQU07Z0JBQ1osR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLE1BQU07Z0JBQ1osR0FBRyxHQUFHLE1BQU07Z0JBQ1osR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLFFBQVE7Z0JBQ2QsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLElBQUk7Z0JBQ1YsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gsR0FBRyxHQUFHLEtBQUs7Z0JBQ1gs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