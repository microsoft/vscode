/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HookType } from '../../../common/promptSyntax/hookSchema.js';
import { parseClaudeHooks, resolveClaudeHookType, getClaudeHookTypeName } from '../../../common/promptSyntax/hookClaudeCompat.js';
import { URI } from '../../../../../../base/common/uri.js';

suite('HookClaudeCompat', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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

				assert.strictEqual(result.size, 1);
				assert.ok(result.has(HookType.PreToolUse));
				const entry = result.get(HookType.PreToolUse)!;
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

				assert.strictEqual(result.size, 2);
				assert.ok(result.has(HookType.SessionStart));
				assert.ok(result.has(HookType.Stop));
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

				const entry = result.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
				assert.strictEqual(entry.hooks[0].command, 'echo "first"');
				assert.strictEqual(entry.hooks[1].command, 'echo "second"');
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

				const entry = result.get(HookType.PreToolUse)!;
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

				const entry = result.get(HookType.PreToolUse)!;
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

				const entry = result.get(HookType.PreToolUse)!;
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

				const entry = result.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 2);
				assert.strictEqual(entry.hooks[0].command, 'echo "direct"');
				assert.strictEqual(entry.hooks[1].command, 'echo "nested"');
			});
		});

		suite('command without type field', () => {
			test('parses command without explicit type field', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ command: 'echo "no type"' }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks.length, 1);
				assert.strictEqual(entry.hooks[0].command, 'echo "no type"');
			});
		});

		suite('invalid inputs', () => {
			test('returns empty map for null json', () => {
				const result = parseClaudeHooks(null, workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});

			test('returns empty map for undefined json', () => {
				const result = parseClaudeHooks(undefined, workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});

			test('returns empty map for non-object json', () => {
				const result = parseClaudeHooks('string', workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});

			test('returns empty map for missing hooks property', () => {
				const result = parseClaudeHooks({}, workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});

			test('returns empty map for non-object hooks property', () => {
				const result = parseClaudeHooks({ hooks: 'invalid' }, workspaceRoot, userHome);
				assert.strictEqual(result.size, 0);
			});

			test('skips unknown hook types', () => {
				const json = {
					hooks: {
						UnknownType: [{ type: 'command', command: 'echo "test"' }],
						PreToolUse: [{ type: 'command', command: 'echo "known"' }]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.size, 1);
				assert.ok(result.has(HookType.PreToolUse));
			});

			test('skips non-array hook entries', () => {
				const json = {
					hooks: {
						PreToolUse: { type: 'command', command: 'echo "not array"' }
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				assert.strictEqual(result.size, 0);
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

				const entry = result.get(HookType.PreToolUse)!;
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

				const entry = result.get(HookType.PreToolUse)!;
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

				const entry = result.get(HookType.PreToolUse)!;
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

				const entry = result.get(HookType.PreToolUse)!;
				assert.deepStrictEqual(entry.hooks[0].env, { NODE_ENV: 'production' });
			});

			test('preserves timeoutSec', () => {
				const json = {
					hooks: {
						PreToolUse: [
							{ type: 'command', command: 'echo "test"', timeoutSec: 60 }
						]
					}
				};

				const result = parseClaudeHooks(json, workspaceRoot, userHome);

				const entry = result.get(HookType.PreToolUse)!;
				assert.strictEqual(entry.hooks[0].timeoutSec, 60);
			});
		});
	});
});
