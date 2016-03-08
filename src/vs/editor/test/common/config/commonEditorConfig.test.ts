/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {TextModel} from 'vs/editor/common/model/textModel';
import {DefaultEndOfLine} from 'vs/editor/common/editorCommon';

suite('Editor Config - CommonEditorConfig', () => {
	test('Configuration.normalizeIndentation', () => {
		var model = new TextModel([], {
			length: 0,
			lines: [],
			BOM: '',
			EOL: '\n',
			options: {
				tabSize: 4,
				insertSpaces: false,
				defaultEOL: DefaultEndOfLine.LF
			}
		});

		assert.equal(model.normalizeIndentation('\t'), '\t');
		assert.equal(model.normalizeIndentation('    '), '\t');
		assert.equal(model.normalizeIndentation('   '), '   ');
		assert.equal(model.normalizeIndentation('  '), '  ');
		assert.equal(model.normalizeIndentation(' '), ' ');
		assert.equal(model.normalizeIndentation(''), '');
		assert.equal(model.normalizeIndentation(' \t   '), '\t\t');
		assert.equal(model.normalizeIndentation(' \t  '), '\t   ');
		assert.equal(model.normalizeIndentation(' \t '), '\t  ');
		assert.equal(model.normalizeIndentation(' \t'), '\t ');

		assert.equal(model.normalizeIndentation('\ta'), '\ta');
		assert.equal(model.normalizeIndentation('    a'), '\ta');
		assert.equal(model.normalizeIndentation('   a'), '   a');
		assert.equal(model.normalizeIndentation('  a'), '  a');
		assert.equal(model.normalizeIndentation(' a'), ' a');
		assert.equal(model.normalizeIndentation('a'), 'a');
		assert.equal(model.normalizeIndentation(' \t   a'), '\t\ta');
		assert.equal(model.normalizeIndentation(' \t  a'), '\t   a');
		assert.equal(model.normalizeIndentation(' \t a'), '\t  a');
		assert.equal(model.normalizeIndentation(' \ta'), '\t a');

		model.dispose();


		model = new TextModel([], {
			length: 0,
			lines: [],
			BOM: '',
			EOL: '\n',
			options: {
				tabSize: 4,
				insertSpaces: true,
				defaultEOL: DefaultEndOfLine.LF
			}
		});

		assert.equal(model.normalizeIndentation('\ta'), '    a');
		assert.equal(model.normalizeIndentation('    a'), '    a');
		assert.equal(model.normalizeIndentation('   a'), '   a');
		assert.equal(model.normalizeIndentation('  a'), '  a');
		assert.equal(model.normalizeIndentation(' a'), ' a');
		assert.equal(model.normalizeIndentation('a'), 'a');
		assert.equal(model.normalizeIndentation(' \t   a'), '        a');
		assert.equal(model.normalizeIndentation(' \t  a'), '       a');
		assert.equal(model.normalizeIndentation(' \t a'), '      a');
		assert.equal(model.normalizeIndentation(' \ta'), '     a');

		model.dispose();
	});
});

