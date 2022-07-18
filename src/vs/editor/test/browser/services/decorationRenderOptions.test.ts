/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { TestCodeEditorService, TestGlobalStyleSheet } from 'vs/editor/test/browser/editorTestServices';
import { TestColorTheme, TestThemeService } from 'vs/platform/theme/test/common/testThemeService';

suite('Decoration Render Options', () => {
	const themeServiceMock = new TestThemeService();

	const options: IDecorationRenderOptions = {
		gutterIconPath: URI.parse('https://github.com/microsoft/vscode/blob/main/resources/linux/code.png'),
		gutterIconSize: 'contain',
		backgroundColor: 'red',
		borderColor: 'yellow'
	};
	test('register and resolve decoration type', () => {
		const s = new TestCodeEditorService(themeServiceMock);
		s.registerDecorationType('test', 'example', options);
		assert.notStrictEqual(s.resolveDecorationOptions('example', false), undefined);
	});
	test('remove decoration type', () => {
		const s = new TestCodeEditorService(themeServiceMock);
		s.registerDecorationType('test', 'example', options);
		assert.notStrictEqual(s.resolveDecorationOptions('example', false), undefined);
		s.removeDecorationType('example');
		assert.throws(() => s.resolveDecorationOptions('example', false));
	});

	function readStyleSheet(styleSheet: TestGlobalStyleSheet): string {
		return styleSheet.read();
	}

	test('css properties', () => {
		const s = new TestCodeEditorService(themeServiceMock);
		const styleSheet = s.globalStyleSheet;
		s.registerDecorationType('test', 'example', options);
		const sheet = readStyleSheet(styleSheet);
		assert(sheet.indexOf(`{background:url('https://github.com/microsoft/vscode/blob/main/resources/linux/code.png') center center no-repeat;background-size:contain;}`) >= 0);
		assert(sheet.indexOf(`{background-color:red;border-color:yellow;box-sizing: border-box;}`) >= 0);
	});

	test('theme color', () => {
		const options: IDecorationRenderOptions = {
			backgroundColor: { id: 'editorBackground' },
			borderColor: { id: 'editorBorder' },
		};

		const themeService = new TestThemeService(new TestColorTheme({
			editorBackground: '#FF0000'
		}));
		const s = new TestCodeEditorService(themeService);
		const styleSheet = s.globalStyleSheet;
		s.registerDecorationType('test', 'example', options);
		assert.strictEqual(readStyleSheet(styleSheet), '.monaco-editor .ced-example-0 {background-color:#ff0000;border-color:transparent;box-sizing: border-box;}');

		themeService.setTheme(new TestColorTheme({
			editorBackground: '#EE0000',
			editorBorder: '#00FFFF'
		}));
		assert.strictEqual(readStyleSheet(styleSheet), '.monaco-editor .ced-example-0 {background-color:#ee0000;border-color:#00ffff;box-sizing: border-box;}');

		s.removeDecorationType('example');
		assert.strictEqual(readStyleSheet(styleSheet), '');
	});

	test('theme overrides', () => {
		const options: IDecorationRenderOptions = {
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

		const themeService = new TestThemeService(new TestColorTheme({
			editorBackground: '#FF0000',
			infoForeground: '#444444'
		}));
		const s = new TestCodeEditorService(themeService);
		const styleSheet = s.globalStyleSheet;
		s.registerDecorationType('test', 'example', options);
		const expected = [
			'.vs-dark.monaco-editor .ced-example-4::after, .hc-black.monaco-editor .ced-example-4::after {color:#444444 !important;}',
			'.vs-dark.monaco-editor .ced-example-1, .hc-black.monaco-editor .ced-example-1 {color:#000000 !important;}',
			'.vs.monaco-editor .ced-example-1, .hc-light.monaco-editor .ced-example-1 {color:#FF00FF !important;}',
			'.monaco-editor .ced-example-1 {color:#ff0000 !important;}'
		].join('\n');
		assert.strictEqual(readStyleSheet(styleSheet), expected);

		s.removeDecorationType('example');
		assert.strictEqual(readStyleSheet(styleSheet), '');
	});

	test('css properties, gutterIconPaths', () => {
		const s = new TestCodeEditorService(themeServiceMock);
		const styleSheet = s.globalStyleSheet;

		// URI, only minimal encoding
		s.registerDecorationType('test', 'example', { gutterIconPath: URI.parse('data:image/svg+xml;base64,PHN2ZyB4b+') });
		assert(readStyleSheet(styleSheet).indexOf(`{background:url('data:image/svg+xml;base64,PHN2ZyB4b+') center center no-repeat;}`) > 0);
		s.removeDecorationType('example');

		function assertBackground(url1: string, url2: string) {
			const actual = readStyleSheet(styleSheet);
			assert(
				actual.indexOf(`{background:url('${url1}') center center no-repeat;}`) > 0
				|| actual.indexOf(`{background:url('${url2}') center center no-repeat;}`) > 0
			);
		}

		if (platform.isWindows) {
			// windows file path (used as string)
			s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('c:\\files\\miles\\more.png') });
			assertBackground('file:///c:/files/miles/more.png', 'vscode-file://vscode-app/c:/files/miles/more.png');
			s.removeDecorationType('example');

			// single quote must always be escaped/encoded
			s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('c:\\files\\foo\\b\'ar.png') });
			assertBackground('file:///c:/files/foo/b%27ar.png', 'vscode-file://vscode-app/c:/files/foo/b%27ar.png');
			s.removeDecorationType('example');
		} else {
			// unix file path (used as string)
			s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('/Users/foo/bar.png') });
			assertBackground('file:///Users/foo/bar.png', 'vscode-file://vscode-app/Users/foo/bar.png');
			s.removeDecorationType('example');

			// single quote must always be escaped/encoded
			s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('/Users/foo/b\'ar.png') });
			assertBackground('file:///Users/foo/b%27ar.png', 'vscode-file://vscode-app/Users/foo/b%27ar.png');
			s.removeDecorationType('example');
		}

		s.registerDecorationType('test', 'example', { gutterIconPath: URI.parse('http://test/pa\'th') });
		assert(readStyleSheet(styleSheet).indexOf(`{background:url('http://test/pa%27th') center center no-repeat;}`) > 0);
		s.removeDecorationType('example');
	});
});
