/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IAgentHostActiveClientService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { toolDataToDefinition } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolUtils.js';
import { ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IDashboardStartWork, IDashboardWorkService } from '../common/dashboardWork.js';
import { DashboardWorkService } from './dashboardWorkService.js';

const toolNames = ['dashboard_discover_work', 'dashboard_start_work', 'dashboard_read_work', 'dashboard_clone_repository'] as const;
type DashboardToolName = typeof toolNames[number];

export const dashboardWorkToolData: readonly IToolData[] = [
	{
		id: toolNames[0], toolReferenceName: toolNames[0], source: ToolDataSource.Internal, when: ContextKeyExpr.false(), requiresSessionContext: true,
		displayName: localize('dashboardTool.discover', "Discover Workspaces and Execution Targets"),
		modelDescription: 'Discover verified known checkouts and eligible execution targets for this dashboard task. Use before choosing where to work or delegate; this does not choose a target, clone, provision, or start work. Supply an exact GitHub repository/issue/PR URL when known; otherwise inspect known local workspaces and ask a native question if the task is ambiguous. Results include opaque target IDs, a revision, capabilities, and uncertainty. Re-discover after a stale-target error.',
		inputSchema: { type: 'object', properties: { repository: { type: 'string', description: 'Optional exact HTTPS github.com repository, issue, or pull request URL.' } }, additionalProperties: false },
	},
	{
		id: toolNames[1], toolReferenceName: toolNames[1], source: ToolDataSource.Internal, when: ContextKeyExpr.false(), requiresSessionContext: true, canRequestPreApproval: true,
		displayName: localize('dashboardTool.start', "Start Background Work"),
		modelDescription: 'Start a separate execution session on a target returned by dashboard_discover_work. Use for work that should run in parallel or on a different environment; use the existing set_workspace flow to attach a workspace to this conversation instead. This creates a session and sends its initial prompt, and may create a worktree or start paid cloud execution. Only the supplied prompt is transferred, not parent history, local attachments, credentials, or permission grants. Isolation defaults to an isolated worktree where supported. Use a stable operationId for retries; never replace an uncertain operation with a new ID. Respect runtime confirmation and inspect the result using dashboard_read_work.',
		inputSchema: {
			type: 'object', properties: {
				operationId: { type: 'string', description: 'Stable identifier for this intended execution.' },
				targetId: { type: 'string', description: 'Opaque target ID from the latest discovery.' },
				revision: { type: 'integer', minimum: 1 },
				title: { type: 'string', maxLength: 200 },
				prompt: { type: 'string', description: 'Complete task and explicitly shareable context for the target.' },
				isolation: { type: 'string', enum: ['folder', 'worktree'] },
			}, required: ['operationId', 'targetId', 'revision', 'title', 'prompt'], additionalProperties: false
		},
	},
	{
		id: toolNames[2], toolReferenceName: toolNames[2], source: ToolDataSource.Internal, when: ContextKeyExpr.false(), requiresSessionContext: true,
		displayName: localize('dashboardTool.read', "Read Background Work"),
		modelDescription: 'Read the status and recent output of an execution created by this dashboard conversation. Use its operationId; unrelated sessions cannot be read with this tool. Set wait to true to wait for running work to finish or need input instead of repeatedly polling. Output is bounded and reports truncation or unavailability. Do not infer successful work from session creation or a completed intake response. Waiting can be cancelled and requires this client to remain connected.',
		inputSchema: { type: 'object', properties: { operationId: { type: 'string' }, wait: { type: 'boolean', default: false } }, required: ['operationId'], additionalProperties: false },
	},
	{
		id: toolNames[3], toolReferenceName: toolNames[3], source: ToolDataSource.Internal, when: ContextKeyExpr.false(), requiresSessionContext: true, canRequestPreApproval: true,
		displayName: localize('dashboardTool.clone', "Clone a Repository for Work"),
		modelDescription: 'Clone an exact GitHub repository into a known local parent directory when no suitable checkout is available. Do not guess a directory from the repository name; ask a native question if the destination is unknown. This writes a checkout using the existing Git provider without opening another workspace window, then returns fresh workspace/target discovery. Use a stable operationId; do not retry an uncertain clone with a new ID. Respect runtime approval and any Git authentication request.',
		inputSchema: {
			type: 'object', properties: {
				operationId: { type: 'string' }, repository: { type: 'string', description: 'Exact HTTPS github.com repository URL.' },
				destinationParent: { type: 'string', description: 'Existing absolute local parent directory confirmed for this work.' },
			}, required: ['operationId', 'repository', 'destinationParent'], additionalProperties: false
		},
	},
];

