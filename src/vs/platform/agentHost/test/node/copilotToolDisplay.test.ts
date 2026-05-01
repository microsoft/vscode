/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellLanguage, getToolInputString, getToolKind, isHiddenTool, synthesizeSkillToolCall, type ITypedPermissionRequest } from '../../node/copilot/copilotToolDisplay.js';

suite('getPermissionDisplay — cd-prefix stripping', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const wd = URI.file('/repo/project');

	test('strips redundant cd from shell permission request fullCommandText', () => {
		const request: ITypedPermissionRequest = {
			kind: 'shell',
			fullCommandText: 'cd /repo/project && npm test',
		} as ITypedPermissionRequest;
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'npm test');
		assert.strictEqual(display.permissionKind, 'shell');
	});

	test('leaves shell command alone when cd target differs from working directory', () => {
		const request: ITypedPermissionRequest = {
			kind: 'shell',
			fullCommandText: 'cd /tmp && ls',
		} as ITypedPermissionRequest;
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'cd /tmp && ls');
	});

	test('leaves shell command alone when no working directory provided', () => {
		const request: ITypedPermissionRequest = {
			kind: 'shell',
			fullCommandText: 'cd /repo/project && npm test',
		} as ITypedPermissionRequest;
		const display = getPermissionDisplay(request, undefined);
		assert.strictEqual(display.toolInput, 'cd /repo/project && npm test');
	});

	test('strips redundant cd from custom-tool shell permission request', () => {
		const request: ITypedPermissionRequest = {
			kind: 'custom-tool',
			toolName: 'bash',
			args: { command: 'cd /repo/project && echo hi' },
		} as ITypedPermissionRequest;
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'echo hi');
		assert.strictEqual(display.permissionKind, 'shell');
	});

	test('does not affect non-shell custom-tool requests', () => {
		const request: ITypedPermissionRequest = {
			kind: 'custom-tool',
			toolName: 'some_other_tool',
			args: { command: 'cd /repo/project && echo hi' },
		} as ITypedPermissionRequest;
		const display = getPermissionDisplay(request, wd);
		// Falls through to the generic branch — toolInput is the JSON-stringified args.
		assert.ok(display.toolInput?.includes('cd /repo/project'), `expected unrewritten args, got: ${display.toolInput}`);
		assert.strictEqual(display.permissionKind, 'custom-tool');
	});

	test('handles powershell custom-tool with semicolon separator', () => {
		const request: ITypedPermissionRequest = {
			kind: 'custom-tool',
			toolName: 'powershell',
			args: { command: 'cd /repo/project; dir' },
		} as ITypedPermissionRequest;
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'dir');
	});
});

suite('view tool — view_range display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function invocation(parameters: Record<string, unknown> | undefined): string {
		const result = getInvocationMessage('view', 'View File', parameters);
		return typeof result === 'string' ? result : result.markdown;
	}

	function pastTense(parameters: Record<string, unknown> | undefined): string {
		const result = getPastTenseMessage('view', 'View File', parameters, true);
		return typeof result === 'string' ? result : result.markdown;
	}

	test('renders path-only when view_range is absent', () => {
		assert.ok(invocation({ path: '/repo/file.ts' }).startsWith('Reading ['));
		assert.ok(pastTense({ path: '/repo/file.ts' }).startsWith('Read ['));
	});

	test('renders "lines X to Y" for a valid two-element range', () => {
		assert.ok(invocation({ path: '/repo/file.ts', view_range: [10, 20] }).endsWith(', lines 10 to 20'));
		assert.ok(pastTense({ path: '/repo/file.ts', view_range: [10, 20] }).endsWith(', lines 10 to 20'));
	});

	test('renders "line X" when start === end', () => {
		assert.ok(invocation({ path: '/repo/file.ts', view_range: [10, 10] }).endsWith(', line 10'));
		assert.ok(pastTense({ path: '/repo/file.ts', view_range: [10, 10] }).endsWith(', line 10'));
	});

	test('renders "line X to the end" for the -1 EOF sentinel', () => {
		assert.ok(invocation({ path: '/repo/file.ts', view_range: [10, -1] }).endsWith(', line 10 to the end'));
		assert.ok(pastTense({ path: '/repo/file.ts', view_range: [10, -1] }).endsWith(', line 10 to the end'));
	});

	test('falls back to path-only for invalid ranges', () => {
		// end < start (and not -1)
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [20, 10] }).includes(','));
		// negative start
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [-5, 10] }).includes(','));
		// non-integer
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [1.5, 10] }).includes(','));
		// wrong arity
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [10] }).includes(','));
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [10, 20, 30] }).includes(','));
		// non-array
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: 'whatever' }).includes(','));
	});
});

