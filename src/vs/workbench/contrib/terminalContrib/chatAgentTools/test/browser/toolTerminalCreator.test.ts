/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalChatAgentToolsSettingId, terminalChatAgentToolsConfiguration } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('TerminalChatAgentToolsConfiguration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('Shell Integration Timeout Configuration', () => {
		test('should have shell integration timeout setting defined', () => {
			const timeoutConfig = terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.ShellIntegrationTimeout];
			strictEqual(typeof timeoutConfig, 'object', 'Shell integration timeout config should be defined');
			strictEqual(timeoutConfig?.type, 'integer', 'Should be an integer type');
			strictEqual(timeoutConfig?.default, 5000, 'Should have default value of 5000ms');
			strictEqual(timeoutConfig?.minimum, 0, 'Should have minimum value of 0');
			strictEqual(timeoutConfig?.maximum, 30000, 'Should have maximum value of 30000ms');
		});

		test('should have proper setting ID', () => {
			strictEqual(
				TerminalChatAgentToolsSettingId.ShellIntegrationTimeout,
				'chat.tools.terminal.shellIntegrationTimeout',
				'Setting ID should match expected string'
			);
		});

		test('should have descriptive configuration', () => {
			const timeoutConfig = terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.ShellIntegrationTimeout];
			strictEqual(typeof timeoutConfig?.markdownDescription, 'string', 'Should have a description');
			
			const description = timeoutConfig?.markdownDescription || '';
			strictEqual(description.includes('duration in milliseconds'), true, 'Description should mention duration in milliseconds');
			strictEqual(description.includes('Set to 0 to skip'), true, 'Description should mention setting to 0 to skip');
			strictEqual(description.includes('shell integration'), true, 'Description should mention shell integration');
		});
	});
});