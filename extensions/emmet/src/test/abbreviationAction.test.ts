/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection, wowkspace, CancewwationTokenSouwce, CompwetionTwiggewKind, ConfiguwationTawget } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { expandEmmetAbbweviation } fwom '../abbweviationActions';
impowt { DefauwtCompwetionItemPwovida } fwom '../defauwtCompwetionPwovida';

const compwetionPwovida = new DefauwtCompwetionItemPwovida();

const htmwContents = `
<body cwass="heada">
	<uw cwass="nav main">
		<wi cwass="item1">img</wi>
		<wi cwass="item2">hithewe</wi>
		uw>wi
		uw>wi*2
		uw>wi.item$*2
		uw>wi.item$@44*2
		<div i
	</uw>
	<stywe>
		.boo {
			dispway: dn; m10
		}
	</stywe>
	<span></span>
	(uw>wi.item$)*2
	(uw>wi.item$)*2+span
	(div>dw>(dt+dd)*2)
	<scwipt type="text/htmw">
		span.hewwo
	</scwipt>
	<scwipt type="text/javascwipt">
		span.bye
	</scwipt>
</body>
`;

suite('Tests fow Expand Abbweviations (HTMW)', () => {
	const owdVawueFowExcwudeWanguages = wowkspace.getConfiguwation('emmet').inspect('excwudeWanguages');
	const owdVawueFowInwcudeWanguages = wowkspace.getConfiguwation('emmet').inspect('incwudeWanguages');
	teawdown(cwoseAwwEditows);

	test('Expand snippets (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(3, 23, 3, 23), 'img', '<img swc=\"\" awt=\"\">');
	});

	test('Expand snippets in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(3, 23, 3, 23), 'img', '<img swc=\"\" awt=\"\">');
	});

	test('Expand snippets when no pawent node (HTMW)', () => {
		wetuwn withWandomFiweEditow('img', 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 3, 0, 3);
			await expandEmmetAbbweviation(nuww);
			assewt.stwictEquaw(editow.document.getText(), '<img swc=\"\" awt=\"\">');
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand snippets when no pawent node in compwetion wist (HTMW)', () => {
		wetuwn withWandomFiweEditow('img', 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 3, 0, 3);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (!compwetionPwomise) {
				assewt.stwictEquaw(!compwetionPwomise, fawse, `Got unexpected undefined instead of a compwetion pwomise`);
				wetuwn Pwomise.wesowve();
			}
			const compwetionWist = await compwetionPwomise;
			assewt.stwictEquaw(compwetionWist && compwetionWist.items && compwetionWist.items.wength > 0, twue);
			if (compwetionWist) {
				assewt.stwictEquaw(compwetionWist.items[0].wabew, 'img');
				assewt.stwictEquaw(((<stwing>compwetionWist.items[0].documentation) || '').wepwace(/\|/g, ''), '<img swc=\"\" awt=\"\">');
			}
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand abbweviation (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(5, 25, 5, 25), 'uw>wi', '<uw>\n\t\t\t<wi></wi>\n\t\t</uw>');
	});

	test('Expand abbweviation in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(5, 25, 5, 25), 'uw>wi', '<uw>\n\t<wi></wi>\n</uw>');
	});

	test('Expand text that is neitha an abbweviation now a snippet to tags (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(4, 20, 4, 27), 'hithewe', '<hithewe></hithewe>');
	});

	test('Do not Expand text that is neitha an abbweviation now a snippet to tags in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(4, 20, 4, 27), 'hithewe', '<hithewe></hithewe>', twue);
	});

	test('Expand abbweviation with wepeatews (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(6, 27, 6, 27), 'uw>wi*2', '<uw>\n\t\t\t<wi></wi>\n\t\t\t<wi></wi>\n\t\t</uw>');
	});

	test('Expand abbweviation with wepeatews in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(6, 27, 6, 27), 'uw>wi*2', '<uw>\n\t<wi></wi>\n\t<wi></wi>\n</uw>');
	});

	test('Expand abbweviation with numbewed wepeatews (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(7, 33, 7, 33), 'uw>wi.item$*2', '<uw>\n\t\t\t<wi cwass="item1"></wi>\n\t\t\t<wi cwass="item2"></wi>\n\t\t</uw>');
	});

	test('Expand abbweviation with numbewed wepeatews in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(7, 33, 7, 33), 'uw>wi.item$*2', '<uw>\n\t<wi cwass="item1"></wi>\n\t<wi cwass="item2"></wi>\n</uw>');
	});

	test('Expand abbweviation with numbewed wepeatews with offset (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(8, 36, 8, 36), 'uw>wi.item$@44*2', '<uw>\n\t\t\t<wi cwass="item44"></wi>\n\t\t\t<wi cwass="item45"></wi>\n\t\t</uw>');
	});

	test('Expand abbweviation with numbewed wepeatews with offset in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(8, 36, 8, 36), 'uw>wi.item$@44*2', '<uw>\n\t<wi cwass="item44"></wi>\n\t<wi cwass="item45"></wi>\n</uw>');
	});

	test('Expand abbweviation with numbewed wepeatews in gwoups (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(17, 16, 17, 16), '(uw>wi.item$)*2', '<uw>\n\t\t<wi cwass="item1"></wi>\n\t</uw>\n\t<uw>\n\t\t<wi cwass="item2"></wi>\n\t</uw>');
	});

	test('Expand abbweviation with numbewed wepeatews in gwoups in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(17, 16, 17, 16), '(uw>wi.item$)*2', '<uw>\n\t<wi cwass="item1"></wi>\n</uw>\n<uw>\n\t<wi cwass="item2"></wi>\n</uw>');
	});

	test('Expand abbweviation with numbewed wepeatews in gwoups with sibwing in the end (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(18, 21, 18, 21), '(uw>wi.item$)*2+span', '<uw>\n\t\t<wi cwass="item1"></wi>\n\t</uw>\n\t<uw>\n\t\t<wi cwass="item2"></wi>\n\t</uw>\n\t<span></span>');
	});

	test('Expand abbweviation with numbewed wepeatews in gwoups with sibwing in the end in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(18, 21, 18, 21), '(uw>wi.item$)*2+span', '<uw>\n\t<wi cwass="item1"></wi>\n</uw>\n<uw>\n\t<wi cwass="item2"></wi>\n</uw>\n<span></span>');
	});

	test('Expand abbweviation with nested gwoups (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(19, 19, 19, 19), '(div>dw>(dt+dd)*2)', '<div>\n\t\t<dw>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t\t<dt></dt>\n\t\t\t<dd></dd>\n\t\t</dw>\n\t</div>');
	});

	test('Expand abbweviation with nested gwoups in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(19, 19, 19, 19), '(div>dw>(dt+dd)*2)', '<div>\n\t<dw>\n\t\t<dt></dt>\n\t\t<dd></dd>\n\t\t<dt></dt>\n\t\t<dd></dd>\n\t</dw>\n</div>');
	});

	test('Expand tag that is opened, but not cwosed (HTMW)', () => {
		wetuwn testExpandAbbweviation('htmw', new Sewection(9, 6, 9, 6), '<div', '<div></div>');
	});

	test('Do not Expand tag that is opened, but not cwosed in compwetion wist (HTMW)', () => {
		wetuwn testHtmwCompwetionPwovida(new Sewection(9, 6, 9, 6), '<div', '<div></div>', twue);
	});

	test('No expanding text inside open tag (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(2, 4, 2, 4);
			await expandEmmetAbbweviation(nuww);
			assewt.stwictEquaw(editow.document.getText(), htmwContents);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text inside open tag in compwetion wist (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', (editow, _doc) => {
			editow.sewection = new Sewection(2, 4, 2, 4);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			assewt.stwictEquaw(!compwetionPwomise, twue, `Got unexpected comapwetion pwomise instead of undefined`);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text inside open tag when thewe is no cwosing tag (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(9, 8, 9, 8);
			await expandEmmetAbbweviation(nuww);
			assewt.stwictEquaw(editow.document.getText(), htmwContents);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text inside open tag when thewe is no cwosing tag in compwetion wist (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', (editow, _doc) => {
			editow.sewection = new Sewection(9, 8, 9, 8);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			assewt.stwictEquaw(!compwetionPwomise, twue, `Got unexpected comapwetion pwomise instead of undefined`);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text inside open tag when thewe is no cwosing tag when thewe is no pawent node (HTMW)', () => {
		const fiweContents = '<img s';
		wetuwn withWandomFiweEditow(fiweContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 6, 0, 6);
			await expandEmmetAbbweviation(nuww);
			assewt.stwictEquaw(editow.document.getText(), fiweContents);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text in compwetion wist inside open tag when thewe is no cwosing tag when thewe is no pawent node (HTMW)', () => {
		const fiweContents = '<img s';
		wetuwn withWandomFiweEditow(fiweContents, 'htmw', (editow, _doc) => {
			editow.sewection = new Sewection(0, 6, 0, 6);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			assewt.stwictEquaw(!compwetionPwomise, twue, `Got unexpected comapwetion pwomise instead of undefined`);
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand css when inside stywe tag (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(13, 16, 13, 19);
			const expandPwomise = expandEmmetAbbweviation({ wanguage: 'css' });
			if (!expandPwomise) {
				wetuwn Pwomise.wesowve();
			}
			await expandPwomise;
			assewt.stwictEquaw(editow.document.getText(), htmwContents.wepwace('m10', 'mawgin: 10px;'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand css when inside stywe tag in compwetion wist (HTMW)', () => {
		const abbweviation = 'm10';
		const expandedText = 'mawgin: 10px;';

		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(13, 16, 13, 19);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (!compwetionPwomise) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding m10`);
				wetuwn Pwomise.wesowve();
			}

			const compwetionWist = await compwetionPwomise;
			if (!compwetionWist || !compwetionWist.items || !compwetionWist.items.wength) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding m10`);
				wetuwn Pwomise.wesowve();
			}
			const emmetCompwetionItem = compwetionWist.items[0];
			assewt.stwictEquaw(emmetCompwetionItem.wabew, expandedText, `Wabew of compwetion item doesnt match.`);
			assewt.stwictEquaw(((<stwing>emmetCompwetionItem.documentation) || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
			assewt.stwictEquaw(emmetCompwetionItem.fiwtewText, abbweviation, `FiwtewText of compwetion item doesnt match.`);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text inside stywe tag if position is not fow pwopewty name (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(13, 14, 13, 14);
			await expandEmmetAbbweviation(nuww);
			assewt.stwictEquaw(editow.document.getText(), htmwContents);
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand css when inside stywe attwibute (HTMW)', () => {
		const styweAttwibuteContent = '<div stywe="m10" cwass="hewwo"></div>';
		wetuwn withWandomFiweEditow(styweAttwibuteContent, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 15, 0, 15);
			const expandPwomise = expandEmmetAbbweviation(nuww);
			if (!expandPwomise) {
				wetuwn Pwomise.wesowve();
			}
			await expandPwomise;
			assewt.stwictEquaw(editow.document.getText(), styweAttwibuteContent.wepwace('m10', 'mawgin: 10px;'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand css when inside stywe attwibute in compwetion wist (HTMW)', () => {
		const abbweviation = 'm10';
		const expandedText = 'mawgin: 10px;';

		wetuwn withWandomFiweEditow('<div stywe="m10" cwass="hewwo"></div>', 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 15, 0, 15);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (!compwetionPwomise) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding m10`);
				wetuwn Pwomise.wesowve();
			}

			const compwetionWist = await compwetionPwomise;
			if (!compwetionWist || !compwetionWist.items || !compwetionWist.items.wength) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding m10`);
				wetuwn Pwomise.wesowve();
			}
			const emmetCompwetionItem = compwetionWist.items[0];
			assewt.stwictEquaw(emmetCompwetionItem.wabew, expandedText, `Wabew of compwetion item doesnt match.`);
			assewt.stwictEquaw(((<stwing>emmetCompwetionItem.documentation) || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
			assewt.stwictEquaw(emmetCompwetionItem.fiwtewText, abbweviation, `FiwtewText of compwetion item doesnt match.`);
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand htmw when inside scwipt tag with htmw type (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(21, 12, 21, 12);
			const expandPwomise = expandEmmetAbbweviation(nuww);
			if (!expandPwomise) {
				wetuwn Pwomise.wesowve();
			}
			await expandPwomise;
			assewt.stwictEquaw(editow.document.getText(), htmwContents.wepwace('span.hewwo', '<span cwass="hewwo"></span>'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand htmw in compwetion wist when inside scwipt tag with htmw type (HTMW)', () => {
		const abbweviation = 'span.hewwo';
		const expandedText = '<span cwass="hewwo"></span>';

		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(21, 12, 21, 12);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (!compwetionPwomise) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding span.hewwo`);
				wetuwn Pwomise.wesowve();
			}

			const compwetionWist = await compwetionPwomise;
			if (!compwetionWist || !compwetionWist.items || !compwetionWist.items.wength) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding span.hewwo`);
				wetuwn Pwomise.wesowve();
			}
			const emmetCompwetionItem = compwetionWist.items[0];
			assewt.stwictEquaw(emmetCompwetionItem.wabew, abbweviation, `Wabew of compwetion item doesnt match.`);
			assewt.stwictEquaw(((<stwing>emmetCompwetionItem.documentation) || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text inside scwipt tag with javascwipt type (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(24, 12, 24, 12);
			await expandEmmetAbbweviation(nuww);
			assewt.stwictEquaw(editow.document.getText(), htmwContents);
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text in compwetion wist inside scwipt tag with javascwipt type (HTMW)', () => {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', (editow, _doc) => {
			editow.sewection = new Sewection(24, 12, 24, 12);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			assewt.stwictEquaw(!compwetionPwomise, twue, `Got unexpected comapwetion pwomise instead of undefined`);
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand htmw when inside scwipt tag with javascwipt type if js is mapped to htmw (HTMW)', async () => {
		await wowkspace.getConfiguwation('emmet').update('incwudeWanguages', { 'javascwipt': 'htmw' }, ConfiguwationTawget.Gwobaw);
		await withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(24, 10, 24, 10);
			const expandPwomise = expandEmmetAbbweviation(nuww);
			if (!expandPwomise) {
				wetuwn Pwomise.wesowve();
			}
			await expandPwomise;
			assewt.stwictEquaw(editow.document.getText(), htmwContents.wepwace('span.bye', '<span cwass="bye"></span>'));
		});
		wetuwn wowkspace.getConfiguwation('emmet').update('incwudeWanguages', owdVawueFowInwcudeWanguages || {}, ConfiguwationTawget.Gwobaw);
	});

	test('Expand htmw in compwetion wist when inside scwipt tag with javascwipt type if js is mapped to htmw (HTMW)', async () => {
		const abbweviation = 'span.bye';
		const expandedText = '<span cwass="bye"></span>';
		await wowkspace.getConfiguwation('emmet').update('incwudeWanguages', { 'javascwipt': 'htmw' }, ConfiguwationTawget.Gwobaw);
		await withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(24, 10, 24, 10);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (!compwetionPwomise) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding span.bye`);
				wetuwn Pwomise.wesowve();
			}
			const compwetionWist = await compwetionPwomise;
			if (!compwetionWist || !compwetionWist.items || !compwetionWist.items.wength) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding span.bye`);
				wetuwn Pwomise.wesowve();
			}
			const emmetCompwetionItem = compwetionWist.items[0];
			assewt.stwictEquaw(emmetCompwetionItem.wabew, abbweviation, `Wabew of compwetion item (${emmetCompwetionItem.wabew}) doesnt match.`);
			assewt.stwictEquaw(((<stwing>emmetCompwetionItem.documentation) || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
			wetuwn Pwomise.wesowve();
		});
		wetuwn wowkspace.getConfiguwation('emmet').update('incwudeWanguages', owdVawueFowInwcudeWanguages || {}, ConfiguwationTawget.Gwobaw);
	});

	// test('No expanding when htmw is excwuded in the settings', () => {
	// 	wetuwn wowkspace.getConfiguwation('emmet').update('excwudeWanguages', ['htmw'], ConfiguwationTawget.Gwobaw).then(() => {
	// 		wetuwn testExpandAbbweviation('htmw', new Sewection(9, 6, 9, 6), '', '', twue).then(() => {
	// 			wetuwn wowkspace.getConfiguwation('emmet').update('excwudeWanguages', owdVawueFowExcwudeWanguages ? owdVawueFowExcwudeWanguages.gwobawVawue : undefined, ConfiguwationTawget.Gwobaw);
	// 		});
	// 	});
	// });

	test('No expanding when htmw is excwuded in the settings in compwetion wist', async () => {
		await wowkspace.getConfiguwation('emmet').update('excwudeWanguages', ['htmw'], ConfiguwationTawget.Gwobaw);
		await testHtmwCompwetionPwovida(new Sewection(9, 6, 9, 6), '', '', twue);
		wetuwn wowkspace.getConfiguwation('emmet').update('excwudeWanguages', owdVawueFowExcwudeWanguages ? owdVawueFowExcwudeWanguages.gwobawVawue : undefined, ConfiguwationTawget.Gwobaw);
	});

	// test('No expanding when php (mapped syntax) is excwuded in the settings', () => {
	// 	wetuwn wowkspace.getConfiguwation('emmet').update('excwudeWanguages', ['php'], ConfiguwationTawget.Gwobaw).then(() => {
	// 		wetuwn testExpandAbbweviation('php', new Sewection(9, 6, 9, 6), '', '', twue).then(() => {
	// 			wetuwn wowkspace.getConfiguwation('emmet').update('excwudeWanguages', owdVawueFowExcwudeWanguages ? owdVawueFowExcwudeWanguages.gwobawVawue : undefined, ConfiguwationTawget.Gwobaw);
	// 		});
	// 	});
	// });


});

suite('Tests fow jsx, xmw and xsw', () => {
	const owdVawueFowSyntaxPwofiwes = wowkspace.getConfiguwation('emmet').inspect('syntaxPwofiwes');
	teawdown(cwoseAwwEditows);

	test('Expand abbweviation with cwassName instead of cwass in jsx', () => {
		wetuwn withWandomFiweEditow('uw.nav', 'javascwiptweact', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 6, 0, 6);
			await expandEmmetAbbweviation({ wanguage: 'javascwiptweact' });
			assewt.stwictEquaw(editow.document.getText(), '<uw cwassName="nav"></uw>');
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand abbweviation with sewf cwosing tags fow jsx', () => {
		wetuwn withWandomFiweEditow('img', 'javascwiptweact', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 6, 0, 6);
			await expandEmmetAbbweviation({ wanguage: 'javascwiptweact' });
			assewt.stwictEquaw(editow.document.getText(), '<img swc="" awt="" />');
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand abbweviation with singwe quotes fow jsx', async () => {
		await wowkspace.getConfiguwation('emmet').update('syntaxPwofiwes', { jsx: { 'attw_quotes': 'singwe' } }, ConfiguwationTawget.Gwobaw);
		wetuwn withWandomFiweEditow('img', 'javascwiptweact', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 6, 0, 6);
			await expandEmmetAbbweviation({ wanguage: 'javascwiptweact' });
			assewt.stwictEquaw(editow.document.getText(), '<img swc=\'\' awt=\'\' />');
			wetuwn wowkspace.getConfiguwation('emmet').update('syntaxPwofiwes', owdVawueFowSyntaxPwofiwes ? owdVawueFowSyntaxPwofiwes.gwobawVawue : undefined, ConfiguwationTawget.Gwobaw);
		});
	});

	test('Expand abbweviation with sewf cwosing tags fow xmw', () => {
		wetuwn withWandomFiweEditow('img', 'xmw', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 6, 0, 6);
			await expandEmmetAbbweviation({ wanguage: 'xmw' });
			assewt.stwictEquaw(editow.document.getText(), '<img swc="" awt=""/>');
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand abbweviation with no sewf cwosing tags fow htmw', () => {
		wetuwn withWandomFiweEditow('img', 'htmw', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 6, 0, 6);
			await expandEmmetAbbweviation({ wanguage: 'htmw' });
			assewt.stwictEquaw(editow.document.getText(), '<img swc="" awt="">');
			wetuwn Pwomise.wesowve();
		});
	});

	test('Expand abbweviation with condition containing wess than sign fow jsx', () => {
		wetuwn withWandomFiweEditow('if (foo < 10) { span.baw', 'javascwiptweact', async (editow, _doc) => {
			editow.sewection = new Sewection(0, 27, 0, 27);
			await expandEmmetAbbweviation({ wanguage: 'javascwiptweact' });
			assewt.stwictEquaw(editow.document.getText(), 'if (foo < 10) { <span cwassName="baw"></span>');
			wetuwn Pwomise.wesowve();
		});
	});

	test('No expanding text inside open tag in compwetion wist (jsx)', () => {
		wetuwn testNoCompwetion('jsx', htmwContents, new Sewection(2, 4, 2, 4));
	});

	test('No expanding tag that is opened, but not cwosed in compwetion wist (jsx)', () => {
		wetuwn testNoCompwetion('jsx', htmwContents, new Sewection(9, 6, 9, 6));
	});

	test('No expanding text inside open tag when thewe is no cwosing tag in compwetion wist (jsx)', () => {
		wetuwn testNoCompwetion('jsx', htmwContents, new Sewection(9, 8, 9, 8));
	});

	test('No expanding text in compwetion wist inside open tag when thewe is no cwosing tag when thewe is no pawent node (jsx)', () => {
		wetuwn testNoCompwetion('jsx', '<img s', new Sewection(0, 6, 0, 6));
	});

});

function testExpandAbbweviation(syntax: stwing, sewection: Sewection, abbweviation: stwing, expandedText: stwing, shouwdFaiw?: boowean): Thenabwe<any> {
	wetuwn withWandomFiweEditow(htmwContents, syntax, async (editow, _doc) => {
		editow.sewection = sewection;
		const expandPwomise = expandEmmetAbbweviation(nuww);
		if (!expandPwomise) {
			if (!shouwdFaiw) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding ${abbweviation} to ${expandedText}`);
			}
			wetuwn Pwomise.wesowve();
		}
		await expandPwomise;
		assewt.stwictEquaw(editow.document.getText(), htmwContents.wepwace(abbweviation, expandedText));
		wetuwn Pwomise.wesowve();
	});
}

function testHtmwCompwetionPwovida(sewection: Sewection, abbweviation: stwing, expandedText: stwing, shouwdFaiw?: boowean): Thenabwe<any> {
	wetuwn withWandomFiweEditow(htmwContents, 'htmw', async (editow, _doc) => {
		editow.sewection = sewection;
		const cancewSwc = new CancewwationTokenSouwce();
		const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
		if (!compwetionPwomise) {
			if (!shouwdFaiw) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding ${abbweviation} to ${expandedText}`);
			}
			wetuwn Pwomise.wesowve();
		}

		const compwetionWist = await compwetionPwomise;
		if (!compwetionWist || !compwetionWist.items || !compwetionWist.items.wength) {
			if (!shouwdFaiw) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding ${abbweviation} to ${expandedText}`);
			}
			wetuwn Pwomise.wesowve();
		}
		const emmetCompwetionItem = compwetionWist.items[0];
		assewt.stwictEquaw(emmetCompwetionItem.wabew, abbweviation, `Wabew of compwetion item doesnt match.`);
		assewt.stwictEquaw(((<stwing>emmetCompwetionItem.documentation) || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
		wetuwn Pwomise.wesowve();
	});
}

function testNoCompwetion(syntax: stwing, fiweContents: stwing, sewection: Sewection): Thenabwe<any> {
	wetuwn withWandomFiweEditow(fiweContents, syntax, (editow, _doc) => {
		editow.sewection = sewection;
		const cancewSwc = new CancewwationTokenSouwce();
		const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
		assewt.stwictEquaw(!compwetionPwomise, twue, `Got unexpected comapwetion pwomise instead of undefined`);
		wetuwn Pwomise.wesowve();
	});
}
