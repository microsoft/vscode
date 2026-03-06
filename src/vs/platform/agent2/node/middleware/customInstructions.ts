/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Custom instructions middleware.
 *
 * Injects caller-provided instruction content into the conversation before
 * each model call. Instructions are prepended as additional user messages
 * so they are visible to the model alongside the conversation.
 *
 * The instructions themselves are loaded and assembled externally (from repo
 * files, user preferences, organization policies). This middleware just
 * includes what it's given.
 */

import { createUserMessage } from '../../common/conversation.js';
import { IMiddleware, IPreRequestContext, IPreRequestResult } from '../../common/middleware.js';

/**
 * Provides custom instruction content. The caller implements this to
 * resolve instructions from whatever sources are configured (repo files,
 * user settings, organization policies, etc.).
 */
export interface IInstructionProvider {
	/**
	 * Returns the instruction content to inject into the conversation.
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
			return { messages: context.messages, tools: context.tools };
		}

		// Inject instructions as the first user message in the conversation
		// so they appear early in the context.
		const instructionMessage = createUserMessage(
			`<custom_instructions>\n${instructions}\n</custom_instructions>`,
		);

		return {
			messages: [instructionMessage, ...context.messages],
			tools: context.tools,
		};
	}
}
