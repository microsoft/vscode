/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { RepositoryCache } from '../repositoryCache';
import { Event, EventEmitter, LogLevel, LogOutputChannel, Memento, Uri, WorkspaceFolder } from 'vscode';

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

class MockLogOutputChannel implements LogOutputChannel {
	logLevel: LogLevel = LogLevel.Info;
	onDidChangeLogLevel: Event<LogLevel> = new EventEmitter<LogLevel>().event;
	trace(_message: string, ..._args: any[]): void { }
	debug(_message: string, ..._args: any[]): void { }
	info(_message: string, ..._args: any[]): void { }
	warn(_message: string, ..._args: any[]): void { }
	error(_error: string | Error, ..._args: any[]): void { }
	name: string = 'MockLogOutputChannel';
	append(_value: string): void { }
	appendLine(_value: string): void { }
	replace(_value: string): void { }
	clear(): void { }
	show(_column?: unknown, _preserveFocus?: unknown): void { }
	hide(): void { }
	dispose(): void { }
}

class TestRepositoryCache extends RepositoryCache {
	constructor(memento: Memento, logger: LogOutputChannel, private readonly _workspaceFileProp: Uri | undefined, private readonly _workspaceFoldersProp: readonly WorkspaceFolder[] | undefined) {
		super(memento, logger);
	}

	protected override get _workspaceFile() {
		return this._workspaceFileProp;
	}

	protected override get _workspaceFolders() {
		return this._workspaceFoldersProp;
	}
}

suite('RepositoryCache', () => {

	test('set & get basic', () => {
		const memento = new InMemoryMemento();
		const folder = Uri.file('/workspace/repo');
		const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, [{ uri: folder, name: 'workspace', index: 0 }]);

		cache.set('https://example.com/repo.git', folder.fsPath);
		const folders = cache.get('https://example.com/repo.git')!.map(folder => folder.workspacePath);
		assert.ok(folders, 'folders should be defined');
		assert.deepStrictEqual(folders, [folder.fsPath]);
	});

	test('inner LRU capped at 10 entries', () => {
		const memento = new InMemoryMemento();
		const workspaceFolders: WorkspaceFolder[] = [];
		for (let i = 1; i <= 12; i++) {
			workspaceFolders.push({ uri: Uri.file(`/ws/folder-${i.toString().padStart(2, '0')}`), name: `folder-${i.toString().padStart(2, '0')}`, index: i - 1 });
		}
		const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, workspaceFolders);
		const repo = 'https://example.com/repo.git';
		for (let i = 1; i <= 12; i++) {
			cache.set(repo, Uri.file(`/ws/folder-${i.toString().padStart(2, '0')}`).fsPath);
		}
		const folders = cache.get(repo)!.map(folder => folder.workspacePath);
		assert.strictEqual(folders.length, 10, 'should only retain 10 most recent folders');
		assert.ok(!folders.includes(Uri.file('/ws/folder-01').fsPath), 'oldest folder-01 should be evicted');
		assert.ok(!folders.includes(Uri.file('/ws/folder-02').fsPath), 'second oldest folder-02 should be evicted');
		assert.ok(folders.includes(Uri.file('/ws/folder-12').fsPath), 'latest folder should be present');
	});

	test('outer LRU capped at 30 repos', () => {
		const memento = new InMemoryMemento();
		const workspaceFolders: WorkspaceFolder[] = [];
		for (let i = 1; i <= 35; i++) {
			workspaceFolders.push({ uri: Uri.file(`/ws/r${i}`), name: `r${i}`, index: i - 1 });
		}
		const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, workspaceFolders);
		for (let i = 1; i <= 35; i++) {
			const repo = `https://example.com/r${i}.git`;
			cache.set(repo, Uri.file(`/ws/r${i}`).fsPath);
		}
		assert.strictEqual(cache.get('https://example.com/r1.git'), undefined, 'oldest repo should be trimmed');
		assert.ok(cache.get('https://example.com/r35.git'), 'newest repo should remain');
	});

	test('delete removes folder and prunes empty repo', () => {
		const memento = new InMemoryMemento();
		const workspaceFolders: WorkspaceFolder[] = [];
		workspaceFolders.push({ uri: Uri.file(`/ws/a`), name: `a`, index: 0 });
		workspaceFolders.push({ uri: Uri.file(`/ws/b`), name: `b`, index: 1 });

		const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, workspaceFolders);
		const repo = 'https://example.com/repo.git';
		const a = Uri.file('/ws/a').fsPath;
		const b = Uri.file('/ws/b').fsPath;
		cache.set(repo, a);
		cache.set(repo, b);
		assert.deepStrictEqual(new Set(cache.get(repo)?.map(folder => folder.workspacePath)), new Set([a, b]));
		cache.delete(repo, a);
		assert.deepStrictEqual(cache.get(repo)!.map(folder => folder.workspacePath), [b]);
		cache.delete(repo, b);
		assert.strictEqual(cache.get(repo), undefined, 'repo should be pruned when last folder removed');
	});

	test('normalizes URLs with trailing .git', () => {
		const memento = new InMemoryMemento();
		const folder = Uri.file('/workspace/repo');
		const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, [{ uri: folder, name: 'workspace', index: 0 }]);

		// Set with .git extension
		cache.set('https://example.com/repo.git', folder.fsPath);

		// Should be able to get with or without .git
		const withGit = cache.get('https://example.com/repo.git');
		const withoutGit = cache.get('https://example.com/repo');

		assert.ok(withGit, 'should find repo when querying with .git');
		assert.ok(withoutGit, 'should find repo when querying without .git');
		assert.deepStrictEqual(withGit, withoutGit, 'should return same result regardless of .git suffix');
	});

	test('normalizes URLs with trailing slashes and .git', () => {
		const memento = new InMemoryMemento();
		const folder = Uri.file('/workspace/repo');
		const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, [{ uri: folder, name: 'workspace', index: 0 }]);

		// Set with .git and trailing slashes
		cache.set('https://example.com/repo.git///', folder.fsPath);

		// Should be able to get with various combinations
		const variations = [
			'https://example.com/repo.git///',
			'https://example.com/repo.git/',
			'https://example.com/repo.git',
			'https://example.com/repo/',
			'https://example.com/repo'
		];

		const results = variations.map(url => cache.get(url));

		// All should return the same non-undefined result
		assert.ok(results[0], 'should find repo with original URL');
		for (let i = 1; i < results.length; i++) {
			assert.deepStrictEqual(results[i], results[0], `variation ${variations[i]} should return same result`);
		}
	});

	test('handles URLs without .git correctly', () => {
		const memento = new InMemoryMemento();
		const folder = Uri.file('/workspace/repo');
		const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, [{ uri: folder, name: 'workspace', index: 0 }]);

		// Set without .git extension
		cache.set('https://example.com/repo', folder.fsPath);

		// Should be able to get with or without .git
		const withoutGit = cache.get('https://example.com/repo');
		const withGit = cache.get('https://example.com/repo.git');

		assert.ok(withoutGit, 'should find repo when querying without .git');
		assert.ok(withGit, 'should find repo when querying with .git');
		assert.deepStrictEqual(withoutGit, withGit, 'should return same result regardless of .git suffix');
	});
});
