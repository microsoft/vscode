/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HookType } from '../../../common/promptSyntax/hookSchema.js';
import { parseClaudeHooks, resolveClaudeHookType, getClaudeHookTypeName, extractHookCommandsFromItem } from '../../../common/promptSyntax/hookClaudeCompat.js';
import { getHookSourceFormat, HookSourceFormat, buildNewHookEntry } from '../../../common/promptSyntax/hookCompatibility.js';
import { URI } from '../../../../../../base/common/uri.js';

suite('HookClaudeCompat', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('extractHookCommandsFromItem', () => {
		const workspaceRoot = URI.file('/workspace');
		const userHome = '/home/user';

		test('extracts direct command object', () => {
			const item = { type: 'command', command: 'echo "test"' };

			const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].command, 'echo "test"');
		});

		test('extracts from nested matcher structure', () => {
			const item = {
				matcher: 'Bash',
				hooks: [
					{ type: 'command', command: 'echo "nested"' }
				]
			};

			const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].command, 'echo "nested"');
		});

		test('extracts multiple hooks from matcher structure', () => {
			const item = {
				matcher: 'Write',
				hooks: [
					{ type: 'command', command: 'echo "first"' },
					{ type: 'command', command: 'echo "second"' }
				]
			};

			const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);

			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].command, 'echo "first"');
			assert.strictEqual(result[1].command, 'echo "second"');
		});

		test('handles command without type field (Claude format)', () => {
			const item = { command: 'echo "no type"' };

			const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].command, 'echo "no type"');
		});

		test('handles nested command without type field', () => {
			const item = {
				matcher: 'Bash',
				hooks: [
					{ command: 'echo "no type nested"' }
				]
			};

			const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].command, 'echo "no type nested"');
		});

		test('returns empty array for null item', () => {
			const result = extractHookCommandsFromItem(null, workspaceRoot, userHome);
			assert.strictEqual(result.length, 0);
		});

		test('returns empty array for undefined item', () => {
			const result = extractHookCommandsFromItem(undefined, workspaceRoot, userHome);
			assert.strictEqual(result.length, 0);
		});

		test('returns empty array for invalid type', () => {
			const item = { type: 'script', command: 'echo "wrong type"' };

			const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);

			assert.strictEqual(result.length, 0);
		});
	});

	suite('resolveClaudeHookType', () => {
		test('resolves PreToolUse', () => {
			assert.strictEqual(resolveClaudeHookType('PreToolUse'), HookType.PreToolUse);
		});

		test('resolves UserPromptSubmit', () => {
			assert.strictEqual(resolveClaudeHookType('UserPromptSubmit'), HookType.UserPromptSubmit);
		});

		test('returns undefined for unknown type', () => {
			assert.strictEqual(resolveClaudeHookType('UnknownHook'), undefined);
		});

		test('returns undefined for camelCase (not Claude format)', () => {
			assert.strictEqual(resolveClaudeHookType('preToolUse'), undefined);
		});
	});

	suite('getClaudeHookTypeName', () => {
		test('gets PreToolUse for HookType.PreToolUse', () => {
			assert.strictEqual(getClaudeHookTypeName(HookType.PreToolUse), 'PreToolUse');
		});

		test('gets UserPromptSubmit for HookType.UserPromptSubmit', () => {
			assert.strictEqual(getClaudeHookTypeName(HookType.UserPromptSubmit), 'UserPromptSubmit');
		});
	});

	suite('parseClaudeHooks', () => {
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

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.disabledAllHooks, false);
				assert.strictEqual(result.hooks.size, 1);
				assert.ok(result.hooks.has(HookType.PreToolUse));
				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.originalId, 'PreToolUse');
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'echo "pre-tool"');
			});

			test('parses multiple hook types', () => {
				const json = {
					hooks: {
						SessionStart: [{ type: 'command', command: 'echo "start"' }],
						Stop: [{ type: 'command', command: 'echo "stop"' }]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.hooks.size, 2);
				assert.ok(result.hooks.has(HookType.SessionStart));
				assert.ok(result.hooks.has(HookType.Stop));
			});

			test('parses multiple commands for same hook type', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "first"' },
							{ type: 'command', command: 'echo "second"' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
				assert.strictEqual(entry.hooks[0].command, 'echo "first"');
				assert.strictEqual(entry.hooks[1].command, 'echo "second"');
			});
		});

		suite('disableAllHooks', () => {
			test('returns empty hooks and disabledAllHooks=true when disableAllHooks is true', () => {
				const json = {
					disableAllHooks: true,
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "should be ignored"' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.disabledAllHooks, true);
				assert.strictEqual(result.hooks.size, 0);
			});

			test('parses hooks normally when disableAllHooks is false', () => {
				const json = {
					disableAllHooks: false,
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "should be parsed"' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.disabledAllHooks, false);
				assert.strictEqual(result.hooks.size, 1);
			});

			test('parses hooks normally when disableAllHooks is not present', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "should be parsed"' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.disabledAllHooks, false);
				assert.strictEqual(result.hooks.size, 1);
			});
		});

		suite('nested hooks with matchers', () => {
			test('parses nested hooks with matcher', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{
								matcher: 'Bash',
								hooks: [
									{ type: 'command', command: 'echo "bash hook"' }
								]
							}
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'echo "bash hook"');
			});

			test('parses multiple nested hooks within one matcher', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{
								matcher: 'Bash',
								hooks: [
									{ type: 'command', command: 'echo "first"' },
									{ type: 'command', command: 'echo "second"' }
								]
							}
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
			});

			test('parses multiple matchers for same hook type', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{
								matcher: 'Bash',
								hooks: [{ type: 'command', command: 'echo "bash"' }]
							},
							{
								matcher: 'Write',
								hooks: [{ type: 'command', command: 'echo "write"' }]
							}
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
				assert.strictEqual(entry.hooks[0].command, 'echo "bash"');
				assert.strictEqual(entry.hooks[1].command, 'echo "write"');
			});

			test('parses mix of direct and nested hooks', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "direct"' },
							{
								matcher: 'Bash',
								hooks: [{ type: 'command', command: 'echo "nested"' }]
							}
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
				assert.strictEqual(entry.hooks[0].command, 'echo "direct"');
				assert.strictEqual(entry.hooks[1].command, 'echo "nested"');
			});
		});

		suite('invalid inputs', () => {
			test('returns empty map for null json', () => {
				const result = parseClaudeHooks(null, workspaceRoot, userHome);
				assert.strictEqual(result.hooks.size, 0);
				assert.strictEqual(result.disabledAllHooks, false);
			});

			test('returns empty map for undefined json', () => {
				const result = parseClaudeHooks(undefined, workspaceRoot, userHome);
				assert.strictEqual(result.hooks.size, 0);
				assert.strictEqual(result.disabledAllHooks, false);
			});

			test('returns empty map for non-object json', () => {
				const result = parseClaudeHooks('string', workspaceRoot, userHome);
				assert.strictEqual(result.hooks.size, 0);
				assert.strictEqual(result.disabledAllHooks, false);
			});

			test('returns empty map for missing hooks property', () => {
				const result = parseClaudeHooks({}, workspaceRoot, userHome);
				assert.strictEqual(result.hooks.size, 0);
				assert.strictEqual(result.disabledAllHooks, false);
			});

			test('returns empty map for non-object hooks property', () => {
				const result = parseClaudeHooks({ hooks: 'invalid' }, workspaceRoot, userHome);
				assert.strictEqual(result.hooks.size, 0);
				assert.strictEqual(result.disabledAllHooks, false);
			});

			test('skips unknown hook types', () => {
				const json = {
					hooks: {
						UnknownType: [{ type: 'command', command: 'echo "test"' }],
						PreToolUse: [{ type: 'command', command: 'echo "known"' }]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.hooks.size, 1);
				assert.ok(result.hooks.has(HookType.PreToolUse));
			});

			test('skips non-array hook entries', () => {
				const json = {
					hooks: {
						PreToolUse: { type: 'command', command: 'echo "not array"' }
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.hooks.size, 0);
			});

			test('skips invalid command entries', () => {
				const json = {
					hooks: {
						PreToolUse: [
							'invalid string',
							null,
							{ type: 'command', command: 'valid' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'valid');
			});

			test('skips commands with wrong type', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'script', command: 'invalid type' },
							{ type: 'command', command: 'valid' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'valid');
			});
		});

		suite('cwd and env resolution', () => {
			test('resolves cwd relative to workspace', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "test"', cwd: 'src' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.deepStrictEqual(entry.hooks[0].cwd, URI.file('/workspace/src'));
			});

			test('preserves env variables', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "test"', env: { NODE_ENV: 'production' } }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.deepStrictEqual(entry.hooks[0].env, { NODE_ENV: 'production' });
			});

			test('preserves timeout', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "test"', timeout: 60 }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks[0].timeout, 60);
			});

			test('supports Claude timeout alias', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "test"', timeout: 1 }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.hooks.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks[0].timeout, 1);
			});
		});
	});
});

