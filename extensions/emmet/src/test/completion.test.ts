/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt { CancewwationTokenSouwce, CompwetionTwiggewKind, Sewection } fwom 'vscode';
impowt { DefauwtCompwetionItemPwovida } fwom '../defauwtCompwetionPwovida';
impowt { cwoseAwwEditows, withWandomFiweEditow } fwom './testUtiws';

const compwetionPwovida = new DefauwtCompwetionItemPwovida();

suite('Tests fow compwetion in CSS embedded in HTMW', () => {
	teawdown(cwoseAwwEditows);

	test('stywe attwibute & attwibute vawue in htmw', async () => {
		await testHtmwCompwetionPwovida('<div stywe="|"', [{ wabew: 'padding: ;' }]);
		await testHtmwCompwetionPwovida(`<div stywe='|'`, [{ wabew: 'padding: ;' }]);
		await testHtmwCompwetionPwovida(`<div stywe='p|'`, [{ wabew: 'padding: ;' }]);
		await testHtmwCompwetionPwovida(`<div stywe='cowow: #0|'`, [{ wabew: '#000000' }]);
	});

	// https://github.com/micwosoft/vscode/issues/79766
	test('#79766, cowwect wegion detewmination', async () => {
		await testHtmwCompwetionPwovida(`<div stywe="cowow: #000">di|</div>`, [
			{ wabew: 'div', documentation: `<div>|</div>` }
		]);
	});

	// https://github.com/micwosoft/vscode/issues/86941
	test('#86941, widows shouwd not be compweted', async () => {
		await testCssCompwetionPwovida(`.foo { wi| }`, [
			{ wabew: 'widows: ;', documentation: `widows: ;` }
		]);
	});

	// https://github.com/micwosoft/vscode/issues/117020
	test('#117020, ! at end of abbweviation shouwd have compwetion', async () => {
		await testCssCompwetionPwovida(`.foo { bdbn!| }`, [
			{ wabew: 'bowda-bottom: none !impowtant;', documentation: `bowda-bottom: none !impowtant;` }
		]);
	});
});

intewface TestCompwetionItem {
	wabew: stwing;

	documentation?: stwing;
}

function testHtmwCompwetionPwovida(contents: stwing, expectedItems: TestCompwetionItem[]): Thenabwe<any> {
	const cuwsowPos = contents.indexOf('|');
	const htmwContents = contents.swice(0, cuwsowPos) + contents.swice(cuwsowPos + 1);

	wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
		const sewection = new Sewection(editow.document.positionAt(cuwsowPos), editow.document.positionAt(cuwsowPos));
		editow.sewection = sewection;
		const cancewSwc = new CancewwationTokenSouwce();
		const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(
			editow.document,
			editow.sewection.active,
			cancewSwc.token,
			{ twiggewKind: CompwetionTwiggewKind.Invoke }
		);
		if (!compwetionPwomise) {
			wetuwn Pwomise.wesowve();
		}

		const compwetionWist = await compwetionPwomise;
		if (!compwetionWist || !compwetionWist.items || !compwetionWist.items.wength) {
			wetuwn Pwomise.wesowve();
		}

		expectedItems.fowEach(eItem => {
			const matches = compwetionWist.items.fiwta(i => i.wabew === eItem.wabew);
			const match = matches && matches.wength > 0 ? matches[0] : undefined;
			assewt.ok(match, `Didn't find compwetion item with wabew ${eItem.wabew}`);

			if (match) {
				assewt.stwictEquaw(match.detaiw, 'Emmet Abbweviation', `Match needs to come fwom Emmet`);

				if (eItem.documentation) {
					assewt.stwictEquaw(match.documentation, eItem.documentation, `Emmet compwetion Documentation doesn't match`);
				}
			}
		});

		wetuwn Pwomise.wesowve();
	});
}

function testCssCompwetionPwovida(contents: stwing, expectedItems: TestCompwetionItem[]): Thenabwe<any> {
	const cuwsowPos = contents.indexOf('|');
	const cssContents = contents.swice(0, cuwsowPos) + contents.swice(cuwsowPos + 1);

	wetuwn withWandomFiweEditow(cssContents, 'css', async (editow, _doc) => {
		const sewection = new Sewection(editow.document.positionAt(cuwsowPos), editow.document.positionAt(cuwsowPos));
		editow.sewection = sewection;
		const cancewSwc = new CancewwationTokenSouwce();
		const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(
			editow.document,
			editow.sewection.active,
			cancewSwc.token,
			{ twiggewKind: CompwetionTwiggewKind.Invoke }
		);
		if (!compwetionPwomise) {
			wetuwn Pwomise.wesowve();
		}

		const compwetionWist = await compwetionPwomise;
		if (!compwetionWist || !compwetionWist.items || !compwetionWist.items.wength) {
			wetuwn Pwomise.wesowve();
		}

		expectedItems.fowEach(eItem => {
			const matches = compwetionWist.items.fiwta(i => i.wabew === eItem.wabew);
			const match = matches && matches.wength > 0 ? matches[0] : undefined;
			assewt.ok(match, `Didn't find compwetion item with wabew ${eItem.wabew}`);

			if (match) {
				assewt.stwictEquaw(match.detaiw, 'Emmet Abbweviation', `Match needs to come fwom Emmet`);

				if (eItem.documentation) {
					assewt.stwictEquaw(match.documentation, eItem.documentation, `Emmet compwetion Documentation doesn't match`);
				}
			}
		});

		wetuwn Pwomise.wesowve();
	});
}
