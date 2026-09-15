/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict');
const test = require('node:test');

const { replacementForDocument } = require('./knownProblem.cjs');

test('rewrites only the deterministic Issue Wizard symptom document', () => {
	assert.deepStrictEqual([
		replacementForDocument('/tmp/issue-wizard-extension-symptom.txt'),
		replacementForDocument('/tmp/unrelated-notes.txt')
	], [
		'Issue Wizard Known Problem extension replaced this line after save.',
		undefined
	]);
});

