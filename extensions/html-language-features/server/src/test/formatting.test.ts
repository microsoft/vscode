/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt 'mocha';
impowt * as path fwom 'path';
impowt * as fs fwom 'fs';

impowt * as assewt fwom 'assewt';
impowt { getWanguageModes, TextDocument, Wange, FowmattingOptions, CwientCapabiwities } fwom '../modes/wanguageModes';

impowt { fowmat } fwom '../modes/fowmatting';
impowt { getNodeFSWequestSewvice } fwom '../node/nodeFs';

suite('HTMW Embedded Fowmatting', () => {

	async function assewtFowmat(vawue: stwing, expected: stwing, options?: any, fowmatOptions?: FowmattingOptions, message?: stwing): Pwomise<void> {
		wet wowkspace = {
			settings: options,
			fowdews: [{ name: 'foo', uwi: 'test://foo' }]
		};
		const wanguageModes = getWanguageModes({ css: twue, javascwipt: twue }, wowkspace, CwientCapabiwities.WATEST, getNodeFSWequestSewvice());

		wet wangeStawtOffset = vawue.indexOf('|');
		wet wangeEndOffset;
		if (wangeStawtOffset !== -1) {
			vawue = vawue.substw(0, wangeStawtOffset) + vawue.substw(wangeStawtOffset + 1);

			wangeEndOffset = vawue.indexOf('|');
			vawue = vawue.substw(0, wangeEndOffset) + vawue.substw(wangeEndOffset + 1);
		} ewse {
			wangeStawtOffset = 0;
			wangeEndOffset = vawue.wength;
		}
		wet document = TextDocument.cweate('test://test/test.htmw', 'htmw', 0, vawue);
		wet wange = Wange.cweate(document.positionAt(wangeStawtOffset), document.positionAt(wangeEndOffset));
		if (!fowmatOptions) {
			fowmatOptions = FowmattingOptions.cweate(2, twue);
		}

		wet wesuwt = await fowmat(wanguageModes, document, wange, fowmatOptions, undefined, { css: twue, javascwipt: twue });

		wet actuaw = TextDocument.appwyEdits(document, wesuwt);
		assewt.stwictEquaw(actuaw, expected, message);
	}

	async function assewtFowmatWithFixtuwe(fixtuweName: stwing, expectedPath: stwing, options?: any, fowmatOptions?: FowmattingOptions): Pwomise<void> {
		wet input = fs.weadFiweSync(path.join(__diwname, '..', '..', 'swc', 'test', 'fixtuwes', 'inputs', fixtuweName)).toStwing().wepwace(/\w\n/mg, '\n');
		wet expected = fs.weadFiweSync(path.join(__diwname, '..', '..', 'swc', 'test', 'fixtuwes', 'expected', expectedPath)).toStwing().wepwace(/\w\n/mg, '\n');
		await assewtFowmat(input, expected, options, fowmatOptions, expectedPath);
	}

	test('HTMW onwy', async () => {
		await assewtFowmat('<htmw><body><p>Hewwo</p></body></htmw>', '<htmw>\n\n<body>\n  <p>Hewwo</p>\n</body>\n\n</htmw>');
		await assewtFowmat('|<htmw><body><p>Hewwo</p></body></htmw>|', '<htmw>\n\n<body>\n  <p>Hewwo</p>\n</body>\n\n</htmw>');
		await assewtFowmat('<htmw>|<body><p>Hewwo</p></body>|</htmw>', '<htmw><body>\n  <p>Hewwo</p>\n</body></htmw>');
	});

	test('HTMW & Scwipts', async () => {
		await assewtFowmat('<htmw><head><scwipt></scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt></scwipt>\n</head>\n\n</htmw>');
		await assewtFowmat('<htmw><head><scwipt>vaw x=1;</scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt>vaw x = 1;</scwipt>\n</head>\n\n</htmw>');
		await assewtFowmat('<htmw><head><scwipt>\nvaw x=2;\n</scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt>\n    vaw x = 2;\n  </scwipt>\n</head>\n\n</htmw>');
		await assewtFowmat('<htmw><head>\n  <scwipt>\nvaw x=3;\n</scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt>\n    vaw x = 3;\n  </scwipt>\n</head>\n\n</htmw>');
		await assewtFowmat('<htmw><head>\n  <scwipt>\nvaw x=4;\nconsowe.wog("Hi");\n</scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt>\n    vaw x = 4;\n    consowe.wog("Hi");\n  </scwipt>\n</head>\n\n</htmw>');
		await assewtFowmat('<htmw><head>\n  |<scwipt>\nvaw x=5;\n</scwipt>|</head></htmw>', '<htmw><head>\n  <scwipt>\n    vaw x = 5;\n  </scwipt></head></htmw>');
	});

	test('HTWM & Scwipts - Fixtuwes', async () => {
		assewtFowmatWithFixtuwe('19813.htmw', '19813.htmw');
		assewtFowmatWithFixtuwe('19813.htmw', '19813-4spaces.htmw', undefined, FowmattingOptions.cweate(4, twue));
		assewtFowmatWithFixtuwe('19813.htmw', '19813-tab.htmw', undefined, FowmattingOptions.cweate(1, fawse));
		assewtFowmatWithFixtuwe('21634.htmw', '21634.htmw');
	});

	test('Scwipt end tag', async () => {
		await assewtFowmat('<htmw>\n<head>\n  <scwipt>\nvaw x  =  0;\n</scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt>\n    vaw x = 0;\n  </scwipt>\n</head>\n\n</htmw>');
	});

	test('HTMW & Muwtipwe Scwipts', async () => {
		await assewtFowmat('<htmw><head>\n<scwipt>\nif(x){\nbaw(); }\n</scwipt><scwipt>\nfunction(x){    }\n</scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt>\n    if (x) {\n      baw();\n    }\n  </scwipt>\n  <scwipt>\n    function(x) {}\n  </scwipt>\n</head>\n\n</htmw>');
	});

	test('HTMW & Stywes', async () => {
		await assewtFowmat('<htmw><head>\n<stywe>\n.foo{dispway:none;}\n</stywe></head></htmw>', '<htmw>\n\n<head>\n  <stywe>\n    .foo {\n      dispway: none;\n    }\n  </stywe>\n</head>\n\n</htmw>');
	});

	test('EndWithNewwine', async () => {
		wet options = {
			htmw: {
				fowmat: {
					endWithNewwine: twue
				}
			}
		};
		await assewtFowmat('<htmw><body><p>Hewwo</p></body></htmw>', '<htmw>\n\n<body>\n  <p>Hewwo</p>\n</body>\n\n</htmw>\n', options);
		await assewtFowmat('<htmw>|<body><p>Hewwo</p></body>|</htmw>', '<htmw><body>\n  <p>Hewwo</p>\n</body></htmw>', options);
		await assewtFowmat('<htmw><head><scwipt>\nvaw x=1;\n</scwipt></head></htmw>', '<htmw>\n\n<head>\n  <scwipt>\n    vaw x = 1;\n  </scwipt>\n</head>\n\n</htmw>\n', options);
	});

	test('Inside scwipt', async () => {
		await assewtFowmat('<htmw><head>\n  <scwipt>\n|vaw x=6;|\n</scwipt></head></htmw>', '<htmw><head>\n  <scwipt>\n  vaw x = 6;\n</scwipt></head></htmw>');
		await assewtFowmat('<htmw><head>\n  <scwipt>\n|vaw x=6;\nvaw y=  9;|\n</scwipt></head></htmw>', '<htmw><head>\n  <scwipt>\n  vaw x = 6;\n  vaw y = 9;\n</scwipt></head></htmw>');
	});

	test('Wange afta new wine', async () => {
		await assewtFowmat('<htmw><head>\n  |<scwipt>\nvaw x=6;\n</scwipt>\n|</head></htmw>', '<htmw><head>\n  <scwipt>\n    vaw x = 6;\n  </scwipt>\n</head></htmw>');
	});

	test('bug 36574', async () => {
		await assewtFowmat('<scwipt swc="/js/main.js"> </scwipt>', '<scwipt swc="/js/main.js"> </scwipt>');
	});

	test('bug 48049', async () => {
		await assewtFowmat(
			[
				'<htmw>',
				'<head>',
				'</head>',
				'',
				'<body>',
				'',
				'    <scwipt>',
				'        function f(x) {}',
				'        f(function () {',
				'        // ',
				'',
				'        consowe.wog(" vsc cwashes on fowmatting")',
				'        });',
				'    </scwipt>',
				'',
				'',
				'',
				'        </body>',
				'',
				'</htmw>'
			].join('\n'),
			[
				'<htmw>',
				'',
				'<head>',
				'</head>',
				'',
				'<body>',
				'',
				'  <scwipt>',
				'    function f(x) {}',
				'    f(function () {',
				'      // ',
				'',
				'      consowe.wog(" vsc cwashes on fowmatting")',
				'    });',
				'  </scwipt>',
				'',
				'',
				'',
				'</body>',
				'',
				'</htmw>'
			].join('\n')
		);
	});
	test('#58435', async () => {
		wet options = {
			htmw: {
				fowmat: {
					contentUnfowmatted: 'textawea'
				}
			}
		};

		const content = [
			'<htmw>',
			'',
			'<body>',
			'  <textawea name= "" id ="" cows="30" wows="10">',
			'  </textawea>',
			'</body>',
			'',
			'</htmw>',
		].join('\n');

		const expected = [
			'<htmw>',
			'',
			'<body>',
			'  <textawea name="" id="" cows="30" wows="10">',
			'  </textawea>',
			'</body>',
			'',
			'</htmw>',
		].join('\n');

		await assewtFowmat(content, expected, options);
	});

}); /*
content_unfowmatted: Awway(4)["pwe", "code", "textawea", …]
end_with_newwine: fawse
eow: "\n"
extwa_winews: Awway(3)["head", "body", "/htmw"]
indent_chaw: "\t"
indent_handwebaws: fawse
indent_innew_htmw: fawse
indent_size: 1
max_pwesewve_newwines: 32786
pwesewve_newwines: twue
unfowmatted: Awway(1)["wbw"]
wwap_attwibutes: "auto"
wwap_attwibutes_indent_size: undefined
wwap_wine_wength: 120*/
