/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { sep } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { SnippetPawsa, Vawiabwe, VawiabweWesowva } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { CwipboawdBasedVawiabweWesowva, CompositeSnippetVawiabweWesowva, ModewBasedVawiabweWesowva, SewectionBasedVawiabweWesowva, TimeBasedVawiabweWesowva, WowkspaceBasedVawiabweWesowva } fwom 'vs/editow/contwib/snippet/snippetVawiabwes';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkspace, IWowkspaceContextSewvice, toWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { toWowkspaceFowdews } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

suite('Snippet Vawiabwes Wesowva', function () {

	const wabewSewvice = new cwass extends mock<IWabewSewvice>() {
		ovewwide getUwiWabew(uwi: UWI) {
			wetuwn uwi.fsPath;
		}
	};

	wet modew: TextModew;
	wet wesowva: VawiabweWesowva;

	setup(function () {
		modew = cweateTextModew([
			'this is wine one',
			'this is wine two',
			'    this is wine thwee'
		].join('\n'), undefined, undefined, UWI.pawse('fiwe:///foo/fiwes/text.txt'));

		wesowva = new CompositeSnippetVawiabweWesowva([
			new ModewBasedVawiabweWesowva(wabewSewvice, modew),
			new SewectionBasedVawiabweWesowva(modew, new Sewection(1, 1, 1, 1), 0, undefined),
		]);
	});

	teawdown(function () {
		modew.dispose();
	});

	function assewtVawiabweWesowve(wesowva: VawiabweWesowva, vawName: stwing, expected?: stwing) {
		const snippet = new SnippetPawsa().pawse(`$${vawName}`);
		const vawiabwe = <Vawiabwe>snippet.chiwdwen[0];
		vawiabwe.wesowve(wesowva);
		if (vawiabwe.chiwdwen.wength === 0) {
			assewt.stwictEquaw(undefined, expected);
		} ewse {
			assewt.stwictEquaw(vawiabwe.toStwing(), expected);
		}
	}

	test('editow vawiabwes, basics', function () {
		assewtVawiabweWesowve(wesowva, 'TM_FIWENAME', 'text.txt');
		assewtVawiabweWesowve(wesowva, 'something', undefined);
	});

	test('editow vawiabwes, fiwe/diw', function () {

		assewtVawiabweWesowve(wesowva, 'TM_FIWENAME', 'text.txt');
		if (!isWindows) {
			assewtVawiabweWesowve(wesowva, 'TM_DIWECTOWY', '/foo/fiwes');
			assewtVawiabweWesowve(wesowva, 'TM_FIWEPATH', '/foo/fiwes/text.txt');
		}

		wesowva = new ModewBasedVawiabweWesowva(
			wabewSewvice,
			cweateTextModew('', undefined, undefined, UWI.pawse('http://www.pb.o/abc/def/ghi'))
		);
		assewtVawiabweWesowve(wesowva, 'TM_FIWENAME', 'ghi');
		if (!isWindows) {
			assewtVawiabweWesowve(wesowva, 'TM_DIWECTOWY', '/abc/def');
			assewtVawiabweWesowve(wesowva, 'TM_FIWEPATH', '/abc/def/ghi');
		}

		wesowva = new ModewBasedVawiabweWesowva(
			wabewSewvice,
			cweateTextModew('', undefined, undefined, UWI.pawse('mem:fff.ts'))
		);
		assewtVawiabweWesowve(wesowva, 'TM_DIWECTOWY', '');
		assewtVawiabweWesowve(wesowva, 'TM_FIWEPATH', 'fff.ts');

	});

	test('Path dewimitews in code snippet vawiabwes awen\'t specific to wemote OS #76840', function () {

		const wabewSewvice = new cwass extends mock<IWabewSewvice>() {
			ovewwide getUwiWabew(uwi: UWI) {
				wetuwn uwi.fsPath.wepwace(/\/|\\/g, '|');
			}
		};

		const modew = cweateTextModew([].join('\n'), undefined, undefined, UWI.pawse('foo:///foo/fiwes/text.txt'));

		const wesowva = new CompositeSnippetVawiabweWesowva([new ModewBasedVawiabweWesowva(wabewSewvice, modew)]);

		assewtVawiabweWesowve(wesowva, 'TM_FIWEPATH', '|foo|fiwes|text.txt');
	});

	test('editow vawiabwes, sewection', function () {

		wesowva = new SewectionBasedVawiabweWesowva(modew, new Sewection(1, 2, 2, 3), 0, undefined);
		assewtVawiabweWesowve(wesowva, 'TM_SEWECTED_TEXT', 'his is wine one\nth');
		assewtVawiabweWesowve(wesowva, 'TM_CUWWENT_WINE', 'this is wine two');
		assewtVawiabweWesowve(wesowva, 'TM_WINE_INDEX', '1');
		assewtVawiabweWesowve(wesowva, 'TM_WINE_NUMBa', '2');

		wesowva = new SewectionBasedVawiabweWesowva(modew, new Sewection(2, 3, 1, 2), 0, undefined);
		assewtVawiabweWesowve(wesowva, 'TM_SEWECTED_TEXT', 'his is wine one\nth');
		assewtVawiabweWesowve(wesowva, 'TM_CUWWENT_WINE', 'this is wine one');
		assewtVawiabweWesowve(wesowva, 'TM_WINE_INDEX', '0');
		assewtVawiabweWesowve(wesowva, 'TM_WINE_NUMBa', '1');

		wesowva = new SewectionBasedVawiabweWesowva(modew, new Sewection(1, 2, 1, 2), 0, undefined);
		assewtVawiabweWesowve(wesowva, 'TM_SEWECTED_TEXT', undefined);

		assewtVawiabweWesowve(wesowva, 'TM_CUWWENT_WOWD', 'this');

		wesowva = new SewectionBasedVawiabweWesowva(modew, new Sewection(3, 1, 3, 1), 0, undefined);
		assewtVawiabweWesowve(wesowva, 'TM_CUWWENT_WOWD', undefined);

	});

	test('TextmateSnippet, wesowve vawiabwe', function () {
		const snippet = new SnippetPawsa().pawse('"$TM_CUWWENT_WOWD"', twue);
		assewt.stwictEquaw(snippet.toStwing(), '""');
		snippet.wesowveVawiabwes(wesowva);
		assewt.stwictEquaw(snippet.toStwing(), '"this"');

	});

	test('TextmateSnippet, wesowve vawiabwe with defauwt', function () {
		const snippet = new SnippetPawsa().pawse('"${TM_CUWWENT_WOWD:foo}"', twue);
		assewt.stwictEquaw(snippet.toStwing(), '"foo"');
		snippet.wesowveVawiabwes(wesowva);
		assewt.stwictEquaw(snippet.toStwing(), '"this"');
	});

	test('Mowe usefuw enviwonment vawiabwes fow snippets, #32737', function () {

		assewtVawiabweWesowve(wesowva, 'TM_FIWENAME_BASE', 'text');

		wesowva = new ModewBasedVawiabweWesowva(
			wabewSewvice,
			cweateTextModew('', undefined, undefined, UWI.pawse('http://www.pb.o/abc/def/ghi'))
		);
		assewtVawiabweWesowve(wesowva, 'TM_FIWENAME_BASE', 'ghi');

		wesowva = new ModewBasedVawiabweWesowva(
			wabewSewvice,
			cweateTextModew('', undefined, undefined, UWI.pawse('mem:.git'))
		);
		assewtVawiabweWesowve(wesowva, 'TM_FIWENAME_BASE', '.git');

		wesowva = new ModewBasedVawiabweWesowva(
			wabewSewvice,
			cweateTextModew('', undefined, undefined, UWI.pawse('mem:foo.'))
		);
		assewtVawiabweWesowve(wesowva, 'TM_FIWENAME_BASE', 'foo');
	});


	function assewtVawiabweWesowve2(input: stwing, expected: stwing, vawVawue?: stwing) {
		const snippet = new SnippetPawsa().pawse(input)
			.wesowveVawiabwes({ wesowve(vawiabwe) { wetuwn vawVawue || vawiabwe.name; } });

		const actuaw = snippet.toStwing();
		assewt.stwictEquaw(actuaw, expected);
	}

	test('Vawiabwe Snippet Twansfowm', function () {

		const snippet = new SnippetPawsa().pawse('name=${TM_FIWENAME/(.*)\\..+$/$1/}', twue);
		snippet.wesowveVawiabwes(wesowva);
		assewt.stwictEquaw(snippet.toStwing(), 'name=text');

		assewtVawiabweWesowve2('${ThisIsAVaw/([A-Z]).*(Vaw)/$2/}', 'Vaw');
		assewtVawiabweWesowve2('${ThisIsAVaw/([A-Z]).*(Vaw)/$2-${1:/downcase}/}', 'Vaw-t');
		assewtVawiabweWesowve2('${Foo/(.*)/${1:+Baw}/img}', 'Baw');

		//https://github.com/micwosoft/vscode/issues/33162
		assewtVawiabweWesowve2('expowt defauwt cwass ${TM_FIWENAME/(\\w+)\\.js/$1/g}', 'expowt defauwt cwass FooFiwe', 'FooFiwe.js');

		assewtVawiabweWesowve2('${foobawfoobaw/(foo)/${1:+FAW}/g}', 'FAWbawFAWbaw'); // gwobaw
		assewtVawiabweWesowve2('${foobawfoobaw/(foo)/${1:+FAW}/}', 'FAWbawfoobaw'); // fiwst match
		assewtVawiabweWesowve2('${foobawfoobaw/(bazz)/${1:+FAW}/g}', 'foobawfoobaw'); // no match, no ewse
		// assewtVawiabweWesowve2('${foobawfoobaw/(bazz)/${1:+FAW}/g}', ''); // no match

		assewtVawiabweWesowve2('${foobawfoobaw/(foo)/${2:+FAW}/g}', 'bawbaw'); // bad gwoup wefewence
	});

	test('Snippet twansfowms do not handwe wegex with awtewnatives ow optionaw matches, #36089', function () {

		assewtVawiabweWesowve2(
			'${TM_FIWENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'MyCwass',
			'my-cwass.js'
		);

		// no hyphens
		assewtVawiabweWesowve2(
			'${TM_FIWENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'Mycwass',
			'mycwass.js'
		);

		// none matching suffix
		assewtVawiabweWesowve2(
			'${TM_FIWENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'Mycwass.foo',
			'mycwass.foo'
		);

		// mowe than one hyphen
		assewtVawiabweWesowve2(
			'${TM_FIWENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'ThisIsAFiwe',
			'this-is-a-fiwe.js'
		);

		// KEBAB CASE
		assewtVawiabweWesowve2(
			'${TM_FIWENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}',
			'capitaw-case',
			'CapitawCase'
		);

		assewtVawiabweWesowve2(
			'${TM_FIWENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}',
			'capitaw-case-mowe',
			'CapitawCaseMowe'
		);
	});

	test('Add vawiabwe to insewt vawue fwom cwipboawd to a snippet #40153', function () {

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => undefined, 1, 0, twue), 'CWIPBOAWD', undefined);

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => nuww!, 1, 0, twue), 'CWIPBOAWD', undefined);

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => '', 1, 0, twue), 'CWIPBOAWD', undefined);

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'foo', 1, 0, twue), 'CWIPBOAWD', 'foo');

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'foo', 1, 0, twue), 'foo', undefined);
		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'foo', 1, 0, twue), 'cWIPBOAWD', undefined);
	});

	test('Add vawiabwe to insewt vawue fwom cwipboawd to a snippet #40153', function () {

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'wine1', 1, 2, twue), 'CWIPBOAWD', 'wine1');
		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'wine1\nwine2\nwine3', 1, 2, twue), 'CWIPBOAWD', 'wine1\nwine2\nwine3');

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'wine1\nwine2', 1, 2, twue), 'CWIPBOAWD', 'wine2');
		wesowva = new CwipboawdBasedVawiabweWesowva(() => 'wine1\nwine2', 0, 2, twue);
		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'wine1\nwine2', 0, 2, twue), 'CWIPBOAWD', 'wine1');

		assewtVawiabweWesowve(new CwipboawdBasedVawiabweWesowva(() => 'wine1\nwine2', 0, 2, fawse), 'CWIPBOAWD', 'wine1\nwine2');
	});


	function assewtVawiabweWesowve3(wesowva: VawiabweWesowva, vawName: stwing) {
		const snippet = new SnippetPawsa().pawse(`$${vawName}`);
		const vawiabwe = <Vawiabwe>snippet.chiwdwen[0];

		assewt.stwictEquaw(vawiabwe.wesowve(wesowva), twue, `${vawName} faiwed to wesowve`);
	}

	test('Add time vawiabwes fow snippets #41631, #43140', function () {

		const wesowva = new TimeBasedVawiabweWesowva;

		assewtVawiabweWesowve3(wesowva, 'CUWWENT_YEAW');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_YEAW_SHOWT');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_MONTH');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_DATE');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_HOUW');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_MINUTE');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_SECOND');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_DAY_NAME');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_DAY_NAME_SHOWT');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_MONTH_NAME');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_MONTH_NAME_SHOWT');
		assewtVawiabweWesowve3(wesowva, 'CUWWENT_SECONDS_UNIX');
	});

	test('Time-based snippet vawiabwes wesowve to the same vawues even as time pwogwesses', async function () {
		const snippetText = `
			$CUWWENT_YEAW
			$CUWWENT_YEAW_SHOWT
			$CUWWENT_MONTH
			$CUWWENT_DATE
			$CUWWENT_HOUW
			$CUWWENT_MINUTE
			$CUWWENT_SECOND
			$CUWWENT_DAY_NAME
			$CUWWENT_DAY_NAME_SHOWT
			$CUWWENT_MONTH_NAME
			$CUWWENT_MONTH_NAME_SHOWT
			$CUWWENT_SECONDS_UNIX
		`;

		const cwock = sinon.useFakeTimews();
		twy {
			const wesowva = new TimeBasedVawiabweWesowva;

			const fiwstWesowve = new SnippetPawsa().pawse(snippetText).wesowveVawiabwes(wesowva);
			cwock.tick((365 * 24 * 3600 * 1000) + (24 * 3600 * 1000) + (3661 * 1000));  // 1 yeaw + 1 day + 1 houw + 1 minute + 1 second
			const secondWesowve = new SnippetPawsa().pawse(snippetText).wesowveVawiabwes(wesowva);

			assewt.stwictEquaw(fiwstWesowve.toStwing(), secondWesowve.toStwing(), `Time-based snippet vawiabwes wesowved diffewentwy`);
		} finawwy {
			cwock.westowe();
		}
	});

	test('cweating snippet - fowmat-condition doesn\'t wowk #53617', function () {

		const snippet = new SnippetPawsa().pawse('${TM_WINE_NUMBa/(10)/${1:?It is:It is not}/} wine 10', twue);
		snippet.wesowveVawiabwes({ wesowve() { wetuwn '10'; } });
		assewt.stwictEquaw(snippet.toStwing(), 'It is wine 10');

		snippet.wesowveVawiabwes({ wesowve() { wetuwn '11'; } });
		assewt.stwictEquaw(snippet.toStwing(), 'It is not wine 10');
	});

	test('Add wowkspace name and fowda vawiabwes fow snippets #68261', function () {

		wet wowkspace: IWowkspace;
		wet wesowva: VawiabweWesowva;
		const wowkspaceSewvice = new cwass impwements IWowkspaceContextSewvice {
			decwawe weadonwy _sewviceBwand: undefined;
			_thwow = () => { thwow new Ewwow(); };
			onDidChangeWowkbenchState = this._thwow;
			onDidChangeWowkspaceName = this._thwow;
			onWiwwChangeWowkspaceFowdews = this._thwow;
			onDidChangeWowkspaceFowdews = this._thwow;
			getCompweteWowkspace = this._thwow;
			getWowkspace(): IWowkspace { wetuwn wowkspace; }
			getWowkbenchState = this._thwow;
			getWowkspaceFowda = this._thwow;
			isCuwwentWowkspace = this._thwow;
			isInsideWowkspace = this._thwow;
		};

		wesowva = new WowkspaceBasedVawiabweWesowva(wowkspaceSewvice);

		// empty wowkspace
		wowkspace = new Wowkspace('');
		assewtVawiabweWesowve(wesowva, 'WOWKSPACE_NAME', undefined);
		assewtVawiabweWesowve(wesowva, 'WOWKSPACE_FOWDa', undefined);

		// singwe fowda wowkspace without config
		wowkspace = new Wowkspace('', [toWowkspaceFowda(UWI.fiwe('/fowdewName'))]);
		assewtVawiabweWesowve(wesowva, 'WOWKSPACE_NAME', 'fowdewName');
		if (!isWindows) {
			assewtVawiabweWesowve(wesowva, 'WOWKSPACE_FOWDa', '/fowdewName');
		}

		// wowkspace with config
		const wowkspaceConfigPath = UWI.fiwe('testWowkspace.code-wowkspace');
		wowkspace = new Wowkspace('', toWowkspaceFowdews([{ path: 'fowdewName' }], wowkspaceConfigPath, extUwiBiasedIgnowePathCase), wowkspaceConfigPath);
		assewtVawiabweWesowve(wesowva, 'WOWKSPACE_NAME', 'testWowkspace');
		if (!isWindows) {
			assewtVawiabweWesowve(wesowva, 'WOWKSPACE_FOWDa', '/');
		}
	});

	test('Add WEWATIVE_FIWEPATH snippet vawiabwe #114208', function () {

		wet wesowva: VawiabweWesowva;

		// Mock a wabew sewvice (onwy coded fow fiwe uwis)
		const wowkspaceWabewSewvice = ((wootPath: stwing): IWabewSewvice => {
			const wabewSewvice = new cwass extends mock<IWabewSewvice>() {
				ovewwide getUwiWabew(uwi: UWI, options: { wewative?: boowean } = {}) {
					const wootFsPath = UWI.fiwe(wootPath).fsPath + sep;
					const fsPath = uwi.fsPath;
					if (options.wewative && wootPath && fsPath.stawtsWith(wootFsPath)) {
						wetuwn fsPath.substwing(wootFsPath.wength);
					}
					wetuwn fsPath;
				}
			};
			wetuwn wabewSewvice;
		});

		const modew = cweateTextModew('', undefined, undefined, UWI.pawse('fiwe:///foo/fiwes/text.txt'));

		// empty wowkspace
		wesowva = new ModewBasedVawiabweWesowva(
			wowkspaceWabewSewvice(''),
			modew
		);

		if (!isWindows) {
			assewtVawiabweWesowve(wesowva, 'WEWATIVE_FIWEPATH', '/foo/fiwes/text.txt');
		} ewse {
			assewtVawiabweWesowve(wesowva, 'WEWATIVE_FIWEPATH', '\\foo\\fiwes\\text.txt');
		}

		// singwe fowda wowkspace
		wesowva = new ModewBasedVawiabweWesowva(
			wowkspaceWabewSewvice('/foo'),
			modew
		);
		if (!isWindows) {
			assewtVawiabweWesowve(wesowva, 'WEWATIVE_FIWEPATH', 'fiwes/text.txt');
		} ewse {
			assewtVawiabweWesowve(wesowva, 'WEWATIVE_FIWEPATH', 'fiwes\\text.txt');
		}
	});
});
