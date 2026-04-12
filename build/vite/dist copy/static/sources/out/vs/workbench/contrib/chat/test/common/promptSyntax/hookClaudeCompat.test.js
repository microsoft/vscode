/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HookType } from '../../../common/promptSyntax/hookTypes.js';
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
                const entry = result.hooks.get(HookType.PreToolUse);
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
            const hooks = result.hooks.get(HookType.PreToolUse);
            assert.strictEqual(hooks.hooks.length, 1);
            // Empty command string is falsy and gets omitted by resolveHookCommand
            assert.strictEqual(hooks.hooks[0].command, undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va0NsYXVkZUNvbXBhdC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NsYXVkZUNvbXBhdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLDJCQUEyQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDL0osT0FBTyxFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0gsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTNELEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7SUFDOUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1FBQ3pDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0MsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDO1FBRTlCLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7WUFDM0MsTUFBTSxJQUFJLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsQ0FBQztZQUV6RCxNQUFNLE1BQU0sR0FBRywyQkFBMkIsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxD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