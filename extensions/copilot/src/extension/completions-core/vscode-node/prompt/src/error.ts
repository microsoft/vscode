/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class CopilotPromptLoadFailure extends Error {
	readonly code = 'CopilotPromptLoadFailure';
	constructor(message: string, cause?: unknown) {
		super(message, { cause });
	}
}
