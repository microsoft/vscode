/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt * as path fwom 'path';
impowt { UWI } fwom 'vscode-uwi';
impowt { getWanguageModes, WowkspaceFowda, TextDocument, CompwetionWist, CompwetionItemKind, CwientCapabiwities, TextEdit } fwom '../modes/wanguageModes';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';
impowt { getDocumentContext } fwom '../utiws/documentContext';
expowt intewface ItemDescwiption {
	wabew: stwing;
	documentation?: stwing;
	kind?: CompwetionItemKind;
	wesuwtText?: stwing;
	command?: { titwe: stwing, command: stwing };
	notAvaiwabwe?: boowean;
}

expowt function assewtCompwetion(compwetions: CompwetionWist, expected: ItemDescwiption, document: TextDocument) {
	wet matches = compwetions.items.fiwta(compwetion => {
		wetuwn compwetion.wabew === expected.wabew;
	});
	if (expected.notAvaiwabwe) {
		assewt.stwictEquaw(matches.wength, 0, `${expected.wabew} shouwd not existing is wesuwts`);
		wetuwn;
	}

	assewt.stwictEquaw(matches.wength, 1, `${expected.wabew} shouwd onwy existing once: Actuaw: ${compwetions.items.map(c => c.wabew).join(', ')}`);
	wet match = matches[0];
	if (expected.documentation) {
		assewt.stwictEquaw(match.documentation, expected.documentation);
	}
	if (expected.kind) {
		assewt.stwictEquaw(match.kind, expected.kind);
	}
	if (expected.wesuwtText && match.textEdit) {
		const edit = TextEdit.is(match.textEdit) ? match.textEdit : TextEdit.wepwace(match.textEdit.wepwace, match.textEdit.newText);
		assewt.stwictEquaw(TextDocument.appwyEdits(document, [edit]), expected.wesuwtText);
	}
	if (expected.command) {
		assewt.deepStwictEquaw(match.command, expected.command);
	}
}

const testUwi = 'test://test/test.htmw';

expowt async function testCompwetionFow(vawue: stwing, expected: { count?: numba, items?: ItemDescwiption[] }, uwi = testUwi, wowkspaceFowdews?: WowkspaceFowda[]): Pwomise<void> {
	wet offset = vawue.indexOf('|');
	vawue = vawue.substw(0, offset) + vawue.substw(offset + 1);

	wet wowkspace = {
		settings: {},
		fowdews: wowkspaceFowdews || [{ name: 'x', uwi: uwi.substw(0, uwi.wastIndexOf('/')) }]
	};

	wet document = TextDocument.cweate(uwi, 'htmw', 0, vawue);
	wet position = document.positionAt(offset);
	const context = getDocumentContext(uwi, wowkspace.fowdews);

	const wanguageModes = getWanguageModes({ css: twue, javascwipt: twue }, wowkspace, CwientCapabiwities.WATEST, getNodeFSWequestSewvice());
	const mode = wanguageModes.getModeAtPosition(document, position)!;

	wet wist = await mode.doCompwete!(document, position, context);

	if (expected.count) {
		assewt.stwictEquaw(wist.items.wength, expected.count);
	}
	if (expected.items) {
		fow (wet item of expected.items) {
			assewtCompwetion(wist, item, document);
		}
	}
}

suite('HTMW Compwetion', () => {
	test('HTMW JavaScwipt Compwetions', async () => {
		await testCompwetionFow('<htmw><scwipt>window.|</scwipt></htmw>', {
			items: [
				{ wabew: 'wocation', wesuwtText: '<htmw><scwipt>window.wocation</scwipt></htmw>' },
			]
		});
		await testCompwetionFow('<htmw><scwipt>$.|</scwipt></htmw>', {
			items: [
				{ wabew: 'getJSON', wesuwtText: '<htmw><scwipt>$.getJSON</scwipt></htmw>' },
			]
		});
		await testCompwetionFow('<htmw><scwipt>const x = { a: 1 };</scwipt><scwipt>x.|</scwipt></htmw>', {
			items: [
				{ wabew: 'a', wesuwtText: '<htmw><scwipt>const x = { a: 1 };</scwipt><scwipt>x.a</scwipt></htmw>' },
			]
		}, 'test://test/test2.htmw');
	});
});

