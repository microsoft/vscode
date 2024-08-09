/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { forEachEmbeddedCode, defaultMapperFactory, VirtualCode } from '@volar/language-core';
import * as assert from 'assert';
import 'mocha';
import { getLanguageService } from 'vscode-html-languageservice';
import { URI } from 'vscode-uri';
import * as embeddedSupport from '../modes/embeddedSupport';
import { htmlLanguagePlugin } from '../modes/languagePlugin';

suite('HTML Embedded Support', () => {

	const htmlLanguageService = getLanguageService();

	function assertLanguageId(value: string, expectedLanguageId: string | undefined): void {
		const offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		const virtualCode = htmlLanguagePlugin.createVirtualCode?.(URI.file(''), 'html', {
			getText: (start, end) => value.substring(start, end),
			getLength: () => value.length,
			getChangeRange: () => undefined,
		}, { getAssociatedScript: () => undefined });
		assert(!!virtualCode);

		let mappedCode: VirtualCode | undefined;

		for (const embeddedCode of [...forEachEmbeddedCode(virtualCode)].reverse()) {
			const map = defaultMapperFactory(embeddedCode.mappings);
			for (const _mapped of map.toGeneratedLocation(offset)) {
				mappedCode = embeddedCode;
				break;
			}
			if (mappedCode) {
				break;
			}
		}

		assert(!!mappedCode);
		assert.strictEqual(mappedCode.languageId, expectedLanguageId);
	}

	function assertEmbeddedLanguageContent(value: string, languageId: string, expectedContents: string[]): void {
		const docRegions = embeddedSupport.getDocumentRegions(htmlLanguageService, value);
		const contents = docRegions.getEmbeddedRegions().filter(r => r.languageId === languageId);
		assert.strictEqual(contents.length, expectedContents.length);
		for (let i = 0; i < contents.length; i++) {
			assert.strictEqual(contents[i].content, expectedContents[i]);
		}
	}

	test('Styles', function (): any {
		assertLanguageId('|<html><style>foo { }</style></html>', 'html');
		assertLanguageId('<html|><style>foo { }</style></html>', 'html');
		assertLanguageId('<html><st|yle>foo { }</style></html>', 'html');
		assertLanguageId('<html><style>|foo { }</style></html>', 'css');
		assertLanguageId('<html><style>foo| { }</style></html>', 'css');
		assertLanguageId('<html><style>foo { }|</style></html>', 'css');
		assertLanguageId('<html><style>foo { }</sty|le></html>', 'html');
	});

	test('Styles - Incomplete HTML', function (): any {
		assertLanguageId('|<html><style>foo { }', 'html');
		assertLanguageId('<html><style>fo|o { }', 'css');
		assertLanguageId('<html><style>foo { }|', 'css');
	});

	test('Style in attribute', function (): any {
		assertLanguageId('<div id="xy" |style="color: red"/>', 'html');
		assertLanguageId('<div id="xy" styl|e="color: red"/>', 'html');
		assertLanguageId('<div id="xy" style=|"color: red"/>', 'html');
		assertLanguageId('<div id="xy" style="|color: red"/>', 'css');
		assertLanguageId('<div id="xy" style="color|: red"/>', 'css');
		assertLanguageId('<div id="xy" style="color: red|"/>', 'css');
		assertLanguageId('<div id="xy" style="color: red"|/>', 'html');
		assertLanguageId('<div id="xy" style=\'color: r|ed\'/>', 'css');
		assertLanguageId('<div id="xy" style|=color:red/>', 'html');
		assertLanguageId('<div id="xy" style=|color:red/>', 'css');
		assertLanguageId('<div id="xy" style=color:r|ed/>', 'css');
		assertLanguageId('<div id="xy" style=color:red|/>', 'css');
		assertLanguageId('<div id="xy" style=color:red/|>', 'html');
	});

	test('Style content', function (): any {
		assertEmbeddedLanguageContent('<html><style>foo { }</style></html>', 'css', ['foo { }']);
		assertEmbeddedLanguageContent('<html><script>var i = 0;</script></html>', 'css', []);
		assertEmbeddedLanguageContent('<html><style>foo { }</style>Hello<style>foo { }</style></html>', 'css', ['foo { }', 'foo { }']);
		assertEmbeddedLanguageContent('<html>\n  <style>\n    foo { }  \n  </style>\n</html>\n', 'css', ['\n    foo { }  \n  ']);

		assertEmbeddedLanguageContent('<div style="color: red"></div>', 'css', ['__{color: red}']);
		assertEmbeddedLanguageContent('<div style=color:red></div>', 'css', ['__{color:red}']);
	});

	test('Scripts', function (): any {
		assertLanguageId('|<html><script>var i = 0;</script></html>', 'html');
		assertLanguageId('<html|><script>var i = 0;</script></html>', 'html');
		assertLanguageId('<html><scr|ipt>var i = 0;</script></html>', 'html');
		assertLanguageId('<html><script>|var i = 0;</script></html>', 'javascript');
		assertLanguageId('<html><script>var| i = 0;</script></html>', 'javascript');
		assertLanguageId('<html><script>var i = 0;|</script></html>', 'javascript');
		assertLanguageId('<html><script>var i = 0;</scr|ipt></html>', 'html');

		assertLanguageId('<script type="text/javascript">var| i = 0;</script>', 'javascript');
		assertLanguageId('<script type="text/ecmascript">var| i = 0;</script>', 'javascript');
		assertLanguageId('<script type="application/javascript">var| i = 0;</script>', 'javascript');
		assertLanguageId('<script type="application/ecmascript">var| i = 0;</script>', 'javascript');
		assertLanguageId('<script type="application/typescript">var| i = 0;</script>', 'html');
		assertLanguageId('<script type=\'text/javascript\'>var| i = 0;</script>', 'javascript');
	});

	test('Scripts in attribute', function (): any {
		assertLanguageId('<div |onKeyUp="foo()" onkeydown=\'bar()\'/>', 'html');
		assertLanguageId('<div onKeyUp=|"foo()" onkeydown=\'bar()\'/>', 'html');
		assertLanguageId('<div onKeyUp="|foo()" onkeydown=\'bar()\'/>', 'javascript');
		assertLanguageId('<div onKeyUp="foo(|)" onkeydown=\'bar()\'/>', 'javascript');
		assertLanguageId('<div onKeyUp="foo()|" onkeydown=\'bar()\'/>', 'javascript');
		assertLanguageId('<div onKeyUp="foo()"| onkeydown=\'bar()\'/>', 'html');
		assertLanguageId('<div onKeyUp="foo()" onkeydown=|\'bar()\'/>', 'html');
		assertLanguageId('<div onKeyUp="foo()" onkeydown=\'|bar()\'/>', 'javascript');
		assertLanguageId('<div onKeyUp="foo()" onkeydown=\'bar()|\'/>', 'javascript');
		assertLanguageId('<div onKeyUp="foo()" onkeydown=\'bar()\'|/>', 'html');

		assertLanguageId('<DIV ONKEYUP|=foo()</DIV>', 'html');
		assertLanguageId('<DIV ONKEYUP=|foo()</DIV>', 'javascript');
		assertLanguageId('<DIV ONKEYUP=f|oo()</DIV>', 'javascript');
		assertLanguageId('<DIV ONKEYUP=foo(|)</DIV>', 'javascript');
		assertLanguageId('<DIV ONKEYUP=foo()|</DIV>', 'javascript');
		assertLanguageId('<DIV ONKEYUP=foo()<|/DIV>', 'html');

		assertLanguageId('<label data-content="|Checkbox"/>', 'html');
		assertLanguageId('<label on="|Checkbox"/>', 'html');
	});

	test('Script content', function (): any {
		assertEmbeddedLanguageContent('<html><script>var i = 0;</script></html>', 'javascript', ['var i = 0;']);
		assertEmbeddedLanguageContent('<script type="text/javascript">var i = 0;</script>', 'javascript', ['var i = 0;']);
		assertEmbeddedLanguageContent('<script><!--this comment should not give error--></script>', 'javascript', ['/* this comment should not give error */']);
		assertEmbeddedLanguageContent('<script><!--this comment should not give error--> console.log("logging");</script>', 'javascript', ['/* this comment should not give error */ console.log("logging");']);

		assertEmbeddedLanguageContent('<script>var data=100; <!--this comment should not give error--> </script>', 'javascript', ['var data=100; /* this comment should not give error */ ']);
		assertEmbeddedLanguageContent('<div onKeyUp="foo()" onkeydown="bar()"/>', 'javascript', ['foo();', 'bar();']);
		assertEmbeddedLanguageContent('<div onKeyUp="return"/>', 'javascript', ['return;']);
		assertEmbeddedLanguageContent('<div onKeyUp=return\n/><script>foo();</script>', 'javascript', ['return;', 'foo();']);
	});
});
