/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type RepoctxEvidenceStageId = 'context' | 'impact' | 'review' | 'gate' | 'audit';

export type RepoctxStageState = 'available' | 'running' | 'failed' | 'needs-request' | 'ready';

export type RepoctxGateToolId = 'tieline' | 'bouncer' | 'aiglare';

export type RepoctxGateToolEvidenceStatus = 'pass' | 'warn' | 'fail';

export interface IRepoctxGateToolEvidence {
	readonly status: RepoctxGateToolEvidenceStatus;
	readonly summary: string;
}

export type RepoctxGateEvidence = Partial<Record<RepoctxGateToolId, IRepoctxGateToolEvidence>>;

export const repoctxAgentContextEnabledSetting = 'repoctx.agentContext.enabled';

export interface IRepoctxStageStateOptions {
	readonly artifactPath: string | undefined;
	readonly isRunning: boolean;
	readonly hasFailed: boolean;
	readonly requiresTask: boolean;
	readonly hasTask: boolean;
}

export interface IRepoctxEvidenceStage {
	readonly id: RepoctxEvidenceStageId;
	readonly artifactPaths: readonly string[];
}

export type RepoctxEvidence = Record<RepoctxEvidenceStageId, string | undefined>;

export interface IRepoctxAgentContextOptions {
	readonly repositoryName: string;
	readonly evidencePaths: RepoctxEvidence;
	readonly indexContent?: string;
}

export interface IRepoctxStageInvocation {
	readonly stageId: RepoctxEvidenceStageId;
	readonly title: string;
	readonly args: readonly string[];
	readonly artifactPath: string;
}

export const repoctxEvidenceStages: readonly IRepoctxEvidenceStage[] = [
	{
		id: 'context',
		artifactPaths: ['context-pack.md', 'context.json', 'index.json', 'report.md', 'harness.md'],
	},
	{
		id: 'impact',
		artifactPaths: ['impact.md', 'impact.json'],
	},
	{
		id: 'review',
		artifactPaths: ['pr-review.md', 'review.md', 'review.json'],
	},
	{
		id: 'gate',
		artifactPaths: ['gate.md', 'gate.json', 'pass.md', 'pass.json'],
	},
	{
		id: 'audit',
		artifactPaths: ['convergence.md', 'convergence.json', 'audit-ledger.md', 'audit-ledger.json'],
	},
];

export function getRepoctxStageState(options: IRepoctxStageStateOptions): RepoctxStageState {
	if (options.isRunning) {
		return 'running';
	}

	if (options.artifactPath) {
		return 'available';
	}

	if (options.hasFailed) {
		return 'failed';
	}

	if (options.requiresTask && !options.hasTask) {
		return 'needs-request';
	}

	return 'ready';
}

export async function findRepoctxEvidence(exists: (relativePath: string) => Promise<boolean>): Promise<RepoctxEvidence> {
	const entries = await Promise.all(repoctxEvidenceStages.map(async stage => {
		for (const artifactPath of stage.artifactPaths) {
			if (await exists(artifactPath)) {
				return [stage.id, artifactPath] as const;
			}
		}

		return [stage.id, undefined] as const;
	}));

	return Object.fromEntries(entries) as RepoctxEvidence;
}

const gateToolByCheckName: Readonly<Record<string, RepoctxGateToolId>> = {
	'Contract drift': 'tieline',
	'Compliance controls': 'bouncer',
	'AI governance': 'aiglare',
};

