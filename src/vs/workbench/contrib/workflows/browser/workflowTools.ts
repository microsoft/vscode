/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { getWorkflowCheckpointTypeReference } from '../../../../platform/workflow/common/workflowValidation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ICustomizationHarnessService } from '../../chat/common/customizationHarnessService.js';
import { getChatSessionType } from '../../chat/common/model/chatUri.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../chat/common/tools/languageModelToolsService.js';
import { IWorkflowAuthoringService, WorkflowAuthoringDocument, WorkflowAuthoringScope } from '../common/workflowAuthoring.js';
import { WorkflowCheckpointEntry, WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { WorkflowContextKeys, WorkflowSettingId } from '../common/workflowConfiguration.js';
import { workflowSchema } from '../common/workflowSchemas.js';

const toolNames = ['listWorkflows', 'getWorkflow', 'listWorkflowCheckpoints', 'createWorkflow', 'updateWorkflow'] as const;
type WorkflowToolName = typeof toolNames[number];

const toolLabels: Record<WorkflowToolName, string> = {
	listWorkflows: localize('workflow.tool.list', "List Workflows"),
	getWorkflow: localize('workflow.tool.get', "Read Workflow"),
	listWorkflowCheckpoints: localize('workflow.tool.checkpoints', "List Workflow Checkpoints"),
	createWorkflow: localize('workflow.tool.create', "Create Workflow"),
	updateWorkflow: localize('workflow.tool.update', "Update Workflow"),
};

const descriptions: Record<WorkflowToolName, string> = {
	listWorkflows: 'List reusable workflow definitions available to this session, with stable keys, checkpoint summaries, sources, editability, and diagnostics. Use this to find a workflow to inspect, edit, or copy; this is not a list of running workflows. An incomplete catalog can have source diagnostics, so an empty list does not necessarily mean no workflows exist. Discovery never starts or changes a run.',
	getWorkflow: 'Read an existing workflow definition, its JSONC content, and an opaque revision for editing. Use a key returned by listWorkflows before editing or copying a workflow. This reads the reusable definition, not a running workflow snapshot. Pass the returned revision to updateWorkflow; read-only built-in or extension workflows must be copied with createWorkflow and a distinct id.',
	listWorkflowCheckpoints: 'List reusable checkpoint types available when authoring a workflow. Omit references for summaries; supply exact references returned by this tool to read their full instructions, input bindings, proof schemas, completion checks, and start conditions. Reuse those contracts rather than inventing check names. This does not report checkpoint progress in a running workflow, create approvals, or grant execution authority.',
	createWorkflow: 'Create a reusable workflow definition in the personal profile or this session\'s workspace. Use this when the user asks to create or save a workflow, not merely to perform a task or start a run. Read listWorkflowCheckpoints first and getWorkflow when copying an existing template; provide a distinct id and use exact checkpoint references or workflow-local contracts. Personal storage is the default. Creation validates the definition and saves a new file without overwriting another workflow. It never attaches, starts, or resumes a workflow or chooses a stopping point. Normal tool approval applies; do not retry a cancelled or denied creation unless asked.',
	updateWorkflow: 'Update an existing personal or workspace workflow definition for future runs. Use this when the user asks to edit that reusable workflow, not to change an active run or its stopping point. Call getWorkflow first and pass its key and revision with the complete replacement definition, preserving id and version. The edit is validated; stale revisions, unsaved editor changes, and read-only sources are rejected. Existing run snapshots and shared checkpoint contracts are not modified. Normal tool approval applies; after a conflict read the workflow again, and do not retry a cancelled or denied update unless asked.',
};

function toolSchema(name: WorkflowToolName): IJSONSchema {
	const properties: IJSONSchema['properties'] = {
		workspace: { type: 'string', description: 'Workspace folder URI. Only needed to disambiguate a multi-root window; must match this session\'s working directory or one of its workspace folders.' },
	};
	const required: string[] = [];
	if (name === 'getWorkflow' || name === 'updateWorkflow') {
		properties.key = { type: 'string', minLength: 1, description: 'Stable workflow key returned by listWorkflows or getWorkflow.' };
		required.push('key');
	}
	if (name === 'createWorkflow' || name === 'updateWorkflow') {
		properties.definition = { ...workflowSchema, $id: undefined, allowComments: undefined, allowTrailingCommas: undefined };
		required.push('definition');
	}
	if (name === 'createWorkflow') {
		properties.target = { type: 'string', enum: ['user', 'workspace'], default: 'user', description: 'Save to the personal profile (default) or the session workspace.' };
	}
	if (name === 'updateWorkflow') {
		properties.revision = { type: 'string', minLength: 1, description: 'Opaque revision returned by getWorkflow. Prevents replacing a definition that changed after it was read.' };
		required.push('revision');
	}
	if (name === 'listWorkflowCheckpoints') {
		properties.references = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 }, description: 'Exact checkpoint references to read in full. Omit to list summaries.' };
	}
	return { type: 'object', properties, required, additionalProperties: false };
}

