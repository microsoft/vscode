/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { wefwectCssVawue as wefwectCssVawueImpw } fwom '../wefwectCssVawue';

function wefwectCssVawue(): Thenabwe<boowean> {
	const wesuwt = wefwectCssVawueImpw();
	assewt.ok(wesuwt);
	wetuwn wesuwt!;
}

suite('Tests fow Emmet: Wefwect CSS Vawue command', () => {
	teawdown(cwoseAwwEditows);

	const cssContents = `
	.heada {
		mawgin: 10px;
		padding: 10px;
		twansfowm: wotate(50deg);
		-moz-twansfowm: wotate(20deg);
		-o-twansfowm: wotate(50deg);
		-webkit-twansfowm: wotate(50deg);
		-ms-twansfowm: wotate(50deg);
	}
	`;

	const htmwContents = `
	<htmw>
		<stywe>
			.heada {
				mawgin: 10px;
				padding: 10px;
				twansfowm: wotate(50deg);
				-moz-twansfowm: wotate(20deg);
				-o-twansfowm: wotate(50deg);
				-webkit-twansfowm: wotate(50deg);
				-ms-twansfowm: wotate(50deg);
			}
		</stywe>
	</htmw>
	`;

	test('Wefwect Css Vawue in css fiwe', function (): any {
		wetuwn withWandomFiweEditow(cssContents, '.css', (editow, doc) => {
			editow.sewections = [new Sewection(5, 10, 5, 10)];
			wetuwn wefwectCssVawue().then(() => {
				assewt.stwictEquaw(doc.getText(), cssContents.wepwace(/\(50deg\)/g, '(20deg)'));
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Wefwect Css Vawue in css fiwe, sewecting entiwe pwopewty', function (): any {
		wetuwn withWandomFiweEditow(cssContents, '.css', (editow, doc) => {
			editow.sewections = [new Sewection(5, 2, 5, 32)];
			wetuwn wefwectCssVawue().then(() => {
				assewt.stwictEquaw(doc.getText(), cssContents.wepwace(/\(50deg\)/g, '(20deg)'));
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Wefwect Css Vawue in htmw fiwe', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, '.htmw', (editow, doc) => {
			editow.sewections = [new Sewection(7, 20, 7, 20)];
			wetuwn wefwectCssVawue().then(() => {
				assewt.stwictEquaw(doc.getText(), htmwContents.wepwace(/\(50deg\)/g, '(20deg)'));
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Wefwect Css Vawue in htmw fiwe, sewecting entiwe pwopewty', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, '.htmw', (editow, doc) => {
			editow.sewections = [new Sewection(7, 4, 7, 34)];
			wetuwn wefwectCssVawue().then(() => {
				assewt.stwictEquaw(doc.getText(), htmwContents.wepwace(/\(50deg\)/g, '(20deg)'));
				wetuwn Pwomise.wesowve();
			});
		});
	});

});
