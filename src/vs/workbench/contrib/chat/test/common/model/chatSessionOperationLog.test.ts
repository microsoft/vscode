/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import * as Adapt from '../../../common/model/objectMutationLog.js';
import { equals } from '../../../../../../base/common/objects.js';

suite('ChatSessionOperationLog', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// Test data types
	interface TestItem {
		id: string;
		value: number;
	}

	interface TestObject {
		name: string;
		count?: number;
		items: TestItem[];
		metadata?: { tags: string[] };
	}

	// Helper to create a simple schema for testing
	function createTestSchema() {
		const itemSchema = Adapt.object<TestItem, TestItem>({
			id: Adapt.t(i => i.id, Adapt.key()),
			value: Adapt.t(i => i.value, Adapt.value()),
		});

		return Adapt.object<TestObject, TestObject>({
			name: Adapt.t(o => o.name, Adapt.value()),
			count: Adapt.t(o => o.count, Adapt.value()),
			items: Adapt.t(o => o.items, Adapt.array(itemSchema)),
			metadata: Adapt.v(o => o.metadata, equals),
		});
	}

	// Helper to simulate file operations
	function simulateFileRoundtrip(adapter: Adapt.ObjectMutationLog<TestObject, TestObject>, initial: TestObject, updates: TestObject[]): TestObject {
		let fileContent = adapter.createInitial(initial);

		for (const update of updates) {
			const result = adapter.write(update);
			if (result.op === 'replace') {
				fileContent = result.data;
			} else {
				fileContent = VSBuffer.concat([fileContent, result.data]);
			}
		}

		// Create new adapter and read back
		const reader = new Adapt.ObjectMutationLog(createTestSchema());
		return reader.read(fileContent);
	}

	suite('Transform factories', () => {
		test('key uses strict equality by default', () => {
			const transform = Adapt.key<string>();
			assert.strictEqual(transform.equals('a', 'a'), true);
			assert.strictEqual(transform.equals('a', 'b'), false);
		});

		test('key uses custom comparator', () => {
			const transform = Adapt.key<{ id: number }>((a, b) => a.id === b.id);
			assert.strictEqual(transform.equals({ id: 1 }, { id: 1 }), true);
			assert.strictEqual(transform.equals({ id: 1 }, { id: 2 }), false);
		});

		test('primitive uses strict equality', () => {
			const transform = Adapt.value<number, number>();
			assert.strictEqual(transform.equals(1, 1), true);
			assert.strictEqual(transform.equals(1, 2), false);
		});

		test('primitive with custom comparator', () => {
			const transform = Adapt.value<string, string>((a, b) => a.toLowerCase() === b.toLowerCase());
			assert.strictEqual(transform.equals('ABC', 'abc'), true);
			assert.strictEqual(transform.equals('ABC', 'def'), false);
		});

		test('object extracts and compares properties', () => {
			const schema = Adapt.object<{ x: number; y: string }, { x: number; y: string }>({
				x: Adapt.t(o => o.x, Adapt.value()),
				y: Adapt.t(o => o.y, Adapt.value()),
			});

			const extracted = schema.extract({ x: 1, y: 'test' });
			assert.strictEqual(extracted.x, 1);
			assert.strictEqual(extracted.y, 'test');
		});

		test('t composes getter with transform', () => {
			const transform = Adapt.t(
				(obj: { nested: { value: number } }) => obj.nested.value,
				Adapt.value<number, number>()
			);

			assert.strictEqual(transform.extract({ nested: { value: 42 } }), 42);
		});

		test('differentiated uses separate extract and equals functions', () => {
			const transform = Adapt.v<{ type: string; data: number }, string>(
				obj => `${obj.type}:${obj.data}`,
				(a, b) => a.split(':')[0] === b.split(':')[0], // compare only the type prefix
			);

			const extracted = transform.extract({ type: 'test', data: 123 });
			assert.strictEqual(extracted, 'test:123');

			// Same type prefix should be equal
			assert.strictEqual(transform.equals('test:123', 'test:456'), true);
			// Different type prefix should not be equal
			assert.strictEqual(transform.equals('test:123', 'other:123'), false);
		});
	});

	suite('LogAdapter', () => {
		test('createInitial creates valid log entry', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const initial: TestObject = { name: 'test', count: 0, items: [] };
			const buffer = adapter.createInitial(initial);

			const content = buffer.toString();
			const entry = JSON.parse(content.trim());
			assert.strictEqual(entry.kind, 0); // EntryKind.Initial
			assert.deepStrictEqual(entry.v, initial);
		});

		test('read reconstructs initial state', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const initial: TestObject = { name: 'test', count: 5, items: [{ id: 'a', value: 1 }] };
			const buffer = adapter.createInitial(initial);

			const reader = new Adapt.ObjectMutationLog(schema);
			const result = reader.read(buffer);

			assert.deepStrictEqual(result, initial);
		});

		test('write returns empty data when no changes', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const obj: TestObject = { name: 'test', count: 0, items: [] };
			adapter.createInitial(obj);

			const result = adapter.write(obj);
			assert.strictEqual(result.op, 'append');
			assert.strictEqual(result.data.toString(), '');
		});

		test('write detects primitive changes', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const obj: TestObject = { name: 'test', count: 0, items: [] };
			adapter.createInitial(obj);

			const updated = { ...obj, count: 10 };
			const result = adapter.write(updated);

			assert.strictEqual(result.op, 'append');
			const entry = JSON.parse(result.data.toString().trim());
			assert.strictEqual(entry.kind, 1); // EntryKind.Set
			assert.deepStrictEqual(entry.k, ['count']);
			assert.strictEqual(entry.v, 10);
		});

		test('write detects array append', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const obj: TestObject = { name: 'test', count: 0, items: [{ id: 'a', value: 1 }] };
			adapter.createInitial(obj);

			const updated: TestObject = { ...obj, items: [...obj.items, { id: 'b', value: 2 }] };
			const result = adapter.write(updated);

			const entry = JSON.parse(result.data.toString().trim());
			assert.strictEqual(entry.kind, 2); // EntryKind.Push
			assert.deepStrictEqual(entry.k, ['items']);
			assert.deepStrictEqual(entry.v, [{ id: 'b', value: 2 }]);
			assert.strictEqual(entry.i, undefined);
		});

		test('write detects array append nested', () => {
			type Item = { id: string; value: number[] };
			const itemSchema = Adapt.object<Item, Item>({
				id: Adapt.t(i => i.id, Adapt.key()),
				value: Adapt.t(i => i.value, Adapt.array(Adapt.value())),
			});

			type TestObject = { items: Item[] };
			const schema = Adapt.object<TestObject, TestObject>({
				items: Adapt.t(o => o.items, Adapt.array(itemSchema)),
			});

			const adapter = new Adapt.ObjectMutationLog(schema);

			adapter.createInitial({ items: [{ id: 'a', value: [1, 2] }] });


			const result1 = adapter.write({ items: [{ id: 'a', value: [1, 2, 3] }] });
			assert.deepStrictEqual(
				JSON.parse(result1.data.toString().trim()),
				{ kind: 2, k: ['items', 0, 'value'], v: [3] },
			);

			const result2 = adapter.write({ items: [{ id: 'b', value: [1, 2, 3] }] });
			assert.deepStrictEqual(
				JSON.parse(result2.data.toString().trim()),
				{ kind: 2, k: ['items'], i: 0, v: [{ id: 'b', value: [1, 2, 3] }] },
			);
		});

		test('write detects array truncation', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const obj: TestObject = { name: 'test', count: 0, items: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }] };
			adapter.createInitial(obj);

			const updated: TestObject = { ...obj, items: [obj.items[0]] };
			const result = adapter.write(updated);

			const entry = JSON.parse(result.data.toString().trim());
			assert.strictEqual(entry.kind, 2); // EntryKind.Push
			assert.deepStrictEqual(entry.k, ['items']);
			assert.strictEqual(entry.i, 1);
			assert.strictEqual(entry.v, undefined);
		});

		test('write detects array item modification and recurses into object', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const obj: TestObject = {
				name: 'test',
				count: 0,
				items: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c', value: 3 }]
			};
			adapter.createInitial(obj);

			// Modify middle item - key 'id' matches, so we recurse to set the 'value' property
			const updated: TestObject = {
				...obj,
				items: [{ id: 'a', value: 1 }, { id: 'b', value: 999 }, { id: 'c', value: 3 }]
			};
			const result = adapter.write(updated);

			const entry = JSON.parse(result.data.toString().trim());
			assert.strictEqual(entry.kind, 1); // EntryKind.Set - setting individual property
			assert.deepStrictEqual(entry.k, ['items', 1, 'value']);
			assert.strictEqual(entry.v, 999);
		});

		test('read applies multiple entries correctly', () => {
			const schema = createTestSchema();
			const initial: TestObject = { name: 'test', count: 0, items: [] };

			// Build log manually
			const entries = [
				{ kind: 0, v: initial },
				{ kind: 1, k: ['count'], v: 5 },
				{ kind: 2, k: ['items'], v: [{ id: 'a', value: 1 }] },
				{ kind: 2, k: ['items'], v: [{ id: 'b', value: 2 }] },
			];
			const logContent = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

			const adapter = new Adapt.ObjectMutationLog(schema);
			const result = adapter.read(VSBuffer.fromString(logContent));

			assert.strictEqual(result.count, 5);
			assert.strictEqual(result.items.length, 2);
			assert.deepStrictEqual(result.items[0], { id: 'a', value: 1 });
			assert.deepStrictEqual(result.items[1], { id: 'b', value: 2 });
		});

		test('roundtrip preserves data through multiple updates', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const initial: TestObject = { name: 'test', count: 0, items: [] };
			const updates: TestObject[] = [
				{ name: 'test', count: 1, items: [] },
				{ name: 'test', count: 1, items: [{ id: 'a', value: 10 }] },
				{ name: 'test', count: 2, items: [{ id: 'a', value: 10 }, { id: 'b', value: 20 }] },
				{ name: 'test', count: 2, items: [{ id: 'a', value: 10 }] }, // Remove item
			];

			const result = simulateFileRoundtrip(adapter, initial, updates);
			assert.deepStrictEqual(result, updates[updates.length - 1]);
		});

		test('compacts log when entry count exceeds threshold', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema, 3); // Compact after 3 entries

			const obj: TestObject = { name: 'test', count: 0, items: [] };
			adapter.createInitial(obj); // Entry 1

			adapter.write({ ...obj, count: 1 }); // Entry 2
			adapter.write({ ...obj, count: 2 }); // Entry 3

			const before = adapter.write({ ...obj, count: 3 });
			assert.strictEqual(before.op, 'append');

			// This should trigger compaction
			const result = adapter.write({ ...obj, count: 4 });
			assert.strictEqual(result.op, 'replace');

			// Verify the compacted log only has initial entry
			const lines = result.data.toString().split('\n').filter(l => l.trim());
			assert.strictEqual(lines.length, 1);
			const entry = JSON.parse(lines[0]);
			assert.strictEqual(entry.kind, 0); // EntryKind.Initial
		});

		test('handles deepCompare property changes', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const obj: TestObject = { name: 'test', count: 0, items: [], metadata: { tags: ['a'] } };
			adapter.createInitial(obj);

			const updated: TestObject = { ...obj, metadata: { tags: ['a', 'b'] } };
			const result = adapter.write(updated);

			const entry = JSON.parse(result.data.toString().trim());
			assert.strictEqual(entry.kind, 1); // EntryKind.Set
			assert.deepStrictEqual(entry.k, ['metadata']);
			assert.deepStrictEqual(entry.v, { tags: ['a', 'b'] });
		});

		test('handles differentiated property changes', () => {
			// Schema with a differentiated transform that extracts a string
			// but uses a custom equals that only checks the prefix
			interface DiffObj {
				data: { type: string; version: number };
			}
			const schema = Adapt.object<DiffObj, { data: string }>({
				data: Adapt.t(
					o => o.data,
					Adapt.v<{ type: string; version: number }, string>(
						obj => `${obj.type}:${obj.version}`,
						(a, b) => a.split(':')[0] === b.split(':')[0], // compare only the type prefix
					)
				),
			});

			const adapter = new Adapt.ObjectMutationLog(schema);

			// Initial state: 'foo:1'
			adapter.createInitial({ data: { type: 'foo', version: 1 } });

			// Change type from 'foo' to 'bar' - should detect change (different prefix)
			const result1 = adapter.write({ data: { type: 'bar', version: 2 } });
			assert.notStrictEqual(result1.data.toString(), '', 'different type should trigger change');
			const entry1 = JSON.parse(result1.data.toString().trim());
			assert.strictEqual(entry1.kind, 1); // EntryKind.Set
			assert.deepStrictEqual(entry1.k, ['data']);
			assert.strictEqual(entry1.v, 'bar:2');

			// Change version but keep type 'bar' - should NOT detect change (same prefix)
			const result2 = adapter.write({ data: { type: 'bar', version: 3 } });
			assert.strictEqual(result2.data.toString(), '', 'same type prefix should not trigger change');
		});

		test('read throws on empty log file', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			assert.throws(() => adapter.read(VSBuffer.fromString('')), /Empty log file/);
		});

		test('write without prior read creates initial entry', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const obj: TestObject = { name: 'test', count: 5, items: [] };
			const result = adapter.write(obj);

			assert.strictEqual(result.op, 'replace');
			const entry = JSON.parse(result.data.toString().trim());
			assert.strictEqual(entry.kind, 0); // EntryKind.Initial
		});

		test('sealed objects skip non-key field comparison when both are sealed', () => {
			interface SealedItem {
				id: string;
				value: number;
				isSealed: boolean;
			}

			interface SealedTestObject {
				items: SealedItem[];
			}

			const itemSchema = Adapt.object<SealedItem, SealedItem>({
				id: Adapt.t(i => i.id, Adapt.key()),
				value: Adapt.t(i => i.value, Adapt.value()),
				isSealed: Adapt.t(i => i.isSealed, Adapt.value()),
			}, {
				sealed: (obj) => obj.isSealed,
			});

			const schema = Adapt.object<SealedTestObject, SealedTestObject>({
				items: Adapt.t(o => o.items, Adapt.array(itemSchema)),
			});

			const adapter = new Adapt.ObjectMutationLog(schema);

			// Initial state with a sealed item
			adapter.createInitial({ items: [{ id: 'a', value: 1, isSealed: true }] });

			// Change value on sealed item - should NOT be detected because both are sealed
			const result1 = adapter.write({ items: [{ id: 'a', value: 999, isSealed: true }] });
			assert.strictEqual(result1.data.toString(), '', 'sealed item value change should be ignored');
		});

		test('sealed objects still detect key changes', () => {
			interface SealedItem {
				id: string;
				value: number;
				isSealed: boolean;
			}

			interface SealedTestObject {
				items: SealedItem[];
			}

			const itemSchema = Adapt.object<SealedItem, SealedItem>({
				id: Adapt.t(i => i.id, Adapt.key()),
				value: Adapt.t(i => i.value, Adapt.value()),
				isSealed: Adapt.t(i => i.isSealed, Adapt.value()),
			}, {
				sealed: (obj) => obj.isSealed,
			});

			const schema = Adapt.object<SealedTestObject, SealedTestObject>({
				items: Adapt.t(o => o.items, Adapt.array(itemSchema)),
			});

			const adapter = new Adapt.ObjectMutationLog(schema);

			// Initial state with a sealed item
			adapter.createInitial({ items: [{ id: 'a', value: 1, isSealed: true }] });

			// Change key on sealed item - SHOULD be detected (replacement)
			const result = adapter.write({ items: [{ id: 'b', value: 1, isSealed: true }] });
			assert.notStrictEqual(result.data.toString(), '', 'key change should be detected even when sealed');

			const entry = JSON.parse(result.data.toString().trim());
			assert.strictEqual(entry.kind, 2); // EntryKind.Push (array replacement)
		});

		test('sealed objects diff normally when one is not sealed', () => {
			interface SealedItem {
				id: string;
				value: number;
				isSealed: boolean;
			}

			interface SealedTestObject {
				items: SealedItem[];
			}

			const itemSchema = Adapt.object<SealedItem, SealedItem>({
				id: Adapt.t(i => i.id, Adapt.key()),
				value: Adapt.t(i => i.value, Adapt.value()),
				isSealed: Adapt.t(i => i.isSealed, Adapt.value()),
			}, {
				sealed: (obj) => obj.isSealed,
			});

			const schema = Adapt.object<SealedTestObject, SealedTestObject>({
				items: Adapt.t(o => o.items, Adapt.array(itemSchema)),
			});

			const adapter = new Adapt.ObjectMutationLog(schema);

			// Initial state with a non-sealed item
			adapter.createInitial({ items: [{ id: 'a', value: 1, isSealed: false }] });

			// Change value - should be detected since prev is not sealed
			const result1 = adapter.write({ items: [{ id: 'a', value: 999, isSealed: false }] });
			assert.notStrictEqual(result1.data.toString(), '', 'non-sealed item should detect value change');

			const entry = JSON.parse(result1.data.toString().trim());
			assert.strictEqual(entry.kind, 1); // EntryKind.Set
			assert.deepStrictEqual(entry.k, ['items', 0, 'value']);
			assert.strictEqual(entry.v, 999);
		});

		test('sealed transition from unsealed to sealed detects final changes', () => {
			interface SealedItem {
				id: string;
				value: number;
				isSealed: boolean;
			}

			interface SealedTestObject {
				items: SealedItem[];
			}

			const itemSchema = Adapt.object<SealedItem, SealedItem>({
				id: Adapt.t(i => i.id, Adapt.key()),
				value: Adapt.t(i => i.value, Adapt.value()),
				isSealed: Adapt.t(i => i.isSealed, Adapt.value()),
			}, {
				sealed: (obj) => obj.isSealed,
			});

			const schema = Adapt.object<SealedTestObject, SealedTestObject>({
				items: Adapt.t(o => o.items, Adapt.array(itemSchema)),
			});

			const adapter = new Adapt.ObjectMutationLog(schema);

			// Initial state with a non-sealed item
			adapter.createInitial({ items: [{ id: 'a', value: 1, isSealed: false }] });

			// Transition to sealed with value change - should detect changes since prev was not sealed
			const result = adapter.write({ items: [{ id: 'a', value: 999, isSealed: true }] });
			assert.notStrictEqual(result.data.toString(), '', 'transition to sealed should detect value change');

			// Should have two entries - one for value, one for isSealed
			const lines = result.data.toString().trim().split('\n');
			assert.strictEqual(lines.length, 2, 'should have two change entries');
		});

		test('write detects property set to undefined', () => {
			const schema = createTestSchema();
			const adapter = new Adapt.ObjectMutationLog(schema);

			const initial: TestObject = { name: 'test', count: 5, items: [], metadata: { tags: ['foo'] } };

			const result = simulateFileRoundtrip(adapter, initial, [
				{ name: 'test', count: 10, items: [], metadata: { tags: ['foo'] } },
				{ name: 'test', count: undefined, items: [], metadata: undefined },
			]);
			assert.deepStrictEqual(result, { name: 'test', count: undefined, items: [], metadata: undefined });

			const result2 = simulateFileRoundtrip(adapter, initial, [
				{ name: 'test', count: 10, items: [], metadata: { tags: ['foo'] } },
				{ name: 'test', count: undefined, items: [], metadata: undefined },
				{ name: 'test', count: 12, items: [], metadata: { tags: ['bar'] } },
			]);
			assert.deepStrictEqual(result2, { name: 'test', count: 12, items: [], metadata: { tags: ['bar'] } });
		});

		test('delete followed by set restores property', () => {
			const schema = createTestSchema();
			const initial: TestObject = { name: 'test', count: 0, items: [], metadata: { tags: ['a'] } };

			// Build log with delete then set
			const entries = [
				{ kind: 0, v: initial },
				{ kind: 3, k: ['metadata'] }, // Delete
				{ kind: 1, k: ['metadata'], v: { tags: ['b', 'c'] } }, // Set to new value
			];
			const logContent = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

			const adapter = new Adapt.ObjectMutationLog(schema);
			const result = adapter.read(VSBuffer.fromString(logContent));

			assert.deepStrictEqual(result.metadata, { tags: ['b', 'c'] });
		});
	});
});