// ---- write_/read_ shell tool display ---------------------------------------
//
// Coverage for the secondary shell helpers (write_bash, read_bash, and their
// powershell siblings). These never appear in a permission dialog (they're
// registered with `skipPermission: true` — see copilotShellTools.ts), but they
// still flow through the tool-execution display pipeline.

suite('copilotToolDisplay — write_/read_ shell tools', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getToolKind', () => {

		test('returns terminal for bash', () => {
			assert.strictEqual(getToolKind('bash'), 'terminal');
		});

		test('returns terminal for powershell', () => {
			assert.strictEqual(getToolKind('powershell'), 'terminal');
		});

		test('returns undefined for write_bash (sending input to a running program, not launching a terminal)', () => {
			assert.strictEqual(getToolKind('write_bash'), undefined);
		});

		test('returns undefined for write_powershell', () => {
			assert.strictEqual(getToolKind('write_powershell'), undefined);
		});

		test('returns undefined for read_bash (reading output, not launching a terminal)', () => {
			assert.strictEqual(getToolKind('read_bash'), undefined);
		});

		test('returns undefined for read_powershell', () => {
			assert.strictEqual(getToolKind('read_powershell'), undefined);
		});

		test('returns subagent for task', () => {
			assert.strictEqual(getToolKind('task'), 'subagent');
		});

		test('returns undefined for view', () => {
			assert.strictEqual(getToolKind('view'), undefined);
		});
	});

	suite('getShellLanguage', () => {

		test('bash returns shellscript', () => {
			assert.strictEqual(getShellLanguage('bash'), 'shellscript');
		});

		test('powershell returns powershell', () => {
			assert.strictEqual(getShellLanguage('powershell'), 'powershell');
		});

		test('write_bash returns shellscript', () => {
			assert.strictEqual(getShellLanguage('write_bash'), 'shellscript');
		});

		test('write_powershell returns powershell', () => {
			assert.strictEqual(getShellLanguage('write_powershell'), 'powershell');
		});

		test('read_bash returns shellscript', () => {
			assert.strictEqual(getShellLanguage('read_bash'), 'shellscript');
		});

		test('read_powershell returns powershell', () => {
			assert.strictEqual(getShellLanguage('read_powershell'), 'powershell');
		});
	});

	suite('getInvocationMessage', () => {

		function getText(msg: ReturnType<typeof getInvocationMessage>): string {
			return typeof msg === 'string' ? msg : msg.markdown;
		}

		test('write_bash with command includes the command text', () => {
			const msg = getInvocationMessage('write_bash', 'Write Shell Input', { command: 'echo hello' });
			assert.ok(getText(msg).includes('echo hello'), `expected 'echo hello' in: ${getText(msg)}`);
		});

		test('write_bash without command returns a non-empty fallback message', () => {
			const msg = getInvocationMessage('write_bash', 'Write Shell Input', undefined);
			assert.ok(getText(msg).length > 0);
			assert.ok(!getText(msg).includes('undefined'));
		});

		test('write_powershell with command includes the command text', () => {
			const msg = getInvocationMessage('write_powershell', 'Write Shell Input', { command: 'Get-Date' });
			assert.ok(getText(msg).includes('Get-Date'), `expected 'Get-Date' in: ${getText(msg)}`);
		});

		test('read_bash returns a non-empty message', () => {
			const msg = getInvocationMessage('read_bash', 'Read Shell Output', undefined);
			assert.ok(getText(msg).length > 0);
		});

		test('read_powershell returns a non-empty message', () => {
			const msg = getInvocationMessage('read_powershell', 'Read Shell Output', undefined);
			assert.ok(getText(msg).length > 0);
		});

		test('write_bash message differs from bash message (distinct wording)', () => {
			const writeBashMsg = getText(getInvocationMessage('write_bash', 'Write Shell Input', { command: 'echo hi' }));
			const bashMsg = getText(getInvocationMessage('bash', 'Bash', { command: 'echo hi' }));
			// Both include the command, but the surrounding text should differ
			assert.notStrictEqual(writeBashMsg, bashMsg);
		});
	});

	suite('getPastTenseMessage', () => {

		function getText(msg: ReturnType<typeof getPastTenseMessage>): string {
			return typeof msg === 'string' ? msg : msg.markdown;
		}

		test('write_bash with command includes the command text', () => {
			const msg = getPastTenseMessage('write_bash', 'Write Shell Input', { command: 'echo hello' }, true);
			assert.ok(getText(msg).includes('echo hello'), `expected 'echo hello' in: ${getText(msg)}`);
		});

		test('write_bash without command returns a non-empty fallback message', () => {
			const msg = getPastTenseMessage('write_bash', 'Write Shell Input', undefined, true);
			assert.ok(getText(msg).length > 0);
		});

		test('write_powershell with command includes the command text', () => {
			const msg = getPastTenseMessage('write_powershell', 'Write Shell Input', { command: 'Get-Date' }, true);
			assert.ok(getText(msg).includes('Get-Date'), `expected 'Get-Date' in: ${getText(msg)}`);
		});

		test('read_bash success returns a non-empty message', () => {
			const msg = getPastTenseMessage('read_bash', 'Read Shell Output', undefined, true);
			assert.ok(getText(msg).length > 0);
		});

		test('write_bash failure returns a non-empty error message', () => {
			const msg = getPastTenseMessage('write_bash', 'Write Shell Input', { command: 'echo hello' }, false);
			assert.ok(getText(msg).length > 0);
		});
	});

	suite('getToolInputString', () => {

		test('write_bash extracts command field', () => {
			assert.strictEqual(getToolInputString('write_bash', { command: 'echo hello' }, undefined), 'echo hello');
		});

		test('write_powershell extracts command field', () => {
			assert.strictEqual(getToolInputString('write_powershell', { command: 'Get-Date' }, undefined), 'Get-Date');
		});

		test('write_bash falls back to rawArguments when no command field', () => {
			assert.strictEqual(getToolInputString('write_bash', {}, '{"command":"echo hello"}'), '{"command":"echo hello"}');
		});

		test('write_bash returns undefined when both parameters and rawArguments are absent', () => {
			assert.strictEqual(getToolInputString('write_bash', undefined, undefined), undefined);
		});

		test('read_bash with no parameters returns undefined', () => {
			assert.strictEqual(getToolInputString('read_bash', undefined, undefined), undefined);
		});
	});
});

