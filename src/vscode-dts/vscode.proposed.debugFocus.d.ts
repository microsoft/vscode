/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// See https://github.com/microsoft/vscode/issues/63943

	export interface ThreadContext {
		/**
		 * Id of the debug session (DAP id).
		 */
		readonly sessionId: string;

		/**
		 * Id of the associated thread (DAP id). May be undefined if thread has become unselected.
		 */
		readonly threadId: number | undefined;
	}

	export interface StackFrameContext {
		/**
		 * Id of the debug session (DAP id).
		 */
		readonly sessionId: string;

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
		 * The currently focused thread
		 */
		export let threadFocus: ThreadContext | undefined;

		/**
		 * An {@link Event} which fires when the {@link debug.threadFocus} changes. Provides a sessionId. threadId is defined
		 * when a thread of frame has gained focus, and undefined when no frame is selected.
		 *
		 * This event will be fired if a stack frame is selected
		 */
		export const onDidChangeThreadFocus: Event<ThreadContext>;

		/**
		 * The currently focused thread or stack frame id, or `undefined` if no frame is selected.
		 */
		export let stackFrameFocus: StackFrameContext | undefined;

		/**
		 * An {@link Event} which fires when the {@link debug.stackFrameFocus} changes. Provides a sessionId and threadId.
		 * stackFrameId is when a frame has gained focus, and undefined when no stack frame is selected.
		 *
		 * This event will be accompanied by a onDidChangeThreadFocus event, also. Listeners should listen for
		 * the appropriate granularity.
		 */
		export const onDidChangeStackFrameFocus: Event<StackFrameContext>;
	}
}
