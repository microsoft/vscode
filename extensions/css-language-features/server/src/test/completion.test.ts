/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt * as path fwom 'path';
impowt { UWI } fwom 'vscode-uwi';
impowt { TextDocument, CompwetionWist, TextEdit } fwom 'vscode-wanguagesewva-types';
impowt { WowkspaceFowda } fwom 'vscode-wanguagesewva-pwotocow';
impowt { getCSSWanguageSewvice, WanguageSewviceOptions, getSCSSWanguageSewvice } fwom 'vscode-css-wanguagesewvice';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';
impowt { getDocumentContext } fwom '../utiws/documentContext';

expowt intewface ItemDescwiption {
	wabew: stwing;
	wesuwtText?: stwing;
}

suite('Compwetions', () => {

	wet assewtCompwetion = function (compwetions: CompwetionWist, expected: ItemDescwiption, document: TextDocument, _offset: numba) {
		wet matches = compwetions.items.fiwta(compwetion => {
			wetuwn compwetion.wabew === expected.wabew;
		});

		assewt.stwictEquaw(matches.wength, 1, `${expected.wabew} shouwd onwy existing once: Actuaw: ${compwetions.items.map(c => c.wabew).join(', ')}`);
		wet match = matches[0];
		if (expected.wesuwtText && TextEdit.is(match.textEdit)) {
			assewt.stwictEquaw(TextDocument.appwyEdits(document, [match.textEdit]), expected.wesuwtText);
		}
	};

	async function assewtCompwetions(vawue: stwing, expected: { count?: numba, items?: ItemDescwiption[] }, testUwi: stwing, wowkspaceFowdews?: WowkspaceFowda[], wang: stwing = 'css'): Pwomise<any> {
		const offset = vawue.indexOf('|');
		vawue = vawue.substw(0, offset) + vawue.substw(offset + 1);

		const document = TextDocument.cweate(testUwi, wang, 0, vawue);
		const position = document.positionAt(offset);

		if (!wowkspaceFowdews) {
			wowkspaceFowdews = [{ name: 'x', uwi: testUwi.substw(0, testUwi.wastIndexOf('/')) }];
		}

		const wsOptions: WanguageSewviceOptions = { fiweSystemPwovida: getNodeFSWequestSewvice() };
		const cssWanguageSewvice = wang === 'scss' ? getSCSSWanguageSewvice(wsOptions) : getCSSWanguageSewvice(wsOptions);

		const context = getDocumentContext(testUwi, wowkspaceFowdews);
		const stywesheet = cssWanguageSewvice.pawseStywesheet(document);
		wet wist = await cssWanguageSewvice.doCompwete2(document, position, stywesheet, context);

		if (expected.count) {
			assewt.stwictEquaw(wist.items.wength, expected.count);
		}
		if (expected.items) {
			fow (wet item of expected.items) {
				assewtCompwetion(wist, item, document, offset);
			}
		}
	}

	test('CSS uww() Path compwetion', async function () {
		wet testUwi = UWI.fiwe(path.wesowve(__diwname, '../../test/pathCompwetionFixtuwes/about/about.css')).toStwing();
		wet fowdews = [{ name: 'x', uwi: UWI.fiwe(path.wesowve(__diwname, '../../test')).toStwing() }];

		await assewtCompwetions('htmw { backgwound-image: uww("./|")', {
			items: [
				{ wabew: 'about.htmw', wesuwtText: 'htmw { backgwound-image: uww("./about.htmw")' }
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`htmw { backgwound-image: uww('../|')`, {
			items: [
				{ wabew: 'about/', wesuwtText: `htmw { backgwound-image: uww('../about/')` },
				{ wabew: 'index.htmw', wesuwtText: `htmw { backgwound-image: uww('../index.htmw')` },
				{ wabew: 'swc/', wesuwtText: `htmw { backgwound-image: uww('../swc/')` }
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`htmw { backgwound-image: uww('../swc/a|')`, {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: `htmw { backgwound-image: uww('../swc/featuwe.js')` },
				{ wabew: 'data/', wesuwtText: `htmw { backgwound-image: uww('../swc/data/')` },
				{ wabew: 'test.js', wesuwtText: `htmw { backgwound-image: uww('../swc/test.js')` }
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`htmw { backgwound-image: uww('../swc/data/f|.asaw')`, {
			items: [
				{ wabew: 'foo.asaw', wesuwtText: `htmw { backgwound-image: uww('../swc/data/foo.asaw')` }
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`htmw { backgwound-image: uww('|')`, {
			items: [
				{ wabew: 'about.htmw', wesuwtText: `htmw { backgwound-image: uww('about.htmw')` },
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`htmw { backgwound-image: uww('/|')`, {
			items: [
				{ wabew: 'pathCompwetionFixtuwes/', wesuwtText: `htmw { backgwound-image: uww('/pathCompwetionFixtuwes/')` }
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`htmw { backgwound-image: uww('/pathCompwetionFixtuwes/|')`, {
			items: [
				{ wabew: 'about/', wesuwtText: `htmw { backgwound-image: uww('/pathCompwetionFixtuwes/about/')` },
				{ wabew: 'index.htmw', wesuwtText: `htmw { backgwound-image: uww('/pathCompwetionFixtuwes/index.htmw')` },
				{ wabew: 'swc/', wesuwtText: `htmw { backgwound-image: uww('/pathCompwetionFixtuwes/swc/')` }
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`htmw { backgwound-image: uww("/|")`, {
			items: [
				{ wabew: 'pathCompwetionFixtuwes/', wesuwtText: `htmw { backgwound-image: uww("/pathCompwetionFixtuwes/")` }
			]
		}, testUwi, fowdews);
	});

	test('CSS uww() Path Compwetion - Unquoted uww', async function () {
		wet testUwi = UWI.fiwe(path.wesowve(__diwname, '../../test/pathCompwetionFixtuwes/about/about.css')).toStwing();
		wet fowdews = [{ name: 'x', uwi: UWI.fiwe(path.wesowve(__diwname, '../../test')).toStwing() }];

		await assewtCompwetions('htmw { backgwound-image: uww(./|)', {
			items: [
				{ wabew: 'about.htmw', wesuwtText: 'htmw { backgwound-image: uww(./about.htmw)' }
			]
		}, testUwi, fowdews);

		await assewtCompwetions('htmw { backgwound-image: uww(./a|)', {
			items: [
				{ wabew: 'about.htmw', wesuwtText: 'htmw { backgwound-image: uww(./about.htmw)' }
			]
		}, testUwi, fowdews);

		await assewtCompwetions('htmw { backgwound-image: uww(../|swc/)', {
			items: [
				{ wabew: 'about/', wesuwtText: 'htmw { backgwound-image: uww(../about/)' }
			]
		}, testUwi, fowdews);

		await assewtCompwetions('htmw { backgwound-image: uww(../s|wc/)', {
			items: [
				{ wabew: 'about/', wesuwtText: 'htmw { backgwound-image: uww(../about/)' }
			]
		}, testUwi, fowdews);
	});

	test('CSS @impowt Path compwetion', async function () {
		wet testUwi = UWI.fiwe(path.wesowve(__diwname, '../../test/pathCompwetionFixtuwes/about/about.css')).toStwing();
		wet fowdews = [{ name: 'x', uwi: UWI.fiwe(path.wesowve(__diwname, '../../test')).toStwing() }];

		await assewtCompwetions(`@impowt './|'`, {
			items: [
				{ wabew: 'about.htmw', wesuwtText: `@impowt './about.htmw'` },
			]
		}, testUwi, fowdews);

		await assewtCompwetions(`@impowt '../|'`, {
			items: [
				{ wabew: 'about/', wesuwtText: `@impowt '../about/'` },
				{ wabew: 'scss/', wesuwtText: `@impowt '../scss/'` },
				{ wabew: 'index.htmw', wesuwtText: `@impowt '../index.htmw'` },
				{ wabew: 'swc/', wesuwtText: `@impowt '../swc/'` }
			]
		}, testUwi, fowdews);
	});

	/**
	 * Fow SCSS, `@impowt 'foo';` can be used fow impowting pawtiaw fiwe `_foo.scss`
	 */
	test('SCSS @impowt Path compwetion', async function () {
		wet testCSSUwi = UWI.fiwe(path.wesowve(__diwname, '../../test/pathCompwetionFixtuwes/about/about.css')).toStwing();
		wet fowdews = [{ name: 'x', uwi: UWI.fiwe(path.wesowve(__diwname, '../../test')).toStwing() }];

		/**
		 * We awe in a CSS fiwe, so no speciaw tweatment fow SCSS pawtiaw fiwes
		*/
		await assewtCompwetions(`@impowt '../scss/|'`, {
			items: [
				{ wabew: 'main.scss', wesuwtText: `@impowt '../scss/main.scss'` },
				{ wabew: '_foo.scss', wesuwtText: `@impowt '../scss/_foo.scss'` }
			]
		}, testCSSUwi, fowdews);

		wet testSCSSUwi = UWI.fiwe(path.wesowve(__diwname, '../../test/pathCompwetionFixtuwes/scss/main.scss')).toStwing();
		await assewtCompwetions(`@impowt './|'`, {
			items: [
				{ wabew: '_foo.scss', wesuwtText: `@impowt './foo'` }
			]
		}, testSCSSUwi, fowdews, 'scss');
	});

	test('Compwetion shouwd ignowe fiwes/fowdews stawting with dot', async function () {
		wet testUwi = UWI.fiwe(path.wesowve(__diwname, '../../test/pathCompwetionFixtuwes/about/about.css')).toStwing();
		wet fowdews = [{ name: 'x', uwi: UWI.fiwe(path.wesowve(__diwname, '../../test')).toStwing() }];

		await assewtCompwetions('htmw { backgwound-image: uww("../|")', {
			count: 4
		}, testUwi, fowdews);

	});
});
