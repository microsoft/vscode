/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

/// <reference no-default-lib="true"/>
interface Map<K, V> {
    clear(): void;
    delete(key: K): boolean;
    forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value?: V): this;
    readonly size: number;
}

interface MapConstructor {
    new (): Map<any, any>;
    new <K, V>(entries?: [K, V][]): Map<K, V>;
    readonly prototype: Map<any, any>;
}
declare var Map: MapConstructor;

interface WeakMap<K, V> {
    delete(key: K): boolean;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value?: V): this;
}

interface WeakMapConstructor {
    new (): WeakMap<any, any>;
    new <K, V>(entries?: [K, V][]): WeakMap<K, V>;
    readonly prototype: WeakMap<any, any>;
}
declare var WeakMap: WeakMapConstructor;

interface Set<T> {
    add(value: T): this;
    clear(): void;
    delete(value: T): boolean;
    forEach(callbackfn: (value: T, index: T, set: Set<T>) => void, thisArg?: any): void;
    has(value: T): boolean;
    readonly size: number;
}

interface SetConstructor {
    new (): Set<any>;
    new <T>(values?: T[]): Set<T>;
    readonly prototype: Set<any>;
}
declare var Set: SetConstructor;

interface WeakSet<T> {
    add(value: T): this;
    delete(value: T): boolean;
    has(value: T): boolean;
}

interface WeakSetConstructor {
    new (): WeakSet<any>;
    new <T>(values?: T[]): WeakSet<T>;
    readonly prototype: WeakSet<any>;
}
declare var WeakSet: WeakSetConstructor;