export function parseRepoctxGateEvidence(content: string): RepoctxGateEvidence {
	try {
		const parsed = JSON.parse(content) as { readonly checks?: readonly { readonly name?: unknown; readonly status?: unknown; readonly summary?: unknown }[] };
		if (Array.isArray(parsed.checks)) {
			return parseRepoctxGateChecks(parsed.checks);
		}
	} catch {
		// The durable default is Markdown. Fall through to its headings.
	}

	const checks: { readonly name: string; readonly status: string; readonly summary: string }[] = [];
	for (const section of content.split(/^###\s+/m).slice(1)) {
		const [heading = '', ...body] = section.split(/\r?\n/);
		const match = /^(PASS|WARN|FAIL)\s+·\s+(.+?)\s*$/.exec(heading);
		if (!match) {
			continue;
		}
		checks.push({
			status: match[1],
			name: match[2],
			summary: body.map(line => line.trim()).find(Boolean) ?? '',
		});
	}

	return parseRepoctxGateChecks(checks);
}

function parseRepoctxGateChecks(checks: readonly { readonly name?: unknown; readonly status?: unknown; readonly summary?: unknown }[]): RepoctxGateEvidence {
	const evidence: RepoctxGateEvidence = {};
	for (const check of checks) {
		if (typeof check.name !== 'string' || typeof check.status !== 'string') {
			continue;
		}
		const toolId = gateToolByCheckName[check.name];
		const status = check.status.toLowerCase();
		if (!toolId || (status !== 'pass' && status !== 'warn' && status !== 'fail')) {
			continue;
		}
		evidence[toolId] = {
			status,
			summary: typeof check.summary === 'string' ? check.summary : '',
		};
	}
	return evidence;
}

export function buildRepoctxAgentContext(options: IRepoctxAgentContextOptions): string | undefined {
	if (!options.evidencePaths.context) {
		return undefined;
	}

	const index = parseRepoctxIndex(options.indexContent);
	const repositoryName = index.repositoryName ?? options.repositoryName;
	const repositoryAttributes = [
		`name="${escapeXml(repositoryName)}"`,
		index.sourceFileCount === undefined ? undefined : `sourceFiles="${index.sourceFileCount}"`,
	].filter((attribute): attribute is string => Boolean(attribute));
	const lines = [
		'<repoctx_context>',
		'This repository context is provided automatically by Repoctx IDE.',
		`<repository ${repositoryAttributes.join(' ')}>`,
	];

	if (index.generatedAt) {
		lines.push(`<generatedAt>${escapeXml(index.generatedAt)}</generatedAt>`);
	}
	if (index.languages.length > 0) {
		lines.push(`<languages>${escapeXml(index.languages.join(', '))}</languages>`);
	}
	if (index.domains.length > 0) {
		lines.push(`<domains>${escapeXml(index.domains.join(', '))}</domains>`);
	}
	if (index.entrypoints.length > 0) {
		lines.push(`<entrypoints>${escapeXml(index.entrypoints.join(', '))}</entrypoints>`);
	}
	lines.push('</repository>', '<evidence>');

	for (const stage of repoctxEvidenceStages) {
		const path = options.evidencePaths[stage.id];
		if (path) {
			lines.push(`<file stage="${stage.id}">${escapeXml(path)}</file>`);
		}
	}

	lines.push(
		'</evidence>',
		'<workflow>',
		'Read the Context evidence before planning or editing. Load only the deeper evidence needed for the current task.',
		'Treat Impact as a lead and verify it against source ownership and the actual diff. Use Review, Gate, and Audit evidence when deciding merge readiness.',
		'Do not present model output as verified evidence without deterministic checks and human review.',
		'</workflow>',
		'</repoctx_context>',
	);

	return lines.join('\n');
}

interface IRepoctxIndexSummary {
	readonly repositoryName: string | undefined;
	readonly generatedAt: string | undefined;
	readonly sourceFileCount: number | undefined;
	readonly languages: readonly string[];
	readonly domains: readonly string[];
	readonly entrypoints: readonly string[];
}

function parseRepoctxIndex(content: string | undefined): IRepoctxIndexSummary {
	const empty: IRepoctxIndexSummary = {
		repositoryName: undefined,
		generatedAt: undefined,
		sourceFileCount: undefined,
		languages: [],
		domains: [],
		entrypoints: [],
	};
	if (!content) {
		return empty;
	}

	try {
		const index = asRecord(JSON.parse(content));
		const map = asRecord(index?.map);
		const repo = asRecord(map?.repo);
		return {
			repositoryName: asString(repo?.name),
			generatedAt: asString(index?.generatedAt),
			sourceFileCount: asNumber(repo?.sourceFileCount),
			languages: asRecordArray(repo?.languages).map(language => asString(language.language)).filter((language): language is string => Boolean(language)).slice(0, 3),
			domains: asRecordArray(map?.domains).map(domain => asString(domain.name)).filter((domain): domain is string => Boolean(domain)).slice(0, 5),
			entrypoints: asStringArray(repo?.entrypoints).slice(0, 3),
		};
	} catch {
		return empty;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asRecordArray(value: unknown): readonly Record<string, unknown>[] {
	return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry)) : [];
}

function asStringArray(value: unknown): readonly string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	})[character]!);
}

export function getRepoctxStageInvocation(stageId: RepoctxEvidenceStageId, task: string): IRepoctxStageInvocation {
	const normalizedTask = task.trim();

	switch (stageId) {
		case 'context':
			return {
				stageId,
				title: 'Repoctx Context',
				args: ['context', normalizedTask, '--path', '.', '--out', '.dev-context/context-pack.md'],
				artifactPath: 'context-pack.md',
			};
		case 'impact':
			return {
				stageId,
				title: 'Repoctx Impact',
				args: ['impact', '.', normalizedTask, '--out', '.dev-context/impact.md'],
				artifactPath: 'impact.md',
			};
		case 'review':
			return {
				stageId,
				title: 'Repoctx Review',
				args: ['pr', '.', '--base', 'origin/main', '--out', '.dev-context/pr-review.md'],
				artifactPath: 'pr-review.md',
			};
		case 'gate':
			return {
				stageId,
				title: 'Repoctx Gate',
				args: ['gate', '.', '--base', 'origin/main', '--request', normalizedTask, '--out', '.dev-context/gate.md'],
				artifactPath: 'gate.md',
			};
		case 'audit':
			return {
				stageId,
				title: 'Repoctx Audit',
				args: ['converge', '.', normalizedTask, '--base', 'origin/main', '--out', '.dev-context/convergence.md'],
				artifactPath: 'convergence.md',
			};
	}
}
