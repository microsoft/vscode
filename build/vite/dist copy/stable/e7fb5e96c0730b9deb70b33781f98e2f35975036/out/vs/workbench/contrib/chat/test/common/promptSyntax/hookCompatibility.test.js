/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HookType } from '../../../common/promptSyntax/hookTypes.js';
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
                const entry = result.get(HookType.PreToolUse);
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
                const entry = result.get(HookType.PreToolUse);
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
                const entry = result.get(HookType.PostToolUse);
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
                const entry = result.get(HookType.PreToolUse);
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
                const entry = result.get(HookType.SessionStart);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va0NvbXBhdGliaWxpdHkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tDb21wYXRpYmlsaXR5LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM1SCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFM0QsS0FBSyxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtJQUMvQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7UUFDL0IsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM3QyxNQUFNLFFBQVEsR0FBRyxZQUFZLENBQUM7UUFFOUIsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7WUFDM0IsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtnQkFDNUMsTUFBTSxJQUFJLEdBQUc7b0JBQ1osS0FBSyxFQUFFO3dCQUNOLFVBQVUsRUFBRTs0QkFDWCxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFO3lCQUMvQztxQkFDRDtpQkFDRCxDQUFDO2dCQUVGLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBRWhFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUMzQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUUsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQy9ELENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO1lBQzVCLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7Z0JBQy9DLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwQyxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7Z0JBQ3BELE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwQyxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7Z0JBQzVELE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwQyxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQUNoRCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO2dCQUN6RCx1REFBdUQ7Z0JBQ3ZELE1BQU0sSUFBSSxHQUFHO29CQUNaLEtBQUssRUFBRTt3QkFDTixVQUFVLEVBQUU7NEJBQ1g7Z0NBQ0MsT0FBTyxFQUFFLE1BQU07Z0NBQ2YsS0FBSyxFQUFFO29DQUNOLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUscUJBQXFCLEVBQUU7aUNBQ25EOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNELENBQUM7Z0JBRUYsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFFaEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNuQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUUsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1lBQ25FLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsRUFBRTtnQkFDbkUsTUFBTSxJQUFJLEdBQUc7b0JBQ1osS0FBSyxFQUFFO3dCQUNOLFdBQVcsRUFBRTs0QkFDWjtnQ0FDQyxPQUFPLEVBQUUsT0FBTztnQ0FDaEIsS0FBSyxFQUFFO29DQUNOLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFO29DQUM1QyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRTtpQ0FDN0M7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0QsQ0FBQztnQkFFRixNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUVoRSxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUUsQ0FBQztnQkFDaEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUMsQ0FBQztnQkFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztZQUM3RCxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7Z0JBQzVELE1BQU0sSUFBSSxHQUFHO29CQUNaLEtBQUssRUFBRTt3QkFDTixVQUFVLEVBQUU7NEJBQ1gsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUU7NEJBQzdDO2dDQUNDLE9BQU8sRUFBRSxNQUFNO2dDQUNmLEtBQUssRUFBRTtvQ0FDTixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRTtpQ0FDN0M7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0QsQ0FBQztnQkFFRixNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUVoRSxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUUsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztnQkFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztZQUM3RCxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7Z0JBQ3pELHdDQUF3QztnQkFDeEMsTUFBTSxJQUFJLEdBQUc7b0JBQ1osS0FBSyxFQUFFO3dCQUNOLFlBQVksRUFBRTs0QkFDYixFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRTt5QkFDN0I7cUJBQ0Q7aUJBQ0QsQ0FBQztnQkFFRixNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUVoRSxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUUsQ0FBQztnQkFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzlELENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7UUFDaEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM3QyxNQUFNLFFBQVEsR0FBRyxZQUFZLENBQUM7UUFFOUIsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUMvRCxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLHdDQUF3QyxDQUFDLENBQUM7WUFDbkUsTUFBTSxJQUFJLEdBQUc7Z0JBQ1osS0FBSyxFQUFFO29CQUNOLFVBQVUsRUFBRTt3QkFDWCxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRTtxQkFDM0M7aUJBQ0Q7YUFDRCxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsR0FBRyxFQUFFO1lBQy9ELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsQ0FBQztZQUM3RCxNQUFNLElBQUksR0FBRztnQkFDWixlQUFlLEVBQUUsSUFBSTtnQkFDckIsS0FBSyxFQUFFO29CQUNOLFVBQVUsRUFBRTt3QkFDWCxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRTtxQkFDM0M7aUJBQ0Q7YUFDRCxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1lBQzFELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMscUNBQXFDLENBQUMsQ0FBQztZQUNoRSxNQUFNLElBQUksR0FBRztnQkFDWixlQUFlLEVBQUUsSUFBSTtnQkFDckIsS0FBSyxFQUFFO29CQUNOLFlBQVksRUFBRTt3QkFDYixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRTtxQkFDNUM7aUJBQ0Q7YUFDRCxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFMUUsa0RBQWtEO1lBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1lBQ3JELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUNuRSxNQUFNLElBQUksR0FBRztnQkFDWixlQUFlLEVBQUUsSUFBSTtnQkFDckIsS0FBSyxFQUFFO29CQUNOLFlBQVksRUFBRTt3QkFDYixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRTtxQkFDNUM7aUJBQ0Q7YUFDRCxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==