/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export class TestMessage2 extends TestMessage {
		/**
		 * The stack trace associated with the message or failure.
		 */
		stackTrace?: TestMessageStackFrame[];
	}

	export class TestMessageStackFrame {
		/**
		 * The location of this stack frame. This should be provided as a URI if the
		 * location of the call frame can be accessed by the editor.
		 */
		file?: Uri;

		/**
		 * Position of the stack frame within the file.
		 */
		position?: Position;

		/**
		 * The name of the stack frame, typically a method or function name.
		 */
		label: string;

		/**
		 * @param label The name of the stack frame
		 * @param file The file URI of the stack frame
		 * @param position The position of the stack frame within the file
		 */
		constructor(label: string, file?: Uri, position?: Position);
	}
}
