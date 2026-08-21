/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { findHookCommandInYaml, findHookCommandSelection } from '../../../browser/promptSyntax/hookUtils.js';
import { ITextEditorSelection } from '../../../../../../platform/editor/common/editor.js';
import { buildNewHookEntry, HookSourceFormat } from '../../../common/promptSyntax/hookCompatibility.js';

/**
 * Helper to extract the selected text from content using a selection range.
 */
function getSelectedText(content: string, selection: ITextEditorSelection): string {
	const lines = content.split('\n');
	if (selection.startLineNumber === selection.endLineNumber) {
		return lines[selection.startLineNumber - 1].substring(selection.startColumn - 1, selection.endColumn! - 1);
	}
	// Multi-line selection
	const result: string[] = [];
	result.push(lines[selection.startLineNumber - 1].substring(selection.startColumn - 1));
	for (let i = selection.startLineNumber; i < selection.endLineNumber! - 1; i++) {
		result.push(lines[i]);
	}
	result.push(lines[selection.endLineNumber! - 1].substring(0, selection.endColumn! - 1));
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
