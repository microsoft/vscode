/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Permission system middleware.
 *
 * Checks tool calls against a permission policy before execution. Policies
 * specify allow/deny/ask per tool and argument pattern. When 'ask' is returned,
 * the middleware suspends execution and waits for user approval via a callback.
 *
 * This middleware does not know about the UI -- it delegates to an
 * {@link IPermissionHandler} callback for user interaction.
 */

import { IMiddleware, IPreToolContext, IPreToolResult } from '../../common/middleware.js';

// -- Policy types -------------------------------------------------------------

export const enum PermissionDecision {
	Allow = 'allow',
	Deny = 'deny',
	Ask = 'ask',
}

export interface IPermissionPolicy {
	/**
	 * Evaluate a tool call and return a permission decision.
	 *
	 * @param toolName - The tool being called.
	 * @param args - The tool arguments.
	 * @returns Whether to allow, deny, or ask the user.
	 */
	evaluate(toolName: string, args: Record<string, unknown>): PermissionDecision;
}

// -- Permission handler (UI interaction) --------------------------------------

export interface IPermissionRequest {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly arguments: Record<string, unknown>;
}

/**
 * Callback that handles user-facing permission prompts.
 * Returns true if the user approves, false if denied.
 */
export type IPermissionHandler = (request: IPermissionRequest) => Promise<boolean>;

// -- Default policies ---------------------------------------------------------

/**
 * A simple policy that allows read-only tools and asks for everything else.
 */
export class DefaultPermissionPolicy implements IPermissionPolicy {
	private readonly _readOnlyTools: ReadonlySet<string>;

	constructor(readOnlyToolNames: readonly string[]) {
		this._readOnlyTools = new Set(readOnlyToolNames);
	}

	evaluate(toolName: string, _args: Record<string, unknown>): PermissionDecision {
		if (this._readOnlyTools.has(toolName)) {
			return PermissionDecision.Allow;
		}
		return PermissionDecision.Ask;
	}
}

/**
 * Auto-approve everything. For use in testing or trusted environments.
 */
export class AllowAllPolicy implements IPermissionPolicy {
	evaluate(_toolName: string, _args: Record<string, unknown>): PermissionDecision {
		return PermissionDecision.Allow;
	}
}

// -- Middleware ----------------------------------------------------------------

export class PermissionMiddleware implements IMiddleware {
	constructor(
		private readonly _policy: IPermissionPolicy,
		private readonly _handler: IPermissionHandler,
	) { }

	async preTool(context: IPreToolContext): Promise<IPreToolResult> {
		const decision = this._policy.evaluate(context.toolName, context.arguments);

		switch (decision) {
			case PermissionDecision.Allow:
				return { arguments: context.arguments };

			case PermissionDecision.Deny:
				return {
					arguments: context.arguments,
					skip: true,
					cannedResult: `Permission denied: the tool "${context.toolName}" is not allowed by the current policy.`,
				};

			case PermissionDecision.Ask: {
				const approved = await this._handler({
					toolCallId: context.toolCallId,
					toolName: context.toolName,
					arguments: context.arguments,
				});

				if (approved) {
					return { arguments: context.arguments };
				}

				return {
					arguments: context.arguments,
					skip: true,
					cannedResult: `Permission denied by user: the tool "${context.toolName}" was not approved.`,
				};
			}
		}
	}
}
