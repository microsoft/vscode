/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult, TokenUsage } from './types';

/**
 * Phases the moderniser progresses through. Each phase must be
 * approved by the developer before the next begins.
 */
export type ModerniserPhase =
	| 'analysis'
	| 'types'
	| 'tests'
	| 'refactoring'
	| 'documentation'
	| 'validation';

const PHASE_ORDER: ModerniserPhase[] = [
	'analysis',
	'types',
	'tests',
	'refactoring',
	'documentation',
	'validation',
];

const PHASE_LABELS: Record<ModerniserPhase, string> = {
	analysis: 'Analysis',
	types: 'Type Annotations',
	tests: 'Test Coverage',
	refactoring: 'Structural Refactoring',
	documentation: 'Documentation',
	validation: 'Validation',
};

/**
 * The Moderniser agent — a specialist pipeline for bringing legacy code
 * modules up to modern standards. Works in six sequential phases, each
 * requiring developer approval before proceeding.
 */
export class ModerniserAgent extends BaseAgent {
	private currentPhase: ModerniserPhase = 'analysis';
	private targetPath = '';

	protected getRoleDescription(): string {
		return [
			'You are the Moderniser agent for Son of Anton. Your role is to systematically',
			'bring legacy code modules up to modern standards. You work methodically, one',
			'phase at a time, and you never modify code without understanding it first.',
			'',
			'## Principles',
			'1. Understand before changing — analyse existing code thoroughly first.',
			'2. Preserve behaviour — every change must maintain existing functionality.',
			'3. One phase at a time — complete each phase before moving on.',
			'4. Test before refactoring — add tests as a safety net first.',
			'5. Document your understanding — generate documentation as you go.',
			'',
			'## Current Phase',
			`You are currently in the **${PHASE_LABELS[this.currentPhase]}** phase.`,
		].join('\n');
	}

	/**
	 * Handle a chat request for the moderniser.
	 * Supports the "modernise" command to start a new modernisation pipeline.
	 */
	async handleChatRequest(
		request: vscode.ChatRequest,
		chatContext: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
	): Promise<void> {
		const task = this.agentManager.createTask('Moderniser', request.prompt);
		this.agentManager.startTask(task.id);

		try {
			if (request.command === 'modernise' || request.command === 'modernize') {
				this.targetPath = request.prompt.trim();
				this.currentPhase = 'analysis';
				await this.runPhase(task.id, stream, token);
			} else if (request.command === 'next-phase') {
				await this.advancePhase(stream, task.id, token);
			} else if (request.command === 'phase-status') {
				this.showPhaseStatus(stream);
			} else {
				// Default: run current phase
				await this.runPhase(task.id, stream, token);
			}

			this.agentManager.completeTask(task.id);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
			stream.markdown(`\n\n**Error:** ${message}`);
		}
	}

	/**
	 * Run the current phase of the modernisation pipeline.
	 */
	private async runPhase(
		taskId: string,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
	): Promise<void> {
		stream.markdown(`## Phase: ${PHASE_LABELS[this.currentPhase]}\n\n`);
		stream.markdown(`Target: \`${this.targetPath || '(not set — specify a path)'}\`\n\n`);

		if (!this.targetPath) {
			stream.markdown('Specify the module path to modernise. Example:\n\n');
			stream.markdown('```\n@anton-moderniser /modernise src/legacy/billing/\n```\n');
			return;
		}

		const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
		const phasePrompt = this.buildPhasePrompt();

		await this.streamToChat(stream, this.defaultModel, systemPrompt, phasePrompt);

		stream.markdown('\n\n---\n\n');
		stream.markdown(`Phase **${PHASE_LABELS[this.currentPhase]}** complete. `);
		stream.markdown('Use `/next-phase` to proceed or refine the output.\n');
	}

