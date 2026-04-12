"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const assert = __importStar(require("assert"));
const repositoryCache_1 = require("../repositoryCache");
const vscode_1 = require("vscode");
class InMemoryMemento {
    store = new Map();
    constructor(initial) {
        if (initial) {
            for (const k of Object.keys(initial)) {
                this.store.set(k, initial[k]);
            }
        }
    }
    get(key, defaultValue) {
        if (this.store.has(key)) {
            return this.store.get(key);
        }
        return defaultValue;
    }
    update(key, value) {
        this.store.set(key, value);
        return Promise.resolve();
    }
    keys() {
        return Array.from(this.store.keys());
    }
}
class MockLogOutputChannel {
    logLevel = vscode_1.LogLevel.Info;
    onDidChangeLogLevel = new vscode_1.EventEmitter().event;
    trace(_message, ..._args) { }
    debug(_message, ..._args) { }
    info(_message, ..._args) { }
    warn(_message, ..._args) { }
    error(_error, ..._args) { }
    name = 'MockLogOutputChannel';
    append(_value) { }
    appendLine(_value) { }
    replace(_value) { }
    clear() { }
    show(_column, _preserveFocus) { }
    hide() { }
    dispose() { }
}
class TestRepositoryCache extends repositoryCache_1.RepositoryCache {
    _workspaceFileProp;
    _workspaceFoldersProp;
    constructor(memento, logger, _workspaceFileProp, _workspaceFoldersProp) {
        super(memento, logger);
        this._workspaceFileProp = _workspaceFileProp;
        this._workspaceFoldersProp = _workspaceFoldersProp;
    }
    get _workspaceFile() {
        return this._workspaceFileProp;
    }
    get _workspaceFolders() {
        return this._workspaceFoldersProp;
    }
}
suite('RepositoryCache', () => {
    test('set & get basic', () => {
        const memento = new InMemoryMemento();
        const folder = vscode_1.Uri.file('/workspace/repo');
        const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, [{ uri: folder, name: 'workspace', index: 0 }]);
        cache.set('https://example.com/repo.git', folder.fsPath);
        const folders = cache.get('https://example.com/repo.git').map(folder => folder.workspacePath);
        assert.ok(folders, 'folders should be defined');
        assert.deepStrictEqual(folders, [folder.fsPath]);
    });
    test('inner LRU capped at 10 entries', () => {
        const memento = new InMemoryMemento();
        const workspaceFolders = [];
        for (let i = 1; i <= 12; i++) {
            workspaceFolders.push({ uri: vscode_1.Uri.file(`/ws/folder-${i.toString().padStart(2, '0')}`), name: `folder-${i.toString().padStart(2, '0')}`, index: i - 1 });
        }
        const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, workspaceFolders);
        const repo = 'https://example.com/repo.git';
        for (let i = 1; i <= 12; i++) {
            cache.set(repo, vscode_1.Uri.file(`/ws/folder-${i.toString().padStart(2, '0')}`).fsPath);
        }
        const folders = cache.get(repo).map(folder => folder.workspacePath);
        assert.strictEqual(folders.length, 10, 'should only retain 10 most recent folders');
        assert.ok(!folders.includes(vscode_1.Uri.file('/ws/folder-01').fsPath), 'oldest folder-01 should be evicted');
        assert.ok(!folders.includes(vscode_1.Uri.file('/ws/folder-02').fsPath), 'second oldest folder-02 should be evicted');
        assert.ok(folders.includes(vscode_1.Uri.file('/ws/folder-12').fsPath), 'latest folder should be present');
    });
    test('outer LRU capped at 30 repos', () => {
        const memento = new InMemoryMemento();
        const workspaceFolders = [];
        for (let i = 1; i <= 35; i++) {
            workspaceFolders.push({ uri: vscode_1.Uri.file(`/ws/r${i}`), name: `r${i}`, index: i - 1 });
        }
        const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, workspaceFolders);
        for (let i = 1; i <= 35; i++) {
            const repo = `https://example.com/r${i}.git`;
            cache.set(repo, vscode_1.Uri.file(`/ws/r${i}`).fsPath);
        }
        assert.strictEqual(cache.get('https://example.com/r1.git'), undefined, 'oldest repo should be trimmed');
        assert.ok(cache.get('https://example.com/r35.git'), 'newest repo should remain');
    });
    test('delete removes folder and prunes empty repo', () => {
        const memento = new InMemoryMemento();
        const workspaceFolders = [];
        workspaceFolders.push({ uri: vscode_1.Uri.file(`/ws/a`), name: `a`, index: 0 });
        workspaceFolders.push({ uri: vscode_1.Uri.file(`/ws/b`), name: `b`, index: 1 });
        const cache = new TestRepositoryCache(memento, new MockLogOutputChannel(), undefined, workspaceFolders);
        const repo = 'https://example.com/repo.git';
        const a = vscode_1.Uri.file('/ws/a').fsPath;
        const b = vscode_1.Uri.file('/ws/b').fsPath;
        cache.set(repo, a);
        cache.set(repo, b);
        assert.deepStrictEqual(new Set(cache.get(repo)?.map(folder => folder.workspacePath)), new Set([a, b]));
        cache.delete(repo, a);
        assert.deepStrictEqual(cache.get(repo).map(folder => folder.workspacePath), [b]);
        cache.delete(repo, b);
        assert.strictEqual(cache.get(repo), undefined, 'repo should be pruned when last folder removed');
    });
    test('normalizes URLs with trailing .git', () => {
        const memento = new InMemoryMemento();
        const folder = vscode_1.Uri.file('/workspace/repo');
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
        const folder = vscode_1.Uri.file('/workspace/repo');
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
        const folder = vscode_1.Uri.file('/workspace/repo');
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
//# sourceMappingURL=repositoryCache.test.js.map