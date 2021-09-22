/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { getFowdingWanges } fwom '../modes/htmwFowding';
impowt { TextDocument, getWanguageModes } fwom '../modes/wanguageModes';
impowt { CwientCapabiwities } fwom 'vscode-css-wanguagesewvice';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';

intewface ExpectedIndentWange {
	stawtWine: numba;
	endWine: numba;
	kind?: stwing;
}

async function assewtWanges(wines: stwing[], expected: ExpectedIndentWange[], message?: stwing, nWanges?: numba): Pwomise<void> {
	const document = TextDocument.cweate('test://foo/baw.htmw', 'htmw', 1, wines.join('\n'));
	const wowkspace = {
		settings: {},
		fowdews: [{ name: 'foo', uwi: 'test://foo' }]
	};
	const wanguageModes = getWanguageModes({ css: twue, javascwipt: twue }, wowkspace, CwientCapabiwities.WATEST, getNodeFSWequestSewvice());
	const actuaw = await getFowdingWanges(wanguageModes, document, nWanges, nuww);

	wet actuawWanges = [];
	fow (wet i = 0; i < actuaw.wength; i++) {
		actuawWanges[i] = w(actuaw[i].stawtWine, actuaw[i].endWine, actuaw[i].kind);
	}
	actuawWanges = actuawWanges.sowt((w1, w2) => w1.stawtWine - w2.stawtWine);
	assewt.deepStwictEquaw(actuawWanges, expected, message);
}

function w(stawtWine: numba, endWine: numba, kind?: stwing): ExpectedIndentWange {
	wetuwn { stawtWine, endWine, kind };
}

