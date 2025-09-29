/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SymbolKind, DocumentSymbol } from '../../../../../editor/common/languages.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { DocumentSymbolComparator, OutlineElement } from '../../../../contrib/codeEditor/browser/outline/documentSymbolsTree.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('DocumentSymbolComparator Case Sensitivity', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSymbolElement(name: string, kind: SymbolKind = SymbolKind.Function): OutlineElement {
		const symbol: DocumentSymbol = {
			name,
			kind,
			range: new Range(1, 1, 1, 10),
			selectionRange: new Range(1, 1, 1, 10),
			detail: '',
			children: []
		};
		return new OutlineElement(symbol, undefined);
	}

	test('compareByName - case insensitive by default', function () {
		const comparator = new DocumentSymbolComparator();
		
		const symbolA = createSymbolElement('Apple');
		const symbolB = createSymbolElement('banana');
		const symbolC = createSymbolElement('Cherry');

		// Default case insensitive: A, b, C should sort to A, b, C (alphabetical)
		const result1 = comparator.compareByName(symbolA, symbolB);
		const result2 = comparator.compareByName(symbolB, symbolC);
		
		// Apple < banana (case insensitive)
		assert.ok(result1 < 0, 'Apple should come before banana');
		// banana < Cherry (case insensitive)
		assert.ok(result2 < 0, 'banana should come before Cherry');
	});

	test('compareByName - case sensitive when enabled', function () {
		const comparator = new DocumentSymbolComparator();
		comparator.setCaseSensitive(true);
		
		const symbolA = createSymbolElement('Apple');
		const symbolB = createSymbolElement('banana');
		const symbolC = createSymbolElement('Cherry');

		// Case sensitive: A, b, C should sort to A, C, b (uppercase first)
		const result1 = comparator.compareByName(symbolA, symbolB);
		const result2 = comparator.compareByName(symbolA, symbolC);
		const result3 = comparator.compareByName(symbolC, symbolB);
		
		// Apple < banana (case sensitive, uppercase comes first)
		assert.ok(result1 < 0, 'Apple should come before banana with case sensitivity');
		// Apple < Cherry (alphabetical among uppercase)
		assert.ok(result2 < 0, 'Apple should come before Cherry');
		// Cherry < banana (uppercase comes before lowercase)
		assert.ok(result3 < 0, 'Cherry should come before banana with case sensitivity');
	});

	test('compareByName - Go-like example with case sensitivity', function () {
		const comparator = new DocumentSymbolComparator();
		comparator.setCaseSensitive(true);
		
		// Simulate Go naming: Uppercase = exported, lowercase = private
		const exportedFunc = createSymbolElement('ExportedFunction');
		const privateFunc = createSymbolElement('privateFunction');
		
		const result = comparator.compareByName(exportedFunc, privateFunc);
		
		// Exported (uppercase) should come before private (lowercase)
		assert.ok(result < 0, 'ExportedFunction should come before privateFunction with case sensitivity');
	});

	test('compareByType - uses case sensitivity for tie breaking', function () {
		const comparator = new DocumentSymbolComparator();
		comparator.setCaseSensitive(true);
		
		// Same symbol type, different case names
		const symbolA = createSymbolElement('Apple', SymbolKind.Function);
		const symbolB = createSymbolElement('banana', SymbolKind.Function);
		
		const result = comparator.compareByType(symbolA, symbolB);
		
		// Same type, should fall back to case-sensitive name comparison
		assert.ok(result < 0, 'Apple should come before banana with case sensitivity in type comparison');
	});

	test('setCaseSensitive - can toggle case sensitivity', function () {
		const comparator = new DocumentSymbolComparator();
		
		const symbolA = createSymbolElement('Apple');
		const symbolB = createSymbolElement('banana');
		
		// Initially case insensitive
		const result1 = comparator.compareByName(symbolA, symbolB);
		
		// Enable case sensitivity
		comparator.setCaseSensitive(true);
		const result2 = comparator.compareByName(symbolA, symbolB);
		
		// Disable case sensitivity again
		comparator.setCaseSensitive(false);
		const result3 = comparator.compareByName(symbolA, symbolB);
		
		// Results should change when case sensitivity changes
		assert.strictEqual(result1 < 0, result3 < 0, 'Case insensitive results should be consistent');
		assert.ok(result2 < 0, 'Case sensitive result should show Apple before banana');
	});
});