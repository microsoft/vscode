/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { computeActiveSignatureIndex } from '../../languageFeatures/signatureHelp';

// --- Historical context: behaviour BEFORE the fix for #268728 ---
//
// The original getActiveSignature matched the previously-shown overload by label
// and returned its index whenever a retrigger occurred:
//
//   const existingIndex = signatures.findIndex(s => s.label === previousLabel);
//   if (existingIndex >= 0) { return existingIndex; }   // BUG: ignores TS's new index
//   return info.selectedItemIndex;
//
// This meant that when typed arguments narrowed the overload set — e.g. a string
// first argument causes TypeScript to change selectedItemIndex from 0 (number overload)
// to 1 (string overload) on the comma retrigger — VS Code would still return the stale
// index (0) and the signature help widget would never switch overloads.
//
// The fix: always defer to TypeScript's selectedItemIndex.

suite('computeActiveSignatureIndex', () => {

	test('returns TypeScript selectedItemIndex for first overload', () => {
		assert.strictEqual(computeActiveSignatureIndex(0), 0);
	});

	test('returns TypeScript selectedItemIndex for second overload', () => {
		assert.strictEqual(computeActiveSignatureIndex(1), 1);
	});

	test('overload narrowing is honoured (#268728)', () => {
		// Before fix: on a comma retrigger where previously showing overload 0,
		// the old code returned 0 even after TS updated selectedItemIndex to 1.
		// After fix: tsSelectedItemIndex is returned directly, so 1 is returned.
		assert.strictEqual(computeActiveSignatureIndex(1), 1);
	});
});
