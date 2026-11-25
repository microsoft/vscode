/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Deterministic steps of the Issue Triage agentic workflow (.github/workflows/issue-triage.md). They
// only use the workflow's GITHUB_TOKEN.

import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

type RequestParameters = Readonly<Record<string, string | number | readonly string[]>>;

interface IGitHub {
	request<T>(route: string, parameters?: RequestParameters): Promise<{ readonly data: T }>;
}

interface IUser {
	readonly login: string;
	readonly type?: string;
	readonly id?: number;
}

interface IContext {
	readonly eventName?: string;
	readonly repo: { readonly owner: string; readonly repo: string };
	readonly payload: {
		readonly action?: string;
		readonly inputs?: { readonly issue_number?: string };
		/** The issue when the event happened. */
		readonly issue?: { readonly number: number; readonly assignees?: readonly IUser[] | null };
		readonly label?: { readonly name: string };
	};
}

interface ICore {
	info(message: string): void;
	warning(message: string): void;
	setOutput(name: string, value: string): void;
	setFailed(message: string): void;
}

interface IGitHubScriptRuntime {
	readonly exec: unknown;
	readonly io: unknown;
	readonly getOctokit: unknown;
}

export interface IIssue {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly labels: readonly ({ readonly name: string } | string)[];
	readonly assignees?: readonly IUser[] | null;
	readonly pull_request?: object;
}

interface IComment {
	readonly body?: string | null;
	readonly user?: IUser | null;
}

interface IAgentOutputItem {
	readonly type?: string;
	readonly assignees?: unknown;
	readonly body?: unknown;
	readonly label?: unknown;
	readonly rationale?: unknown;
	readonly confidence?: unknown;
}

export const advisoryAreaLabels = ['agents-window', 'agent-host', 'modernization', 'ux', 'recent-regression', 'model-byok', 'polish', 'UBB', 'chat', 'browser-integration', 'extensions', 'terminal', 'install-update', 'chat-tools', 'workbench-tabs', 'claude-agent', 'accessibility'];
const translationMarker = '<!-- vscode-issue-triage-translation -->';
const githubActionsBotId = 41898282;

interface IPermission {
	readonly permission: string;
	readonly role_name?: string;
	readonly user?: IUser | null;
}

/**
 * Whether a person is a member of the team, and why.
 */
export interface ITeamMemberCheck {
	readonly eligible: boolean;
	readonly reason: string;
}

/**
 * How long to wait after the trigger before triaging, so that people and other automation can handle the issue first.
 */
export const triageDelayMs = 3 * 60 * 1000;

/** Issues with one of these labels, compared case-insensitively, are handled elsewhere or must not be triaged. */
const ignoredLabels = ['ai-triaged', 'iteration-plan', 'testplan-item', 'invalid-testplan-item', 'spam', '~spam', 'kql-monitor-magic'];
/** Issues with a label that starts with one of these prefixes have a Copilot service category. */
const ignoredLabelPrefixes = ['~chat-', 'chat-'];
/** Test plan items and iteration plans that don't have their label yet. */
const ignoredTitlePrefixes = ['test:', 'tpi:', 'iteration plan'];

/**
 * The repository roles of the team's members. Members have the custom Security Maintainer role, and
 * some are admins. People with write access through other teams have other roles.
 */
const teamRoles = ['Security Maintainer', 'admin'];
/** The number of owners, best first, that the agent can propose. */
const maxProposedOwners = 10;
/**
 * The number of people whose team membership the agent can check in a run. Its results are in the
 * public logs of the run, so this limits how much of the team a prompt injection can enumerate.
 */
const maxTeamMemberChecks = 20;

function getLabelNames(issue: IIssue): string[] {
	return issue.labels.map(label => typeof label === 'string' ? label : label.name);
}

function getStatus(error: { readonly status?: unknown } | null | undefined): number | undefined {
	return typeof error?.status === 'number' ? error.status : undefined;
}

/**
 * Returns why triage must not handle the issue, or `undefined` when it may.
 */
export function getIgnoreReason(issue: IIssue): string | undefined {
	if (issue.pull_request) {
		return 'it is a pull request';
	}
	if (issue.state !== 'open') {
		return 'it is closed';
	}
	const ignoredLabel = getLabelNames(issue).find(label => {
		const name = label.toLowerCase();
		return ignoredLabels.includes(name) || ignoredLabelPrefixes.some(prefix => name.startsWith(prefix));
	});
	if (ignoredLabel) {
		return `it has the label ${ignoredLabel}`;
	}
	const title = issue.title.trim().toLowerCase();
	if (ignoredTitlePrefixes.some(prefix => title.startsWith(prefix))) {
		return 'it is a test plan item or an iteration plan';
	}
	return undefined;
}

