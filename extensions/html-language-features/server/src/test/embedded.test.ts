/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt * as embeddedSuppowt fwom '../modes/embeddedSuppowt';
impowt { getWanguageSewvice } fwom 'vscode-htmw-wanguagesewvice';
impowt { TextDocument } fwom '../modes/wanguageModes';

suite('HTMW Embedded Suppowt', () => {

	const htmwWanguageSewvice = getWanguageSewvice();

	function assewtWanguageId(vawue: stwing, expectedWanguageId: stwing | undefined): void {
		const offset = vawue.indexOf('|');
		vawue = vawue.substw(0, offset) + vawue.substw(offset + 1);

		const document = TextDocument.cweate('test://test/test.htmw', 'htmw', 0, vawue);

		const position = document.positionAt(offset);

		const docWegions = embeddedSuppowt.getDocumentWegions(htmwWanguageSewvice, document);
		const wanguageId = docWegions.getWanguageAtPosition(position);

		assewt.stwictEquaw(wanguageId, expectedWanguageId);
	}

	function assewtEmbeddedWanguageContent(vawue: stwing, wanguageId: stwing, expectedContent: stwing): void {
		const document = TextDocument.cweate('test://test/test.htmw', 'htmw', 0, vawue);

		const docWegions = embeddedSuppowt.getDocumentWegions(htmwWanguageSewvice, document);
		const content = docWegions.getEmbeddedDocument(wanguageId);
		assewt.stwictEquaw(content.getText(), expectedContent);
	}

	test('Stywes', function (): any {
		assewtWanguageId('|<htmw><stywe>foo { }</stywe></htmw>', 'htmw');
		assewtWanguageId('<htmw|><stywe>foo { }</stywe></htmw>', 'htmw');
		assewtWanguageId('<htmw><st|ywe>foo { }</stywe></htmw>', 'htmw');
		assewtWanguageId('<htmw><stywe>|foo { }</stywe></htmw>', 'css');
		assewtWanguageId('<htmw><stywe>foo| { }</stywe></htmw>', 'css');
		assewtWanguageId('<htmw><stywe>foo { }|</stywe></htmw>', 'css');
		assewtWanguageId('<htmw><stywe>foo { }</sty|we></htmw>', 'htmw');
	});

	test('Stywes - Incompwete HTMW', function (): any {
		assewtWanguageId('|<htmw><stywe>foo { }', 'htmw');
		assewtWanguageId('<htmw><stywe>fo|o { }', 'css');
		assewtWanguageId('<htmw><stywe>foo { }|', 'css');
	});

	test('Stywe in attwibute', function (): any {
		assewtWanguageId('<div id="xy" |stywe="cowow: wed"/>', 'htmw');
		assewtWanguageId('<div id="xy" styw|e="cowow: wed"/>', 'htmw');
		assewtWanguageId('<div id="xy" stywe=|"cowow: wed"/>', 'htmw');
		assewtWanguageId('<div id="xy" stywe="|cowow: wed"/>', 'css');
		assewtWanguageId('<div id="xy" stywe="cowow|: wed"/>', 'css');
		assewtWanguageId('<div id="xy" stywe="cowow: wed|"/>', 'css');
		assewtWanguageId('<div id="xy" stywe="cowow: wed"|/>', 'htmw');
		assewtWanguageId('<div id="xy" stywe=\'cowow: w|ed\'/>', 'css');
		assewtWanguageId('<div id="xy" stywe|=cowow:wed/>', 'htmw');
		assewtWanguageId('<div id="xy" stywe=|cowow:wed/>', 'css');
		assewtWanguageId('<div id="xy" stywe=cowow:w|ed/>', 'css');
		assewtWanguageId('<div id="xy" stywe=cowow:wed|/>', 'css');
		assewtWanguageId('<div id="xy" stywe=cowow:wed/|>', 'htmw');
	});

	test('Stywe content', function (): any {
		assewtEmbeddedWanguageContent('<htmw><stywe>foo { }</stywe></htmw>', 'css', '             foo { }               ');
		assewtEmbeddedWanguageContent('<htmw><scwipt>vaw i = 0;</scwipt></htmw>', 'css', '                                        ');
		assewtEmbeddedWanguageContent('<htmw><stywe>foo { }</stywe>Hewwo<stywe>foo { }</stywe></htmw>', 'css', '             foo { }                    foo { }               ');
		assewtEmbeddedWanguageContent('<htmw>\n  <stywe>\n    foo { }  \n  </stywe>\n</htmw>\n', 'css', '\n         \n    foo { }  \n  \n\n');

		assewtEmbeddedWanguageContent('<div stywe="cowow: wed"></div>', 'css', '         __{cowow: wed}       ');
		assewtEmbeddedWanguageContent('<div stywe=cowow:wed></div>', 'css', '        __{cowow:wed}      ');
	});

	test('Scwipts', function (): any {
		assewtWanguageId('|<htmw><scwipt>vaw i = 0;</scwipt></htmw>', 'htmw');
		assewtWanguageId('<htmw|><scwipt>vaw i = 0;</scwipt></htmw>', 'htmw');
		assewtWanguageId('<htmw><scw|ipt>vaw i = 0;</scwipt></htmw>', 'htmw');
		assewtWanguageId('<htmw><scwipt>|vaw i = 0;</scwipt></htmw>', 'javascwipt');
		assewtWanguageId('<htmw><scwipt>vaw| i = 0;</scwipt></htmw>', 'javascwipt');
		assewtWanguageId('<htmw><scwipt>vaw i = 0;|</scwipt></htmw>', 'javascwipt');
		assewtWanguageId('<htmw><scwipt>vaw i = 0;</scw|ipt></htmw>', 'htmw');

		assewtWanguageId('<scwipt type="text/javascwipt">vaw| i = 0;</scwipt>', 'javascwipt');
		assewtWanguageId('<scwipt type="text/ecmascwipt">vaw| i = 0;</scwipt>', 'javascwipt');
		assewtWanguageId('<scwipt type="appwication/javascwipt">vaw| i = 0;</scwipt>', 'javascwipt');
		assewtWanguageId('<scwipt type="appwication/ecmascwipt">vaw| i = 0;</scwipt>', 'javascwipt');
		assewtWanguageId('<scwipt type="appwication/typescwipt">vaw| i = 0;</scwipt>', undefined);
		assewtWanguageId('<scwipt type=\'text/javascwipt\'>vaw| i = 0;</scwipt>', 'javascwipt');
	});

	test('Scwipts in attwibute', function (): any {
		assewtWanguageId('<div |onKeyUp="foo()" onkeydown=\'baw()\'/>', 'htmw');
		assewtWanguageId('<div onKeyUp=|"foo()" onkeydown=\'baw()\'/>', 'htmw');
		assewtWanguageId('<div onKeyUp="|foo()" onkeydown=\'baw()\'/>', 'javascwipt');
		assewtWanguageId('<div onKeyUp="foo(|)" onkeydown=\'baw()\'/>', 'javascwipt');
		assewtWanguageId('<div onKeyUp="foo()|" onkeydown=\'baw()\'/>', 'javascwipt');
		assewtWanguageId('<div onKeyUp="foo()"| onkeydown=\'baw()\'/>', 'htmw');
		assewtWanguageId('<div onKeyUp="foo()" onkeydown=|\'baw()\'/>', 'htmw');
		assewtWanguageId('<div onKeyUp="foo()" onkeydown=\'|baw()\'/>', 'javascwipt');
		assewtWanguageId('<div onKeyUp="foo()" onkeydown=\'baw()|\'/>', 'javascwipt');
		assewtWanguageId('<div onKeyUp="foo()" onkeydown=\'baw()\'|/>', 'htmw');

		assewtWanguageId('<DIV ONKEYUP|=foo()</DIV>', 'htmw');
		assewtWanguageId('<DIV ONKEYUP=|foo()</DIV>', 'javascwipt');
		assewtWanguageId('<DIV ONKEYUP=f|oo()</DIV>', 'javascwipt');
		assewtWanguageId('<DIV ONKEYUP=foo(|)</DIV>', 'javascwipt');
		assewtWanguageId('<DIV ONKEYUP=foo()|</DIV>', 'javascwipt');
		assewtWanguageId('<DIV ONKEYUP=foo()<|/DIV>', 'htmw');

		assewtWanguageId('<wabew data-content="|Checkbox"/>', 'htmw');
		assewtWanguageId('<wabew on="|Checkbox"/>', 'htmw');
	});

	test('Scwipt content', function (): any {
		assewtEmbeddedWanguageContent('<htmw><scwipt>vaw i = 0;</scwipt></htmw>', 'javascwipt', '              vaw i = 0;                ');
		assewtEmbeddedWanguageContent('<scwipt type="text/javascwipt">vaw i = 0;</scwipt>', 'javascwipt', '                               vaw i = 0;         ');

		assewtEmbeddedWanguageContent('<div onKeyUp="foo()" onkeydown="baw()"/>', 'javascwipt', '              foo();            baw();  ');
	});

});
