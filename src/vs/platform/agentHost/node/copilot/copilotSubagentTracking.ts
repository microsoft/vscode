/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IAgentTelemetryContext } from '../../common/agent.js';

interface ISubagentState {
	rootTurnId: string | undefined;
	accountContext: IAgentTelemetryContext | undefined;
	accountContextCaptured: boolean;
	initialPrompt?: string;
}

interface ISubagentStart {
	readonly toolCallId: string;
	readonly agentId: string | undefined;
	readonly displayName: string;
	readonly taskPrompt?: string;
	/** A real spawning subagent, not a presentation-only Fusion phase. */
	readonly parentToolCallId: string | undefined;
	readonly rootTurn: { readonly id: string; readonly telemetryContext: IAgentTelemetryContext | undefined } | undefined;
}

/** Owns session-lifetime subagent identity and attribution, separately from active-turn accounting. */
export class CopilotSubagentTracking extends Disposable {
	private readonly _children = new Map<string, ISubagentState>();
	private readonly _toolCallsByAgent = new Map<string, string>();
	private readonly _displayNames = new Map<string, string>();
	private readonly _activeAgents = new Set<string>();

	get hasActiveAgents(): boolean {
		return this._activeAgents.size > 0;
	}

	get activeAgentIds(): Iterable<string> {
		return this._activeAgents.values();
	}

	start({ toolCallId, agentId, displayName, taskPrompt, parentToolCallId, rootTurn }: ISubagentStart): void {
		const child = this._getOrCreateChild(toolCallId);
		if (!child.accountContextCaptured) {
			// An unavailable initial context must not be replaced by a later root's account.
			child.accountContext = parentToolCallId ? this.getAccountContext(parentToolCallId) : rootTurn?.telemetryContext;
			child.accountContextCaptured = true;
			child.initialPrompt = taskPrompt;
		}
		if (agentId) {
			this._toolCallsByAgent.set(agentId, toolCallId);
			this._displayNames.set(agentId, displayName);
			this._activeAgents.add(agentId);
		}
		if (rootTurn) {
			child.rootTurnId = rootTurn.id;
		}
	}

	takeInitialPrompt(agentId: string): string | undefined {
		const toolCallId = this.getToolCallId(agentId);
		const child = toolCallId === undefined ? undefined : this._children.get(toolCallId);
		const prompt = child?.initialPrompt;
		if (child) {
			child.initialPrompt = undefined;
		}
		return prompt;
	}

	/** Reactivates a known child without changing its original account context. */
	resume(agentId: string, rootTurnId: string | undefined): string | undefined {
		const toolCallId = this.getToolCallId(agentId);
		if (toolCallId === undefined || this.isActive(agentId)) {
			return undefined;
		}
		if (rootTurnId !== undefined) {
			this._getOrCreateChild(toolCallId).rootTurnId = rootTurnId;
		}
		this._activeAgents.add(agentId);
		return toolCallId;
	}

	deactivate(agentId: string): boolean {
		return this._activeAgents.delete(agentId);
	}

	/** Ends root usage ownership; identity and original account attribution survive child idle/resume. */
	endTurn(toolCallId: string): void {
		const child = this._children.get(toolCallId);
		if (child) {
			if (child.accountContextCaptured) {
				child.rootTurnId = undefined;
			} else {
				this._children.delete(toolCallId);
			}
		}
	}

	/** Usage can reveal root ownership before the SDK announces the child. */
	observeRootTurn(toolCallId: string, rootTurnId: string): void {
		const child = this._getOrCreateChild(toolCallId);
		child.rootTurnId ??= rootTurnId;
	}

	isActive(agentId: string): boolean {
		return this._activeAgents.has(agentId);
	}

	hasRootTurn(toolCallId: string): boolean {
		return this._children.get(toolCallId)?.rootTurnId !== undefined;
	}

	belongsToRootTurn(toolCallId: string, rootTurnId: string): boolean {
		return this._children.get(toolCallId)?.rootTurnId === rootTurnId;
	}

	getAccountContext(toolCallId: string): IAgentTelemetryContext | undefined {
		return this._children.get(toolCallId)?.accountContext;
	}

	getToolCallId(agentId: string): string | undefined {
		return this._toolCallsByAgent.get(agentId);
	}

	getAgentId(toolCallId: string): string | undefined {
		for (const [agentId, candidate] of this._toolCallsByAgent) {
			if (candidate === toolCallId) {
				return agentId;
			}
		}
		return undefined;
	}

	getDisplayName(agentId: string): string | undefined {
		return this._displayNames.get(agentId);
	}

	/** Discovery and history fill missing labels without overriding a live start's label. */
	seedDisplayName(agentId: string, displayName: string): void {
		if (!this._displayNames.get(agentId)?.trim()) {
			this._displayNames.set(agentId, displayName);
		}
	}

	private _getOrCreateChild(toolCallId: string): ISubagentState {
		let child = this._children.get(toolCallId);
		if (!child) {
			child = { rootTurnId: undefined, accountContext: undefined, accountContextCaptured: false };
			this._children.set(toolCallId, child);
		}
		return child;
	}

	override dispose(): void {
		this._children.clear();
		this._toolCallsByAgent.clear();
		this._displayNames.clear();
		this._activeAgents.clear();
		super.dispose();
	}
}
