/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// See https://github.com/microsoft/vscode/issues/63943

	export interface ThreadFocus {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'thread';

		/**
		 * Debug session for thread.
		 */
		readonly session: DebugSession;

		/**
		 * Id of the associated thread (DAP id). May be undefined if thread has become unselected.
		 */
		readonly threadId: number | undefined;
	}

	export interface StackFrameFocus {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'stackFrame';

		/**
		 * Debug session for thread.
		 */
		readonly session: DebugSession;

		/**
		 * Id of the associated thread (DAP id). May be undefined if a frame is unselected.
		 */
		readonly threadId: number | undefined;
		/**
		 * Id of the stack frame (DAP id). May be undefined if a frame is unselected.
		 */
		readonly frameId: number | undefined;
	}


	export namespace debug {
		/**
		 * The currently focused thread or stack frame id, or `undefined` if this has not been set. (e.g. not in debug mode).
		 */
		export let stackFrameFocus: ThreadFocus | StackFrameFocus | undefined;

		/**
		 * An {@link Event} which fires when the {@link debug.stackFrameFocus} changes. Provides a sessionId. threadId is not undefined
		 * when a thread of frame has gained focus. frameId is defined when a stackFrame has gained focus.
		 */
		export const onDidChangeStackFrameFocus: Event<ThreadFocus | StackFrameFocus | undefined>;
	}
}
