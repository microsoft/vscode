/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from './disposable';
import { ITool, ToolRisk } from './tool';

/** Any tool, whatever its input type (`invoke` is a method, so parameter types are bivariant). */
export type AnyTool = ITool<unknown, unknown>;

/** The tools one agent may use. Agents only ever see a set, never the whole registry. */
export interface IToolSet {
	get(name: string): AnyTool | undefined;
	list(): readonly AnyTool[];
}

export interface ToolFilter {
	readonly names?: readonly string[];
	readonly risks?: readonly ToolRisk[];
}

export interface IToolRegistry extends IToolSet {
	register(tool: AnyTool): IDisposable;
	/** A live, filtered view: tools registered later that match the filter show up too. */
	view(filter: ToolFilter): IToolSet;
}

const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export class ToolRegistry implements IToolRegistry {
	private readonly tools = new Map<string, AnyTool>();

	register(tool: AnyTool): IDisposable {
		if (!TOOL_NAME.test(tool.name)) {
			throw new Error(`Invalid tool name "${tool.name}" (letters, digits, _ and -, at most 64)`);
		}
		if (this.tools.has(tool.name)) {
			throw new Error(`Tool "${tool.name}" is already registered`);
		}
		this.tools.set(tool.name, tool);
		return toDisposable(() => {
			if (this.tools.get(tool.name) === tool) {
				this.tools.delete(tool.name);
			}
		});
	}

	get(name: string): AnyTool | undefined {
		return this.tools.get(name);
	}

	list(): readonly AnyTool[] {
		return [...this.tools.values()];
	}

	view(filter: ToolFilter): IToolSet {
		const matches = (tool: AnyTool) =>
			(!filter.names || filter.names.includes(tool.name)) &&
			(!filter.risks || filter.risks.includes(tool.risk));
		return {
			get: name => {
				const tool = this.tools.get(name);
				return tool && matches(tool) ? tool : undefined;
			},
			list: () => this.list().filter(matches),
		};
	}
}
