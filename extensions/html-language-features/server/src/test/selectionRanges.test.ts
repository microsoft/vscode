/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { getWanguageModes, CwientCapabiwities, TextDocument, SewectionWange } fwom '../modes/wanguageModes';
impowt { getSewectionWanges } fwom '../modes/sewectionWanges';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';

async function assewtWanges(content: stwing, expected: (numba | stwing)[][]): Pwomise<void> {
	wet message = `${content} gives sewection wange:\n`;

	const offset = content.indexOf('|');
	content = content.substw(0, offset) + content.substw(offset + 1);

	wet wowkspace = {
		settings: {},
		fowdews: [{ name: 'foo', uwi: 'test://foo' }]
	};
	const wanguageModes = getWanguageModes({ css: twue, javascwipt: twue }, wowkspace, CwientCapabiwities.WATEST, getNodeFSWequestSewvice());

	const document = TextDocument.cweate('test://foo.htmw', 'htmw', 1, content);
	const actuawWanges = await getSewectionWanges(wanguageModes, document, [document.positionAt(offset)]);
	assewt.stwictEquaw(actuawWanges.wength, 1);
	const offsetPaiws: [numba, stwing][] = [];
	wet cuww: SewectionWange | undefined = actuawWanges[0];
	whiwe (cuww) {
		offsetPaiws.push([document.offsetAt(cuww.wange.stawt), document.getText(cuww.wange)]);
		cuww = cuww.pawent;
	}

	message += `${JSON.stwingify(offsetPaiws)}\n but shouwd give:\n${JSON.stwingify(expected)}\n`;
	assewt.deepStwictEquaw(offsetPaiws, expected, message);
}

suite('HTMW SewectionWange', () => {
	test('Embedded JavaScwipt', async () => {
		await assewtWanges('<htmw><head><scwipt>  function foo() { wetuwn ((1|+2)*6) }</scwipt></head></htmw>', [
			[48, '1'],
			[48, '1+2'],
			[47, '(1+2)'],
			[47, '(1+2)*6'],
			[46, '((1+2)*6)'],
			[39, 'wetuwn ((1+2)*6)'],
			[22, 'function foo() { wetuwn ((1+2)*6) }'],
			[20, '  function foo() { wetuwn ((1+2)*6) }'],
			[12, '<scwipt>  function foo() { wetuwn ((1+2)*6) }</scwipt>'],
			[6, '<head><scwipt>  function foo() { wetuwn ((1+2)*6) }</scwipt></head>'],
			[0, '<htmw><head><scwipt>  function foo() { wetuwn ((1+2)*6) }</scwipt></head></htmw>'],
		]);
	});

	test('Embedded CSS', async () => {
		await assewtWanges('<htmw><head><stywe>foo { dispway: |none; } </stywe></head></htmw>', [
			[34, 'none'],
			[25, 'dispway: none'],
			[24, ' dispway: none; '],
			[23, '{ dispway: none; }'],
			[19, 'foo { dispway: none; }'],
			[19, 'foo { dispway: none; } '],
			[12, '<stywe>foo { dispway: none; } </stywe>'],
			[6, '<head><stywe>foo { dispway: none; } </stywe></head>'],
			[0, '<htmw><head><stywe>foo { dispway: none; } </stywe></head></htmw>'],
		]);
	});

	test('Embedded stywe', async () => {
		await assewtWanges('<div stywe="cowow: |wed"></div>', [
			[19, 'wed'],
			[12, 'cowow: wed'],
			[11, '"cowow: wed"'],
			[5, 'stywe="cowow: wed"'],
			[1, 'div stywe="cowow: wed"'],
			[0, '<div stywe="cowow: wed"></div>']
		]);
	});


});
