/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Domain + Intent + Scope + Time Estimate classification taxonomy.
 *
 * Single source of truth for the domain, intent, and scope categories (derived from
 * clustering analysis) and time estimate dimensions.
 */

// ============================================================================
// INTENTS - What action the user wants
// ============================================================================

export const INTENT_DEFINITIONS = {
	explain: {
		description: 'Prompts asking the assistant to explain code, concepts, or technical topics. Includes requests for clarification, summaries, definitions, and step-by-step walkthroughs of implementations or workflows.',
		keywords: ['explanation', 'understanding', 'clarification', 'how-it-works', 'summary', 'definitions', 'step-by-step', 'guidance'],
	},
	find_content: {
		description: 'Prompts requesting the assistant to retrieve, read, or locate files, code references, definitions, and usage patterns within a codebase or project repository.',
		keywords: ['retrieve', 'read', 'file contents', 'search', 'references', 'codebase', 'locate', 'fetch'],
	},
	research: {
		description: 'Prompts requesting the assistant to research and investigate implementation details, usage patterns, and documentation of existing code or systems.',
		keywords: ['research', 'implementation details', 'documentation', 'usage patterns', 'investigation'],
	},
	review: {
		description: 'Prompts requesting code review, validation of implementations against requirements, analysis of code changes and quality, and identification of issues, vulnerabilities, and improvements. Covers both formal review feedback and structural/usage pattern analysis.',
		keywords: ['code review', 'validation', 'compliance', 'correctness', 'code quality', 'vulnerability analysis', 'code changes', 'feedback'],
	},
	generate_docs: {
		description: 'Prompts requesting the assistant to generate documentation, summary reports, and example or sample code.',
		keywords: ['documentation', 'generate', 'summary reports', 'example code', 'technical writing'],
	},
	troubleshoot_debug: {
		description: 'Prompts requesting help diagnosing and resolving failures, errors, bugs, and incidents. Includes troubleshooting build/code errors, root cause analysis, and investigation of test failures and operational incidents.',
		keywords: ['troubleshoot', 'debug', 'failure', 'error', 'root cause', 'fix', 'build errors', 'incidents', 'bugs'],
	},
	git_ops: {
		description: 'Prompts requesting help with Git branch operations including creating, switching, merging, rebasing branches, and resolving merge conflicts.',
		keywords: ['branch', 'merge', 'rebase', 'conflicts', 'commit', 'Git operations'],
	},
	run_code: {
		description: 'Prompts requesting the assistant to run, execute, or initiate code, scripts, commands, builds, or other defined processes.',
		keywords: ['execute', 'run', 'build', 'script', 'process', 'commands'],
	},
	config_mgmt: {
		description: 'Prompts requesting changes to application configuration, features, user interface design, or documentation, typically involving updates or modifications to existing settings and appearance.',
		keywords: ['configuration', 'feature updates', 'UI modification', 'settings', 'design changes'],
	},
	new_feature: {
		description: 'Prompts requesting the assistant to build a new user-facing feature or capability requiring coordinated code changes, typically spanning multiple files or components.',
		keywords: ['build', 'implement', 'add feature', 'create feature', 'set up', 'integrate', 'new capability'],
	},
	refactor: {
		description: 'Prompts requesting the assistant to restructure, reorganize, or improve existing code without changing its external behavior. Includes extracting functions, renaming, simplifying logic, and improving code organization.',
		keywords: ['refactor', 'restructure', 'reorganize', 'clean up', 'extract', 'simplify', 'rename', 'improve structure'],
	},
	data_analysis_viz: {
		description: 'Prompts requesting the assistant to analyze data, create visualizations, build charts or graphs, run queries, or explore datasets for insights and reporting.',
		keywords: ['data analysis', 'visualization', 'charts', 'graphs', 'querying', 'reporting', 'dashboards', 'data exploration'],
	},
	need_info: {
		description: 'Not enough information to determine the intent. The prompt may be too short, too vague, or lack sufficient context to make a determination.',
		keywords: [],
	},
	other: {
		description: 'Prompts whose intent does not fit into any of the defined categories. These may involve niche actions or mixed intents outside the taxonomy.',
		keywords: [],
	},
} as const satisfies Record<string, CategoryDefinition>;

// ============================================================================
// DOMAINS - What area of code/system (orthogonal to intents)
// ============================================================================

