/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IRemoteSessionService, parseCreateRemoteSessionOptions } from '../common/remoteSessions.js';

const remoteSessionToolsWhen = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true));

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
			modelDescription: 'List known remote agent hosts, connection status, remote-delegation support, execution-platform resources, running sessions, available agents/models, and known workspaces. Use this to inspect remote capacity or obtain an exact host ID or workspace URI. Only connected hosts with published capabilities are usable. Null delegation support or missing resource fields mean unknown, not unsupported or zero. A connected host explicitly reporting false delegation support needs updating. create_remote_session performs discovery and selection itself; this call is not a prerequisite. This tool does not connect hosts or change any session.',
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
			content: [{ kind: 'text', value: JSON.stringify({ hosts }, undefined, 2) }],
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
			modelDescription: 'Create a session and start a prompt on a connected remote agent host. Use this for work that should run remotely, optionally requiring a particular execution platform or minimum hardware capacity; use create_session for work on the current host. Selects a matching host with the fewest running sessions and pending creations, without pickers. Omitted workspace creates a workspace-less session, independent of the origin; omitted model uses the target default. A supplied workspace must already exist and be trusted on the target; worktree isolation creates a new branch from the specified target branch or the target default. No repository is cloned, no source files are copied, and no branch or worktree is inherited from the origin. Include an explicit request to send results or blockers back using send_remote_message with session "origin" in the task prompt, unless instructed otherwise. The child\'s normal final answer is not forwarded. Replies arrive as new turns or queue behind active work while the coordinating Agents window remains connected. Returns once the initial prompt is accepted, not when work finishes. Creation follows normal tool approval. After dispatch, continue independent work or end your turn to wait for incoming replies. Do not retry an uncertain creation. Do not sleep or poll for completion.',
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
					prompt: { type: 'string', minLength: 1, description: 'Task to start on the selected remote host. Include what results to send back using send_remote_message with session "origin", unless no report is wanted.' },
					title: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional title for the remote session.' },
					hostId: { type: 'string', description: 'Optional exact ID from list_agent_hosts. Omit to select automatically.' },
					model: {
						type: 'object',
						additionalProperties: false,
						required: ['provider', 'id'],
						description: 'Optional exact agent provider and model ID from list_agent_hosts. No silent substitution; omit to use the selected host default.',
						properties: {
							provider: { type: 'string', description: 'Agent provider, for example copilot, claude, or codex.' },
							id: { type: 'string', description: 'Provider-native model ID advertised by the host.' },
						},
					},
					requirements: {
						type: 'object',
						additionalProperties: false,
						properties: {
							platform: { type: 'string', enum: ['windows', 'linux', 'macos'], description: 'Execution environment OS; WSL and Linux containers count as linux.' },
							minMemoryGiB: { type: 'number', exclusiveMinimum: 0, description: 'Minimum memory capacity in GiB, not instantaneous free memory.' },
							minCpuCount: { type: 'integer', minimum: 1, description: 'Minimum logical CPUs available to the execution environment.' },
						},
					},
					workspace: {
						type: 'object',
						additionalProperties: false,
						required: ['uri'],
						description: 'Optional existing target workspace. Omit for a workspace-less session; no source workspace is required.',
						properties: {
							uri: { type: 'string', description: 'An exact remote workspace URI from list_agent_hosts (pins its host), or a file URI of a directory that exists on the target. Do not guess paths.' },
							isolation: { type: 'string', enum: ['folder', 'worktree'], default: 'worktree', description: 'Defaults to a fresh Git worktree. folder edits the supplied directory directly.' },
							branch: { type: 'string', description: 'Target-local Git base branch for the new worktree. Requires worktree isolation; omitted uses the target default.' },
						},
					},
				},
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const options = parseCreateRemoteSessionOptions(context.parameters);
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
			throw new Error('create_remote_session requires an originating session.');
		}
		const created = await this.remoteSessionsService.createSession(options, source, invocation.callId, token);
		return {
			content: [{ kind: 'text', value: JSON.stringify(created, undefined, 2) }],
			toolResultMessage: new MarkdownString().appendLink(created.openLink, localize('remoteSessions.create.result', "Created remote session on {0}", created.host.label)),
		};
	}
}