export class WorkflowTool implements IToolImpl {
	constructor(
		readonly name: WorkflowToolName,
		@IWorkflowAuthoringService private readonly authoringService: IWorkflowAuthoringService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
	) { }

	getToolData(): IToolData {
		return {
			id: `vscode_${this.name}`,
			toolReferenceName: this.name,
			displayName: toolLabels[this.name],
			modelDescription: descriptions[this.name],
			source: ToolDataSource.Internal,
			icon: Codicon.listTree,
			canBeReferencedInPrompt: false,
			runsInWorkspace: false,
			canRequestPreApproval: this.isMutation(),
			when: ContextKeyExpr.and(ChatContextKeys.enabled, WorkflowContextKeys.enabled),
			inputSchema: toolSchema(this.name),
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation> {
		this.assertEnabled(token);
		if (!this.isMutation()) {
			return { invocationMessage: toolLabels[this.name] };
		}
		const input: Record<string, unknown> = context.parameters;
		const scope = this.scope(input, context.workingDirectory, context.chatSessionResource);
		const key = this.name === 'updateWorkflow' ? requiredString(input, 'key') : undefined;
		const definition = await this.authoringService.validateWorkflow(input.definition, scope, key);
		const target = this.name === 'createWorkflow' ? this.target(input, scope) : undefined;
		const existing = key ? await this.authoringService.readWorkflow(key, scope) : undefined;
		if (existing && (existing.entry.readOnly || existing.revision !== requiredString(input, 'revision'))) {
			throw new Error(localize('workflow.tool.changed', "The workflow is read-only or changed since it was read. Call getWorkflow again before proposing an update."));
		}
		this.assertEnabled(token);
		return {
			invocationMessage: toolLabels[this.name],
			confirmationMessages: {
				title: this.name === 'createWorkflow' ? localize('workflow.tool.createConfirm', "Create Workflow?") : localize('workflow.tool.updateConfirm', "Update Workflow?"),
				message: this.name === 'createWorkflow'
					? localize('workflow.tool.createDetails', "Save \"{0}\" to {1}? This creates a reusable definition only; no workflow will start.", definition.label, target === 'user' ? localize('workflow.tool.personal', "your personal profile") : target!.toString(true))
					: localize('workflow.tool.updateDetails', "Update \"{0}\" at {1} for future runs? Existing runs and shared checkpoint contracts will not change.", definition.label, existing!.entry.resource!.toString(true)),
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		this.assertEnabled(token);
		const input: Record<string, unknown> = invocation.parameters;
		const scope = this.scope(input, invocation.context?.workingDirectory, invocation.context?.sessionResource);
		const guard = () => {
			this.assertEnabled(token);
			const current = this.scope(input, invocation.context?.workingDirectory, invocation.context?.sessionResource);
			if (!equals(scope.sources, current.sources) || !this.uriIdentityService.extUri.isEqual(scope.workspace, current.workspace)) {
				throw new Error(localize('workflow.tool.scopeChanged', "The workflow authoring context changed. Read the catalog again before retrying."));
			}
		};
		switch (this.name) {
			case 'listWorkflows': {
				const catalog = await this.authoringService.getCatalog(scope);
				this.assertEnabled(token);
				return result({ workflows: catalog.workflows.map(summary), diagnostics: catalog.diagnostics, workspaces: this.workspaces(invocation.context?.workingDirectory).map(uri => uri.toString()) });
			}
			case 'listWorkflowCheckpoints': {
				const catalog = await this.authoringService.getCatalog(scope);
				const references = input.references;
				if (references !== undefined && (!Array.isArray(references) || !references.length || references.some(reference => typeof reference !== 'string' || !reference))) {
					throw new Error(localize('workflow.tool.invalidReferences', "Provide a non-empty array of checkpoint references."));
				}
				const entries = references ? catalog.checkpointTypes.filter(entry => entry.definition && references.includes(getWorkflowCheckpointTypeReference(entry.definition))) : catalog.checkpointTypes;
				if (references?.some(reference => !entries.some(entry => entry.definition && getWorkflowCheckpointTypeReference(entry.definition) === reference))) {
					throw new Error(localize('workflow.tool.missingReference', "A requested checkpoint is unavailable. Call listWorkflowCheckpoints without references to refresh the catalog."));
				}
				this.assertEnabled(token);
				return result({ checkpoints: entries.map(entry => ({ ...summary(entry), reference: entry.definition && getWorkflowCheckpointTypeReference(entry.definition), ...(references ? { definition: entry.definition } : {}) })), diagnostics: catalog.diagnostics });
			}
			case 'getWorkflow': {
				const document = await this.authoringService.readWorkflow(requiredString(input, 'key'), scope);
				this.assertEnabled(token);
				return result(documentOutput(document));
			}
			case 'createWorkflow': {
				const document = await this.authoringService.createWorkflow(input.definition, this.target(input, scope), scope, guard);
				return result({ status: 'created', ...documentOutput(document) }, localize('workflow.tool.created', "Created workflow {0}", document.entry.label), document.entry.resource);
			}
			case 'updateWorkflow': {
				const document = await this.authoringService.updateWorkflow(requiredString(input, 'key'), input.definition, requiredString(input, 'revision'), scope, guard);
				return result({ status: 'updated', ...documentOutput(document) }, localize('workflow.tool.updated', "Updated workflow {0}", document.entry.label), document.entry.resource);
			}
		}
	}

	private isMutation(): boolean {
		return this.name === 'createWorkflow' || this.name === 'updateWorkflow';
	}

	private assertEnabled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.configurationService.getValue<boolean>(WorkflowSettingId.Enabled) !== true || this.entitlementService.sentiment.hidden) {
			throw new Error(localize('workflow.tool.disabled', "Workflow authoring tools are disabled."));
		}
	}

	private workspaces(workingDirectory: URI | undefined): readonly URI[] {
		return workingDirectory ? [workingDirectory] : this.workspaceService.getWorkspace().folders.map(folder => folder.uri);
	}

	private scope(input: Record<string, unknown>, workingDirectory: URI | undefined, session: URI | undefined): WorkflowAuthoringScope {
		const workspaces = this.workspaces(workingDirectory);
		let workspace = workingDirectory ?? (workspaces.length === 1 ? workspaces[0] : undefined);
		if (input.workspace !== undefined) {
			const requested = URI.parse(requiredString(input, 'workspace'), true);
			workspace = workspaces.find(root => this.uriIdentityService.extUri.isEqual(root, requested));
			if (!workspace) {
				throw new Error(localize('workflow.tool.outsideWorkspace', "The requested workspace is outside this session's working directory or workspace folders."));
			}
		}
		const sources = session ? this.harnessService.findHarnessById(getChatSessionType(session))?.workflowSources?.filter(source => source !== 'plugin').map((source): WorkflowSource['kind'] => source === 'local' ? 'workspace' : source) : undefined;
		return { workspace, sources };
	}

	private target(input: Record<string, unknown>, scope: WorkflowAuthoringScope): 'user' | URI {
		if (input.target === undefined || input.target === 'user') {
			return 'user';
		}
		if (input.target !== 'workspace' || !scope.workspace) {
			throw new Error(localize('workflow.tool.target', "Choose 'user' or 'workspace'. Workspace creation requires a session working directory or an explicit workspace folder in a multi-root window."));
		}
		return scope.workspace;
	}
}

export class WorkflowToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.workflowTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const tools = this._register(toolsService.createToolSet(ToolDataSource.Internal, 'workflows', 'workflows', {
			icon: Codicon.listTree,
			description: localize('workflow.tools.description', "Discover and author reusable workflows"),
		}));
		for (const name of toolNames) {
			const tool = instantiationService.createInstance(WorkflowTool, name);
			const data = tool.getToolData();
			this._register(toolsService.registerTool(data, tool));
			this._register(tools.addTool(data));
		}
	}
}

function requiredString(input: Record<string, unknown>, key: string): string {
	const value = input[key];
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(localize('workflow.tool.required', "'{0}' must be a non-empty string.", key));
	}
	return value;
}

function summary(entry: WorkflowTemplateEntry | WorkflowCheckpointEntry) {
	return {
		key: entry.key,
		label: entry.label,
		description: entry.definition?.description,
		source: entry.source,
		readOnly: entry.readOnly,
		resource: entry.resource?.toString(),
		diagnostics: entry.diagnostics,
		...(entry.definition && hasKey(entry.definition, { checkpoints: true }) ? { checkpoints: entry.definition.checkpoints.map(checkpoint => ({ id: checkpoint.id, label: checkpoint.label, type: checkpoint.type })) } : {}),
	};
}

function documentOutput(document: WorkflowAuthoringDocument) {
	return { ...summary(document.entry), definition: document.entry.definition, content: document.content, revision: document.revision };
}

function result(value: object, message?: string, resource?: URI): IToolResult {
	return { content: [{ kind: 'text', value: JSON.stringify(value) }], toolResultMessage: message, toolResultDetails: resource ? [resource] : undefined };
}