function requiredString(value: unknown, name: string): string {
	if (typeof value !== 'string' || !value.trim()) { throw new Error(`Missing or invalid ${name}`); }
	return value;
}

function startOptions(parameters: Record<string, unknown>): IDashboardStartWork {
	const revision = parameters.revision;
	if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) { throw new Error('Invalid target revision'); }
	const isolation = parameters.isolation;
	if (isolation !== undefined && isolation !== 'folder' && isolation !== 'worktree') { throw new Error('Invalid isolation choice'); }
	const title = requiredString(parameters.title, 'title');
	if (title.length > 200) { throw new Error('Work title is too long'); }
	return { operationId: requiredString(parameters.operationId, 'operationId'), targetId: requiredString(parameters.targetId, 'targetId'), revision, title, prompt: requiredString(parameters.prompt, 'prompt'), isolation };
}

export class DashboardWorkTool implements IToolImpl {
	constructor(
		private readonly name: DashboardToolName,
		@IDashboardWorkService private readonly work: IDashboardWorkService,
	) { }

	private source(resource: URI | undefined) {
		const session = resource && this.work.getSessionForChat(resource);
		if (!session) { throw new Error(localize('dashboardTool.scope', "This tool is only available to its dashboard-created conversation.")); }
		return session;
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext): Promise<IPreparedToolInvocation> {
		const session = this.source(context.originSessionResource ?? context.chatSessionResource);
		if (this.name === 'dashboard_start_work') {
			const options = startOptions(context.parameters);
			const target = this.work.resolveTarget(session, options.targetId, options.revision);
			return {
				invocationMessage: localize('dashboardTool.starting', "Starting {0}", options.title),
				confirmationMessages: {
					title: localize('dashboardTool.confirmStart', "Start background work on {0}?", target.label),
					message: localize('dashboardTool.startDetails', "Target: {0}\nIsolation: {1}\nTask: {2}\n\nThis starts a separate session. Only this task text is transferred; cloud execution may incur costs.", target.folder.toString(), options.isolation ?? (target.supportsWorktree ? 'worktree' : 'folder'), options.prompt),
					allowAutoConfirm: true,
				},
			};
		}
		if (this.name === 'dashboard_clone_repository') {
			return {
				invocationMessage: localize('dashboardTool.cloning', "Cloning a repository"),
				confirmationMessages: {
					title: localize('dashboardTool.confirmClone', "Clone this repository locally?"),
					message: localize('dashboardTool.cloneDetails', "Repository: {0}\nParent directory: {1}", requiredString(context.parameters.repository, 'repository'), requiredString(context.parameters.destinationParent, 'destinationParent')),
					allowAutoConfirm: true,
				},
			};
		}
		return { invocationMessage: this.name === 'dashboard_read_work' ? localize('dashboardTool.reading', "Reading background work") : localize('dashboardTool.discovering', "Discovering workspaces and execution targets") };
	}

