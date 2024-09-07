/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type RunFunction =
	| ((debugSession: IDebugSession, context: Context) => IDisposable)
	| ((debugSession: IDebugSession, context: Context) => Promise<IDisposable>);

interface IDebugSession {
	name: string;
	eval(expression: string): Promise<unknown>;
	evalJs<T extends any[], TResult>(
		bodyFn: (...args: T) => TResult,
		...args: T
	): Promise<TResult>;
}

interface Context {
	vscode: typeof import('vscode');
}

interface IDisposable {
	dispose(): void;
}

interface HotReloadConfig {
	mode?: 'patch-prototype' | undefined;
}

interface GlobalThisAddition {
	$hotReload_applyNewExports?(args: { oldExports: Record<string, unknown>; newSrc: string; config?: HotReloadConfig }): AcceptNewExportsFn | undefined;
}

type AcceptNewExportsFn = (newExports: Record<string, unknown>) => boolean;
