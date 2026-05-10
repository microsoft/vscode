/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigStore, MementoStore, ProjectContextProvider } from '../host';
import { LlmClient, type ModelId } from '../llm/LlmClient';
import { ModelRouter } from '../llm/ModelRouter';
import { PromptCacheOptimizer } from '../llm/PromptCacheOptimizer';
import { McpClient } from '../mcp/McpClient';
import type { ToolExecutionContext } from '../tools/types';
import { AgentManager } from './AgentManager';
import { BaseAgent } from './BaseAgent';
import { CiRetryAgent } from './CiRetryAgent';
import { CodeGeneratorAgent } from './CodeGeneratorAgent';
import { DocumentationAgent } from './DocumentationAgent';
import { E2eTestAgent } from './E2eTestAgent';
import { MetricsTracker } from './MetricsTracker';
import { ModerniserAgent } from './ModerniserAgent';
import { OrchestratorAgent } from './OrchestratorAgent';
import { PrGenerationAgent } from './PrGenerationAgent';
import { ProjectMemory } from './ProjectMemory';
import { ReviewAgent } from './ReviewAgent';
import { SecurityScannerAgent } from './SecurityScannerAgent';
import { SpecialistMemory } from './SpecialistMemory';
import { TestWriterAgent } from './TestWriterAgent';
import { AgentConfig, AgentHandle } from './types';

/**
 * Default configuration for every specialist that participates in the agent stack.
 * Kept here (and not exported) so the chat-participant registrar and any other
 * consumers reference identical metadata without cross-importing.
 */
const AGENT_CONFIGS: AgentConfig[] = [
	{
		handle: 'anton',
		displayName: 'Anton',
		description: 'AI orchestrator — routes requests to specialist agents',
		defaultModel: 'opus',
		maxRetries: 3,
		slashCommands: [
			{ name: 'plan', description: 'Create an execution plan for a request' },
			{ name: 'approve', description: 'Approve and execute the current plan' },
			{ name: 'status', description: 'Show status of active agents' },
			{ name: 'metrics', description: 'Show agent performance metrics' },
		],
	},
	{
		handle: 'anton-code',
		displayName: 'Anton Code',
		description: 'Code generation specialist — writes and modifies code',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'generate', description: 'Generate code for a specific task' },
			{ name: 'refactor', description: 'Refactor existing code' },
		],
	},
	{
		handle: 'anton-test',
		displayName: 'Anton Test',
		description: 'Test writing specialist — generates comprehensive tests',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'test', description: 'Generate tests for specified code' },
			{ name: 'coverage', description: 'Analyse test coverage gaps' },
		],
	},
	{
		handle: 'anton-security',
		displayName: 'Anton Security',
		description: 'Security analysis specialist — scans for vulnerabilities',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'scan', description: 'Scan code for security vulnerabilities' },
			{ name: 'audit', description: 'Full security audit of changed files' },
		],
	},
	{
		handle: 'anton-docs',
		displayName: 'Anton Docs',
		description: 'Documentation specialist — generates and updates docs',
		defaultModel: 'haiku',
		maxRetries: 3,
		slashCommands: [
			{ name: 'document', description: 'Generate documentation for code' },
			{ name: 'changelog', description: 'Generate a changelog entry' },
		],
	},
	{
		handle: 'anton-e2e',
		displayName: 'Anton E2E',
		description: 'E2E test specialist — generates browser-based end-to-end tests',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'e2e', description: 'Generate E2E tests for user flows' },
			{ name: 'visual', description: 'Run visual regression tests' },
		],
	},
	{
		handle: 'anton-ci',
		displayName: 'Anton CI',
		description: 'CI/CD specialist — monitors pipelines and fixes failures',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'ci-status', description: 'Check CI pipeline status' },
			{ name: 'ci-fix', description: 'Analyse and fix CI failures' },
		],
	},
	{
		handle: 'anton-pr',
		displayName: 'Anton PR',
		description: 'PR generation specialist — creates merge-ready pull requests',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'pr', description: 'Generate a pull request for changes' },
		],
	},
	{
		handle: 'anton-moderniser',
		displayName: 'Anton Moderniser',
		description: 'Legacy code modernisation specialist — systematically brings old code up to standard',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'modernise', description: 'Start modernising a legacy module' },
			{ name: 'modernize', description: 'Start modernising a legacy module (US spelling)' },
			{ name: 'next-phase', description: 'Advance to the next modernisation phase' },
			{ name: 'phase-status', description: 'Show modernisation progress' },
		],
	},
];

/**
 * Ordered list of `[config, agent]` pairs the chat-participant registrar walks
 * to build VS Code chat participants. Includes the orchestrator first so its
 * slash commands appear at the top of the participant menu.
 */
