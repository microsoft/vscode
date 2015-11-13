/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {CommonEditorConfiguration, ICSSConfig} from 'vs/editor/common/config/commonEditorConfig';

class MockConfiguration extends CommonEditorConfiguration {

	constructor(opts:any) {
		super(opts);
	}

	protected getOuterWidth(): number {
		return 100;
	}

	protected getOuterHeight(): number {
		return 100;
	}

	protected readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig {
		// Doesn't really matter
		return {
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 20,
			maxDigitWidth: 10,
			lineHeight: 20,
			font: 'mockFont',
			fontSize: 20
		};
	}
}

suite('Editor Config - CommonEditorConfig', () => {
	test('Configuration.normalizeIndentation', () => {
		var config = new MockConfiguration({
			insertSpaces: false,
			tabSize: 4
		});

		assert.equal(config.normalizeIndentation('\t'), '\t');
		assert.equal(config.normalizeIndentation('    '), '\t');
		assert.equal(config.normalizeIndentation('   '), '   ');
		assert.equal(config.normalizeIndentation('  '), '  ');
		assert.equal(config.normalizeIndentation(' '), ' ');
		assert.equal(config.normalizeIndentation(''), '');
		assert.equal(config.normalizeIndentation(' \t   '), '\t\t');
		assert.equal(config.normalizeIndentation(' \t  '), '\t   ');
		assert.equal(config.normalizeIndentation(' \t '), '\t  ');
		assert.equal(config.normalizeIndentation(' \t'), '\t ');

		assert.equal(config.normalizeIndentation('\ta'), '\ta');
		assert.equal(config.normalizeIndentation('    a'), '\ta');
		assert.equal(config.normalizeIndentation('   a'), '   a');
		assert.equal(config.normalizeIndentation('  a'), '  a');
		assert.equal(config.normalizeIndentation(' a'), ' a');
		assert.equal(config.normalizeIndentation('a'), 'a');
		assert.equal(config.normalizeIndentation(' \t   a'), '\t\ta');
		assert.equal(config.normalizeIndentation(' \t  a'), '\t   a');
		assert.equal(config.normalizeIndentation(' \t a'), '\t  a');
		assert.equal(config.normalizeIndentation(' \ta'), '\t a');

		config = new MockConfiguration({
			insertSpaces: true,
			tabSize: 4
		});

		assert.equal(config.normalizeIndentation('\ta'), '    a');
		assert.equal(config.normalizeIndentation('    a'), '    a');
		assert.equal(config.normalizeIndentation('   a'), '   a');
		assert.equal(config.normalizeIndentation('  a'), '  a');
		assert.equal(config.normalizeIndentation(' a'), ' a');
		assert.equal(config.normalizeIndentation('a'), 'a');
		assert.equal(config.normalizeIndentation(' \t   a'), '        a');
		assert.equal(config.normalizeIndentation(' \t  a'), '       a');
		assert.equal(config.normalizeIndentation(' \t a'), '      a');
		assert.equal(config.normalizeIndentation(' \ta'), '     a');
	});
});