export const DOMAIN_DEFINITIONS = {
	cicd_cloud_infra: {
		description: 'Prompts involving continuous integration/deployment pipeline configuration, cloud infrastructure provisioning and automation, container orchestration, and infrastructure-as-code workflows.',
		keywords: ['CI/CD', 'build automation', 'deployment pipelines', 'cloud infrastructure', 'provisioning', 'IaC', 'containerization', 'configuration management', 'DevOps'],
	},
	cli_scripting: {
		description: 'Prompts focused on building, customizing, and automating command-line interface tools, shell scripts, and terminal workflows for developer productivity.',
		keywords: ['CLI', 'command-line', 'shell scripting', 'bash', 'PowerShell', 'terminal', 'task automation'],
	},
	automated_testing: {
		description: 'Prompts focused on automated software testing tools, frameworks, and suites spanning unit, integration, and end-to-end testing, including test coverage and workflow analysis.',
		keywords: ['automated testing', 'unit testing', 'integration testing', 'end-to-end testing', 'test frameworks', 'test suites', 'test coverage'],
	},
	ai_agent: {
		description: 'Prompts focused on designing, configuring, and orchestrating AI agents and coding assistants, including their workflows, integration architectures, and framework capabilities.',
		keywords: ['AI agents', 'orchestration', 'workflow automation', 'integration architecture', 'coding assistants', 'LLM integration', 'MCP'],
	},
	network_infra: {
		description: 'Prompts focused on configuring, deploying, and managing network infrastructure, including remote access, multi-server environments, and network security.',
		keywords: ['network configuration', 'server management', 'remote access', 'firewall', 'DNS', 'VPN', 'load balancing', 'routing', 'connectivity'],
	},
	project_mgmt: {
		description: 'Prompts related to project management, issue tracking, and task management within development workflows.',
		keywords: ['issue tracking', 'project management', 'task management', 'workflow management', 'project planning'],
	},
	data_pipelines: {
		description: 'Prompts focused on building, configuring, and orchestrating data processing pipelines that handle ingestion, transformation, and formatting of structured data across various file formats and scales.',
		keywords: ['data pipelines', 'ETL workflows', 'data transformation', 'file processing', 'pipeline orchestration', 'ingestion'],
	},
	web_ui: {
		description: 'Prompts focused on designing, building, and architecting user interface components and layouts for web application frontends.',
		keywords: ['UI', 'web application', 'user interface', 'frontend', 'components', 'layout', 'styling', 'responsive design'],
	},
	backend_dev: {
		description: 'Prompts focused on building, designing, and maintaining server-side applications, APIs, business logic, authentication, and service architectures.',
		keywords: ['API', 'server', 'endpoint', 'REST', 'GraphQL', 'backend', 'microservices', 'authentication', 'business logic'],
	},
	game_dev: {
		description: 'Prompts focused on designing, building, and testing the architecture, mechanics, and subsystems of digital and tabletop games.',
		keywords: ['game development', 'game engine', 'game mechanics', 'rendering', 'multiplayer', 'interactive gameplay', 'asset creation'],
	},
	package_mgmt: {
		description: 'Prompts focused on managing software dependencies, package installations, version control of libraries, and release workflows across programming languages and platforms.',
		keywords: ['dependency management', 'package managers', 'version management', 'software releases', 'dependency resolution'],
	},
	version_control: {
		description: 'Prompts related to managing source code repositories, version control systems, branching and merging strategies, and collaborative development workflows.',
		keywords: ['source code', 'repository', 'version control', 'Git', 'branching', 'merging', 'code management'],
	},
	incident_mgmt: {
		description: 'Prompts focused on building, integrating, and querying incident management systems for tracking, triaging, investigating, and resolving operational and security incidents.',
		keywords: ['incident management', 'security incidents', 'ticketing systems', 'workflow automation', 'incident response', 'triage'],
	},
	logging_observability: {
		description: 'Prompts focused on designing, configuring, querying, and analyzing application and system logs, including logging frameworks, log aggregation, monitoring dashboards, and observability infrastructure.',
		keywords: ['logging', 'log analysis', 'monitoring', 'observability', 'metrics', 'alerting', 'tracing', 'dashboards'],
	},
	database_mgmt: {
		description: 'Prompts focused on designing, analyzing, managing, and querying relational database schemas, including data modeling for business intelligence and data warehouse contexts.',
		keywords: ['database schema', 'relational database', 'data modeling', 'query design', 'schema management', 'SQL'],
	},
	ml_statistics: {
		description: 'Prompts focused on machine learning model development, training, evaluation, and deployment, as well as statistical analysis, data science workflows, and mathematical modeling.',
		keywords: ['machine learning', 'deep learning', 'neural networks', 'model training', 'statistics', 'regression', 'classification', 'data science', 'feature engineering', 'model evaluation'],
	},
	need_info: {
		description: 'Not enough information to determine the domain. The prompt may be too short, too vague, or lack sufficient context to make a determination.',
		keywords: [],
	},
	other: {
		description: 'Prompts that do not fit into any of the defined domain categories. These may involve niche or specialized topics outside the taxonomy.',
		keywords: [],
	},
} as const satisfies Record<string, CategoryDefinition>;

// ============================================================================
// SCOPES - What code context is needed
// ============================================================================

