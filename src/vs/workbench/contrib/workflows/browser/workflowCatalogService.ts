/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { builtinWorkflowCheckpointTypes, builtinWorkflowDefinitions } from '../../../../platform/workflow/common/builtinWorkflows.js';
import { WorkflowCheckpointType, WorkflowDefinition, WorkflowSnapshot, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { getWorkflowFileKind, WORKFLOW_MAX_FILE_SIZE } from '../../../../platform/workflow/common/workflowFiles.js';
import { resolveWorkflowDefinition } from '../../../../platform/workflow/common/workflowValidation.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IWorkflowCatalogService, WorkflowCatalog, WorkflowCatalogDiagnostic, WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { createWorkflowCatalog, getUsableCheckpointTypes, WorkflowCatalogDocument, workflowCheckpointSchemaId, workflowSchemaId } from '../common/workflowCatalogModel.js';

export class WorkflowCatalogService extends Disposable implements IWorkflowCatalogService {
	declare readonly _serviceBrand: undefined;
	private readonly change = this._register(new Emitter<void>());
	readonly onDidChange = this.change.event;

	get userWorkflowsHome(): URI {
		return this.profileService.currentProfile.workflowsHome;
	}

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IUserDataProfileService private readonly profileService: IUserDataProfileService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();
		this._register(profileService.onDidChangeCurrentProfile(() => this.change.fire()));
		this._register(workspaceService.onDidChangeWorkspaceFolders(() => this.change.fire()));
		this._register(extensionService.onDidChangeExtensions(() => this.change.fire()));
		this._register(fileService.onDidChangeFileSystemProviderRegistrations(() => this.change.fire()));
	}

	watch(workspace?: URI): IDisposable {
		const store = new DisposableStore();
		const watchers = store.add(new DisposableStore());
		const update = (removedScheme?: string) => {
			watchers.clear();
			const resources = new ResourceSet();
			for (const root of this.roots(workspace)) {
				if (root.resource.scheme === removedScheme || !this.fileService.hasProvider(root.resource)) {
					continue;
				}
				// Watch ancestors as well so creating a previously missing workflows folder is discovered.
				resources.add(root.resource);
				resources.add(dirname(root.resource));
				if (root.source.kind === 'workspace') {
					resources.add(dirname(dirname(root.resource)));
				}
			}
			for (const resource of resources) {
				const watcher = watchers.add(this.fileService.createWatcher(resource, { recursive: false, excludes: [] }));
				watchers.add(watcher.onDidChange(() => this.change.fire()));
			}
		};
		store.add(this.profileService.onDidChangeCurrentProfile(() => update()));
		store.add(this.workspaceService.onDidChangeWorkspaceFolders(() => update()));
		store.add(this.fileService.onDidChangeFileSystemProviderRegistrations(event => {
			if (this.roots(workspace).some(root => root.resource.scheme === event.scheme)) {
				// Provider removal is announced before FileService removes it from its registry.
				update(event.added ? undefined : event.scheme);
			}
		}));
		update();
		return store;
	}

	async getCatalog(workspace?: URI): Promise<WorkflowCatalog> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const documents: WorkflowCatalogDocument[] = [];
		const diagnostics: WorkflowCatalogDiagnostic[] = [];
		for (const definition of builtinWorkflowCheckpointTypes) {
			documents.push({ kind: 'checkpoint', content: JSON.stringify(definition), source: definition.source! });
		}
		for (const definition of builtinWorkflowDefinitions) {
			documents.push({ kind: 'workflow', content: JSON.stringify(definition), source: definition.source! });
		}
		for (const root of this.roots(workspace)) {
			try {
				if (!await this.fileService.canHandleResource(root.resource)) {
					diagnostics.push({ severity: 'warning', code: 'source', resource: root.resource, message: this.getUnavailableSourceMessage(root.resource) });
					continue;
				}
				const stat = await this.fileService.resolve(root.resource);
				for (const child of stat.children ?? []) {
					const kind = getWorkflowFileKind(child.name);
					if (child.isDirectory || !kind) {
						continue;
					}
					await this.readDocument(child.resource, kind, root.source, documents);
				}
			} catch (error) {
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					diagnostics.push({ severity: 'error', code: 'source', resource: root.resource, message: localize('workflow.folderReadError', "Could not read workflow folder: {0}", String(error)) });
				}
			}
		}
		for (const extension of this.extensionService.extensions) {
			const contributions = extension.contributes;
			const source: WorkflowSource = { kind: 'extension', id: ExtensionIdentifier.toKey(extension.identifier), label: extension.displayName ?? extension.name, uri: extension.extensionLocation.toString() };
			for (const [kind, files] of [['checkpoint', contributions?.workflowCheckpointTypes], ['workflow', contributions?.workflowTemplates]] as const) {
				if (files === undefined) {
					continue;
				}
				if (!Array.isArray(files)) {
					diagnostics.push({ severity: 'error', code: 'source', message: localize('workflow.invalidContribution', "Extension '{0}' must contribute an array of packaged workflow file paths.", source.label) });
					continue;
				}
				for (const file of files) {
					if (typeof file !== 'string' || !file || /(^[\\/]|^[a-zA-Z][a-zA-Z\d+.-]*:)/.test(file) || file.split(/[\\/]/).includes('..')) {
						diagnostics.push({ severity: 'error', code: 'source', message: localize('workflow.invalidContributionPath', "Extension '{0}' contributed a workflow path outside its package.", source.label) });
						continue;
					}
					const resource = joinPath(extension.extensionLocation, ...file.split(/[\\/]/));
					if (!isEqualOrParent(resource, extension.extensionLocation)) {
						continue;
					}
					await this.readDocument(resource, kind, source, documents);
				}
			}
		}
		return createWorkflowCatalog(documents, diagnostics);
	}

	async resolve(entry: WorkflowTemplateEntry, workspace?: URI): Promise<WorkflowSnapshot> {
		const catalog = await this.getCatalog(workspace);
		const current = catalog.workflows.find(candidate => candidate.key === entry.key);
		if (!current?.definition || current.diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
			throw new Error(current?.diagnostics.map(diagnostic => diagnostic.message).join('\n') ?? localize('workflow.templateRemoved', "This workflow is no longer available from its source."));
		}
		if (entry.definition && (entry.definition.id !== current.definition.id || entry.definition.version !== current.definition.version)) {
			throw new Error(localize('workflow.templateChanged', "This workflow's identity or version changed. Select it again to review the current template."));
		}
		return resolveWorkflowDefinition(current.definition, getUsableCheckpointTypes(catalog));
	}

	async createWorkflow(definition: WorkflowDefinition, target: 'user' | URI, guard?: () => void): Promise<URI> {
		return this.createFile(definition, target, 'workflow', guard);
	}

	async createCheckpointType(definition: WorkflowCheckpointType, target: 'user' | URI): Promise<URI> {
		return this.createFile(definition, target, 'checkpoint');
	}

	private async createFile(definition: WorkflowDefinition | WorkflowCheckpointType, target: 'user' | URI, kind: 'workflow' | 'checkpoint', guard?: () => void): Promise<URI> {
		const root = target === 'user' ? this.userWorkflowsHome : joinPath(target, '.vscode', 'workflows');
		if (!await this.fileService.canHandleResource(root)) {
			throw new Error(this.getUnavailableSourceMessage(root));
		}
		const name = definition.id.replace(/[^a-zA-Z0-9_-]/g, '-');
		const resource = joinPath(root, `${name}.v${definition.version}.${kind}.jsonc`);
		const { source: _source, ...content } = definition;
		const buffer = VSBuffer.fromString(JSON.stringify({ $schema: kind === 'workflow' ? workflowSchemaId : workflowCheckpointSchemaId, ...content }, null, '\t') + '\n');
		if (buffer.byteLength > WORKFLOW_MAX_FILE_SIZE) {
			throw new Error(localize('workflow.creationTooLarge', "Workflow files must be smaller than 1 MB."));
		}
		guard?.();
		await this.fileService.createFolder(root);
		guard?.();
		await this.fileService.createFile(resource, buffer, { overwrite: false });
		this.change.fire();
		return resource;
	}

	private roots(workspace?: URI): { resource: URI; source: WorkflowSource }[] {
		const roots = workspace ? [workspace] : this.workspaceService.getWorkspace().folders.map(folder => folder.uri);
		return [
			...roots.map(root => ({ resource: joinPath(root, '.vscode', 'workflows'), source: { kind: 'workspace' as const, id: root.toString(), label: localize('workflow.workspaceSource', "Workspace"), uri: root.toString() } })),
			{ resource: this.userWorkflowsHome, source: { kind: 'user', id: this.profileService.currentProfile.id, label: localize('workflow.userSource', "Personal"), uri: this.userWorkflowsHome.toString() } },
		];
	}

	private async readDocument(resource: URI, kind: 'workflow' | 'checkpoint', source: WorkflowSource, documents: WorkflowCatalogDocument[]): Promise<void> {
		try {
			if (!await this.fileService.canHandleResource(resource)) {
				documents.push({ kind, content: '', resource, source: { ...source, uri: resource.toString() }, readError: this.getUnavailableSourceMessage(resource) });
				return;
			}
			const file = await this.fileService.readFile(resource, { limits: { size: WORKFLOW_MAX_FILE_SIZE } });
			documents.push({ kind, content: file.value.toString(), resource, source: { ...source, uri: resource.toString() } });
		} catch (error) {
			documents.push({ kind, content: '', resource, source: { ...source, uri: resource.toString() }, readError: localize('workflow.fileReadError', "Could not read workflow file: {0}", String(error)) });
		}
	}

	private getUnavailableSourceMessage(resource: URI): string {
		return localize('workflow.sourceUnavailable', "Workflow source '{0}' is unavailable because no file system provider handles '{1}' resources.", resource.toString(true), resource.scheme);
	}
}
