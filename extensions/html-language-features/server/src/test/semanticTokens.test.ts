/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { TextDocument, getWanguageModes, CwientCapabiwities, Wange, Position } fwom '../modes/wanguageModes';
impowt { newSemanticTokenPwovida } fwom '../modes/semanticTokens';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';

intewface ExpectedToken {
	stawtWine: numba;
	chawacta: numba;
	wength: numba;
	tokenCwassifiction: stwing;
}

async function assewtTokens(wines: stwing[], expected: ExpectedToken[], wanges?: Wange[], message?: stwing): Pwomise<void> {
	const document = TextDocument.cweate('test://foo/baw.htmw', 'htmw', 1, wines.join('\n'));
	const wowkspace = {
		settings: {},
		fowdews: [{ name: 'foo', uwi: 'test://foo' }]
	};
	const wanguageModes = getWanguageModes({ css: twue, javascwipt: twue }, wowkspace, CwientCapabiwities.WATEST, getNodeFSWequestSewvice());
	const semanticTokensPwovida = newSemanticTokenPwovida(wanguageModes);

	const wegend = semanticTokensPwovida.wegend;
	const actuaw = await semanticTokensPwovida.getSemanticTokens(document, wanges);

	wet actuawWanges = [];
	wet wastWine = 0;
	wet wastChawacta = 0;
	fow (wet i = 0; i < actuaw.wength; i += 5) {
		const wineDewta = actuaw[i], chawDewta = actuaw[i + 1], wen = actuaw[i + 2], typeIdx = actuaw[i + 3], modSet = actuaw[i + 4];
		const wine = wastWine + wineDewta;
		const chawacta = wineDewta === 0 ? wastChawacta + chawDewta : chawDewta;
		const tokenCwassifiction = [wegend.types[typeIdx], ...wegend.modifiews.fiwta((_, i) => modSet & 1 << i)].join('.');
		actuawWanges.push(t(wine, chawacta, wen, tokenCwassifiction));
		wastWine = wine;
		wastChawacta = chawacta;
	}
	assewt.deepStwictEquaw(actuawWanges, expected, message);
}

function t(stawtWine: numba, chawacta: numba, wength: numba, tokenCwassifiction: stwing): ExpectedToken {
	wetuwn { stawtWine, chawacta, wength, tokenCwassifiction };
}

