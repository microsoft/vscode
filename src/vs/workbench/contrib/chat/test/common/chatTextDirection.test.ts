/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getConfiguredTextDirection } from '../../../../../editor/common/core/textDirection.js';
import { TextDirection } from '../../../../../editor/common/model.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { getChatTextDirection } from '../../common/chatTextDirection.js';

suite('chatTextDirection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('inherits editor.textDirection by default', () => {
		const configurationService = new TestConfigurationService({ 'editor.textDirection': 'rtl' });

		assert.strictEqual(getChatTextDirection(configurationService), 'rtl');
	});

	test('inherits contextual editor.textDirection values', () => {
		const configurationService = new TestConfigurationService({
			'editor.textDirection': 'auto-follow',
		});

		assert.strictEqual(getChatTextDirection(configurationService), 'auto-follow');
	});

	test('uses editor.textDirection for chat surfaces', () => {
		const configurationService = new TestConfigurationService({
			'editor.textDirection': 'rtl',
		});

		assert.strictEqual(getChatTextDirection(configurationService), 'rtl');
		assert.strictEqual(getConfiguredTextDirection('hello سلام', getChatTextDirection(configurationService), TextDirection.LTR), TextDirection.RTL);
	});
});
