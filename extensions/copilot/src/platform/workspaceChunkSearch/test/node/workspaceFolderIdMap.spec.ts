/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import type { Memento } from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import { WorkspaceFolderIdMap } from '../../node/codeSearch/workspaceFolderIdMap';

class MockMemento implements Memento {
	private readonly _data = new Map<string, unknown>();

	keys(): readonly string[] {
		return [...this._data.keys()];
	}

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		const val = this._data.get(key);
		return val !== undefined ? val as T : defaultValue;
	}

	async update(key: string, value: unknown): Promise<void> {
		this._data.set(key, value);
	}
}

suite('WorkspaceFolderIdMap', () => {

	test('returns an id based on folder basename', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const id = map.getIdForFolder(URI.file('/home/user/my-project'));
		assert.strictEqual(id, 'my-proje');
	});

	test('returns the same id on subsequent calls', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const uri = URI.file('/home/user/my-project');
		const first = map.getIdForFolder(uri);
		const second = map.getIdForFolder(uri);
		assert.strictEqual(first, second);
	});

	test('returns short name without padding when basename is shorter than 8 chars', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const id = map.getIdForFolder(URI.file('/home/user/app'));
		assert.strictEqual(id, 'app');
	});

	test('handles collision by appending numeric suffix', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const p1 = map.getIdForFolder(URI.file('/a/my-project'));
		const p2 = map.getIdForFolder(URI.file('/b/my-project'));

		assert.strictEqual(p1, 'my-proje');
		assert.strictEqual(p2, 'my-proj0');
		assert.notStrictEqual(p1, p2);
	});

	test('handles multiple collisions', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const p1 = map.getIdForFolder(URI.file('/a/my-project'));
		const p2 = map.getIdForFolder(URI.file('/b/my-project'));
		const p3 = map.getIdForFolder(URI.file('/c/my-project'));

		assert.strictEqual(p1, 'my-proje');
		assert.strictEqual(p2, 'my-proj0');
		assert.strictEqual(p3, 'my-proj1');
	});

	test('sanitizes non-alphanumeric characters from basename', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const id = map.getIdForFolder(URI.file('/home/user/my project (2)'));
		assert.strictEqual(id, 'myprojec');
	});

	test('uses fallback for folders with only special characters', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const id = map.getIdForFolder(URI.file('/home/user/...'));
		assert.strictEqual(id, 'ws');
	});

	test('persists and restores from storage', () => {
		const store = new MockMemento();

		const map1 = new WorkspaceFolderIdMap(store);
		const uri = URI.file('/home/user/my-project');
		const original = map1.getIdForFolder(uri);

		// Create a new instance with the same store
		const map2 = new WorkspaceFolderIdMap(store);
		const restored = map2.getIdForFolder(uri);

		assert.strictEqual(original, restored);
	});

	test('restored map avoids collisions with persisted ids', () => {
		const store = new MockMemento();

		const map1 = new WorkspaceFolderIdMap(store);
		map1.getIdForFolder(URI.file('/a/my-project'));

		// New instance should know 'my-proje' is taken
		const map2 = new WorkspaceFolderIdMap(store);
		const p2 = map2.getIdForFolder(URI.file('/b/my-project'));

		assert.strictEqual(p2, 'my-proj0');
	});

	test('getFolderForId returns undefined for unknown id', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		assert.strictEqual(map.getFolderForId('unknown'), undefined);
	});

	test('getFolderForId returns the URI for a known id', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const uri = URI.file('/home/user/my-project');
		const id = map.getIdForFolder(uri);

		const result = map.getFolderForId(id);
		assert.ok(result);
		assert.strictEqual(result.toString(), uri.toString());
	});

	test('getFolderForId round-trips with getIdForFolder', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		const uris = [
			URI.file('/a/project-one'),
			URI.file('/b/project-two'),
			URI.file('/c/project-three'),
		];

		for (const uri of uris) {
			const id = map.getIdForFolder(uri);
			const recovered = map.getFolderForId(id);
			assert.ok(recovered);
			assert.strictEqual(recovered.toString(), uri.toString());
		}
	});

	test('getFolderForId works after restore from storage', () => {
		const store = new MockMemento();

		const map1 = new WorkspaceFolderIdMap(store);
		const uri = URI.file('/home/user/my-project');
		const id = map1.getIdForFolder(uri);

		const map2 = new WorkspaceFolderIdMap(store);
		const result = map2.getFolderForId(id);
		assert.ok(result);
		assert.strictEqual(result.toString(), uri.toString());
	});

	test('getFolderForId returns undefined after only unrelated ids are registered', () => {
		const store = new MockMemento();
		const map = new WorkspaceFolderIdMap(store);

		map.getIdForFolder(URI.file('/home/user/project-a'));
		map.getIdForFolder(URI.file('/home/user/project-b'));

		assert.strictEqual(map.getFolderForId('notregistered'), undefined);
	});
});
