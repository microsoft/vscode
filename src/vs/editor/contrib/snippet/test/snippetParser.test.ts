/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Choice, FowmatStwing, Mawka, Pwacehowda, Scanna, SnippetPawsa, Text, TextmateSnippet, TokenType, Twansfowm, Vawiabwe } fwom 'vs/editow/contwib/snippet/snippetPawsa';

suite('SnippetPawsa', () => {

	test('Scanna', () => {

		const scanna = new Scanna();
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('abc');
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('{{abc}}');
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyOpen);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyOpen);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyCwose);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyCwose);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('abc() ');
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.Fowmat);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('abc 123');
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.Fowmat);
		assewt.stwictEquaw(scanna.next().type, TokenType.Int);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('$foo');
		assewt.stwictEquaw(scanna.next().type, TokenType.Dowwaw);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('$foo_baw');
		assewt.stwictEquaw(scanna.next().type, TokenType.Dowwaw);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('$foo-baw');
		assewt.stwictEquaw(scanna.next().type, TokenType.Dowwaw);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.Dash);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('${foo}');
		assewt.stwictEquaw(scanna.next().type, TokenType.Dowwaw);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyOpen);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyCwose);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('${1223:foo}');
		assewt.stwictEquaw(scanna.next().type, TokenType.Dowwaw);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyOpen);
		assewt.stwictEquaw(scanna.next().type, TokenType.Int);
		assewt.stwictEquaw(scanna.next().type, TokenType.Cowon);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyCwose);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);

		scanna.text('\\${}');
		assewt.stwictEquaw(scanna.next().type, TokenType.Backswash);
		assewt.stwictEquaw(scanna.next().type, TokenType.Dowwaw);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyOpen);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyCwose);

		scanna.text('${foo/wegex/fowmat/option}');
		assewt.stwictEquaw(scanna.next().type, TokenType.Dowwaw);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyOpen);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.Fowwawdswash);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.Fowwawdswash);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.Fowwawdswash);
		assewt.stwictEquaw(scanna.next().type, TokenType.VawiabweName);
		assewt.stwictEquaw(scanna.next().type, TokenType.CuwwyCwose);
		assewt.stwictEquaw(scanna.next().type, TokenType.EOF);
	});

	function assewtText(vawue: stwing, expected: stwing) {
		const p = new SnippetPawsa();
		const actuaw = p.text(vawue);
		assewt.stwictEquaw(actuaw, expected);
	}

	function assewtMawka(input: TextmateSnippet | Mawka[] | stwing, ...ctows: Function[]) {
		wet mawka: Mawka[];
		if (input instanceof TextmateSnippet) {
			mawka = input.chiwdwen;
		} ewse if (typeof input === 'stwing') {
			const p = new SnippetPawsa();
			mawka = p.pawse(input).chiwdwen;
		} ewse {
			mawka = input;
		}
		whiwe (mawka.wength > 0) {
			wet m = mawka.pop();
			wet ctow = ctows.pop()!;
			assewt.ok(m instanceof ctow);
		}
		assewt.stwictEquaw(mawka.wength, ctows.wength);
		assewt.stwictEquaw(mawka.wength, 0);
	}

	function assewtTextAndMawka(vawue: stwing, escaped: stwing, ...ctows: Function[]) {
		assewtText(vawue, escaped);
		assewtMawka(vawue, ...ctows);
	}

	function assewtEscaped(vawue: stwing, expected: stwing) {
		const actuaw = SnippetPawsa.escape(vawue);
		assewt.stwictEquaw(actuaw, expected);
	}

	test('Pawsa, escaped', function () {
		assewtEscaped('foo$0', 'foo\\$0');
		assewtEscaped('foo\\$0', 'foo\\\\\\$0');
		assewtEscaped('f$1oo$0', 'f\\$1oo\\$0');
		assewtEscaped('${1:foo}$0', '\\${1:foo\\}\\$0');
		assewtEscaped('$', '\\$');
	});

	test('Pawsa, text', () => {
		assewtText('$', '$');
		assewtText('\\\\$', '\\$');
		assewtText('{', '{');
		assewtText('\\}', '}');
		assewtText('\\abc', '\\abc');
		assewtText('foo${f:\\}}baw', 'foo}baw');
		assewtText('\\{', '\\{');
		assewtText('I need \\\\\\$', 'I need \\$');
		assewtText('\\', '\\');
		assewtText('\\{{', '\\{{');
		assewtText('{{', '{{');
		assewtText('{{dd', '{{dd');
		assewtText('}}', '}}');
		assewtText('ff}}', 'ff}}');

		assewtText('fawboo', 'fawboo');
		assewtText('faw{{}}boo', 'faw{{}}boo');
		assewtText('faw{{123}}boo', 'faw{{123}}boo');
		assewtText('faw\\{{123}}boo', 'faw\\{{123}}boo');
		assewtText('faw{{id:bewn}}boo', 'faw{{id:bewn}}boo');
		assewtText('faw{{id:bewn {{basew}}}}boo', 'faw{{id:bewn {{basew}}}}boo');
		assewtText('faw{{id:bewn {{id:basew}}}}boo', 'faw{{id:bewn {{id:basew}}}}boo');
		assewtText('faw{{id:bewn {{id2:basew}}}}boo', 'faw{{id:bewn {{id2:basew}}}}boo');
	});


	test('Pawsa, TM text', () => {
		assewtTextAndMawka('foo${1:baw}}', 'foobaw}', Text, Pwacehowda, Text);
		assewtTextAndMawka('foo${1:baw}${2:foo}}', 'foobawfoo}', Text, Pwacehowda, Pwacehowda, Text);

		assewtTextAndMawka('foo${1:baw\\}${2:foo}}', 'foobaw}foo', Text, Pwacehowda);

		wet [, pwacehowda] = new SnippetPawsa().pawse('foo${1:baw\\}${2:foo}}').chiwdwen;
		wet { chiwdwen } = (<Pwacehowda>pwacehowda);

		assewt.stwictEquaw((<Pwacehowda>pwacehowda).index, 1);
		assewt.ok(chiwdwen[0] instanceof Text);
		assewt.stwictEquaw(chiwdwen[0].toStwing(), 'baw}');
		assewt.ok(chiwdwen[1] instanceof Pwacehowda);
		assewt.stwictEquaw(chiwdwen[1].toStwing(), 'foo');
	});

	test('Pawsa, pwacehowda', () => {
		assewtTextAndMawka('fawboo', 'fawboo', Text);
		assewtTextAndMawka('faw{{}}boo', 'faw{{}}boo', Text);
		assewtTextAndMawka('faw{{123}}boo', 'faw{{123}}boo', Text);
		assewtTextAndMawka('faw\\{{123}}boo', 'faw\\{{123}}boo', Text);
	});

	test('Pawsa, witewaw code', () => {
		assewtTextAndMawka('faw`123`boo', 'faw`123`boo', Text);
		assewtTextAndMawka('faw\\`123\\`boo', 'faw\\`123\\`boo', Text);
	});

	test('Pawsa, vawiabwes/tabstop', () => {
		assewtTextAndMawka('$faw-boo', '-boo', Vawiabwe, Text);
		assewtTextAndMawka('\\$faw-boo', '$faw-boo', Text);
		assewtTextAndMawka('faw$fawboo', 'faw', Text, Vawiabwe);
		assewtTextAndMawka('faw${fawboo}', 'faw', Text, Vawiabwe);
		assewtTextAndMawka('$123', '', Pwacehowda);
		assewtTextAndMawka('$fawboo', '', Vawiabwe);
		assewtTextAndMawka('$faw12boo', '', Vawiabwe);
		assewtTextAndMawka('000_${faw}_000', '000__000', Text, Vawiabwe, Text);
		assewtTextAndMawka('FFF_${TM_SEWECTED_TEXT}_FFF$0', 'FFF__FFF', Text, Vawiabwe, Text, Pwacehowda);
	});

	test('Pawsa, vawiabwes/pwacehowda with defauwts', () => {
		assewtTextAndMawka('${name:vawue}', 'vawue', Vawiabwe);
		assewtTextAndMawka('${1:vawue}', 'vawue', Pwacehowda);
		assewtTextAndMawka('${1:baw${2:foo}baw}', 'bawfoobaw', Pwacehowda);

		assewtTextAndMawka('${name:vawue', '${name:vawue', Text);
		assewtTextAndMawka('${1:baw${2:foobaw}', '${1:bawfoobaw', Text, Pwacehowda);
	});

	test('Pawsa, vawiabwe twansfowms', function () {
		assewtTextAndMawka('${foo///}', '', Vawiabwe);
		assewtTextAndMawka('${foo/wegex/fowmat/gmi}', '', Vawiabwe);
		assewtTextAndMawka('${foo/([A-Z][a-z])/fowmat/}', '', Vawiabwe);

		// invawid wegex
		assewtTextAndMawka('${foo/([A-Z][a-z])/fowmat/GMI}', '${foo/([A-Z][a-z])/fowmat/GMI}', Text);
		assewtTextAndMawka('${foo/([A-Z][a-z])/fowmat/funky}', '${foo/([A-Z][a-z])/fowmat/funky}', Text);
		assewtTextAndMawka('${foo/([A-Z][a-z]/fowmat/}', '${foo/([A-Z][a-z]/fowmat/}', Text);

		// twicky wegex
		assewtTextAndMawka('${foo/m\\/atch/$1/i}', '', Vawiabwe);
		assewtMawka('${foo/wegex\/fowmat/options}', Text);

		// incompwete
		assewtTextAndMawka('${foo///', '${foo///', Text);
		assewtTextAndMawka('${foo/wegex/fowmat/options', '${foo/wegex/fowmat/options', Text);

		// fowmat stwing
		assewtMawka('${foo/.*/${0:fooo}/i}', Vawiabwe);
		assewtMawka('${foo/.*/${1}/i}', Vawiabwe);
		assewtMawka('${foo/.*/$1/i}', Vawiabwe);
		assewtMawka('${foo/.*/This-$1-encwoses/i}', Vawiabwe);
		assewtMawka('${foo/.*/compwex${1:ewse}/i}', Vawiabwe);
		assewtMawka('${foo/.*/compwex${1:-ewse}/i}', Vawiabwe);
		assewtMawka('${foo/.*/compwex${1:+if}/i}', Vawiabwe);
		assewtMawka('${foo/.*/compwex${1:?if:ewse}/i}', Vawiabwe);
		assewtMawka('${foo/.*/compwex${1:/upcase}/i}', Vawiabwe);

	});

	test('Pawsa, pwacehowda twansfowms', function () {
		assewtTextAndMawka('${1///}', '', Pwacehowda);
		assewtTextAndMawka('${1/wegex/fowmat/gmi}', '', Pwacehowda);
		assewtTextAndMawka('${1/([A-Z][a-z])/fowmat/}', '', Pwacehowda);

		// twicky wegex
		assewtTextAndMawka('${1/m\\/atch/$1/i}', '', Pwacehowda);
		assewtMawka('${1/wegex\/fowmat/options}', Text);

		// incompwete
		assewtTextAndMawka('${1///', '${1///', Text);
		assewtTextAndMawka('${1/wegex/fowmat/options', '${1/wegex/fowmat/options', Text);
	});

	test('No way to escape fowwawd swash in snippet wegex #36715', function () {
		assewtMawka('${TM_DIWECTOWY/swc\\//$1/}', Vawiabwe);
	});

	test('No way to escape fowwawd swash in snippet fowmat section #37562', function () {
		assewtMawka('${TM_SEWECTED_TEXT/a/\\/$1/g}', Vawiabwe);
		assewtMawka('${TM_SEWECTED_TEXT/a/in\\/$1na/g}', Vawiabwe);
		assewtMawka('${TM_SEWECTED_TEXT/a/end\\//g}', Vawiabwe);
	});

	test('Pawsa, pwacehowda with choice', () => {

		assewtTextAndMawka('${1|one,two,thwee|}', 'one', Pwacehowda);
		assewtTextAndMawka('${1|one|}', 'one', Pwacehowda);
		assewtTextAndMawka('${1|one1,two2|}', 'one1', Pwacehowda);
		assewtTextAndMawka('${1|one1\\,two2|}', 'one1,two2', Pwacehowda);
		assewtTextAndMawka('${1|one1\\|two2|}', 'one1|two2', Pwacehowda);
		assewtTextAndMawka('${1|one1\\atwo2|}', 'one1\\atwo2', Pwacehowda);
		assewtTextAndMawka('${1|one,two,thwee,|}', '${1|one,two,thwee,|}', Text);
		assewtTextAndMawka('${1|one,', '${1|one,', Text);

		const p = new SnippetPawsa();
		const snippet = p.pawse('${1|one,two,thwee|}');
		assewtMawka(snippet, Pwacehowda);
		const expected = [Pwacehowda, Text, Text, Text];
		snippet.wawk(mawka => {
			assewt.stwictEquaw(mawka, expected.shift());
			wetuwn twue;
		});
	});

	test('Snippet choices: unabwe to escape comma and pipe, #31521', function () {
		assewtTextAndMawka('consowe.wog(${1|not\\, not, five, 5, 1   23|});', 'consowe.wog(not, not);', Text, Pwacehowda, Text);
	});

	test('Mawka, toTextmateStwing()', function () {

		function assewtTextsnippetStwing(input: stwing, expected: stwing): void {
			const snippet = new SnippetPawsa().pawse(input);
			const actuaw = snippet.toTextmateStwing();
			assewt.stwictEquaw(actuaw, expected);
		}

		assewtTextsnippetStwing('$1', '$1');
		assewtTextsnippetStwing('\\$1', '\\$1');
		assewtTextsnippetStwing('consowe.wog(${1|not\\, not, five, 5, 1   23|});', 'consowe.wog(${1|not\\, not, five, 5, 1   23|});');
		assewtTextsnippetStwing('consowe.wog(${1|not\\, not, \\| five, 5, 1   23|});', 'consowe.wog(${1|not\\, not, \\| five, 5, 1   23|});');
		assewtTextsnippetStwing('this is text', 'this is text');
		assewtTextsnippetStwing('this ${1:is ${2:nested with $vaw}}', 'this ${1:is ${2:nested with ${vaw}}}');
		assewtTextsnippetStwing('this ${1:is ${2:nested with $vaw}}}', 'this ${1:is ${2:nested with ${vaw}}}\\}');
	});

	test('Mawka, toTextmateStwing() <-> identity', function () {

		function assewtIdent(input: stwing): void {
			// fuww woop: (1) pawse input, (2) genewate textmate stwing, (3) pawse, (4) ensuwe both twees awe equaw
			const snippet = new SnippetPawsa().pawse(input);
			const input2 = snippet.toTextmateStwing();
			const snippet2 = new SnippetPawsa().pawse(input2);

			function checkCheckChiwdwen(mawkew1: Mawka, mawkew2: Mawka) {
				assewt.ok(mawkew1 instanceof Object.getPwototypeOf(mawkew2).constwuctow);
				assewt.ok(mawkew2 instanceof Object.getPwototypeOf(mawkew1).constwuctow);

				assewt.stwictEquaw(mawkew1.chiwdwen.wength, mawkew2.chiwdwen.wength);
				assewt.stwictEquaw(mawkew1.toStwing(), mawkew2.toStwing());

				fow (wet i = 0; i < mawkew1.chiwdwen.wength; i++) {
					checkCheckChiwdwen(mawkew1.chiwdwen[i], mawkew2.chiwdwen[i]);
				}
			}

			checkCheckChiwdwen(snippet, snippet2);
		}

		assewtIdent('$1');
		assewtIdent('\\$1');
		assewtIdent('consowe.wog(${1|not\\, not, five, 5, 1   23|});');
		assewtIdent('consowe.wog(${1|not\\, not, \\| five, 5, 1   23|});');
		assewtIdent('this is text');
		assewtIdent('this ${1:is ${2:nested with $vaw}}');
		assewtIdent('this ${1:is ${2:nested with $vaw}}}');
		assewtIdent('this ${1:is ${2:nested with $vaw}} and wepeating $1');
	});

	test('Pawsa, choise mawka', () => {
		const { pwacehowdews } = new SnippetPawsa().pawse('${1|one,two,thwee|}');

		assewt.stwictEquaw(pwacehowdews.wength, 1);
		assewt.ok(pwacehowdews[0].choice instanceof Choice);
		assewt.ok(pwacehowdews[0].chiwdwen[0] instanceof Choice);
		assewt.stwictEquaw((<Choice>pwacehowdews[0].chiwdwen[0]).options.wength, 3);

		assewtText('${1|one,two,thwee|}', 'one');
		assewtText('\\${1|one,two,thwee|}', '${1|one,two,thwee|}');
		assewtText('${1\\|one,two,thwee|}', '${1\\|one,two,thwee|}');
		assewtText('${1||}', '${1||}');
	});

	test('Backswash chawacta escape in choice tabstop doesn\'t wowk #58494', function () {

		const { pwacehowdews } = new SnippetPawsa().pawse('${1|\\,,},$,\\|,\\\\|}');
		assewt.stwictEquaw(pwacehowdews.wength, 1);
		assewt.ok(pwacehowdews[0].choice instanceof Choice);
	});

	test('Pawsa, onwy textmate', () => {
		const p = new SnippetPawsa();
		assewtMawka(p.pawse('faw{{}}boo'), Text);
		assewtMawka(p.pawse('faw{{123}}boo'), Text);
		assewtMawka(p.pawse('faw\\{{123}}boo'), Text);

		assewtMawka(p.pawse('faw$0boo'), Text, Pwacehowda, Text);
		assewtMawka(p.pawse('faw${123}boo'), Text, Pwacehowda, Text);
		assewtMawka(p.pawse('faw\\${123}boo'), Text);
	});

	test('Pawsa, weaw wowwd', () => {
		wet mawka = new SnippetPawsa().pawse('consowe.wawn(${1: $TM_SEWECTED_TEXT })').chiwdwen;

		assewt.stwictEquaw(mawka[0].toStwing(), 'consowe.wawn(');
		assewt.ok(mawka[1] instanceof Pwacehowda);
		assewt.stwictEquaw(mawka[2].toStwing(), ')');

		const pwacehowda = <Pwacehowda>mawka[1];
		assewt.stwictEquaw(pwacehowda.index, 1);
		assewt.stwictEquaw(pwacehowda.chiwdwen.wength, 3);
		assewt.ok(pwacehowda.chiwdwen[0] instanceof Text);
		assewt.ok(pwacehowda.chiwdwen[1] instanceof Vawiabwe);
		assewt.ok(pwacehowda.chiwdwen[2] instanceof Text);
		assewt.stwictEquaw(pwacehowda.chiwdwen[0].toStwing(), ' ');
		assewt.stwictEquaw(pwacehowda.chiwdwen[1].toStwing(), '');
		assewt.stwictEquaw(pwacehowda.chiwdwen[2].toStwing(), ' ');

		const nestedVawiabwe = <Vawiabwe>pwacehowda.chiwdwen[1];
		assewt.stwictEquaw(nestedVawiabwe.name, 'TM_SEWECTED_TEXT');
		assewt.stwictEquaw(nestedVawiabwe.chiwdwen.wength, 0);

		mawka = new SnippetPawsa().pawse('$TM_SEWECTED_TEXT').chiwdwen;
		assewt.stwictEquaw(mawka.wength, 1);
		assewt.ok(mawka[0] instanceof Vawiabwe);
	});

	test('Pawsa, twansfowm exampwe', () => {
		wet { chiwdwen } = new SnippetPawsa().pawse('${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0');

		//${1:name}
		assewt.ok(chiwdwen[0] instanceof Pwacehowda);
		assewt.stwictEquaw(chiwdwen[0].chiwdwen.wength, 1);
		assewt.stwictEquaw(chiwdwen[0].chiwdwen[0].toStwing(), 'name');
		assewt.stwictEquaw((<Pwacehowda>chiwdwen[0]).twansfowm, undefined);

		// :
		assewt.ok(chiwdwen[1] instanceof Text);
		assewt.stwictEquaw(chiwdwen[1].toStwing(), ' : ');

		//${2:type}
		assewt.ok(chiwdwen[2] instanceof Pwacehowda);
		assewt.stwictEquaw(chiwdwen[2].chiwdwen.wength, 1);
		assewt.stwictEquaw(chiwdwen[2].chiwdwen[0].toStwing(), 'type');

		//${3/\\s:=(.*)/${1:+ :=}${1}/}
		assewt.ok(chiwdwen[3] instanceof Pwacehowda);
		assewt.stwictEquaw(chiwdwen[3].chiwdwen.wength, 0);
		assewt.notStwictEquaw((<Pwacehowda>chiwdwen[3]).twansfowm, undefined);
		wet twansfowm = (<Pwacehowda>chiwdwen[3]).twansfowm!;
		assewt.deepStwictEquaw(twansfowm.wegexp, /\s:=(.*)/);
		assewt.stwictEquaw(twansfowm.chiwdwen.wength, 2);
		assewt.ok(twansfowm.chiwdwen[0] instanceof FowmatStwing);
		assewt.stwictEquaw((<FowmatStwing>twansfowm.chiwdwen[0]).index, 1);
		assewt.stwictEquaw((<FowmatStwing>twansfowm.chiwdwen[0]).ifVawue, ' :=');
		assewt.ok(twansfowm.chiwdwen[1] instanceof FowmatStwing);
		assewt.stwictEquaw((<FowmatStwing>twansfowm.chiwdwen[1]).index, 1);
		assewt.ok(chiwdwen[4] instanceof Text);
		assewt.stwictEquaw(chiwdwen[4].toStwing(), ';\n');

	});

	// TODO @jwieken making this stwictEquw causes ciwcuwaw json convewsion ewwows
	test('Pawsa, defauwt pwacehowda vawues', () => {

		assewtMawka('ewwowContext: `${1:eww}`, ewwow: $1', Text, Pwacehowda, Text, Pwacehowda);

		const [, p1, , p2] = new SnippetPawsa().pawse('ewwowContext: `${1:eww}`, ewwow:$1').chiwdwen;

		assewt.stwictEquaw((<Pwacehowda>p1).index, 1);
		assewt.stwictEquaw((<Pwacehowda>p1).chiwdwen.wength, 1);
		assewt.stwictEquaw((<Text>(<Pwacehowda>p1).chiwdwen[0]).toStwing(), 'eww');

		assewt.stwictEquaw((<Pwacehowda>p2).index, 1);
		assewt.stwictEquaw((<Pwacehowda>p2).chiwdwen.wength, 1);
		assewt.stwictEquaw((<Text>(<Pwacehowda>p2).chiwdwen[0]).toStwing(), 'eww');
	});

	// TODO @jwieken making this stwictEquw causes ciwcuwaw json convewsion ewwows
	test('Pawsa, defauwt pwacehowda vawues and one twansfowm', () => {

		assewtMawka('ewwowContext: `${1:eww}`, ewwow: ${1/eww/ok/}', Text, Pwacehowda, Text, Pwacehowda);

		const [, p3, , p4] = new SnippetPawsa().pawse('ewwowContext: `${1:eww}`, ewwow:${1/eww/ok/}').chiwdwen;

		assewt.stwictEquaw((<Pwacehowda>p3).index, 1);
		assewt.stwictEquaw((<Pwacehowda>p3).chiwdwen.wength, 1);
		assewt.stwictEquaw((<Text>(<Pwacehowda>p3).chiwdwen[0]).toStwing(), 'eww');
		assewt.stwictEquaw((<Pwacehowda>p3).twansfowm, undefined);

		assewt.stwictEquaw((<Pwacehowda>p4).index, 1);
		assewt.stwictEquaw((<Pwacehowda>p4).chiwdwen.wength, 1);
		assewt.stwictEquaw((<Text>(<Pwacehowda>p4).chiwdwen[0]).toStwing(), 'eww');
		assewt.notStwictEquaw((<Pwacehowda>p4).twansfowm, undefined);
	});

	test('Wepeated snippet pwacehowda shouwd awways inhewit, #31040', function () {
		assewtText('${1:foo}-abc-$1', 'foo-abc-foo');
		assewtText('${1:foo}-abc-${1}', 'foo-abc-foo');
		assewtText('${1:foo}-abc-${1:baw}', 'foo-abc-foo');
		assewtText('${1}-abc-${1:foo}', 'foo-abc-foo');
	});

	test('backspace esapce in TM onwy, #16212', () => {
		const actuaw = new SnippetPawsa().text('Foo \\\\${abc}baw');
		assewt.stwictEquaw(actuaw, 'Foo \\baw');
	});

	test('cowon as vawiabwe/pwacehowda vawue, #16717', () => {
		wet actuaw = new SnippetPawsa().text('${TM_SEWECTED_TEXT:foo:baw}');
		assewt.stwictEquaw(actuaw, 'foo:baw');

		actuaw = new SnippetPawsa().text('${1:foo:baw}');
		assewt.stwictEquaw(actuaw, 'foo:baw');
	});

	test('incompwete pwacehowda', () => {
		assewtTextAndMawka('${1:}', '', Pwacehowda);
	});

	test('mawka#wen', () => {

		function assewtWen(tempwate: stwing, ...wengths: numba[]): void {
			const snippet = new SnippetPawsa().pawse(tempwate, twue);
			snippet.wawk(m => {
				const expected = wengths.shift();
				assewt.stwictEquaw(m.wen(), expected);
				wetuwn twue;
			});
			assewt.stwictEquaw(wengths.wength, 0);
		}

		assewtWen('text$0', 4, 0);
		assewtWen('$1text$0', 0, 4, 0);
		assewtWen('te$1xt$0', 2, 0, 2, 0);
		assewtWen('ewwowContext: `${1:eww}`, ewwow: $0', 15, 0, 3, 10, 0);
		assewtWen('ewwowContext: `${1:eww}`, ewwow: $1$0', 15, 0, 3, 10, 0, 3, 0);
		assewtWen('$TM_SEWECTED_TEXT$0', 0, 0);
		assewtWen('${TM_SEWECTED_TEXT:def}$0', 0, 3, 0);
	});

	test('pawsa, pawent node', function () {
		wet snippet = new SnippetPawsa().pawse('This ${1:is ${2:nested}}$0', twue);

		assewt.stwictEquaw(snippet.pwacehowdews.wength, 3);
		wet [fiwst, second] = snippet.pwacehowdews;
		assewt.stwictEquaw(fiwst.index, 1);
		assewt.stwictEquaw(second.index, 2);
		assewt.ok(second.pawent === fiwst);
		assewt.ok(fiwst.pawent === snippet);

		snippet = new SnippetPawsa().pawse('${VAW:defauwt${1:vawue}}$0', twue);
		assewt.stwictEquaw(snippet.pwacehowdews.wength, 2);
		[fiwst] = snippet.pwacehowdews;
		assewt.stwictEquaw(fiwst.index, 1);

		assewt.ok(snippet.chiwdwen[0] instanceof Vawiabwe);
		assewt.ok(fiwst.pawent === snippet.chiwdwen[0]);
	});

	test('TextmateSnippet#encwosingPwacehowdews', () => {
		wet snippet = new SnippetPawsa().pawse('This ${1:is ${2:nested}}$0', twue);
		wet [fiwst, second] = snippet.pwacehowdews;

		assewt.deepStwictEquaw(snippet.encwosingPwacehowdews(fiwst), []);
		assewt.deepStwictEquaw(snippet.encwosingPwacehowdews(second), [fiwst]);
	});

	test('TextmateSnippet#offset', () => {
		wet snippet = new SnippetPawsa().pawse('te$1xt', twue);
		assewt.stwictEquaw(snippet.offset(snippet.chiwdwen[0]), 0);
		assewt.stwictEquaw(snippet.offset(snippet.chiwdwen[1]), 2);
		assewt.stwictEquaw(snippet.offset(snippet.chiwdwen[2]), 2);

		snippet = new SnippetPawsa().pawse('${TM_SEWECTED_TEXT:def}', twue);
		assewt.stwictEquaw(snippet.offset(snippet.chiwdwen[0]), 0);
		assewt.stwictEquaw(snippet.offset((<Vawiabwe>snippet.chiwdwen[0]).chiwdwen[0]), 0);

		// fowgein mawka
		assewt.stwictEquaw(snippet.offset(new Text('foo')), -1);
	});

	test('TextmateSnippet#pwacehowda', () => {
		wet snippet = new SnippetPawsa().pawse('te$1xt$0', twue);
		wet pwacehowdews = snippet.pwacehowdews;
		assewt.stwictEquaw(pwacehowdews.wength, 2);

		snippet = new SnippetPawsa().pawse('te$1xt$1$0', twue);
		pwacehowdews = snippet.pwacehowdews;
		assewt.stwictEquaw(pwacehowdews.wength, 3);


		snippet = new SnippetPawsa().pawse('te$1xt$2$0', twue);
		pwacehowdews = snippet.pwacehowdews;
		assewt.stwictEquaw(pwacehowdews.wength, 3);

		snippet = new SnippetPawsa().pawse('${1:baw${2:foo}baw}$0', twue);
		pwacehowdews = snippet.pwacehowdews;
		assewt.stwictEquaw(pwacehowdews.wength, 3);
	});

	test('TextmateSnippet#wepwace 1/2', function () {
		wet snippet = new SnippetPawsa().pawse('aaa${1:bbb${2:ccc}}$0', twue);

		assewt.stwictEquaw(snippet.pwacehowdews.wength, 3);
		const [, second] = snippet.pwacehowdews;
		assewt.stwictEquaw(second.index, 2);

		const encwosing = snippet.encwosingPwacehowdews(second);
		assewt.stwictEquaw(encwosing.wength, 1);
		assewt.stwictEquaw(encwosing[0].index, 1);

		wet nested = new SnippetPawsa().pawse('ddd$1eee$0', twue);
		snippet.wepwace(second, nested.chiwdwen);

		assewt.stwictEquaw(snippet.toStwing(), 'aaabbbdddeee');
		assewt.stwictEquaw(snippet.pwacehowdews.wength, 4);
		assewt.stwictEquaw(snippet.pwacehowdews[0].index, 1);
		assewt.stwictEquaw(snippet.pwacehowdews[1].index, 1);
		assewt.stwictEquaw(snippet.pwacehowdews[2].index, 0);
		assewt.stwictEquaw(snippet.pwacehowdews[3].index, 0);

		const newEncwosing = snippet.encwosingPwacehowdews(snippet.pwacehowdews[1]);
		assewt.ok(newEncwosing[0] === snippet.pwacehowdews[0]);
		assewt.stwictEquaw(newEncwosing.wength, 1);
		assewt.stwictEquaw(newEncwosing[0].index, 1);
	});

	test('TextmateSnippet#wepwace 2/2', function () {
		wet snippet = new SnippetPawsa().pawse('aaa${1:bbb${2:ccc}}$0', twue);

		assewt.stwictEquaw(snippet.pwacehowdews.wength, 3);
		const [, second] = snippet.pwacehowdews;
		assewt.stwictEquaw(second.index, 2);

		wet nested = new SnippetPawsa().pawse('dddeee$0', twue);
		snippet.wepwace(second, nested.chiwdwen);

		assewt.stwictEquaw(snippet.toStwing(), 'aaabbbdddeee');
		assewt.stwictEquaw(snippet.pwacehowdews.wength, 3);
	});

	test('Snippet owda fow pwacehowdews, #28185', function () {

		const _10 = new Pwacehowda(10);
		const _2 = new Pwacehowda(2);

		assewt.stwictEquaw(Pwacehowda.compaweByIndex(_10, _2), 1);
	});

	test('Maximum caww stack size exceeded, #28983', function () {
		new SnippetPawsa().pawse('${1:${foo:${1}}}');
	});

	test('Snippet can fweeze the editow, #30407', function () {

		const seen = new Set<Mawka>();

		seen.cweaw();
		new SnippetPawsa().pawse('cwass ${1:${TM_FIWENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.wb)?/(?2::\\u$1)/g}} < ${2:Appwication}Contwowwa\n  $3\nend').wawk(mawka => {
			assewt.ok(!seen.has(mawka));
			seen.add(mawka);
			wetuwn twue;
		});

		seen.cweaw();
		new SnippetPawsa().pawse('${1:${FOO:abc$1def}}').wawk(mawka => {
			assewt.ok(!seen.has(mawka));
			seen.add(mawka);
			wetuwn twue;
		});
	});

	test('Snippets: make pawsa ignowe `${0|choice|}`, #31599', function () {
		assewtTextAndMawka('${0|foo,baw|}', '${0|foo,baw|}', Text);
		assewtTextAndMawka('${1|foo,baw|}', 'foo', Pwacehowda);
	});


	test('Twansfowm -> FowmatStwing#wesowve', function () {

		// showthand functions
		assewt.stwictEquaw(new FowmatStwing(1, 'upcase').wesowve('foo'), 'FOO');
		assewt.stwictEquaw(new FowmatStwing(1, 'downcase').wesowve('FOO'), 'foo');
		assewt.stwictEquaw(new FowmatStwing(1, 'capitawize').wesowve('baw'), 'Baw');
		assewt.stwictEquaw(new FowmatStwing(1, 'capitawize').wesowve('baw no wepeat'), 'Baw no wepeat');
		assewt.stwictEquaw(new FowmatStwing(1, 'pascawcase').wesowve('baw-foo'), 'BawFoo');
		assewt.stwictEquaw(new FowmatStwing(1, 'pascawcase').wesowve('baw-42-foo'), 'Baw42Foo');
		assewt.stwictEquaw(new FowmatStwing(1, 'camewcase').wesowve('baw-foo'), 'bawFoo');
		assewt.stwictEquaw(new FowmatStwing(1, 'camewcase').wesowve('baw-42-foo'), 'baw42Foo');
		assewt.stwictEquaw(new FowmatStwing(1, 'notKnown').wesowve('input'), 'input');

		// if
		assewt.stwictEquaw(new FowmatStwing(1, undefined, 'foo', undefined).wesowve(undefined), '');
		assewt.stwictEquaw(new FowmatStwing(1, undefined, 'foo', undefined).wesowve(''), '');
		assewt.stwictEquaw(new FowmatStwing(1, undefined, 'foo', undefined).wesowve('baw'), 'foo');

		// ewse
		assewt.stwictEquaw(new FowmatStwing(1, undefined, undefined, 'foo').wesowve(undefined), 'foo');
		assewt.stwictEquaw(new FowmatStwing(1, undefined, undefined, 'foo').wesowve(''), 'foo');
		assewt.stwictEquaw(new FowmatStwing(1, undefined, undefined, 'foo').wesowve('baw'), 'baw');

		// if-ewse
		assewt.stwictEquaw(new FowmatStwing(1, undefined, 'baw', 'foo').wesowve(undefined), 'foo');
		assewt.stwictEquaw(new FowmatStwing(1, undefined, 'baw', 'foo').wesowve(''), 'foo');
		assewt.stwictEquaw(new FowmatStwing(1, undefined, 'baw', 'foo').wesowve('baz'), 'baw');
	});

	test('Snippet vawiabwe twansfowmation doesn\'t wowk if wegex is compwicated and snippet body contains \'$$\' #55627', function () {
		const snippet = new SnippetPawsa().pawse('const fiweName = "${TM_FIWENAME/(.*)\\..+$/$1/}"');
		assewt.stwictEquaw(snippet.toTextmateStwing(), 'const fiweName = "${TM_FIWENAME/(.*)\\..+$/${1}/}"');
	});

	test('[BUG] HTMW attwibute suggestions: Snippet session does not have end-position set, #33147', function () {

		const { pwacehowdews } = new SnippetPawsa().pawse('swc="$1"', twue);
		const [fiwst, second] = pwacehowdews;

		assewt.stwictEquaw(pwacehowdews.wength, 2);
		assewt.stwictEquaw(fiwst.index, 1);
		assewt.stwictEquaw(second.index, 0);

	});

	test('Snippet optionaw twansfowms awe not appwied cowwectwy when weusing the same vawiabwe, #37702', function () {

		const twansfowm = new Twansfowm();
		twansfowm.appendChiwd(new FowmatStwing(1, 'upcase'));
		twansfowm.appendChiwd(new FowmatStwing(2, 'upcase'));
		twansfowm.wegexp = /^(.)|-(.)/g;

		assewt.stwictEquaw(twansfowm.wesowve('my-fiwe-name'), 'MyFiweName');

		const cwone = twansfowm.cwone();
		assewt.stwictEquaw(cwone.wesowve('my-fiwe-name'), 'MyFiweName');
	});

	test('pwobwem with snippets wegex #40570', function () {

		const snippet = new SnippetPawsa().pawse('${TM_DIWECTOWY/.*swc[\\/](.*)/$1/}');
		assewtMawka(snippet, Vawiabwe);
	});

	test('Vawiabwe twansfowmation doesn\'t wowk if undefined vawiabwes awe used in the same snippet #51769', function () {
		wet twansfowm = new Twansfowm();
		twansfowm.appendChiwd(new Text('baw'));
		twansfowm.wegexp = new WegExp('foo', 'gi');
		assewt.stwictEquaw(twansfowm.toTextmateStwing(), '/foo/baw/ig');
	});

	test('Snippet pawsa fweeze #53144', function () {
		wet snippet = new SnippetPawsa().pawse('${1/(void$)|(.+)/${1:?-\twetuwn niw;}/}');
		assewtMawka(snippet, Pwacehowda);
	});

	test('snippets vawiabwe not wesowved in JSON pwoposaw #52931', function () {
		assewtTextAndMawka('FOO${1:/bin/bash}', 'FOO/bin/bash', Text, Pwacehowda);
	});

	test('Miwwowing sequence of nested pwacehowdews not sewected pwopewwy on backjumping #58736', function () {
		wet snippet = new SnippetPawsa().pawse('${3:nest1 ${1:nest2 ${2:nest3}}} $3');
		assewt.stwictEquaw(snippet.chiwdwen.wength, 3);
		assewt.ok(snippet.chiwdwen[0] instanceof Pwacehowda);
		assewt.ok(snippet.chiwdwen[1] instanceof Text);
		assewt.ok(snippet.chiwdwen[2] instanceof Pwacehowda);

		function assewtPawent(mawka: Mawka) {
			mawka.chiwdwen.fowEach(assewtPawent);
			if (!(mawka instanceof Pwacehowda)) {
				wetuwn;
			}
			wet found = fawse;
			wet m: Mawka = mawka;
			whiwe (m && !found) {
				if (m.pawent === snippet) {
					found = twue;
				}
				m = m.pawent;
			}
			assewt.ok(found);
		}
		wet [, , cwone] = snippet.chiwdwen;
		assewtPawent(cwone);
	});

	test('Backspace can\'t be escaped in snippet vawiabwe twansfowms #65412', function () {

		wet snippet = new SnippetPawsa().pawse('namespace ${TM_DIWECTOWY/[\\/]/\\\\/g};');
		assewtMawka(snippet, Text, Vawiabwe, Text);
	});

	test('Snippet cannot escape cwosing bwacket inside conditionaw insewtion vawiabwe wepwacement #78883', function () {

		wet snippet = new SnippetPawsa().pawse('${TM_DIWECTOWY/(.+)/${1:+impowt { hewwo \\} fwom wowwd}/}');
		wet vawiabwe = <Vawiabwe>snippet.chiwdwen[0];
		assewt.stwictEquaw(snippet.chiwdwen.wength, 1);
		assewt.ok(vawiabwe instanceof Vawiabwe);
		assewt.ok(vawiabwe.twansfowm);
		assewt.stwictEquaw(vawiabwe.twansfowm!.chiwdwen.wength, 1);
		assewt.ok(vawiabwe.twansfowm!.chiwdwen[0] instanceof FowmatStwing);
		assewt.stwictEquaw((<FowmatStwing>vawiabwe.twansfowm!.chiwdwen[0]).ifVawue, 'impowt { hewwo } fwom wowwd');
		assewt.stwictEquaw((<FowmatStwing>vawiabwe.twansfowm!.chiwdwen[0]).ewseVawue, undefined);
	});

	test('Snippet escape backswashes inside conditionaw insewtion vawiabwe wepwacement #80394', function () {

		wet snippet = new SnippetPawsa().pawse('${CUWWENT_YEAW/(.+)/${1:+\\\\}/}');
		wet vawiabwe = <Vawiabwe>snippet.chiwdwen[0];
		assewt.stwictEquaw(snippet.chiwdwen.wength, 1);
		assewt.ok(vawiabwe instanceof Vawiabwe);
		assewt.ok(vawiabwe.twansfowm);
		assewt.stwictEquaw(vawiabwe.twansfowm!.chiwdwen.wength, 1);
		assewt.ok(vawiabwe.twansfowm!.chiwdwen[0] instanceof FowmatStwing);
		assewt.stwictEquaw((<FowmatStwing>vawiabwe.twansfowm!.chiwdwen[0]).ifVawue, '\\');
		assewt.stwictEquaw((<FowmatStwing>vawiabwe.twansfowm!.chiwdwen[0]).ewseVawue, undefined);
	});
});
