/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IRemoteSessionService, parseCreateRemoteSessionOptions, remoteSessionToolsWhen } from '../common/remoteSessions.js';
import { assertRemoteSessionCaller } from './remoteSessionSource.js';

export class ListAgentHostsTool implements IToolImpl {
	constructor(
		@IRemoteSessionService private readonly remoteSessionsService: IRemoteSessionService,
	) { }

	getToolData(): IToolData {
		return {
			id: 'vscode_list_agent_hosts',
			toolReferenceName: 'list_agent_hosts',
			displayName: localize('remoteSessions.list.displayName', "List Agent Hosts"),
			userDescription: localize('remoteSessions.list.description', "List connected remote agent hosts and their resources"),
			modelDescription: 'List remote agent hosts, status, resources, load, agents/models, and workspaces to inspect capacity or get exact IDs. Only connected hosts with delegation support are usable; null support or missing resources mean unknown, not unsupported or zero. create_remote_session selects a host itself. This tool changes nothing.',
			source: ToolDataSource.Internal,
			icon: Codicon.remote,
			when: remoteSessionToolsWhen,
			runsInWorkspace: false,
			canBeReferencedInPrompt: false,
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		};
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('remoteSessions.list.invocation', "Reading remote agent hosts"),
			pastTenseMessage: localize('remoteSessions.list.past', "Read remote agent hosts"),
		};
	}

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const hosts = this.remoteSessionsService.listHosts();
		return {
			content: [{ kind: 'text', value: JSON.stringify({ hosts }) }],
			toolResultMessage: localize('remoteSessions.list.result', "Listed {0} remote agent hosts", hosts.length),
		};
	}
}

export class CreateRemoteSessionTool implements IToolImpl {
	constructor(
		@IRemoteSessionService private readonly remoteSessionsService: IRemoteSessionService,
	) { }

	getToolData(): IToolData {
		return {
			id: 'vscode_create_remote_session',
			toolReferenceName: 'create_remote_session',
			displayName: localize('remoteSessions.create.displayName', "Create Remote Session"),
			userDescription: localize('remoteSessions.create.description', "Delegate work to a matching remote agent host"),
			modelDescription: 'Start a task on a connected remote agent host; use create_session for same-host work. Requires an Agent Host originating chat. Selects the matching host with the fewest running sessions and pending creations. Omitted workspace creates a workspace-less session; omitted model uses the target default. Workspaces must already exist and be trusted on the target; nothing is cloned, copied, or inherited from the origin. Ask for results or blockers via send_remote_message with session "origin"; final answers are not forwarded. Returns on prompt acceptance, not completion; replies arrive as new turns. Keep the coordinating Agents window connected. Normal approval applies. Continue independent work or end your turn; do not sleep or poll for replies. Do not retry an uncertain creation.',
			source: ToolDataSource.Internal,
			icon: Codicon.remote,
			when: remoteSessionToolsWhen,
			runsInWorkspace: false,
			canRequestPreApproval: true,
			canBeReferencedInPrompt: false,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				required: ['prompt'],
				properties: {
					prompt: { type: 'string', minLength: 1 },
					title: { type: 'string', minLength: 1, maxLength: 200 },
					hostId: { type: 'string', description: 'Exact ID from list_agent_hosts; omit for automatic placement.' },
					model: {
						type: 'object',
						additionalProperties: false,
						required: ['provider', 'id'],
						description: 'Exact provider/model pair from list_agent_hosts; no substitution.',
						properties: {
							provider: { type: 'string', description: 'Host-advertised agent provider.' },
							id: { type: 'string', description: 'Provider-native model ID.' },
						},
					},
					requirements: {
						type: 'object',
						additionalProperties: false,
						properties: {
							platform: { type: 'string', enum: ['windows', 'linux', 'macos'], description: 'Execution OS (WSL/Linux containers: linux).' },
							minMemoryGiB: { type: 'number', exclusiveMinimum: 0, description: 'Minimum capacity in GiB, not free memory.' },
							minCpuCount: { type: 'integer', minimum: 1, description: 'Minimum logical CPUs.' },
						},
					},
					workspace: {
						type: 'object',
						additionalProperties: false,
						required: ['uri'],
						properties: {
							uri: { type: 'string', description: 'Exact workspace URI from list_agent_hosts (pins its host), or an existing target directory\'s file URI. Do not guess paths.' },
							isolation: { type: 'string', enum: ['folder', 'worktree'], default: 'worktree', description: 'worktree creates a fresh Git worktree; folder edits the directory directly.' },
							branch: { type: 'string', description: 'Target-local base branch; worktree only. Omit for the target default.' },
						},
					},
				},
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const options = parseCreateRemoteSessionOptions(context.parameters);
		if (!context.chatSessionResource) {
			throw new Error(localize('remoteSessions.create.missingContext', "Remote session creation requires an originating session."));
		}
		assertRemoteSessionCaller(context.chatSessionResource);
		const message = new MarkdownString().appendText(localize(
			'remoteSessions.create.confirmation',
			"Start this task on {0}? The host is selected from your connected remote agent hosts using the requested resources and current workload. The new session can send messages back to this chat.",
			options.hostId ?? localize('remoteSessions.create.automaticHost', "a matching remote host"),
		));
		message.appendText(`\n\n${options.prompt}`);
		message.appendText(`\n\n${options.workspace
			? localize('remoteSessions.create.workspace', "Workspace: {0} ({1})", options.workspace.uri.toString(), options.workspace.isolation)
			: localize('remoteSessions.create.noWorkspace', "No workspace or files are inherited from this session.")}`);
		if (options.model) {
			message.appendText(`\n\n${localize('remoteSessions.create.model', "Model: {0}/{1}", options.model.provider, options.model.id)}`);
		}
		if (options.workspace?.branch) {
			message.appendText(`\n\n${localize('remoteSessions.create.baseBranch', "Worktree base branch: {0}", options.workspace.branch)}`);
		}
		if (Object.values(options.requirements).some(value => value !== undefined)) {
			message.appendText(`\n\n${localize('remoteSessions.create.requirements', "Requirements: {0}", JSON.stringify(options.requirements))}`);
		}
		return {
			invocationMessage: localize('remoteSessions.create.invocation', "Creating remote session"),
			pastTenseMessage: localize('remoteSessions.create.past', "Created remote session"),
			confirmationMessages: {
				title: localize('remoteSessions.create.confirmationTitle', "Create Remote Session?"),
				message,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const options = parseCreateRemoteSessionOptions(invocation.parameters);
		const source = invocation.context?.sessionResource;
		if (!source) {
			throw new Error(localize('remoteSessions.create.missingContext', "Remote session creation requires an originating session."));
		}
		assertRemoteSessionCaller(source);
		const created = await this.remoteSessionsService.createSession(options, source, invocation.callId, token);
		return {
			content: [{ kind: 'text', value: JSON.stringify(created) }],
			toolResultMessage: new MarkdownString().appendLink(created.openLink, localize('remoteSessions.create.result', "Created remote session on {0}", created.host.label)),
		};
	}
}
