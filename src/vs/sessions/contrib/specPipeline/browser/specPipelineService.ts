/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import {
	ISpecPipelineService,
	ISpecPipelineState,
	ISpecFeature,
	ISpecPhaseState,
	SpecPhase,
	SpecPhaseStatus,
} from '../common/specPipeline.js';

const SPECS_DIR = '.son-of-anton/specs';

/**
 * Implementation of the spec pipeline service.
 * Manages spec lifecycle by reading/writing spec files from the workspace.
 */
export class SpecPipelineService extends Disposable implements ISpecPipelineService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<ISpecPipelineState>());
	readonly onDidChangeState: Event<ISpecPipelineState> = this._onDidChangeState.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	async listFeatures(): Promise<ISpecFeature[]> {
		const specsUri = this.getSpecsUri();
		if (!specsUri) {
			return [];
		}

		try {
			const stat = await this.fileService.resolve(specsUri);
			if (!stat.children) {
				return [];
			}

			const features: ISpecFeature[] = [];
			for (const child of stat.children) {
				if (child.isDirectory) {
					const name = child.name;
					const state = await this.getState(name);
					features.push({ name, specDir: `${SPECS_DIR}/${name}`, state });
				}
			}

			return features;
		} catch {
			return [];
		}
	}

	async getState(featureName: string): Promise<ISpecPipelineState> {
		const specDir = `${SPECS_DIR}/${this.toSlug(featureName)}`;
		const baseUri = this.getWorkspaceUri();
		if (!baseUri) {
			return this.emptyState(featureName, specDir);
		}

		const [requirements, design, tasks, properties] = await Promise.all([
			this.getPhaseState(URI.joinPath(baseUri, specDir, 'requirements.md')),
			this.getPhaseState(URI.joinPath(baseUri, specDir, 'design.md')),
			this.getPhaseState(URI.joinPath(baseUri, specDir, 'tasks.md')),
			this.getPhaseState(URI.joinPath(baseUri, specDir, 'properties.test.ts')),
		]);

		return { featureName, specDir, requirements, design, tasks, properties };
	}

	async startPipeline(featureName: string, description: string): Promise<void> {
		const specDir = `${SPECS_DIR}/${this.toSlug(featureName)}`;
		const baseUri = this.getWorkspaceUri();
		if (!baseUri) {
			return;
		}

		// Create the spec directory
		const dirUri = URI.joinPath(baseUri, specDir);
		await this.fileService.createFolder(dirUri);

		// Fire state change so the UI refreshes
		const state = await this.getState(featureName);
		this._onDidChangeState.fire(state);
	}

	async approvePhase(featureName: string, phase: SpecPhase): Promise<void> {
		// In a full implementation, this would:
		// 1. Mark the phase as approved in metadata
		// 2. Trigger generation of the next phase
		// 3. Fire state change events
		const state = await this.getState(featureName);
		this._onDidChangeState.fire(state);
	}

	async openSpecFile(featureName: string, phase: SpecPhase): Promise<void> {
		const baseUri = this.getWorkspaceUri();
		if (!baseUri) {
			return;
		}

		const specDir = `${SPECS_DIR}/${this.toSlug(featureName)}`;
		const fileName = this.getPhaseFileName(phase);
		const fileUri = URI.joinPath(baseUri, specDir, fileName);

		try {
			await this.fileService.resolve(fileUri);
			await this.editorService.openEditor({ resource: fileUri });
		} catch {
			// File doesn't exist yet
		}
	}

	private async getPhaseState(uri: URI): Promise<ISpecPhaseState> {
		try {
			const stat = await this.fileService.stat(uri);
			return {
				status: 'draft' as SpecPhaseStatus,
				lastModified: stat.mtime,
			};
		} catch {
			return { status: 'missing' as SpecPhaseStatus };
		}
	}

	private emptyState(featureName: string, specDir: string): ISpecPipelineState {
		return {
			featureName,
			specDir,
			requirements: { status: 'missing' },
			design: { status: 'missing' },
			tasks: { status: 'missing' },
			properties: { status: 'missing' },
		};
	}

	private getPhaseFileName(phase: SpecPhase): string {
		switch (phase) {
			case 'requirements': return 'requirements.md';
			case 'design': return 'design.md';
			case 'tasks': return 'tasks.md';
			case 'properties': return 'properties.test.ts';
		}
	}

	private toSlug(name: string): string {
		return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	private getSpecsUri(): URI | undefined {
		const workspaceUri = this.getWorkspaceUri();
		if (!workspaceUri) {
			return undefined;
		}
		return URI.joinPath(workspaceUri, SPECS_DIR);
	}

	private getWorkspaceUri(): URI | undefined {
		const folders = this.workspaceContextService.getWorkspace().folders;
		return folders.length > 0 ? folders[0].uri : undefined;
	}
}
