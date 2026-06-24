/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const green = (str: string | number) => process.stdout.isTTY ? `\x1b[32m${str}\x1b[0m` : str;
export const yellow = (str: string | number) => process.stdout.isTTY ? `\x1b[33m${str}\x1b[0m` : str;
export const red = (str: string | number) => process.stdout.isTTY ? `\x1b[31m${str}\x1b[0m` : str;
export const violet = (str: string | number) => process.stdout.isTTY ? `\x1b[35m${str}\x1b[0m` : str;
export const orange = (str: string | number) => process.stdout.isTTY ? `\x1b[33m${str}\x1b[0m` : str;
