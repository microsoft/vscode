/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../nls.js';
import { CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../languageModelToolsService.js';
import { appendBackgroundAgentRoster, IBackgroundAgentContext, IBackgroundAgentRegistryAccess } from './backgroundAgentRegistry.js';

export interface IReadAgentToolParams {
	agent_id?: string;
	mode?: 'status' | 'wait' | 'list';
	timeout?: number;
	cancel?: boolean;
	wait?: boolean;
}

export const ReadAgentToolData: IToolData = {
	id: 'read_agent',
	toolReferenceName: 'read_agent',
	displayName: localize('readAgent.displayName', "Read Agent"),
	userDescription: localize('readAgent.userDescription', "Check background agents, retrieve their results, or explicitly wait for completion."),
	modelDescription: 'Read the status or result of a subagent started by runSubagent, cancel a live owned agent, or explicitly synchronize with it. mode status is the default and returns immediately. Omit agent_id or use mode list to recover this session roster without consuming results. Terminal status/wait retrieval claims the full result exactly once, including after reload; list is nonconsuming. Completion only updates the worker card and noninterrupting mailbox, never steering the parent. Use mode wait only when no independent work remains and the result is required before finalization; it waits until completion, timeout, or caller cancellation. Timeout leaves the agent running. Legacy wait is ignored. Cancellation requires agent_id and a live agent owned by this runtime.',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			agent_id: { type: 'string', description: 'The agent_id returned by runSubagent.' },
			mode: { type: 'string', enum: ['status', 'wait', 'list'], default: 'status', description: 'status is immediate, list is nonconsuming, wait explicitly synchronizes.' },
			timeout: { type: 'number', minimum: 300, maximum: 3600, default: 1800, description: 'Seconds for explicit wait; ignored in status/list mode.' },
			cancel: { type: 'boolean', default: false, description: 'Request cancellation of a live owned agent before reading its status.' },
			wait: { type: 'boolean', default: false, description: 'Deprecated compatibility flag. Ignored; select mode wait explicitly.' },
		},
		required: [],
	},
};

export class ReadAgentTool implements IToolImpl {
	constructor(private readonly registry: IBackgroundAgentRegistryAccess) { }

	private async withRoster(context: IBackgroundAgentContext, result: IToolResult): Promise<IToolResult> {
		return appendBackgroundAgentRoster(this.registry, context, result);
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (!invocation.context) {
			throw new Error(localize('readAgent.noContext', "Invoke read_agent from a chat request with a session identity."));
		}
		const context = invocation.context;
		const params = invocation.parameters as IReadAgentToolParams;
		const mode = params.mode ?? 'status';
		if (!['status', 'wait', 'list'].includes(mode)) {
			throw new Error(localize('readAgent.invalidMode', "Unknown read_agent mode."));
		}
		if (!params.agent_id || mode === 'list') {
			if (params.cancel || mode === 'wait') {
				return this.withRoster(context, { content: [{ kind: 'text', value: localize('readAgent.idRequired', "An agent_id is required for cancellation or explicit wait.") }], toolResultError: true });
			}
			return this.withRoster(context, { content: [] });
		}
		let cancellationAccepted: boolean | undefined;
		if (params.cancel) {
			cancellationAccepted = await this.registry.cancel(context, params.agent_id);
		}
		const snapshot = mode === 'wait'
			? await this.registry.wait(context, params.agent_id, params.timeout ?? 1800, token)
			: await this.registry.get(context, params.agent_id);
		if (!snapshot || snapshot.consumed) {
			return this.withRoster(context, { content: [{ kind: 'text', value: localize('readAgent.notFound', "No unconsumed current-session agent found with agent_id: {0}.", params.agent_id) }] });
		}
		const status = {
			agent_id: snapshot.id, status: snapshot.status, mode, cancellationAccepted,
			...(mode === 'wait' && snapshot.status === 'running' ? { wait_cancelled: token.isCancellationRequested, wait_timeout: !token.isCancellationRequested } : {}),
			...(params.wait ? { legacy_wait_ignored: true } : {}),
		};
		if (snapshot.status === 'running') {
			return this.withRoster(context, { content: [{ kind: 'text', value: JSON.stringify(status) }], toolMetadata: status });
		}
		const result = await this.registry.claim(context, snapshot.id);
		if (!result) {
			return this.withRoster(context, { content: [{ kind: 'text', value: localize('readAgent.claimed', "This agent result was already retrieved or expired.") }] });
		}
		return this.withRoster(context, { ...result, content: [...result.content, { kind: 'text', value: JSON.stringify(status) }] });
	}
}