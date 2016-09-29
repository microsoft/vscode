/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as dom from 'vs/base/browser/dom';
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {IDecorationRenderOptions} from 'vs/editor/common/editorCommon';

suite('Browser Services - EditorLayoutProvider', () => {
	var options: IDecorationRenderOptions = {
		gutterIconPath: 'https://github.com/Microsoft/vscode/blob/master/resources/linux/code.png',
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
	test('css properties', () => {
		var styleSheet = dom.createStyleSheet();
		var s = new CodeEditorServiceImpl(styleSheet);
		s.registerDecorationType('example', options);
		var sheet = styleSheet.sheet.toString();
		assert(sheet.indexOf('background: url(\'https://github.com/Microsoft/vscode/blob/master/resources/linux/code.png\') center center no-repeat;') > 0);
		assert(sheet.indexOf('background-size: contain;') > 0);
		assert(sheet.indexOf('border-color: yellow;') > 0);
		assert(sheet.indexOf('background-color: red;') > 0);
	});
});
