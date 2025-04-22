/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A progress update during an {@link LanguageModelTool.invoke} call.
	 */
	export interface ToolProgressStep {
		/**
		 * A progress message that represents a chunk of work
		 */
		message?: string;
		/**
		 * An increment for discrete progress. Increments will be summed up until 100 (100%) is reached
		 */
		increment?: number;
	}

	export interface LanguageModelToolInvocation<T> extends LanguageModelToolInvocationOptions<T> {
		/**
		 * Progress interface to report updates as the tool is running.
		 */
		progress: Progress<ToolProgressStep>;
	}

	export interface LanguageModelTool<T> {
		invoke(invocation: LanguageModelToolInvocation<T>, token: CancellationToken): ProviderResult<LanguageModelToolResult>;
	}
}
