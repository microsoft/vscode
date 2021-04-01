/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as strings from 'vs/base/common/strings';

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

	test('beginsWithIgnoreCase', () => {
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

	test('compareIgnoreCase', () => {

		function assertCompareIgnoreCase(a: string, b: string, recurse = true): void {
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

		function assertCompareIgnoreCase(a: string, b: string, aStart: number, aEnd: number, bStart: number, bEnd: number, recurse = true): void {
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

	test('lcut', () => {
		assert.strictEqual(strings.lcut('foo bar', 0), '');
		assert.strictEqual(strings.lcut('foo bar', 1), 'bar');
		assert.strictEqual(strings.lcut('foo bar', 3), 'bar');
		assert.strictEqual(strings.lcut('foo bar', 4), 'bar'); // Leading whitespace trimmed
		assert.strictEqual(strings.lcut('foo bar', 5), 'foo bar');
		assert.strictEqual(strings.lcut('test string 0.1.2.3', 3), '2.3');

		assert.strictEqual(strings.lcut('', 10), '');
		assert.strictEqual(strings.lcut('a', 10), 'a');
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

	test('containsEmoji', () => {
		assert.strictEqual(strings.containsEmoji('a'), false);
		assert.strictEqual(strings.containsEmoji(''), false);
		assert.strictEqual(strings.containsEmoji(strings.UTF8_BOM_CHARACTER + 'a'), false);
		assert.strictEqual(strings.containsEmoji('hello world!'), false);
		assert.strictEqual(strings.containsEmoji('هناك حقيقة مثبتة منذ زمن طويل'), false);
		assert.strictEqual(strings.containsEmoji('זוהי עובדה מבוססת שדעתו'), false);

		assert.strictEqual(strings.containsEmoji('a📚📚b'), true);
		assert.strictEqual(strings.containsEmoji('1F600 # 😀 grinning face'), true);
		assert.strictEqual(strings.containsEmoji('1F47E # 👾 alien monster'), true);
		assert.strictEqual(strings.containsEmoji('1F467 1F3FD # 👧🏽 girl: medium skin tone'), true);
		assert.strictEqual(strings.containsEmoji('26EA # ⛪ church'), true);
		assert.strictEqual(strings.containsEmoji('231B # ⌛ hourglass'), true);
		assert.strictEqual(strings.containsEmoji('2702 # ✂ scissors'), true);
		assert.strictEqual(strings.containsEmoji('1F1F7 1F1F4  # 🇷🇴 Romania'), true);
	});

	test('issue #115221: isEmojiImprecise misses ⭐', () => {
		const codePoint = strings.getNextCodePoint('⭐', '⭐'.length, 0);
		assert.strictEqual(strings.isEmojiImprecise(codePoint), true);
	});

	test('isBasicASCII', () => {
		function assertIsBasicASCII(str: string, expected: boolean): void {
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

	test('regExpContainsBackreference', () => {
		assert(strings.regExpContainsBackreference('foo \\5 bar'));
		assert(strings.regExpContainsBackreference('\\2'));
		assert(strings.regExpContainsBackreference('(\\d)(\\n)(\\1)'));
		assert(strings.regExpContainsBackreference('(A).*?\\1'));
		assert(strings.regExpContainsBackreference('\\\\\\1'));
		assert(strings.regExpContainsBackreference('foo \\\\\\1'));

		assert(!strings.regExpContainsBackreference(''));
		assert(!strings.regExpContainsBackreference('\\\\1'));
		assert(!strings.regExpContainsBackreference('foo \\\\1'));
		assert(!strings.regExpContainsBackreference('(A).*?\\\\1'));
		assert(!strings.regExpContainsBackreference('foo \\d1 bar'));
		assert(!strings.regExpContainsBackreference('123'));
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
		assert.ok(!strings.fuzzyContains((undefined)!, null!));
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
			assert.strictEqual(strings.containsUppercaseCharacter(<string>str), result, `Wrong result for ${str}`);
		});
	});

	test('containsUppercaseCharacter (ignoreEscapedChars)', () => {
		[
			['\\Woo', false],
			['f\\S\\S', false],
			['foo', false],

			['Foo', true],
		].forEach(([str, result]) => {
			assert.strictEqual(strings.containsUppercaseCharacter(<string>str, true), result, `Wrong result for ${str}`);
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

	test('encodeUTF8', function () {
		function assertEncodeUTF8(str: string, expected: number[]): void {
			const actual = strings.encodeUTF8(str);
			const actualArr: number[] = [];
			for (let offset = 0; offset < actual.byteLength; offset++) {
				actualArr[offset] = actual[offset];
			}
			assert.deepStrictEqual(actualArr, expected);
		}

		function assertDecodeUTF8(data: number[], expected: string): void {
			const actual = strings.decodeUTF8(new Uint8Array(data));
			assert.deepStrictEqual(actual, expected);
		}

		function assertEncodeDecodeUTF8(str: string, buff: number[]): void {
			assertEncodeUTF8(str, buff);
			assertDecodeUTF8(buff, str);
		}

		assertEncodeDecodeUTF8('\u0000', [0]);
		assertEncodeDecodeUTF8('!', [33]);
		assertEncodeDecodeUTF8('\u007F', [127]);
		assertEncodeDecodeUTF8('\u0080', [194, 128]);
		assertEncodeDecodeUTF8('Ɲ', [198, 157]);
		assertEncodeDecodeUTF8('\u07FF', [223, 191]);
		assertEncodeDecodeUTF8('\u0800', [224, 160, 128]);
		assertEncodeDecodeUTF8('ஂ', [224, 174, 130]);
		assertEncodeDecodeUTF8('\uffff', [239, 191, 191]);
		assertEncodeDecodeUTF8('\u10000', [225, 128, 128, 48]);
		assertEncodeDecodeUTF8('🧝', [240, 159, 167, 157]);

	});

	test('getGraphemeBreakType', () => {
		assert.strictEqual(strings.getGraphemeBreakType(0xBC1), strings.GraphemeBreakType.SpacingMark);
	});

	test('truncate', () => {
		assert.strictEqual('hello world', strings.truncate('hello world', 100));
		assert.strictEqual('hello…', strings.truncate('hello world', 5));
	});
});
