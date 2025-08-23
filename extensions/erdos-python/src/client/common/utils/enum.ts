// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

export function getNamesAndValues<T>(e: any): { name: string; value: T }[] {
    return getNames(e).map((n) => ({ name: n, value: e[n] }));
}

function getNames(e: any) {
    return getObjValues(e).filter((v) => typeof v === 'string') as string[];
}

export function getValues<T>(e: any) {
    return (getObjValues(e).filter((v) => typeof v === 'number') as any) as T[];
}

function getObjValues(e: any): (number | string)[] {
    return Object.keys(e).map((k) => e[k]);
}
