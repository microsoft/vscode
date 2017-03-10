/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
// import * as dom from 'vs/base/browser/dom';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';

suite('Browser Services - EditorLayoutProvider', () => {
	var options: IDecorationRenderOptions = {
		gutterIconPath: URI.parse('https://github.com/Microsoft/vscode/blob/master/resources/linux/code.png'),
		gutterIconSize: 'contain',
		backgroundColor: 'red',
		borderColor: 'yellow'
	};
	test('register and resolve decoration type', () => {
		var s = new CodeEditorServiceImpl();
		s.registerDecorationType('example', options);
		assert.notEqual(s.resolveDecorationOptions('example', false), undefined);
	});
	test('remove decoration type', () => {
		var s = new CodeEditorServiceImpl();
		s.registerDecorationType('example', options);
		assert.notEqual(s.resolveDecorationOptions('example', false), undefined);
		s.removeDecorationType('example');
		assert.throws(() => s.resolveDecorationOptions('example', false));
	});
	// TODO(alex,martin) these tests fail when being run in a real browser
	// test('css properties', () => {
	// 	var styleSheet = dom.createStyleSheet();
	// 	var s = new CodeEditorServiceImpl(styleSheet);
	// 	s.registerDecorationType('example', options);
	// 	var sheet = styleSheet.sheet.toString();
	// 	assert(sheet.indexOf('background: url(\'https://github.com/Microsoft/vscode/blob/master/resources/linux/code.png\') center center no-repeat;') > 0);
	// 	assert(sheet.indexOf('background-size: contain;') > 0);
	// 	assert(sheet.indexOf('border-color: yellow;') > 0);
	// 	assert(sheet.indexOf('background-color: red;') > 0);
	// });

	// test('css properties, gutterIconPaths', () => {
	// 	var styleSheet = dom.createStyleSheet();

	// 	// unix file path (used as string)
	// 	var s = new CodeEditorServiceImpl(styleSheet);
	// 	s.registerDecorationType('example', { gutterIconPath: '/Users/foo/bar.png' });
	// 	var sheet = styleSheet.sheet.toString();
	// 	assert(sheet.indexOf('background: url(\'file:///Users/foo/bar.png\') center center no-repeat;') > 0);

	// 	// windows file path (used as string)
	// 	s = new CodeEditorServiceImpl(styleSheet);
	// 	s.registerDecorationType('example', { gutterIconPath: 'c:\\files\\miles\\more.png' });
	// 	sheet = styleSheet.sheet.toString();
	// 	assert(sheet.indexOf('background: url(\'file:///c%3A/files/miles/more.png\') center center no-repeat;') > 0);

	// 	// URI, only minimal encoding
	// 	s = new CodeEditorServiceImpl(styleSheet);
	// 	s.registerDecorationType('example', { gutterIconPath: URI.parse('data:image/svg+xml;base64,PHN2ZyB4b+') });
	// 	sheet = styleSheet.sheet.toString();
	// 	assert(sheet.indexOf('background: url(\'data:image/svg+xml;base64,PHN2ZyB4b+\') center center no-repeat;') > 0);

	// 	// single quote must always be escaped/encoded
	// 	s = new CodeEditorServiceImpl(styleSheet);
	// 	s.registerDecorationType('example', { gutterIconPath: '/Users/foo/b\'ar.png' });
	// 	sheet = styleSheet.sheet.toString();
	// 	assert(sheet.indexOf('background: url(\'file:///Users/foo/b%27ar.png\') center center no-repeat;') > 0, sheet);

	// 	s = new CodeEditorServiceImpl(styleSheet);
	// 	s.registerDecorationType('example', { gutterIconPath: URI.parse('http://test/pa\'th') });
	// 	sheet = styleSheet.sheet.toString();
	// 	assert(sheet.indexOf('background: url(\'http://test/pa%27th\') center center no-repeat;') > 0, sheet);
	// });
});