	/**
	 * Build a phase-specific prompt that tells the LLM what to do.
	 */
	private buildPhasePrompt(): string {
		const base = `Modernise the module at: ${this.targetPath}\n\n`;

		switch (this.currentPhase) {
			case 'analysis':
				return base + [
					'Perform a thorough analysis of this module. Output a structured report with:',
					'1. Module summary (files, lines, language, test coverage, documentation)',
					'2. Dependency analysis (internal dependents, external deps, circular deps)',
					'3. Pattern analysis (async patterns, module system, global state, error handling)',
					'4. Risk assessment (HIGH / MEDIUM / LOW for each finding)',
					'5. Recommended modernisation order',
				].join('\n');

			case 'types':
				return base + [
					'Add TypeScript type annotations to this module without changing behaviour.',
					'1. Add type annotations to all function signatures',
					'2. Define interfaces and types for data structures',
					'3. Ensure the type checker passes',
					'4. Verify all callers still work',
				].join('\n');

			case 'tests':
				return base + [
					'Add test coverage that captures the module\'s current behaviour.',
					'1. Generate tests for each exported function (happy path, edge cases, errors)',
					'2. Use mocks for functions with side effects',
					'3. All tests must pass against the unmodified code',
					'4. Report coverage percentage',
				].join('\n');

			case 'refactoring':
				return base + [
					'With types and tests in place, perform structural refactoring.',
					'1. Break circular dependencies',
					'2. Migrate callbacks to async/await',
					'3. Replace deprecated dependencies',
					'4. Address global mutable state',
					'Run tests after each change.',
				].join('\n');

			case 'documentation':
				return base + [
					'Generate documentation for the modernised module.',
					'1. Add JSDoc/TSDoc comments to all exported functions and types',
					'2. Generate a module README',
					'3. Update project-level documentation',
				].join('\n');

			case 'validation':
				return base + [
					'Perform final validation.',
					'1. Run the full test suite',
					'2. Run security scan on all modified files',
					'3. Run the type checker on the full project',
					'4. Generate a modernisation summary',
				].join('\n');
		}
	}

	/**
	 * Advance to the next phase in the pipeline.
	 */
	private async advancePhase(
		stream: vscode.ChatResponseStream,
		taskId: string,
		token: vscode.CancellationToken,
	): Promise<void> {
		const currentIndex = PHASE_ORDER.indexOf(this.currentPhase);

		if (currentIndex >= PHASE_ORDER.length - 1) {
			stream.markdown('All modernisation phases are complete.\n');
			return;
		}

		this.currentPhase = PHASE_ORDER[currentIndex + 1];
		await this.runPhase(taskId, stream, token);
	}

	/**
	 * Show the current phase status.
	 */
	private showPhaseStatus(stream: vscode.ChatResponseStream): void {
		stream.markdown('## Modernisation Progress\n\n');
		stream.markdown(`Target: \`${this.targetPath || '(not set)'}\`\n\n`);

		const currentIndex = PHASE_ORDER.indexOf(this.currentPhase);

		for (let i = 0; i < PHASE_ORDER.length; i++) {
			const phase = PHASE_ORDER[i];
			const label = PHASE_LABELS[phase];

			if (i < currentIndex) {
				stream.markdown(`- [x] ${label}\n`);
			} else if (i === currentIndex) {
				stream.markdown(`- [ ] **${label}** ← current\n`);
			} else {
				stream.markdown(`- [ ] ${label}\n`);
			}
		}
	}

	/**
	 * Execute a subtask (used when invoked by the orchestrator).
	 */
	async execute(context: AgentContext): Promise<SubtaskResult> {
		this.targetPath = context.scopeFiles[0] ?? '';
		this.currentPhase = 'analysis';

		const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
		const phasePrompt = this.buildPhasePrompt();

		const { text, tokenUsage } = await this.callLlm(
			context.parentTaskId,
			this.defaultModel,
			systemPrompt,
			phasePrompt,
		);

		return {
			success: true,
			changes: [],
			summary: text,
			tokenUsage,
		};
	}
}
