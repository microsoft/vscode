/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { hashAsync } from '../../../../base/common/hash.js';
import { applyEdits, setProperty } from '../../../../base/common/jsonEdit.js';
import { equals } from '../../../../base/common/objects.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { WorkflowDefinition, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { WORKFLOW_MAX_FILE_SIZE } from '../../../../platform/workflow/common/workflowFiles.js';
import { resolveWorkflowDefinition } from '../../../../platform/workflow/common/workflowValidation.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IWorkflowAuthoringService, WorkflowAuthoringDocument, WorkflowAuthoringScope } from '../common/workflowAuthoring.js';
import { IWorkflowCatalogService, WorkflowCatalog, WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { getUsableCheckpointTypes, parseWorkflowDocument } from '../common/workflowCatalogModel.js';

export class WorkflowAuthoringService implements IWorkflowAuthoringService {
	declare readonly _serviceBrand: undefined;
	private readonly mutations = new Sequencer();

	constructor(
		@IWorkflowCatalogService private readonly catalogService: IWorkflowCatalogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
	) { }

	async getCatalog(scope: WorkflowAuthoringScope): Promise<WorkflowCatalog> {
		return visibleCatalog(await this.catalogService.getCatalog(scope.workspace), scope);
	}

	async readWorkflow(key: string, scope: WorkflowAuthoringScope): Promise<WorkflowAuthoringDocument> {
		const entry = await this.findWorkflow(key, scope);
		const content = entry.resource
			? (await this.fileService.readFile(entry.resource, { limits: { size: WORKFLOW_MAX_FILE_SIZE } })).value.toString()
			: JSON.stringify(entry.definition, null, '\t');
		const parsed = parseWorkflowDocument({ kind: 'workflow', content, resource: entry.resource, source: entry.source });
		return { entry: { ...entry, definition: parsed.definition, diagnostics: parsed.diagnostics.length ? parsed.diagnostics : entry.diagnostics }, content, revision: await hashAsync(content) };
	}

	async validateWorkflow(value: unknown, scope: WorkflowAuthoringScope, replacing?: string): Promise<WorkflowDefinition> {
		const all = await this.catalogService.getCatalog(scope.workspace);
		const catalog = visibleCatalog(all, scope);
		const source: WorkflowSource = { kind: 'user', id: 'authoring' };
		const entry = parseWorkflowDocument({ kind: 'workflow', content: serializeDefinition(value), source });
		if (!entry.definition || entry.diagnostics.length) {
			throw new Error(entry.diagnostics.map(diagnostic => diagnostic.message).join('\n'));
		}
		const definition = entry.definition;
		// Conflicts include hidden sources, which still cannot be silently overridden.
		if (all.workflows.some(candidate => candidate.key !== replacing && candidate.definition?.id === definition.id && candidate.definition.version === definition.version)) {
			throw new Error(localize('workflow.authoring.duplicate', "A workflow with id '{0}' and this version already exists. Choose a distinct id for a copy, or read and update the existing workflow.", definition.id));
		}
		resolveWorkflowDefinition(definition, getUsableCheckpointTypes(catalog));
		return withoutSource(definition);
	}

	createWorkflow(value: unknown, target: 'user' | URI, scope: WorkflowAuthoringScope, guard: () => void): Promise<WorkflowAuthoringDocument> {
		const mutationGuard = this.createMutationGuard(guard);
		return this.mutations.queue(async () => {
			const kind = target === 'user' ? 'user' : 'workspace';
			if (scope.sources && !scope.sources.includes(kind)) {
				throw new Error(localize('workflow.authoring.sourceDisabled', "This provider does not support authoring workflows in the requested source."));
			}
			const definition = await this.validateWorkflow(value, scope);
			mutationGuard();
			const resource = await this.catalogService.createWorkflow(definition, target, mutationGuard);
			return this.readWorkflow(resource.toString(), scope);
		});
	}

	updateWorkflow(key: string, value: unknown, revision: string, scope: WorkflowAuthoringScope, guard: () => void): Promise<WorkflowAuthoringDocument> {
		const mutationGuard = this.createMutationGuard(guard);
		return this.mutations.queue(async () => {
			const entry = await this.findWorkflow(key, scope);
			if (entry.readOnly || !entry.resource) {
				throw new Error(localize('workflow.authoring.readOnly', "Built-in and extension workflows are read-only. Create a personal or workspace copy with a distinct id."));
			}
			const definition = await this.validateWorkflow(value, scope, key);
			if (entry.definition && (entry.definition.id !== definition.id || entry.definition.version !== definition.version)) {
				throw new Error(localize('workflow.authoring.identityChanged', "Updating a workflow must preserve its id and version. Create a new workflow to change its identity."));
			}
			const file = await this.fileService.readFile(entry.resource, { limits: { size: WORKFLOW_MAX_FILE_SIZE } });
			const original = file.value.toString();
			if (await hashAsync(original) !== revision) {
				throw new Error(localize('workflow.authoring.conflict', "This workflow changed after it was read. Call getWorkflow again before updating it. No changes were made."));
			}
			const current = parseWorkflowDocument({ kind: 'workflow', content: original, resource: entry.resource, source: entry.source });
			if (!current.definition) {
				throw new Error(localize('workflow.authoring.invalidDocument', "Correct the workflow's JSONC syntax in the editor before updating it with this tool."));
			}
			if (current.definition.id !== definition.id || current.definition.version !== definition.version) {
				throw new Error(localize('workflow.authoring.changedIdentity', "The workflow's identity changed. Read it again before updating it."));
			}
			let content = original;
			const previous = withoutSource(current.definition);
			for (const property of ['label', 'description', 'inputSchema', 'checkpoints'] as const) {
				if (!equals(previous[property], definition[property])) {
					content = applyEdits(content, setProperty(content, [property], definition[property], { insertSpaces: false, tabSize: 4, eol: original.includes('\r\n') ? '\r\n' : '\n' }));
				}
			}
			if (this.workingCopyService.isDirty(entry.resource)) {
				throw new Error(localize('workflow.authoring.dirty', "This workflow has unsaved editor changes. Save or revert those changes and call getWorkflow again before updating it."));
			}
			if (VSBuffer.fromString(content).byteLength > WORKFLOW_MAX_FILE_SIZE) {
				throw new Error(localize('workflow.authoring.updateSize', "The updated workflow exceeds the 1 MB file limit."));
			}
			mutationGuard();
			await this.fileService.writeFile(entry.resource, VSBuffer.fromString(content), { etag: file.etag, mtime: file.mtime });
			return this.readWorkflow(key, scope);
		});
	}

	private createMutationGuard(guard: () => void): () => void {
		const home = this.catalogService.userWorkflowsHome;
		return () => {
			guard();
			if (!isEqual(home, this.catalogService.userWorkflowsHome)) {
				throw new Error(localize('workflow.authoring.profileChanged', "The active profile changed before saving the workflow. Read the catalog again before retrying."));
			}
		};
	}

	private async findWorkflow(key: string, scope: WorkflowAuthoringScope): Promise<WorkflowTemplateEntry> {
		const entry = (await this.getCatalog(scope)).workflows.find(candidate => candidate.key === key);
		if (!entry) {
			throw new Error(localize('workflow.authoring.notFound', "The workflow is not available in this session's catalog. Call listWorkflows to obtain its current key."));
		}
		return entry;
	}
}

function visibleCatalog(catalog: WorkflowCatalog, scope: WorkflowAuthoringScope): WorkflowCatalog {
	const visible = (entry: { source: WorkflowSource }) => !scope.sources || scope.sources.includes(entry.source.kind);
	return { ...catalog, workflows: catalog.workflows.filter(visible), checkpointTypes: catalog.checkpointTypes.filter(visible) };
}

function serializeDefinition(value: unknown): string {
	const content = JSON.stringify(value);
	if (!content || VSBuffer.fromString(content).byteLength > WORKFLOW_MAX_FILE_SIZE) {
		throw new Error(localize('workflow.authoring.size', "Provide a workflow definition smaller than 1 MB."));
	}
	return content;
}

function withoutSource(definition: WorkflowDefinition): WorkflowDefinition {
	const { source: _source, ...body } = definition;
	return {
		...body,
		checkpoints: body.checkpoints.map(checkpoint => {
			if (!checkpoint.localType) {
				return checkpoint;
			}
			const { source: _source, ...localType } = checkpoint.localType;
			return { ...checkpoint, localType };
		}),
	};
}
