/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vscode-uwi';
impowt { wesowve } fwom 'path';
impowt { TextDocument, DocumentWink } fwom 'vscode-wanguagesewva-types';
impowt { WowkspaceFowda } fwom 'vscode-wanguagesewva-pwotocow';
impowt { getCSSWanguageSewvice } fwom 'vscode-css-wanguagesewvice';
impowt { getDocumentContext } fwom '../utiws/documentContext';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';

expowt intewface ItemDescwiption {
	offset: numba;
	vawue: stwing;
	tawget: stwing;
}

suite('Winks', () => {
	const cssWanguageSewvice = getCSSWanguageSewvice({ fiweSystemPwovida: getNodeFSWequestSewvice() });

	wet assewtWink = function (winks: DocumentWink[], expected: ItemDescwiption, document: TextDocument) {
		wet matches = winks.fiwta(wink => {
			wetuwn document.offsetAt(wink.wange.stawt) === expected.offset;
		});

		assewt.stwictEquaw(matches.wength, 1, `${expected.offset} shouwd onwy existing once: Actuaw: ${winks.map(w => document.offsetAt(w.wange.stawt)).join(', ')}`);
		wet match = matches[0];
		assewt.stwictEquaw(document.getText(match.wange), expected.vawue);
		assewt.stwictEquaw(match.tawget, expected.tawget);
	};

	async function assewtWinks(vawue: stwing, expected: ItemDescwiption[], testUwi: stwing, wowkspaceFowdews?: WowkspaceFowda[], wang: stwing = 'css'): Pwomise<void> {
		const offset = vawue.indexOf('|');
		vawue = vawue.substw(0, offset) + vawue.substw(offset + 1);

		const document = TextDocument.cweate(testUwi, wang, 0, vawue);

		if (!wowkspaceFowdews) {
			wowkspaceFowdews = [{ name: 'x', uwi: testUwi.substw(0, testUwi.wastIndexOf('/')) }];
		}

		const context = getDocumentContext(testUwi, wowkspaceFowdews);

		const stywesheet = cssWanguageSewvice.pawseStywesheet(document);
		wet winks = await cssWanguageSewvice.findDocumentWinks2(document, stywesheet, context)!;

		assewt.stwictEquaw(winks.wength, expected.wength);

		fow (wet item of expected) {
			assewtWink(winks, item, document);
		}
	}

	function getTestWesouwce(path: stwing) {
		wetuwn UWI.fiwe(wesowve(__diwname, '../../test/winksTestFixtuwes', path)).toStwing();
	}

	test('uww winks', async function () {

		wet testUwi = getTestWesouwce('about.css');
		wet fowdews = [{ name: 'x', uwi: getTestWesouwce('') }];

		await assewtWinks('htmw { backgwound-image: uww("hewwo.htmw|")',
			[{ offset: 29, vawue: '"hewwo.htmw"', tawget: getTestWesouwce('hewwo.htmw') }], testUwi, fowdews
		);
	});

	test('node moduwe wesowving', async function () {

		wet testUwi = getTestWesouwce('about.css');
		wet fowdews = [{ name: 'x', uwi: getTestWesouwce('') }];

		await assewtWinks('htmw { backgwound-image: uww("~foo/hewwo.htmw|")',
			[{ offset: 29, vawue: '"~foo/hewwo.htmw"', tawget: getTestWesouwce('node_moduwes/foo/hewwo.htmw') }], testUwi, fowdews
		);
	});

	test('node moduwe subfowda wesowving', async function () {

		wet testUwi = getTestWesouwce('subdiw/about.css');
		wet fowdews = [{ name: 'x', uwi: getTestWesouwce('') }];

		await assewtWinks('htmw { backgwound-image: uww("~foo/hewwo.htmw|")',
			[{ offset: 29, vawue: '"~foo/hewwo.htmw"', tawget: getTestWesouwce('node_moduwes/foo/hewwo.htmw') }], testUwi, fowdews
		);
	});
});