suite('skill events', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hides the raw `skill` tool call and synthesizes a tool-start/complete pair from `skill.invoked`', () => {
		const withPath = synthesizeSkillToolCall(
			{ name: 'plan', path: '/abs/repo/skills/plan/SKILL.md' },
			'evt-123',
		);
		const noPath = synthesizeSkillToolCall(
			{ name: 'plan' },
			undefined,
		);

		assert.deepStrictEqual({
			skillIsHidden: isHiddenTool('skill'),
			withPathToolCallId: withPath.toolCallId,
			withPathToolName: withPath.toolName,
			withPathDisplayName: withPath.displayName,
			withPathInvocation: withPath.invocationMessage,
			withPathPastTense: withPath.pastTenseMessage,
			noPathToolCallId: noPath.toolCallId,
			noPathInvocation: noPath.invocationMessage,
			noPathPastTense: noPath.pastTenseMessage,
		}, {
			skillIsHidden: true,
			withPathToolCallId: 'synth-skill-evt-123',
			withPathToolName: 'skill',
			withPathDisplayName: 'Read Skill',
			withPathInvocation: { markdown: 'Reading skill [plan](file:///abs/repo/skills/plan/SKILL.md)' },
			withPathPastTense: { markdown: 'Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)' },
			noPathToolCallId: 'synth-skill-2108d652',
			noPathInvocation: 'Reading skill plan',
			noPathPastTense: 'Read skill plan',
		});
	});
});
