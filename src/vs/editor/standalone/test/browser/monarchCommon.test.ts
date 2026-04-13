import assert from 'assert';
import { findRules, ILexer } from '../../common/monarch/monarchCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Monarch Common', () => {
    ensureNoDisposablesAreLeakedInTestSuite();

	test('findRules should return the correct rules for a given state', () => {
		const lexer = {
			tokenizer: {
				'state1': [{ action: 'action1', matchOnlyAtLineStart: false, name: 'rule1', resolveRegex: () => /regex1/ }],
				'state1.child': [{ action: 'action2', matchOnlyAtLineStart: false, name: 'rule2', resolveRegex: () => /regex2/ }],
				'state2': [{ action: 'action3', matchOnlyAtLineStart: false, name: 'rule3', resolveRegex: () => /regex3/ }]
			}
		} as unknown as ILexer;

		const rules1 = findRules(lexer, 'state1');
		assert.ok(rules1);
		assert.strictEqual(rules1.length, 1);
		assert.strictEqual(rules1[0].name, 'rule1');

		const rules1Child = findRules(lexer, 'state1.child');
		assert.ok(rules1Child);
		assert.strictEqual(rules1Child.length, 1);
		assert.strictEqual(rules1Child[0].name, 'rule2');

		const rules1ChildParentFallback = findRules(lexer, 'state1.child.grandchild');
		assert.ok(rules1ChildParentFallback);
		assert.strictEqual(rules1ChildParentFallback.length, 1);
		assert.strictEqual(rules1ChildParentFallback[0].name, 'rule2');

		const rulesUnknownFallback = findRules(lexer, 'state3.child');
		assert.strictEqual(rulesUnknownFallback, null);
	});
});
