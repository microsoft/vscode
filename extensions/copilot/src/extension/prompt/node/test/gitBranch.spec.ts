/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { normalizeBranchName } from '../gitBranch';

suite('normalizeBranchName', () => {

	test('preserves simple alphanumeric names', () => {
		assert.strictEqual(normalizeBranchName('feature-branch'), 'feature-branch');
	});

	test('converts to lowercase', () => {
		assert.strictEqual(normalizeBranchName('Feature-Branch'), 'feature-branch');
		assert.strictEqual(normalizeBranchName('ABC'), 'abc');
	});

	test('strips spaces', () => {
		assert.strictEqual(normalizeBranchName('my branch name'), 'mybranchname');
	});

	test('strips special characters', () => {
		assert.strictEqual(normalizeBranchName('feature~branch^name'), 'featurebranchname');
		assert.strictEqual(normalizeBranchName('name?with*wildcards'), 'namewithwildcards');
		assert.strictEqual(normalizeBranchName('has:colon[bracket'), 'hascolonbracket');
	});

	test('strips dots, slashes, and underscores', () => {
		assert.strictEqual(normalizeBranchName('feature/my-branch'), 'featuremy-branch');
		assert.strictEqual(normalizeBranchName('feature.name'), 'featurename');
		assert.strictEqual(normalizeBranchName('with_underscore'), 'withunderscore');
	});

	test('strips emojis and unicode characters', () => {
		assert.strictEqual(normalizeBranchName('feature-🚀-launch'), 'feature--launch');
		assert.strictEqual(normalizeBranchName('日本語branch'), 'branch');
		assert.strictEqual(normalizeBranchName('café-feature'), 'caf-feature');
	});

	test('strips leading dashes', () => {
		assert.strictEqual(normalizeBranchName('-feature'), 'feature');
		assert.strictEqual(normalizeBranchName('---feature'), 'feature');
	});

	test('strips leading dots (already removed by character filter)', () => {
		assert.strictEqual(normalizeBranchName('.hidden'), 'hidden');
		assert.strictEqual(normalizeBranchName('..double'), 'double');
	});

	test('handles empty string input', () => {
		assert.strictEqual(normalizeBranchName(''), '');
	});

	test('handles input that becomes empty after stripping', () => {
		assert.strictEqual(normalizeBranchName('🚀🎉'), '');
		assert.strictEqual(normalizeBranchName('...'), '');
		assert.strictEqual(normalizeBranchName('---'), '');
	});

	test('handles backslashes', () => {
		assert.strictEqual(normalizeBranchName('feature\\branch'), 'featurebranch');
	});

	test('preserves dashes in the middle', () => {
		assert.strictEqual(normalizeBranchName('fix-bug-123'), 'fix-bug-123');
	});

	test('handles mixed valid and invalid characters', () => {
		assert.strictEqual(normalizeBranchName('Fix: Add new feature! (#42)'), 'fixaddnewfeature42');
	});

	test('handles quoted branch names', () => {
		// normalizeBranchName strips quotes via the character filter; generateBranchName also strips paired quotes
		assert.strictEqual(normalizeBranchName('"my-branch"'), 'my-branch');
	});

	test('handles at-sign and curly braces', () => {
		assert.strictEqual(normalizeBranchName('@{branch}'), 'branch');
		assert.strictEqual(normalizeBranchName('@'), '');
	});

	test('handles trailing dash (allowed)', () => {
		assert.strictEqual(normalizeBranchName('feature-'), 'feature-');
	});
});