export const SCOPE_DEFINITIONS = {
	// File-level scopes
	selection: {
		description: 'Operates on user\'s currently selected/highlighted code',
		signals: ['user has active selection', 'uses "this"'],
	},
	current_file: {
		description: 'Entire file user is currently viewing/editing',
		signals: ['"this file"', 'mentions filename', 'file-level operation'],
	},
	few_files: {
		description: 'Small set of related files (2-5 files)',
		signals: ['"this component and its tests"', 'specific file mentions'],
	},
	many_files: {
		description: 'Large set of files or entire module/package',
		signals: ['"all components"', '"entire module"', '"across files"'],
	},

	// Repository scopes
	codebase: {
		description: 'Entire project/codebase understanding required',
		signals: ['"project"', '"codebase"', '"application"', '"system"', 'architecture-level'],
	},
	multi_repository: {
		description: 'Operates across multiple repositories (microservices, monorepo packages)',
		signals: ['"other repo"', '"microservice"', '"shared library"', 'cross-repo dependency', 'multi-package'],
	},

	// External scopes
	scm_operations: {
		description: 'Git operations, branch management, PR creation',
		signals: ['git commands', 'branch', 'PR', 'merge', 'rebase', 'git history', 'cherry-pick', 'git push', 'git pull', 'git fetch', 'git commit', 'git diff', 'git stash'],
	},
	issue_tracker: {
		description: 'Operates on issue tracking systems (GitHub Issues, JIRA, Linear)',
		signals: ['issue', 'bug', 'ticket', 'backlog', 'sprint', 'tracking system'],
	},
	remote_service: {
		description: 'Interacts with external services, APIs, cloud resources, or remote databases',
		signals: ['external API', 'cloud service', 'SaaS', 'third-party', 'webhook', 'staging database', 'production database', 'remote connection', 'SSH'],
	},
	external: {
		description: 'Requires knowledge outside the codebase (docs, web, general knowledge)',
		signals: ['questions about languages', 'frameworks', 'best practices', '"how to" (general)'],
	},

	// Transient
	ephemeral: {
		description: 'One-off task, doesn\'t directly modify main codebase',
		signals: ['"write a script to"', '"analyze this data"', 'temporary/throwaway work'],
	},
	unknown_scope: {
		description: 'Scope cannot be determined from message',
		signals: [],
	},
} as const satisfies Record<string, CategoryDefinition>;

// ============================================================================
// Shared types and utilities
// ============================================================================

interface CategoryDefinition {
	description: string;
	keywords?: readonly string[];
	examples?: readonly string[];
	signals?: readonly string[];
	notes?: string;
}

/** Extract keys as union type */
export type PromptIntent = keyof typeof INTENT_DEFINITIONS;
export type PromptDomain = keyof typeof DOMAIN_DEFINITIONS;
export type PromptScope = keyof typeof SCOPE_DEFINITIONS;

/** Validation sets - derived from definitions */
export const VALID_INTENTS = new Set(Object.keys(INTENT_DEFINITIONS)) as ReadonlySet<PromptIntent>;
export const VALID_DOMAINS = new Set(Object.keys(DOMAIN_DEFINITIONS)) as ReadonlySet<PromptDomain>;
export const VALID_SCOPES = new Set(Object.keys(SCOPE_DEFINITIONS)) as ReadonlySet<PromptScope>;

/** Type guards */
export function isValidIntent(value: string): value is PromptIntent {
	return VALID_INTENTS.has(value as PromptIntent);
}
export function isValidDomain(value: string): value is PromptDomain {
	return VALID_DOMAINS.has(value as PromptDomain);
}
export function isValidScope(value: string): value is PromptScope {
	return VALID_SCOPES.has(value as PromptScope);
}

/**
 * The classification result structure
 */
export interface PromptClassification {
	intent: PromptIntent;
	domain: PromptDomain;
	timeEstimate: {
		/** ISO 8601 duration for best case scenario, e.g., "PT5M" for 5 minutes */
		bestCase: string;
		/** ISO 8601 duration for realistic scenario, e.g., "PT15M" for 15 minutes */
		realistic: string;
	};
	scope: PromptScope;
	/** Confidence score between 0.0 and 1.0 */
	confidence: number;
	/** Brief reasoning for the classification */
	reasoning: string;
}

// ============================================================================
// Prompt generation helpers
// ============================================================================

function formatCategoryForPrompt(key: string, def: CategoryDefinition): string {
	const parts = [`### \`${key}\``, def.description];

	if (def.keywords?.length) {
		parts.push(`- Keywords: ${def.keywords.join(', ')}`);
	}
	if (def.signals?.length) {
		parts.push(`- Signals: ${def.signals.join(', ')}`);
	}
	if (def.examples?.length) {
		parts.push(`Examples: ${def.examples.map(e => `"${e}"`).join(', ')}`);
	}
	if (def.notes) {
		parts.push(def.notes);
	}

	return parts.join('\n');
}

