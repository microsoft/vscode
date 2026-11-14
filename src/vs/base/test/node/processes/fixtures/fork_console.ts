/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const sharedValue = { value: 1 };

const circularValue: { name: string; self?: unknown } = { name: 'circular' };
circularValue.self = circularValue;

console.log(sharedValue, { a: sharedValue, b: sharedValue }, circularValue);
