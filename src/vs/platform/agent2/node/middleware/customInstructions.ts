/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Custom instructions middleware.
 *
 * Injects caller-provided instruction content into the system prompt before
 * each model call. Instructions are appended to the system prompt so they
 * are treated as system-level directives rather than conversation history.
 *
 * The instructions themselves are loaded and assembled externally (from repo
 * files, user preferences, organization policies). This middleware just
 * includes what it's given.
 */

import { IMiddleware, IPreRequestContext, IPreRequestResult } from '../../common/middleware.js';

/**
 * Provides custom instruction content. The caller implements this to
 * resolve instructions from whatever sources are configured (repo files,
 * user settings, organization policies, etc.).
 */
export interface IInstructionProvider {
	/**
	 * Returns the instruction content to inject into the system prompt.
	 * Called before each model request; may return different content
	 * depending on context.
	 */
	getInstructions(): string | undefined;
}

export class CustomInstructionsMiddleware implements IMiddleware {
	constructor(
		private readonly _provider: IInstructionProvider,
	) { }

	preRequest(context: IPreRequestContext): IPreRequestResult {
		const instructions = this._provider.getInstructions();
		if (!instructions) {
			return { systemPrompt: context.systemPrompt, messages: context.messages, tools: context.tools };
		}

		// Append instructions to the system prompt as a dedicated section.
		const augmentedPrompt = `${context.systemPrompt}\n\n<custom_instructions>\n${instructions}\n</custom_instructions>`;

		return {
			systemPrompt: augmentedPrompt,
			messages: context.messages,
			tools: context.tools,
		};
	}
}
