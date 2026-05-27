/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { classifyGitStderrMessage } from '../util';

suite('classifyGitStderrMessage', () => {
	test('should classify SSH warning as warning type', () => {
		const stderr = "warning: permanently added 'gitlab.com' to the list of known hosts.";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'warning');
		assert.strictEqual(result.message, "permanently added 'gitlab.com' to the list of known hosts.");
	});

	test('should classify multiple warning-only lines as warning type', () => {
		const stderr = "warning: first warning\nwarning: second warning";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'warning');
		assert.strictEqual(result.message, 'first warning');
	});

	test('should classify fatal error as error type', () => {
		const stderr = "fatal: repository 'https://example.com/repo.git/' not found";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, "fatal: repository 'https://example.com/repo.git/' not found");
	});

	test('should classify mixed warning and error as error, excluding warning lines', () => {
		const stderr = "warning: permanently added 'gitlab.com' to the list of known hosts.\nfatal: Could not read from remote repository.";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, 'fatal: Could not read from remote repository.');
	});

	test('should strip "error: " prefix from messages', () => {
		const stderr = "error: failed to push some refs";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, 'failed to push some refs');
	});

	test('should strip husky lines', () => {
		const stderr = "> husky - something\nfatal: actual error";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, 'fatal: actual error');
	});

	test('should use last line when hasStdout is true', () => {
		const stderr = "first line\nsecond line\nthird line";
		const result = classifyGitStderrMessage(stderr, true);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, 'third line');
	});

	test('should use first line when hasStdout is false', () => {
		const stderr = "first line\nsecond line\nthird line";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, 'first line');
	});

	test('should return empty message for empty input', () => {
		const result = classifyGitStderrMessage('', false);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, '');
	});

	test('should handle case-insensitive warning prefix', () => {
		const stderr = "Warning: something happened";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'warning');
		assert.strictEqual(result.message, 'something happened');
	});

	test('should prefer non-warning lines for error message when mixed', () => {
		const stderr = "warning: some warning\nPermission denied (publickey).";
		const result = classifyGitStderrMessage(stderr, false);

		assert.strictEqual(result.type, 'error');
		assert.strictEqual(result.message, 'Permission denied (publickey).');
	});
});
