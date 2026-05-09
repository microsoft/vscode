/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getConfiguredTextDirection } from '../../../../../editor/common/core/textDirection.js';
import { TextDirection } from '../../../../../editor/common/model.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { getChatTextDirection, isChatTextDirectionPreset } from '../../common/chatTextDirection.js';
import { ChatConfiguration } from '../../common/constants.js';

suite('chatTextDirection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('inherits editor.textDirection by default', () => {
		const configurationService = new TestConfigurationService({ 'editor.textDirection': 'rtl' });

		assert.strictEqual(getChatTextDirection(configurationService), 'rtl');
	});

	test('inherits editor.textDirection when chat.textDirection is inherit', () => {
		const configurationService = new TestConfigurationService({
			'editor.textDirection': 'auto-follow',
			[ChatConfiguration.TextDirection]: 'inherit',
		});

		assert.strictEqual(getChatTextDirection(configurationService), 'auto-follow');
	});

	test('allows chat.textDirection to override editor.textDirection', () => {
		const configurationService = new TestConfigurationService({
			'editor.textDirection': 'ltr',
			[ChatConfiguration.TextDirection]: 'rtl',
		});

		assert.strictEqual(getChatTextDirection(configurationService), 'rtl');
		assert.strictEqual(getConfiguredTextDirection('hello سلام', getChatTextDirection(configurationService), TextDirection.LTR), TextDirection.RTL);
	});

	test('validates supported chat text direction presets', () => {
		assert.strictEqual(isChatTextDirectionPreset('inherit'), true);
		assert.strictEqual(isChatTextDirectionPreset('contextual'), true);
		assert.strictEqual(isChatTextDirectionPreset('auto'), true);
		assert.strictEqual(isChatTextDirectionPreset('ltr'), true);
		assert.strictEqual(isChatTextDirectionPreset('invalid'), false);
	});
});