	async invoke(invocation: IToolInvocation, _countTokens: Parameters<IToolImpl['invoke']>[1], _progress: Parameters<IToolImpl['invoke']>[2], token: CancellationToken): Promise<IToolResult> {
		const session = this.source(invocation.originSessionResource ?? invocation.context?.sessionResource);
		const input = invocation.parameters;
		let result: object;
		if (this.name === 'dashboard_discover_work') {
			if (input.repository !== undefined && typeof input.repository !== 'string') { throw new Error('Invalid repository'); }
			const discovery = await this.work.discover(session, input.repository, token);
			result = {
				revision: discovery.revision, candidates: discovery.candidates.map(candidate => ({ ...candidate, folder: candidate.folder.fsPath })),
				targets: discovery.targets.map(target => ({ ...target, folder: target.folder.toString() }))
			};
		} else if (this.name === 'dashboard_start_work') {
			const execution = await this.work.startWork(session, startOptions(input), token);
			return {
				content: [{ kind: 'text', value: JSON.stringify({ ...execution, source: execution.source.toString(), sessionResource: execution.sessionResource?.toString() }) }],
				...(execution.phase === 'failed' || execution.phase === 'unknown' ? { toolResultError: execution.error ?? execution.phase } : {}),
			};
		} else if (this.name === 'dashboard_clone_repository') {
			const parent = requiredString(input.destinationParent, 'destinationParent');
			if (!parent.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(parent)) { throw new Error('The clone parent must be an absolute local directory'); }
			const discovery = await this.work.cloneRepository(session, requiredString(input.operationId, 'operationId'), requiredString(input.repository, 'repository'), URI.file(parent), token);
			result = {
				revision: discovery.revision, candidates: discovery.candidates.map(candidate => ({ ...candidate, folder: candidate.folder.fsPath })),
				targets: discovery.targets.map(target => ({ ...target, folder: target.folder.toString() }))
			};
		} else {
			if (input.wait !== undefined && typeof input.wait !== 'boolean') { throw new Error('Invalid wait option'); }
			const status = await this.work.readWork(session, requiredString(input.operationId, 'operationId'), token, input.wait);
			result = { ...status, execution: { ...status.execution, source: status.execution.source.toString(), sessionResource: status.execution.sessionResource?.toString() } };
		}
		return { content: [{ kind: 'text', value: JSON.stringify(result) }] };
	}
}

class DashboardWorkToolsContribution extends Disposable {
	static readonly ID = 'sessions.dashboardWorkTools';

	constructor(
		@IDashboardWorkService work: IDashboardWorkService,
		@ILanguageModelToolsService tools: ILanguageModelToolsService,
		@IAgentHostActiveClientService activeClient: IAgentHostActiveClientService,
		@IChatEntitlementService entitlement: IChatEntitlementService,
		@IInstantiationService instantiation: IInstantiationService,
	) {
		super();
		for (const [index, data] of dashboardWorkToolData.entries()) {
			this._register(tools.registerTool(data, instantiation.createInstance(DashboardWorkTool, toolNames[index])));
		}
		const registrations = this._register(new DisposableMap<string, IDisposable>());
		const sentiment = observableSignalFromEvent(this, entitlement.onDidChangeSentiment);
		this._register(autorun(reader => {
			sentiment.read(reader);
			const resources = entitlement.sentiment.hidden || entitlement.sentiment.disabled || entitlement.sentiment.disabledInWorkspace
				? [] : work.sessions.read(reader).map(session => session.mainChat.read(reader).resource);
			const ids = new Set(resources.map(resource => resource.toString()));
			for (const id of registrations.keys()) { if (!ids.has(id)) { registrations.deleteAndDispose(id); } }
			for (const resource of resources) {
				if (!registrations.has(resource.toString())) {
					registrations.set(resource.toString(), activeClient.registerSessionTools(resource, dashboardWorkToolData.map(toolDataToDefinition)));
				}
			}
		}));
	}
}

registerSingleton(IDashboardWorkService, DashboardWorkService, InstantiationType.Delayed);
registerWorkbenchContribution2(DashboardWorkToolsContribution.ID, DashboardWorkToolsContribution, WorkbenchPhase.BlockRestore);
