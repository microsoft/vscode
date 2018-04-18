/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ILocalizeInfo {
	key: string;
	comment: string[];
}

export declare function localize(info: ILocalizeInfo, message: string, ...args: any[]): string;
export declare function localize(key: string, message: string, ...args: any[]): string;
