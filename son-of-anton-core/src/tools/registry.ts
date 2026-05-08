/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Tool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types';
import { BUILTIN_TOOLS } from './builtin';

export class ToolRegistry {
	private readonly tools = new Map<string, Tool>();

	constructor(initial: ReadonlyArray<Tool> = BUILTIN_TOOLS) {
		for (const t of initial) {
			this.tools.set(t.definition.name, t);
		}
	}

	register(tool: Tool): void { this.tools.set(tool.definition.name, tool); }
	unregister(name: string): boolean { return this.tools.delete(name); }
	get(name: string): Tool | undefined { return this.tools.get(name); }
	definitions(): ReadonlyArray<ToolDefinition> { return [...this.tools.values()].map(t => t.definition); }

	async execute(name: string, input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const tool = this.tools.get(name);
		if (!tool) {
			return { content: `Unknown tool: ${name}`, isError: true };
		}
		try {
			return await tool.execute(input, ctx);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { content: `Tool '${name}' threw: ${msg}`, isError: true };
		}
	}
}

export { BUILTIN_TOOLS };
