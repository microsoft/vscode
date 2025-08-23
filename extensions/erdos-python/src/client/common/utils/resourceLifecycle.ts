// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import { traceWarn } from '../../logging';
import { IDisposable } from '../types';
import { Iterable } from './iterable';

interface IDisposables extends IDisposable {
    push(...disposable: IDisposable[]): void;
}

export const EmptyDisposable = {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    dispose: () => {
        /** */
    },
};

/**
 * Disposes of the value(s) passed in.
 */
export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable, A extends Iterable<T> = Iterable<T>>(disposables: A): A;
export function dispose<T extends IDisposable>(disposables: Array<T>): Array<T>;
export function dispose<T extends IDisposable>(disposables: ReadonlyArray<T>): ReadonlyArray<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any, consistent-return
export function dispose<T extends IDisposable>(arg: T | Iterable<T> | undefined): any {
    if (Iterable.is(arg)) {
        for (const d of arg) {
            if (d) {
                try {
                    d.dispose();
                } catch (e) {
                    traceWarn(`dispose() failed for ${d}`, e);
                }
            }
        }

        return Array.isArray(arg) ? [] : arg;
    }
    if (arg) {
        arg.dispose();
        return arg;
    }
}

/**
 * Safely dispose each of the disposables.
 */
export async function disposeAll(disposables: IDisposable[]): Promise<void> {
    await Promise.all(
        disposables.map(async (d) => {
            try {
                return Promise.resolve(d.dispose());
            } catch (err) {
                // do nothing
            }
            return Promise.resolve();
        }),
    );
}

/**
 * A list of disposables.
 */
export class Disposables implements IDisposables {
    private disposables: IDisposable[] = [];

    constructor(...disposables: IDisposable[]) {
        this.disposables.push(...disposables);
    }

    public push(...disposables: IDisposable[]): void {
        this.disposables.push(...disposables);
    }

    public async dispose(): Promise<void> {
        const { disposables } = this;
        this.disposables = [];
        await disposeAll(disposables);
    }
}

/**
 * Manages a collection of disposable values.
 *
 * This is the preferred way to manage multiple disposables. A `DisposableStore` is safer to work with than an
 * `IDisposable[]` as it considers edge cases, such as registering the same value multiple times or adding an item to a
 * store that has already been disposed of.
 */
export class DisposableStore implements IDisposable {
    static DISABLE_DISPOSED_WARNING = false;

    private readonly _toDispose = new Set<IDisposable>();

    private _isDisposed = false;

    constructor(...disposables: IDisposable[]) {
        disposables.forEach((disposable) => this.add(disposable));
    }

    /**
     * Dispose of all registered disposables and mark this object as disposed.
     *
     * Any future disposables added to this object will be disposed of on `add`.
     */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._isDisposed = true;
        this.clear();
    }

    /**
     * @return `true` if this object has been disposed of.
     */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Dispose of all registered disposables but do not mark this object as disposed.
     */
    public clear(): void {
        if (this._toDispose.size === 0) {
            return;
        }

        try {
            dispose(this._toDispose);
        } finally {
            this._toDispose.clear();
        }
    }

    /**
     * Add a new {@link IDisposable disposable} to the collection.
     */
    public add<T extends IDisposable>(o: T): T {
        if (!o) {
            return o;
        }
        if (((o as unknown) as DisposableStore) === this) {
            throw new Error('Cannot register a disposable on itself!');
        }

        if (this._isDisposed) {
            if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
                traceWarn(
                    new Error(
                        'Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!',
                    ).stack,
                );
            }
        } else {
            this._toDispose.add(o);
        }

        return o;
    }
}

/**
 * Abstract class for a {@link IDisposable disposable} object.
 *
 * Subclasses can {@linkcode _register} disposables that will be automatically cleaned up when this object is disposed of.
 */
export abstract class DisposableBase implements IDisposable {
    protected readonly _store = new DisposableStore();

    private _isDisposed = false;

    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    constructor(...disposables: IDisposable[]) {
        disposables.forEach((disposable) => this._store.add(disposable));
    }

    public dispose(): void {
        this._store.dispose();
        this._isDisposed = true;
    }

    /**
     * Adds `o` to the collection of disposables managed by this object.
     */
    public _register<T extends IDisposable>(o: T): T {
        if (((o as unknown) as DisposableBase) === this) {
            throw new Error('Cannot register a disposable on itself!');
        }
        return this._store.add(o);
    }
}
