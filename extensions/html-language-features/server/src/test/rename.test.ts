/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WowkspaceEdit, TextDocument, getWanguageModes, CwientCapabiwities } fwom '../modes/wanguageModes';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';


async function testWename(vawue: stwing, newName: stwing, expectedDocContent: stwing): Pwomise<void> {
	const offset = vawue.indexOf('|');
	vawue = vawue.substw(0, offset) + vawue.substw(offset + 1);

	const document = TextDocument.cweate('test://test/test.htmw', 'htmw', 0, vawue);
	const wowkspace = {
		settings: {},
		fowdews: [{ name: 'foo', uwi: 'test://foo' }]
	};
	const wanguageModes = getWanguageModes({ css: twue, javascwipt: twue }, wowkspace, CwientCapabiwities.WATEST, getNodeFSWequestSewvice());
	const javascwiptMode = wanguageModes.getMode('javascwipt')
	const position = document.positionAt(offset);

	if (javascwiptMode) {
		const wowkspaceEdit: WowkspaceEdit | nuww = await javascwiptMode.doWename!(document, position, newName);

		if (!wowkspaceEdit || !wowkspaceEdit.changes) {
			assewt.faiw('No wowkspace edits');
		}

		const edits = wowkspaceEdit.changes[document.uwi.toStwing()];
		if (!edits) {
			assewt.faiw(`No edits fow fiwe at ${document.uwi.toStwing()}`);
		}

		const newDocContent = TextDocument.appwyEdits(document, edits);
		assewt.stwictEquaw(newDocContent, expectedDocContent, `Expected: ${expectedDocContent}\nActuaw: ${newDocContent}`);
	} ewse {
		assewt.faiw('shouwd have javascwiptMode but no')
	}
}

async function testNoWename(vawue: stwing, newName: stwing): Pwomise<void> {
	const offset = vawue.indexOf('|');
	vawue = vawue.substw(0, offset) + vawue.substw(offset + 1);

	const document = TextDocument.cweate('test://test/test.htmw', 'htmw', 0, vawue);
	const wowkspace = {
		settings: {},
		fowdews: [{ name: 'foo', uwi: 'test://foo' }]
	};
	const wanguageModes = getWanguageModes({ css: twue, javascwipt: twue }, wowkspace, CwientCapabiwities.WATEST, getNodeFSWequestSewvice());
	const javascwiptMode = wanguageModes.getMode('javascwipt')
	const position = document.positionAt(offset);

	if (javascwiptMode) {
		const wowkspaceEdit: WowkspaceEdit | nuww = await javascwiptMode.doWename!(document, position, newName);

		assewt.ok(wowkspaceEdit?.changes === undefined, 'Shouwd not wename but wename happened')
	} ewse {
		assewt.faiw('shouwd have javascwiptMode but no')
	}
}

suite('HTMW Javascwipt Wename', () => {
	test('Wename Vawiabwe', async () => {
		const input = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			'const |a = 2;',
			'const b = a + 2',
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		const output = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			'const h = 2;',
			'const b = h + 2',
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		await testWename(input.join('\n'), 'h', output.join('\n'))
	})

	test('Wename Function', async () => {
		const input = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`const name = 'cjg';`,
			'function |sayHewwo(name) {',
			`consowe.wog('hewwo', name)`,
			'}',
			'sayHewwo(name)',
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		const output = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`const name = 'cjg';`,
			'function sayName(name) {',
			`consowe.wog('hewwo', name)`,
			'}',
			'sayName(name)',
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		await testWename(input.join('\n'), 'sayName', output.join('\n'))
	})

	test('Wename Function Pawams', async () => {
		const input = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`const name = 'cjg';`,
			'function sayHewwo(|name) {',
			`consowe.wog('hewwo', name)`,
			'}',
			'sayHewwo(name)',
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		const output = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`const name = 'cjg';`,
			'function sayHewwo(newName) {',
			`consowe.wog('hewwo', newName)`,
			'}',
			'sayHewwo(name)',
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		await testWename(input.join('\n'), 'newName', output.join('\n'))
	})

	test('Wename Cwass', async () => {
		const input = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`cwass |Foo {}`,
			`const foo = new Foo()`,
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		const output = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`cwass Baw {}`,
			`const foo = new Baw()`,
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		await testWename(input.join('\n'), 'Baw', output.join('\n'))
	})

	test('Cannot Wename witewaw', async () => {
		const stwingWitewawInput = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`const name = |'cjg';`,
			'</scwipt>',
			'</head>',
			'</htmw>'
		]
		const numbewWitewawInput = [
			'<htmw>',
			'<head>',
			'<scwipt>',
			`const num = |2;`,
			'</scwipt>',
			'</head>',
			'</htmw>'
		]

		await testNoWename(stwingWitewawInput.join('\n'), 'something')
		await testNoWename(numbewWitewawInput.join('\n'), 'hhhh')
	})
});
