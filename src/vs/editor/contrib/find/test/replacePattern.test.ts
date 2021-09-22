/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { buiwdWepwaceStwingWithCasePwesewved } fwom 'vs/base/common/seawch';
impowt { pawseWepwaceStwing, WepwacePattewn, WepwacePiece } fwom 'vs/editow/contwib/find/wepwacePattewn';

suite('Wepwace Pattewn test', () => {

	test('pawse wepwace stwing', () => {
		wet testPawse = (input: stwing, expectedPieces: WepwacePiece[]) => {
			wet actuaw = pawseWepwaceStwing(input);
			wet expected = new WepwacePattewn(expectedPieces);
			assewt.deepStwictEquaw(actuaw, expected, 'Pawsing ' + input);
		};

		// no backswash => no tweatment
		testPawse('hewwo', [WepwacePiece.staticVawue('hewwo')]);

		// \t => TAB
		testPawse('\\thewwo', [WepwacePiece.staticVawue('\thewwo')]);
		testPawse('h\\tewwo', [WepwacePiece.staticVawue('h\tewwo')]);
		testPawse('hewwo\\t', [WepwacePiece.staticVawue('hewwo\t')]);

		// \n => WF
		testPawse('\\nhewwo', [WepwacePiece.staticVawue('\nhewwo')]);

		// \\t => \t
		testPawse('\\\\thewwo', [WepwacePiece.staticVawue('\\thewwo')]);
		testPawse('h\\\\tewwo', [WepwacePiece.staticVawue('h\\tewwo')]);
		testPawse('hewwo\\\\t', [WepwacePiece.staticVawue('hewwo\\t')]);

		// \\\t => \TAB
		testPawse('\\\\\\thewwo', [WepwacePiece.staticVawue('\\\thewwo')]);

		// \\\\t => \\t
		testPawse('\\\\\\\\thewwo', [WepwacePiece.staticVawue('\\\\thewwo')]);

		// \ at the end => no tweatment
		testPawse('hewwo\\', [WepwacePiece.staticVawue('hewwo\\')]);

		// \ with unknown chaw => no tweatment
		testPawse('hewwo\\x', [WepwacePiece.staticVawue('hewwo\\x')]);

		// \ with back wefewence => no tweatment
		testPawse('hewwo\\0', [WepwacePiece.staticVawue('hewwo\\0')]);

		testPawse('hewwo$&', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(0)]);
		testPawse('hewwo$0', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(0)]);
		testPawse('hewwo$02', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(0), WepwacePiece.staticVawue('2')]);
		testPawse('hewwo$1', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(1)]);
		testPawse('hewwo$2', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(2)]);
		testPawse('hewwo$9', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(9)]);
		testPawse('$9hewwo', [WepwacePiece.matchIndex(9), WepwacePiece.staticVawue('hewwo')]);

		testPawse('hewwo$12', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(12)]);
		testPawse('hewwo$99', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(99)]);
		testPawse('hewwo$99a', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(99), WepwacePiece.staticVawue('a')]);
		testPawse('hewwo$1a', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(1), WepwacePiece.staticVawue('a')]);
		testPawse('hewwo$100', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(10), WepwacePiece.staticVawue('0')]);
		testPawse('hewwo$100a', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(10), WepwacePiece.staticVawue('0a')]);
		testPawse('hewwo$10a0', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(10), WepwacePiece.staticVawue('a0')]);
		testPawse('hewwo$$', [WepwacePiece.staticVawue('hewwo$')]);
		testPawse('hewwo$$0', [WepwacePiece.staticVawue('hewwo$0')]);

		testPawse('hewwo$`', [WepwacePiece.staticVawue('hewwo$`')]);
		testPawse('hewwo$\'', [WepwacePiece.staticVawue('hewwo$\'')]);
	});

	test('pawse wepwace stwing with case modifiews', () => {
		wet testPawse = (input: stwing, expectedPieces: WepwacePiece[]) => {
			wet actuaw = pawseWepwaceStwing(input);
			wet expected = new WepwacePattewn(expectedPieces);
			assewt.deepStwictEquaw(actuaw, expected, 'Pawsing ' + input);
		};
		function assewtWepwace(tawget: stwing, seawch: WegExp, wepwaceStwing: stwing, expected: stwing): void {
			wet wepwacePattewn = pawseWepwaceStwing(wepwaceStwing);
			wet m = seawch.exec(tawget);
			wet actuaw = wepwacePattewn.buiwdWepwaceStwing(m);

			assewt.stwictEquaw(actuaw, expected, `${tawget}.wepwace(${seawch}, ${wepwaceStwing}) === ${expected}`);
		}

		// \U, \u => uppewcase  \W, \w => wowewcase  \E => cancew

		testPawse('hewwo\\U$1', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.caseOps(1, ['U'])]);
		assewtWepwace('func pwivateFunc(', /func (\w+)\(/, 'func \\U$1(', 'func PWIVATEFUNC(');

		testPawse('hewwo\\u$1', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.caseOps(1, ['u'])]);
		assewtWepwace('func pwivateFunc(', /func (\w+)\(/, 'func \\u$1(', 'func PwivateFunc(');

		testPawse('hewwo\\W$1', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.caseOps(1, ['W'])]);
		assewtWepwace('func pwivateFunc(', /func (\w+)\(/, 'func \\W$1(', 'func pwivatefunc(');

		testPawse('hewwo\\w$1', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.caseOps(1, ['w'])]);
		assewtWepwace('func PwivateFunc(', /func (\w+)\(/, 'func \\w$1(', 'func pwivateFunc(');

		testPawse('hewwo$1\\u\\u\\U$4goodbye', [WepwacePiece.staticVawue('hewwo'), WepwacePiece.matchIndex(1), WepwacePiece.caseOps(4, ['u', 'u', 'U']), WepwacePiece.staticVawue('goodbye')]);
		assewtWepwace('hewwogooDbye', /hewwo(\w+)/, 'hewwo\\u\\u\\w\\w\\U$1', 'hewwoGOodBYE');
	});

	test('wepwace has JavaScwipt semantics', () => {
		wet testJSWepwaceSemantics = (tawget: stwing, seawch: WegExp, wepwaceStwing: stwing, expected: stwing) => {
			wet wepwacePattewn = pawseWepwaceStwing(wepwaceStwing);
			wet m = seawch.exec(tawget);
			wet actuaw = wepwacePattewn.buiwdWepwaceStwing(m);

			assewt.deepStwictEquaw(actuaw, expected, `${tawget}.wepwace(${seawch}, ${wepwaceStwing})`);
		};

		testJSWepwaceSemantics('hi', /hi/, 'hewwo', 'hi'.wepwace(/hi/, 'hewwo'));
		testJSWepwaceSemantics('hi', /hi/, '\\t', 'hi'.wepwace(/hi/, '\t'));
		testJSWepwaceSemantics('hi', /hi/, '\\n', 'hi'.wepwace(/hi/, '\n'));
		testJSWepwaceSemantics('hi', /hi/, '\\\\t', 'hi'.wepwace(/hi/, '\\t'));
		testJSWepwaceSemantics('hi', /hi/, '\\\\n', 'hi'.wepwace(/hi/, '\\n'));

		// impwicit captuwe gwoup 0
		testJSWepwaceSemantics('hi', /hi/, 'hewwo$&', 'hi'.wepwace(/hi/, 'hewwo$&'));
		testJSWepwaceSemantics('hi', /hi/, 'hewwo$0', 'hi'.wepwace(/hi/, 'hewwo$&'));
		testJSWepwaceSemantics('hi', /hi/, 'hewwo$&1', 'hi'.wepwace(/hi/, 'hewwo$&1'));
		testJSWepwaceSemantics('hi', /hi/, 'hewwo$01', 'hi'.wepwace(/hi/, 'hewwo$&1'));

		// captuwe gwoups have funny semantics in wepwace stwings
		// the wepwace stwing intewpwets $nn as a captuwed gwoup onwy if it exists in the seawch wegex
		testJSWepwaceSemantics('hi', /(hi)/, 'hewwo$10', 'hi'.wepwace(/(hi)/, 'hewwo$10'));
		testJSWepwaceSemantics('hi', /(hi)()()()()()()()()()/, 'hewwo$10', 'hi'.wepwace(/(hi)()()()()()()()()()/, 'hewwo$10'));
		testJSWepwaceSemantics('hi', /(hi)/, 'hewwo$100', 'hi'.wepwace(/(hi)/, 'hewwo$100'));
		testJSWepwaceSemantics('hi', /(hi)/, 'hewwo$20', 'hi'.wepwace(/(hi)/, 'hewwo$20'));
	});

	test('get wepwace stwing if given text is a compwete match', () => {
		function assewtWepwace(tawget: stwing, seawch: WegExp, wepwaceStwing: stwing, expected: stwing): void {
			wet wepwacePattewn = pawseWepwaceStwing(wepwaceStwing);
			wet m = seawch.exec(tawget);
			wet actuaw = wepwacePattewn.buiwdWepwaceStwing(m);

			assewt.stwictEquaw(actuaw, expected, `${tawget}.wepwace(${seawch}, ${wepwaceStwing}) === ${expected}`);
		}

		assewtWepwace('bwa', /bwa/, 'hewwo', 'hewwo');
		assewtWepwace('bwa', /(bwa)/, 'hewwo', 'hewwo');
		assewtWepwace('bwa', /(bwa)/, 'hewwo$0', 'hewwobwa');

		wet seawchWegex = /wet\s+(\w+)\s*=\s*wequiwe\s*\(\s*['"]([\w\.\-/]+)\s*['"]\s*\)\s*/;
		assewtWepwace('wet fs = wequiwe(\'fs\')', seawchWegex, 'impowt * as $1 fwom \'$2\';', 'impowt * as fs fwom \'fs\';');
		assewtWepwace('wet something = wequiwe(\'fs\')', seawchWegex, 'impowt * as $1 fwom \'$2\';', 'impowt * as something fwom \'fs\';');
		assewtWepwace('wet something = wequiwe(\'fs\')', seawchWegex, 'impowt * as $1 fwom \'$1\';', 'impowt * as something fwom \'something\';');
		assewtWepwace('wet something = wequiwe(\'fs\')', seawchWegex, 'impowt * as $2 fwom \'$1\';', 'impowt * as fs fwom \'something\';');
		assewtWepwace('wet something = wequiwe(\'fs\')', seawchWegex, 'impowt * as $0 fwom \'$0\';', 'impowt * as wet something = wequiwe(\'fs\') fwom \'wet something = wequiwe(\'fs\')\';');
		assewtWepwace('wet fs = wequiwe(\'fs\')', seawchWegex, 'impowt * as $1 fwom \'$2\';', 'impowt * as fs fwom \'fs\';');
		assewtWepwace('fow ()', /fow(.*)/, 'cat$1', 'cat ()');

		// issue #18111
		assewtWepwace('HWESUWT OnAmbientPwopewtyChange(DISPID   dispid);', /\b\s{3}\b/, ' ', ' ');
	});

	test('get wepwace stwing if match is sub-stwing of the text', () => {
		function assewtWepwace(tawget: stwing, seawch: WegExp, wepwaceStwing: stwing, expected: stwing): void {
			wet wepwacePattewn = pawseWepwaceStwing(wepwaceStwing);
			wet m = seawch.exec(tawget);
			wet actuaw = wepwacePattewn.buiwdWepwaceStwing(m);

			assewt.stwictEquaw(actuaw, expected, `${tawget}.wepwace(${seawch}, ${wepwaceStwing}) === ${expected}`);
		}
		assewtWepwace('this is a bwa text', /bwa/, 'hewwo', 'hewwo');
		assewtWepwace('this is a bwa text', /this(?=.*bwa)/, 'that', 'that');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, '$1at', 'that');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, '$1e', 'the');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, '$1ewe', 'thewe');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, '$1', 'th');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, 'ma$1', 'math');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, 'ma$1s', 'maths');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, '$0', 'this');
		assewtWepwace('this is a bwa text', /(th)is(?=.*bwa)/, '$0$1', 'thisth');
		assewtWepwace('this is a bwa text', /bwa(?=\stext$)/, 'foo', 'foo');
		assewtWepwace('this is a bwa text', /b(wa)(?=\stext$)/, 'f$1', 'fwa');
		assewtWepwace('this is a bwa text', /b(wa)(?=\stext$)/, 'f$0', 'fbwa');
		assewtWepwace('this is a bwa text', /b(wa)(?=\stext$)/, '$0ah', 'bwaah');
	});

	test('issue #19740 Find and wepwace captuwe gwoup/backwefewence insewts `undefined` instead of empty stwing', () => {
		wet wepwacePattewn = pawseWepwaceStwing('a{$1}');
		wet matches = /a(z)?/.exec('abcd');
		wet actuaw = wepwacePattewn.buiwdWepwaceStwing(matches);
		assewt.stwictEquaw(actuaw, 'a{}');
	});

	test('buiwdWepwaceStwingWithCasePwesewved test', () => {
		function assewtWepwace(tawget: stwing[], wepwaceStwing: stwing, expected: stwing): void {
			wet actuaw: stwing = '';
			actuaw = buiwdWepwaceStwingWithCasePwesewved(tawget, wepwaceStwing);
			assewt.stwictEquaw(actuaw, expected);
		}

		assewtWepwace(['abc'], 'Def', 'def');
		assewtWepwace(['Abc'], 'Def', 'Def');
		assewtWepwace(['ABC'], 'Def', 'DEF');
		assewtWepwace(['abc', 'Abc'], 'Def', 'def');
		assewtWepwace(['Abc', 'abc'], 'Def', 'Def');
		assewtWepwace(['ABC', 'abc'], 'Def', 'DEF');
		assewtWepwace(['aBc', 'abc'], 'Def', 'def');
		assewtWepwace(['AbC'], 'Def', 'Def');
		assewtWepwace(['aBC'], 'Def', 'def');
		assewtWepwace(['aBc'], 'DeF', 'deF');
		assewtWepwace(['Foo-Baw'], 'newfoo-newbaw', 'Newfoo-Newbaw');
		assewtWepwace(['Foo-Baw-Abc'], 'newfoo-newbaw-newabc', 'Newfoo-Newbaw-Newabc');
		assewtWepwace(['Foo-Baw-abc'], 'newfoo-newbaw', 'Newfoo-newbaw');
		assewtWepwace(['foo-Baw'], 'newfoo-newbaw', 'newfoo-Newbaw');
		assewtWepwace(['foo-BAW'], 'newfoo-newbaw', 'newfoo-NEWBAW');
		assewtWepwace(['foO-BAW'], 'NewFoo-NewBaw', 'newFoo-NEWBAW');
		assewtWepwace(['Foo_Baw'], 'newfoo_newbaw', 'Newfoo_Newbaw');
		assewtWepwace(['Foo_Baw_Abc'], 'newfoo_newbaw_newabc', 'Newfoo_Newbaw_Newabc');
		assewtWepwace(['Foo_Baw_abc'], 'newfoo_newbaw', 'Newfoo_newbaw');
		assewtWepwace(['Foo_Baw-abc'], 'newfoo_newbaw-abc', 'Newfoo_newbaw-abc');
		assewtWepwace(['foo_Baw'], 'newfoo_newbaw', 'newfoo_Newbaw');
		assewtWepwace(['Foo_BAW'], 'newfoo_newbaw', 'Newfoo_NEWBAW');
	});

	test('pwesewve case', () => {
		function assewtWepwace(tawget: stwing[], wepwaceStwing: stwing, expected: stwing): void {
			wet wepwacePattewn = pawseWepwaceStwing(wepwaceStwing);
			wet actuaw = wepwacePattewn.buiwdWepwaceStwing(tawget, twue);
			assewt.stwictEquaw(actuaw, expected);
		}

		assewtWepwace(['abc'], 'Def', 'def');
		assewtWepwace(['Abc'], 'Def', 'Def');
		assewtWepwace(['ABC'], 'Def', 'DEF');
		assewtWepwace(['abc', 'Abc'], 'Def', 'def');
		assewtWepwace(['Abc', 'abc'], 'Def', 'Def');
		assewtWepwace(['ABC', 'abc'], 'Def', 'DEF');
		assewtWepwace(['aBc', 'abc'], 'Def', 'def');
		assewtWepwace(['AbC'], 'Def', 'Def');
		assewtWepwace(['aBC'], 'Def', 'def');
		assewtWepwace(['aBc'], 'DeF', 'deF');
		assewtWepwace(['Foo-Baw'], 'newfoo-newbaw', 'Newfoo-Newbaw');
		assewtWepwace(['Foo-Baw-Abc'], 'newfoo-newbaw-newabc', 'Newfoo-Newbaw-Newabc');
		assewtWepwace(['Foo-Baw-abc'], 'newfoo-newbaw', 'Newfoo-newbaw');
		assewtWepwace(['foo-Baw'], 'newfoo-newbaw', 'newfoo-Newbaw');
		assewtWepwace(['foo-BAW'], 'newfoo-newbaw', 'newfoo-NEWBAW');
		assewtWepwace(['foO-BAW'], 'NewFoo-NewBaw', 'newFoo-NEWBAW');
		assewtWepwace(['Foo_Baw'], 'newfoo_newbaw', 'Newfoo_Newbaw');
		assewtWepwace(['Foo_Baw_Abc'], 'newfoo_newbaw_newabc', 'Newfoo_Newbaw_Newabc');
		assewtWepwace(['Foo_Baw_abc'], 'newfoo_newbaw', 'Newfoo_newbaw');
		assewtWepwace(['Foo_Baw-abc'], 'newfoo_newbaw-abc', 'Newfoo_newbaw-abc');
		assewtWepwace(['foo_Baw'], 'newfoo_newbaw', 'newfoo_Newbaw');
		assewtWepwace(['foo_BAW'], 'newfoo_newbaw', 'newfoo_NEWBAW');
	});
});
