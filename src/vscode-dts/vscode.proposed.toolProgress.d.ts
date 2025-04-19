/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * todo@connor4312: `vscode.window.withProgres` can take this interface as well.
	 */
	export interface ProgressStep {
		/**
		 * A progress message that represents a chunk of work
		 */
		message?: string;
		/**
		 * An increment for discrete progress. Increments will be summed up until 100 (100%) is reached
		 */
		increment?: number;
	}

	export interface LanguageModelTool<T> {
		invoke(options: LanguageModelToolInvocationOptions<T>, token: CancellationToken, progress: Progress<ProgressStep>): ProviderResult<LanguageModelToolResult>;
	}
}
