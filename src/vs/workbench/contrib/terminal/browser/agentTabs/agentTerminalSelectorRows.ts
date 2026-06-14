/*---------------------------------------------------------------------------------------------
 *  Copyright (c) stokd. Thin-patch fork — agent-aware terminal selector (AX-TERMINAL-AGENT-TABS).
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure, DOM-free, dependency-free row-building logic for the agent-aware terminal
 * selector. It has ZERO imports so it can be unit-tested in isolation without a
 * full VS Code build (`node --test`). The stateful model
 * ({@link AgentTerminalSelectorModel}) wires upstream events to this function;
 * all the merge/de-dupe/sectioning behavior lives here where it is testable.
 */

export type SelectorSection = 'Terminals' | 'Agents';

/** The minimal shape this module needs from an `ITerminalInstance`. */
export interface ISelectorInstanceRef {
	readonly instanceId: number;
}

export type AgentRunState = 'idle' | 'running' | 'awaiting-approval' | 'background';

export interface IAgentRowMeta {
	readonly sessionTitle: string;
	readonly runState: AgentRunState;
	readonly pendingApprovals: number;
	readonly isBackground: boolean;
}

export type SelectorRow<TInstance extends ISelectorInstanceRef = ISelectorInstanceRef> =
	| { readonly kind: 'group-header'; readonly section: SelectorSection; readonly count: number; readonly collapsed: boolean }
	| { readonly kind: 'terminal'; readonly instance: TInstance }
	| { readonly kind: 'agent'; readonly instance: TInstance; readonly meta: IAgentRowMeta };

export interface IAgentEntry<TInstance extends ISelectorInstanceRef> {
	readonly instance: TInstance;
	readonly meta: IAgentRowMeta;
}

export interface IMergeInput<TInstance extends ISelectorInstanceRef> {
	/** Human terminals — `ITerminalGroupService.instances`. */
	readonly terminals: readonly TInstance[];
	/** Agent (chat tool-session) terminals — from `ITerminalChatService`. */
	readonly agents: readonly IAgentEntry<TInstance>[];
	/** Per-section collapse state (headers always render; children hide when collapsed). */
	readonly collapsed?: { readonly terminals?: boolean; readonly agents?: boolean };
}

/**
 * Merge human terminals and agent terminals into a single, sectioned, de-duplicated
 * row list. Rules:
 *  - De-duplicate by `instanceId`.
 *  - An instance that is *both* a terminal and an agent is shown once, in the Agents
 *    section (agent identity wins — it carries more information).
 *  - Sections render in fixed order (Terminals, then Agents) and only when non-empty.
 *  - A collapsed section keeps its header (with the full count) but omits its rows.
 */
export function mergeSelectorRows<TInstance extends ISelectorInstanceRef>(
	input: IMergeInput<TInstance>
): SelectorRow<TInstance>[] {
	const agentIds = new Set<number>(input.agents.map(a => a.instance.instanceId));
	const seen = new Set<number>();
	const rows: SelectorRow<TInstance>[] = [];

	// Agents first claim their ids so a terminal that is also an agent is not double-counted.
	const agents: IAgentEntry<TInstance>[] = [];
	for (const a of input.agents) {
		if (seen.has(a.instance.instanceId)) {
			continue;
		}
		seen.add(a.instance.instanceId);
		agents.push(a);
	}

	const terminals: TInstance[] = [];
	for (const t of input.terminals) {
		if (agentIds.has(t.instanceId) || seen.has(t.instanceId)) {
			continue;
		}
		seen.add(t.instanceId);
		terminals.push(t);
	}

	if (terminals.length > 0) {
		const collapsed = input.collapsed?.terminals ?? false;
		rows.push({ kind: 'group-header', section: 'Terminals', count: terminals.length, collapsed });
		if (!collapsed) {
			for (const instance of terminals) {
				rows.push({ kind: 'terminal', instance });
			}
		}
	}

	if (agents.length > 0) {
		const collapsed = input.collapsed?.agents ?? false;
		rows.push({ kind: 'group-header', section: 'Agents', count: agents.length, collapsed });
		if (!collapsed) {
			for (const entry of agents) {
				rows.push({ kind: 'agent', instance: entry.instance, meta: entry.meta });
			}
		}
	}

	return rows;
}
