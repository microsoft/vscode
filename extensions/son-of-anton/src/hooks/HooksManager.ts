/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type HookEvent =
	| 'beforeAgentStart'
	| 'afterAgentComplete'
	| 'beforeFileChange'
	| 'afterFileChange'
	| 'beforeLlmCall'
	| 'afterLlmCall';

export interface HookDefinition {
	name: string;
	event: HookEvent;
	handler: (context: Record<string, unknown>) => Promise<HookResult>;
}

export interface HookResult {
	allow: boolean;
	message?: string;
}

/**
 * Manages hooks that run at key points in the agent lifecycle.
 * Hooks can intercept, modify, or block agent operations.
 */
export class HooksManager {
	private readonly hooks: Map<HookEvent, HookDefinition[]> = new Map();

	register(hook: HookDefinition): void {
		const existing = this.hooks.get(hook.event) ?? [];
		existing.push(hook);
		this.hooks.set(hook.event, existing);
	}

	unregister(hookName: string): void {
		for (const [event, hooks] of this.hooks) {
			this.hooks.set(event, hooks.filter(h => h.name !== hookName));
		}
	}

	async trigger(event: HookEvent, context: Record<string, unknown>): Promise<HookResult> {
		const hooks = this.hooks.get(event) ?? [];
		for (const hook of hooks) {
			const result = await hook.handler(context);
			if (!result.allow) {
				return result;
			}
		}
		return { allow: true };
	}
}