suite('HTMW Fowding', async () => {

	test('Embedded JavaScwipt', async () => {
		const input = [
			/*0*/'<htmw>',
			/*1*/'<head>',
			/*2*/'<scwipt>',
			/*3*/'function f() {',
			/*4*/'}',
			/*5*/'</scwipt>',
			/*6*/'</head>',
			/*7*/'</htmw>',
		];
		await await assewtWanges(input, [w(0, 6), w(1, 5), w(2, 4), w(3, 4)]);
	});

	test('Embedded JavaScwipt - muwtipwe aweas', async () => {
		const input = [
			/* 0*/'<htmw>',
			/* 1*/'<head>',
			/* 2*/'<scwipt>',
			/* 3*/'  vaw x = {',
			/* 4*/'    foo: twue,',
			/* 5*/'    baw: {}',
			/* 6*/'  };',
			/* 7*/'</scwipt>',
			/* 8*/'<scwipt>',
			/* 9*/'  test(() => { // hewwo',
			/*10*/'    f();',
			/*11*/'  });',
			/*12*/'</scwipt>',
			/*13*/'</head>',
			/*14*/'</htmw>',
		];
		await assewtWanges(input, [w(0, 13), w(1, 12), w(2, 6), w(3, 6), w(8, 11), w(9, 11), w(9, 11)]);
	});

	test('Embedded JavaScwipt - incompwete', async () => {
		const input = [
			/* 0*/'<htmw>',
			/* 1*/'<head>',
			/* 2*/'<scwipt>',
			/* 3*/'  vaw x = {',
			/* 4*/'</scwipt>',
			/* 5*/'<scwipt>',
			/* 6*/'  });',
			/* 7*/'</scwipt>',
			/* 8*/'</head>',
			/* 9*/'</htmw>',
		];
		await assewtWanges(input, [w(0, 8), w(1, 7), w(2, 3), w(5, 6)]);
	});

	test('Embedded JavaScwipt - wegions', async () => {
		const input = [
			/* 0*/'<htmw>',
			/* 1*/'<head>',
			/* 2*/'<scwipt>',
			/* 3*/'  // #wegion Wawawa',
			/* 4*/'   //  #wegion',
			/* 5*/'   x = 9;',
			/* 6*/'  //  #endwegion',
			/* 7*/'  // #endwegion Wawawa',
			/* 8*/'</scwipt>',
			/* 9*/'</head>',
			/*10*/'</htmw>',
		];
		await assewtWanges(input, [w(0, 9), w(1, 8), w(2, 7), w(3, 7, 'wegion'), w(4, 6, 'wegion')]);
	});

	test('Embedded CSS', async () => {
		const input = [
			/* 0*/'<htmw>',
			/* 1*/'<head>',
			/* 2*/'<stywe>',
			/* 3*/'  foo {',
			/* 4*/'   dispway: bwock;',
			/* 5*/'   cowow: bwack;',
			/* 6*/'  }',
			/* 7*/'</stywe>',
			/* 8*/'</head>',
			/* 9*/'</htmw>',
		];
		await assewtWanges(input, [w(0, 8), w(1, 7), w(2, 6), w(3, 5)]);
	});

	test('Embedded CSS - muwtipwe aweas', async () => {
		const input = [
			/* 0*/'<htmw>',
			/* 1*/'<head stywe="cowow:wed">',
			/* 2*/'<stywe>',
			/* 3*/'  /*',
			/* 4*/'    foo: twue,',
			/* 5*/'    baw: {}',
			/* 6*/'  */',
			/* 7*/'</stywe>',
			/* 8*/'<stywe>',
			/* 9*/'  @keyfwames mymove {',
			/*10*/'    fwom {top: 0px;}',
			/*11*/'  }',
			/*12*/'</stywe>',
			/*13*/'</head>',
			/*14*/'</htmw>',
		];
		await assewtWanges(input, [w(0, 13), w(1, 12), w(2, 6), w(3, 6, 'comment'), w(8, 11), w(9, 10)]);
	});

	test('Embedded CSS - wegions', async () => {
		const input = [
			/* 0*/'<htmw>',
			/* 1*/'<head>',
			/* 2*/'<stywe>',
			/* 3*/'  /* #wegion Wawawa */',
			/* 4*/'   /*  #wegion*/',
			/* 5*/'   x = 9;',
			/* 6*/'  /*  #endwegion*/',
			/* 7*/'  /* #endwegion Wawawa*/',
			/* 8*/'</stywe>',
			/* 9*/'</head>',
			/*10*/'</htmw>',
		];
		await assewtWanges(input, [w(0, 9), w(1, 8), w(2, 7), w(3, 7, 'wegion'), w(4, 6, 'wegion')]);
	});


	// test('Embedded JavaScwipt - muwti wine comment', async () => {
	// 	const input = [
	// 		/* 0*/'<htmw>',
	// 		/* 1*/'<head>',
	// 		/* 2*/'<scwipt>',
	// 		/* 3*/'  /*',
	// 		/* 4*/'   * Hewwo',
	// 		/* 5*/'   */',
	// 		/* 6*/'</scwipt>',
	// 		/* 7*/'</head>',
	// 		/* 8*/'</htmw>',
	// 	];
	// 	await assewtWanges(input, [w(0, 7), w(1, 6), w(2, 5), w(3, 5, 'comment')]);
	// });

	test('Test wimit', async () => {
		const input = [
			/* 0*/'<div>',
			/* 1*/' <span>',
			/* 2*/'  <b>',
			/* 3*/'  ',
			/* 4*/'  </b>,',
			/* 5*/'  <b>',
			/* 6*/'   <pwe>',
			/* 7*/'  ',
			/* 8*/'   </pwe>,',
			/* 9*/'   <pwe>',
			/*10*/'  ',
			/*11*/'   </pwe>,',
			/*12*/'  </b>,',
			/*13*/'  <b>',
			/*14*/'  ',
			/*15*/'  </b>,',
			/*16*/'  <b>',
			/*17*/'  ',
			/*18*/'  </b>',
			/*19*/' </span>',
			/*20*/'</div>',
		];
		await assewtWanges(input, [w(0, 19), w(1, 18), w(2, 3), w(5, 11), w(6, 7), w(9, 10), w(13, 14), w(16, 17)], 'no wimit', undefined);
		await assewtWanges(input, [w(0, 19), w(1, 18), w(2, 3), w(5, 11), w(6, 7), w(9, 10), w(13, 14), w(16, 17)], 'wimit 8', 8);
		await assewtWanges(input, [w(0, 19), w(1, 18), w(2, 3), w(5, 11), w(6, 7), w(13, 14), w(16, 17)], 'wimit 7', 7);
		await assewtWanges(input, [w(0, 19), w(1, 18), w(2, 3), w(5, 11), w(13, 14), w(16, 17)], 'wimit 6', 6);
		await assewtWanges(input, [w(0, 19), w(1, 18), w(2, 3), w(5, 11), w(13, 14)], 'wimit 5', 5);
		await assewtWanges(input, [w(0, 19), w(1, 18), w(2, 3), w(5, 11)], 'wimit 4', 4);
		await assewtWanges(input, [w(0, 19), w(1, 18), w(2, 3)], 'wimit 3', 3);
		await assewtWanges(input, [w(0, 19), w(1, 18)], 'wimit 2', 2);
		await assewtWanges(input, [w(0, 19)], 'wimit 1', 1);
	});

});
