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

declare module 'vs/base/common/async' {

	import vscode = require('vscode');

	export interface ITask<T> {
		(): T;
	}

	export class Delayer<T> {

		public defaultDelay: number;

		constructor(defaultDelay: number);

		public trigger(task: ITask<T>, delay?: number): Thenable<T>;

		public isTriggered():boolean;

		public cancel(): void;
	}

	export class RunOnceScheduler {
		constructor(runner:()=>void, timeout:number);
		public dispose(): void;
		public cancel(): void;
		public schedule(): void;
	}
}

declare module 'vs/base/node/stdFork' {
	import cp = require('child_process');
	export interface IForkOpts {
		cwd?: string;
		env?: any;
		encoding?: string;
		execArgv?: string[];
	}
	export function fork(modulePath: string, args: string[], options: IForkOpts, callback:(error:any, cp:cp.ChildProcess)=>void): void;
}

// Needed by TypeScript plugin to avoid code duplication
declare module 'vs/languages/lib/common/wireProtocol' {
	import stream = require('stream');
	export interface ICallback<T> {
		(data:T):void;
	}
	export enum ReaderType {
		Length = 0,
		Line = 1
	}
	export class Reader<T> {
		constructor(readable: stream.Readable, callback: ICallback<T>, type?: ReaderType);
	}
}
