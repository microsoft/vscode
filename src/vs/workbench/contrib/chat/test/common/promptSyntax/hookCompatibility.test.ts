/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HookType } from '../../../common/promptSyntax/hookSchema.js';
import { parseCopilotHooks, parseHooksFromFile, HookSourceFormat } from '../../../common/promptSyntax/hookCompatibility.js';
import { URI } from '../../../../../../base/common/uri.js';

suite('HookCompatibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseCopilotHooks', () => {
		const workspaceRoot = URI.file('/workspace');
		const userHome = '/home/user';

		suite('basic parsing', () => {
			test('parses simple hook with command', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "pre-tool"' }
						]
					}
				};

				const result = parseCopilotHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.size, 1);
				assert.ok(result.has(HookType.PreToolUse));
				const entry = result.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'echo "pre-tool"');
			});
		});

		suite('invalid inputs', () => {
			test('returns empty result for null json', () => {
				const result = parseCopilotHooks(null, workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});

			test('returns empty result for undefined json', () => {
				const result = parseCopilotHooks(undefined, workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});

			test('returns empty result for missing hooks property', () => {
				const result = parseCopilotHooks({}, workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});
		});
	});

	suite('parseHooksFromFile', () => {
		const workspaceRoot = URI.file('/workspace');
		const userHome = '/home/user';

		test('uses Copilot format for .github/hooks/*.json files', () => {
			const fileUri = URI.file('/workspace/.github/hooks/my-hooks.json');
			const json = {
				hooks: {
					PreToolUse: [
						{ type: 'command', command: 'echo "test"' }
					]
				}
			};

			const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);

			assert.strictEqual(result.format, HookSourceFormat.Copilot);
			assert.strictEqual(result.disabledAllHooks, false);
			assert.strictEqual(result.hooks.size, 1);
		});

		test('uses Claude format for .claude/settings.json files', () => {
			const fileUri = URI.file('/workspace/.claude/settings.json');
			const json = {
				disableAllHooks: true,
				hooks: {
					PreToolUse: [
						{ type: 'command', command: 'echo "test"' }
					]
				}
			};

			const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);

			assert.strictEqual(result.format, HookSourceFormat.Claude);
			assert.strictEqual(result.disabledAllHooks, true);
			assert.strictEqual(result.hooks.size, 0);
		});

		test('disableAllHooks is ignored for Copilot format', () => {
			const fileUri = URI.file('/workspace/.github/hooks/hooks.json');
			const json = {
				disableAllHooks: true,
				hooks: {
					SessionStart: [
						{ type: 'command', command: 'echo "start"' }
					]
				}
			};

			const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);

			// Copilot format does not support disableAllHooks
			assert.strictEqual(result.disabledAllHooks, false);
			assert.strictEqual(result.hooks.size, 1);
		});

		test('disabledAllHooks works for Claude format', () => {
			const fileUri = URI.file('/workspace/.claude/settings.local.json');
			const json = {
				disableAllHooks: true,
				hooks: {
					SessionStart: [
						{ type: 'command', command: 'echo "start"' }
					]
				}
			};

			const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);

			assert.strictEqual(result.disabledAllHooks, true);
			assert.strictEqual(result.hooks.size, 0);
		});
	});
});
