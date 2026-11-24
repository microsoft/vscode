/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Deterministic steps of the Issue Triage agentic workflow (.github/workflows/issue-triage.md). They
// only use the workflow's GITHUB_TOKEN.

import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

type RequestParameters = Readonly<Record<string, string | number | readonly string[]>>;

interface IGitHub {
	request<T>(route: string, parameters?: RequestParameters): Promise<{ readonly data: T }>;
}

interface IUser {
	readonly login: string;
	readonly type?: string;
}

interface IContext {
	readonly repo: { readonly owner: string; readonly repo: string };
	readonly payload: {
		readonly action?: string;
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

export interface IIssue {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly labels: readonly ({ readonly name: string } | string)[];
	readonly assignees?: readonly IUser[] | null;
	readonly pull_request?: object;
}

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
 * Returns why the issue doesn't need triage, or `undefined` when it does. An assigned issue only needs
 * triage when it is labeled `triage-needed`, which marks its assignee as a placeholder.
 */
export function getSkipReason(issue: IIssue): string | undefined {
	const reason = getIgnoreReason(issue);
	if (reason) {
		return reason;
	}
	if (issue.assignees?.length && !getLabelNames(issue).some(label => label.toLowerCase() === 'triage-needed')) {
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
 * triage. Only `opened` events and the `stale` label trigger triage.
 */
export async function checkIssue(github: IGitHub, context: IContext, core: ICore, delayMs = triageDelayMs): Promise<void> {
	const issueNumber = getIssueNumber(context);
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

/**
 * Reads the owners, best first, that the agent proposed with the `assign-owner` safe output. Only the
 * first call counts.
 */
function readProposedOwners(agentOutputPath: string, core: ICore): string[] {
	const output: { readonly items?: readonly { readonly type?: string; readonly assignees?: unknown }[] } = JSON.parse(readFileSync(agentOutputPath, 'utf8'));
	const calls = (output.items ?? []).filter(item => item.type === 'assign_owner');
	if (calls.length > 1) {
		core.warning(`The agent proposed owners ${calls.length} times; only the first is considered.`);
	}
	const assignees = calls[0]?.assignees;
	return typeof assignees === 'string' ? parseLogins(assignees).slice(0, maxProposedOwners) : [];
}

/**
 * The inputs of `assignOwner`.
 */
export interface IAssignOwnerOptions {
	readonly agentOutputPath: string;
	/** The conclusion of threat detection, which is `warning` when it flagged the agent output. */
	readonly detectionConclusion: string;
	/** Whether to only log the assignment. */
	readonly staged: boolean;
}

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
	const issue = await getIssue(github, context, issueNumber);
	const ignoreReason = getIgnoreReason(issue);
	if (ignoreReason) {
		core.info(`Not assigning anybody because ${ignoreReason}.`);
		return;
	}
	// `triage-needed` may already be removed by the other safe outputs, so compare with the assignees of the event instead.
	const previous = (context.payload.issue?.assignees ?? []).map(assignee => assignee.login.toLowerCase());
	if ((issue.assignees ?? []).some(assignee => !previous.includes(assignee.login.toLowerCase()))) {
		core.info('Not assigning anybody because the issue was assigned while triage was running.');
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
	const { data: updated } = await github.request<IIssue>('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', { owner, repo, issue_number: issueNumber, assignees: [login] });
	if (!updated.assignees?.some(assignee => assignee.login.toLowerCase() === login.toLowerCase())) {
		core.warning(`GitHub did not assign ${login} to #${issueNumber}.`);
		return requestTriage(github, context, core, issue, options.staged);
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
export async function run(github: IGitHub, context: IContext, core: ICore, env: NodeJS.ProcessEnv): Promise<void> {
	switch (env.OPERATION) {
		case 'check-issue':
			return checkIssue(github, context, core);
		case 'assign-owner':
			return assignOwner(github, context, core, {
				agentOutputPath: env.GH_AW_AGENT_OUTPUT ?? '',
				detectionConclusion: env.DETECTION_CONCLUSION ?? '',
				staged: env.GH_AW_SAFE_OUTPUTS_STAGED === 'true',
			});
		default:
			core.setFailed(`Unknown operation: ${env.OPERATION}`);
	}
}
