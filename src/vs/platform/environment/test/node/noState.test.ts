// Test for --no-state CLI option
// This test verifies the new --no-state functionality

import assert from 'assert';
import { parseArgs, OPTIONS } from '../../../platform/environment/node/argv.js';

suite('--no-state CLI option', () => {
	test('should parse --no-state argument correctly', () => {
		const result = parseArgs(['--no-state'], OPTIONS);
		assert.strictEqual(result['no-state'], true);
	});

	test('should parse --no-state with other arguments', () => {
		const result = parseArgs(['--verbose', '--no-state', '--wait'], OPTIONS);
		assert.strictEqual(result['no-state'], true);
		assert.strictEqual(result.verbose, true);
		assert.strictEqual(result.wait, true);
	});

	test('should handle --no-state=false', () => {
		const result = parseArgs(['--no-state=false'], OPTIONS);
		assert.strictEqual(result['no-state'], false);
	});

	test('should not set --no-state when not provided', () => {
		const result = parseArgs(['--verbose'], OPTIONS);
		assert.strictEqual(result['no-state'], undefined);
	});
});