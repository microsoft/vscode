/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type RunFunction = ((debugSession: IDebugSession) => IDisposable) | ((debugSession: IDebugSession) => Promise<IDisposable>);

interface IDebugSession {
	name: string;
	eval(expression: string): Promise<void>;
	evalJs<T extends any[]>(bodyFn: (...args: T) => void, ...args: T): Promise<void>;
}

interface IDisposable {
	dispose(): void;
}

interface GlobalThisAddition {
	$hotReload_applyNewExports?(args: { oldExports: Record<string, unknown>; newSrc: string }): AcceptNewExportsFn | undefined;
}

type AcceptNewExportsFn = (newExports: Record<string, unknown>) => boolean;
