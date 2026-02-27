/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Azure DevOps Pipeline CLI
 *
 * A unified command-line tool for managing Azure Pipeline builds.
 *
 * Usage:
 *   node --experimental-strip-types azure-pipeline.ts <command> [options]
 *
 * Commands:
 *   queue   - Queue a new pipeline build
 *   status  - Check build status and download logs/artifacts
 *   cancel  - Cancel a running build
 *
 * Run with --help for detailed usage of each command.
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================================
// Constants
// ============================================================================

const ORGANIZATION = 'https://dev.azure.com/monacotools';
const PROJECT = 'Monaco';
const DEFAULT_DEFINITION_ID = '111';
const DEFAULT_WATCH_INTERVAL = 30;

// Validation patterns
const NUMERIC_ID_PATTERN = /^\d+$/;
const MAX_ID_LENGTH = 15;
const BRANCH_PATTERN = /^[a-zA-Z0-9_\-./]+$/;
const MAX_BRANCH_LENGTH = 256;
const VARIABLE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*=[a-zA-Z0-9_\-./: ]*$/;
const MAX_VARIABLE_LENGTH = 256;
const ARTIFACT_NAME_PATTERN = /^[a-zA-Z0-9_\-.]+$/;
const MAX_ARTIFACT_NAME_LENGTH = 256;
const MIN_WATCH_INTERVAL = 5;
const MAX_WATCH_INTERVAL = 3600;

// ============================================================================
// Types
// ============================================================================

interface Build {
	id: number;
	buildNumber: string;
	status: string;
	result?: string;
	sourceBranch?: string;
	reason?: string;
	startTime?: string;
	finishTime?: string;
	requestedBy?: { displayName?: string };
	requestedFor?: { displayName?: string };
}

interface TimelineRecord {
	id: string;
	parentId?: string;
	type: string;
	name?: string;
	state?: string;
	result?: string;
	order?: number;
	log?: { id?: number };
}

interface Timeline {
	records: TimelineRecord[];
}

interface Artifact {
	name: string;
	resource?: {
		downloadUrl?: string;
		properties?: { artifactsize?: string };
	};
}

interface QueueArgs {
	branch: string;
	definitionId: string;
	variables: string;
	dryRun: boolean;
	help: boolean;
}

interface StatusArgs {
	buildId: string;
	branch: string;
	reason: string;
	definitionId: string;
	watch: boolean;
	watchInterval: number;
	downloadLog: string;
	downloadArtifact: string;
	jsonOutput: boolean;
	help: boolean;
}

interface CancelArgs {
	buildId: string;
	definitionId: string;
	dryRun: boolean;
	help: boolean;
}

// ============================================================================
// Colors
// ============================================================================

const colors = {
	red: (text: string) => `\x1b[0;31m${text}\x1b[0m`,
	green: (text: string) => `\x1b[0;32m${text}\x1b[0m`,
	yellow: (text: string) => `\x1b[0;33m${text}\x1b[0m`,
	blue: (text: string) => `\x1b[0;34m${text}\x1b[0m`,
	cyan: (text: string) => `\x1b[0;36m${text}\x1b[0m`,
	gray: (text: string) => `\x1b[0;90m${text}\x1b[0m`,
};

// ============================================================================
// Validation Functions
// ============================================================================

function validateNumericId(value: string, name: string): void {
	if (!value) {
		return;
	}
	if (value.length > MAX_ID_LENGTH) {
		console.error(colors.red(`Error: ${name} is too long (max ${MAX_ID_LENGTH} characters)`));
		process.exit(1);
	}
	if (!NUMERIC_ID_PATTERN.test(value)) {
		console.error(colors.red(`Error: ${name} must contain only digits`));
		process.exit(1);
	}
}

function validateBranch(value: string): void {
	if (!value) {
		return;
	}
	if (value.length > MAX_BRANCH_LENGTH) {
		console.error(colors.red(`Error: --branch is too long (max ${MAX_BRANCH_LENGTH} characters)`));
		process.exit(1);
	}
	if (!BRANCH_PATTERN.test(value)) {
		console.error(colors.red('Error: --branch contains invalid characters'));
		console.log('Allowed: alphanumeric, hyphens, underscores, slashes, dots');
		process.exit(1);
	}
}

function validateVariables(value: string): void {
	if (!value) {
		return;
	}
	const vars = value.split(' ').filter(v => v.length > 0);
	for (const v of vars) {
		if (v.length > MAX_VARIABLE_LENGTH) {
			console.error(colors.red(`Error: Variable '${v.substring(0, 20)}...' is too long (max ${MAX_VARIABLE_LENGTH} characters)`));
			process.exit(1);
		}
		if (!VARIABLE_PATTERN.test(v)) {
			console.error(colors.red(`Error: Invalid variable format '${v}'`));
			console.log('Expected format: KEY=value (alphanumeric, underscores, hyphens, dots, slashes, colons, spaces in value)');
			process.exit(1);
		}
	}
}

function validateArtifactName(value: string): void {
	if (!value) {
		return;
	}
	if (value.length > MAX_ARTIFACT_NAME_LENGTH) {
		console.error(colors.red(`Error: --download-artifact name is too long (max ${MAX_ARTIFACT_NAME_LENGTH} characters)`));
		process.exit(1);
	}
	if (!ARTIFACT_NAME_PATTERN.test(value)) {
		console.error(colors.red('Error: --download-artifact name contains invalid characters'));
		console.log('Allowed: alphanumeric, hyphens, underscores, dots');
		process.exit(1);
	}
	if (value.includes('..') || value.startsWith('.') || value.startsWith('/') || value.startsWith('\\')) {
		console.error(colors.red('Error: --download-artifact name contains unsafe path components'));
		process.exit(1);
	}
}

function validateWatchInterval(value: number): void {
	if (value < MIN_WATCH_INTERVAL || value > MAX_WATCH_INTERVAL) {
		console.error(colors.red(`Error: Watch interval must be between ${MIN_WATCH_INTERVAL} and ${MAX_WATCH_INTERVAL} seconds`));
		process.exit(1);
	}
}

// ============================================================================
// CLI Helpers
// ============================================================================

