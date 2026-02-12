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

		suite('Claude-style matcher compatibility', () => {
			test('parses Claude-style nested matcher structure', () => {
				// When Claude format is pasted into Copilot hooks file
				const json = {
					hooks: {
						PreToolUse: [
							{
								matcher: 'Bash',
								hooks: [
									{ type: 'command', command: 'echo "from matcher"' }
								]
							}
						]
					}
				};

				const result = parseCopilotHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.size, 1);
				const entry = result.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'echo "from matcher"');
			});

			test('parses Claude-style nested matcher with multiple hooks', () => {
				const json = {
					hooks: {
						PostToolUse: [
							{
								matcher: 'Write',
								hooks: [
									{ type: 'command', command: 'echo "first"' },
									{ type: 'command', command: 'echo "second"' }
								]
							}
						]
					}
				};

				const result = parseCopilotHooks(json, workspaceRoot, userHome);

				const entry = result.get(HookType.PostToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
				assert.strictEqual(entry.hooks[0].command, 'echo "first"');
				assert.strictEqual(entry.hooks[1].command, 'echo "second"');
			});

			test('handles mixed direct and nested matcher entries', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "direct"' },
							{
								matcher: 'Bash',
								hooks: [
									{ type: 'command', command: 'echo "nested"' }
								]
							}
						]
					}
				};

				const result = parseCopilotHooks(json, workspaceRoot, userHome);

				const entry = result.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
				assert.strictEqual(entry.hooks[0].command, 'echo "direct"');
				assert.strictEqual(entry.hooks[1].command, 'echo "nested"');
			});

			test('handles Claude-style hook without type field', () => {
				// Claude allows omitting the type field
				const json = {
					hooks: {
						SessionStart: [
							{ command: 'echo "no type"' }
						]
					}
				};

				const result = parseCopilotHooks(json, workspaceRoot, userHome);

				const entry = result.get(HookType.SessionStart)!;
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'echo "no type"');
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
