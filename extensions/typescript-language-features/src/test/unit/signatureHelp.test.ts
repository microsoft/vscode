/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { getActiveSignature } from '../../languageFeatures/signatureHelp';

const numberSig = { label: 'foo(a: number): number' };
const stringSig = { label: 'foo(a: string): string' };
const overloads = [numberSig, stringSig];

function makeContext(opts: {
	isRetrigger: boolean;
	activeSignature?: number;
	signatures?: ReadonlyArray<{ label: string }>;
}) {
	return {
		isRetrigger: opts.isRetrigger,
		activeSignatureHelp:
			opts.activeSignature !== undefined
				? {
						signatures: opts.signatures ?? overloads,
						activeSignature: opts.activeSignature,
						activeParameter: 0,
					}
				: undefined,
	};
}

// The original (buggy) implementation embedded here for before/after comparison.
// This reflects what was in getActiveSignature before the fix for #268728.
function getActiveSignature_BEFORE(
	context: ReturnType<typeof makeContext>,
	tsSelectedItemIndex: number,
	signatures: ReadonlyArray<{ label: string }>,
): number {
	const previouslyActiveSignature =
		context.activeSignatureHelp?.signatures[context.activeSignatureHelp.activeSignature];
	if (previouslyActiveSignature && context.isRetrigger) {
		const existingIndex = signatures.findIndex(
			(other) => other.label === previouslyActiveSignature.label,
		);
		if (existingIndex >= 0) {
			return existingIndex; // BUG: ignores TS's updated selectedItemIndex
		}
	}
	return tsSelectedItemIndex;
}

suite('getActiveSignature — BEFORE fix (#268728)', () => {
	test('non-retrigger returns TypeScript selectedItemIndex', () => {
		assert.strictEqual(
			getActiveSignature_BEFORE(makeContext({ isRetrigger: false }), 0, overloads),
			0,
		);
	});

	test('retrigger with no previous context returns TypeScript selectedItemIndex', () => {
		assert.strictEqual(
			getActiveSignature_BEFORE(makeContext({ isRetrigger: true }), 1, overloads),
			1,
		);
	});

	test('retrigger preserves previously-shown overload when TypeScript selection is unchanged', () => {
		assert.strictEqual(
			getActiveSignature_BEFORE(
				makeContext({ isRetrigger: true, activeSignature: 0 }),
				0,
				overloads,
			),
			0,
		);
	});

	test('BUG: retrigger returns stale overload even after TS updates selectedItemIndex', () => {
		// When typed arguments narrow the overload set (e.g. a string first argument),
		// TS updates selectedItemIndex from 0 to 1 on the comma retrigger.
		// Old code finds numberSig still in the list and returns 0 — wrong.
		assert.strictEqual(
			getActiveSignature_BEFORE(
				makeContext({ isRetrigger: true, activeSignature: 0 }),
				1,
				overloads,
			),
			0, // BUG: returns 0 (number overload) instead of the correct 1 (string overload)
		);
	});
});

suite('getActiveSignature — AFTER fix (#268728)', () => {
	test('non-retrigger returns TypeScript selectedItemIndex', () => {
		assert.strictEqual(
			getActiveSignature(makeContext({ isRetrigger: false }), 0, overloads),
			0,
		);
	});

	test('retrigger with no previous context returns TypeScript selectedItemIndex', () => {
		assert.strictEqual(
			getActiveSignature(makeContext({ isRetrigger: true }), 1, overloads),
			1,
		);
	});

	test('retrigger preserves previously-shown overload when TypeScript selection is unchanged', () => {
		assert.strictEqual(
			getActiveSignature(
				makeContext({ isRetrigger: true, activeSignature: 0 }),
				0,
				overloads,
			),
			0,
		);
	});

	test('FIX: retrigger now follows TS when arguments narrow the overload set (#268728)', () => {
		// When typed arguments narrow the overload set (e.g. a string first argument),
		// TS updates selectedItemIndex from 0 to 1 on the comma retrigger.
		// Fixed code honours that update instead of locking in the earlier selection.
		assert.strictEqual(
			getActiveSignature(
				makeContext({ isRetrigger: true, activeSignature: 0 }),
				1,
				overloads,
			),
			1, // FIX: correctly returns 1 (string overload)
		);
	});
});