function commandExists(command: string): boolean {
	try {
		execSync(`${process.platform === 'win32' ? 'where' : 'which'} ${command}`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function hasAzureDevOpsExtension(): boolean {
	try {
		execSync('az extension show --name azure-devops', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function getCurrentBranch(): string {
	try {
		return execSync('git branch --show-current', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
}

function ensureAzureCli(): void {
	if (!commandExists('az')) {
		console.error(colors.red('Error: Azure CLI (az) is not installed.'));
		console.log('Install it with: brew install azure-cli (macOS) or see https://docs.microsoft.com/en-us/cli/azure/install-azure-cli');
		console.log('Then add the DevOps extension: az extension add --name azure-devops');
		process.exit(1);
	}

	if (!hasAzureDevOpsExtension()) {
		console.log(colors.yellow('Installing azure-devops extension...'));
		try {
			execSync('az extension add --name azure-devops', { stdio: 'inherit' });
		} catch {
			console.error(colors.red('Failed to install azure-devops extension.'));
			process.exit(1);
		}
	}
}

function sleep(seconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function clearScreen(): void {
	process.stdout.write('\x1Bc');
}

// ============================================================================
// Display Utilities
// ============================================================================

function formatStatus(status: string): string {
	switch (status) {
		case 'completed':
			return colors.green('completed');
		case 'inProgress':
			return colors.blue('in progress');
		case 'notStarted':
			return colors.gray('not started');
		case 'cancelling':
		case 'postponed':
			return colors.yellow(status);
		default:
			return status || '';
	}
}

function formatResult(result: string): string {
	switch (result) {
		case 'succeeded':
			return colors.green('✓ succeeded');
		case 'failed':
			return colors.red('✗ failed');
		case 'canceled':
			return colors.yellow('⊘ canceled');
		case 'partiallySucceeded':
			return colors.yellow('◐ partially succeeded');
		default:
			return result || 'pending';
	}
}

function formatTimelineStatus(state: string, result: string): string {
	if (state === 'completed') {
		if (result === 'succeeded') {
			return colors.green('✓');
		}
		if (result === 'failed') {
			return colors.red('✗');
		}
		if (result === 'skipped') {
			return colors.gray('○');
		}
		return colors.yellow('◐');
	}
	if (state === 'inProgress') {
		return colors.blue('●');
	}
	return colors.gray('○');
}

function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return '0 B';
	}
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatRelativeTime(dateStr: string): string {
	if (!dateStr) {
		return '';
	}
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) {
		return 'just now';
	}
	if (diffMins < 60) {
		return `${diffMins}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	return `${diffDays}d ago`;
}

function formatReason(reason: string): string {
	switch (reason) {
		case 'manual':
			return 'Manual';
		case 'individualCI':
			return 'CI';
		case 'batchedCI':
			return 'Batched CI';
		case 'schedule':
			return 'Scheduled';
		case 'pullRequest':
			return 'PR';
		case 'buildCompletion':
			return 'Build Completion';
		case 'resourceTrigger':
			return 'Resource Trigger';
		default:
			return reason || 'Unknown';
	}
}

function padOrTruncate(str: string, width: number): string {
	if (str.length > width) {
		return str.slice(0, width - 1) + '…';
	}
	return str.padEnd(width);
}

function displayBuildSummary(build: Build): void {
	const id = build.id;
	const buildNumber = build.buildNumber;
	const status = build.status;
	const result = build.result;
	const sourceBranch = (build.sourceBranch || '').replace('refs/heads/', '');
	const startTime = build.startTime;
	const finishTime = build.finishTime;
	const requestedBy = build.requestedBy?.displayName;

	console.log('');
	console.log(colors.blue('Azure Pipeline Build Status'));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log(`Build ID:     ${colors.green(String(id))}`);
	console.log(`Build Number: ${colors.green(buildNumber)}`);
	console.log(`Branch:       ${colors.green(sourceBranch)}`);
	console.log(`Status:       ${formatStatus(status)}`);
	console.log(`Result:       ${formatResult(result || '')}`);
	if (requestedBy) {
		console.log(`Requested By: ${colors.cyan(requestedBy)}`);
	}
	if (startTime) {
		console.log(`Started:      ${colors.gray(startTime)}`);
	}
	if (finishTime) {
		console.log(`Finished:     ${colors.gray(finishTime)}`);
	}
	console.log(`URL:          ${colors.blue(`${ORGANIZATION}/${PROJECT}/_build/results?buildId=${id}`)}`);
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function displayBuildList(builds: Build[]): void {
	console.log('');
	console.log(colors.blue('Recent Builds'));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log(colors.gray(`${'ID'.padEnd(10)} ${'Status'.padEnd(14)} ${'Reason'.padEnd(12)} ${'Branch'.padEnd(25)} ${'Requested By'.padEnd(20)} ${'Started'.padEnd(12)}`));
	console.log('─────────────────────────────────────────────────────────────────────────────────────────────────────────────────');

	if (!builds || builds.length === 0) {
		console.log(colors.gray('No builds found'));
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		return;
	}

	for (const build of builds) {
		const id = String(build.id).padEnd(10);
		const branch = padOrTruncate((build.sourceBranch || '').replace('refs/heads/', ''), 25);
		const requestedBy = padOrTruncate(build.requestedBy?.displayName || build.requestedFor?.displayName || 'Unknown', 20);
		const reason = padOrTruncate(formatReason(build.reason || ''), 12);
		const started = padOrTruncate(formatRelativeTime(build.startTime || ''), 12);

		let statusStr: string;
		if (build.status === 'completed') {
			switch (build.result) {
				case 'succeeded':
					statusStr = colors.green('✓ succeeded'.padEnd(14));
					break;
				case 'failed':
					statusStr = colors.red('✗ failed'.padEnd(14));
					break;
				case 'canceled':
					statusStr = colors.yellow('⊘ canceled'.padEnd(14));
					break;
				case 'partiallySucceeded':
					statusStr = colors.yellow('◐ partial'.padEnd(14));
					break;
				default:
					statusStr = colors.gray((build.result || 'unknown').padEnd(14));
			}
		} else if (build.status === 'inProgress') {
			statusStr = colors.blue('● in progress'.padEnd(14));
		} else if (build.status === 'notStarted') {
			statusStr = colors.gray('○ queued'.padEnd(14));
		} else if (build.status === 'cancelling') {
			statusStr = colors.yellow('⊘ cancelling'.padEnd(14));
		} else {
			statusStr = colors.gray((build.status || 'unknown').padEnd(14));
		}

		console.log(`${colors.cyan(id)} ${statusStr} ${reason} ${branch} ${requestedBy} ${colors.gray(started)}`);
	}

	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('');
	console.log(colors.gray('Use --build-id <id> to see details for a specific build'));
}

function displayTimeline(timeline: Timeline | null): void {
	console.log('');
	console.log(colors.blue('Pipeline Stages'));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

	if (!timeline || !timeline.records) {
		console.log(colors.gray('Timeline not available'));
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		return;
	}

	const records = timeline.records;
	const stages = records.filter(r => r.type === 'Stage');
	const phases = records.filter(r => r.type === 'Phase');
	const jobs = records.filter(r => r.type === 'Job');

	const phaseToStage = new Map<string, string>();
	for (const phase of phases) {
		if (phase.parentId) {
			phaseToStage.set(phase.id, phase.parentId);
		}
	}

	stages.sort((a, b) => (a.order || 0) - (b.order || 0));

	for (const stage of stages) {
		const status = formatTimelineStatus(stage.state || '', stage.result || '');
		const name = stage.name || 'Unknown';
		console.log(`${status} ${name}`);

		const stagePhaseIds = new Set(phases.filter(p => p.parentId === stage.id).map(p => p.id));
		const stageJobs = jobs.filter(j => j.parentId && stagePhaseIds.has(j.parentId));

		stageJobs.sort((a, b) => (a.order || 0) - (b.order || 0));

		for (const job of stageJobs) {
			const jobStatus = formatTimelineStatus(job.state || '', job.result || '');
			const jobName = job.name || 'Unknown';
			const logId = job.log?.id;
			const logInfo = logId ? colors.gray(` (log #${logId})`) : '';
			console.log(`  ${jobStatus} ${jobName}${logInfo}`);
		}
	}

	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function displayArtifacts(artifacts: Artifact[]): void {
	console.log('');
	console.log(colors.blue('Build Artifacts'));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

	if (!artifacts || artifacts.length === 0) {
		console.log(colors.gray('No artifacts available'));
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		return;
	}

	for (const artifact of artifacts) {
		const name = artifact.name || 'Unknown';
		const size = artifact.resource?.properties?.artifactsize;
		if (!size || parseInt(size, 10) === 0) {
			continue;
		}
		const sizeStr = ` (${formatBytes(parseInt(size, 10))})`;
		console.log(`  ${colors.cyan(name)}${colors.gray(sizeStr)}`);
	}

	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function displayNextSteps(buildId: string): void {
	console.log('');
	console.log(colors.blue('Next Steps'));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log(colors.gray(`  Download artifact: status --build-id ${buildId} --download-artifact <name>`));
	console.log(colors.gray(`  Download log:      status --build-id ${buildId} --download-log <id>`));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================================
// Azure DevOps Client
// ============================================================================

class AzureDevOpsClient {
	protected readonly organization: string;
	protected readonly project: string;

	constructor(organization: string, project: string) {
		this.organization = organization;
		this.project = project;
	}

	protected runAzCommand(args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			const proc = spawn('az', args, { shell: true });
			let stdout = '';
			let stderr = '';

			proc.stdout.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			proc.stderr.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			proc.on('close', (code: number | null) => {
				if (code === 0) {
					resolve(stdout);
				} else {
					reject(new Error(stderr || stdout || `Command failed with code ${code}`));
				}
			});

			proc.on('error', reject);
		});
	}

	private async rest<T>(method: string, url: string, body?: string): Promise<T> {
		const args = [
			'rest',
			'--method', method,
			'--url', url,
			'--resource', '499b84ac-1321-427f-aa17-267ca6975798',
		];

		if (body) {
			const tmpDir = os.tmpdir();
			const bodyFile = path.join(tmpDir, `azdo-request-${Date.now()}.json`);
			fs.writeFileSync(bodyFile, body);
			args.push('--headers', 'Content-Type=application/json');
			args.push('--body', `@${bodyFile}`);

			try {
				const result = await this.runAzCommand(args);
				return JSON.parse(result);
			} finally {
				try {
					fs.unlinkSync(bodyFile);
				} catch {
					// Ignore cleanup errors
				}
			}
		}

		const result = await this.runAzCommand(args);
		return JSON.parse(result);
	}

	async queueBuild(definitionId: string, branch: string, variables?: string): Promise<Build> {
		const args = [
			'pipelines', 'run',
			'--organization', this.organization,
			'--project', this.project,
			'--id', definitionId,
			'--branch', branch,
		];

		if (variables) {
			args.push('--variables', ...variables.split(' '));
		}

		args.push('--output', 'json');
		const result = await this.runAzCommand(args);
		return JSON.parse(result);
	}

	async getBuild(buildId: string): Promise<Build | null> {
		try {
			const args = [
				'pipelines', 'build', 'show',
				'--organization', this.organization,
				'--project', this.project,
				'--id', buildId,
				'--output', 'json',
			];
			const result = await this.runAzCommand(args);
			return JSON.parse(result);
		} catch {
			return null;
		}
	}

	async listBuilds(definitionId: string, options: { branch?: string; reason?: string; top?: number } = {}): Promise<Build[]> {
		try {
			const args = [
				'pipelines', 'build', 'list',
				'--organization', this.organization,
				'--project', this.project,
				'--definition-ids', definitionId,
				'--top', String(options.top || 20),
				'--output', 'json',
			];
			if (options.branch) {
				args.push('--branch', options.branch);
			}
			if (options.reason) {
				args.push('--reason', options.reason);
			}
			const result = await this.runAzCommand(args);
			return JSON.parse(result);
		} catch {
			return [];
		}
	}

	async findRecentBuild(branch: string, definitionId: string): Promise<string> {
		try {
			const args = [
				'pipelines', 'build', 'list',
				'--organization', this.organization,
				'--project', this.project,
				'--definition-ids', definitionId,
				'--branch', branch,
				'--top', '1',
				'--query', '[0].id',
				'--output', 'tsv',
			];
			const result = await this.runAzCommand(args);
			return result.trim();
		} catch {
			return '';
		}
	}

	async cancelBuild(buildId: string): Promise<Build> {
		const url = `${this.organization}/${this.project}/_apis/build/builds/${buildId}?api-version=7.0`;
		return this.rest<Build>('patch', url, JSON.stringify({ status: 'cancelling' }));
	}

	async getTimeline(buildId: string): Promise<Timeline | null> {
		try {
			const url = `${this.organization}/${this.project}/_apis/build/builds/${buildId}/timeline?api-version=7.0`;
			return await this.rest<Timeline>('get', url);
		} catch {
			return null;
		}
	}

	async getArtifacts(buildId: string): Promise<Artifact[]> {
		try {
			const url = `${this.organization}/${this.project}/_apis/build/builds/${buildId}/artifacts?api-version=7.0`;
			const response = await this.rest<{ value: Artifact[] }>('get', url);
			return response.value || [];
		} catch {
			return [];
		}
	}

	async downloadLog(buildId: string, logId: string): Promise<string> {
		const url = `${this.organization}/${this.project}/_apis/build/builds/${buildId}/logs/${logId}?api-version=7.0`;
		const args = ['rest', '--method', 'get', '--url', url, '--resource', '499b84ac-1321-427f-aa17-267ca6975798'];
		const content = await this.runAzCommand(args);

		const tmpDir = os.tmpdir();
		const outputPath = path.join(tmpDir, `build-${buildId}-log-${logId}.txt`);

		console.log(colors.blue(`Downloading log #${logId}...`));
		console.log(colors.gray(`Destination: ${outputPath}`));

		fs.writeFileSync(outputPath, content);
		return outputPath;
	}

	async downloadArtifact(buildId: string, artifactName: string): Promise<string> {
		const artifacts = await this.getArtifacts(buildId);
		const artifact = artifacts.find(a => a.name === artifactName);

		if (!artifact) {
			const available = artifacts.map(a => a.name).join(', ');
			throw new Error(`Artifact '${artifactName}' not found. Available artifacts: ${available || 'none'}`);
		}

		const downloadUrl = artifact.resource?.downloadUrl;
		if (!downloadUrl) {
			throw new Error(`Artifact '${artifactName}' has no download URL`);
		}

		const tmpDir = os.tmpdir();
		const outputPath = path.join(tmpDir, `${artifactName}.zip`);

		console.log(colors.blue(`Downloading artifact '${artifactName}'...`));
		console.log(colors.gray(`Destination: ${outputPath}`));

		const tokenArgs = ['account', 'get-access-token', '--resource', '499b84ac-1321-427f-aa17-267ca6975798', '--query', 'accessToken', '--output', 'tsv'];
		const token = (await this.runAzCommand(tokenArgs)).trim();

		const response = await fetch(downloadUrl, {
			headers: { 'Authorization': `Bearer ${token}` },
			redirect: 'follow',
		});

		if (!response.ok) {
			throw new Error(`Failed to download artifact: ${response.status} ${response.statusText}`);
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		fs.writeFileSync(outputPath, buffer);

		return outputPath;
	}
}

// ============================================================================
// Queue Command
// ============================================================================

function printQueueUsage(): void {
	const scriptName = 'node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue';
	console.log(`Usage: ${scriptName} [options]`);
	console.log('');
	console.log('Queue an Azure DevOps pipeline build for VS Code.');
	console.log('');
	console.log('Options:');
	console.log('  --branch <name>       Source branch to build (default: current git branch)');
	console.log('  --definition <id>     Pipeline definition ID (default: 111)');
	console.log('  --variables <vars>    Pipeline variables in "KEY=value KEY2=value2" format');
	console.log('  --dry-run             Print the command without executing');
	console.log('  --help                Show this help message');
	console.log('');
	console.log('Examples:');
	console.log(`  ${scriptName}                                    # Queue build on current branch`);
	console.log(`  ${scriptName} --branch my-feature                # Queue build on specific branch`);
	console.log(`  ${scriptName} --variables "SKIP_TESTS=true"      # Queue with custom variables`);
}

function parseQueueArgs(args: string[]): QueueArgs {
	const result: QueueArgs = {
		branch: '',
		definitionId: DEFAULT_DEFINITION_ID,
		variables: '',
		dryRun: false,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--branch':
				result.branch = args[++i] || '';
				break;
			case '--definition':
				result.definitionId = args[++i] || DEFAULT_DEFINITION_ID;
				break;
			case '--variables':
				result.variables = args[++i] || '';
				break;
			case '--dry-run':
				result.dryRun = true;
				break;
			case '--help':
				result.help = true;
				break;
			default:
				console.error(colors.red(`Error: Unknown option: ${arg}`));
				printQueueUsage();
				process.exit(1);
		}
	}

	return result;
}

function validateQueueArgs(args: QueueArgs): void {
	validateNumericId(args.definitionId, '--definition');
	validateBranch(args.branch);
	validateVariables(args.variables);
}

async function runQueueCommand(args: string[]): Promise<void> {
	const parsedArgs = parseQueueArgs(args);

	if (parsedArgs.help) {
		printQueueUsage();
		process.exit(0);
	}

	validateQueueArgs(parsedArgs);
	ensureAzureCli();

	let branch = parsedArgs.branch;
	if (!branch) {
		branch = getCurrentBranch();
		if (!branch) {
			console.error(colors.red('Error: Could not determine current git branch.'));
			console.log('Please specify a branch with --branch <name>');
			process.exit(1);
		}
		validateBranch(branch);
	}

	console.log(colors.blue('Queueing Azure Pipeline Build'));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log(`Organization: ${colors.green(ORGANIZATION)}`);
	console.log(`Project:      ${colors.green(PROJECT)}`);
	console.log(`Definition:   ${colors.green(parsedArgs.definitionId)}`);
	console.log(`Branch:       ${colors.green(branch)}`);
	if (parsedArgs.variables) {
		console.log(`Variables:    ${colors.green(parsedArgs.variables)}`);
	}
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('');

	if (parsedArgs.dryRun) {
		console.log(colors.yellow('Dry run - command would be:'));
		const cmdArgs = [
			'pipelines', 'run',
			'--organization', ORGANIZATION,
			'--project', PROJECT,
			'--id', parsedArgs.definitionId,
			'--branch', branch,
		];
		if (parsedArgs.variables) {
			cmdArgs.push('--variables', ...parsedArgs.variables.split(' '));
		}
		cmdArgs.push('--output', 'json');
		console.log(`az ${cmdArgs.join(' ')}`);
		process.exit(0);
	}

	console.log(colors.blue('Queuing build...'));

	try {
		const client = new AzureDevOpsClient(ORGANIZATION, PROJECT);
		const data = await client.queueBuild(parsedArgs.definitionId, branch, parsedArgs.variables);

		const buildId = data.id;
		const buildNumber = data.buildNumber;
		const buildUrl = `${ORGANIZATION}/${PROJECT}/_build/results?buildId=${buildId}`;

		console.log('');
		console.log(colors.green('✓ Build queued successfully!'));
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log(`Build ID:     ${colors.green(String(buildId))}`);
		if (buildNumber) {
			console.log(`Build Number: ${colors.green(buildNumber)}`);
		}
		console.log(`URL:          ${colors.blue(buildUrl)}`);
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('');
		console.log('To check status, run:');
		console.log(`  node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --build-id ${buildId}`);
		console.log('');
		console.log('To watch progress:');
		console.log(`  node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --build-id ${buildId} --watch`);
	} catch (e) {
		const error = e instanceof Error ? e : new Error(String(e));
		console.error(colors.red('Error queuing build:'));
		console.error(error.message);
		process.exit(1);
	}
}

// ============================================================================
// Status Command
// ============================================================================

function printStatusUsage(): void {
	const scriptName = 'node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status';
	console.log(`Usage: ${scriptName} [options]`);
	console.log('');
	console.log('Get status and logs of an Azure DevOps pipeline build.');
	console.log('');
	console.log('Options:');
	console.log('  --build-id <id>       Specific build ID (default: list last 20 builds)');
	console.log('  --branch <name>       Filter builds by branch name (shows last 20 builds for branch)');
	console.log('  --reason <reason>     Filter builds by reason (manual, individualCI, batchedCI, schedule, pullRequest)');
	console.log('  --definition <id>     Pipeline definition ID (default: 111)');
	console.log('  --watch [seconds]     Continuously poll status until build completes (default: 30)');
	console.log('  --download-log <id>   Download a specific log to /tmp');
	console.log('  --download-artifact <name>  Download artifact to /tmp');
	console.log('  --json                Output raw JSON');
	console.log('  --help                Show this help message');
	console.log('');
	console.log('Examples:');
	console.log(`  ${scriptName}                              # List last 20 builds`);
	console.log(`  ${scriptName} --branch main                # List last 20 builds for main branch`);
	console.log(`  ${scriptName} --reason schedule            # List last 20 scheduled builds`);
	console.log(`  ${scriptName} --build-id 123456            # Status of specific build`);
	console.log(`  ${scriptName} --watch                      # Watch build until completion (30s interval)`);
	console.log(`  ${scriptName} --watch 60                   # Watch with 60s interval`);
	console.log(`  ${scriptName} --build-id 123456 --download-log 5  # Download log to /tmp`);
}

function parseStatusArgs(args: string[]): StatusArgs {
	const result: StatusArgs = {
		buildId: '',
		branch: '',
		reason: '',
		definitionId: DEFAULT_DEFINITION_ID,
		watch: false,
		watchInterval: DEFAULT_WATCH_INTERVAL,
		downloadLog: '',
		downloadArtifact: '',
		jsonOutput: false,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--build-id':
				result.buildId = args[++i] || '';
				break;
			case '--branch':
				result.branch = args[++i] || '';
				break;
			case '--reason':
				result.reason = args[++i] || '';
				break;
			case '--definition':
				result.definitionId = args[++i] || DEFAULT_DEFINITION_ID;
				break;
			case '--watch':
				result.watch = true;
				if (args[i + 1] && /^\d+$/.test(args[i + 1])) {
					result.watchInterval = parseInt(args[++i], 10) || DEFAULT_WATCH_INTERVAL;
				}
				break;
			case '--download-log':
				result.downloadLog = args[++i] || '';
				break;
			case '--download-artifact':
				result.downloadArtifact = args[++i] || '';
				break;
			case '--json':
				result.jsonOutput = true;
				break;
			case '--help':
				result.help = true;
				break;
			default:
				console.error(colors.red(`Error: Unknown option: ${arg}`));
				printStatusUsage();
				process.exit(1);
		}
	}

	return result;
}

function validateStatusArgs(args: StatusArgs): void {
	validateNumericId(args.buildId, '--build-id');
	validateNumericId(args.definitionId, '--definition');
	validateNumericId(args.downloadLog, '--download-log');
	validateArtifactName(args.downloadArtifact);
	if (args.watch) {
		validateWatchInterval(args.watchInterval);
	}
}

async function runStatusCommand(args: string[]): Promise<void> {
	const parsedArgs = parseStatusArgs(args);

	if (parsedArgs.help) {
		printStatusUsage();
		process.exit(0);
	}

	validateStatusArgs(parsedArgs);
	ensureAzureCli();

	const client = new AzureDevOpsClient(ORGANIZATION, PROJECT);

	// If no build ID specified, show list of recent builds
	let buildId = parsedArgs.buildId;
	if (!buildId && !parsedArgs.downloadLog && !parsedArgs.downloadArtifact && !parsedArgs.watch) {
		const builds = await client.listBuilds(parsedArgs.definitionId, {
			branch: parsedArgs.branch,
			reason: parsedArgs.reason,
			top: 20,
		});

		if (parsedArgs.jsonOutput) {
			console.log(JSON.stringify(builds, null, 2));
		} else {
			const filters: string[] = [];
			if (parsedArgs.branch) {
				filters.push(`branch: ${parsedArgs.branch}`);
			}
			if (parsedArgs.reason) {
				filters.push(`reason: ${parsedArgs.reason}`);
			}
			if (filters.length > 0) {
				console.log(colors.gray(`Filtering by ${filters.join(', ')}`));
			}
			displayBuildList(builds);
		}
		return;
	}

	// For watch mode or download operations without a build ID, find the most recent build on current branch
	if (!buildId) {
		const branch = getCurrentBranch();
		if (!branch) {
			console.error(colors.red('Error: Could not determine current git branch.'));
			console.log('Please specify a build ID with --build-id <id>');
			process.exit(1);
		}

		console.log(colors.gray(`Finding most recent build for branch: ${branch}`));
		buildId = await client.findRecentBuild(branch, parsedArgs.definitionId);

		if (!buildId) {
			console.error(colors.red(`Error: No builds found for branch '${branch}'.`));
			console.log('You can queue a new build with: node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue');
			process.exit(1);
		}
	}

	// Download specific log
	if (parsedArgs.downloadLog) {
		try {
			const outputPath = await client.downloadLog(buildId, parsedArgs.downloadLog);
			console.log(colors.green(`✓ Log downloaded to: ${outputPath}`));
		} catch (e) {
			console.error(colors.red((e as Error).message));
			process.exit(1);
		}
		return;
	}

	// Download artifact
	if (parsedArgs.downloadArtifact) {
		try {
			const outputPath = await client.downloadArtifact(buildId, parsedArgs.downloadArtifact);
			console.log(colors.green(`✓ Artifact downloaded to: ${outputPath}`));
		} catch (e) {
			console.error(colors.red((e as Error).message));
			process.exit(1);
		}
		return;
	}

	// Watch mode
	if (parsedArgs.watch) {
		console.log(colors.blue(`Watching build ${buildId} (Ctrl+C to stop)`));
		console.log('');

		while (true) {
			const build = await client.getBuild(buildId);

			if (!build) {
				console.error(colors.red('Error: Could not fetch build status'));
				process.exit(1);
			}

			clearScreen();

			if (parsedArgs.jsonOutput) {
				console.log(JSON.stringify(build, null, 2));
			} else {
				displayBuildSummary(build);
				const timeline = await client.getTimeline(buildId);
				displayTimeline(timeline);

				const artifacts = await client.getArtifacts(buildId);
				displayArtifacts(artifacts);
				displayNextSteps(buildId);
			}

			if (build.status === 'completed') {
				console.log('');
				console.log(colors.green('Build completed!'));
				process.exit(0);
			}

			console.log('');
			console.log(colors.gray(`Refreshing in ${parsedArgs.watchInterval} seconds... (Ctrl+C to stop)`));
			await sleep(parsedArgs.watchInterval);
		}
	} else {
		// Single status check
		const build = await client.getBuild(buildId);

		if (!build) {
			console.error(colors.red(`Error: Could not fetch build status for ID ${buildId}`));
			process.exit(1);
		}

		if (parsedArgs.jsonOutput) {
			console.log(JSON.stringify(build, null, 2));
		} else {
			displayBuildSummary(build);
			const timeline = await client.getTimeline(buildId);
			displayTimeline(timeline);

			const artifacts = await client.getArtifacts(buildId);
			displayArtifacts(artifacts);
			displayNextSteps(buildId);
		}
	}
}

// ============================================================================
// Cancel Command
// ============================================================================

function printCancelUsage(): void {
	const scriptName = 'node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel';
	console.log(`Usage: ${scriptName} --build-id <id> [options]`);
	console.log('');
	console.log('Cancel a running Azure DevOps pipeline build.');
	console.log('');
	console.log('Options:');
	console.log('  --build-id <id>       Build ID to cancel (required)');
	console.log('  --definition <id>     Pipeline definition ID (default: 111)');
	console.log('  --dry-run             Print what would be cancelled without executing');
	console.log('  --help                Show this help message');
	console.log('');
	console.log('Examples:');
	console.log(`  ${scriptName} --build-id 123456      # Cancel specific build`);
	console.log(`  ${scriptName} --build-id 123456 --dry-run  # Show what would be cancelled`);
}

function parseCancelArgs(args: string[]): CancelArgs {
	const result: CancelArgs = {
		buildId: '',
		definitionId: DEFAULT_DEFINITION_ID,
		dryRun: false,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--build-id':
				result.buildId = args[++i] || '';
				break;
			case '--definition':
				result.definitionId = args[++i] || DEFAULT_DEFINITION_ID;
				break;
			case '--dry-run':
				result.dryRun = true;
				break;
			case '--help':
				result.help = true;
				break;
			default:
				console.error(colors.red(`Error: Unknown option: ${arg}`));
				printCancelUsage();
				process.exit(1);
		}
	}

	return result;
}

function validateCancelArgs(args: CancelArgs): void {
	validateNumericId(args.buildId, '--build-id');
	validateNumericId(args.definitionId, '--definition');
}

async function runCancelCommand(args: string[]): Promise<void> {
	const parsedArgs = parseCancelArgs(args);

	if (parsedArgs.help) {
		printCancelUsage();
		process.exit(0);
	}

	validateCancelArgs(parsedArgs);
	ensureAzureCli();

	const buildId = parsedArgs.buildId;

	if (!buildId) {
		console.error(colors.red('Error: --build-id is required.'));
		console.log('');
		console.log('To find build IDs, run:');
		console.log('  node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status');
		process.exit(1);
	}

	const client = new AzureDevOpsClient(ORGANIZATION, PROJECT);
	const build = await client.getBuild(buildId);

	if (!build) {
		console.error(colors.red(`Error: Could not fetch build status for ID ${buildId}`));
		process.exit(1);
	}

	const buildUrl = `${ORGANIZATION}/${PROJECT}/_build/results?buildId=${buildId}`;

	console.log('');
	console.log(colors.blue('Azure Pipeline Build Cancel'));
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log(`Build ID:     ${colors.green(String(build.id))}`);
	console.log(`Build Number: ${colors.green(build.buildNumber || 'N/A')}`);
	console.log(`Status:       ${colors.yellow(build.status)}`);
	console.log(`URL:          ${colors.blue(buildUrl)}`);
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

	if (build.status === 'completed') {
		console.log('');
		console.log(colors.yellow('Build is already completed. Nothing to cancel.'));
		process.exit(0);
	}

	if (build.status === 'cancelling') {
		console.log('');
		console.log(colors.yellow('Build is already being cancelled.'));
		process.exit(0);
	}

	if (parsedArgs.dryRun) {
		console.log('');
		console.log(colors.yellow('Dry run - would cancel build:'));
		console.log(`  Build ID: ${buildId}`);
		console.log(`  API: PATCH ${ORGANIZATION}/${PROJECT}/_apis/build/builds/${buildId}?api-version=7.0`);
		console.log(`  Body: {"status": "cancelling"}`);
		process.exit(0);
	}

	console.log('');
	console.log(colors.blue('Cancelling build...'));

	try {
		await client.cancelBuild(buildId);
		console.log('');
		console.log(colors.green('✓ Build cancellation requested successfully!'));
		console.log('');
		console.log('The build will transition to "cancelling" state and then "canceled".');
		console.log('Check status with:');
		console.log(`  node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --build-id ${buildId}`);
	} catch (e) {
		const error = e instanceof Error ? e : new Error(String(e));
		console.error('');
		console.error(colors.red('Error cancelling build:'));
		console.error(error.message);
		process.exit(1);
	}
}

// ============================================================================
// Testable Azure DevOps Client
// ============================================================================

/**
 * A testable version of AzureDevOpsClient that captures az command calls
 * instead of executing them.
 */
class TestableAzureDevOpsClient extends AzureDevOpsClient {
	public capturedCommands: string[][] = [];
	private mockResponses: Map<string, unknown> = new Map();

	constructor(organization: string, project: string) {
		super(organization, project);
	}

	setMockResponse(commandPattern: string, response: unknown): void {
		this.mockResponses.set(commandPattern, response);
	}

	protected override runAzCommand(args: string[]): Promise<string> {
		this.capturedCommands.push(args);

		// Find a matching mock response
		const commandKey = args.join(' ');
		for (const [pattern, response] of this.mockResponses) {
			if (commandKey.includes(pattern)) {
				return Promise.resolve(JSON.stringify(response));
			}
		}

		// Default mock responses based on command type
		if (args.includes('pipelines') && args.includes('run')) {
			return Promise.resolve(JSON.stringify({ id: 12345, buildNumber: '20260218.1' }));
		}
		if (args.includes('pipelines') && args.includes('build') && args.includes('show')) {
			return Promise.resolve(JSON.stringify({
				id: 12345,
				buildNumber: '20260218.1',
				status: 'inProgress',
				sourceBranch: 'refs/heads/main'
			}));
		}
		if (args.includes('pipelines') && args.includes('build') && args.includes('list')) {
			return Promise.resolve(JSON.stringify([
				{ id: 12345, buildNumber: '20260218.1', status: 'completed', result: 'succeeded' }
			]));
		}
		if (args.includes('rest') && args.includes('patch')) {
			return Promise.resolve(JSON.stringify({ id: 12345, status: 'cancelling' }));
		}
		if (args.includes('rest') && args.includes('timeline')) {
			return Promise.resolve(JSON.stringify({ records: [] }));
		}
		if (args.includes('rest') && args.includes('artifacts')) {
			return Promise.resolve(JSON.stringify({ value: [] }));
		}

		return Promise.resolve('{}');
	}
}

// ============================================================================
// Tests (using Node.js built-in test runner)
// ============================================================================

async function runAllTests(): Promise<void> {
	const { describe, it } = await import('node:test');
	const assert = await import('node:assert');

	describe('Validation Functions', () => {
		it('validateNumericId accepts valid numeric IDs', () => {
			validateNumericId('12345', 'test');
			validateNumericId('1', 'test');
			validateNumericId('999999999999999', 'test');
		});

		it('validateNumericId accepts empty string', () => {
			validateNumericId('', 'test');
		});

		it('validateBranch accepts valid branch names', () => {
			validateBranch('main');
			validateBranch('feature/my-feature');
			validateBranch('release/v1.0.0');
			validateBranch('user/john_doe/fix-123');
			validateBranch('refs/heads/main');
		});

		it('validateBranch accepts empty string', () => {
			validateBranch('');
		});

		it('validateVariables accepts valid variable formats', () => {
			validateVariables('KEY=value');
			validateVariables('MY_VAR=some-value');
			validateVariables('A=1 B=2 C=3');
			validateVariables('PATH=/usr/bin:path');
		});

		it('validateVariables accepts empty string', () => {
			validateVariables('');
		});

		it('validateArtifactName accepts valid artifact names', () => {
			validateArtifactName('my-artifact');
			validateArtifactName('artifact_1.0.0');
			validateArtifactName('Build-Output');
		});

		it('validateArtifactName accepts empty string', () => {
			validateArtifactName('');
		});

		it('validateWatchInterval accepts valid intervals', () => {
			validateWatchInterval(5);
			validateWatchInterval(30);
			validateWatchInterval(3600);
		});
	});

	describe('Argument Parsing', () => {
		it('parseQueueArgs parses --branch correctly', () => {
			const args = parseQueueArgs(['--branch', 'my-feature']);
			assert.strictEqual(args.branch, 'my-feature');
		});

		it('parseQueueArgs parses --definition correctly', () => {
			const args = parseQueueArgs(['--definition', '222']);
			assert.strictEqual(args.definitionId, '222');
		});

		it('parseQueueArgs parses --variables correctly', () => {
			const args = parseQueueArgs(['--variables', 'KEY=value']);
			assert.strictEqual(args.variables, 'KEY=value');
		});

		it('parseQueueArgs parses --dry-run correctly', () => {
			const args = parseQueueArgs(['--dry-run']);
			assert.strictEqual(args.dryRun, true);
		});

		it('parseQueueArgs parses combined arguments', () => {
			const args = parseQueueArgs(['--branch', 'main', '--definition', '333', '--variables', 'A=1 B=2', '--dry-run']);
			assert.strictEqual(args.branch, 'main');
			assert.strictEqual(args.definitionId, '333');
			assert.strictEqual(args.variables, 'A=1 B=2');
			assert.strictEqual(args.dryRun, true);
		});

		it('parseStatusArgs parses --build-id correctly', () => {
			const args = parseStatusArgs(['--build-id', '12345']);
			assert.strictEqual(args.buildId, '12345');
		});

		it('parseStatusArgs parses --branch correctly', () => {
			const args = parseStatusArgs(['--branch', 'main']);
			assert.strictEqual(args.branch, 'main');
		});

		it('parseStatusArgs parses --watch without interval', () => {
			const args = parseStatusArgs(['--watch']);
			assert.strictEqual(args.watch, true);
			assert.strictEqual(args.watchInterval, 30);
		});

		it('parseStatusArgs parses --watch with interval', () => {
			const args = parseStatusArgs(['--watch', '60']);
			assert.strictEqual(args.watch, true);
			assert.strictEqual(args.watchInterval, 60);
		});

		it('parseStatusArgs parses --download-log correctly', () => {
			const args = parseStatusArgs(['--download-log', '5']);
			assert.strictEqual(args.downloadLog, '5');
		});

		it('parseStatusArgs parses --download-artifact correctly', () => {
			const args = parseStatusArgs(['--download-artifact', 'my-artifact']);
			assert.strictEqual(args.downloadArtifact, 'my-artifact');
		});

		it('parseStatusArgs parses --json correctly', () => {
			const args = parseStatusArgs(['--json']);
			assert.strictEqual(args.jsonOutput, true);
		});

		it('parseCancelArgs parses --build-id correctly', () => {
			const args = parseCancelArgs(['--build-id', '12345']);
			assert.strictEqual(args.buildId, '12345');
		});

		it('parseCancelArgs parses --dry-run correctly', () => {
			const args = parseCancelArgs(['--dry-run']);
			assert.strictEqual(args.dryRun, true);
		});
	});

	describe('Azure Command Construction', () => {
		it('queueBuild constructs correct az command', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.queueBuild('111', 'main');

			assert.strictEqual(client.capturedCommands.length, 1);
			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('pipelines'));
			assert.ok(cmd.includes('run'));
			assert.ok(cmd.includes('--organization'));
			assert.ok(cmd.includes(ORGANIZATION));
			assert.ok(cmd.includes('--project'));
			assert.ok(cmd.includes(PROJECT));
			assert.ok(cmd.includes('--id'));
			assert.ok(cmd.includes('111'));
			assert.ok(cmd.includes('--branch'));
			assert.ok(cmd.includes('main'));
			assert.ok(cmd.includes('--output'));
			assert.ok(cmd.includes('json'));
		});

		it('queueBuild includes variables when provided', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.queueBuild('111', 'main', 'KEY=value OTHER=test');

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('--variables'));
			assert.ok(cmd.includes('KEY=value'));
			assert.ok(cmd.includes('OTHER=test'));
		});

		it('getBuild constructs correct az command', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.getBuild('12345');

			assert.strictEqual(client.capturedCommands.length, 1);
			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('pipelines'));
			assert.ok(cmd.includes('build'));
			assert.ok(cmd.includes('show'));
			assert.ok(cmd.includes('--id'));
			assert.ok(cmd.includes('12345'));
		});

		it('listBuilds constructs correct az command', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.listBuilds('111');

			assert.strictEqual(client.capturedCommands.length, 1);
			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('pipelines'));
			assert.ok(cmd.includes('build'));
			assert.ok(cmd.includes('list'));
			assert.ok(cmd.includes('--definition-ids'));
			assert.ok(cmd.includes('111'));
			assert.ok(cmd.includes('--top'));
			assert.ok(cmd.includes('20'));
		});

		it('listBuilds includes branch filter when provided', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.listBuilds('111', { branch: 'feature/test' });

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('--branch'));
			assert.ok(cmd.includes('feature/test'));
		});

		it('listBuilds includes reason filter when provided', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.listBuilds('111', { reason: 'manual' });

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('--reason'));
			assert.ok(cmd.includes('manual'));
		});

		it('listBuilds includes custom top value', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.listBuilds('111', { top: 50 });

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('--top'));
			assert.ok(cmd.includes('50'));
		});

		it('findRecentBuild constructs correct az command', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.findRecentBuild('main', '111');

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('pipelines'));
			assert.ok(cmd.includes('build'));
			assert.ok(cmd.includes('list'));
			assert.ok(cmd.includes('--branch'));
			assert.ok(cmd.includes('main'));
			assert.ok(cmd.includes('--top'));
			assert.ok(cmd.includes('1'));
			assert.ok(cmd.includes('--query'));
			assert.ok(cmd.includes('[0].id'));
			assert.ok(cmd.includes('--output'));
			assert.ok(cmd.includes('tsv'));
		});

		it('cancelBuild constructs correct REST API call', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.cancelBuild('12345');

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('rest'));
			assert.ok(cmd.includes('--method'));
			assert.ok(cmd.includes('patch'));
			assert.ok(cmd.join(' ').includes('_apis/build/builds/12345'));
		});

		it('getTimeline constructs correct REST API call', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.getTimeline('12345');

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('rest'));
			assert.ok(cmd.includes('--method'));
			assert.ok(cmd.includes('get'));
			assert.ok(cmd.join(' ').includes('_apis/build/builds/12345/timeline'));
		});

		it('getArtifacts constructs correct REST API call', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.getArtifacts('12345');

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('rest'));
			assert.ok(cmd.includes('--method'));
			assert.ok(cmd.includes('get'));
			assert.ok(cmd.join(' ').includes('_apis/build/builds/12345/artifacts'));
		});

		it('downloadLog constructs correct REST API call', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);

			// Capture console output to avoid noise
			const originalLog = console.log;
			console.log = () => { };
			try {
				await client.downloadLog('12345', '7');
			} finally {
				console.log = originalLog;
			}

			const cmd = client.capturedCommands[0];
			assert.ok(cmd.includes('rest'));
			assert.ok(cmd.includes('--method'));
			assert.ok(cmd.includes('get'));
			assert.ok(cmd.join(' ').includes('_apis/build/builds/12345/logs/7'));
		});
	});

	describe('Display Format Functions', () => {
		it('formatStatus returns correct format for completed', () => {
			const result = formatStatus('completed');
			assert.ok(result.includes('completed'));
		});

		it('formatStatus returns correct format for inProgress', () => {
			const result = formatStatus('inProgress');
			assert.ok(result.includes('in progress'));
		});

		it('formatResult returns correct format for succeeded', () => {
			const result = formatResult('succeeded');
			assert.ok(result.includes('succeeded'));
			assert.ok(result.includes('✓'));
		});

		it('formatResult returns correct format for failed', () => {
			const result = formatResult('failed');
			assert.ok(result.includes('failed'));
			assert.ok(result.includes('✗'));
		});

		it('formatResult returns correct format for canceled', () => {
			const result = formatResult('canceled');
			assert.ok(result.includes('canceled'));
			assert.ok(result.includes('⊘'));
		});

		it('formatBytes formats correctly', () => {
			assert.strictEqual(formatBytes(0), '0 B');
			assert.strictEqual(formatBytes(1024), '1 KB');
			assert.strictEqual(formatBytes(1048576), '1 MB');
			assert.strictEqual(formatBytes(1073741824), '1 GB');
		});

		it('formatReason returns correct labels', () => {
			assert.strictEqual(formatReason('manual'), 'Manual');
			assert.strictEqual(formatReason('individualCI'), 'CI');
			assert.strictEqual(formatReason('pullRequest'), 'PR');
			assert.strictEqual(formatReason('schedule'), 'Scheduled');
		});

		it('padOrTruncate pads short strings', () => {
			assert.strictEqual(padOrTruncate('abc', 6), 'abc   ');
		});

		it('padOrTruncate truncates long strings', () => {
			assert.strictEqual(padOrTruncate('abcdefghij', 6), 'abcde…');
		});

		it('formatTimelineStatus returns correct symbols', () => {
			const succeeded = formatTimelineStatus('completed', 'succeeded');
			assert.ok(succeeded.includes('✓'));

			const failed = formatTimelineStatus('completed', 'failed');
			assert.ok(failed.includes('✗'));

			const inProgress = formatTimelineStatus('inProgress', '');
			assert.ok(inProgress.includes('●'));
		});
	});

	describe('Integration Tests', () => {
		it('full queue command flow constructs correct az commands', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.queueBuild('111', 'feature/test', 'DEBUG=true');

			assert.strictEqual(client.capturedCommands.length, 1);
			const cmd = client.capturedCommands[0];

			assert.ok(cmd.includes('pipelines'));
			assert.ok(cmd.includes('run'));
			assert.ok(cmd.includes('--organization'));
			assert.ok(cmd.includes(ORGANIZATION));
			assert.ok(cmd.includes('--project'));
			assert.ok(cmd.includes(PROJECT));
			assert.ok(cmd.includes('--id'));
			assert.ok(cmd.includes('111'));
			assert.ok(cmd.includes('--branch'));
			assert.ok(cmd.includes('feature/test'));
			assert.ok(cmd.includes('--variables'));
			assert.ok(cmd.includes('DEBUG=true'));
		});

		it('full status command flow constructs correct az commands', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);

			await client.getBuild('99999');
			await client.getTimeline('99999');
			await client.getArtifacts('99999');

			assert.strictEqual(client.capturedCommands.length, 3);

			const showCmd = client.capturedCommands[0];
			assert.ok(showCmd.includes('build'));
			assert.ok(showCmd.includes('show'));
			assert.ok(showCmd.includes('--id'));
			assert.ok(showCmd.includes('99999'));

			const timelineCmd = client.capturedCommands[1];
			assert.ok(timelineCmd.includes('rest'));
			assert.ok(timelineCmd.join(' ').includes('timeline'));

			const artifactsCmd = client.capturedCommands[2];
			assert.ok(artifactsCmd.includes('rest'));
			assert.ok(artifactsCmd.join(' ').includes('artifacts'));
		});

		it('cancel command constructs correct REST API call', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.cancelBuild('88888');

			assert.strictEqual(client.capturedCommands.length, 1);
			const cmd = client.capturedCommands[0];

			assert.ok(cmd.includes('rest'));
			assert.ok(cmd.includes('--method'));
			assert.ok(cmd.includes('patch'));
			assert.ok(cmd.join(' ').includes('88888'));
			assert.ok(cmd.join(' ').includes('api-version=7.0'));
		});

		it('list builds with filters constructs correct command', async () => {
			const client = new TestableAzureDevOpsClient(ORGANIZATION, PROJECT);
			await client.listBuilds('111', { branch: 'main', reason: 'pullRequest', top: 10 });

			assert.strictEqual(client.capturedCommands.length, 1);
			const cmd = client.capturedCommands[0];

			assert.ok(cmd.includes('--branch'));
			assert.ok(cmd.includes('main'));
			assert.ok(cmd.includes('--reason'));
			assert.ok(cmd.includes('pullRequest'));
			assert.ok(cmd.includes('--top'));
			assert.ok(cmd.includes('10'));
		});
	});
}

