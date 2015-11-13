/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


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