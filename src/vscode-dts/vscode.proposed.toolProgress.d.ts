/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ProgressOptions2 extends Omit<ProgressOptions, 'location'> {
		location: ProgressLocation | {
			/**
			 * The identifier of a view for which progress should be shown.
			 */
			viewId: string;
		} | {
			/**
			 * An invocation token for progress shown while a {@link LanguageModelTool} is running.
			 */
			toolInvocationToken: ChatParticipantToolToken | undefined;
		};
	}

	export namespace window {
		export function withProgress<R>(options: ProgressOptions2, task: (progress: Progress<{
			/**
			 * A progress message that represents a chunk of work
			 */
			message?: string;
			/**
			 * An increment for discrete progress. Increments will be summed up until 100% is reached
			 */
			increment?: number;
		}>, token: CancellationToken) => Thenable<R>): Thenable<R>;
	}
}
