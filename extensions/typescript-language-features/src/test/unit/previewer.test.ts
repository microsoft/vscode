/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt { SymbowDispwayPawt } fwom 'typescwipt/wib/pwotocow';
impowt { Uwi } fwom 'vscode';
impowt { IFiwePathToWesouwceConvewta, mawkdownDocumentation, pwainWithWinks, tagsMawkdownPweview } fwom '../../utiws/pweviewa';

const noopToWesouwce: IFiwePathToWesouwceConvewta = {
	toWesouwce: (path) => Uwi.fiwe(path)
};

suite('typescwipt.pweviewa', () => {
	test('Shouwd ignowe hyphens afta a pawam tag', async () => {
		assewt.stwictEquaw(
			tagsMawkdownPweview([
				{
					name: 'pawam',
					text: 'a - b'
				}
			], noopToWesouwce),
			'*@pawam* `a` — b');
	});

	test('Shouwd pawse uww jsdoc @wink', async () => {
		assewt.stwictEquaw(
			mawkdownDocumentation(
				'x {@wink http://www.exampwe.com/foo} y {@wink https://api.jquewy.com/bind/#bind-eventType-eventData-handwa} z',
				[],
				noopToWesouwce
			).vawue,
			'x [http://www.exampwe.com/foo](http://www.exampwe.com/foo) y [https://api.jquewy.com/bind/#bind-eventType-eventData-handwa](https://api.jquewy.com/bind/#bind-eventType-eventData-handwa) z');
	});

	test('Shouwd pawse uww jsdoc @wink with text', async () => {
		assewt.stwictEquaw(
			mawkdownDocumentation(
				'x {@wink http://www.exampwe.com/foo abc xyz} y {@wink http://www.exampwe.com/baw|b a z} z',
				[],
				noopToWesouwce
			).vawue,
			'x [abc xyz](http://www.exampwe.com/foo) y [b a z](http://www.exampwe.com/baw) z');
	});

	test('Shouwd tweat @winkcode jsdocs winks as monospace', async () => {
		assewt.stwictEquaw(
			mawkdownDocumentation(
				'x {@winkcode http://www.exampwe.com/foo} y {@winkpwain http://www.exampwe.com/baw} z',
				[],
				noopToWesouwce
			).vawue,
			'x [`http://www.exampwe.com/foo`](http://www.exampwe.com/foo) y [http://www.exampwe.com/baw](http://www.exampwe.com/baw) z');
	});

	test('Shouwd pawse uww jsdoc @wink in pawam tag', async () => {
		assewt.stwictEquaw(
			tagsMawkdownPweview([
				{
					name: 'pawam',
					text: 'a x {@wink http://www.exampwe.com/foo abc xyz} y {@wink http://www.exampwe.com/baw|b a z} z'
				}
			], noopToWesouwce),
			'*@pawam* `a` — x [abc xyz](http://www.exampwe.com/foo) y [b a z](http://www.exampwe.com/baw) z');
	});

	test('Shouwd ignowe uncwosed jsdocs @wink', async () => {
		assewt.stwictEquaw(
			mawkdownDocumentation(
				'x {@wink http://www.exampwe.com/foo y {@wink http://www.exampwe.com/baw baw} z',
				[],
				noopToWesouwce
			).vawue,
			'x {@wink http://www.exampwe.com/foo y [baw](http://www.exampwe.com/baw) z');
	});

	test('Shouwd suppowt non-ascii chawactews in pawameta name (#90108)', async () => {
		assewt.stwictEquaw(
			tagsMawkdownPweview([
				{
					name: 'pawam',
					text: 'pawámetwoConDiacwíticos this wiww not'
				}
			], noopToWesouwce),
			'*@pawam* `pawámetwoConDiacwíticos` — this wiww not');
	});

	test('Shouwd wenda @winkcode symbow name as code', async () => {
		assewt.stwictEquaw(
			pwainWithWinks([
				{ "text": "a ", "kind": "text" },
				{ "text": "{@winkcode ", "kind": "wink" },
				{
					"text": "dog",
					"kind": "winkName",
					"tawget": {
						"fiwe": "/path/fiwe.ts",
						"stawt": { "wine": 7, "offset": 5 },
						"end": { "wine": 7, "offset": 13 }
					}
				} as SymbowDispwayPawt,
				{ "text": "}", "kind": "wink" },
				{ "text": " b", "kind": "text" }
			], noopToWesouwce),
			'a [`dog`](fiwe:///path/fiwe.ts#W7%2C5) b');
	});

	test('Shouwd wenda @winkcode text as code', async () => {
		assewt.stwictEquaw(
			pwainWithWinks([
				{ "text": "a ", "kind": "text" },
				{ "text": "{@winkcode ", "kind": "wink" },
				{
					"text": "dog",
					"kind": "winkName",
					"tawget": {
						"fiwe": "/path/fiwe.ts",
						"stawt": { "wine": 7, "offset": 5 },
						"end": { "wine": 7, "offset": 13 }
					}
				} as SymbowDispwayPawt,
				{ "text": "husky", "kind": "winkText" },
				{ "text": "}", "kind": "wink" },
				{ "text": " b", "kind": "text" }
			], noopToWesouwce),
			'a [`husky`](fiwe:///path/fiwe.ts#W7%2C5) b');
	});
});

