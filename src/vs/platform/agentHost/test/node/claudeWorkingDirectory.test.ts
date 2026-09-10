/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Query } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentWorkingDirectoryChangedError } from '../../common/agent.js';
import { setClaudeWorkingDirectory } from '../../node/claude/claudeWorkingDirectory.js';

suite('Claude native working directory', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const target = URI.file('/workspace/target');
	const success = { status: 'ok', cwd: target.fsPath, changed: true, transcript_relocated: true };

	function createQuery(responses: readonly unknown[]) {
		const calls: { path: string; options?: { trustAccepted: boolean; trustedDirectory: string } }[] = [];
		const query = new class extends mock<Query>() {
			async setCwd(path: string, options?: { trustAccepted: boolean; trustedDirectory: string }): Promise<unknown> {
				calls.push({ path, options });
				return responses[calls.length - 1];
			}
		}();
		return { query, calls };
	}

	test('binds native trust to the already confirmed directory', async () => {
		const { query, calls } = createQuery([{ status: 'needs_trust', directory: target.fsPath }, success]);
		const result = await setClaudeWorkingDirectory(query, target);
		assert.deepStrictEqual({ result: result.toString(), calls }, {
			result: target.toString(),
			calls: [
				{ path: target.fsPath, options: undefined },
				{ path: target.fsPath, options: { trustAccepted: true, trustedDirectory: target.fsPath } },
			],
		});
	});

	test('does not grant trust to a different directory', async () => {
		const { query, calls } = createQuery([{ status: 'needs_trust', directory: '/different' }]);
		await assert.rejects(() => setClaudeWorkingDirectory(query, target), /other than the confirmed workspace/);
		assert.strictEqual(calls.length, 1);
	});

	test('rejects SDKs without the native runtime API', async () => {
		await assert.rejects(() => setClaudeWorkingDirectory(new class extends mock<Query>() { }(), target), /does not support native/);
	});

	test('rejects unsuccessful and malformed responses', async () => {
		for (const response of [undefined, {}, { status: 'rejected', reason: 'busy', message: 'busy' }, { status: 'needs_trust', directory: 'relative' }, { ...success, cwd: 'relative' }]) {
			const { query } = createQuery([response]);
			await assert.rejects(() => setClaudeWorkingDirectory(query, target));
		}
	});

	test('preserves runtime rejection messages without treating them as ambiguous changes', async () => {
		for (const reason of ['busy', 'not_found', 'not_a_directory', 'blocked_by_rule', 'unsafe_path']) {
			const message = `Native rejection: ${reason}`;
			const { query } = createQuery([{ status: 'rejected', reason, message }]);
			await assert.rejects(() => setClaudeWorkingDirectory(query, target),
				error => error instanceof Error && error.constructor === Error && error.message.includes(message));
		}
	});

	test('accepts an acknowledged no-op with a relocated transcript', async () => {
		const { query } = createQuery([{ ...success, changed: false }]);
		assert.strictEqual((await setClaudeWorkingDirectory(query, target)).toString(), target.toString());
	});

	test('reports authoritative cwd on mismatch or unconfirmed transcript relocation', async () => {
		for (const response of [{ ...success, cwd: URI.file('/different').fsPath }, { ...success, transcript_relocated: false }, { ...success, changed: undefined }]) {
			const { query } = createQuery([response]);
			await assert.rejects(() => setClaudeWorkingDirectory(query, target), error =>
				error instanceof AgentWorkingDirectoryChangedError && error.workingDirectory.fsPath === response.cwd);
		}
	});
});
