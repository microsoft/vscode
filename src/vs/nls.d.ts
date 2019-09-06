/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ILocalizeInfo {
	key: string;
	comment: string[];
}

/**
 * Localize a message. `message` can contain `{n}` notation where it is replaced by the nth value in `...args`.
 */
export declare function localize(info: ILocalizeInfo, message: string, ...args: (string | number | boolean | undefined | null)[]): string;

/**
 * Localize a message. `message` can contain `{n}` notation where it is replaced by the nth value in `...args`.
 */
export declare function localize(key: string, message: string, ...args: (string | number | boolean | undefined | null)[]): string;