/** Generate prompt section for intents */
export function generateIntentPromptSection(): string {
	const header = '## Intent Categories\n';
	const categories = Object.entries(INTENT_DEFINITIONS)
		.map(([key, def]) => formatCategoryForPrompt(key, def))
		.join('\n\n');
	return header + categories;
}

/** Generate prompt section for domains */
export function generateDomainPromptSection(): string {
	const header = '## Domain Categories\n';
	const categories = Object.entries(DOMAIN_DEFINITIONS)
		.map(([key, def]) => formatCategoryForPrompt(key, def))
		.join('\n\n');
	return header + categories;
}

/** Generate prompt section for scopes */
export function generateScopePromptSection(): string {
	const header = '# SCOPE - What code context is needed (choose ONE)\n';
	const categories = Object.entries(SCOPE_DEFINITIONS)
		.map(([key, def]) => formatCategoryForPrompt(key, def))
		.join('\n\n');
	return header + categories;
}

/** Classification guidance for the LLM */
const CLASSIFICATION_GUIDANCE = `# CLASSIFICATION GUIDANCE

## Domain vs Intent — these are separate dimensions

Domain and intent are independent. Classify each on its own merits. Do NOT substitute one for the other.

**Domain** is the technical subject area or problem space the user is operating in.
- It describes a system, architecture, technology area, or problem space — never an activity.
- Think of it as answering: "What area of technology is this about?"
- If the prompt does not clearly indicate a technical domain, use \`need_info\`.

**Intent** is the developer action or goal being performed within that domain.
- It describes what the user is trying to accomplish — the verb, not the noun.
- Think of it as answering: "What is the user trying to do?"
- If the prompt does not clearly indicate an intent, use \`need_info\`.

**Key rule**: A prompt about CI/CD pipelines (domain) might be asking for an explanation (intent), troubleshooting (intent), or code review (intent). Classify each dimension independently. Never let the domain influence your intent classification or vice versa.

Focus on semantic meaning, not keyword matching. Keywords are illustrative, not exhaustive.

## Pre-classification check
1. **What technical area does this fall into?** Match to the most specific domain category.
2. **If multiple domains apply**, choose the primary one — the domain that best captures what the user is actually trying to accomplish.
3. **What is the user trying to do?** Match to the most specific intent category.
4. **If multiple intents apply**, choose the primary one — the intent that best captures the user's goal.`;

/** Generate full taxonomy prompt */
export function generateTaxonomyPrompt(): string {
	return [
		CLASSIFICATION_GUIDANCE,
		generateDomainPromptSection(),
		generateIntentPromptSection(),
		'# TIME ESTIMATE',
		'Estimate how long an **experienced developer familiar with the codebase** would take:',
		'- Consider: understanding requirements, writing code, testing, debugging, code review',
		'- Format: ISO 8601 duration (e.g., "PT5M" for 5 minutes, "PT1H30M" for 1.5 hours)',
		'- Provide both "bestCase" (everything goes smoothly) and "realistic" (typical complications)',
		'',
		generateScopePromptSection(),
	].join('\n\n');
}

// ============================================================================
// Tool calling schema for structured output
// ============================================================================

/** Tool name for prompt categorization */
export const CATEGORIZE_PROMPT_TOOL_NAME = 'categorize_prompt';

/** JSON Schema for the categorize_prompt tool parameters */
export const CATEGORIZE_PROMPT_TOOL_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		intent: {
			type: 'string',
			enum: Object.keys(INTENT_DEFINITIONS),
			description: 'The primary action the user wants to perform'
		},
		domain: {
			type: 'string',
			enum: Object.keys(DOMAIN_DEFINITIONS),
			description: 'The area of code or system the request relates to'
		},
		scope: {
			type: 'string',
			enum: Object.keys(SCOPE_DEFINITIONS),
			description: 'The code context required to fulfill the request'
		},
		timeEstimate: {
			type: 'object',
			additionalProperties: false,
			properties: {
				bestCase: {
					type: 'string',
					description: 'ISO 8601 duration for best case scenario (e.g., "PT5M" for 5 minutes)'
				},
				realistic: {
					type: 'string',
					description: 'ISO 8601 duration for realistic scenario (e.g., "PT15M" for 15 minutes)'
				}
			},
			required: ['bestCase', 'realistic']
		},
		confidence: {
			type: 'number',
			minimum: 0,
			maximum: 1,
			description: 'Confidence score between 0.0 and 1.0'
		},
		reasoning: {
			type: 'string',
			description: 'Brief 1-2 sentence explanation for the classification'
		}
	},
	required: ['intent', 'domain', 'scope', 'timeEstimate', 'confidence', 'reasoning']
} as const;
