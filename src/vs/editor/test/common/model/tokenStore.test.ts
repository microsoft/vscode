/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TextModel } from '../../../common/model/textModel.js';
import { TokenStore } from '../../../common/model/tokenStore.js';

suite('TokenStore', () => {
	let textModel: TextModel;
	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		textModel = {
			getValueLength: () => 11
		} as TextModel;
	});

	test('constructs with empty model', () => {
		const store = new TokenStore(textModel);
		assert.ok(store.root);
		assert.strictEqual(store.root.length, textModel.getValueLength());
	});

	test('builds store with single token', () => {
		const store = new TokenStore(textModel);
		store.buildStore([{
			startOffsetInclusive: 0,
			length: 5,
			token: 1
		}]);
		assert.strictEqual(store.root.length, 5);
	});

	test('builds store with multiple tokens', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 4, token: 3 }
		]);
		assert.ok(store.root);
		assert.strictEqual(store.root.length, 10);
	});

	test('creates balanced tree structure', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 2, token: 1 },
			{ startOffsetInclusive: 2, length: 2, token: 2 },
			{ startOffsetInclusive: 4, length: 2, token: 3 },
			{ startOffsetInclusive: 6, length: 2, token: 4 }
		]);

		const root = store.root as any;
		assert.ok(root.children);
		assert.strictEqual(root.children.length, 2);
		assert.strictEqual(root.children[0].length, 4);
		assert.strictEqual(root.children[1].length, 4);
	});

	test('creates deep tree structure', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 1, token: 1 },
			{ startOffsetInclusive: 1, length: 1, token: 2 },
			{ startOffsetInclusive: 2, length: 1, token: 3 },
			{ startOffsetInclusive: 3, length: 1, token: 4 },
			{ startOffsetInclusive: 4, length: 1, token: 5 },
			{ startOffsetInclusive: 5, length: 1, token: 6 },
			{ startOffsetInclusive: 6, length: 1, token: 7 },
			{ startOffsetInclusive: 7, length: 1, token: 8 }
		]);

		const root = store.root as any;
		assert.ok(root.children);
		assert.strictEqual(root.children.length, 2);
		assert.ok(root.children[0].children);
		assert.strictEqual(root.children[0].children.length, 2);
		assert.ok(root.children[0].children[0].children);
		assert.strictEqual(root.children[0].children[0].children.length, 2);
	});

	test('updates single token in middle', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		store.update(3, [
			{ startOffsetInclusive: 3, length: 3, token: 4 }
		]);

		const tokens = store.root as any;
		assert.strictEqual(tokens.children[0].token, 1);
		assert.strictEqual(tokens.children[1].token, 4);
		assert.strictEqual(tokens.children[2].token, 3);
	});

	test('updates multiple consecutive tokens', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		store.update(6, [
			{ startOffsetInclusive: 3, length: 3, token: 4 },
			{ startOffsetInclusive: 6, length: 3, token: 5 }
		]);

		const tokens = store.root as any;
		assert.strictEqual(tokens.children[0].token, 1);
		assert.strictEqual(tokens.children[1].token, 4);
		assert.strictEqual(tokens.children[2].token, 5);
	});

	test('updates tokens at start of document', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		store.update(3, [
			{ startOffsetInclusive: 0, length: 3, token: 4 }
		]);

		const tokens = store.root as any;
		assert.strictEqual(tokens.children[0].token, 4);
		assert.strictEqual(tokens.children[1].token, 2);
		assert.strictEqual(tokens.children[2].token, 3);
	});

	test('updates tokens at end of document', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		store.update(3, [
			{ startOffsetInclusive: 6, length: 3, token: 4 }
		]);

		const tokens = store.root as any;
		assert.strictEqual(tokens.children[0].token, 1);
		assert.strictEqual(tokens.children[1].token, 2);
		assert.strictEqual(tokens.children[2].token, 4);
	});

	test('updates length of tokens', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		store.update(6, [
			{ startOffsetInclusive: 3, length: 5, token: 4 }
		]);

		const tokens = store.root as any;
		assert.strictEqual(tokens.children[0].token, 1);
		assert.strictEqual(tokens.children[0].length, 3);
		assert.strictEqual(tokens.children[1].token, 4);
		assert.strictEqual(tokens.children[1].length, 5);
	});

	test('update deeply nested tree with new token length in the middle', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 1, token: 1 },
			{ startOffsetInclusive: 1, length: 1, token: 2 },
			{ startOffsetInclusive: 2, length: 1, token: 3 },
			{ startOffsetInclusive: 3, length: 1, token: 4 },
			{ startOffsetInclusive: 4, length: 1, token: 5 },
			{ startOffsetInclusive: 5, length: 1, token: 6 },
			{ startOffsetInclusive: 6, length: 1, token: 7 },
			{ startOffsetInclusive: 7, length: 1, token: 8 }
		]);

		// Update token in the middle (position 3-4) to span 3-6
		store.update(3, [
			{ startOffsetInclusive: 3, length: 3, token: 9 }
		]);

		const root = store.root as any;
		// Verify the structure remains balanced
		assert.strictEqual(root.children.length, 3);
		assert.strictEqual(root.children[0].children.length, 2);

		// Verify the lengths are updated correctly
		assert.strictEqual(root.children[0].length, 2); // First 2 tokens
		assert.strictEqual(root.children[1].length, 4); // Token 3 + our new longer token
		assert.strictEqual(root.children[2].length, 2); // Last 2 tokens
	});

	test('getTokensInRange returns tokens in middle of document', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		const tokens = store.getTokensInRange(3, 6);
		assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 3, length: 3, token: 2 }]);
	});

	test('getTokensInRange returns tokens at start of document', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		const tokens = store.getTokensInRange(0, 3);
		assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 0, length: 3, token: 1 }]);
	});

	test('getTokensInRange returns tokens at end of document', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);

		const tokens = store.getTokensInRange(6, 9);
		assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 6, length: 3, token: 3 }]);
	});

	test('getTokensInRange returns multiple tokens across nodes', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 1, token: 1 },
			{ startOffsetInclusive: 1, length: 1, token: 2 },
			{ startOffsetInclusive: 2, length: 1, token: 3 },
			{ startOffsetInclusive: 3, length: 1, token: 4 },
			{ startOffsetInclusive: 4, length: 1, token: 5 },
			{ startOffsetInclusive: 5, length: 1, token: 6 }
		]);

		const tokens = store.getTokensInRange(2, 5);
		assert.deepStrictEqual(tokens, [
			{ startOffsetInclusive: 2, length: 1, token: 3 },
			{ startOffsetInclusive: 3, length: 1, token: 4 },
			{ startOffsetInclusive: 4, length: 1, token: 5 }
		]);
	});

	test('Realistic scenario one', () => {
		// inspired by this snippet, with the update adding a space in the constructor's curly braces:
		// /*
		// */
		// class XY {
		// 	constructor() {}
		// }

		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 164164 },
			{ startOffsetInclusive: 3, length: 1, token: 32836 },
			{ startOffsetInclusive: 4, length: 3, token: 164164 },
			{ startOffsetInclusive: 7, length: 2, token: 32836 },
			{ startOffsetInclusive: 9, length: 5, token: 196676 },
			{ startOffsetInclusive: 14, length: 1, token: 32836 },
			{ startOffsetInclusive: 15, length: 2, token: 557124 },
			{ startOffsetInclusive: 17, length: 4, token: 32836 },
			{ startOffsetInclusive: 21, length: 1, token: 32836 },
			{ startOffsetInclusive: 22, length: 11, token: 196676 },
			{ startOffsetInclusive: 33, length: 7, token: 32836 },
			{ startOffsetInclusive: 40, length: 3, token: 32836 }
		]);

		store.update(33, [
			{ startOffsetInclusive: 9, length: 5, token: 196676 },
			{ startOffsetInclusive: 14, length: 1, token: 32836 },
			{ startOffsetInclusive: 15, length: 2, token: 557124 },
			{ startOffsetInclusive: 17, length: 4, token: 32836 },
			{ startOffsetInclusive: 21, length: 1, token: 32836 },
			{ startOffsetInclusive: 22, length: 11, token: 196676 },
			{ startOffsetInclusive: 33, length: 8, token: 32836 },
			{ startOffsetInclusive: 41, length: 3, token: 32836 }
		]);

	});
	test('Realistic scenario two', () => {
		// inspired by this snippet, with the update deleteing the space in the body of class x
		// class x {
		//
		// }
		// class y {

		// }

		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 5, token: 196676 },
			{ startOffsetInclusive: 5, length: 1, token: 32836 },
			{ startOffsetInclusive: 6, length: 1, token: 557124 },
			{ startOffsetInclusive: 7, length: 4, token: 32836 },
			{ startOffsetInclusive: 11, length: 3, token: 32836 },
			{ startOffsetInclusive: 14, length: 3, token: 32836 },
			{ startOffsetInclusive: 17, length: 5, token: 196676 },
			{ startOffsetInclusive: 22, length: 1, token: 32836 },
			{ startOffsetInclusive: 23, length: 1, token: 557124 },
			{ startOffsetInclusive: 24, length: 4, token: 32836 },
			{ startOffsetInclusive: 28, length: 2, token: 32836 },
			{ startOffsetInclusive: 30, length: 1, token: 32836 }
		]);
		const tokens0 = store.getTokensInRange(0, 16);
		assert.deepStrictEqual(tokens0, [
			{ token: 196676, startOffsetInclusive: 0, length: 5 },
			{ token: 32836, startOffsetInclusive: 5, length: 1 },
			{ token: 557124, startOffsetInclusive: 6, length: 1 },
			{ token: 32836, startOffsetInclusive: 7, length: 4 },
			{ token: 32836, startOffsetInclusive: 11, length: 3 },
			{ token: 32836, startOffsetInclusive: 14, length: 2 }
		]);

		store.update(14, [
			{ startOffsetInclusive: 0, length: 5, token: 196676 },
			{ startOffsetInclusive: 5, length: 1, token: 32836 },
			{ startOffsetInclusive: 6, length: 1, token: 557124 },
			{ startOffsetInclusive: 7, length: 4, token: 32836 },
			{ startOffsetInclusive: 11, length: 2, token: 32836 },
			{ startOffsetInclusive: 13, length: 3, token: 32836 }
		]);

		const tokens = store.getTokensInRange(0, 16);
		assert.deepStrictEqual(tokens, [
			{ token: 196676, startOffsetInclusive: 0, length: 5 },
			{ token: 32836, startOffsetInclusive: 5, length: 1 },
			{ token: 557124, startOffsetInclusive: 6, length: 1 },
			{ token: 32836, startOffsetInclusive: 7, length: 4 },
			{ token: 32836, startOffsetInclusive: 11, length: 2 },
			{ token: 32836, startOffsetInclusive: 13, length: 3 }
		]);
	});
	test('Realistic scenario three', () => {
		// inspired by this snippet, with the update adding a space after the { in the constructor
		// /*--
		//  --*/
		//  class TreeViewPane {
		// 	constructor(
		// 		options: IViewletViewOptions,
		// 	) {
		// 	}
		// }


		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 5, token: 164164 },
			{ startOffsetInclusive: 5, length: 1, token: 32836 },
			{ startOffsetInclusive: 6, length: 5, token: 164164 },
			{ startOffsetInclusive: 11, length: 2, token: 32836 },
			{ startOffsetInclusive: 13, length: 5, token: 196676 },
			{ startOffsetInclusive: 18, length: 1, token: 32836 },
			{ startOffsetInclusive: 19, length: 12, token: 557124 },
			{ startOffsetInclusive: 31, length: 4, token: 32836 },
			{ startOffsetInclusive: 35, length: 1, token: 32836 },
			{ startOffsetInclusive: 36, length: 11, token: 196676 },
			{ startOffsetInclusive: 47, length: 3, token: 32836 },
			{ startOffsetInclusive: 50, length: 2, token: 32836 },
			{ startOffsetInclusive: 52, length: 7, token: 327748 },
			{ startOffsetInclusive: 59, length: 1, token: 98372 },
			{ startOffsetInclusive: 60, length: 1, token: 32836 },
			{ startOffsetInclusive: 61, length: 19, token: 557124 },
			{ startOffsetInclusive: 80, length: 1, token: 32836 },
			{ startOffsetInclusive: 81, length: 2, token: 32836 },
			{ startOffsetInclusive: 83, length: 6, token: 32836 },
			{ startOffsetInclusive: 89, length: 4, token: 32836 },
			{ startOffsetInclusive: 93, length: 3, token: 32836 }
		]);
		const tokens0 = store.getTokensInRange(36, 59);
		assert.deepStrictEqual(tokens0, [
			{ token: 196676, startOffsetInclusive: 36, length: 11 },
			{ token: 32836, startOffsetInclusive: 47, length: 3 },
			{ token: 32836, startOffsetInclusive: 50, length: 2 },
			{ token: 327748, startOffsetInclusive: 52, length: 7 }
		]);

		store.update(82, [
			{ startOffsetInclusive: 13, length: 5, token: 196676 },
			{ startOffsetInclusive: 18, length: 1, token: 32836 },
			{ startOffsetInclusive: 19, length: 12, token: 557124 },
			{ startOffsetInclusive: 31, length: 4, token: 32836 },
			{ startOffsetInclusive: 35, length: 1, token: 32836 },
			{ startOffsetInclusive: 36, length: 11, token: 196676 },
			{ startOffsetInclusive: 47, length: 3, token: 32836 },
			{ startOffsetInclusive: 50, length: 2, token: 32836 },
			{ startOffsetInclusive: 52, length: 7, token: 327748 },
			{ startOffsetInclusive: 59, length: 1, token: 98372 },
			{ startOffsetInclusive: 60, length: 1, token: 32836 },
			{ startOffsetInclusive: 61, length: 19, token: 557124 },
			{ startOffsetInclusive: 80, length: 1, token: 32836 },
			{ startOffsetInclusive: 81, length: 2, token: 32836 },
			{ startOffsetInclusive: 83, length: 7, token: 32836 },
			{ startOffsetInclusive: 90, length: 4, token: 32836 },
			{ startOffsetInclusive: 94, length: 3, token: 32836 }
		]);

		const tokens = store.getTokensInRange(36, 59);
		assert.deepStrictEqual(tokens, [
			{ token: 196676, startOffsetInclusive: 36, length: 11 },
			{ token: 32836, startOffsetInclusive: 47, length: 3 },
			{ token: 32836, startOffsetInclusive: 50, length: 2 },
			{ token: 327748, startOffsetInclusive: 52, length: 7 }
		]);
	});
	test('Realistic scenario four', () => {
		// inspired by this snippet, with the update adding a new line after the return true;
		// function x() {
		// 	return true;
		// }

		// class Y {
		// 	private z = false;
		// }

		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 8, token: 196676 },
			{ startOffsetInclusive: 8, length: 1, token: 32836 },
			{ startOffsetInclusive: 9, length: 1, token: 524356 },
			{ startOffsetInclusive: 10, length: 6, token: 32836 },
			{ startOffsetInclusive: 16, length: 1, token: 32836 },
			{ startOffsetInclusive: 17, length: 6, token: 589892 },
			{ startOffsetInclusive: 23, length: 1, token: 32836 },
			{ startOffsetInclusive: 24, length: 4, token: 196676 },
			{ startOffsetInclusive: 28, length: 1, token: 32836 },
			{ startOffsetInclusive: 29, length: 2, token: 32836 },
			{ startOffsetInclusive: 31, length: 3, token: 32836 }, // This is the closing curly brace + newline chars
			{ startOffsetInclusive: 34, length: 2, token: 32836 },
			{ startOffsetInclusive: 36, length: 5, token: 196676 },
			{ startOffsetInclusive: 41, length: 1, token: 32836 },
			{ startOffsetInclusive: 42, length: 1, token: 557124 },
			{ startOffsetInclusive: 43, length: 4, token: 32836 },
			{ startOffsetInclusive: 47, length: 1, token: 32836 },
			{ startOffsetInclusive: 48, length: 7, token: 196676 },
			{ startOffsetInclusive: 55, length: 1, token: 32836 },
			{ startOffsetInclusive: 56, length: 1, token: 327748 },
			{ startOffsetInclusive: 57, length: 1, token: 32836 },
			{ startOffsetInclusive: 58, length: 1, token: 98372 },
			{ startOffsetInclusive: 59, length: 1, token: 32836 },
			{ startOffsetInclusive: 60, length: 5, token: 196676 },
			{ startOffsetInclusive: 65, length: 1, token: 32836 },
			{ startOffsetInclusive: 66, length: 2, token: 32836 },
			{ startOffsetInclusive: 68, length: 1, token: 32836 }
		]);
		const tokens0 = store.getTokensInRange(36, 59);
		assert.deepStrictEqual(tokens0, [
			{ startOffsetInclusive: 36, length: 5, token: 196676 },
			{ startOffsetInclusive: 41, length: 1, token: 32836 },
			{ startOffsetInclusive: 42, length: 1, token: 557124 },
			{ startOffsetInclusive: 43, length: 4, token: 32836 },
			{ startOffsetInclusive: 47, length: 1, token: 32836 },
			{ startOffsetInclusive: 48, length: 7, token: 196676 },
			{ startOffsetInclusive: 55, length: 1, token: 32836 },
			{ startOffsetInclusive: 56, length: 1, token: 327748 },
			{ startOffsetInclusive: 57, length: 1, token: 32836 },
			{ startOffsetInclusive: 58, length: 1, token: 98372 }
		]);

		// insert a tab + new line after `return true;` (like hitting enter after the ;)
		store.update(32, [
			{ startOffsetInclusive: 0, length: 8, token: 196676 },
			{ startOffsetInclusive: 8, length: 1, token: 32836 },
			{ startOffsetInclusive: 9, length: 1, token: 524356 },
			{ startOffsetInclusive: 10, length: 6, token: 32836 },
			{ startOffsetInclusive: 16, length: 1, token: 32836 },
			{ startOffsetInclusive: 17, length: 6, token: 589892 },
			{ startOffsetInclusive: 23, length: 1, token: 32836 },
			{ startOffsetInclusive: 24, length: 4, token: 196676 },
			{ startOffsetInclusive: 28, length: 1, token: 32836 },
			{ startOffsetInclusive: 29, length: 2, token: 32836 },
			{ startOffsetInclusive: 31, length: 3, token: 32836 }, // This is the new line, which consists of 3 characters: \t\r\n
			{ startOffsetInclusive: 34, length: 2, token: 32836 }
		]);

		const tokens1 = store.getTokensInRange(36, 59);
		assert.deepStrictEqual(tokens1, [
			{ startOffsetInclusive: 36, length: 2, token: 32836 },
			{ startOffsetInclusive: 38, length: 2, token: 32836 },
			{ startOffsetInclusive: 40, length: 5, token: 196676 },
			{ startOffsetInclusive: 45, length: 1, token: 32836 },
			{ startOffsetInclusive: 46, length: 1, token: 557124 },
			{ startOffsetInclusive: 47, length: 4, token: 32836 },
			{ startOffsetInclusive: 51, length: 1, token: 32836 },
			{ startOffsetInclusive: 52, length: 7, token: 196676 }
		]);

		// Delete the tab character
		store.update(37, [
			{ startOffsetInclusive: 0, length: 8, token: 196676 },
			{ startOffsetInclusive: 8, length: 1, token: 32836 },
			{ startOffsetInclusive: 9, length: 1, token: 524356 },
			{ startOffsetInclusive: 10, length: 6, token: 32836 },
			{ startOffsetInclusive: 16, length: 1, token: 32836 },
			{ startOffsetInclusive: 17, length: 6, token: 589892 },
			{ startOffsetInclusive: 23, length: 1, token: 32836 },
			{ startOffsetInclusive: 24, length: 4, token: 196676 },
			{ startOffsetInclusive: 28, length: 1, token: 32836 },
			{ startOffsetInclusive: 29, length: 2, token: 32836 },
			{ startOffsetInclusive: 31, length: 2, token: 32836 }, // This is the changed line: \t\r\n to \r\n
			{ startOffsetInclusive: 33, length: 3, token: 32836 }
		]);

		const tokens2 = store.getTokensInRange(36, 59);
		assert.deepStrictEqual(tokens2, [
			{ startOffsetInclusive: 36, length: 1, token: 32836 },
			{ startOffsetInclusive: 37, length: 2, token: 32836 },
			{ startOffsetInclusive: 39, length: 5, token: 196676 },
			{ startOffsetInclusive: 44, length: 1, token: 32836 },
			{ startOffsetInclusive: 45, length: 1, token: 557124 },
			{ startOffsetInclusive: 46, length: 4, token: 32836 },
			{ startOffsetInclusive: 50, length: 1, token: 32836 },
			{ startOffsetInclusive: 51, length: 7, token: 196676 },
			{ startOffsetInclusive: 58, length: 1, token: 32836 }
		]);

	});

	test('Insert new line and remove tabs (split tokens)', () => {
		// class A {
		// 	a() {
		// 	}
		// }
		//
		// interface I {
		//
		// }

		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 5, token: 196676 },
			{ startOffsetInclusive: 5, length: 1, token: 32836 },
			{ startOffsetInclusive: 6, length: 1, token: 557124 },
			{ startOffsetInclusive: 7, length: 3, token: 32836 },
			{ startOffsetInclusive: 10, length: 1, token: 32836 },
			{ startOffsetInclusive: 11, length: 1, token: 524356 },
			{ startOffsetInclusive: 12, length: 5, token: 32836 },
			{ startOffsetInclusive: 17, length: 3, token: 32836 }, // This is the closing curly brace line of a()
			{ startOffsetInclusive: 20, length: 2, token: 32836 },
			{ startOffsetInclusive: 22, length: 1, token: 32836 },
			{ startOffsetInclusive: 23, length: 9, token: 196676 },
			{ startOffsetInclusive: 32, length: 1, token: 32836 },
			{ startOffsetInclusive: 33, length: 1, token: 557124 },
			{ startOffsetInclusive: 34, length: 3, token: 32836 },
			{ startOffsetInclusive: 37, length: 1, token: 32836 },
			{ startOffsetInclusive: 38, length: 1, token: 32836 }
		]);

		const tokens0 = store.getTokensInRange(23, 39);
		assert.deepStrictEqual(tokens0, [
			{ startOffsetInclusive: 23, length: 9, token: 196676 },
			{ startOffsetInclusive: 32, length: 1, token: 32836 },
			{ startOffsetInclusive: 33, length: 1, token: 557124 },
			{ startOffsetInclusive: 34, length: 3, token: 32836 },
			{ startOffsetInclusive: 37, length: 1, token: 32836 },
			{ startOffsetInclusive: 38, length: 1, token: 32836 }
		]);

		// Insert a new line after a() { }, which will add 2 tabs
		store.update(21, [
			{ startOffsetInclusive: 0, length: 5, token: 196676 },
			{ startOffsetInclusive: 5, length: 1, token: 32836 },
			{ startOffsetInclusive: 6, length: 1, token: 557124 },
			{ startOffsetInclusive: 7, length: 3, token: 32836 },
			{ startOffsetInclusive: 10, length: 1, token: 32836 },
			{ startOffsetInclusive: 11, length: 1, token: 524356 },
			{ startOffsetInclusive: 12, length: 5, token: 32836 },
			{ startOffsetInclusive: 17, length: 3, token: 32836 },
			{ startOffsetInclusive: 20, length: 3, token: 32836 },
			{ startOffsetInclusive: 23, length: 1, token: 32836 }
		]);

		const tokens1 = store.getTokensInRange(26, 42);
		assert.deepStrictEqual(tokens1, [
			{ startOffsetInclusive: 26, length: 9, token: 196676 },
			{ startOffsetInclusive: 35, length: 1, token: 32836 },
			{ startOffsetInclusive: 36, length: 1, token: 557124 },
			{ startOffsetInclusive: 37, length: 3, token: 32836 },
			{ startOffsetInclusive: 40, length: 1, token: 32836 },
			{ startOffsetInclusive: 41, length: 1, token: 32836 }
		]);

		// Insert another new line at the cursor, which will also cause the 2 tabs to be deleted
		store.update(24, [
			{ startOffsetInclusive: 0, length: 5, token: 196676 },
			{ startOffsetInclusive: 5, length: 1, token: 32836 },
			{ startOffsetInclusive: 6, length: 1, token: 557124 },
			{ startOffsetInclusive: 7, length: 3, token: 32836 },
			{ startOffsetInclusive: 10, length: 1, token: 32836 },
			{ startOffsetInclusive: 11, length: 1, token: 524356 },
			{ startOffsetInclusive: 12, length: 5, token: 32836 },
			{ startOffsetInclusive: 17, length: 3, token: 32836 },
			{ startOffsetInclusive: 20, length: 1, token: 32836 },
			{ startOffsetInclusive: 21, length: 2, token: 32836 },
			{ startOffsetInclusive: 23, length: 1, token: 32836 }
		]);

		const tokens2 = store.getTokensInRange(26, 42);
		assert.deepStrictEqual(tokens2, [
			{ startOffsetInclusive: 26, length: 9, token: 196676 },
			{ startOffsetInclusive: 35, length: 1, token: 32836 },
			{ startOffsetInclusive: 36, length: 1, token: 557124 },
			{ startOffsetInclusive: 37, length: 3, token: 32836 },
			{ startOffsetInclusive: 40, length: 1, token: 32836 },
			{ startOffsetInclusive: 41, length: 1, token: 32836 }
		]);
	});

	test('delete removes tokens in the middle', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 3, token: 3 }
		]);
		store.delete(3, 3); // delete 3 chars starting at offset 3
		const tokens = store.getTokensInRange(0, 9);
		assert.deepStrictEqual(tokens, [
			{ startOffsetInclusive: 0, length: 3, token: 1 },
			{ startOffsetInclusive: 3, length: 3, token: 3 }
		]);
	});

	test('delete merges partially affected token', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 5, token: 1 },
			{ startOffsetInclusive: 5, length: 5, token: 2 }
		]);
		store.delete(3, 4); // removes 4 chars within token 1 and partially token 2
		const tokens = store.getTokensInRange(0, 10);
		assert.deepStrictEqual(tokens, [
			{ startOffsetInclusive: 0, length: 4, token: 1 },
			// token 2 is now shifted left by 4
			{ startOffsetInclusive: 4, length: 3, token: 2 }
		]);
	});

	test('replace a token with a slightly larger token', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 5, token: 1 },
			{ startOffsetInclusive: 5, length: 1, token: 2 },
			{ startOffsetInclusive: 6, length: 1, token: 2 },
			{ startOffsetInclusive: 7, length: 17, token: 2 },
			{ startOffsetInclusive: 24, length: 1, token: 2 },
			{ startOffsetInclusive: 25, length: 5, token: 2 },
			{ startOffsetInclusive: 30, length: 1, token: 2 },
			{ startOffsetInclusive: 31, length: 1, token: 2 },
			{ startOffsetInclusive: 32, length: 5, token: 2 }
		]);
		store.update(17, [{ startOffsetInclusive: 7, length: 19, token: 0 }]); // removes 4 chars within token 1 and partially token 2
		const tokens = store.getTokensInRange(0, 39);
		assert.deepStrictEqual(tokens, [
			{ startOffsetInclusive: 0, length: 5, token: 1 },
			{ startOffsetInclusive: 5, length: 1, token: 2 },
			{ startOffsetInclusive: 6, length: 1, token: 2 },
			{ startOffsetInclusive: 7, length: 19, token: 0 },
			{ startOffsetInclusive: 26, length: 1, token: 2 },
			{ startOffsetInclusive: 27, length: 5, token: 2 },
			{ startOffsetInclusive: 32, length: 1, token: 2 },
			{ startOffsetInclusive: 33, length: 1, token: 2 },
			{ startOffsetInclusive: 34, length: 5, token: 2 }
		]);
	});

	test('replace a character from a large token', () => {
		const store = new TokenStore(textModel);
		store.buildStore([
			{ startOffsetInclusive: 0, length: 2, token: 1 },
			{ startOffsetInclusive: 2, length: 5, token: 2 },
			{ startOffsetInclusive: 7, length: 1, token: 3 }
		]);
		store.delete(1, 3);
		const tokens = store.getTokensInRange(0, 7);
		assert.deepStrictEqual(tokens, [
			{ startOffsetInclusive: 0, length: 2, token: 1 },
			{ startOffsetInclusive: 2, length: 1, token: 2 },
			{ startOffsetInclusive: 3, length: 3, token: 2 },
			{ startOffsetInclusive: 6, length: 1, token: 3 }
		]);
	});
});

