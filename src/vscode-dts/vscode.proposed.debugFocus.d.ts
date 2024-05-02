/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// See https://github.com/microsoft/vscode/issues/63943

	export class DebugThread {
		/**
		 * Create a ThreadFocus
		 * @param session
		 * @param threadId
		 */
		constructor(session: DebugSession, threadId: number);

		/**
		 * Debug session for thread.
		 */
		readonly session: DebugSession;

		/**
		 * ID of the associated thread in the debug protocol.
		 */
		readonly threadId: number;
	}

	export class DebugStackFrame {
		/**
		 * Create a StackFrameFocus
		 * @param session
		 * @param threadId
		 * @param frameId
		 */
		constructor(session: DebugSession, threadId?: number, frameId?: number);

		/**
		 * Debug session for thread.
		 */
		readonly session: DebugSession;

		/**
		 * Id of the associated thread in the debug protocol.
		 */
		readonly threadId: number;
		/**
		 * Id of the stack frame in the debug protocol.
		 */
		readonly frameId: number;
	}


	export namespace debug {
		/**
		 * The currently focused thread or stack frame, or `undefined` if no
		 * thread or stack is focused.
		 */
		export const activeStackItem: DebugThread | DebugStackFrame | undefined;

		/**
		 * An event which fires when the {@link debug.activeStackItem} has changed.
		 */
		export const onDidChangeActiveStackItem: Event<DebugThread | DebugStackFrame | undefined>;
	}
}
