/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="../src/vs/vscode.d.ts" />
/// <reference path="../src/typings/mocha.d.ts" />

// Declaring the following because the code gets compiled with es5, which lack definitions for console and timers.
declare var console: {
    assert(value: any, message?: string, ...optionalParams: any[]): void;
    dir(obj: any, options?: {showHidden?: boolean, depth?: number, colors?: boolean}): void;
    error(message?: any, ...optionalParams: any[]): void;
    info(message?: any, ...optionalParams: any[]): void;
    log(message?: any, ...optionalParams: any[]): void;
    time(label: string): void;
    timeEnd(label: string): void;
    trace(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
};