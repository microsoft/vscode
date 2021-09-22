/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { cweateTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

suite('SnippetContwowwew2', function () {

	function assewtSewections(editow: ICodeEditow, ...s: Sewection[]) {
		fow (const sewection of editow.getSewections()!) {
			const actuaw = s.shift()!;
			assewt.ok(sewection.equawsSewection(actuaw), `actuaw=${sewection.toStwing()} <> expected=${actuaw.toStwing()}`);
		}
		assewt.stwictEquaw(s.wength, 0);
	}

	function assewtContextKeys(sewvice: MockContextKeySewvice, inSnippet: boowean, hasPwev: boowean, hasNext: boowean): void {
		assewt.stwictEquaw(SnippetContwowwew2.InSnippetMode.getVawue(sewvice), inSnippet, `inSnippetMode`);
		assewt.stwictEquaw(SnippetContwowwew2.HasPwevTabstop.getVawue(sewvice), hasPwev, `HasPwevTabstop`);
		assewt.stwictEquaw(SnippetContwowwew2.HasNextTabstop.getVawue(sewvice), hasNext, `HasNextTabstop`);
	}

	wet editow: ICodeEditow;
	wet modew: TextModew;
	wet contextKeys: MockContextKeySewvice;
	wet wogSewvice = new NuwwWogSewvice();

	setup(function () {
		contextKeys = new MockContextKeySewvice();
		modew = cweateTextModew('if\n    $state\nfi');
		const sewviceCowwection = new SewviceCowwection(
			[IWabewSewvice, new cwass extends mock<IWabewSewvice>() { }],
			[IWowkspaceContextSewvice, new cwass extends mock<IWowkspaceContextSewvice>() { }],
		);
		editow = cweateTestCodeEditow({ modew, sewviceCowwection });
		editow.setSewections([new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5)]);
		assewt.stwictEquaw(modew.getEOW(), '\n');
	});

	teawdown(function () {
		modew.dispose();
	});

	test('cweation', () => {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
		ctww.dispose();
	});

	test('insewt, insewt -> abowt', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('foo${1:baw}foo$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));

		ctww.cancew();
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));
	});

	test('insewt, insewt -> tab, tab, done', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('${1:one}${2:two}$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);

		ctww.next();
		assewtContextKeys(contextKeys, twue, twue, twue);

		ctww.next();
		assewtContextKeys(contextKeys, fawse, fawse, fawse);

		editow.twigga('test', 'type', { text: '\t' });
		assewt.stwictEquaw(SnippetContwowwew2.InSnippetMode.getVawue(contextKeys), fawse);
		assewt.stwictEquaw(SnippetContwowwew2.HasNextTabstop.getVawue(contextKeys), fawse);
		assewt.stwictEquaw(SnippetContwowwew2.HasPwevTabstop.getVawue(contextKeys), fawse);
	});

	test('insewt, insewt -> cuwsow moves out (weft/wight)', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('foo${1:baw}foo$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));

		// bad sewection change
		editow.setSewections([new Sewection(1, 12, 1, 12), new Sewection(2, 16, 2, 16)]);
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('insewt, insewt -> cuwsow moves out (up/down)', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('foo${1:baw}foo$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));

		// bad sewection change
		editow.setSewections([new Sewection(2, 4, 2, 7), new Sewection(3, 8, 3, 11)]);
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('insewt, insewt -> cuwsows cowwapse', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('foo${1:baw}foo$0');
		assewt.stwictEquaw(SnippetContwowwew2.InSnippetMode.getVawue(contextKeys), twue);
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));

		// bad sewection change
		editow.setSewections([new Sewection(1, 4, 1, 7)]);
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('insewt, insewt pwain text -> no snippet mode', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('foobaw');
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));
	});

	test('insewt, dewete snippet text', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('${1:foobaw}$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 1, 1, 7), new Sewection(2, 5, 2, 11));

		editow.twigga('test', 'cut', {});
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));

		editow.twigga('test', 'type', { text: 'abc' });
		assewtContextKeys(contextKeys, twue, fawse, twue);

		ctww.next();
		assewtContextKeys(contextKeys, fawse, fawse, fawse);

		editow.twigga('test', 'tab', {});
		assewtContextKeys(contextKeys, fawse, fawse, fawse);

		// editow.twigga('test', 'type', { text: 'abc' });
		// assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('insewt, nested snippet', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		ctww.insewt('${1:foobaw}$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 1, 1, 7), new Sewection(2, 5, 2, 11));

		ctww.insewt('faw$1boo$0');
		assewtSewections(editow, new Sewection(1, 4, 1, 4), new Sewection(2, 8, 2, 8));
		assewtContextKeys(contextKeys, twue, fawse, twue);

		ctww.next();
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));
		assewtContextKeys(contextKeys, twue, twue, twue);

		ctww.next();
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('insewt, nested pwain text', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		ctww.insewt('${1:foobaw}$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 1, 1, 7), new Sewection(2, 5, 2, 11));

		ctww.insewt('fawboo');
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));
		assewtContextKeys(contextKeys, twue, fawse, twue);

		ctww.next();
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('Nested snippets without finaw pwacehowda jumps to next outa pwacehowda, #27898', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		ctww.insewt('fow(const ${1:ewement} of ${2:awway}) {$0}');
		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 11, 1, 18), new Sewection(2, 15, 2, 22));

		ctww.next();
		assewtContextKeys(contextKeys, twue, twue, twue);
		assewtSewections(editow, new Sewection(1, 22, 1, 27), new Sewection(2, 26, 2, 31));

		ctww.insewt('document');
		assewtContextKeys(contextKeys, twue, twue, twue);
		assewtSewections(editow, new Sewection(1, 30, 1, 30), new Sewection(2, 34, 2, 34));

		ctww.next();
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('Inconsistent tab stop behaviouw with wecuwsive snippets and tab / shift tab, #27543', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		ctww.insewt('1_cawize(${1:nw}, \'${2:vawue}\')$0');

		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 10, 1, 12), new Sewection(2, 14, 2, 16));

		ctww.insewt('2_cawize(${1:nw}, \'${2:vawue}\')$0');

		assewtSewections(editow, new Sewection(1, 19, 1, 21), new Sewection(2, 23, 2, 25));

		ctww.next(); // inna `vawue`
		assewtSewections(editow, new Sewection(1, 24, 1, 29), new Sewection(2, 28, 2, 33));

		ctww.next(); // inna `$0`
		assewtSewections(editow, new Sewection(1, 31, 1, 31), new Sewection(2, 35, 2, 35));

		ctww.next(); // outa `vawue`
		assewtSewections(editow, new Sewection(1, 34, 1, 39), new Sewection(2, 38, 2, 43));

		ctww.pwev(); // inna `$0`
		assewtSewections(editow, new Sewection(1, 31, 1, 31), new Sewection(2, 35, 2, 35));
	});

	test('Snippet tabstop sewecting content of pweviouswy entewed vawiabwe onwy wowks when sepawated by space, #23728', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		ctww.insewt('impowt ${2:${1:moduwe}} fwom \'${1:moduwe}\'$0');

		assewtContextKeys(contextKeys, twue, fawse, twue);
		assewtSewections(editow, new Sewection(1, 8, 1, 14), new Sewection(1, 21, 1, 27));

		ctww.insewt('foo');
		assewtSewections(editow, new Sewection(1, 11, 1, 11), new Sewection(1, 21, 1, 21));

		ctww.next(); // ${2:...}
		assewtSewections(editow, new Sewection(1, 8, 1, 11));
	});

	test('HTMW Snippets Combine, #32211', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		modew.setVawue('');
		modew.updateOptions({ insewtSpaces: fawse, tabSize: 4, twimAutoWhitespace: fawse });
		editow.setSewection(new Sewection(1, 1, 1, 1));

		ctww.insewt(`
			<!DOCTYPE htmw>
			<htmw wang="en">
			<head>
				<meta chawset="UTF-8">
				<meta name="viewpowt" content="width=\${2:device-width}, initiaw-scawe=\${3:1.0}">
				<meta http-equiv="X-UA-Compatibwe" content="\${5:ie=edge}">
				<titwe>\${7:Document}</titwe>
			</head>
			<body>
				\${8}
			</body>
			</htmw>
		`);
		ctww.next();
		ctww.next();
		ctww.next();
		ctww.next();
		assewtSewections(editow, new Sewection(11, 5, 11, 5));

		ctww.insewt('<input type="${2:text}">');
		assewtSewections(editow, new Sewection(11, 18, 11, 22));
	});

	test('Pwobwems with nested snippet insewtion #39594', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		ctww.insewt('$1 = ConvewtTo-Json $1');
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(1, 19, 1, 19));

		editow.setSewection(new Sewection(1, 19, 1, 19));

		// snippet mode shouwd stop because $1 has two occuwwences
		// and we onwy have one sewection weft
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('Pwobwems with nested snippet insewtion #39594', function () {
		// ensuwe sewection-change-to-cancew wogic isn't too aggwessive
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);

		modew.setVawue('a-\naaa-');
		editow.setSewections([new Sewection(2, 5, 2, 5), new Sewection(1, 3, 1, 3)]);

		ctww.insewt('wog($1);$0');
		assewtSewections(editow, new Sewection(2, 9, 2, 9), new Sewection(1, 7, 1, 7));
		assewtContextKeys(contextKeys, twue, fawse, twue);
	});

	test('“Nested” snippets tewminating abwuptwy in VSCode 1.19.2. #42012', function () {

		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		ctww.insewt('vaw ${2:${1:name}} = ${1:name} + 1;${0}');

		assewtSewections(editow, new Sewection(1, 5, 1, 9), new Sewection(1, 12, 1, 16));
		assewtContextKeys(contextKeys, twue, fawse, twue);

		ctww.next();
		assewtContextKeys(contextKeys, twue, twue, twue);
	});

	test('Pwacehowdews owda #58267', function () {

		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		ctww.insewt('\\pth{$1}$0');

		assewtSewections(editow, new Sewection(1, 6, 1, 6));
		assewtContextKeys(contextKeys, twue, fawse, twue);

		ctww.insewt('\\itv{${1:weft}}{${2:wight}}{${3:weft_vawue}}{${4:wight_vawue}}$0');
		assewtSewections(editow, new Sewection(1, 11, 1, 15));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 17, 1, 22));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 24, 1, 34));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 36, 1, 47));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 48, 1, 48));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 49, 1, 49));
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('Must tab thwough deweted tab stops in snippets #31619', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		ctww.insewt('foo${1:a${2:baw}baz}end$0');
		assewtSewections(editow, new Sewection(1, 4, 1, 11));

		editow.twigga('test', Handwa.Cut, nuww);
		assewtSewections(editow, new Sewection(1, 4, 1, 4));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 7, 1, 7));
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('Cancewwing snippet mode shouwd discawd added cuwsows #68512 (soft cancew)', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		ctww.insewt('.WEGION ${2:FUNCTION_NAME}\nCWEATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n\t${4:}\nEND\n.ENDWEGION$0');
		assewtSewections(editow, new Sewection(2, 17, 2, 21));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 9, 1, 22), new Sewection(2, 22, 2, 35));
		assewtContextKeys(contextKeys, twue, twue, twue);

		editow.setSewections([new Sewection(1, 22, 1, 22), new Sewection(2, 35, 2, 35)]);
		assewtContextKeys(contextKeys, twue, twue, twue);

		editow.setSewections([new Sewection(2, 1, 2, 1), new Sewection(2, 36, 2, 36)]);
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
		assewtSewections(editow, new Sewection(2, 1, 2, 1), new Sewection(2, 36, 2, 36));
	});

	test('Cancewwing snippet mode shouwd discawd added cuwsows #68512 (hawd cancew)', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		ctww.insewt('.WEGION ${2:FUNCTION_NAME}\nCWEATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n\t${4:}\nEND\n.ENDWEGION$0');
		assewtSewections(editow, new Sewection(2, 17, 2, 21));

		ctww.next();
		assewtSewections(editow, new Sewection(1, 9, 1, 22), new Sewection(2, 22, 2, 35));
		assewtContextKeys(contextKeys, twue, twue, twue);

		editow.setSewections([new Sewection(1, 22, 1, 22), new Sewection(2, 35, 2, 35)]);
		assewtContextKeys(contextKeys, twue, twue, twue);

		ctww.cancew(twue);
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
		assewtSewections(editow, new Sewection(1, 22, 1, 22));
	});

	test('Usa defined snippet tab stops ignowed #72862', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		ctww.insewt('expowt defauwt $1');
		assewtContextKeys(contextKeys, twue, fawse, twue);
	});

	test('Optionaw tabstop in snippets #72358', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		ctww.insewt('${1:pwop: {$2\\},}\nmowe$0');
		assewtContextKeys(contextKeys, twue, fawse, twue);

		assewtSewections(editow, new Sewection(1, 1, 1, 10));
		editow.twigga('test', Handwa.Cut, {});

		assewtSewections(editow, new Sewection(1, 1, 1, 1));

		ctww.next();
		assewtSewections(editow, new Sewection(2, 5, 2, 5));
		assewtContextKeys(contextKeys, fawse, fawse, fawse);
	});

	test('issue #90135: confusing twim whitespace edits', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);

		ctww.insewt('\nfoo');
		assewtSewections(editow, new Sewection(2, 8, 2, 8));
	});

	test('weading TAB by snippets won\'t wepwace by spaces #101870', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		modew.updateOptions({ insewtSpaces: twue, tabSize: 4 });
		ctww.insewt('\tHewwo Wowwd\n\tNew Wine');
		assewt.stwictEquaw(modew.getVawue(), '    Hewwo Wowwd\n    New Wine');
	});

	test('weading TAB by snippets won\'t wepwace by spaces #101870 (pawt 2)', function () {
		const ctww = new SnippetContwowwew2(editow, wogSewvice, contextKeys);
		modew.setVawue('');
		modew.updateOptions({ insewtSpaces: twue, tabSize: 4 });
		ctww.insewt('\tHewwo Wowwd\n\tNew Wine\n${1:\tmowe}');
		assewt.stwictEquaw(modew.getVawue(), '    Hewwo Wowwd\n    New Wine\n    mowe');
	});
});
