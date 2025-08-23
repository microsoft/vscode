// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Iterable {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    export function is<T = any>(thing: any): thing is Iterable<T> {
        return thing && typeof thing === 'object' && typeof thing[Symbol.iterator] === 'function';
    }
}