// ============================================================================
// Main Entry Point
// ============================================================================

function printMainUsage(): void {
	const scriptName = 'node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts';
	console.log(`Usage: ${scriptName} <command> [options]`);
	console.log('');
	console.log('Azure DevOps Pipeline CLI for VS Code builds.');
	console.log('');
	console.log('Commands:');
	console.log('  queue   Queue a new pipeline build');
	console.log('  status  Check build status, list builds, download logs/artifacts');
	console.log('  cancel  Cancel a running build');
	console.log('');
	console.log('Options:');
	console.log('  --help   Show help for a command');
	console.log('  --tests  Run the test suite');
	console.log('');
	console.log('Examples:');
	console.log(`  ${scriptName} queue                         # Queue build on current branch`);
	console.log(`  ${scriptName} status                        # List recent builds`);
	console.log(`  ${scriptName} status --build-id 123456      # Get build details`);
	console.log(`  ${scriptName} cancel --build-id 123456      # Cancel a build`);
	console.log(`  ${scriptName} --tests                       # Run test suite`);
	console.log('');
	console.log('Run any command with --help for detailed usage.');
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
		printMainUsage();
		process.exit(0);
	}

	if (args[0] === '--tests') {
		await runAllTests();
		return;
	}

	const command = args[0];
	const commandArgs = args.slice(1);

	switch (command) {
		case 'queue':
			await runQueueCommand(commandArgs);
			break;
		case 'status':
			await runStatusCommand(commandArgs);
			break;
		case 'cancel':
			await runCancelCommand(commandArgs);
			break;
		default:
			console.error(colors.red(`Error: Unknown command: ${command}`));
			console.log('');
			printMainUsage();
			process.exit(1);
	}
}

main();
