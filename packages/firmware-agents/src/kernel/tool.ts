/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentHost } from './host';
import { JsonSchema } from './jsonSchema';
import { ToolSpec } from './llm';

/**
 * - `read`: no side effects (read a file, read memory, decode a register).
 * - `write`: changes files or the workspace (edit source, install a tool).
 * - `hardware`: changes the target (flash, write memory, reset).
 * Anything but `read` is approval-gated by {@link ApprovalRequiredTool}.
 */
export type ToolRisk = 'read' | 'write' | 'hardware';

export interface ToolContext {
	readonly host: IAgentHost;
	readonly signal: AbortSignal;
	readonly agentId: string;
	readonly callId: string;
}

/** One agent capability (Command pattern). The result must be JSON-serializable. */
export interface ITool<I = unknown, O = unknown> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: JsonSchema;
	readonly risk: ToolRisk;
	/** One line for approval prompts and logs. */
	describeCall?(input: I): string;
	invoke(input: I, context: ToolContext): Promise<O>;
}

/** An expected failure the model should see and can react to (as opposed to a bug). */
export class ToolError extends Error {
	constructor(message: string, readonly details?: unknown) {
		super(message);
		this.name = 'ToolError';
	}
}

/** Typed helper so tool definitions infer `I` and `O` from `invoke`. */
export function defineTool<I, O>(tool: ITool<I, O>): ITool<I, O> {
	return tool;
}

export function toToolSpec(tool: ITool<never, unknown>): ToolSpec {
	return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}
