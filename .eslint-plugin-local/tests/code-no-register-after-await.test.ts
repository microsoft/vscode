/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import tseslint from 'typescript-eslint';
import rule from '../code-no-register-after-await.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const registered = (...names: string[]) => names.map(name => ({ messageId: 'registerAfterAwait', data: { name } }));

/** `BaseStorageMain.init` and `ApplicationSharedStorageMain.doCreate` before #345627, which leaked when disposed during init. */
const storageBeforeFix = `
abstract class BaseStorageMain extends Disposable implements IStorageMain {
	init(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = (async () => {
				if (this.state !== StorageState.None) {
					return; // either closed or already initialized
				}

				try {

					// Create storage via subclasses
					const storage = this._register(await this.doCreate());

					// Replace our in-memory storage with the real
					// once as soon as possible without awaiting
					// the init call.
					this._storage.dispose();
					this._storage = storage;

					// Re-emit storage changes via event
					this._register(storage.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));

					// Await storage init
					await this.doInit(storage);

					// Ensure we track whether storage is new or not
					const isNewStorage = storage.getBoolean(IS_NEW_KEY);
					if (isNewStorage === undefined) {
						storage.set(IS_NEW_KEY, true);
					} else if (isNewStorage) {
						storage.set(IS_NEW_KEY, false);
					}
				} catch (error) {
					this.logService.error(\`[storage main] initialize(): Unable to init storage due to \${error}\`);
				} finally {

					// Update state
					this.state = StorageState.Initialized;

					// Mark init promise as completed
					this.whenInitPromise.complete();
				}
			})();
		}

		return this.initializePromise;
	}
}

export class ApplicationSharedStorageMain extends BaseStorageMain {
	protected async doCreate(): Promise<Storage> {
		const { storageFilePath, wasCreated } = await this.prepareStorageFolder();

		this.logService.info(\`[shared storage] Creating shared storage database at '\${storageFilePath}' (wasCreated: \${wasCreated})\`);

		const database = new SQLiteStorageDatabase(storageFilePath, {
			logging: this.createLoggingOptions()
		});

		this.logService.info(\`[shared storage] Initializing fallback application storage (path: \${this.applicationStorage.path ?? 'in-memory'})\`);
		await this.applicationStorage.init();
		this.logService.info(\`[shared storage] Fallback application storage initialized with \${this.applicationStorage.items.size} items\`);

		const migratingStorage = this._register(new MigratingStorage(database, { hint: wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : undefined }));
		migratingStorage.setFallbackStorage(this.applicationStorage.storage, false);
		return migratingStorage;
	}
}
`;

