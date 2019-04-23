/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { TestTheme, TestThemeService } from 'vs/platform/theme/test/common/testThemeService';

const themeServiceMock = new TestThemeService();

export class TestCodeEditorServiceImpl extends CodeEditorServiceImpl {
	getActiveCodeEditor(): ICodeEditor | null {
		return null;
	}

	openCodeEditor(input: IResourceInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null> {
		return Promise.resolve(null);
	}
}

suite('Decoration Render Options', () => {
	let options: IDecorationRenderOptions = {
		gutterIconPath: URI.parse('https://github.com/Microsoft/vscode/blob/master/resources/linux/code.png'),
		gutterIconSize: 'contain',
		backgroundColor: 'red',
		borderColor: 'yellow'
	};
	test('register and resolve decoration type', () => {
		let s = new TestCodeEditorServiceImpl(themeServiceMock);
		s.registerDecorationType('example', options);
		assert.notEqual(s.resolveDecorationOptions('example', false), undefined);
	});
	test('remove decoration type', () => {
		let s = new TestCodeEditorServiceImpl(themeServiceMock);
		s.registerDecorationType('example', options);
		assert.notEqual(s.resolveDecorationOptions('example', false), undefined);
		s.removeDecorationType('example');
		assert.throws(() => s.resolveDecorationOptions('example', false));
	});

	function readStyleSheet(styleSheet: HTMLStyleElement): string {
		if ((<any>styleSheet.sheet).rules) {
			return Array.prototype.map.call((<any>styleSheet.sheet).rules, (r: { cssText: string }) => r.cssText).join('\n');
		}
		return styleSheet.sheet!.toString();
	}

	test('css properties', () => {
		let styleSheet = dom.createStyleSheet();
		let s = new TestCodeEditorServiceImpl(themeServiceMock, styleSheet);
		s.registerDecorationType('example', options);
		let sheet = readStyleSheet(styleSheet);
		assert(
			sheet.indexOf('background: url(\'https://github.com/Microsoft/vscode/blob/master/resources/linux/code.png\') center center no-repeat;') > 0
			|| sheet.indexOf('background: url("https://github.com/Microsoft/vscode/blob/master/resources/linux/code.png") center center / contain no-repeat;') > 0
		);
		assert(sheet.indexOf('border-color: yellow;') > 0);
		assert(sheet.indexOf('background-color: red;') > 0);
	});

	test('theme color', () => {
		let options: IDecorationRenderOptions = {
			backgroundColor: { id: 'editorBackground' },
			borderColor: { id: 'editorBorder' },
		};
		let colors: { [key: string]: string } = {
			editorBackground: '#FF0000'
		};

		let styleSheet = dom.createStyleSheet();
		let themeService = new TestThemeService(new TestTheme(colors));
		let s = new TestCodeEditorServiceImpl(themeService, styleSheet);
		s.registerDecorationType('example', options);
		let sheet = readStyleSheet(styleSheet);
		assert.equal(sheet, '.monaco-editor .ced-example-0 { background-color: rgb(255, 0, 0); border-color: transparent; box-sizing: border-box; }');

		colors = {
			editorBackground: '#EE0000',
			editorBorder: '#00FFFF'
		};
		themeService.setTheme(new TestTheme(colors));
		sheet = readStyleSheet(styleSheet);
		assert.equal(sheet, '.monaco-editor .ced-example-0 { background-color: rgb(238, 0, 0); border-color: rgb(0, 255, 255); box-sizing: border-box; }');

		s.removeDecorationType('example');
		sheet = readStyleSheet(styleSheet);
		assert.equal(sheet, '');

	});

	test('theme overrides', () => {
		let options: IDecorationRenderOptions = {
			color: { id: 'editorBackground' },
			light: {
				color: '#FF00FF'
			},
			dark: {
				color: '#000000',
				after: {
					color: { id: 'infoForeground' }
				}
			}
		};
		let colors: { [key: string]: string } = {
			editorBackground: '#FF0000',
			infoForeground: '#444444'
		};

		let styleSheet = dom.createStyleSheet();
		let themeService = new TestThemeService(new TestTheme(colors));
		let s = new TestCodeEditorServiceImpl(themeService, styleSheet);
		s.registerDecorationType('example', options);
		let sheet = readStyleSheet(styleSheet);
		let expected =
			'.vs-dark.monaco-editor .ced-example-4::after, .hc-black.monaco-editor .ced-example-4::after { color: rgb(68, 68, 68) !important; }\n' +
			'.vs-dark.monaco-editor .ced-example-1, .hc-black.monaco-editor .ced-example-1 { color: rgb(0, 0, 0) !important; }\n' +
			'.vs.monaco-editor .ced-example-1 { color: rgb(255, 0, 255) !important; }\n' +
			'.monaco-editor .ced-example-1 { color: rgb(255, 0, 0) !important; }';
		assert.equal(sheet, expected);

		s.removeDecorationType('example');
		sheet = readStyleSheet(styleSheet);
		assert.equal(sheet, '');
	});

	test('css properties, gutterIconPaths', () => {
		let styleSheet = dom.createStyleSheet();

		// unix file path (used as string)
		let s = new TestCodeEditorServiceImpl(themeServiceMock, styleSheet);
		s.registerDecorationType('example', { gutterIconPath: URI.file('/Users/foo/bar.png') });
		let sheet = readStyleSheet(styleSheet);//.innerHTML || styleSheet.sheet.toString();
		assert(
			sheet.indexOf('background: url(\'file:///Users/foo/bar.png\') center center no-repeat;') > 0
			|| sheet.indexOf('background: url("file:///Users/foo/bar.png") center center no-repeat;') > 0
		);

		// windows file path (used as string)
		s = new TestCodeEditorServiceImpl(themeServiceMock, styleSheet);
		s.registerDecorationType('example', { gutterIconPath: URI.file('c:\\files\\miles\\more.png') });
		sheet = readStyleSheet(styleSheet);
		// TODO@Alex test fails
		// assert(
		// 	sheet.indexOf('background: url(\'file:///c%3A/files/miles/more.png\') center center no-repeat;') > 0
		// 	|| sheet.indexOf('background: url("file:///c%3A/files/miles/more.png") center center no-repeat;') > 0
		// );

		// URI, only minimal encoding
		s = new TestCodeEditorServiceImpl(themeServiceMock, styleSheet);
		s.registerDecorationType('example', { gutterIconPath: URI.parse('data:image/svg+xml;base64,PHN2ZyB4b+') });
		sheet = readStyleSheet(styleSheet);
		assert(
			sheet.indexOf('background: url(\'data:image/svg+xml;base64,PHN2ZyB4b+\') center center no-repeat;') > 0
			|| sheet.indexOf('background: url("data:image/svg+xml;base64,PHN2ZyB4b+") center center no-repeat;') > 0
		);

		// single quote must always be escaped/encoded
		s = new TestCodeEditorServiceImpl(themeServiceMock, styleSheet);
		s.registerDecorationType('example', { gutterIconPath: URI.file('/Users/foo/b\'ar.png') });
		sheet = readStyleSheet(styleSheet);
		assert(
			sheet.indexOf('background: url(\'file:///Users/foo/b%27ar.png\') center center no-repeat;') > 0
			|| sheet.indexOf('background: url("file:///Users/foo/b%27ar.png") center center no-repeat;') > 0
		);

		s = new TestCodeEditorServiceImpl(themeServiceMock, styleSheet);
		s.registerDecorationType('example', { gutterIconPath: URI.parse('http://test/pa\'th') });
		sheet = readStyleSheet(styleSheet);
		assert(
			sheet.indexOf('background: url(\'http://test/pa%27th\') center center no-repeat;') > 0
			|| sheet.indexOf('background: url("http://test/pa%27th") center center no-repeat;') > 0
		);
	});
});
