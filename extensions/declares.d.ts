/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="../src/vs/vscode.d.ts" />
/// <reference path="../src/typings/mocha.d.ts" />
/// <reference path="./node.d.ts" />

declare var define: {
	(moduleName: string, dependencies: string[], callback: (...args: any[]) => any): any;
	(moduleName: string, dependencies: string[], definition: any): any;
	(moduleName: string, callback: (...args: any[]) => any): any;
	(moduleName: string, definition: any): any;
	(dependencies: string[], callback: (...args: any[]) => any): any;
	(dependencies: string[], definition: any): any;
};

declare var require: {
	toUrl(path: string): string;
	(moduleName: string): any;
	(dependencies: string[], callback: (...args: any[]) => any, errorback?: (err: any) => void): any;
	config(data: any): any;
	onError: Function;
	__$__nodeRequire<T>(moduleName: string): T;
};

// Declaring the following because the code gets compiled with es5, which lack definitions for console and timers.
declare var console: {
	info(message?: any, ...optionalParams: any[]): void;
	profile(reportName?: string): void;
	assert(test?: boolean, message?: string, ...optionalParams: any[]): void;
	clear(): void;
	dir(value?: any, ...optionalParams: any[]): void;
	warn(message?: any, ...optionalParams: any[]): void;
	error(message?: any, ...optionalParams: any[]): void;
	log(message?: any, ...optionalParams: any[]): void;
	profileEnd(): void;
};

declare function clearTimeout(handle: number): void;
declare function setTimeout(handler: any, timeout?: any, ...args: any[]): number;
declare function clearInterval(handle: number): void;
declare function setInterval(handler: any, timeout?: any, ...args: any[]): number;
