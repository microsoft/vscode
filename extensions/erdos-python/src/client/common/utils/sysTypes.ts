/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const _typeof = {
    number: 'number',
    string: 'string',
    undefined: 'undefined',
    object: 'object',
    function: 'function',
};

/**
 * @returns whether the provided parameter is a JavaScript Array or not.
 */
export function isArray(array: any): array is any[] {
    if (Array.isArray) {
        return Array.isArray(array);
    }

    if (array && typeof array.length === _typeof.number && array.constructor === Array) {
        return true;
    }

    return false;
}

/**
 * @returns whether the provided parameter is a JavaScript String or not.
 */
export function isString(str: any): str is string {
    if (typeof str === _typeof.string || str instanceof String) {
        return true;
    }

    return false;
}

/**
 *
 * @returns whether the provided parameter is of type `object` but **not**
 *	`null`, an `array`, a `regexp`, nor a `date`.
 */
export function isObject(obj: any): obj is any {
    return (
        typeof obj === _typeof.object &&
        obj !== null &&
        !Array.isArray(obj) &&
        !(obj instanceof RegExp) &&
        !(obj instanceof Date)
    );
}

/**
 * In **contrast** to just checking `typeof` this will return `false` for `NaN`.
 * @returns whether the provided parameter is a JavaScript Number or not.
 */
export function isNumber(obj: any): obj is number {
    if ((typeof obj === _typeof.number || obj instanceof Number) && !isNaN(obj)) {
        return true;
    }

    return false;
}
