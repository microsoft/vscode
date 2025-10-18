/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { KnownFolders } from '../knownFolders';
import { Memento } from 'vscode';

class InMemoryMemento implements Memento {
	private store = new Map<string, any>();

	constructor(initial?: Record<string, any>) {
		if (initial) {
			for (const k of Object.keys(initial)) {
				this.store.set(k, initial[k]);
			}
		}
	}

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		if (this.store.has(key)) {
			return this.store.get(key);
		}
		return defaultValue as (T | undefined);
	}

	update(key: string, value: any): Thenable<void> {
		this.store.set(key, value);
		return Promise.resolve();
	}

	keys(): readonly string[] {
		return Array.from(this.store.keys());
	}
}

suite('KnownFolders', () => {

	test('set & get basic', () => {
		const memento = new InMemoryMemento();
		const kf = new KnownFolders(memento);
		kf.set('https://example.com/repo.git', '/workspace/repo');
		const folders = kf.get('https://example.com/repo.git');
		assert.ok(folders, 'folders should be defined');
		assert.deepStrictEqual(folders, ['/workspace/repo']);
	});

	test('inner LRU capped at 10 entries', () => {
		const memento = new InMemoryMemento();
		const kf = new KnownFolders(memento);
		const repo = 'https://example.com/repo.git';
		for (let i = 1; i <= 12; i++) {
			kf.set(repo, `/ws/folder-${i.toString().padStart(2, '0')}`);
		}
		const folders = kf.get(repo)!;
		assert.strictEqual(folders.length, 10, 'should only retain 10 most recent folders');
		assert.ok(!folders.includes('/ws/folder-01'), 'oldest folder-01 should be evicted');
		assert.ok(!folders.includes('/ws/folder-02'), 'second oldest folder-02 should be evicted');
		assert.ok(folders.includes('/ws/folder-12'), 'latest folder should be present');
	});

	test('outer LRU capped at 30 repos', () => {
		const memento = new InMemoryMemento();
		const kf = new KnownFolders(memento);
		for (let i = 1; i <= 35; i++) {
			const repo = `https://example.com/r${i}.git`;
			kf.set(repo, `/ws/r${i}`);
		}
		assert.strictEqual(kf.get('https://example.com/r1.git'), undefined, 'oldest repo should be trimmed');
		assert.ok(kf.get('https://example.com/r35.git'), 'newest repo should remain');
	});

	test('delete removes folder and prunes empty repo', () => {
		const memento = new InMemoryMemento();
		const kf = new KnownFolders(memento);
		const repo = 'https://example.com/repo.git';
		kf.set(repo, '/ws/a');
		kf.set(repo, '/ws/b');
		assert.deepStrictEqual(new Set(kf.get(repo)), new Set(['/ws/a', '/ws/b']));
		kf.delete(repo, '/ws/a');
		assert.deepStrictEqual(kf.get(repo), ['/ws/b']);
		kf.delete(repo, '/ws/b');
		assert.strictEqual(kf.get(repo), undefined, 'repo should be pruned when last folder removed');
	});

	test('expiry prunes >90 day old entries on load', () => {
		const now = Date.now();
		const oldTs = now - (91 * 24 * 60 * 60 * 1000);
		const recentTs = now - (5 * 24 * 60 * 60 * 1000);
		const raw: [string, [string, number][]][] = [
			['https://example.com/repo.git', [
				['/ws/old', oldTs],
				['/ws/new', recentTs]
			]]
		];
		const memento = new InMemoryMemento({ 'git.knownFolders': raw });
		const kf = new KnownFolders(memento);
		const folders = kf.get('https://example.com/repo.git');
		assert.deepStrictEqual(folders, ['/ws/new']);
	});
});
