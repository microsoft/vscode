// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import type {
	ACPClient,
	Session,
	SessionConfig,
	SessionEvent,
	AgentDescriptor,
	AgentCapability,
} from './types';

/**
 * Integration point between the meta-orchestrator and the ACP client.
 *
 * The dispatcher bridges the task assignment model (instruction 15) with
 * the ACP session model, providing two integration paths:
 * - ACP: for standalone agents (Gemini CLI, Codex CLI, custom agents)
 * - VS Code native: for deeply integrated agents (Copilot, Claude via Copilot)
 */

export interface TaskAssignment {
	/** Unique task identifier from the orchestrator. */
	taskId: string;
	/** Which protocol to use for dispatch. */
	protocol: 'acp' | 'vscode-native';
	/** Target agent ID (for ACP) or extension ID (for VS Code native). */
	agentId: string;
	/** The task description for the agent. */
	task: string;
	/** Context to provide. */
	context?: SessionConfig['context'];
	/** MCP servers to make available. */
	mcpServers?: string[];
	/** Maximum tokens for the session. */
	maxTokens?: number;
	/** Timeout in milliseconds. */
	timeout?: number;
}

export interface TaskResult {
	taskId: string;
	sessionId: string;
	status: 'completed' | 'failed' | 'terminated';
	events: SessionEvent[];
}

/**
 * Dispatches tasks to ACP agents and collects results.
 *
 * Usage from the meta-orchestrator:
 * ```typescript
 * const dispatcher = new ACPDispatcher(acpClient);
 * const result = await dispatcher.dispatchTask(assignment);
 * ```
 */
export class ACPDispatcher {
	constructor(private readonly acpClient: ACPClient) {}

	/** Dispatch a task to an ACP agent and wait for completion. */
	async dispatchTask(assignment: TaskAssignment): Promise<TaskResult> {
		if (assignment.protocol !== 'acp') {
			throw new Error(`ACPDispatcher only handles ACP protocol, got: ${assignment.protocol}`);
		}

		const session = await this.acpClient.createSession(assignment.agentId, {
			task: assignment.task,
			context: assignment.context,
			tools: assignment.mcpServers,
			maxTokens: assignment.maxTokens,
			timeout: assignment.timeout,
		});

		return this.waitForCompletion(assignment.taskId, session);
	}

	/** Find the best available agent for a set of required capabilities. */
	async findAgent(
		requiredCapabilities: AgentCapability[],
		preferredCostTier?: string,
	): Promise<AgentDescriptor | undefined> {
		const agents = await this.acpClient.listAgents();

		// Filter agents that have all required capabilities
		const candidates = agents.filter(agent =>
			requiredCapabilities.every(cap => agent.capabilities.includes(cap))
		);

		if (candidates.length === 0) {
			return undefined;
		}

		// Prefer the requested cost tier
		if (preferredCostTier) {
			const preferred = candidates.find(a => a.costTier === preferredCostTier);
			if (preferred) {
				return preferred;
			}
		}

		// Default: prefer local > free > subscription > pay-per-use
		const tierOrder: Record<string, number> = {
			local: 0,
			free: 1,
			subscription: 2,
			'pay-per-use': 3,
		};

		candidates.sort((a, b) =>
			(tierOrder[a.costTier] ?? 99) - (tierOrder[b.costTier] ?? 99)
		);

		return candidates[0];
	}

	private waitForCompletion(taskId: string, session: Session): Promise<TaskResult> {
		return new Promise<TaskResult>((resolve) => {
			const events: SessionEvent[] = [];

			const handler = (event: SessionEvent) => {
				events.push(event);

				if (event.type === 'complete' || event.type === 'error') {
					this.acpClient.offSessionEvent(session.id, handler);
					resolve({
						taskId,
						sessionId: session.id,
						status: event.type === 'complete' ? 'completed' : 'failed',
						events,
					});
				}
			};

			this.acpClient.onSessionEvent(session.id, handler);
		});
	}
}
