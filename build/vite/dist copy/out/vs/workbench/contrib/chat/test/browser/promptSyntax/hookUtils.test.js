/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { findHookCommandInYaml, findHookCommandSelection } from '../../../browser/promptSyntax/hookUtils.js';
import { buildNewHookEntry, HookSourceFormat } from '../../../common/promptSyntax/hookCompatibility.js';
/**
 * Helper to extract the selected text from content using a selection range.
 */
function getSelectedText(content, selection) {
    const lines = content.split('\n');
    if (selection.startLineNumber === selection.endLineNumber) {
        return lines[selection.startLineNumber - 1].substring(selection.startColumn - 1, selection.endColumn - 1);
    }
    // Multi-line selection
    const result = [];
    result.push(lines[selection.startLineNumber - 1].substring(selection.startColumn - 1));
    for (let i = selection.startLineNumber; i < selection.endLineNumber - 1; i++) {
        result.push(lines[i]);
    }
    result.push(lines[selection.endLineNumber - 1].substring(0, selection.endColumn - 1));
    return result.join('\n');
}
suite('hookUtils', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('findHookCommandSelection', () => {
        suite('simple format', () => {
            const simpleFormat = `{
	"hooks": {
		"SessionStart": [
			{
				"type": "command",
				"command": "echo first"
			},
			{
				"type": "command",
				"command": "echo second"
			}
		],
		"UserPromptSubmit": [
			{
				"type": "command",
				"command": "echo foo > test.derp"
			}
		]
	}
}`;
            test('finds first command in SessionStart', () => {
                const result = findHookCommandSelection(simpleFormat, 'SessionStart', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(simpleFormat, result), 'echo first');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 17,
                    endLineNumber: 6,
                    endColumn: 27
                });
            });
            test('finds second command in SessionStart', () => {
                const result = findHookCommandSelection(simpleFormat, 'SessionStart', 1, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(simpleFormat, result), 'echo second');
                assert.deepStrictEqual(result, {
                    startLineNumber: 10,
                    startColumn: 17,
                    endLineNumber: 10,
                    endColumn: 28
                });
            });
            test('finds command in UserPromptSubmit', () => {
                const result = findHookCommandSelection(simpleFormat, 'UserPromptSubmit', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(simpleFormat, result), 'echo foo > test.derp');
                assert.deepStrictEqual(result, {
                    startLineNumber: 16,
                    startColumn: 17,
                    endLineNumber: 16,
                    endColumn: 37
                });
            });
            test('returns undefined for out of bounds index', () => {
                const result = findHookCommandSelection(simpleFormat, 'SessionStart', 5, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined for non-existent hook type', () => {
                const result = findHookCommandSelection(simpleFormat, 'nonExistent', 0, 'command');
                assert.strictEqual(result, undefined);
            });
        });
        suite('nested matcher format', () => {
            const nestedFormat = `{
	"forceLoginMethod": "console",
	"hooks": {
		"UserPromptSubmit": [
			{
				"matcher": "",
				"hooks": [
					{
						"type": "command",
						"command": "echo 'foobarbaz5' > ~/foobarbaz.txt"
					}
				]
			}
		]
	}
}`;
            test('finds command inside nested hooks', () => {
                const result = findHookCommandSelection(nestedFormat, 'UserPromptSubmit', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(nestedFormat, result), 'echo \'foobarbaz5\' > ~/foobarbaz.txt');
                assert.deepStrictEqual(result, {
                    startLineNumber: 10,
                    startColumn: 19,
                    endLineNumber: 10,
                    endColumn: 54
                });
            });
            test('returns undefined for non-existent field name', () => {
                const result = findHookCommandSelection(nestedFormat, 'UserPromptSubmit', 0, 'bash');
                assert.strictEqual(result, undefined);
            });
        });
        suite('mixed format with multiple nested hooks', () => {
            const mixedFormat = `{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "edit_file",
				"hooks": [
					{
						"type": "command",
						"command": "first nested"
					},
					{
						"type": "command",
						"command": "second nested"
					}
				]
			},
			{
				"type": "command",
				"command": "simple after nested"
			}
		]
	}
}`;
            test('finds first command in first nested hooks array', () => {
                const result = findHookCommandSelection(mixedFormat, 'PreToolUse', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(mixedFormat, result), 'first nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 9,
                    startColumn: 19,
                    endLineNumber: 9,
                    endColumn: 31
                });
            });
            test('finds second command in first nested hooks array', () => {
                const result = findHookCommandSelection(mixedFormat, 'PreToolUse', 1, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(mixedFormat, result), 'second nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 13,
                    startColumn: 19,
                    endLineNumber: 13,
                    endColumn: 32
                });
            });
            test('finds simple command after nested structure', () => {
                const result = findHookCommandSelection(mixedFormat, 'PreToolUse', 2, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(mixedFormat, result), 'simple after nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 19,
                    startColumn: 17,
                    endLineNumber: 19,
                    endColumn: 36
                });
            });
        });
        suite('bash and powershell fields', () => {
            const platformSpecificFormat = `{
	"hooks": {
		"SessionStart": [
			{
				"type": "command",
				"bash": "echo hello from bash",
				"powershell": "Write-Host hello"
			}
		]
	}
}`;
            test('finds bash field', () => {
                const result = findHookCommandSelection(platformSpecificFormat, 'SessionStart', 0, 'bash');
                assert.ok(result);
                assert.strictEqual(getSelectedText(platformSpecificFormat, result), 'echo hello from bash');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 14,
                    endLineNumber: 6,
                    endColumn: 34
                });
            });
            test('finds powershell field', () => {
                const result = findHookCommandSelection(platformSpecificFormat, 'SessionStart', 0, 'powershell');
                assert.ok(result);
                assert.strictEqual(getSelectedText(platformSpecificFormat, result), 'Write-Host hello');
                assert.deepStrictEqual(result, {
                    startLineNumber: 7,
                    startColumn: 20,
                    endLineNumber: 7,
                    endColumn: 36
                });
            });
        });
        suite('edge cases', () => {
            test('returns undefined for empty content', () => {
                const result = findHookCommandSelection('', 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined for invalid JSON', () => {
                const result = findHookCommandSelection('{ invalid json }', 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined when hooks key is missing', () => {
                const content = '{ "other": 1 }';
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined when hook type array is empty', () => {
                const content = '{ "hooks": { "sessionStart": [] } }';
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined when hook item is not an object', () => {
                const content = '{ "hooks": { "sessionStart": ["not an object"] } }';
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('handles empty command string', () => {
                const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": ""
			}
		]
	}
}`;
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(content, result), '');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 17,
                    endLineNumber: 6,
                    endColumn: 17
                });
            });
            test('handles multiline command value', () => {
                // JSON strings can contain escaped newlines
                const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "line1\\nline2"
			}
		]
	}
}`;
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(content, result), 'line1\\nline2');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 17,
                    endLineNumber: 6,
                    endColumn: 29
                });
            });
        });
        suite('nested matcher with empty hooks array', () => {
            const emptyNestedHooks = `{
	"hooks": {
		"UserPromptSubmit": [
			{
				"matcher": "some-pattern",
				"hooks": []
			},
			{
				"type": "command",
				"command": "after empty nested"
			}
		]
	}
}`;
            test('skips empty nested hooks and finds subsequent command', () => {
                const result = findHookCommandSelection(emptyNestedHooks, 'UserPromptSubmit', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(emptyNestedHooks, result), 'after empty nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 10,
                    startColumn: 17,
                    endLineNumber: 10,
                    endColumn: 35
                });
            });
        });
    });
    suite('findHookCommandSelection - copilotCLICompat', () => {
        suite('simple format', () => {
            const simpleFormat = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "echo first"
			},
			{
				"type": "command",
				"command": "echo second"
			}
		],
		"userPromptSubmitted": [
			{
				"type": "command",
				"command": "echo foo > test.derp"
			}
		]
	}
}`;
            test('finds first command in sessionStart', () => {
                const result = findHookCommandSelection(simpleFormat, 'sessionStart', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(simpleFormat, result), 'echo first');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 17,
                    endLineNumber: 6,
                    endColumn: 27
                });
            });
            test('finds second command in sessionStart', () => {
                const result = findHookCommandSelection(simpleFormat, 'sessionStart', 1, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(simpleFormat, result), 'echo second');
                assert.deepStrictEqual(result, {
                    startLineNumber: 10,
                    startColumn: 17,
                    endLineNumber: 10,
                    endColumn: 28
                });
            });
            test('finds command in userPromptSubmitted', () => {
                const result = findHookCommandSelection(simpleFormat, 'userPromptSubmitted', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(simpleFormat, result), 'echo foo > test.derp');
                assert.deepStrictEqual(result, {
                    startLineNumber: 16,
                    startColumn: 17,
                    endLineNumber: 16,
                    endColumn: 37
                });
            });
            test('returns undefined for out of bounds index', () => {
                const result = findHookCommandSelection(simpleFormat, 'sessionStart', 5, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined for non-existent hook type', () => {
                const result = findHookCommandSelection(simpleFormat, 'nonExistent', 0, 'command');
                assert.strictEqual(result, undefined);
            });
        });
        suite('nested matcher format', () => {
            const nestedFormat = `{
	"forceLoginMethod": "console",
	"hooks": {
		"userPromptSubmitted": [
			{
				"matcher": "",
				"hooks": [
					{
						"type": "command",
						"command": "echo 'foobarbaz5' > ~/foobarbaz.txt"
					}
				]
			}
		]
	}
}`;
            test('finds command inside nested hooks', () => {
                const result = findHookCommandSelection(nestedFormat, 'userPromptSubmitted', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(nestedFormat, result), 'echo \'foobarbaz5\' > ~/foobarbaz.txt');
                assert.deepStrictEqual(result, {
                    startLineNumber: 10,
                    startColumn: 19,
                    endLineNumber: 10,
                    endColumn: 54
                });
            });
            test('returns undefined for non-existent field name', () => {
                const result = findHookCommandSelection(nestedFormat, 'userPromptSubmitted', 0, 'bash');
                assert.strictEqual(result, undefined);
            });
        });
        suite('mixed format with multiple nested hooks', () => {
            const mixedFormat = `{
	"hooks": {
		"preToolUse": [
			{
				"matcher": "edit_file",
				"hooks": [
					{
						"type": "command",
						"command": "first nested"
					},
					{
						"type": "command",
						"command": "second nested"
					}
				]
			},
			{
				"type": "command",
				"command": "simple after nested"
			}
		]
	}
}`;
            test('finds first command in first nested hooks array', () => {
                const result = findHookCommandSelection(mixedFormat, 'preToolUse', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(mixedFormat, result), 'first nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 9,
                    startColumn: 19,
                    endLineNumber: 9,
                    endColumn: 31
                });
            });
            test('finds second command in first nested hooks array', () => {
                const result = findHookCommandSelection(mixedFormat, 'preToolUse', 1, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(mixedFormat, result), 'second nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 13,
                    startColumn: 19,
                    endLineNumber: 13,
                    endColumn: 32
                });
            });
            test('finds simple command after nested structure', () => {
                const result = findHookCommandSelection(mixedFormat, 'preToolUse', 2, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(mixedFormat, result), 'simple after nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 19,
                    startColumn: 17,
                    endLineNumber: 19,
                    endColumn: 36
                });
            });
        });
        suite('bash and powershell fields', () => {
            const platformSpecificFormat = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"bash": "echo hello from bash",
				"powershell": "Write-Host hello"
			}
		]
	}
}`;
            test('finds bash field', () => {
                const result = findHookCommandSelection(platformSpecificFormat, 'sessionStart', 0, 'bash');
                assert.ok(result);
                assert.strictEqual(getSelectedText(platformSpecificFormat, result), 'echo hello from bash');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 14,
                    endLineNumber: 6,
                    endColumn: 34
                });
            });
            test('finds powershell field', () => {
                const result = findHookCommandSelection(platformSpecificFormat, 'sessionStart', 0, 'powershell');
                assert.ok(result);
                assert.strictEqual(getSelectedText(platformSpecificFormat, result), 'Write-Host hello');
                assert.deepStrictEqual(result, {
                    startLineNumber: 7,
                    startColumn: 20,
                    endLineNumber: 7,
                    endColumn: 36
                });
            });
        });
        suite('edge cases', () => {
            test('returns undefined for empty content', () => {
                const result = findHookCommandSelection('', 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined for invalid JSON', () => {
                const result = findHookCommandSelection('{ invalid json }', 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined when hooks key is missing', () => {
                const content = '{ "other": 1 }';
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined when hook type array is empty', () => {
                const content = '{ "hooks": { "sessionStart": [] } }';
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('returns undefined when hook item is not an object', () => {
                const content = '{ "hooks": { "sessionStart": ["not an object"] } }';
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.strictEqual(result, undefined);
            });
            test('handles empty command string', () => {
                const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": ""
			}
		]
	}
}`;
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(content, result), '');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 17,
                    endLineNumber: 6,
                    endColumn: 17
                });
            });
            test('handles multiline command value', () => {
                // JSON strings can contain escaped newlines
                const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "line1\\nline2"
			}
		]
	}
}`;
                const result = findHookCommandSelection(content, 'sessionStart', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(content, result), 'line1\\nline2');
                assert.deepStrictEqual(result, {
                    startLineNumber: 6,
                    startColumn: 17,
                    endLineNumber: 6,
                    endColumn: 29
                });
            });
        });
        suite('nested matcher with empty hooks array', () => {
            const emptyNestedHooks = `{
	"hooks": {
		"userPromptSubmitted": [
			{
				"matcher": "some-pattern",
				"hooks": []
			},
			{
				"type": "command",
				"command": "after empty nested"
			}
		]
	}
}`;
            test('skips empty nested hooks and finds subsequent command', () => {
                const result = findHookCommandSelection(emptyNestedHooks, 'userPromptSubmitted', 0, 'command');
                assert.ok(result);
                assert.strictEqual(getSelectedText(emptyNestedHooks, result), 'after empty nested');
                assert.deepStrictEqual(result, {
                    startLineNumber: 10,
                    startColumn: 17,
                    endLineNumber: 10,
                    endColumn: 35
                });
            });
        });
    });
    suite('findHookCommandSelection with buildNewHookEntry', () => {
        test('finds command in Copilot-format generated JSON', () => {
            const entry = buildNewHookEntry(HookSourceFormat.Copilot);
            const content = JSON.stringify({ hooks: { SessionStart: [entry] } }, null, '\t');
            const result = findHookCommandSelection(content, 'SessionStart', 0, 'command');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), '');
        });
        test('finds command in Claude-format generated JSON', () => {
            const entry = buildNewHookEntry(HookSourceFormat.Claude);
            const content = JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, '\t');
            const result = findHookCommandSelection(content, 'PreToolUse', 0, 'command');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), '');
        });
        test('finds command when appending Claude entry to existing hooks', () => {
            const entry1 = buildNewHookEntry(HookSourceFormat.Claude);
            const entry2 = buildNewHookEntry(HookSourceFormat.Claude);
            const content = JSON.stringify({ hooks: { PreToolUse: [entry1, entry2] } }, null, '\t');
            const result0 = findHookCommandSelection(content, 'PreToolUse', 0, 'command');
            const result1 = findHookCommandSelection(content, 'PreToolUse', 1, 'command');
            assert.ok(result0);
            assert.ok(result1);
            assert.strictEqual(getSelectedText(content, result0), '');
            assert.strictEqual(getSelectedText(content, result1), '');
            // Second entry should be on a later line
            assert.ok(result1.startLineNumber > result0.startLineNumber);
        });
        test('Claude format JSON has correct structure', () => {
            const entry = buildNewHookEntry(HookSourceFormat.Claude);
            const content = JSON.stringify({ hooks: { SubagentStart: [entry] } }, null, '\t');
            const parsed = JSON.parse(content);
            assert.deepStrictEqual(parsed, {
                hooks: {
                    SubagentStart: [
                        {
                            matcher: '',
                            hooks: [{
                                    type: 'command',
                                    command: ''
                                }]
                        }
                    ]
                }
            });
        });
        test('Copilot format JSON has correct structure', () => {
            const entry = buildNewHookEntry(HookSourceFormat.Copilot);
            const content = JSON.stringify({ hooks: { SubagentStart: [entry] } }, null, '\t');
            const parsed = JSON.parse(content);
            assert.deepStrictEqual(parsed, {
                hooks: {
                    SubagentStart: [
                        {
                            type: 'command',
                            command: ''
                        }
                    ]
                }
            });
        });
    });
    suite('findHookCommandInYaml', () => {
        test('finds unquoted command value', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                '    - command: echo hello',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'echo hello');
            assert.deepStrictEqual(result, {
                startLineNumber: 4,
                startColumn: 16,
                endLineNumber: 4,
                endColumn: 26
            });
        });
        test('finds double-quoted command value', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                '    - command: "echo hello"',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'echo hello');
        });
        test('finds single-quoted command value', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                `    - command: 'echo hello'`,
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'echo hello');
        });
        test('finds command without list prefix', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                '    command: run-lint',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'run-lint');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'run-lint');
        });
        test('does not match substring of a longer command', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                '    - command: echo hello-world',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.strictEqual(result, undefined);
        });
        test('returns undefined when command is not found', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                '    - command: echo hello',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo goodbye');
            assert.strictEqual(result, undefined);
        });
        test('returns undefined when no command lines exist', () => {
            const content = [
                '---',
                'name: my-agent',
                'description: An agent',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.strictEqual(result, undefined);
        });
        test('returns undefined for empty content', () => {
            const result = findHookCommandInYaml('', 'echo hello');
            assert.strictEqual(result, undefined);
        });
        test('finds first matching command when multiple exist', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                '    - command: echo hello',
                '  userPromptSubmit:',
                '    - command: echo hello',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.ok(result);
            assert.strictEqual(result.startLineNumber, 4);
        });
        test('ignores lines that are not command fields', () => {
            const content = [
                '---',
                'description: run command echo hello',
                'hooks:',
                '  sessionStart:',
                '    - command: echo hello',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.ok(result);
            assert.strictEqual(result.startLineNumber, 5);
        });
        test('handles command with special characters', () => {
            const content = [
                '---',
                'hooks:',
                '  preToolUse:',
                '    - command: echo "foo" > /tmp/out.txt',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo "foo" > /tmp/out.txt');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'echo "foo" > /tmp/out.txt');
        });
        test('matches command followed by trailing whitespace', () => {
            const content = [
                '---',
                'hooks:',
                '  sessionStart:',
                '    - command: echo hello   ',
                '---',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'echo hello');
        });
        test('finds short command that is a substring of the key name', () => {
            const content = [
                'hooks:',
                '  Stop:',
                '    - timeout: 10',
                '      command: "a"',
                '      type: command',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'a');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'a');
            assert.strictEqual(result.startLineNumber, 4);
        });
        test('finds short command in bash field that is a substring of the key name', () => {
            const content = [
                'hooks:',
                '  sessionStart:',
                '    - bash: "a"',
                '      type: command',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'a');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'a');
            assert.strictEqual(result.startLineNumber, 3);
        });
        test('finds command in powershell field', () => {
            const content = [
                'hooks:',
                '  sessionStart:',
                '    - powershell: "echo hello"',
                '      type: command',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'echo hello');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'echo hello');
            assert.strictEqual(result.startLineNumber, 3);
        });
        test('finds command in windows field', () => {
            const content = [
                'hooks:',
                '  sessionStart:',
                '    - windows: "dir"',
                '      type: command',
            ].join('\n');
            const result = findHookCommandInYaml(content, 'dir');
            assert.ok(result);
            assert.strictEqual(getSelectedText(content, result), 'dir');
            assert.strictEqual(result.startLineNumber, 3);
        });
        test('finds command in linux and osx fields', () => {
            const content = [
                'hooks:',
                '  sessionStart:',
                '    - linux: "ls"',
                '      osx: "ls -G"',
                '      type: command',
            ].join('\n');
            const linuxResult = findHookCommandInYaml(content, 'ls');
            assert.ok(linuxResult);
            assert.strictEqual(getSelectedText(content, linuxResult), 'ls');
            assert.strictEqual(linuxResult.startLineNumber, 3);
            const osxResult = findHookCommandInYaml(content, 'ls -G');
            assert.ok(osxResult);
            assert.strictEqual(getSelectedText(content, osxResult), 'ls -G');
            assert.strictEqual(osxResult.startLineNumber, 4);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va1V0aWxzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9wcm9tcHRTeW50YXgvaG9va1V0aWxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRTdHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXhHOztHQUVHO0FBQ0gsU0FBUyxlQUFlLENBQUMsT0FBZSxFQUFFLFNBQStCO0lBQ3hFLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEMsSUFBSSxTQUFTLENBQUMsZUFBZSxLQUFLLFNBQVMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUMzRCxPQUFPLEtBQUssQ0FBQyxTQUFTLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLENBQUMsRUFBRSxTQUFTLENBQUMsU0FBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzVHLENBQUM7SUFDRCx1QkFBdUI7SUFDdkIsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO0lBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN2RixLQUFLLElBQUksQ0FBQyxHQUFHLFNB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