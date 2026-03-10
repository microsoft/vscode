/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool output truncation middleware.
 *
 * Automatically truncates large tool outputs before they are fed back to the
 * model, preventing context window exhaustion from verbose tool results
 * (e.g., large file contents, long command outputs).
 */

import { IMiddleware, IPostToolContext, IPostToolResult } from '../../common/middleware.js';

const DEFAULT_MAX_LENGTH = 50_000; // characters
const TRUNCATION_SUFFIX = '\n\n[Output truncated. Use more specific queries or line ranges to see the full content.]';

export class ToolOutputTruncationMiddleware implements IMiddleware {
	constructor(
		private readonly _maxLength: number = DEFAULT_MAX_LENGTH,
	) { }

	postTool(context: IPostToolContext): IPostToolResult {
		let result = context.result;
		if (result.length > this._maxLength) {
			result = result.substring(0, this._maxLength) + TRUNCATION_SUFFIX;
		}
		return { result, isError: context.isError };
	}
}
