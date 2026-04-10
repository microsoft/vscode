/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parse, YamlNode, YamlScalarNode, YamlMapNode, YamlSequenceNode, YamlParseError } from '../../common/yaml.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

// Helper to parse and assert no errors
function parseOk(input: string): YamlNode | undefined {
	const errors: YamlParseError[] = [];
	const result = parse(input, errors);
	assert.deepStrictEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors)}`);
	return result;
}

// Helper to assert a scalar node and verify its offsets match the raw value in the input
function assertScalar(input: string, node: YamlNode | undefined, expected: { value: string; format?: 'single' | 'double' | 'none' | 'literal' | 'folded' }): void {
	assert.ok(node, 'Expected a node but got undefined');
	assert.strictEqual(node.type, 'scalar');
	const scalar = node as YamlScalarNode;
	assert.strictEqual(scalar.value, expected.value);
	if (expected.format !== undefined) {
		assert.strictEqual(scalar.format, expected.format);
	}
	// Verify that the offsets correctly correspond to the rawValue in the input
	assert.strictEqual(
		input.substring(scalar.startOffset, scalar.endOffset),
		scalar.rawValue,
		`Offset mismatch: input[${scalar.startOffset}..${scalar.endOffset}] is "${input.substring(scalar.startOffset, scalar.endOffset)}" but rawValue is "${scalar.rawValue}"`
	);
}

// Helper to assert a map node and return properties for further assertions
function assertMap(node: YamlNode | undefined, expectedKeyCount: number): YamlMapNode {
	assert.ok(node, 'Expected a node but got undefined');
	assert.strictEqual(node.type, 'map', `Expected map but got ${node.type}`);
	const map = node as YamlMapNode;
	assert.strictEqual(map.properties.length, expectedKeyCount, `Expected ${expectedKeyCount} properties but got ${map.properties.length}`);
	return map;
}

// Helper to assert a sequence node and return items
function assertSequence(node: YamlNode | undefined, expectedItemCount: number): YamlSequenceNode {
	assert.ok(node, 'Expected a node but got undefined');
	assert.strictEqual(node.type, 'sequence', `Expected sequence but got ${node.type}`);
	const seq = node as YamlSequenceNode;
	assert.strictEqual(seq.items.length, expectedItemCount, `Expected ${expectedItemCount} items but got ${seq.items.length}`);
	return seq;
}

suite('YAML Parser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Empty input', () => {
		test('returns undefined for empty string', () => {
			assert.strictEqual(parseOk(''), undefined);
		});

		test('returns undefined for whitespace-only input', () => {
			assert.strictEqual(parseOk('   '), undefined);
		});

		test('returns undefined for newline-only input', () => {
			assert.strictEqual(parseOk('\n\n'), undefined);
		});
	});

	suite('Scalars', () => {
		test('unquoted scalar', () => {
			const input = 'hello world';
			const node = parseOk(input);
			assertScalar(input, node, { value: 'hello world', format: 'none' });
		});

		test('literal block scalar format', () => {
			const input = [
				'text: |',
				'  line one',
				'  line two',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'line one\nline two\n', format: 'literal' });
		});

		test('folded block scalar format', () => {
			const input = [
				'text: >',
				'  line one',
				'  line two',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'line one line two\n', format: 'folded' });
		});

		test('literal block scalar strip chomping (|-)', () => {
			const input = [
				'text: |-',
				'  line one',
				'  line two',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'line one\nline two', format: 'literal' });
		});

		test('literal block scalar keep chomping (|+)', () => {
			const input = [
				'text: |+',
				'  line one',
				'  line two',
				'',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'line one\nline two\n', format: 'literal' });
		});

		test('folded block scalar strip chomping (>-)', () => {
			const input = [
				'text: >-',
				'  line one',
				'  line two',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'line one line two', format: 'folded' });
		});

		test('folded block scalar keep chomping (>+)', () => {
			const input = [
				'text: >+',
				'  line one',
				'  line two',
				'',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'line one line two\n', format: 'folded' });
		});

		test('single-quoted scalar', () => {
			const input = `'hello world'`;
			const node = parseOk(input);
			assertScalar(input, node, { value: 'hello world', format: 'single' });
		});

		test('double-quoted scalar', () => {
			const input = '"hello world"';
			const node = parseOk(input);
			assertScalar(input, node, { value: 'hello world', format: 'double' });
		});

		test('double-quoted scalar with escape sequences', () => {
			const input = '"hello\\nworld"';
			const node = parseOk(input);
			assertScalar(input, node, { value: 'hello\nworld', format: 'double' });
		});

		test('single-quoted scalar with escaped single quote', () => {
			const input = `'it''s a test'`;
			const node = parseOk(input);
			assertScalar(input, node, { value: `it's a test`, format: 'single' });
		});

		test('scalar offsets are correct', () => {
			const node = parseOk('hello') as YamlScalarNode;
			assert.strictEqual(node.startOffset, 0);
			assert.strictEqual(node.endOffset, 5);
		});
	});

	suite('Block mappings', () => {
		test('simple key-value pair', () => {
			const input = 'name: John Doe';
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assert.strictEqual(map.properties[0].key.value, 'name');
			assertScalar(input, map.properties[0].value, { value: 'John Doe' });
		});

		test('multiple key-value pairs', () => {
			const input = [
				'name: John Doe',
				'age: 30',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 2);
			assert.strictEqual(map.properties[0].key.value, 'name');
			assertScalar(input, map.properties[0].value, { value: 'John Doe' });
			assert.strictEqual(map.properties[1].key.value, 'age');
			assertScalar(input, map.properties[1].value, { value: '30' });
		});

		test('nested mappings', () => {
			const input = [
				'name: John Doe',
				'age: 30',
				'mother:',
				'  name: Susi Doe',
				'  age: 50',
				'  address:',
				'    street: 123 Main St',
				'    city: Example City',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 3);
			assert.strictEqual(map.properties[0].key.value, 'name');
			assert.strictEqual(map.properties[2].key.value, 'mother');
			const mother = assertMap(map.properties[2].value, 3);
			assert.strictEqual(mother.properties[0].key.value, 'name');
			assertScalar(input, mother.properties[0].value, { value: 'Susi Doe' });
			const address = assertMap(mother.properties[2].value, 2);
			assert.strictEqual(address.properties[0].key.value, 'street');
			assertScalar(input, address.properties[0].value, { value: '123 Main St' });
		});

		test('mapping with quoted keys and values', () => {
			const input = [
				'"name": \'John Doe\'',
				'\'age\': "30"',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 2);
			assert.strictEqual(map.properties[0].key.format, 'double');
			assert.strictEqual((map.properties[0].value as YamlScalarNode).format, 'single');
		});

		test('mapping offsets', () => {
			const input = 'name: John';
			const node = parseOk(input) as YamlMapNode;
			assert.strictEqual(node.startOffset, 0);
			assert.strictEqual(node.endOffset, 10);
		});
	});

	suite('Block sequences', () => {
		test('simple sequence', () => {
			const input = [
				'- Apple',
				'- Banana',
				'- Cherry',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 3);
			assertScalar(input, seq.items[0], { value: 'Apple' });
			assertScalar(input, seq.items[1], { value: 'Banana' });
			assertScalar(input, seq.items[2], { value: 'Cherry' });
		});

		// Spec Example 2.4. Sequence of Mappings (229Q)
		test('spec 2.4 - sequence of mappings (229Q)', () => {
			const input = [
				'-',
				'  name: Mark McGwire',
				'  hr:   65',
				'  avg:  0.278',
				'-',
				'  name: Sammy Sosa',
				'  hr:   63',
				'  avg:  0.288',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 2);

			const first = assertMap(seq.items[0], 3);
			assert.strictEqual(first.properties[0].key.value, 'name');
			assertScalar(input, first.properties[0].value, { value: 'Mark McGwire' });
			assert.strictEqual(first.properties[1].key.value, 'hr');
			assertScalar(input, first.properties[1].value, { value: '65' });
			assert.strictEqual(first.properties[2].key.value, 'avg');
			assertScalar(input, first.properties[2].value, { value: '0.278' });

			const second = assertMap(seq.items[1], 3);
			assert.strictEqual(second.properties[0].key.value, 'name');
			assertScalar(input, second.properties[0].value, { value: 'Sammy Sosa' });
			assert.strictEqual(second.properties[1].key.value, 'hr');
			assertScalar(input, second.properties[1].value, { value: '63' });
			assert.strictEqual(second.properties[2].key.value, 'avg');
			assertScalar(input, second.properties[2].value, { value: '0.288' });
		});

		test('sequence of mappings', () => {
			const input = [
				'-',
				'  name: Mark McGwire',
				'  hr:   65',
				'  avg:  0.278',
				'-',
				'  name: Sammy Sosa',
				'  hr:   63',
				'  avg:  0.288',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 2);
			const first = assertMap(seq.items[0], 3);
			assertScalar(input, first.properties[0].value, { value: 'Mark McGwire' });
			const second = assertMap(seq.items[1], 3);
			assertScalar(input, second.properties[0].value, { value: 'Sammy Sosa' });
		});

		test('map of sequences', () => {
			const input = [
				'american:',
				'  - Boston Red Sox',
				'  - Detroit Tigers',
				'  - New York Yankees',
				'national:',
				'  - New York Mets',
				'  - Chicago Cubs',
				'  - Atlanta Braves',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 2);
			const american = assertSequence(map.properties[0].value, 3);
			assertScalar(input, american.items[0], { value: 'Boston Red Sox' });
			const national = assertSequence(map.properties[1].value, 3);
			assertScalar(input, national.items[2], { value: 'Atlanta Braves' });
		});

		test('inline mapping after dash', () => {
			const input = [
				'- name: Mark McGwire',
				'  hr: 65',
				'- name: Sammy Sosa',
				'  hr: 63',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 2);
			const first = assertMap(seq.items[0], 2);
			assertScalar(input, first.properties[0].value, { value: 'Mark McGwire' });
		});
	});

	suite('Flow mappings', () => {
		test('simple flow mapping', () => {
			const input = '{hr: 65, avg: 0.278}';
			const node = parseOk(input);
			const map = assertMap(node, 2);
			assert.strictEqual(map.properties[0].key.value, 'hr');
			assertScalar(input, map.properties[0].value, { value: '65' });
			assert.strictEqual(map.properties[1].key.value, 'avg');
			assertScalar(input, map.properties[1].value, { value: '0.278' });
		});

		test('flow mapping offsets', () => {
			const input = '{hr: 65}';
			const node = parseOk(input) as YamlMapNode;
			assert.strictEqual(node.startOffset, 0);
			assert.strictEqual(node.endOffset, 8);
		});
	});

	suite('Flow sequences', () => {
		test('simple flow sequence', () => {
			const input = '[Sammy Sosa  , 63, 0.288]';
			const node = parseOk(input);
			const seq = assertSequence(node, 3);
			assertScalar(input, seq.items[0], { value: 'Sammy Sosa' });
			assertScalar(input, seq.items[1], { value: '63' });
			assertScalar(input, seq.items[2], { value: '0.288' });
		});

		test('flow sequence with quoted strings', () => {
			const input = `[ 'Sammy Sosa', 63, 0.288]`;
			const node = parseOk(input);
			const seq = assertSequence(node, 3);
			assertScalar(input, seq.items[0], { value: 'Sammy Sosa', format: 'single' });
		});

		test('flow sequence offsets', () => {
			const input = '[a, b]';
			const node = parseOk(input) as YamlSequenceNode;
			assert.strictEqual(node.startOffset, 0);
			assert.strictEqual(node.endOffset, 6);
		});
	});

	suite('Mixed structures', () => {
		test('object with scalars, arrays, inline objects and arrays', () => {
			const input = [
				'object:',
				'    street: 123 Main St',
				'    city: "Example City"',
				'array:',
				'  - Boston Red Sox',
				`  - 'Detroit Tigers'`,
				'inline object: {hr: 65, avg: 0.278}',
				`inline array: [ 'Sammy Sosa', 63, 0.288]`,
				'bool: false',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 5);

			// Nested object
			const obj = assertMap(map.properties[0].value, 2);
			assertScalar(input, obj.properties[0].value, { value: '123 Main St' });
			assertScalar(input, obj.properties[1].value, { value: 'Example City', format: 'double' });

			// Array
			const arr = assertSequence(map.properties[1].value, 2);
			assertScalar(input, arr.items[0], { value: 'Boston Red Sox' });
			assertScalar(input, arr.items[1], { value: 'Detroit Tigers', format: 'single' });

			// Inline object
			const inlineObj = assertMap(map.properties[2].value, 2);
			assertScalar(input, inlineObj.properties[0].value, { value: '65' });

			// Inline array
			const inlineArr = assertSequence(map.properties[3].value, 3);
			assertScalar(input, inlineArr.items[0], { value: 'Sammy Sosa', format: 'single' });

			// Boolean as scalar
			assertScalar(input, map.properties[4].value, { value: 'false' });
		});

		test('arrays of inline arrays', () => {
			const input = [
				'- [name        , hr, avg  ]',
				'- [Mark McGwire, 65, 0.278]',
				'- [Sammy Sosa  , 63, 0.288]',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 3);

			const header = assertSequence(seq.items[0], 3);
			assertScalar(input, header.items[0], { value: 'name' });
			assertScalar(input, header.items[1], { value: 'hr' });
			assertScalar(input, header.items[2], { value: 'avg' });

			const row1 = assertSequence(seq.items[1], 3);
			assertScalar(input, row1.items[0], { value: 'Mark McGwire' });
		});
	});

	suite('Comments', () => {
		test('comment-only lines are ignored', () => {
			const input = [
				'# This is a comment',
				'name: John',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assert.strictEqual(map.properties[0].key.value, 'name');
		});

		test('inline comment after value', () => {
			const input = [
				'hr: # 1998 hr ranking',
				'  - Mark McGwire',
				'  - Sammy Sosa',
				'rbi:',
				'  # 1998 rbi ranking',
				'  - Sammy Sosa',
				'  - Ken Griffey#part of the value, not a comment',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 2);

			const hr = assertSequence(map.properties[0].value, 2);
			assertScalar(input, hr.items[0], { value: 'Mark McGwire' });

			const rbi = assertSequence(map.properties[1].value, 2);
			// '#' without leading space is part of the value
			assertScalar(input, rbi.items[1], { value: 'Ken Griffey#part of the value, not a comment' });
		});
	});

	suite('Error handling', () => {
		test('missing value emits error and creates empty scalar', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'name:',
				'age: 30',
			].join('\n');
			const node = parse(input, errors);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].value, { value: '' });
			assert.ok(errors.some(e => e.code === 'missing-value'));
		});

		test('duplicate keys emit errors', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'name: John',
				'name: Jane',
			].join('\n');
			const node = parse(input, errors);
			assertMap(node, 2);
			assert.ok(errors.some(e => e.code === 'duplicate-key'));
		});

		test('duplicate keys allowed with option', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'name: John',
				'name: Jane',
			].join('\n');
			const node = parse(input, errors, { allowDuplicateKeys: true });
			assertMap(node, 2);
			assert.strictEqual(errors.length, 0);
		});

		test('wrong indentation emits error but still parses', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'parent:',
				'  child1: a',
				'    child2: b',
			].join('\n');
			const node = parse(input, errors);
			assert.ok(node);
			// Should have produced an indentation error
			assert.ok(errors.some(e => e.code === 'unexpected-indentation'));
		});
	});

	suite('Offset tracking', () => {
		test('scalar offsets in mapping', () => {
			const input = 'key: value';
			const map = parseOk(input) as YamlMapNode;
			assert.strictEqual(map.properties[0].key.startOffset, 0);
			assert.strictEqual(map.properties[0].key.endOffset, 3);
			const val = map.properties[0].value as YamlScalarNode;
			assert.strictEqual(val.startOffset, 5);
			assert.strictEqual(val.endOffset, 10);
		});

		test('offsets are zero-based and endOffset is exclusive', () => {
			const input = '"hi"';
			const node = parseOk(input) as YamlScalarNode;
			assert.strictEqual(node.startOffset, 0);
			assert.strictEqual(node.endOffset, 4);
			assert.strictEqual(node.value, 'hi');
			assert.strictEqual(node.rawValue, '"hi"');
		});

		test('sequence item offsets', () => {
			const input = [
				'- a',
				'- b',
			].join('\n');
			const seq = parseOk(input) as YamlSequenceNode;
			const first = seq.items[0] as YamlScalarNode;
			assert.strictEqual(first.startOffset, 2);
			assert.strictEqual(first.endOffset, 3);
		});
	});

	suite('Nested sequences', () => {
		test('block sequence in block sequence (dash-dash)', () => {
			const input = [
				'- - s1_i1',
				'  - s1_i2',
				'- s2',
			].join('\n');
			const outer = assertSequence(parseOk(input), 2);
			const inner = assertSequence(outer.items[0], 2);
			assertScalar(input, inner.items[0], { value: 's1_i1' });
			assertScalar(input, inner.items[1], { value: 's1_i2' });
			assertScalar(input, outer.items[1], { value: 's2' });
		});

		test('sequence at same indent as parent mapping key', () => {
			const input = [
				'one:',
				'- 2',
				'- 3',
				'four: 5',
			].join('\n');
			const map = assertMap(parseOk(input), 2);
			assertScalar(input, map.properties[0].key, { value: 'one' });
			const seq = assertSequence(map.properties[0].value, 2);
			assertScalar(input, seq.items[0], { value: '2' });
			assertScalar(input, seq.items[1], { value: '3' });
			assertScalar(input, map.properties[1].key, { value: 'four' });
			assertScalar(input, map.properties[1].value, { value: '5' });
		});

		test('sequence indented under mapping key', () => {
			const input = [
				'foo:',
				'  - 42',
				'bar:',
				'  - 44',
			].join('\n');
			const map = assertMap(parseOk(input), 2);
			const seq1 = assertSequence(map.properties[0].value, 1);
			assertScalar(input, seq1.items[0], { value: '42' });
			const seq2 = assertSequence(map.properties[1].value, 1);
			assertScalar(input, seq2.items[0], { value: '44' });
		});
	});

	suite('Multiline plain scalars', () => {
		test('multiline scalar in mapping value', () => {
			const input = [
				'a: b',
				' c',
			].join('\n');
			const map = assertMap(parseOk(input), 1);
			assertScalar(input, map.properties[0].value, { value: 'b c' });
		});

		test('multiline scalar with multiple continuation lines', () => {
			const input = [
				'plain:',
				'  This unquoted scalar',
				'  spans many lines.',
			].join('\n');
			const map = assertMap(parseOk(input), 1);
			assertScalar(input, map.properties[0].value, { value: 'This unquoted scalar spans many lines.' });
		});

		test('multiline scalar at top level', () => {
			const input = [
				'a',
				'b',
				'  c',
				'd',
			].join('\n');
			const result = parseOk(input);
			assertScalar(input, result, { value: 'a b c d' });
		});

		test('multiline scalar with empty line preserves newline', () => {
			const input = [
				'a: val1',
				' val2',
				'',
				' val3',
			].join('\n');
			const map = assertMap(parseOk(input), 1);
			// Empty line between val2 and val3 becomes \n
			assertScalar(input, map.properties[0].value, { value: 'val1 val2\nval3' });
		});

		test('multiline scalar stops at same indent as mapping', () => {
			const input = [
				'a: b',
				' c',
				'd: e',
			].join('\n');
			const map = assertMap(parseOk(input), 2);
			assertScalar(input, map.properties[0].value, { value: 'b c' });
			assertScalar(input, map.properties[1].value, { value: 'e' });
		});

		test('multiline scalar value on next line', () => {
			const input = [
				'a:',
				'  b',
				'  c',
			].join('\n');
			const map = assertMap(parseOk(input), 1);
			assertScalar(input, map.properties[0].value, { value: 'b c' });
		});

		test('multiline scalar stops at comment', () => {
			const input = [
				'value1',
				'# a comment',
				'value2',
			].join('\n');
			// Comment terminates the scalar continuation, so value2 is not part of value1
			const result = parseOk(input);
			assertScalar(input, result, { value: 'value1' });
		});

		test('multiline scalar with multiple mappings', () => {
			const input = [
				'a: b',
				' c',
				'd:',
				' e',
				'  f',
			].join('\n');
			const map = assertMap(parseOk(input), 2);
			assertScalar(input, map.properties[0].value, { value: 'b c' });
			assertScalar(input, map.properties[1].value, { value: 'e f' });
		});
	});

	suite('Edge cases', () => {
		test('colon in unquoted value', () => {
			const input = 'url: http://example.com';
			const map = parseOk(input) as YamlMapNode;
			assertScalar(input, map.properties[0].value, { value: 'http://example.com' });
		});

		test('trailing whitespace is trimmed from unquoted scalars', () => {
			const input = 'name: John   ';
			const map = parseOk(input) as YamlMapNode;
			assertScalar(input, map.properties[0].value, { value: 'John' });
		});

		test('empty flow map', () => {
			const node = parseOk('{}');
			const map = assertMap(node, 0);
			assert.strictEqual(map.startOffset, 0);
			assert.strictEqual(map.endOffset, 2);
		});

		test('empty flow sequence', () => {
			const node = parseOk('[]');
			const seq = assertSequence(node, 0);
			assert.strictEqual(seq.startOffset, 0);
			assert.strictEqual(seq.endOffset, 2);
		});

		test('CRLF line endings', () => {
			const input = 'name: John\r\nage: 30';
			const map = parseOk(input) as YamlMapNode;
			assertMap(map, 2);
			assertScalar(input, map.properties[0].value, { value: 'John' });
			assertScalar(input, map.properties[1].value, { value: '30' });
		});
	});

	suite('Old test suite', () => {

		test('mapping value on next line', () => {
			const input = [
				'name:',
				'  John Doe',
				'colors:',
				'  [ Red, Green, Blue ]',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].value, { value: 'John Doe' });
			const colors = assertSequence(map.properties[1].value, 3);
			assertScalar(input, colors.items[0], { value: 'Red' });
			assertScalar(input, colors.items[1], { value: 'Green' });
			assertScalar(input, colors.items[2], { value: 'Blue' });
		});

		test('flow map with different data types', () => {
			const input = '{active: true, score: 85.5, role: null}';
			const node = parseOk(input);
			const map = assertMap(node, 3);
			assertScalar(input, map.properties[0].key, { value: 'active' });
			assertScalar(input, map.properties[0].value, { value: 'true' });
			assertScalar(input, map.properties[1].key, { value: 'score' });
			assertScalar(input, map.properties[1].value, { value: '85.5' });
			assertScalar(input, map.properties[2].key, { value: 'role' });
			assertScalar(input, map.properties[2].value, { value: 'null' });
		});

		test('flow map with quoted keys and values', () => {
			const input = '{"name": "John Doe", "age": 30}';
			const node = parseOk(input);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].key, { value: 'name', format: 'double' });
			assertScalar(input, map.properties[0].value, { value: 'John Doe', format: 'double' });
			assertScalar(input, map.properties[1].key, { value: 'age', format: 'double' });
			assertScalar(input, map.properties[1].value, { value: '30' });
		});

		test('special characters in values', () => {
			const input = `key: value with \t special chars`;
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: `value with \t special chars` });
		});

		test('various whitespace after colon', () => {
			const input = `key:\t \t \t value`;
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'value' });
		});

		test('inline array with comment continuation', () => {
			const input = [
				'[one # comment about two',
				',two, three]',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 3);
			assertScalar(input, seq.items[0], { value: 'one' });
			assertScalar(input, seq.items[1], { value: 'two' });
			assertScalar(input, seq.items[2], { value: 'three' });
		});

		test('multi-line flow sequence', () => {
			const input = [
				'[',
				'    geen, ',
				'    yello, red]',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 3);
			assertScalar(input, seq.items[0], { value: 'geen' });
			assertScalar(input, seq.items[1], { value: 'yello' });
			assertScalar(input, seq.items[2], { value: 'red' });
		});

		test('nested block sequences (dash on next line)', () => {
			const input = [
				'-',
				'  - Apple',
				'  - Banana',
				'  - Cherry',
			].join('\n');
			const node = parseOk(input);
			const outer = assertSequence(node, 1);
			const inner = assertSequence(outer.items[0], 3);
			assertScalar(input, inner.items[0], { value: 'Apple' });
			assertScalar(input, inner.items[1], { value: 'Banana' });
			assertScalar(input, inner.items[2], { value: 'Cherry' });
		});

		test('nested flow sequences', () => {
			const input = [
				'[',
				'  [ee], [ff, gg]',
				']',
			].join('\n');
			const node = parseOk(input);
			const outer = assertSequence(node, 2);
			const first = assertSequence(outer.items[0], 1);
			assertScalar(input, first.items[0], { value: 'ee' });
			const second = assertSequence(outer.items[1], 2);
			assertScalar(input, second.items[0], { value: 'ff' });
			assertScalar(input, second.items[1], { value: 'gg' });
		});

		test('mapping with sequence containing a mapping', () => {
			const input = [
				'items:',
				'- name: John',
				'  age: 30',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].key, { value: 'items' });
			const seq = assertSequence(map.properties[0].value, 1);
			const item = assertMap(seq.items[0], 2);
			assertScalar(input, item.properties[0].value, { value: 'John' });
			assertScalar(input, item.properties[1].value, { value: '30' });
		});

		test('sequence of mappings with varying styles', () => {
			const input = [
				'-',
				'  name: one',
				'- name: two',
				'-',
				'  name: three',
			].join('\n');
			const node = parseOk(input);
			const seq = assertSequence(node, 3);
			const first = assertMap(seq.items[0], 1);
			assertScalar(input, first.properties[0].value, { value: 'one' });
			const second = assertMap(seq.items[1], 1);
			assertScalar(input, second.properties[0].value, { value: 'two' });
			const third = assertMap(seq.items[2], 1);
			assertScalar(input, third.properties[0].value, { value: 'three' });
		});

		test('sequence of multi-property mappings', () => {
			const input = [
				'products:',
				'  - name: Laptop',
				'    price: 999.99',
				'    in_stock: true',
				'  - name: Mouse',
				'    price: 25.50',
				'    in_stock: false',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			const products = assertSequence(map.properties[0].value, 2);
			const laptop = assertMap(products.items[0], 3);
			assertScalar(input, laptop.properties[0].value, { value: 'Laptop' });
			assertScalar(input, laptop.properties[1].value, { value: '999.99' });
			assertScalar(input, laptop.properties[2].value, { value: 'true' });
			const mouse = assertMap(products.items[1], 3);
			assertScalar(input, mouse.properties[0].value, { value: 'Mouse' });
			assertScalar(input, mouse.properties[1].value, { value: '25.50' });
			assertScalar(input, mouse.properties[2].value, { value: 'false' });
		});

		test('flow sequence with mixed types', () => {
			// Note: current parser treats all values as scalars (strings), not typed
			const input = 'vals: [1, true, null, "str"]';
			const node = parseOk(input);
			const map = assertMap(node, 1);
			const vals = assertSequence(map.properties[0].value, 4);
			assertScalar(input, vals.items[0], { value: '1' });
			assertScalar(input, vals.items[1], { value: 'true' });
			assertScalar(input, vals.items[2], { value: 'null' });
			assertScalar(input, vals.items[3], { value: 'str', format: 'double' });
		});

		test('flow map with nested flow sequence', () => {
			const input = 'config: {env: "prod", settings: [true, 42], debug: false}';
			const node = parseOk(input);
			const map = assertMap(node, 1);
			const config = assertMap(map.properties[0].value, 3);
			assertScalar(input, config.properties[0].key, { value: 'env' });
			assertScalar(input, config.properties[0].value, { value: 'prod', format: 'double' });
			const settings = assertSequence(config.properties[1].value, 2);
			assertScalar(input, settings.items[0], { value: 'true' });
			assertScalar(input, settings.items[1], { value: '42' });
			assertScalar(input, config.properties[2].key, { value: 'debug' });
			assertScalar(input, config.properties[2].value, { value: 'false' });
		});

		test('full-line and inline comments', () => {
			const input = [
				'# This is a comment',
				'name: John Doe  # inline comment',
				'age: 30',
			].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].key, { value: 'name' });
			assertScalar(input, map.properties[0].value, { value: 'John Doe' });
			assertScalar(input, map.properties[1].key, { value: 'age' });
			assertScalar(input, map.properties[1].value, { value: '30' });
		});

		test('unexpected indentation with recovery', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'key: 1',
				'    stray: value',
			].join('\n');
			const node = parse(input, errors);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].key, { value: 'key' });
			assertScalar(input, map.properties[0].value, { value: '1' });
			assertScalar(input, map.properties[1].key, { value: 'stray' });
			assertScalar(input, map.properties[1].value, { value: 'value' });
			// Should report an indentation error
			assert.ok(errors.some(e => e.code === 'unexpected-indentation'));
		});

		test('empty value followed by non-empty', () => {
			const input = [
				'empty:',
				'array: []',
			].join('\n');
			const errors: YamlParseError[] = [];
			const node = parse(input, errors);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].key, { value: 'empty' });
			assertScalar(input, map.properties[0].value, { value: '' });
			assertScalar(input, map.properties[1].key, { value: 'array' });
			const arr = assertSequence(map.properties[1].value, 0);
			assert.ok(arr);
		});

		test('nested mapping with empty value', () => {
			const input = [
				'parent:',
				'  child:',
			].join('\n');
			const errors: YamlParseError[] = [];
			const node = parse(input, errors);
			const map = assertMap(node, 1);
			const parent = assertMap(map.properties[0].value, 1);
			assertScalar(input, parent.properties[0].key, { value: 'child' });
			assertScalar(input, parent.properties[0].value, { value: '' });
		});

		test('multiple keys with empty values', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'key1:',
				'key2:',
				'key3:',
			].join('\n');
			const node = parse(input, errors);
			const map = assertMap(node, 3);
			assertScalar(input, map.properties[0].key, { value: 'key1' });
			assertScalar(input, map.properties[0].value, { value: '' });
			assertScalar(input, map.properties[1].key, { value: 'key2' });
			assertScalar(input, map.properties[1].value, { value: '' });
			assertScalar(input, map.properties[2].key, { value: 'key3' });
			assertScalar(input, map.properties[2].value, { value: '' });
		});

		test('large input performance', () => {
			const lines = Array.from({ length: 1000 }, (_, i) => `key${i}: value${i}`);
			const input = lines.join('\n');
			const start = Date.now();
			const node = parseOk(input);
			const duration = Date.now() - start;
			const map = assertMap(node, 1000);
			assertScalar(input, map.properties[0].key, { value: 'key0' });
			assertScalar(input, map.properties[999].key, { value: 'key999' });
			assert.ok(duration < 500, `Parsing took ${duration}ms, expected < 500ms`);
		});

		test('deeply nested structure performance', () => {
			const lines = [];
			for (let i = 0; i < 50; i++) {
				lines.push('  '.repeat(i) + `level${i}:`);
			}
			lines.push('  '.repeat(50) + 'deepValue: reached');
			const input = lines.join('\n');
			const start = Date.now();
			const errors: YamlParseError[] = [];
			const result = parse(input, errors);
			const duration = Date.now() - start;
			assert.ok(result);
			assert.strictEqual(result.type, 'map');
			assert.ok(duration < 500, `Parsing took ${duration}ms, expected < 500ms`);
		});

		test('unclosed flow sequence with empty lines', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'key: [',
				'',
				'',
				'',
				'',
			].join('\n');
			const node = parse(input, errors);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].key, { value: 'key' });
			const seq = map.properties[0].value as YamlSequenceNode;
			assert.strictEqual(seq.type, 'sequence');
			assert.strictEqual(seq.items.length, 0);
		});

		test('deeply nested same-named keys', () => {
			const input = [
				'a:',
				'  b:',
				'    a:',
				'      b:',
				'        value: test',
			].join('\n');
			const node = parseOk(input);
			const outerA = assertMap(node, 1);
			assertScalar(input, outerA.properties[0].key, { value: 'a' });
			const outerB = assertMap(outerA.properties[0].value, 1);
			assertScalar(input, outerB.properties[0].key, { value: 'b' });
			const innerA = assertMap(outerB.properties[0].value, 1);
			assertScalar(input, innerA.properties[0].key, { value: 'a' });
			const innerB = assertMap(innerA.properties[0].value, 1);
			assertScalar(input, innerB.properties[0].key, { value: 'b' });
			const leaf = assertMap(innerB.properties[0].value, 1);
			assertScalar(input, leaf.properties[0].key, { value: 'value' });
			assertScalar(input, leaf.properties[0].value, { value: 'test' });
		});

		test('flow sequence with empty lines between items', () => {
			const input = ['arr: [', '', 'item1,', '', 'item2', '', ']'].join('\n');
			const node = parseOk(input);
			const map = assertMap(node, 1);
			const seq = assertSequence(map.properties[0].value, 2);
			assertScalar(input, seq.items[0], { value: 'item1' });
			assertScalar(input, seq.items[1], { value: 'item2' });
		});

		test('excessive whitespace after colon', () => {
			const input = 'key:      value';
			const node = parseOk(input);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].value, { value: 'value' });
		});

		test('unclosed double quote', () => {
			const input = 'name: "John';
			const errors: YamlParseError[] = [];
			const node = parse(input, errors);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].key, { value: 'name' });
			// Parser should recover: value should be 'John' (sans quote)
			assertScalar(input, map.properties[0].value, { value: 'John' });
		});

		test('unclosed single quote', () => {
			const input = `description: 'Hello world`;
			const errors: YamlParseError[] = [];
			const node = parse(input, errors);
			const map = assertMap(node, 1);
			assertScalar(input, map.properties[0].key, { value: 'description' });
			assertScalar(input, map.properties[0].value, { value: 'Hello world' });
		});

		test('comment in unclosed flow sequence', () => {
			const input = [
				'mode: agent',
				'tools: [#r',
			].join('\n');
			const errors: YamlParseError[] = [];
			const node = parse(input, errors);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].key, { value: 'mode' });
			assertScalar(input, map.properties[0].value, { value: 'agent' });
			assertScalar(input, map.properties[1].key, { value: 'tools' });
			const seq = map.properties[1].value as YamlSequenceNode;
			assert.strictEqual(seq.type, 'sequence');
			assert.strictEqual(seq.items.length, 0);
		});

		test('duplicate keys emit error', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'key: 1',
				'key: 2',
			].join('\n');
			const node = parse(input, errors);
			const map = assertMap(node, 2);
			assertScalar(input, map.properties[0].value, { value: '1' });
			assertScalar(input, map.properties[1].value, { value: '2' });
			assert.ok(errors.some(e => e.code === 'duplicate-key'));
		});

		test('duplicate keys allowed via option', () => {
			const errors: YamlParseError[] = [];
			const input = [
				'key: 1',
				'key: 2',
			].join('\n');
			const node = parse(input, errors, { allowDuplicateKeys: true });
			assertMap(node, 2);
			assert.strictEqual(errors.length, 0);
		});
	});
});
