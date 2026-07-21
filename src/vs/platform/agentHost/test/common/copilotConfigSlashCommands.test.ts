/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotConfigSlashCommandItems, isCopilotConfigSlashCommand, resolveCopilotConfigSlashCommandOnSend } from '../../common/copilotConfigSlashCommands.js';

suite('copilotConfigSlashCommands', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getCopilotConfigSlashCommandItems', () => {
		test('empty prefix returns permission and mode items with labels and actions', () => {
			const items = getCopilotConfigSlashCommandItems('');
			const byLabel = new Map(items.map(i => [i.label, i]));

			// Permission command: bare toggle plus on/off sub-args, inserts nothing.
			assert.strictEqual(byLabel.get('/yolo')?.insertText, '');
			assert.deepStrictEqual(byLabel.get('/yolo')?.applyConfig, { autoApprove: 'autoApprove' });
			assert.deepStrictEqual(byLabel.get('/yolo on')?.applyConfig, { autoApprove: 'autoApprove' });
			assert.deepStrictEqual(byLabel.get('/yolo off')?.applyConfig, { autoApprove: 'default' });

			// Mode sub-args (toggles insert nothing) and the keep-text prompt variant.
			assert.strictEqual(byLabel.get('/autopilot on')?.insertText, '');
			assert.deepStrictEqual(byLabel.get('/autopilot on')?.applyConfig, { mode: 'autopilot' });
			assert.deepStrictEqual(byLabel.get('/autopilot off')?.applyConfig, { mode: 'interactive' });
			const prompt = byLabel.get('/autopilot');
			assert.strictEqual(prompt?.insertText, '/autopilot ');
			assert.deepStrictEqual(prompt?.applyConfig, { mode: 'autopilot' });
			assert.strictEqual(prompt?.argumentHint, 'objective');
		});

		test('prefix filters by command name', () => {
			const commands = new Set(getCopilotConfigSlashCommandItems('autop').map(i => i.command));
			assert.deepStrictEqual([...commands], ['autopilot']);
			assert.strictEqual(getCopilotConfigSlashCommandItems('nope').length, 0);
		});
	});

	suite('resolveCopilotConfigSlashCommandOnSend', () => {
		test('maps commands, sub-args, and strips the token', () => {
			assert.deepStrictEqual(resolveCopilotConfigSlashCommandOnSend('yolo', ''), { applyConfig: { autoApprove: 'autoApprove' }, strippedPrompt: '' });
			assert.deepStrictEqual(resolveCopilotConfigSlashCommandOnSend('autopilot', 'off'), { applyConfig: { mode: 'interactive' }, strippedPrompt: '' });
			assert.deepStrictEqual(resolveCopilotConfigSlashCommandOnSend('autopilot', 'do the thing'), { applyConfig: { mode: 'autopilot' }, strippedPrompt: 'do the thing' });
			// `plan` has no sub-args, so trailing text is forwarded as the prompt.
			assert.deepStrictEqual(resolveCopilotConfigSlashCommandOnSend('plan', 'the feature'), { applyConfig: { mode: 'plan' }, strippedPrompt: 'the feature' });
			assert.strictEqual(resolveCopilotConfigSlashCommandOnSend('notACommand', 'x'), undefined);
		});
	});

	test('isCopilotConfigSlashCommand recognizes config commands only', () => {
		assert.strictEqual(isCopilotConfigSlashCommand('autopilot'), true);
		assert.strictEqual(isCopilotConfigSlashCommand('YOLO'), true);
		assert.strictEqual(isCopilotConfigSlashCommand('rubber-duck'), false);
	});
});
