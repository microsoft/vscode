/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
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
 */
export class SpecPipelineManager {
	private readonly requirementsAgent: RequirementsAgent;
	private readonly designAgent: DesignAgent;
	private readonly taskDecompositionAgent: TaskDecompositionAgent;

	private readonly _onDidChangeState = new vscode.EventEmitter<SpecPipelineState>();
	readonly onDidChangeState: vscode.Event<SpecPipelineState> = this._onDidChangeState.event;

	constructor(
		requirementsAgent: RequirementsAgent,
		designAgent: DesignAgent,
		taskDecompositionAgent: TaskDecompositionAgent,
	) {
		this.requirementsAgent = requirementsAgent;
		this.designAgent = designAgent;
		this.taskDecompositionAgent = taskDecompositionAgent;
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
		const fileUri = vscode.Uri.file(`${this.getWorkspacePath()}/${specDir}/${fileName}`);
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

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
		const reqUri = vscode.Uri.file(
			`${this.getWorkspacePath()}/${specDir}/requirements.md`
		);

		try {
			const content = await vscode.workspace.fs.readFile(reqUri);
			const requirementsContent = Buffer.from(content).toString('utf-8');

			// Call the spec-pipeline service to generate property tests
			const response = await fetch('http://localhost:8090/generate/property-tests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					spec: requirementsContent,
					featureName,
				}),
			});

			if (!response.ok) {
				throw new Error(`Spec pipeline service returned ${response.status}`);
			}

			const testContent = await response.text();

			// Write the test file
			const testUri = vscode.Uri.file(
				`${this.getWorkspacePath()}/${specDir}/properties.test.ts`
			);
			await vscode.workspace.fs.writeFile(testUri, Buffer.from(testContent, 'utf-8'));

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
		const basePath = `${this.getWorkspacePath()}/${specDir}`;

		return {
			featureName,
			specDir,
			requirements: await this.getPhaseState(`${basePath}/requirements.md`),
			design: await this.getPhaseState(`${basePath}/design.md`),
			tasks: await this.getPhaseState(`${basePath}/tasks.md`),
			properties: await this.getPhaseState(`${basePath}/properties.test.ts`),
		};
	}

	/**
	 * List all features with specs.
	 */
	async listFeatures(): Promise<string[]> {
		const workspacePath = this.getWorkspacePath();
		const specsUri = vscode.Uri.file(`${workspacePath}/${SPECS_DIR}`);

		try {
			const entries = await vscode.workspace.fs.readDirectory(specsUri);
			return entries
				.filter(([, type]) => type === vscode.FileType.Directory)
				.map(([name]) => name);
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
			const uri = vscode.Uri.file(filePath);
			const stat = await vscode.workspace.fs.stat(uri);
			return {
				status: 'draft',
				lastModified: stat.mtime,
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
		const uri = vscode.Uri.file(`${this.getWorkspacePath()}/${specDir}`);
		try {
			await vscode.workspace.fs.createDirectory(uri);
		} catch {
			// Directory may already exist
		}
	}

	private getWorkspacePath(): string {
		return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
	}

	/**
	 * Dispose resources.
	 */
	dispose(): void {
		this._onDidChangeState.dispose();
	}
}