export interface AgentRegistration {
	readonly config: AgentConfig;
	readonly agent: BaseAgent;
}

/**
 * The fully-built agent layer. Both the chat-participant registrar and the
 * webview AgentBridge consume the same stack so we never instantiate the
 * specialists, MetricsTracker, or ProjectMemory twice per session.
 */
export interface AgentStack {
	readonly orchestrator: OrchestratorAgent;
	readonly specialists: ReadonlyMap<AgentHandle, BaseAgent>;
	readonly registrations: readonly AgentRegistration[];
	readonly metricsTracker: MetricsTracker;
	readonly projectMemory: ProjectMemory;
	readonly specialistMemory: SpecialistMemory;
	/**
	 * Optional. Surfaces the per-process prompt-cache metrics collected via
	 * `LlmClient` so hosts (CLI `sota traces`, IDE "Show Harness Stats") can
	 * render `formatSummary()` without instantiating their own optimizer.
	 *
	 * Currently the factory does not wire metric ingestion into this instance —
	 * BaseAgent records cache hits via its own collaborators today — so the
	 * value is mostly useful as a stable "where would I read these stats" hook
	 * for harness phase H16. A future pass should route LlmClient cache events
	 * through this instance so the snapshot is non-empty at runtime.
	 */
	readonly cacheOptimizer: PromptCacheOptimizer;
	/**
	 * Optional. Surfaces the per-process model-router state (routing rules,
	 * active A/B experiments, task analysis) so hosts can render
	 * `formatSummary()` without instantiating their own router.
	 *
	 * Same caveat as `cacheOptimizer`: today BaseAgent's escalation ladder
	 * uses an ad-hoc `new ModelRouter()` for stateless lookups, so the
	 * snapshot exposed here only contains the default routing rules unless a
	 * caller has fed trials into it. Centralising router state on the stack
	 * is tracked for a follow-up phase.
	 */
	readonly modelRouter: ModelRouter;
	dispose(): void;
}

/**
 * Build the canonical agent stack used by every chat surface.
 *
 * The factory owns long-lived collaborators (MetricsTracker, ProjectMemory)
 * and the specialist agent instances. Disposal flushes metrics so we don't
 * lose recorded invocations across an editor restart.
 */
