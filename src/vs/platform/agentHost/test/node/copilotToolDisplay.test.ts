/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getInvocationMessage, getPastTenseMessage, getPermissionDisplay, type ITypedPermissionRequest } from '../../node/copilot/copilotToolDisplay.js';

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
