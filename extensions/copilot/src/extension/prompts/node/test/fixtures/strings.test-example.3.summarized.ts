7: 
8: suite('Strings', () => {
115: 
116: 	test('format2', () => {…});
126: 
127: 	test('lcut', () => {…});
138: 
139: 	test('escape', () => {…});
146: 
147: 	test('ltrim', () => {
157: 		assert.strictEqual(strings.ltrim('', '/'), '');
158: 	});
159: 
160: 	test('rtrim', () => {
161: 		assert.strictEqual(strings.rtrim('foo', 'o'), 'f');
162: 		assert.strictEqual(strings.rtrim('foo', 'f'), 'foo');
163: 		assert.strictEqual(strings.rtrim('http://www.test.de', '.de'), 'http://www.test');
164: 		assert.strictEqual(strings.rtrim('/foo/', '/'), '/foo');
165: 		assert.strictEqual(strings.rtrim('/foo//', '/'), '/foo');
166: 		assert.strictEqual(strings.rtrim('/', ''), '/');
167: 		assert.strictEqual(strings.rtrim('/', '/'), '');
168: 		assert.strictEqual(strings.rtrim('///', '/'), '');
169: 		assert.strictEqual(strings.rtrim('', ''), '');
170: 		assert.strictEqual(strings.rtrim('', '/'), '');
171: 	});
172: 
173: 	test('trim', () => {
174: 		assert.strictEqual(strings.trim(' foo '), 'foo');
175: 		assert.strictEqual(strings.trim('  foo'), 'foo');
176: 		assert.strictEqual(strings.trim('bar  '), 'bar');
177: 		assert.strictEqual(strings.trim('   '), '');
178: 		assert.strictEqual(strings.trim('foo bar', 'bar'), 'foo ');
179: 	});
180: 
181: 	test('trimWhitespace', () => {
182: 		assert.strictEqual(' foo '.trim(), 'foo');
183: 		assert.strictEqual('	 foo	'.trim(), 'foo');
184: 		assert.strictEqual('  foo'.trim(), 'foo');
185: 		assert.strictEqual('bar  '.trim(), 'bar');
186: 		assert.strictEqual('   '.trim(), '');
187: 		assert.strictEqual(' 	  '.trim(), '');
188: 	});
189: 
190: 	test('lastNonWhitespaceIndex', () => {
191: 		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t '), 2);
192: 		assert.strictEqual(strings.lastNonWhitespaceIndex('abc'), 2);
193: 		assert.strictEqual(strings.lastNonWhitespaceIndex('abc\t'), 2);
194: 		assert.strictEqual(strings.lastNonWhitespaceIndex('abc '), 2);
195: 		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t '), 2);
196: 		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t abc \t \t '), 11);
197: 		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t abc \t \t ', 8), 2);
198: 		assert.strictEqual(strings.lastNonWhitespaceIndex('  \t \t '), -1);
199: 	});
200: 
201: 	test('containsRTL', () => {
202: 		assert.strictEqual(strings.containsRTL('a'), false);
203: 		assert.strictEqual(strings.containsRTL(''), false);
204: 		assert.strictEqual(strings.containsRTL(strings.UTF8_BOM_CHARACTER + 'a'), false);
205: 		assert.strictEqual(strings.containsRTL('hello world!'), false);
206: 		assert.strictEqual(strings.containsRTL('a📚📚b'), false);
207: 		assert.strictEqual(strings.containsRTL('هناك حقيقة مثبتة منذ زمن طويل'), true);
208: 		assert.strictEqual(strings.containsRTL('זוהי עובדה מבוססת שדעתו'), true);
209: 	});
210: 
211: 	test('issue #115221: isEmojiImprecise misses ⭐', () => {
212: 		const codePoint = strings.getNextCodePoint('⭐', '⭐'.length, 0);
213: 		assert.strictEqual(strings.isEmojiImprecise(codePoint), true);
214: 	});
215: 
216: 	test('isBasicASCII', () => {
217: 		function assertIsBasicASCII(str: string, expected: boolean): void {
218: 			assert.strictEqual(strings.isBasicASCII(str), expected, str + ` (${str.charCodeAt(0)})`);
219: 		}
220: 		assertIsBasicASCII('abcdefghijklmnopqrstuvwxyz', true);
221: 		assertIsBasicASCII('ABCDEFGHIJKLMNOPQRSTUVWXYZ', true);
222: 		assertIsBasicASCII('1234567890', true);
223: 		assertIsBasicASCII('`~!@#$%^&*()-_=+[{]}\\|;:\'",<.>/?', true);
224: 		assertIsBasicASCII(' ', true);
225: 		assertIsBasicASCII('\t', true);
226: 		assertIsBasicASCII('\n', true);
227: 		assertIsBasicASCII('\r', true);
228: 
229: 		let ALL = '\r\t\n';
230: 		for (let i = 32; i < 127; i++) {
231: 			ALL += String.fromCharCode(i);
232: 		}
233: 		assertIsBasicASCII(ALL, true);
234: 
235: 		assertIsBasicASCII(String.fromCharCode(31), false);
236: 		assertIsBasicASCII(String.fromCharCode(127), false);
237: 		assertIsBasicASCII('ü', false);
238: 		assertIsBasicASCII('a📚📚b', false);
239: 	});
240: 
241: 	test('createRegExp', () => {
242: 		// Empty
243: 		assert.throws(() => strings.createRegExp('', false));
244: 
245: 		// Escapes appropriately
246: 		assert.strictEqual(strings.createRegExp('abc', false).source, 'abc');
247: 		assert.strictEqual(strings.createRegExp('([^ ,.]*)', false).source, '\\(\\[\\^ ,\\.\\]\\*\\)');
248: 		assert.strictEqual(strings.createRegExp('([^ ,.]*)', true).source, '([^ ,.]*)');
249: 
250: 		// Whole word
251: 		assert.strictEqual(strings.createRegExp('abc', false, { wholeWord: true }).source, '\\babc\\b');
252: 		assert.strictEqual(strings.createRegExp('abc', true, { wholeWord: true }).source, '\\babc\\b');
253: 		assert.strictEqual(strings.createRegExp(' abc', true, { wholeWord: true }).source, ' abc\\b');
254: 		assert.strictEqual(strings.createRegExp('abc ', true, { wholeWord: true }).source, '\\babc ');
255: 		assert.strictEqual(strings.createRegExp(' abc ', true, { wholeWord: true }).source, ' abc ');
256: 
257: 		const regExpWithoutFlags = strings.createRegExp('abc', true);
258: 		assert(!regExpWithoutFlags.global);
259: 		assert(regExpWithoutFlags.ignoreCase);
260: 		assert(!regExpWithoutFlags.multiline);
261: 
262: 		const regExpWithFlags = strings.createRegExp('abc', true, { global: true, matchCase: true, multiline: true });
263: 		assert(regExpWithFlags.global);
264: 		assert(!regExpWithFlags.ignoreCase);
265: 		assert(regExpWithFlags.multiline);
266: 	});
267: 
268: 	test('regExpContainsBackreference', () => {
269: 		assert(strings.regExpContainsBackreference('foo \\5 bar'));
270: 		assert(strings.regExpContainsBackreference('\\2'));
271: 		assert(strings.regExpContainsBackreference('(\\d)(\\n)(\\1)'));
272: 		assert(strings.regExpContainsBackreference('(A).*?\\1'));
273: 		assert(strings.regExpContainsBackreference('\\\\\\1'));
274: 		assert(strings.regExpContainsBackreference('foo \\\\\\1'));
275: 
276: 		assert(!strings.regExpContainsBackreference(''));
277: 		assert(!strings.regExpContainsBackreference('\\\\1'));
278: 		assert(!strings.regExpContainsBackreference('foo \\\\1'));
279: 		assert(!strings.regExpContainsBackreference('(A).*?\\\\1'));
280: 		assert(!strings.regExpContainsBackreference('foo \\d1 bar'));
281: 		assert(!strings.regExpContainsBackreference('123'));
282: 	});
283: 
284: 	test('getLeadingWhitespace', () => {
285: 		assert.strictEqual(strings.getLeadingWhitespace('  foo'), '  ');
286: 		assert.strictEqual(strings.getLeadingWhitespace('  foo', 2), '');
287: 		assert.strictEqual(strings.getLeadingWhitespace('  foo', 1, 1), '');
288: 		assert.strictEqual(strings.getLeadingWhitespace('  foo', 0, 1), ' ');
289: 		assert.strictEqual(strings.getLeadingWhitespace('  '), '  ');
290: 		assert.strictEqual(strings.getLeadingWhitespace('  ', 1), ' ');
291: 		assert.strictEqual(strings.getLeadingWhitespace('  ', 0, 1), ' ');
292: 		assert.strictEqual(strings.getLeadingWhitespace('\t\tfunction foo(){', 0, 1), '\t');
293: 		assert.strictEqual(strings.getLeadingWhitespace('\t\tfunction foo(){', 0, 2), '\t\t');
294: 	});
295: 
296: 	test('fuzzyContains', () => {
297: 		assert.ok(!strings.fuzzyContains((undefined)!, null!));
298: 		assert.ok(strings.fuzzyContains('hello world', 'h'));
299: 		assert.ok(!strings.fuzzyContains('hello world', 'q'));
300: 		assert.ok(strings.fuzzyContains('hello world', 'hw'));
301: 		assert.ok(strings.fuzzyContains('hello world', 'horl'));
302: 		assert.ok(strings.fuzzyContains('hello world', 'd'));
303: 		assert.ok(!strings.fuzzyContains('hello world', 'wh'));
304: 		assert.ok(!strings.fuzzyContains('d', 'dd'));
305: 	});
306: 
307: 	test('startsWithUTF8BOM', () => {
308: 		assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER));
309: 		assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + 'a'));
310: 		assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + 'aaaaaaaaaa'));
311: 		assert(!strings.startsWithUTF8BOM(' ' + strings.UTF8_BOM_CHARACTER));
312: 		assert(!strings.startsWithUTF8BOM('foo'));
313: 		assert(!strings.startsWithUTF8BOM(''));
314: 	});
315: 
316: 	test('stripUTF8BOM', () => {
317: 		assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER), '');
318: 		assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER + 'foobar'), 'foobar');
319: 		assert.strictEqual(strings.stripUTF8BOM('foobar' + strings.UTF8_BOM_CHARACTER), 'foobar' + strings.UTF8_BOM_CHARACTER);
320: 		assert.strictEqual(strings.stripUTF8BOM('abc'), 'abc');
321: 		assert.strictEqual(strings.stripUTF8BOM(''), '');
322: 	});
323: 
324: 	test('containsUppercaseCharacter', () => {
325: 		[
326: 			[null, false],
327: 			['', false],
328: 			['foo', false],
329: 			['föö', false],
330: 			['ناك', false],
331: 			['מבוססת', false],
332: 			['😀', false],
333: 			['(#@()*&%()@*#&09827340982374}{:">?></\'\\~`', false],
334: 
335: 			['Foo', true],
336: 			['FOO', true],
337: 			['FöÖ', true],
338: 			['FöÖ', true],
339: 			['\\Foo', true],
340: 		].forEach(([str, result]) => {
341: 			assert.strictEqual(strings.containsUppercaseCharacter(<string>str), result, `Wrong result for ${str}`);
342: 		});
343: 	});
344: 
345: 
346: 
347: 	test('containsUppercaseCharacter (ignoreEscapedChars)', () => {
348: 		[
349: 			['\\Woo', false],
350: 			['f\\S\\S', false],
351: 			['foo', false],
352: 
353: 			['Foo', true],
354: 		].forEach(([str, result]) => {
355: 			assert.strictEqual(strings.containsUppercaseCharacter(<string>str, true), result, `Wrong result for ${str}`);
356: 		});
357: 	});
358: 
359: });
