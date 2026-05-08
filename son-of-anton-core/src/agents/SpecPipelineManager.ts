/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TypedEventEmitter, type Event } from '../eventEmitter';
import { RequirementsAgent } from './RequirementsAgent';
import { DesignAgent } from './DesignAgent';
import { TaskDecompositionAgent } from './TaskDecompositionAgent';
import {
	SpecPhase,
	SpecPipelineState,
	SpecPhaseState,
	SpecGenerationRequest,
	SpecGenerationResult,
	ClarifyingAnswer,
} from './specTypes';

const SPECS_DIR = '.son-of-anton/specs';

/**
 * Manages the full spec-driven development pipeline.
 * Coordinates the three-phase flow: requirements → design → tasks,
 * including interactive clarification and approval gates.
 *
 * The host (extension or CLI) supplies a workspace root via the constructor.
 * When the workspace path is empty, file operations no-op.
 */
export class SpecPipelineManager {
	private readonly requirementsAgent: RequirementsAgent;
	private readonly designAgent: DesignAgent;
	private readonly taskDecompositionAgent: TaskDecompositionAgent;
	private readonly workspaceRoot: string;

	private readonly _onDidChangeState = new TypedEventEmitter<SpecPipelineState>();
	readonly onDidChangeState: Event<SpecPipelineState> = this._onDidChangeState.event;

	constructor(
		requirementsAgent: RequirementsAgent,
		designAgent: DesignAgent,
		taskDecompositionAgent: TaskDecompositionAgent,
		workspaceRoot: string,
	) {
		this.requirementsAgent = requirementsAgent;
		this.designAgent = designAgent;
		this.taskDecompositionAgent = taskDecompositionAgent;
		this.workspaceRoot = workspaceRoot;
	}

	/**
	 * Start a new spec pipeline from a natural language description.
	 */
	async startPipeline(
		featureName: string,
		description: string,
	): Promise<SpecGenerationResult> {
		const specDir = this.getSpecDir(featureName);
		await this.ensureSpecDir(specDir);

		return this.generatePhase('requirements', {
			description,
			phase: 'requirements',
			featureName,
		});
	}

	/**
	 * Continue the pipeline after clarifying questions are answered.
	 */
	async continuePipeline(
		featureName: string,
		description: string,
		answers: ClarifyingAnswer[],
	): Promise<SpecGenerationResult> {
		return this.generatePhase('requirements', {
			description,
			phase: 'requirements',
			featureName,
			clarifyingAnswers: answers,
		});
	}

	/**
	 * Approve a phase and advance to the next one.
	 */
	async approveAndAdvance(
		featureName: string,
		phase: SpecPhase,
		content: string,
	): Promise<SpecGenerationResult | null> {
		const specDir = this.getSpecDir(featureName);

		// Write the approved content
		const fileName = this.getPhaseFileName(phase);
		const filePath = path.join(this.workspaceRoot, specDir, fileName);
		await fs.writeFile(filePath, content, 'utf-8');

		// Advance to the next phase
		const nextPhase = this.getNextPhase(phase);
		if (!nextPhase) {
			return null;
		}

		return this.generatePhase(nextPhase, {
			description: '',
			phase: nextPhase,
			featureName,
			previousPhaseContent: content,
		});
	}

	/**
	 * Generate property-based tests from approved requirements.
	 */
	async generatePropertyTests(featureName: string): Promise<string> {
		const specDir = this.getSpecDir(featureName);
		const reqPath = path.join(this.workspaceRoot, specDir, 'requirements.md');

		try {
			const requirementsContent = await fs.readFile(reqPath, 'utf-8');

			// First, parse the markdown requirements into a structured RequirementsSpec
			const parseResponse = await fetch('http://localhost:8090/parse/requirements', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					requirementsContent,
				}),
			});

			if (!parseResponse.ok) {
				throw new Error(`Spec pipeline parse service returned ${parseResponse.status}`);
			}

			const parsedSpec = await parseResponse.json();

			// Call the spec-pipeline service to generate property tests from the structured spec
			const response = await fetch('http://localhost:8090/generate/property-tests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					spec: parsedSpec,
					featureName,
				}),
			});

			if (!response.ok) {
				throw new Error(`Spec pipeline service returned ${response.status}`);
			}

			const testContent = await response.text();

			// Write the test file
			const testPath = path.join(this.workspaceRoot, specDir, 'properties.test.ts');
			await fs.writeFile(testPath, testContent, 'utf-8');

			return testContent;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Property test generation failed: ${message}`);
		}
	}

	/**
	 * Get the current pipeline state for a feature.
	 */
	async getPipelineState(featureName: string): Promise<SpecPipelineState> {
		const specDir = this.getSpecDir(featureName);
		const basePath = path.join(this.workspaceRoot, specDir);

		return {
			featureName,
			specDir,
			requirements: await this.getPhaseState(path.join(basePath, 'requirements.md')),
			design: await this.getPhaseState(path.join(basePath, 'design.md')),
			tasks: await this.getPhaseState(path.join(basePath, 'tasks.md')),
			properties: await this.getPhaseState(path.join(basePath, 'properties.test.ts')),
		};
	}

	/**
	 * List all features with specs.
	 */
	async listFeatures(): Promise<string[]> {
		const specsPath = path.join(this.workspaceRoot, SPECS_DIR);

		try {
			const entries = await fs.readdir(specsPath, { withFileTypes: true });
			return entries
				.filter(entry => entry.isDirectory())
				.map(entry => entry.name);
		} catch {
			return [];
		}
	}

	private async generatePhase(
		phase: SpecPhase,
		request: SpecGenerationRequest,
	): Promise<SpecGenerationResult> {
		switch (phase) {
			case 'requirements':
				return this.requirementsAgent.generateRequirements(request);
			case 'design':
				return this.designAgent.generateDesign(request);
			case 'tasks':
				return this.taskDecompositionAgent.generateTasks(request);
			default:
				throw new Error(`Unknown phase: ${phase}`);
		}
	}

	private getNextPhase(phase: SpecPhase): SpecPhase | null {
		switch (phase) {
			case 'requirements': return 'design';
			case 'design': return 'tasks';
			case 'tasks': return null;
			default: return null;
		}
	}

	private getPhaseFileName(phase: SpecPhase): string {
		switch (phase) {
			case 'requirements': return 'requirements.md';
			case 'design': return 'design.md';
			case 'tasks': return 'tasks.md';
			case 'properties': return 'properties.test.ts';
		}
	}

	private async getPhaseState(filePath: string): Promise<SpecPhaseState> {
		try {
			const stat = await fs.stat(filePath);
			return {
				status: 'draft',
				lastModified: stat.mtimeMs,
			};
		} catch {
			return { status: 'missing' };
		}
	}

	private getSpecDir(featureName: string): string {
		const slug = featureName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		return `${SPECS_DIR}/${slug}`;
	}

	private async ensureSpecDir(specDir: string): Promise<void> {
		const dirPath = path.join(this.workspaceRoot, specDir);
		try {
			await fs.mkdir(dirPath, { recursive: true });
		} catch {
			// Directory may already exist
		}
	}

	/**
	 * Dispose resources.
	 */
	dispose(): void {
		this._onDidChangeState.dispose();
	}
}