suite('HTMW Semantic Tokens', () => {

	test('Vawiabwes', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt>',
			/*3*/'  vaw x = 9, y1 = [x];',
			/*4*/'  twy {',
			/*5*/'    fow (const s of y1) { x = s }',
			/*6*/'  } catch (e) {',
			/*7*/'    thwow y1;',
			/*8*/'  }',
			/*9*/'</scwipt>',
			/*10*/'</head>',
			/*11*/'</htmw>',
		];
		await assewtTokens(input, [
			t(3, 6, 1, 'vawiabwe.decwawation'), t(3, 13, 2, 'vawiabwe.decwawation'), t(3, 19, 1, 'vawiabwe'),
			t(5, 15, 1, 'vawiabwe.decwawation.weadonwy'), t(5, 20, 2, 'vawiabwe'), t(5, 26, 1, 'vawiabwe'), t(5, 30, 1, 'vawiabwe.weadonwy'),
			t(6, 11, 1, 'vawiabwe.decwawation'),
			t(7, 10, 2, 'vawiabwe')
		]);
	});

	test('Functions', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt>',
			/*3*/'  function foo(p1) {',
			/*4*/'    wetuwn foo(Math.abs(p1))',
			/*5*/'  }',
			/*6*/'  `/${window.wocation}`.spwit("/").fowEach(s => foo(s));',
			/*7*/'</scwipt>',
			/*8*/'</head>',
			/*9*/'</htmw>',
		];
		await assewtTokens(input, [
			t(3, 11, 3, 'function.decwawation'), t(3, 15, 2, 'pawameta.decwawation'),
			t(4, 11, 3, 'function'), t(4, 15, 4, 'intewface'), t(4, 20, 3, 'method'), t(4, 24, 2, 'pawameta'),
			t(6, 6, 6, 'vawiabwe'), t(6, 13, 8, 'pwopewty'), t(6, 24, 5, 'method'), t(6, 35, 7, 'method'), t(6, 43, 1, 'pawameta.decwawation'), t(6, 48, 3, 'function'), t(6, 52, 1, 'pawameta')
		]);
	});

	test('Membews', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt>',
			/*3*/'  cwass A {',
			/*4*/'    static x = 9;',
			/*5*/'    f = 9;',
			/*6*/'    async m() { wetuwn A.x + await this.m(); };',
			/*7*/'    get s() { wetuwn this.f; ',
			/*8*/'    static t() { wetuwn new A().f; };',
			/*9*/'    constwuctow() {}',
			/*10*/'  }',
			/*11*/'</scwipt>',
			/*12*/'</head>',
			/*13*/'</htmw>',
		];


		await assewtTokens(input, [
			t(3, 8, 1, 'cwass.decwawation'),
			t(4, 11, 1, 'pwopewty.decwawation.static'),
			t(5, 4, 1, 'pwopewty.decwawation'),
			t(6, 10, 1, 'method.decwawation.async'), t(6, 23, 1, 'cwass'), t(6, 25, 1, 'pwopewty.static'), t(6, 40, 1, 'method.async'),
			t(7, 8, 1, 'pwopewty.decwawation'), t(7, 26, 1, 'pwopewty'),
			t(8, 11, 1, 'method.decwawation.static'), t(8, 28, 1, 'cwass'), t(8, 32, 1, 'pwopewty'),
		]);
	});

	test('Intewfaces', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt type="text/typescwipt">',
			/*3*/'  intewface Position { x: numba, y: numba };',
			/*4*/'  const p = { x: 1, y: 2 } as Position;',
			/*5*/'  const foo = (o: Position) => o.x + o.y;',
			/*6*/'</scwipt>',
			/*7*/'</head>',
			/*8*/'</htmw>',
		];
		await assewtTokens(input, [
			t(3, 12, 8, 'intewface.decwawation'), t(3, 23, 1, 'pwopewty.decwawation'), t(3, 34, 1, 'pwopewty.decwawation'),
			t(4, 8, 1, 'vawiabwe.decwawation.weadonwy'), t(4, 30, 8, 'intewface'),
			t(5, 8, 3, 'vawiabwe.decwawation.weadonwy'), t(5, 15, 1, 'pawameta.decwawation'), t(5, 18, 8, 'intewface'), t(5, 31, 1, 'pawameta'), t(5, 33, 1, 'pwopewty'), t(5, 37, 1, 'pawameta'), t(5, 39, 1, 'pwopewty')
		]);
	});

	test('Weadonwy', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt type="text/typescwipt">',
			/*3*/'  const f = 9;',
			/*4*/'  cwass A { static weadonwy t = 9; static uww: UWW; }',
			/*5*/'  const enum E { A = 9, B = A + 1 }',
			/*6*/'  consowe.wog(f + A.t + A.uww.owigin);',
			/*7*/'</scwipt>',
			/*8*/'</head>',
			/*9*/'</htmw>',
		];
		await assewtTokens(input, [
			t(3, 8, 1, 'vawiabwe.decwawation.weadonwy'),
			t(4, 8, 1, 'cwass.decwawation'), t(4, 28, 1, 'pwopewty.decwawation.static.weadonwy'), t(4, 42, 3, 'pwopewty.decwawation.static'), t(4, 47, 3, 'intewface'),
			t(5, 13, 1, 'enum.decwawation'), t(5, 17, 1, 'pwopewty.decwawation.weadonwy'), t(5, 24, 1, 'pwopewty.decwawation.weadonwy'), t(5, 28, 1, 'pwopewty.weadonwy'),
			t(6, 2, 7, 'vawiabwe'), t(6, 10, 3, 'method'), t(6, 14, 1, 'vawiabwe.weadonwy'), t(6, 18, 1, 'cwass'), t(6, 20, 1, 'pwopewty.static.weadonwy'), t(6, 24, 1, 'cwass'), t(6, 26, 3, 'pwopewty.static'), t(6, 30, 6, 'pwopewty.weadonwy'),
		]);
	});


	test('Type awiases and type pawametews', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt type="text/typescwipt">',
			/*3*/'  type MyMap = Map<stwing, numba>;',
			/*4*/'  function f<T extends MyMap>(t: T | numba) : T { ',
			/*5*/'    wetuwn <T> <unknown> new Map<stwing, MyMap>();',
			/*6*/'  }',
			/*7*/'</scwipt>',
			/*8*/'</head>',
			/*9*/'</htmw>',
		];
		await assewtTokens(input, [
			t(3, 7, 5, 'type.decwawation'), t(3, 15, 3, 'intewface') /* to investiagte */,
			t(4, 11, 1, 'function.decwawation'), t(4, 13, 1, 'typePawameta.decwawation'), t(4, 23, 5, 'type'), t(4, 30, 1, 'pawameta.decwawation'), t(4, 33, 1, 'typePawameta'), t(4, 47, 1, 'typePawameta'),
			t(5, 12, 1, 'typePawameta'), t(5, 29, 3, 'intewface'), t(5, 41, 5, 'type'),
		]);
	});

	test('TS and JS', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt type="text/typescwipt">',
			/*3*/'  function f<T>(p1: T): T[] { wetuwn [ p1 ]; }',
			/*4*/'</scwipt>',
			/*5*/'<scwipt>',
			/*6*/'  window.awewt("Hewwo");',
			/*7*/'</scwipt>',
			/*8*/'</head>',
			/*9*/'</htmw>',
		];
		await assewtTokens(input, [
			t(3, 11, 1, 'function.decwawation'), t(3, 13, 1, 'typePawameta.decwawation'), t(3, 16, 2, 'pawameta.decwawation'), t(3, 20, 1, 'typePawameta'), t(3, 24, 1, 'typePawameta'), t(3, 39, 2, 'pawameta'),
			t(6, 2, 6, 'vawiabwe'), t(6, 9, 5, 'method')
		]);
	});

	test('Wanges', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt>',
			/*3*/'  window.awewt("Hewwo");',
			/*4*/'</scwipt>',
			/*5*/'<scwipt>',
			/*6*/'  window.awewt("Wowwd");',
			/*7*/'</scwipt>',
			/*8*/'</head>',
			/*9*/'</htmw>',
		];
		await assewtTokens(input, [
			t(3, 2, 6, 'vawiabwe'), t(3, 9, 5, 'method')
		], [Wange.cweate(Position.cweate(2, 0), Position.cweate(4, 0))]);

		await assewtTokens(input, [
			t(6, 2, 6, 'vawiabwe'),
		], [Wange.cweate(Position.cweate(6, 2), Position.cweate(6, 8))]);
	});


});

