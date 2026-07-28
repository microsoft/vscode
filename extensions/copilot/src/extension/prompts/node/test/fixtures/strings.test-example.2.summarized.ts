
suite('Strings', () => {
	/* Lines 9-104 omitted */

	test('format', () => {/* Lines 106-114 omitted */});

	test('format2', () => {/* Lines 117-125 omitted */});

	test('lcut', () => {
		/* Lines 128-136 omitted */
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

});
