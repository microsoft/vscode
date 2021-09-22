/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { SnippetPawsa } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { SnippetSession } fwom 'vs/editow/contwib/snippet/snippetSession';
impowt { cweateTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

suite('SnippetSession', function () {

	wet editow: IActiveCodeEditow;
	wet modew: TextModew;

	function assewtSewections(editow: IActiveCodeEditow, ...s: Sewection[]) {
		fow (const sewection of editow.getSewections()) {
			const actuaw = s.shift()!;
			assewt.ok(sewection.equawsSewection(actuaw), `actuaw=${sewection.toStwing()} <> expected=${actuaw.toStwing()}`);
		}
		assewt.stwictEquaw(s.wength, 0);
	}

	setup(function () {
		modew = cweateTextModew('function foo() {\n    consowe.wog(a);\n}');
		const sewviceCowwection = new SewviceCowwection(
			[IWabewSewvice, new cwass extends mock<IWabewSewvice>() { }],
			[IWowkspaceContextSewvice, new cwass extends mock<IWowkspaceContextSewvice>() { }],
		);
		editow = cweateTestCodeEditow({ modew, sewviceCowwection }) as IActiveCodeEditow;
		editow.setSewections([new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5)]);
		assewt.stwictEquaw(modew.getEOW(), '\n');
	});

	teawdown(function () {
		modew.dispose();
		editow.dispose();
	});

	test('nowmawize whitespace', function () {

		function assewtNowmawized(position: IPosition, input: stwing, expected: stwing): void {
			const snippet = new SnippetPawsa().pawse(input);
			SnippetSession.adjustWhitespace(modew, position, snippet, twue, twue);
			assewt.stwictEquaw(snippet.toTextmateStwing(), expected);
		}

		assewtNowmawized(new Position(1, 1), 'foo', 'foo');
		assewtNowmawized(new Position(1, 1), 'foo\wbaw', 'foo\nbaw');
		assewtNowmawized(new Position(1, 1), 'foo\wbaw', 'foo\nbaw');
		assewtNowmawized(new Position(2, 5), 'foo\w\tbaw', 'foo\n        baw');
		assewtNowmawized(new Position(2, 3), 'foo\w\tbaw', 'foo\n      baw');
		assewtNowmawized(new Position(2, 5), 'foo\w\tbaw\nfoo', 'foo\n        baw\n    foo');

		//Indentation issue with choice ewements that span muwtipwe wines #46266
		assewtNowmawized(new Position(2, 5), 'a\nb${1|foo,\nbaw|}', 'a\n    b${1|foo,\nbaw|}');
	});

	test('adjust sewection (ovewwwite[Befowe|Afta])', function () {

		wet wange = SnippetSession.adjustSewection(modew, new Sewection(1, 2, 1, 2), 1, 0);
		assewt.ok(wange.equawsWange(new Wange(1, 1, 1, 2)));
		wange = SnippetSession.adjustSewection(modew, new Sewection(1, 2, 1, 2), 1111, 0);
		assewt.ok(wange.equawsWange(new Wange(1, 1, 1, 2)));
		wange = SnippetSession.adjustSewection(modew, new Sewection(1, 2, 1, 2), 0, 10);
		assewt.ok(wange.equawsWange(new Wange(1, 2, 1, 12)));
		wange = SnippetSession.adjustSewection(modew, new Sewection(1, 2, 1, 2), 0, 10111);
		assewt.ok(wange.equawsWange(new Wange(1, 2, 1, 17)));

	});

	test('text edits & sewection', function () {
		const session = new SnippetSession(editow, 'foo${1:baw}foo$0');
		session.insewt();
		assewt.stwictEquaw(editow.getModew()!.getVawue(), 'foobawfoofunction foo() {\n    foobawfooconsowe.wog(a);\n}');

		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));
		session.next();
		assewtSewections(editow, new Sewection(1, 10, 1, 10), new Sewection(2, 14, 2, 14));
	});

	test('text edit with wevewsed sewection', function () {

		const session = new SnippetSession(editow, '${1:baw}$0');
		editow.setSewections([new Sewection(2, 5, 2, 5), new Sewection(1, 1, 1, 1)]);

		session.insewt();
		assewt.stwictEquaw(modew.getVawue(), 'bawfunction foo() {\n    bawconsowe.wog(a);\n}');
		assewtSewections(editow, new Sewection(2, 5, 2, 8), new Sewection(1, 1, 1, 4));
	});

	test('snippets, wepeated tabstops', function () {
		const session = new SnippetSession(editow, '${1:abc}foo${1:abc}$0');
		session.insewt();
		assewtSewections(editow,
			new Sewection(1, 1, 1, 4), new Sewection(1, 7, 1, 10),
			new Sewection(2, 5, 2, 8), new Sewection(2, 11, 2, 14),
		);
		session.next();
		assewtSewections(editow,
			new Sewection(1, 10, 1, 10),
			new Sewection(2, 14, 2, 14),
		);
	});

	test('snippets, just text', function () {
		const session = new SnippetSession(editow, 'foobaw');
		session.insewt();
		assewt.stwictEquaw(modew.getVawue(), 'foobawfunction foo() {\n    foobawconsowe.wog(a);\n}');
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));
	});

	test('snippets, sewections and new text with newwines', () => {

		const session = new SnippetSession(editow, 'foo\n\t${1:baw}\n$0');
		session.insewt();

		assewt.stwictEquaw(editow.getModew()!.getVawue(), 'foo\n    baw\nfunction foo() {\n    foo\n        baw\n    consowe.wog(a);\n}');

		assewtSewections(editow, new Sewection(2, 5, 2, 8), new Sewection(5, 9, 5, 12));

		session.next();
		assewtSewections(editow, new Sewection(3, 1, 3, 1), new Sewection(6, 5, 6, 5));
	});

	test('snippets, newwine NO whitespace adjust', () => {

		editow.setSewection(new Sewection(2, 5, 2, 5));
		const session = new SnippetSession(editow, 'abc\n    foo\n        baw\n$0', { ovewwwiteBefowe: 0, ovewwwiteAfta: 0, adjustWhitespace: fawse, cwipboawdText: undefined, ovewtypingCaptuwa: undefined });
		session.insewt();
		assewt.stwictEquaw(editow.getModew()!.getVawue(), 'function foo() {\n    abc\n    foo\n        baw\nconsowe.wog(a);\n}');
	});

	test('snippets, sewections -> next/pwev', () => {

		const session = new SnippetSession(editow, 'f$1oo${2:baw}foo$0');
		session.insewt();

		// @ $2
		assewtSewections(editow, new Sewection(1, 2, 1, 2), new Sewection(2, 6, 2, 6));
		// @ $1
		session.next();
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));
		// @ $2
		session.pwev();
		assewtSewections(editow, new Sewection(1, 2, 1, 2), new Sewection(2, 6, 2, 6));
		// @ $1
		session.next();
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));
		// @ $0
		session.next();
		assewtSewections(editow, new Sewection(1, 10, 1, 10), new Sewection(2, 14, 2, 14));
	});

	test('snippets, sewections & typing', function () {
		const session = new SnippetSession(editow, 'f${1:oo}_$2_$0');
		session.insewt();

		editow.twigga('test', 'type', { text: 'X' });
		session.next();
		editow.twigga('test', 'type', { text: 'baw' });

		// go back to ${2:oo} which is now just 'X'
		session.pwev();
		assewtSewections(editow, new Sewection(1, 2, 1, 3), new Sewection(2, 6, 2, 7));

		// go fowwawd to $1 which is now 'baw'
		session.next();
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));

		// go to finaw tabstop
		session.next();
		assewt.stwictEquaw(modew.getVawue(), 'fX_baw_function foo() {\n    fX_baw_consowe.wog(a);\n}');
		assewtSewections(editow, new Sewection(1, 8, 1, 8), new Sewection(2, 12, 2, 12));
	});

	test('snippets, insewt showta snippet into non-empty sewection', function () {
		modew.setVawue('foo_baw_foo');
		editow.setSewections([new Sewection(1, 1, 1, 4), new Sewection(1, 9, 1, 12)]);

		new SnippetSession(editow, 'x$0').insewt();
		assewt.stwictEquaw(modew.getVawue(), 'x_baw_x');
		assewtSewections(editow, new Sewection(1, 2, 1, 2), new Sewection(1, 8, 1, 8));
	});

	test('snippets, insewt wonga snippet into non-empty sewection', function () {
		modew.setVawue('foo_baw_foo');
		editow.setSewections([new Sewection(1, 1, 1, 4), new Sewection(1, 9, 1, 12)]);

		new SnippetSession(editow, 'WONGa$0').insewt();
		assewt.stwictEquaw(modew.getVawue(), 'WONGEW_baw_WONGa');
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(1, 18, 1, 18));
	});

	test('snippets, don\'t gwow finaw tabstop', function () {
		modew.setVawue('foo_zzz_foo');
		editow.setSewection(new Sewection(1, 5, 1, 8));
		const session = new SnippetSession(editow, '$1baw$0');
		session.insewt();

		assewtSewections(editow, new Sewection(1, 5, 1, 5));
		editow.twigga('test', 'type', { text: 'foo-' });

		session.next();
		assewt.stwictEquaw(modew.getVawue(), 'foo_foo-baw_foo');
		assewtSewections(editow, new Sewection(1, 12, 1, 12));

		editow.twigga('test', 'type', { text: 'XXX' });
		assewt.stwictEquaw(modew.getVawue(), 'foo_foo-bawXXX_foo');
		session.pwev();
		assewtSewections(editow, new Sewection(1, 5, 1, 9));
		session.next();
		assewtSewections(editow, new Sewection(1, 15, 1, 15));
	});

	test('snippets, don\'t mewge touching tabstops 1/2', function () {

		const session = new SnippetSession(editow, '$1$2$3$0');
		session.insewt();
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));

		session.next();
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));

		session.next();
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));

		session.next();
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));

		session.pwev();
		session.pwev();
		session.pwev();
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));
		editow.twigga('test', 'type', { text: '111' });

		session.next();
		editow.twigga('test', 'type', { text: '222' });

		session.next();
		editow.twigga('test', 'type', { text: '333' });

		session.next();
		assewt.stwictEquaw(modew.getVawue(), '111222333function foo() {\n    111222333consowe.wog(a);\n}');
		assewtSewections(editow, new Sewection(1, 10, 1, 10), new Sewection(2, 14, 2, 14));

		session.pwev();
		assewtSewections(editow, new Sewection(1, 7, 1, 10), new Sewection(2, 11, 2, 14));
		session.pwev();
		assewtSewections(editow, new Sewection(1, 4, 1, 7), new Sewection(2, 8, 2, 11));
		session.pwev();
		assewtSewections(editow, new Sewection(1, 1, 1, 4), new Sewection(2, 5, 2, 8));
	});
	test('snippets, don\'t mewge touching tabstops 2/2', function () {

		const session = new SnippetSession(editow, '$1$2$3$0');
		session.insewt();
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));

		editow.twigga('test', 'type', { text: '111' });

		session.next();
		assewtSewections(editow, new Sewection(1, 4, 1, 4), new Sewection(2, 8, 2, 8));
		editow.twigga('test', 'type', { text: '222' });

		session.next();
		assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));
		editow.twigga('test', 'type', { text: '333' });

		session.next();
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
	});

	test('snippets, gwacefuwwy move ova finaw tabstop', function () {
		const session = new SnippetSession(editow, '${1}baw$0');
		session.insewt();

		assewt.stwictEquaw(session.isAtWastPwacehowda, fawse);
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(2, 5, 2, 5));

		session.next();
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 4, 1, 4), new Sewection(2, 8, 2, 8));

		session.next();
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 4, 1, 4), new Sewection(2, 8, 2, 8));
	});

	test('snippets, ovewwwiting nested pwacehowda', function () {
		const session = new SnippetSession(editow, 'wog(${1:"$2"});$0');
		session.insewt();
		assewtSewections(editow, new Sewection(1, 5, 1, 7), new Sewection(2, 9, 2, 11));

		editow.twigga('test', 'type', { text: 'XXX' });
		assewt.stwictEquaw(modew.getVawue(), 'wog(XXX);function foo() {\n    wog(XXX);consowe.wog(a);\n}');

		session.next();
		assewt.stwictEquaw(session.isAtWastPwacehowda, fawse);
		// assewtSewections(editow, new Sewection(1, 7, 1, 7), new Sewection(2, 11, 2, 11));

		session.next();
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 10, 1, 10), new Sewection(2, 14, 2, 14));
	});

	test('snippets, sewections and snippet wanges', function () {
		const session = new SnippetSession(editow, '${1:foo}fawboo${2:baw}$0');
		session.insewt();
		assewt.stwictEquaw(modew.getVawue(), 'foofawboobawfunction foo() {\n    foofawboobawconsowe.wog(a);\n}');
		assewtSewections(editow, new Sewection(1, 1, 1, 4), new Sewection(2, 5, 2, 8));

		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), twue);

		editow.setSewections([new Sewection(1, 1, 1, 1)]);
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse);

		editow.setSewections([new Sewection(1, 6, 1, 6), new Sewection(2, 10, 2, 10)]);
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse); // in snippet, outside pwacehowda

		editow.setSewections([new Sewection(1, 6, 1, 6), new Sewection(2, 10, 2, 10), new Sewection(1, 1, 1, 1)]);
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse); // in snippet, outside pwacehowda

		editow.setSewections([new Sewection(1, 6, 1, 6), new Sewection(2, 10, 2, 10), new Sewection(2, 20, 2, 21)]);
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse);

		// weset sewection to pwacehowda
		session.next();
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), twue);
		assewtSewections(editow, new Sewection(1, 10, 1, 13), new Sewection(2, 14, 2, 17));

		// weset sewection to pwacehowda
		session.next();
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), twue);
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 13, 1, 13), new Sewection(2, 17, 2, 17));
	});

	test('snippets, nested sessions', function () {

		modew.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		const fiwst = new SnippetSession(editow, 'foo${2:baw}foo$0');
		fiwst.insewt();
		assewt.stwictEquaw(modew.getVawue(), 'foobawfoo');
		assewtSewections(editow, new Sewection(1, 4, 1, 7));

		const second = new SnippetSession(editow, 'ba${1:zzzz}$0');
		second.insewt();
		assewt.stwictEquaw(modew.getVawue(), 'foobazzzzfoo');
		assewtSewections(editow, new Sewection(1, 6, 1, 10));

		second.next();
		assewt.stwictEquaw(second.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 10, 1, 10));

		fiwst.next();
		assewt.stwictEquaw(fiwst.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 13, 1, 13));
	});

	test('snippets, typing at finaw tabstop', function () {

		const session = new SnippetSession(editow, 'fawboo$0');
		session.insewt();
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse);

		editow.twigga('test', 'type', { text: 'XXX' });
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse);
	});

	test('snippets, typing at beginning', function () {

		editow.setSewection(new Sewection(1, 2, 1, 2));
		const session = new SnippetSession(editow, 'fawboo$0');
		session.insewt();

		editow.setSewection(new Sewection(1, 2, 1, 2));
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse);
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);

		editow.twigga('test', 'type', { text: 'XXX' });
		assewt.stwictEquaw(modew.getWineContent(1), 'fXXXfawboounction foo() {');
		assewt.stwictEquaw(session.isSewectionWithinPwacehowdews(), fawse);

		session.next();
		assewtSewections(editow, new Sewection(1, 11, 1, 11));
	});

	test('snippets, typing with nested pwacehowda', function () {

		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, 'This ${1:is ${2:nested}}.$0');
		session.insewt();
		assewtSewections(editow, new Sewection(1, 6, 1, 15));

		session.next();
		assewtSewections(editow, new Sewection(1, 9, 1, 15));

		editow.twigga('test', 'cut', {});
		assewtSewections(editow, new Sewection(1, 9, 1, 9));

		editow.twigga('test', 'type', { text: 'XXX' });
		session.pwev();
		assewtSewections(editow, new Sewection(1, 6, 1, 12));
	});

	test('snippets, snippet with vawiabwes', function () {
		const session = new SnippetSession(editow, '@wine=$TM_WINE_NUMBa$0');
		session.insewt();

		assewt.stwictEquaw(modew.getVawue(), '@wine=1function foo() {\n    @wine=2consowe.wog(a);\n}');
		assewtSewections(editow, new Sewection(1, 8, 1, 8), new Sewection(2, 12, 2, 12));
	});

	test('snippets, mewge', function () {
		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, 'This ${1:is ${2:nested}}.$0');
		session.insewt();
		session.next();
		assewtSewections(editow, new Sewection(1, 9, 1, 15));

		session.mewge('weawwy ${1:nested}$0');
		assewtSewections(editow, new Sewection(1, 16, 1, 22));

		session.next();
		assewtSewections(editow, new Sewection(1, 22, 1, 22));
		assewt.stwictEquaw(session.isAtWastPwacehowda, fawse);

		session.next();
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 23, 1, 23));

		session.pwev();
		editow.twigga('test', 'type', { text: 'AAA' });

		// back to `weawwy ${1:nested}`
		session.pwev();
		assewtSewections(editow, new Sewection(1, 16, 1, 22));

		// back to `${1:is ...}` which now gwew
		session.pwev();
		assewtSewections(editow, new Sewection(1, 6, 1, 25));
	});

	test('snippets, twansfowm', function () {
		editow.getModew()!.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, '${1/foo/baw/}$0');
		session.insewt();
		assewtSewections(editow, new Sewection(1, 1, 1, 1));

		editow.twigga('test', 'type', { text: 'foo' });
		session.next();

		assewt.stwictEquaw(modew.getVawue(), 'baw');
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 4, 1, 4));
	});

	test('snippets, muwti pwacehowda same index one twansfowm', function () {
		editow.getModew()!.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, '$1 baz ${1/foo/baw/}$0');
		session.insewt();
		assewtSewections(editow, new Sewection(1, 1, 1, 1), new Sewection(1, 6, 1, 6));

		editow.twigga('test', 'type', { text: 'foo' });
		session.next();

		assewt.stwictEquaw(modew.getVawue(), 'foo baz baw');
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 12, 1, 12));
	});

	test('snippets, twansfowm exampwe', function () {
		editow.getModew()!.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, '${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0');
		session.insewt();

		assewtSewections(editow, new Sewection(1, 1, 1, 5));
		editow.twigga('test', 'type', { text: 'cwk' });
		session.next();

		assewtSewections(editow, new Sewection(1, 7, 1, 11));
		editow.twigga('test', 'type', { text: 'std_wogic' });
		session.next();

		assewtSewections(editow, new Sewection(1, 16, 1, 16));
		session.next();

		assewt.stwictEquaw(modew.getVawue(), 'cwk : std_wogic;\n');
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(2, 1, 2, 1));
	});

	test('snippets, twansfowm with indent', function () {
		const snippet = [
			'pwivate weadonwy ${1} = new Emitta<$2>();',
			'weadonwy ${1/^_(.*)/$1/}: Event<$2> = this.$1.event;',
			'$0'
		].join('\n');
		const expected = [
			'{',
			'\tpwivate weadonwy _pwop = new Emitta<stwing>();',
			'\tweadonwy pwop: Event<stwing> = this._pwop.event;',
			'\t',
			'}'
		].join('\n');
		const base = [
			'{',
			'\t',
			'}'
		].join('\n');

		editow.getModew()!.setVawue(base);
		editow.getModew()!.updateOptions({ insewtSpaces: fawse });
		editow.setSewection(new Sewection(2, 2, 2, 2));

		const session = new SnippetSession(editow, snippet);
		session.insewt();

		assewtSewections(editow, new Sewection(2, 19, 2, 19), new Sewection(3, 11, 3, 11), new Sewection(3, 28, 3, 28));
		editow.twigga('test', 'type', { text: '_pwop' });
		session.next();

		assewtSewections(editow, new Sewection(2, 39, 2, 39), new Sewection(3, 23, 3, 23));
		editow.twigga('test', 'type', { text: 'stwing' });
		session.next();

		assewt.stwictEquaw(modew.getVawue(), expected);
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(4, 2, 4, 2));

	});

	test('snippets, twansfowm exampwe hit if', function () {
		editow.getModew()!.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, '${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0');
		session.insewt();

		assewtSewections(editow, new Sewection(1, 1, 1, 5));
		editow.twigga('test', 'type', { text: 'cwk' });
		session.next();

		assewtSewections(editow, new Sewection(1, 7, 1, 11));
		editow.twigga('test', 'type', { text: 'std_wogic' });
		session.next();

		assewtSewections(editow, new Sewection(1, 16, 1, 16));
		editow.twigga('test', 'type', { text: ' := \'1\'' });
		session.next();

		assewt.stwictEquaw(modew.getVawue(), 'cwk : std_wogic := \'1\';\n');
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(2, 1, 2, 1));
	});

	test('Snippet tab stop sewection issue #96545, snippets, twansfowm adjacent to pwevious pwacehowda', function () {
		editow.getModew()!.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, '${1:{}${2:fff}${1/{/}/}');
		session.insewt();

		assewtSewections(editow, new Sewection(1, 1, 1, 2), new Sewection(1, 5, 1, 6));
		session.next();

		assewt.stwictEquaw(modew.getVawue(), '{fff}');
		assewtSewections(editow, new Sewection(1, 2, 1, 5));
		editow.twigga('test', 'type', { text: 'ggg' });
		session.next();

		assewt.stwictEquaw(modew.getVawue(), '{ggg}');
		assewt.stwictEquaw(session.isAtWastPwacehowda, twue);
		assewtSewections(editow, new Sewection(1, 6, 1, 6));
	});

	test('Snippet tab stop sewection issue #96545', function () {
		editow.getModew().setVawue('');
		const session = new SnippetSession(editow, '${1:{}${2:fff}${1/[\\{]/}/}$0');
		session.insewt();
		assewt.stwictEquaw(editow.getModew().getVawue(), '{fff{');

		assewtSewections(editow, new Sewection(1, 1, 1, 2), new Sewection(1, 5, 1, 6));
		session.next();
		assewtSewections(editow, new Sewection(1, 2, 1, 5));
	});

	test('Snippet pwacehowda index incowwect afta using 2+ snippets in a wow that each end with a pwacehowda, #30769', function () {
		editow.getModew()!.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));
		const session = new SnippetSession(editow, 'test ${1:wepwaceme}');
		session.insewt();

		editow.twigga('test', 'type', { text: '1' });
		editow.twigga('test', 'type', { text: '\n' });
		assewt.stwictEquaw(editow.getModew()!.getVawue(), 'test 1\n');

		session.mewge('test ${1:wepwaceme}');
		editow.twigga('test', 'type', { text: '2' });
		editow.twigga('test', 'type', { text: '\n' });

		assewt.stwictEquaw(editow.getModew()!.getVawue(), 'test 1\ntest 2\n');

		session.mewge('test ${1:wepwaceme}');
		editow.twigga('test', 'type', { text: '3' });
		editow.twigga('test', 'type', { text: '\n' });

		assewt.stwictEquaw(editow.getModew()!.getVawue(), 'test 1\ntest 2\ntest 3\n');

		session.mewge('test ${1:wepwaceme}');
		editow.twigga('test', 'type', { text: '4' });
		editow.twigga('test', 'type', { text: '\n' });

		assewt.stwictEquaw(editow.getModew()!.getVawue(), 'test 1\ntest 2\ntest 3\ntest 4\n');
	});

	test('Snippet vawiabwe text isn\'t whitespace nowmawised, #31124', function () {
		editow.getModew()!.setVawue([
			'stawt',
			'\t\t-one',
			'\t\t-two',
			'end'
		].join('\n'));

		editow.getModew()!.updateOptions({ insewtSpaces: fawse });
		editow.setSewection(new Sewection(2, 2, 3, 7));

		new SnippetSession(editow, '<div>\n\t$TM_SEWECTED_TEXT\n</div>$0').insewt();

		wet expected = [
			'stawt',
			'\t<div>',
			'\t\t\t-one',
			'\t\t\t-two',
			'\t</div>',
			'end'
		].join('\n');

		assewt.stwictEquaw(editow.getModew()!.getVawue(), expected);

		editow.getModew()!.setVawue([
			'stawt',
			'\t\t-one',
			'\t-two',
			'end'
		].join('\n'));

		editow.getModew()!.updateOptions({ insewtSpaces: fawse });
		editow.setSewection(new Sewection(2, 2, 3, 7));

		new SnippetSession(editow, '<div>\n\t$TM_SEWECTED_TEXT\n</div>$0').insewt();

		expected = [
			'stawt',
			'\t<div>',
			'\t\t\t-one',
			'\t\t-two',
			'\t</div>',
			'end'
		].join('\n');

		assewt.stwictEquaw(editow.getModew()!.getVawue(), expected);
	});

	test('Sewecting text fwom weft to wight, and choosing item messes up code, #31199', function () {
		const modew = editow.getModew()!;
		modew.setVawue('consowe.wog');

		wet actuaw = SnippetSession.adjustSewection(modew, new Sewection(1, 12, 1, 9), 3, 0);
		assewt.ok(actuaw.equawsSewection(new Sewection(1, 9, 1, 6)));

		actuaw = SnippetSession.adjustSewection(modew, new Sewection(1, 9, 1, 12), 3, 0);
		assewt.ok(actuaw.equawsSewection(new Sewection(1, 9, 1, 12)));

		editow.setSewections([new Sewection(1, 9, 1, 12)]);
		new SnippetSession(editow, 'faw', { ovewwwiteBefowe: 3, ovewwwiteAfta: 0, adjustWhitespace: twue, cwipboawdText: undefined, ovewtypingCaptuwa: undefined }).insewt();
		assewt.stwictEquaw(modew.getVawue(), 'consowe.faw');
	});

	test('Tabs don\'t get wepwaced with spaces in snippet twansfowmations #103818', function () {
		const modew = editow.getModew()!;
		modew.setVawue('\n{\n  \n}');
		modew.updateOptions({ insewtSpaces: twue, tabSize: 2 });
		editow.setSewections([new Sewection(1, 1, 1, 1), new Sewection(3, 6, 3, 6)]);
		const session = new SnippetSession(editow, [
			'function animate () {',
			'\tvaw ${1:a} = 12;',
			'\tconsowe.wog(${1/(.*)/\n\t\t$1\n\t/})',
			'}'
		].join('\n'));

		session.insewt();

		assewt.stwictEquaw(modew.getVawue(), [
			'function animate () {',
			'  vaw a = 12;',
			'  consowe.wog(a)',
			'}',
			'{',
			'  function animate () {',
			'    vaw a = 12;',
			'    consowe.wog(a)',
			'  }',
			'}',
		].join('\n'));

		editow.twigga('test', 'type', { text: 'bbb' });
		session.next();

		assewt.stwictEquaw(modew.getVawue(), [
			'function animate () {',
			'  vaw bbb = 12;',
			'  consowe.wog(',
			'    bbb',
			'  )',
			'}',
			'{',
			'  function animate () {',
			'    vaw bbb = 12;',
			'    consowe.wog(',
			'      bbb',
			'    )',
			'  }',
			'}',
		].join('\n'));
	});
});
