/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { resolveHookCommand, resolveEffectiveCommand, formatHookCommandLabel, parseSubagentHooksFromYaml } from '../../../common/promptSyntax/hookSchema.js';
import { URI } from '../../../../../../base/common/uri.js';
import { HookType } from '../../../common/promptSyntax/hookTypes.js';
import { Range } from '../../../../../../editor/common/core/range.js';
suite('HookSchema', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('resolveHookCommand', () => {
        const workspaceRoot = URI.file('/workspace');
        const userHome = '/home/user';
        suite('command property', () => {
            test('resolves basic command', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'echo hello'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'echo hello',
                    cwd: workspaceRoot
                });
            });
            test('resolves command with all optional properties', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: './scripts/validate.sh',
                    cwd: 'src',
                    env: { NODE_ENV: 'test' },
                    timeout: 60
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: './scripts/validate.sh',
                    cwd: URI.file('/workspace/src'),
                    env: { NODE_ENV: 'test' },
                    timeout: 60
                });
            });
            test('empty command returns object without command', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: ''
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    cwd: workspaceRoot
                });
            });
        });
        suite('bash legacy mapping', () => {
            test('bash maps to linux and osx', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    bash: 'echo "hello world"'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    linux: 'echo "hello world"',
                    osx: 'echo "hello world"',
                    linuxSource: 'bash',
                    osxSource: 'bash',
                    cwd: workspaceRoot
                });
            });
            test('bash with cwd and env', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    bash: './test.sh',
                    cwd: 'scripts',
                    env: { DEBUG: '1' }
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    linux: './test.sh',
                    osx: './test.sh',
                    linuxSource: 'bash',
                    osxSource: 'bash',
                    cwd: URI.file('/workspace/scripts'),
                    env: { DEBUG: '1' }
                });
            });
            test('empty bash returns object without platform overrides', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    bash: ''
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    cwd: workspaceRoot
                });
            });
        });
        suite('powershell legacy mapping', () => {
            test('powershell maps to windows', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    powershell: 'Write-Host "hello"'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    windows: 'Write-Host "hello"',
                    windowsSource: 'powershell',
                    cwd: workspaceRoot
                });
            });
            test('powershell with timeout', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    powershell: 'Get-Process',
                    timeout: 30
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    windows: 'Get-Process',
                    windowsSource: 'powershell',
                    cwd: workspaceRoot,
                    timeout: 30
                });
            });
            test('empty powershell returns object without windows', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    powershell: ''
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    cwd: workspaceRoot
                });
            });
        });
        suite('multiple properties specified', () => {
            test('preserves command with bash mapped to linux/osx', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'direct-command',
                    bash: 'bash-script.sh'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'direct-command',
                    linux: 'bash-script.sh',
                    osx: 'bash-script.sh',
                    linuxSource: 'bash',
                    osxSource: 'bash',
                    cwd: workspaceRoot
                });
            });
            test('preserves command with powershell mapped to windows', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'direct-command',
                    powershell: 'ps-script.ps1'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'direct-command',
                    windows: 'ps-script.ps1',
                    windowsSource: 'powershell',
                    cwd: workspaceRoot
                });
            });
            test('bash and powershell map to all platforms', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    bash: 'bash-script.sh',
                    powershell: 'ps-script.ps1'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    windows: 'ps-script.ps1',
                    linux: 'bash-script.sh',
                    osx: 'bash-script.sh',
                    windowsSource: 'powershell',
                    linuxSource: 'bash',
                    osxSource: 'bash',
                    cwd: workspaceRoot
                });
            });
        });
        suite('cwd resolution', () => {
            test('cwd is not resolved when no workspace root', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'echo hello',
                    cwd: 'src'
                }, undefined, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'echo hello'
                });
            });
            test('cwd is resolved relative to workspace root', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'echo hello',
                    cwd: 'nested/path'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'echo hello',
                    cwd: URI.file('/workspace/nested/path')
                });
            });
        });
        suite('invalid inputs', () => {
            test('wrong type returns undefined', () => {
                const result = resolveHookCommand({
                    type: 'script',
                    command: 'echo hello'
                }, workspaceRoot, userHome);
                assert.strictEqual(result, undefined);
            });
            test('missing type returns undefined', () => {
                const result = resolveHookCommand({
                    command: 'echo hello'
                }, workspaceRoot, userHome);
                assert.strictEqual(result, undefined);
            });
            test('no command returns object with just type and cwd', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    cwd: '/workspace'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    cwd: URI.file('/workspace')
                });
            });
            test('ignores non-string cwd', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'echo hello',
                    cwd: 123
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'echo hello',
                    cwd: workspaceRoot
                });
            });
            test('ignores non-object env', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'echo hello',
                    env: 'invalid'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'echo hello',
                    cwd: workspaceRoot
                });
            });
            test('ignores non-number timeout', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'echo hello',
                    timeout: '30'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'echo hello',
                    cwd: workspaceRoot
                });
            });
        });
        suite('platform-specific overrides', () => {
            test('preserves windows override as string', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'default-command',
                    windows: 'win-command'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'default-command',
                    windows: 'win-command',
                    windowsSource: 'windows',
                    cwd: workspaceRoot
                });
            });
            test('preserves linux override as string', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'default-command',
                    linux: 'linux-command'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'default-command',
                    linux: 'linux-command',
                    linuxSource: 'linux',
                    cwd: workspaceRoot
                });
            });
            test('preserves osx override as string', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'default-command',
                    osx: 'osx-command'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'default-command',
                    osx: 'osx-command',
                    osxSource: 'osx',
                    cwd: workspaceRoot
                });
            });
            test('preserves all platform overrides', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'default-command',
                    windows: 'win-command',
                    linux: 'linux-command',
                    osx: 'osx-command'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'default-command',
                    windows: 'win-command',
                    linux: 'linux-command',
                    osx: 'osx-command',
                    windowsSource: 'windows',
                    linuxSource: 'linux',
                    osxSource: 'osx',
                    cwd: workspaceRoot
                });
            });
            test('explicit platform override takes precedence over bash/powershell mapping', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    bash: 'default.sh',
                    linux: 'explicit-linux.sh'
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    linux: 'explicit-linux.sh',
                    osx: 'default.sh',
                    linuxSource: 'linux',
                    osxSource: 'bash',
                    cwd: workspaceRoot
                });
            });
            test('ignores empty platform override', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'default-command',
                    windows: ''
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'default-command',
                    cwd: workspaceRoot
                });
            });
            test('ignores non-string platform override', () => {
                const result = resolveHookCommand({
                    type: 'command',
                    command: 'default-command',
                    windows: { command: 'invalid' }
                }, workspaceRoot, userHome);
                assert.deepStrictEqual(result, {
                    type: 'command',
                    command: 'default-command',
                    cwd: workspaceRoot
                });
            });
        });
    });
    suite('resolveEffectiveCommand', () => {
        test('returns base command when no platform override', () => {
            const hook = {
                type: 'command',
                command: 'default-command'
            };
            assert.strictEqual(resolveEffectiveCommand(hook, 1 /* OperatingSystem.Windows */), 'default-command');
            assert.strictEqual(resolveEffectiveCommand(hook, 2 /* OperatingSystem.Macintosh */), 'default-command');
            assert.strictEqual(resolveEffectiveCommand(hook, 3 /* OperatingSystem.Linux */), 'default-command');
        });
        test('applies platform override for each platform', () => {
            const hook = {
                type: 'command',
                command: 'default-command',
                windows: 'win-command',
                linux: 'linux-command',
                osx: 'osx-command'
            };
            assert.strictEqual(resolveEffectiveCommand(hook, 1 /* OperatingSystem.Windows */), 'win-command');
            assert.strictEqual(resolveEffectiveCommand(hook, 2 /* OperatingSystem.Macintosh */), 'osx-command');
            assert.strictEqual(resolveEffectiveCommand(hook, 3 /* OperatingSystem.Linux */), 'linux-command');
        });
        test('falls back to command when no platform-specific override', () => {
            const hook = {
                type: 'command',
                command: 'default-command'
            };
            assert.strictEqual(resolveEffectiveCommand(hook, 1 /* OperatingSystem.Windows */), 'default-command');
        });
        test('returns undefined when no command at all', () => {
            const hook = {
                type: 'command'
            };
            assert.strictEqual(resolveEffectiveCommand(hook, 1 /* OperatingSystem.Windows */), undefined);
        });
    });
    suite('formatHookCommandLabel', () => {
        test('formats command when present (no platform override)', () => {
            const hook = {
                type: 'command',
                command: 'echo hello'
            };
            // No platform badge when using default command
            assert.strictEqual(formatHookCommandLabel(hook, 1 /* OperatingSystem.Windows */), 'echo hello');
            assert.strictEqual(formatHookCommandLabel(hook, 2 /* OperatingSystem.Macintosh */), 'echo hello');
            assert.strictEqual(formatHookCommandLabel(hook, 3 /* OperatingSystem.Linux */), 'echo hello');
        });
        test('returns empty string when no command', () => {
            const hook = {
                type: 'command'
            };
            assert.strictEqual(formatHookCommandLabel(hook, 1 /* OperatingSystem.Windows */), '');
        });
        test('applies platform override for display', () => {
            const hook = {
                type: 'command',
                command: 'default-command',
                windows: 'win-command',
                linux: 'linux-command',
                osx: 'osx-command'
            };
            // Should resolve to platform-specific command
            assert.strictEqual(formatHookCommandLabel(hook, 1 /* OperatingSystem.Windows */), 'win-command');
            assert.strictEqual(formatHookCommandLabel(hook, 2 /* OperatingSystem.Macintosh */), 'osx-command');
            assert.strictEqual(formatHookCommandLabel(hook, 3 /* OperatingSystem.Linux */), 'linux-command');
        });
        test('no platform badge when falling back to default command', () => {
            const hook = {
                type: 'command',
                command: 'default-command'
                // No platform-specific overrides
            };
            // Should not include badge when using default command
            assert.strictEqual(formatHookCommandLabel(hook, 1 /* OperatingSystem.Windows */), 'default-command');
        });
    });
    suite('parseSubagentHooksFromYaml', () => {
        const workspaceRoot = URI.file('/workspace');
        const userHome = '/home/user';
        const dummyRange = new Range(1, 1, 1, 1);
        function makeScalar(value) {
            return { type: 'scalar', value, range: dummyRange, format: 'none' };
        }
        function makeMap(entries) {
            const properties = Object.entries(entries).map(([key, value]) => ({
                key: makeScalar(key),
                value,
            }));
            return { type: 'map', properties, range: dummyRange };
        }
        function makeSequence(items) {
            return { type: 'sequence', items, range: dummyRange };
        }
        test('parses direct command format (without matcher)', () => {
            // hooks:
            //   PreToolUse:
            //     - type: command
            //       command: "./scripts/validate.sh"
            const hooksMap = makeMap({
                'PreToolUse': makeSequence([
                    makeMap({
                        'type': makeScalar('command'),
                        'command': makeScalar('./scripts/validate.sh'),
                    }),
                ]),
            });
            const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
            assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
            assert.strictEqual(result[HookType.PreToolUse][0].command, './scripts/validate.sh');
        });
        test('parses Claude format (with matcher)', () => {
            // hooks:
            //   PreToolUse:
            //     - matcher: "Bash"
            //       hooks:
            //         - type: command
            //           command: "./scripts/validate-readonly.sh"
            const hooksMap = makeMap({
                'PreToolUse': makeSequence([
                    makeMap({
                        'matcher': makeScalar('Bash'),
                        'hooks': makeSequence([
                            makeMap({
                                'type': makeScalar('command'),
                                'command': makeScalar('./scripts/validate-readonly.sh'),
                            }),
                        ]),
                    }),
                ]),
            });
            const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
            assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
            assert.strictEqual(result[HookType.PreToolUse][0].command, './scripts/validate-readonly.sh');
        });
        test('parses multiple hook types', () => {
            const hooksMap = makeMap({
                'PreToolUse': makeSequence([
                    makeMap({
                        'type': makeScalar('command'),
                        'command': makeScalar('./scripts/pre.sh'),
                    }),
                ]),
                'PostToolUse': makeSequence([
                    makeMap({
                        'matcher': makeScalar('Edit|Write'),
                        'hooks': makeSequence([
                            makeMap({
                                'type': makeScalar('command'),
                                'command': makeScalar('./scripts/lint.sh'),
                            }),
                        ]),
                    }),
                ]),
            });
            const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
            assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
            assert.strictEqual(result[HookType.PreToolUse][0].command, './scripts/pre.sh');
            assert.strictEqual(result[HookType.PostToolUse]?.length, 1);
            assert.strictEqual(result[HookType.PostToolUse][0].command, './scripts/lint.sh');
        });
        test('skips unknown hook types', () => {
            const hooksMap = makeMap({
                'UnknownHook': makeSequence([
                    makeMap({
                        'type': makeScalar('command'),
                        'command': makeScalar('echo "ignored"'),
                    }),
                ]),
            });
            const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
            assert.strictEqual(result[HookType.PreToolUse], undefined);
            assert.strictEqual(result[HookType.PostToolUse], undefined);
        });
        test('handles command without type field', () => {
            const hooksMap = makeMap({
                'PreToolUse': makeSequence([
                    makeMap({
                        'command': makeScalar('./scripts/validate.sh'),
                    }),
                ]),
            });
            const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
            assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
            assert.strictEqual(result[HookType.PreToolUse][0].command, './scripts/validate.sh');
        });
        test('resolves cwd relative to workspace', () => {
            const hooksMap = makeMap({
                'SessionStart': makeSequence([
                    makeMap({
                        'type': makeScalar('command'),
                        'command': makeScalar('echo "start"'),
                        'cwd': makeScalar('src'),
                    }),
                ]),
            });
            const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
            assert.strictEqual(result[HookType.SessionStart]?.length, 1);
            assert.deepStrictEqual(result[HookType.SessionStart][0].cwd, URI.file('/workspace/src'));
        });
        test('skips non-sequence hook values', () => {
            const hooksMap = makeMap({
                'PreToolUse': makeScalar('not-a-sequence'),
            });
            const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
            assert.strictEqual(result[HookType.PreToolUse], undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va1NjaGVtYS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1NjaGVtYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLEVBQWdCLDBCQUEwQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0ssT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFdEUsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7SUFDeEIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO1FBQ2hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0MsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDO1FBRTlCLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7WUFDOUIsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtnQkFDbkMsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUM7b0JBQ2pDLElBQUksRUFBRSxTQUFTO29CQUNmLE9BQU8sRUFBRSxZQUFZO2lCQUNyQixFQUFFLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDNUIsTUFBTSxDQUFDLGVBQWUs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