/** The same code after #345627: it re-checks disposal after creating the storage, and no longer registers in `doCreate`. */
const storageAfterFix = `
abstract class BaseStorageMain extends Disposable implements IStorageMain {
	init(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = (async () => {
				if (this.state !== StorageState.None) {
					return; // either closed or already initialized
				}

				try {

					// Create storage via subclasses
					const storage = await this.doCreate();
					if (this._store.isDisposed) {
						try {
							await storage.close();
						} finally {
							storage.dispose();
						}
						return;
					}
					this._register(storage);

					// Replace our in-memory storage with the real
					// once as soon as possible without awaiting
					// the init call.
					this._storage.dispose();
					this._storage = storage;

					// Re-emit storage changes via event
					this._register(storage.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));

					// Await storage init
					await this.doInit(storage);

					// Ensure we track whether storage is new or not
					const isNewStorage = storage.getBoolean(IS_NEW_KEY);
					if (isNewStorage === undefined) {
						storage.set(IS_NEW_KEY, true);
					} else if (isNewStorage) {
						storage.set(IS_NEW_KEY, false);
					}
				} catch (error) {
					this.logService.error(\`[storage main] initialize(): Unable to init storage due to \${error}\`);
				} finally {

					// Update state
					this.state = StorageState.Initialized;

					// Mark init promise as completed
					this.whenInitPromise.complete();
				}
			})();
		}

		return this.initializePromise;
	}
}

export class ApplicationSharedStorageMain extends BaseStorageMain {
	protected async doCreate(): Promise<Storage> {
		const { storageFilePath, wasCreated } = await this.prepareStorageFolder();

		this.logService.info(\`[shared storage] Creating shared storage database at '\${storageFilePath}' (wasCreated: \${wasCreated})\`);

		const database = new SQLiteStorageDatabase(storageFilePath, {
			logging: this.createLoggingOptions()
		});

		this.logService.info(\`[shared storage] Initializing fallback application storage (path: \${this.applicationStorage.path ?? 'in-memory'})\`);
		await this.applicationStorage.init();
		this.logService.info(\`[shared storage] Fallback application storage initialized with \${this.applicationStorage.items.size} items\`);

		const migratingStorage = new MigratingStorage(database, { hint: wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : undefined });
		migratingStorage.setFallbackStorage(this.applicationStorage.storage, false);
		return migratingStorage;
	}
}
`;

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-no-register-after-await', rule, {
	valid: [
		storageAfterFix,
		`class A extends Disposable { async f() { this._register(x); await y; } }`,
		`class A extends Disposable { f() { this._register(x); } }`,
		`class A extends Disposable { async f() { await y; if (this._store.isDisposed) { return; } this._register(x); } }`,
		`class A extends Disposable { async f() { await y; if (this._store.isDisposed) return; this._register(x); } }`,
		`class A extends Disposable { async f() { const x = await y; if (!this._store.isDisposed) { this._register(x); } } }`,
		`class A extends Disposable { async f() { const x = await y; if (this._store.isDisposed) { x.dispose(); } else { this._register(x); } } }`,
		`class A extends Disposable { async f() { const x = await y; this._store.isDisposed ? x.dispose() : this._register(x); } }`,
		`class A extends Disposable { async f() { const x = await y; !this._store.isDisposed && this._register(x); } }`,
		`class A extends Disposable { private _isDisposed = false; async f() { await y; if (this._isDisposed) { return; } this._register(x); } }`,
		`class A extends Disposable { async f(token: CancellationToken) { await y; if (token.isCancellationRequested) { throw new CancellationError(); } this._register(x); } }`,
		`class A extends Disposable { async f(token: CancellationToken) { await y; if (token.isCancellationRequested || this._store.isDisposed) { return; } this._register(x); } }`,
		`class A extends Disposable { async f(signal: AbortSignal) { await y; signal.throwIfAborted(); this._register(x); } }`,
		// The helpers dispose the value when the owner was disposed.
		`class A extends Disposable { async f() { this._registerOrDispose(await y); } }`,
		`class A extends Disposable { async f() { await y; this._store.addOrDispose(x); } }`,
		// The guard of the Claude agent session: the abort controller is aborted on dispose.
		`class A extends Disposable {
			async f() {
				const warm = await this._sdkService.startup({ options });
				if (this.abortController.signal.aborted) {
					await warm[Symbol.asyncDispose]();
					throw new CancellationError();
				}
				let pipeline;
				try {
					pipeline = this._register(this._instantiationService.createInstance(ClaudeSdkPipeline, warm));
				} catch (err) {
					throw err;
				}
			}
		}`,
		// An await in a branch that returns does not reach the registration.
		`class A extends Disposable { async f() { if (c) { await y; return; } this._register(x); } }`,
		`class A extends Disposable { async f() { for (const a of b) { await y; if (token.isCancellationRequested) { break; } this._register(a); } } }`,
		`class A extends Disposable { async f() { while (!token.isCancellationRequested) { this._register(x); await y; } } }`,
		// Nested functions are analyzed on their own.
		`class A extends Disposable { async f() { await y; return () => this._register(x); } }`,
		`class A extends Disposable { async f() { this._register(e(async () => { await y; })); } }`,
		// Not a registration on this object.
		`class A extends Disposable { async f() { const store = new DisposableStore(); await y; store.add(x); } }`,
		`class A extends Disposable { async f() { await y; other._register(x); } }`,
		`class A extends Disposable { async f() { await y; thenRegisterOrDispose(p, this._store); } }`,
		`class A extends Disposable { private readonly _pending = new Set<string>(); async f() { await y; this._pending.add(x); } }`,
		`class A extends Disposable { private readonly _store2: Set<string>; async f() { await y; this._store2.add(x); } }`,
		`class A extends Disposable { private readonly _input = new InputBox(); async f() { await y; this._input.value = x; } }`,
		`class A extends Disposable { private readonly _map = new Map<string, B>(); async f() { await y; this._map.set('a', x); } }`,
		// Clearing a mutable disposable after disposal does not leak.
		`class A extends Disposable { private readonly _current = this._register(new MutableDisposable()); async f() { await y; this._current.value = undefined; } }`,
	],
	invalid: [
		{
			code: storageBeforeFix,
			errors: [
				{ messageId: 'registerAfterAwait', data: { name: 'this._register' }, line: 13 },
				{ messageId: 'registerAfterAwait', data: { name: 'this._register' }, line: 22 },
				{ messageId: 'registerAfterAwait', data: { name: 'this._register' }, line: 65 },
			],
		},
		{
			code: `class A extends Disposable { async f() { this._register(await y); } }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { await y; this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { await y; this._store.add(x); this._disposables.add(x); this.#store.add(x); this.renderDisposables.add(x); } }`,
			errors: registered('this._store.add', 'this._disposables.add', 'this.#store.add', 'this.renderDisposables.add'),
		},
		{
			code: `class A extends Disposable { private readonly toUnhook = new DisposableStore(); async f() { await y; this.toUnhook.add(x); } }`,
			errors: registered('this.toUnhook.add'),
		},
		{
			code: `class A { private readonly listeners: DisposableStore; constructor() { this.listeners = new DisposableStore(); } async f() { await y; this.listeners.add(x); } }`,
			errors: registered('this.listeners.add'),
		},
		{
			code: `class A extends Disposable { private readonly _current = this._register(new MutableDisposable<IDisposable>()); async f() { await y; this._current.value = x; } }`,
			errors: registered('this._current.value'),
		},
		{
			code: `class A extends Disposable { private readonly _entries = this._register(new DisposableMap<string>()); async f() { await y; this._entries.set('a', x); } }`,
			errors: registered('this._entries.set'),
		},
		{
			code: `class A extends Disposable { private readonly load = async () => { await y; this._register(x); }; }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { for await (const x of y) { this._register(x); } } }`,
			errors: registered('this._register'),
		},
		{
			// The second iteration registers after the await of the first.
			code: `class A extends Disposable { async f() { for (const x of y) { this._register(x); await z; } } }`,
			errors: registered('this._register'),
		},
		{
			// The check does not stop the registration.
			code: `class A extends Disposable { async f() { const x = await y; if (this._store.isDisposed) { x.dispose(); } this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { const x = await y; if (this._store.isDisposed) { this._register(x); } } }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { await y; if (this._store.isDisposed && c) { return; } this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			// The check runs before the await.
			code: `class A extends Disposable { async f() { if (this._store.isDisposed) { return; } await y; this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			// `raceCancellation` resolves with `undefined` on cancellation instead of throwing.
			code: `class A extends Disposable { async f(token: CancellationToken) { const x = await raceCancellation(y, token); this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			// `raceCancellationError` can resolve after the token was cancelled, and the token may not track disposal.
			code: `class A extends Disposable { async f(token: CancellationToken) { const x = await raceCancellationError(y, token); this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			// A `break` in the finally block leaves the loop after the await.
			code: `class A extends Disposable { async f() { for (;;) { try { await y; } finally { break; } } this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { if (c) { await y; } this._register(x); } }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { try { await y; } catch { this._register(x); } } }`,
			errors: registered('this._register'),
		},
		{
			code: `class A extends Disposable { async f() { try { await y; } finally { this._register(x); } } }`,
			errors: registered('this._register'),
		},
		{
			// Only the nested async function registers after its own await.
			code: `class A extends Disposable { async f() { await y; if (this._store.isDisposed) { return; } this._register(e(async () => { await z; this._register(x); })); } }`,
			errors: [{ messageId: 'registerAfterAwait', data: { name: 'this._register' }, column: 131 }],
		},
	],
});