/**
 * Returns why the issue doesn't need automated triage, or `undefined` when it does.
 */
export function getSkipReason(issue: IIssue): string | undefined {
	const reason = getIgnoreReason(issue);
	if (reason) {
		return reason;
	}
	if (issue.assignees?.length) {
		return 'it is already assigned';
	}
	return undefined;
}

/**
 * Whether a login can never be assigned: bots, Copilot and anything that isn't a valid user name.
 */
export function isBlockedAssignee(login: string): boolean {
	const name = login.toLowerCase();
	return name === 'copilot' || name.endsWith('[bot]') || !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(name);
}

function getIssueNumber(context: IContext): number {
	if (context.eventName === 'workflow_dispatch') {
		const input = context.payload.inputs?.issue_number;
		if (!input || !/^[1-9]\d*$/.test(input) || !Number.isSafeInteger(Number(input))) {
			throw new Error('issue_number must be a positive safe integer without leading zeros.');
		}
		return Number(input);
	}
	const issueNumber = context.payload.issue?.number;
	if (!issueNumber) {
		throw new Error('The workflow was not triggered by an issue event.');
	}
	return issueNumber;
}

async function getIssue(github: IGitHub, context: IContext, issueNumber: number): Promise<IIssue> {
	const { owner, repo } = context.repo;
	return (await github.request<IIssue>('GET /repos/{owner}/{repo}/issues/{issue_number}', { owner, repo, issue_number: issueNumber })).data;
}

/**
 * Waits for `delayMs`, then re-reads the issue and sets the `proceed` output to whether it still needs
 * triage. Issue events and manual dispatch use the same eligibility checks.
 */
export async function checkIssue(github: IGitHub, context: IContext, core: ICore, delayMs = triageDelayMs): Promise<void> {
	const issueNumber = getIssueNumber(context);
	core.setOutput('issue_number', String(issueNumber));
	if (context.payload.action === 'labeled' && context.payload.label?.name !== 'stale') {
		core.info(`Skipping triage of #${issueNumber} because only the stale label triggers it.`);
		core.setOutput('proceed', 'false');
		return;
	}
	core.info(`Waiting ${delayMs / 1000} seconds before triaging #${issueNumber}.`);
	await sleep(delayMs);
	let reason: string | undefined;
	try {
		reason = getSkipReason(await getIssue(github, context, issueNumber));
	} catch (error) {
		const status = getStatus(error);
		if (status !== 404 && status !== 410) {
			throw error;
		}
		reason = 'it was deleted or transferred';
	}
	if (reason) {
		core.info(`Skipping triage of #${issueNumber} because ${reason}.`);
	}
	core.setOutput('proceed', reason ? 'false' : 'true');
}

/**
 * Checks that a person is a member of the team, from their role in the repository: the workflow's
 * token cannot read team membership itself. Fails closed: any error makes the person ineligible.
 */
export async function checkTeamMember(github: IGitHub, owner: string, repo: string, login: string): Promise<ITeamMemberCheck> {
	if (isBlockedAssignee(login)) {
		return { eligible: false, reason: 'blocked' };
	}
	let permission: IPermission;
	try {
		permission = (await github.request<IPermission>('GET /repos/{owner}/{repo}/collaborators/{username}/permission', { owner, repo, username: login })).data;
	} catch (error) {
		return { eligible: false, reason: getStatus(error) === 404 ? 'not a collaborator' : 'the permission check failed' };
	}
	if (permission.user && permission.user.type !== 'User') {
		return { eligible: false, reason: 'not a user' };
	}
	const role = permission.role_name ?? permission.permission;
	return { eligible: teamRoles.includes(role), reason: `${role} role` };
}

/**
 * Creates a client for the GET requests of `checkTeamMember`, for code that runs without Octokit.
 */