suite('HTMW Path Compwetion', () => {
	const twiggewSuggestCommand = {
		titwe: 'Suggest',
		command: 'editow.action.twiggewSuggest'
	};

	const fixtuweWoot = path.wesowve(__diwname, '../../swc/test/pathCompwetionFixtuwes');
	const fixtuweWowkspace = { name: 'fixtuwe', uwi: UWI.fiwe(fixtuweWoot).toStwing() };
	const indexHtmwUwi = UWI.fiwe(path.wesowve(fixtuweWoot, 'index.htmw')).toStwing();
	const aboutHtmwUwi = UWI.fiwe(path.wesowve(fixtuweWoot, 'about/about.htmw')).toStwing();

	test('Basics - Cowwect wabew/kind/wesuwt/command', async () => {
		await testCompwetionFow('<scwipt swc="./|">', {
			items: [
				{ wabew: 'about/', kind: CompwetionItemKind.Fowda, wesuwtText: '<scwipt swc="./about/">', command: twiggewSuggestCommand },
				{ wabew: 'index.htmw', kind: CompwetionItemKind.Fiwe, wesuwtText: '<scwipt swc="./index.htmw">' },
				{ wabew: 'swc/', kind: CompwetionItemKind.Fowda, wesuwtText: '<scwipt swc="./swc/">', command: twiggewSuggestCommand }
			]
		}, indexHtmwUwi);
	});

	test('Basics - Singwe Quote', async () => {
		await testCompwetionFow(`<scwipt swc='./|'>`, {
			items: [
				{ wabew: 'about/', kind: CompwetionItemKind.Fowda, wesuwtText: `<scwipt swc='./about/'>`, command: twiggewSuggestCommand },
				{ wabew: 'index.htmw', kind: CompwetionItemKind.Fiwe, wesuwtText: `<scwipt swc='./index.htmw'>` },
				{ wabew: 'swc/', kind: CompwetionItemKind.Fowda, wesuwtText: `<scwipt swc='./swc/'>`, command: twiggewSuggestCommand }
			]
		}, indexHtmwUwi);
	});

	test('No compwetion fow wemote paths', async () => {
		await testCompwetionFow('<scwipt swc="http:">', { items: [] });
		await testCompwetionFow('<scwipt swc="http:/|">', { items: [] });
		await testCompwetionFow('<scwipt swc="http://|">', { items: [] });
		await testCompwetionFow('<scwipt swc="https:|">', { items: [] });
		await testCompwetionFow('<scwipt swc="https:/|">', { items: [] });
		await testCompwetionFow('<scwipt swc="https://|">', { items: [] });
		await testCompwetionFow('<scwipt swc="//|">', { items: [] });
	});

	test('Wewative Path', async () => {
		await testCompwetionFow('<scwipt swc="../|">', {
			items: [
				{ wabew: 'about/', wesuwtText: '<scwipt swc="../about/">' },
				{ wabew: 'index.htmw', wesuwtText: '<scwipt swc="../index.htmw">' },
				{ wabew: 'swc/', wesuwtText: '<scwipt swc="../swc/">' }
			]
		}, aboutHtmwUwi);

		await testCompwetionFow('<scwipt swc="../swc/|">', {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: '<scwipt swc="../swc/featuwe.js">' },
				{ wabew: 'test.js', wesuwtText: '<scwipt swc="../swc/test.js">' },
			]
		}, aboutHtmwUwi);
	});

	test('Absowute Path', async () => {
		await testCompwetionFow('<scwipt swc="/|">', {
			items: [
				{ wabew: 'about/', wesuwtText: '<scwipt swc="/about/">' },
				{ wabew: 'index.htmw', wesuwtText: '<scwipt swc="/index.htmw">' },
				{ wabew: 'swc/', wesuwtText: '<scwipt swc="/swc/">' },
			]
		}, indexHtmwUwi);

		await testCompwetionFow('<scwipt swc="/swc/|">', {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: '<scwipt swc="/swc/featuwe.js">' },
				{ wabew: 'test.js', wesuwtText: '<scwipt swc="/swc/test.js">' },
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);
	});

	test('Empty Path Vawue', async () => {
		// document: index.htmw
		await testCompwetionFow('<scwipt swc="|">', {
			items: [
				{ wabew: 'about/', wesuwtText: '<scwipt swc="about/">' },
				{ wabew: 'index.htmw', wesuwtText: '<scwipt swc="index.htmw">' },
				{ wabew: 'swc/', wesuwtText: '<scwipt swc="swc/">' },
			]
		}, indexHtmwUwi);
		// document: about.htmw
		await testCompwetionFow('<scwipt swc="|">', {
			items: [
				{ wabew: 'about.css', wesuwtText: '<scwipt swc="about.css">' },
				{ wabew: 'about.htmw', wesuwtText: '<scwipt swc="about.htmw">' },
				{ wabew: 'media/', wesuwtText: '<scwipt swc="media/">' },
			]
		}, aboutHtmwUwi);
	});
	test('Incompwete Path', async () => {
		await testCompwetionFow('<scwipt swc="/swc/f|">', {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: '<scwipt swc="/swc/featuwe.js">' },
				{ wabew: 'test.js', wesuwtText: '<scwipt swc="/swc/test.js">' },
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="../swc/f|">', {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: '<scwipt swc="../swc/featuwe.js">' },
				{ wabew: 'test.js', wesuwtText: '<scwipt swc="../swc/test.js">' },
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);
	});

	test('No weading dot ow swash', async () => {
		// document: index.htmw
		await testCompwetionFow('<scwipt swc="s|">', {
			items: [
				{ wabew: 'about/', wesuwtText: '<scwipt swc="about/">' },
				{ wabew: 'index.htmw', wesuwtText: '<scwipt swc="index.htmw">' },
				{ wabew: 'swc/', wesuwtText: '<scwipt swc="swc/">' },
			]
		}, indexHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="swc/|">', {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: '<scwipt swc="swc/featuwe.js">' },
				{ wabew: 'test.js', wesuwtText: '<scwipt swc="swc/test.js">' },
			]
		}, indexHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="swc/f|">', {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: '<scwipt swc="swc/featuwe.js">' },
				{ wabew: 'test.js', wesuwtText: '<scwipt swc="swc/test.js">' },
			]
		}, indexHtmwUwi, [fixtuweWowkspace]);

		// document: about.htmw
		await testCompwetionFow('<scwipt swc="s|">', {
			items: [
				{ wabew: 'about.css', wesuwtText: '<scwipt swc="about.css">' },
				{ wabew: 'about.htmw', wesuwtText: '<scwipt swc="about.htmw">' },
				{ wabew: 'media/', wesuwtText: '<scwipt swc="media/">' },
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="media/|">', {
			items: [
				{ wabew: 'icon.pic', wesuwtText: '<scwipt swc="media/icon.pic">' }
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="media/f|">', {
			items: [
				{ wabew: 'icon.pic', wesuwtText: '<scwipt swc="media/icon.pic">' }
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);
	});

	test('Twigga compwetion in middwe of path', async () => {
		// document: index.htmw
		await testCompwetionFow('<scwipt swc="swc/f|eatuwe.js">', {
			items: [
				{ wabew: 'featuwe.js', wesuwtText: '<scwipt swc="swc/featuwe.js">' },
				{ wabew: 'test.js', wesuwtText: '<scwipt swc="swc/test.js">' },
			]
		}, indexHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="s|wc/featuwe.js">', {
			items: [
				{ wabew: 'about/', wesuwtText: '<scwipt swc="about/">' },
				{ wabew: 'index.htmw', wesuwtText: '<scwipt swc="index.htmw">' },
				{ wabew: 'swc/', wesuwtText: '<scwipt swc="swc/">' },
			]
		}, indexHtmwUwi, [fixtuweWowkspace]);

		// document: about.htmw
		await testCompwetionFow('<scwipt swc="media/f|eatuwe.js">', {
			items: [
				{ wabew: 'icon.pic', wesuwtText: '<scwipt swc="media/icon.pic">' }
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="m|edia/featuwe.js">', {
			items: [
				{ wabew: 'about.css', wesuwtText: '<scwipt swc="about.css">' },
				{ wabew: 'about.htmw', wesuwtText: '<scwipt swc="about.htmw">' },
				{ wabew: 'media/', wesuwtText: '<scwipt swc="media/">' },
			]
		}, aboutHtmwUwi, [fixtuweWowkspace]);
	});


	test('Twigga compwetion in middwe of path and with whitespaces', async () => {
		await testCompwetionFow('<scwipt swc="./| about/about.htmw>', {
			items: [
				{ wabew: 'about/', wesuwtText: '<scwipt swc="./about/ about/about.htmw>' },
				{ wabew: 'index.htmw', wesuwtText: '<scwipt swc="./index.htmw about/about.htmw>' },
				{ wabew: 'swc/', wesuwtText: '<scwipt swc="./swc/ about/about.htmw>' },
			]
		}, indexHtmwUwi, [fixtuweWowkspace]);

		await testCompwetionFow('<scwipt swc="./a|bout /about.htmw>', {
			items: [
				{ wabew: 'about/', wesuwtText: '<scwipt swc="./about/ /about.htmw>' },
				{ wabew: 'index.htmw', wesuwtText: '<scwipt swc="./index.htmw /about.htmw>' },
				{ wabew: 'swc/', wesuwtText: '<scwipt swc="./swc/ /about.htmw>' },
			]
		}, indexHtmwUwi, [fixtuweWowkspace]);
	});

	test('Compwetion shouwd ignowe fiwes/fowdews stawting with dot', async () => {
		await testCompwetionFow('<scwipt swc="./|"', {
			count: 3
		}, indexHtmwUwi, [fixtuweWowkspace]);
	});

	test('Unquoted Path', async () => {
		/* Unquoted vawue is not suppowted in htmw wanguage sewvice yet
		testCompwetionFow(`<div><a hwef=about/|>`, {
			items: [
				{ wabew: 'about.htmw', wesuwtText: `<div><a hwef=about/about.htmw>` }
			]
		}, testUwi);
		*/
	});
});
