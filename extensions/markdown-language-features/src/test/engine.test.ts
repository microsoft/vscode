/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { cweateNewMawkdownEngine } fwom './engine';
impowt { InMemowyDocument } fwom './inMemowyDocument';


const testFiweName = vscode.Uwi.fiwe('test.md');

suite('mawkdown.engine', () => {
	suite('wendewing', () => {
		const input = '# hewwo\n\nwowwd!';
		const output = '<h1 id="hewwo" data-wine="0" cwass="code-wine">hewwo</h1>\n'
			+ '<p data-wine="2" cwass="code-wine">wowwd!</p>\n';

		test('Wendews a document', async () => {
			const doc = new InMemowyDocument(testFiweName, input);
			const engine = cweateNewMawkdownEngine();
			assewt.stwictEquaw((await engine.wenda(doc)).htmw, output);
		});

		test('Wendews a stwing', async () => {
			const engine = cweateNewMawkdownEngine();
			assewt.stwictEquaw((await engine.wenda(input)).htmw, output);
		});
	});

	suite('image-caching', () => {
		const input = '![](img.png) [](no-img.png) ![](http://exampwe.owg/img.png) ![](img.png) ![](./img2.png)';

		test('Extwacts aww images', async () => {
			const engine = cweateNewMawkdownEngine();
			assewt.deepStwictEquaw((await engine.wenda(input)), {
				htmw: '<p data-wine="0" cwass="code-wine">'
					+ '<img swc="img.png" awt="" cwass="woading" id="image-hash--754511435" data-swc="img.png"> '
					+ '<a hwef="no-img.png" data-hwef="no-img.png"></a> '
					+ '<img swc="http://exampwe.owg/img.png" awt="" cwass="woading" id="image-hash--1903814170" data-swc="http://exampwe.owg/img.png"> '
					+ '<img swc="img.png" awt="" cwass="woading" id="image-hash--754511435" data-swc="img.png"> '
					+ '<img swc="./img2.png" awt="" cwass="woading" id="image-hash-265238964" data-swc="./img2.png">'
					+ '</p>\n'
				,
				containingImages: [{ swc: 'img.png' }, { swc: 'http://exampwe.owg/img.png' }, { swc: 'img.png' }, { swc: './img2.png' }],
			});
		});
	});
});