export function createRestClient(token: string, apiUrl = 'https://api.github.com'): IGitHub {
	return {
		async request<T>(route: string, parameters: RequestParameters = {}): Promise<{ readonly data: T }> {
			const [method, template] = route.split(' ');
			if (method !== 'GET') {
				throw new Error(`Unsupported request: ${route}`);
			}
			const url = template.replace(/\{(?<name>\w+)\}/g, (_, name: string) => encodeURIComponent(String(parameters[name])));
			const response = await fetch(`${apiUrl}${url}`, { headers: { 'authorization': `Bearer ${token}`, 'accept': 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
			if (!response.ok) {
				throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
			}
			return { data: await response.json() as T };
		},
	};
}

/**
 * Splits a list of logins separated by commas or whitespace, stripping `@` prefixes and the backticks
 * that safe-output sanitization adds around mentions, and removing duplicates.
 */
function parseLogins(logins: string): string[] {
	const parsed = logins.split(/[\s,]+/).map(login => login.replace(/^`(@[^`]+)`$/, '$1').replace(/^@/, '')).filter(login => login);
	return [...new Map(parsed.map(login => [login.toLowerCase(), login])).values()];
}

/**
 * Runs `update` while holding a lock on `stateFile`. Each call of the agent's tool runs in its own
 * process, and the agent can make several calls at the same time.
 */
async function withStateLock<T>(stateFile: string, update: () => T): Promise<T> {
	const lockFile = `${stateFile}.lock`;
	for (let attempt = 0; ; attempt++) {
		try {
			closeSync(openSync(lockFile, 'wx'));
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt >= 100) {
				throw error;
			}
			await sleep(50);
		}
	}
	try {
		return update();
	} finally {
		rmSync(lockFile, { force: true });
	}
}

/**
 * Checks which of up to 10 logins are members of the team, for the agent to rank only team members.
 * Records the logins that it checks in `stateFile` before checking them, because each call runs in a
 * new process and calls can overlap, and checks at most 20 people per run.
 */
export async function checkTeamMembers(github: IGitHub, owner: string, repo: string, logins: string, stateFile: string): Promise<{ readonly members: string[]; readonly notMembers: string[]; readonly notChecked: string[] }> {
	const notChecked: string[] = [];
	const toCheck = await withStateLock(stateFile, () => {
		let checked: string[] = [];
		try {
			checked = JSON.parse(readFileSync(stateFile, 'utf8'));
		} catch {
			// The first check of the run.
		}
		const reserved: string[] = [];
		for (const [index, login] of parseLogins(logins).entries()) {
			if (index >= maxProposedOwners || (!checked.includes(login.toLowerCase()) && checked.length >= maxTeamMemberChecks)) {
				notChecked.push(login);
				continue;
			}
			if (!checked.includes(login.toLowerCase())) {
				checked.push(login.toLowerCase());
			}
			reserved.push(login);
		}
		writeFileSync(stateFile, JSON.stringify(checked));
		return reserved;
	});
	const members: string[] = [];
	const notMembers: string[] = [];
	for (const login of toCheck) {
		const check = await checkTeamMember(github, owner, repo, login);
		(check.eligible ? members : notMembers).push(login);
	}
	return { members, notMembers, notChecked };
}

function readAgentOutput(agentOutputPath: string, type: string, core: ICore): IAgentOutputItem | undefined {
	const output: { readonly items?: readonly IAgentOutputItem[] } = JSON.parse(readFileSync(agentOutputPath, 'utf8'));
	const calls = (output.items ?? []).filter(item => item.type === type);
	if (calls.length > 1) {
		core.warning(`The agent called ${type} ${calls.length} times; only the first is considered.`);
	}
	return calls[0];
}

function readProposedOwners(agentOutputPath: string, core: ICore): string[] {
	const assignees = readAgentOutput(agentOutputPath, 'assign_owner', core)?.assignees;
	return typeof assignees === 'string' ? parseLogins(assignees).slice(0, maxProposedOwners) : [];
}

interface ISafeOutputOptions {
	readonly agentOutputPath: string;
	readonly detectionConclusion: string;
	readonly staged: boolean;
}

function isDetectionSuccessful(options: ISafeOutputOptions, core: ICore): boolean {
	if (options.detectionConclusion !== 'success') {
		core.warning(`Not processing the output: threat detection concluded '${options.detectionConclusion}'.`);
		return false;
	}
	return true;
}

/**
 * Submits only an allowlisted area label as a suggestion through gh-aw's label handler.
 */
export async function suggestArea(github: IGitHub, context: IContext, core: ICore, options: ISafeOutputOptions, sanitize: (value: string) => string, suggest: (label: { name: string; rationale: string; confidence: string; suggest: true }) => Promise<void>): Promise<void> {
	if (!isDetectionSuccessful(options, core)) {
		return;
	}
	const item = readAgentOutput(options.agentOutputPath, 'suggest_area', core);
	if (!item || typeof item.label !== 'string' || !advisoryAreaLabels.includes(item.label) || typeof item.rationale !== 'string' || !item.rationale.trim() || typeof item.confidence !== 'string' || !['LOW', 'MEDIUM', 'HIGH'].includes(item.confidence)) {
		throw new Error('Invalid area label suggestion.');
	}
	const labelName = item.label;
	const issue = await getIssue(github, context, getIssueNumber(context));
	if (issue.pull_request || issue.state !== 'open' || getLabelNames(issue).some(label => label.toLowerCase() === labelName.toLowerCase())) {
		core.info('Not suggesting an area label for a closed issue, pull request, or existing label.');
		return;
	}
	await suggest({ name: item.label, rationale: sanitize(item.rationale), confidence: item.confidence, suggest: true });
}

/**
 * Publishes a translation once and marks it only after the comment exists.
 */
export async function publishTranslation(github: IGitHub, context: IContext, core: ICore, options: ISafeOutputOptions, sanitize: (value: string) => string): Promise<void> {
	if (!isDetectionSuccessful(options, core)) {
		return;
	}
	const item = readAgentOutput(options.agentOutputPath, 'publish_translation', core);
	if (!item || typeof item.body !== 'string' || !item.body.startsWith('## AI Translation:') || item.body.length > 65000) {
		throw new Error('Invalid translation output.');
	}
	const { owner, repo } = context.repo;
	const issueNumber = getIssueNumber(context);
	const issue = await getIssue(github, context, issueNumber);
	if (issue.pull_request || issue.state !== 'open' || getLabelNames(issue).some(label => ['ai-translated', '*english-please'].includes(label.toLowerCase()))) {
		core.info('Not publishing a translation for a closed, already translated issue or pull request.');
		return;
	}
	let existing = false;
	for (let page = 1; ; page++) {
		const { data: comments } = await github.request<readonly IComment[]>('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', { owner, repo, issue_number: issueNumber, per_page: 100, page });
		existing = comments.some(comment => comment.user?.id === githubActionsBotId && comment.body?.includes(translationMarker));
		if (existing || comments.length < 100) {
			break;
		}
	}
	if (options.staged) {
		core.info(`Staged mode: would ${existing ? 'mark the existing translation' : 'publish and mark a translation'} on #${issueNumber}.`);
		return;
	}
	if (!existing) {
		const body = `${sanitize(item.body)}\n\n${translationMarker}`;
		await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', { owner, repo, issue_number: issueNumber, body });
		core.info(`Published a translation on #${issueNumber}.`);
	}
	await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', { owner, repo, issue_number: issueNumber, labels: ['ai-translated'] });
	core.info(`Marked #${issueNumber} as translated.`);
}

/**
 * The inputs of `assignOwner`.
 */
export interface IAssignOwnerOptions extends ISafeOutputOptions { }

/**
 * Labels the issue `triage-needed`, so that a person triages it, unless it already has the label.
 */
async function requestTriage(github: IGitHub, context: IContext, core: ICore, issue: IIssue, staged: boolean): Promise<void> {
	if (getLabelNames(issue).some(label => label.toLowerCase() === 'triage-needed')) {
		core.info(`#${issue.number} keeps the triage-needed label.`);
		return;
	}
	if (staged) {
		core.info(`Staged mode: would label #${issue.number} triage-needed.`);
		return;
	}
	const { owner, repo } = context.repo;
	await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', { owner, repo, issue_number: issue.number, labels: ['triage-needed'] });
	core.info(`Labeled #${issue.number} triage-needed, so that a person triages it.`);
}

/**
 * Assigns the first owner that the agent proposed who is a member of the team, then removes the
 * `stale` and `triage-needed` labels. When nobody can be assigned, labels the issue `triage-needed`
 * instead, unless the issue no longer needs triage or somebody assigned it while triage was running.
 * Does nothing when threat detection flagged the agent output.
 */
export async function assignOwner(github: IGitHub, context: IContext, core: ICore, options: IAssignOwnerOptions): Promise<void> {
	const { owner, repo } = context.repo;
	const issueNumber = getIssueNumber(context);
	if (options.detectionConclusion !== 'success') {
		core.warning(`Not assigning anybody: threat detection concluded '${options.detectionConclusion}'.`);
		return;
	}
	const proposed = readProposedOwners(options.agentOutputPath, core);
	let issue = await getIssue(github, context, issueNumber);
	const ignoreReason = getIgnoreReason(issue);
	if (ignoreReason) {
		core.info(`Not assigning anybody because ${ignoreReason}.`);
		return;
	}
	if (issue.assignees?.length) {
		core.info('Not assigning anybody because the issue already has an assignee.');
		return;
	}
	let login: string | undefined;
	for (const candidate of proposed) {
		if ((await checkTeamMember(github, owner, repo, candidate)).eligible) {
			login = candidate;
			break;
		}
	}
	// Actions logs are public, so this doesn't log who is not on the team.
	if (!login) {
		core.warning(proposed.length ? 'Not assigning anybody: none of the proposed owners is a member of the team.' : 'Not assigning anybody: the agent did not find an owner.');
		return requestTriage(github, context, core, issue, options.staged);
	}
	if (options.staged) {
		core.info(`Staged mode: would assign ${login} to #${issueNumber} and remove the stale and triage-needed labels.`);
		return;
	}
	issue = await getIssue(github, context, issueNumber);
	const latestIgnoreReason = getIgnoreReason(issue);
	if (latestIgnoreReason || issue.assignees?.length) {
		core.info(`Not assigning anybody because ${latestIgnoreReason ?? 'the issue already has an assignee'}.`);
		return;
	}
	const { data: updated } = await github.request<IIssue>('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', { owner, repo, issue_number: issueNumber, assignees: [login] });
	if (!updated.assignees?.some(assignee => assignee.login.toLowerCase() === login.toLowerCase())) {
		core.warning(`GitHub did not assign ${login} to #${issueNumber}.`);
		return requestTriage(github, context, core, issue, options.staged);
	}
	if (updated.assignees.some(assignee => assignee.login.toLowerCase() !== login.toLowerCase())) {
		core.warning(`Another assignee appeared while assigning #${issueNumber}; leaving it for human triage.`);
		return requestTriage(github, context, core, updated, options.staged);
	}
	core.info(`Assigned ${login} to #${issueNumber}.`);
	for (const label of getLabelNames(issue).filter(name => ['stale', 'triage-needed'].includes(name.toLowerCase()))) {
		try {
			await github.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', { owner, repo, issue_number: issueNumber, name: label });
		} catch (error) {
			if (getStatus(error) !== 404) {
				throw error;
			}
		}
	}
}

/**
 * Runs the operation of the `.github/actions/issue-triage` action that the `OPERATION` environment variable names.
 */
export async function run(github: IGitHub, context: IContext, core: ICore, env: NodeJS.ProcessEnv, runtime: IGitHubScriptRuntime): Promise<void> {
	const options = {
		agentOutputPath: env.GH_AW_AGENT_OUTPUT ?? '',
		detectionConclusion: env.DETECTION_CONCLUSION ?? '',
		staged: env.GH_AW_SAFE_OUTPUTS_STAGED === 'true',
	};
	switch (env.OPERATION) {
		case 'check-issue':
			return checkIssue(github, context, core);
		case 'assign-owner':
			return assignOwner(github, context, core, options);
		case 'suggest-area':
		case 'publish-translation': {
			if (!env.RUNNER_TEMP) {
				throw new Error('RUNNER_TEMP is required to load the safe-output handlers.');
			}
			const require = createRequire(import.meta.url);
			const actionsDir = path.join(env.RUNNER_TEMP, 'gh-aw', 'actions');
			const { setupGlobals } = require(path.join(actionsDir, 'setup_globals.cjs'));
			setupGlobals(core, github, context, runtime.exec, runtime.io, runtime.getOctokit);
			const { sanitizeContent } = require(path.join(actionsDir, 'sanitize_content.cjs'));
			if (env.OPERATION === 'suggest-area') {
				const { main } = require(path.join(actionsDir, 'add_labels.cjs'));
				const handler = await main({ allowed: advisoryAreaLabels, issue_intent: true, target: String(getIssueNumber(context)), max: 1, staged: options.staged });
				return suggestArea(github, context, core, options, sanitizeContent, async label => {
					const result = await handler({ labels: [label] }, {});
					if (!result.success || result.skipped) {
						throw new Error(`Failed to suggest the area label: ${result.error || result.reason || 'unknown error'}`);
					}
				});
			}
			const { enforceCommentLimits } = require(path.join(actionsDir, 'comment_limit_helpers.cjs'));
			return publishTranslation(github, context, core, options, value => {
				const sanitized = sanitizeContent(value);
				enforceCommentLimits(sanitized);
				return sanitized;
			});
		}
		default:
			core.setFailed(`Unknown operation: ${env.OPERATION}`);
	}
}
