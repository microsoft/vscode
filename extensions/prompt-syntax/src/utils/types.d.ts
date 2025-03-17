/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type for any function.
 */
// its ok to disable any here because it is the only way to make
// the type work and the type does not really matter in this case
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TAnyFunction = (...args: any[]) => unknown;