export function createAgentStack(deps: {
	llmClient: LlmClient;
	mcpClient: McpClient;
	agentManager: AgentManager;
	globalState: MementoStore;
	workspaceRoot: string | undefined;
	/**
	 * Optional. When supplied, the value is forwarded into every specialist's
	 * `BaseAgent` constructor so `buildSystemPrompt` can inject the
	 * "Project Context" section. Hosts without a workspace concept omit this.
	 */
	projectContext?: ProjectContextProvider;
	/**
	 * Optional. When supplied, specialists that opt in (currently
	 * `CodeGeneratorAgent`) drive the H1 native tool-use loop against this
	 * execution surface instead of falling back to the legacy text-extraction
	 * path. The CLI host wires this through `cliHost.ts`; the IDE wires it
	 * separately so it can layer its existing approval-gate flow over the
	 * raw read/write/run primitives.
	 */
	toolExecutionContext?: ToolExecutionContext;
	/**
	 * Optional. When supplied, the factory consults
	 * `configStore.get<string>('sota.agents.<handle>.model')` for each
	 * specialist and overrides the hardcoded `AgentConfig.defaultModel`
	 * when a value is set. Lets users assign different models to
	 * different agents (e.g. anton-code → opus, anton-docs → haiku) via
	 * VS Code settings without code changes. Reads happen at
	 * construction time — settings changes require an extension reload
	 * to take effect (the agent stack is owned by the activation
	 * lifecycle).
	 */
	configStore?: ConfigStore;
}): AgentStack {
	const { llmClient, mcpClient, agentManager, globalState, workspaceRoot, projectContext, toolExecutionContext, configStore } = deps;
	const metricsTracker = new MetricsTracker();
	// H16 — surface a single PromptCacheOptimizer + ModelRouter on the stack
	// so the CLI (`sota traces`) and IDE ("Show Harness Stats" palette command)
	// have a stable read-side handle for `formatSummary()`. The optimizer is
	// also attached to the LlmClient via `setCacheOptimizer` so every
	// `complete` event records cache-creation / cache-read tokens through it,
	// lighting up the trace panes with real in-process numbers. The router is
	// passed through to BaseAgent constructors so the H7 escalation lookup
	// reuses one instance per session.
	const cacheOptimizer = new PromptCacheOptimizer();
	const modelRouter = new ModelRouter();
	llmClient.setCacheOptimizer(cacheOptimizer);
	const projectMemory = new ProjectMemory();
	projectMemory.setWorkspaceRoot(workspaceRoot);
	const specialistMemory = new SpecialistMemory(globalState);

	// Memory loads from disk best-effort; failures must not abort activation.
	projectMemory.loadMemory().catch(err => {
		console.warn('Failed to load project memory:', err);
	});

	const configs = new Map(AGENT_CONFIGS.map(c => [c.handle, c]));
	const requireConfig = (handle: AgentHandle): AgentConfig => {
		const config = configs.get(handle);
		if (!config) {
			throw new Error(`Missing AgentConfig for handle "${handle}"`);
		}
		// Per-agent model override (`sota.agents.<handle>.model`). When set,
		// rewrites the config's `defaultModel` so the specialist's
		// runChatTurn / runAgenticTurn / execute paths route through the
		// user-chosen model on every turn unless the chat composer's
		// per-turn picker overrides further. Empty / missing settings fall
		// back to the AgentConfig default. Validation happens at the
		// LlmClient boundary — an unknown ModelId errors at request time
		// rather than silently downgrading at activation.
		const override = configStore?.get<string>(`sota.agents.${handle}.model`);
		if (typeof override === 'string' && override.trim().length > 0) {
			return { ...config, defaultModel: override.trim() as ModelId };
		}
		return config;
	};

	const codeAgent = new CodeGeneratorAgent(
		requireConfig('anton-code'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const testAgent = new TestWriterAgent(
		requireConfig('anton-test'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const securityAgent = new SecurityScannerAgent(
		requireConfig('anton-security'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const docsAgent = new DocumentationAgent(
		requireConfig('anton-docs'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const e2eTestAgent = new E2eTestAgent(
		requireConfig('anton-e2e'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const ciRetryAgent = new CiRetryAgent(
		requireConfig('anton-ci'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const prGenerationAgent = new PrGenerationAgent(
		requireConfig('anton-pr'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const moderniserAgent = new ModerniserAgent(
		requireConfig('anton-moderniser'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	// The review agent has its own identity for metrics/clarity, defined inline
	// because it isn't surfaced as a chat participant in its own right.
	const reviewAgent = new ReviewAgent(
		{
			handle: 'anton-review',
			displayName: 'Anton Review',
			description: 'Code quality and review specialist',
			defaultModel: 'sonnet',
			maxRetries: 3,
			slashCommands: [],
		},
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	const orchestrator = new OrchestratorAgent(
		requireConfig('anton'),
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory, specialistMemory, undefined, projectContext, toolExecutionContext, modelRouter,
	);

	orchestrator.registerSpecialist(codeAgent);
	orchestrator.registerSpecialist(testAgent);
	orchestrator.registerSpecialist(e2eTestAgent);
	orchestrator.registerSpecialist(securityAgent);
	orchestrator.registerSpecialist(docsAgent);
	orchestrator.registerSpecialist(ciRetryAgent);
	orchestrator.registerSpecialist(prGenerationAgent);
	orchestrator.registerSpecialist(moderniserAgent);
	orchestrator.setReviewAgent(reviewAgent);

	const specialists = new Map<AgentHandle, BaseAgent>([
		['anton-code', codeAgent],
		['anton-test', testAgent],
		['anton-security', securityAgent],
		['anton-docs', docsAgent],
		['anton-e2e', e2eTestAgent],
		['anton-ci', ciRetryAgent],
		['anton-pr', prGenerationAgent],
		['anton-moderniser', moderniserAgent],
	]);

	const registrations: AgentRegistration[] = [
		{ config: requireConfig('anton'), agent: orchestrator },
		{ config: requireConfig('anton-code'), agent: codeAgent },
		{ config: requireConfig('anton-test'), agent: testAgent },
		{ config: requireConfig('anton-security'), agent: securityAgent },
		{ config: requireConfig('anton-docs'), agent: docsAgent },
		{ config: requireConfig('anton-e2e'), agent: e2eTestAgent },
		{ config: requireConfig('anton-ci'), agent: ciRetryAgent },
		{ config: requireConfig('anton-pr'), agent: prGenerationAgent },
		{ config: requireConfig('anton-moderniser'), agent: moderniserAgent },
	];

	return {
		orchestrator,
		specialists,
		registrations,
		metricsTracker,
		projectMemory,
		specialistMemory,
		cacheOptimizer,
		modelRouter,
		dispose(): void {
			specialistMemory.dispose();
			metricsTracker.persistMetrics(workspaceRoot).catch(err => {
				console.warn('Failed to persist metrics:', err);
			});
		},
	};
}
