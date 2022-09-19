/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface AbstractOutputChannel {
		/**
		 * The human-readable name of this output channel.
		 */
		readonly name: string;

		/**
		 * Append the given value and a line feed character
		 * to the channel.
		 *
		 * @param value A string, falsy values will be printed.
		 */
		appendLine(value: string): void;

		/**
		 * Reveal this channel in the UI.
		 *
		 * @param preserveFocus When `true` the channel will not take focus.
		 */
		show(preserveFocus?: boolean): void;

		/**
		 * Hide this channel from the UI.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	/**
	 * An output channel is a container for readonly textual information.
	 *
	 * To get an instance of an `OutputChannel` use
	 * {@link window.createOutputChannel createOutputChannel}.
	 */
	export interface OutputChannel extends AbstractOutputChannel {

		/**
		 * Append the given value to the channel.
		 *
		 * @param value A string, falsy values will not be printed.
		 */
		append(value: string): void;

		/**
		 * Replaces all output from the channel with the given value.
		 *
		 * @param value A string, falsy values will not be printed.
		 */
		replace(value: string): void;

		/**
		 * Removes all output from the channel.
		 */
		clear(): void;

		/**
		 * Reveal this channel in the UI.
		 *
		 * @deprecated Use the overload with just one parameter (`show(preserveFocus?: boolean): void`).
		 *
		 * @param column This argument is **deprecated** and will be ignored.
		 * @param preserveFocus When `true` the channel will not take focus.
		 */
		show(column?: ViewColumn, preserveFocus?: boolean): void;
	}

	/**
	 * A channel for containing log output.
	 */
	export interface LogOutputChannel extends AbstractOutputChannel {
		/**
		 * Log the given trace message to the channel.
		 *
		 * Messages are only printed when the user has enabled trace logging for the extension.
		 *
		 * @param message trace message to log
		 */
		trace(message: string): void;
		/**
		 * Log the given debug message to the channel.
		 *
		 * Messages are only printed when the user has enabled debug logging for the extension.
		 *
		 * @param message debug message to log
		 */
		debug(message: string): void;
		/**
		 * Log the given info message to the channel.
		 *
		 * Messages are only printed when the user has enabled info logging for the extension.
		 *
		 * @param message info message to log
		 */
		info(message: string): void;
		/**
		 * Log the given warning message to the channel.
		 *
		 * Messages are only printed when the user has enabled warn logging for the extension.
		 *
		 * @param message warning message to log
		 */
		warn(message: string): void;
		/**
		 * Log the given error or error message to the channel.
		 *
		 * Messages are only printed when the user has enabled error logging for the extension.
		 *
		 * @param error Error or error message to log
		 */
		error(error: string | Error): void;
	}

	export namespace window {
		/**
		 * Creates a new {@link LogOutputChannel log output channel} with the given name.
		 *
		 * @param name Human-readable string which will be used to represent the channel in the UI.
		 * @param options Options for the log output channel.
		 */
		export function createOutputChannel(name: string, options: { readonly log: true }): LogOutputChannel;
	}

}