suite('HookSourceFormat', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getHookSourceFormat', () => {
		test('detects Claude format for .claude/settings.json', () => {
			assert.strictEqual(getHookSourceFormat(URI.file('/workspace/.claude/settings.json')), HookSourceFormat.Claude);
		});

		test('detects Claude format for .claude/settings.local.json', () => {
			assert.strictEqual(getHookSourceFormat(URI.file('/workspace/.claude/settings.local.json')), HookSourceFormat.Claude);
		});

		test('detects Claude format for ~/.claude/settings.json', () => {
			assert.strictEqual(getHookSourceFormat(URI.file('/home/user/.claude/settings.json')), HookSourceFormat.Claude);
		});

		test('returns Copilot format for .github/hooks/hooks.json', () => {
			assert.strictEqual(getHookSourceFormat(URI.file('/workspace/.github/hooks/hooks.json')), HookSourceFormat.Copilot);
		});

		test('returns Copilot format for arbitrary .json file', () => {
			assert.strictEqual(getHookSourceFormat(URI.file('/workspace/.github/hooks/my-hooks.json')), HookSourceFormat.Copilot);
		});

		test('returns Copilot format for settings.json not inside .claude', () => {
			assert.strictEqual(getHookSourceFormat(URI.file('/workspace/.vscode/settings.json')), HookSourceFormat.Copilot);
		});
	});

	suite('buildNewHookEntry', () => {
		test('builds Copilot format entry', () => {
			assert.deepStrictEqual(buildNewHookEntry(HookSourceFormat.Copilot), {
				type: 'command',
				command: ''
			});
		});

		test('builds Claude format entry with matcher wrapper', () => {
			assert.deepStrictEqual(buildNewHookEntry(HookSourceFormat.Claude), {
				matcher: '',
				hooks: [{
					type: 'command',
					command: ''
				}]
			});
		});

		test('Claude format entry serializes correctly in JSON', () => {
			const entry = buildNewHookEntry(HookSourceFormat.Claude);
			const hooksContent = {
				hooks: {
					SubagentStart: [entry]
				}
			};
			const json = JSON.stringify(hooksContent, null, '\t');
			const parsed = JSON.parse(json);
			assert.deepStrictEqual(parsed.hooks.SubagentStart[0], {
				matcher: '',
				hooks: [{
					type: 'command',
					command: ''
				}]
			});
		});

		test('Copilot format entry serializes correctly in JSON', () => {
			const entry = buildNewHookEntry(HookSourceFormat.Copilot);
			const hooksContent = {
				hooks: {
					SubagentStart: [entry]
				}
			};
			const json = JSON.stringify(hooksContent, null, '\t');
			const parsed = JSON.parse(json);
			assert.deepStrictEqual(parsed.hooks.SubagentStart[0], {
				type: 'command',
				command: ''
			});
		});

		test('Claude format round-trips through parseClaudeHooks', () => {
			const entry = buildNewHookEntry(HookSourceFormat.Claude);
			const hooksContent = {
				hooks: {
					PreToolUse: [entry]
				}
			};

			const result = parseClaudeHooks(hooksContent, URI.file('/workspace'), '/home/user');
			assert.strictEqual(result.hooks.size, 1);
			assert.ok(result.hooks.has(HookType.PreToolUse));
			const hooks = result.hooks.get(HookType.PreToolUse)!;
			assert.strictEqual(hooks.hooks.length, 1);
			// Empty command string is falsy and gets omitted by resolveHookCommand
			assert.strictEqual(hooks.hooks[0].command, undefined);
		});
	});
});
