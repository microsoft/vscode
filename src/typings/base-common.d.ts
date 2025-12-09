/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Declare types that we probe for to implement util and/or polyfill functions

declare global {

	// --- idle callbacks

	interface IdleDeadline {
		readonly didTimeout: boolean;
		timeRemaining(): number;
	}

	function requestIdleCallback(callback: (args: IdleDeadline) => void, options?: { timeout: number }): number;
	function cancelIdleCallback(handle: number): void;


	// --- timeout / interval (available in all contexts, but different signatures in node.js vs web)

	interface TimeoutHandle { readonly _: never; /* this is a trick that seems needed to prevent direct number assignment */ }
	type Timeout = TimeoutHandle;
	function setTimeout(handler: string | Function, timeout?: number, ...arguments: any[]): Timeout;
	function clearTimeout(timeout: Timeout | undefined): void;

	function setInterval(callback: (...args: any[]) => void, delay?: number, ...args: any[]): Timeout;
	function clearInterval(timeout: Timeout | undefined): void;


	// --- error

	interface ErrorConstructor {
		captureStackTrace(targetObject: object, constructorOpt?: Function): void;
		stackTraceLimit: number;
	}
}

export { }
