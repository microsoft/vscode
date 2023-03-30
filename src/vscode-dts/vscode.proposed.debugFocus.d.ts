/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// See https://github.com/microsoft/vscode/issues/160694

	export namespace debug {
		/**
		* An event describing UI selection changes
		*/
		export type DebugFocusType = 'thread' | 'stackFrame' | 'empty';
		export interface DebugFocus {
			readonly type: DebugFocusType;
			/**
			 * Id of the debug session (DAP id). May be undefined if terminated, etc.
			 */
			readonly sessionId?: string;

			/**
			 * Id of the associated thread (DAP id). May be undefined if a session is selected, but no thread of frame is (this
			 * state is not currently possible in the UI)
			 */
			readonly threadId?: number;
			/**
			 * Id of the stack frame (DAP id), if applicable. May be undefined if a thread is selected, but no frame is (this
			 * state is not currently possible in the UI)
			 */
			readonly frameId?: number;
		}
		/**
		 * The currently focused thread or stack frame id, or `undefined` if this has not been set. (e.g. not in debug mode).
		 */
		export let focus: DebugFocus | undefined;

		/**
		 * An {@link Event} which fires when the {@link debug.focus} changes. Provides a sessionId. threadId is not undefined
		 * when a thread of frame has gained focus. frameId is defined when a stackFrame has gained focus.
		 */
		export const onDidChangeDebugFocus: Event<DebugFocus | undefined>;
	}
}
