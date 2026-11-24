/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { assignOwner, checkIssue, checkTeamMember, checkTeamMembers, getSkipReason, type IIssue } from '../../../.github/actions/issue-triage/issueTriage.ts';

type Parameters = Readonly<Record<string, string | number | readonly string[]>>;

/** Returns the response data, or the HTTP status of an error. */
type Handler = (route: string, parameters: Parameters) => object | number;

class FakeGitHub {
	readonly calls: string[] = [];
	private readonly handler: Handler;

	constructor(handler: Handler) {
		this.handler = handler;
	}

	async request<T>(route: string, parameters: Parameters = {}): Promise<{ readonly data: T }> {
		const call = route.replace(/\{(?<name>\w+)\}/g, (_, name: string) => String(parameters[name]));
		this.calls.push(call);
		const response = this.handler(call, parameters);
		if (typeof response === 'number') {
			throw Object.assign(new Error(`HTTP ${response}`), { status: response });
		}
		return { data: response as T };
	}
}

class FakeCore {
	readonly messages: string[] = [];
	readonly outputs: Record<string, string> = {};

	info(message: string): void {
		this.messages.push(message);
	}

	warning(message: string): void {
		this.messages.push(`warning: ${message}`);
	}

	setOutput(name: string, value: string): void {
		this.outputs[name] = value;
	}

	setFailed(message: string): void {
		this.messages.push(`failed: ${message}`);
	}
}

function issue(number: number, overrides: Partial<IIssue> = {}): IIssue {
	return { number, title: `Issue ${number}`, state: 'open', labels: [], assignees: [], ...overrides };
}

const context = { repo: { owner: 'microsoft', repo: 'vscode' }, payload: { action: 'opened', issue: { number: 100 } } };

/**
 * Answers the permission check for the people of the fake repository: team members, a person with
 * write access through another team, a former team member, and an external contributor.
 */
function handlePermission(call: string): object | number | undefined {
	const roles: Record<string, [permission: string, role: string]> = {
		'admin-member': ['admin', 'admin'],
		'member': ['write', 'Security Maintainer'],
		'other-team-writer': ['write', 'write'],
		'former-member': ['read', 'read'],
	};
	const login = /^GET \/repos\/microsoft\/vscode\/collaborators\/(?<login>[^/]+)\/permission$/.exec(call)?.groups?.login;
	if (!login) {
		return undefined;
	}
	return roles[login] ? { permission: roles[login][0], role_name: roles[login][1], user: { login, type: 'User' } } : 404;
}

suite('Issue Triage', () => {

	test('skips issues that are handled elsewhere or already assigned', () => {
		const cases: Record<string, IIssue> = {
			'new issue': issue(1),
			'closed': issue(2, { state: 'closed' }),
			'spam': issue(3, { labels: [{ name: '~spam' }] }),
			'service category': issue(4, { labels: ['~chat-rate-limiting'] }),
			'chat label': issue(5, { labels: [{ name: 'chat-tools' }] }),
			'test plan item': issue(6, { labels: [{ name: 'Testplan-Item' }] }),
			'test plan title': issue(7, { title: 'TPI: Check the new view' }),
			'assigned': issue(8, { assignees: [{ login: 'someone' }] }),
			'placeholder assignee': issue(9, { assignees: [{ login: 'someone' }], labels: [{ name: 'triage-needed' }, { name: 'stale' }] }),
		};
		assert.deepStrictEqual(Object.fromEntries(Object.entries(cases).map(([name, value]) => [name, getSkipReason(value) ?? 'triage'])), {
			'new issue': 'triage',
			'closed': 'it is closed',
			'spam': 'it has the label ~spam',
			'service category': 'it has the label ~chat-rate-limiting',
			'chat label': 'it has the label chat-tools',
			'test plan item': 'it has the label Testplan-Item',
			'test plan title': 'it is a test plan item or an iteration plan',
			'assigned': 'it is already assigned',
			'placeholder assignee': 'triage',
		});
	});

	test('re-reads the issue after the delay, and ignores labels other than stale', async () => {
		const results: Record<string, { calls: string[]; proceed?: string }> = {};
		for (const [name, payload, current] of [
			['opened', { action: 'opened', issue: { number: 100 } }, issue(100)],
			['assigned during the delay', { action: 'opened', issue: { number: 100 } }, issue(100, { assignees: [{ login: 'someone' }] })],
			['stale', { action: 'labeled', label: { name: 'stale' }, issue: { number: 100 } }, issue(100, { labels: ['stale'] })],
			['other label', { action: 'labeled', label: { name: 'bug' }, issue: { number: 100 } }, issue(100)],
		] as const) {
			const github = new FakeGitHub(() => current);
			const core = new FakeCore();
			await checkIssue(github, { ...context, payload }, core, 0);
			results[name] = { calls: github.calls, proceed: core.outputs.proceed };
		}
		assert.deepStrictEqual(results, {
			'opened': { calls: ['GET /repos/microsoft/vscode/issues/100'], proceed: 'true' },
			'assigned during the delay': { calls: ['GET /repos/microsoft/vscode/issues/100'], proceed: 'false' },
			'stale': { calls: ['GET /repos/microsoft/vscode/issues/100'], proceed: 'true' },
			'other label': { calls: [], proceed: 'false' },
		});
	});

	test('only members of the team are eligible, by their role in the repository', async () => {
		const github = new FakeGitHub(call => handlePermission(call) ?? 404);
		const results: Record<string, string> = {};
		for (const login of ['admin-member', 'member', 'other-team-writer', 'former-member', 'external', 'copilot', 'renovate[bot]']) {
			const check = await checkTeamMember(github, 'microsoft', 'vscode', login);
			results[login] = `${check.eligible}: ${check.reason}`;
		}
		assert.deepStrictEqual(results, {
			'admin-member': 'true: admin role',
			'member': 'true: Security Maintainer role',
			'other-team-writer': 'false: write role',
			'former-member': 'false: read role',
			'external': 'false: not a collaborator',
			'copilot': 'false: blocked',
			'renovate[bot]': 'false: blocked',
		});
	});

	test('tells the agent which people are members of the team, checking at most 20 per run', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const stateFile = path.join(directory, 'team-checks.json');
			const github = new FakeGitHub(call => handlePermission(call) ?? 404);
			const externals = Array.from({ length: 20 }, (_, index) => `external-${index}`);
			const results = [
				await checkTeamMembers(github, 'microsoft', 'vscode', '@member, other-team-writer former-member, member, copilot', stateFile),
				await checkTeamMembers(github, 'microsoft', 'vscode', '`@member`, @member, member, `@other-team-writer`', stateFile),
				await checkTeamMembers(github, 'microsoft', 'vscode', externals.slice(0, 12).join(','), stateFile),
				await checkTeamMembers(github, 'microsoft', 'vscode', [...externals.slice(10, 18), 'member', 'admin-member'].join(','), stateFile),
			];
			assert.deepStrictEqual(results, [
				{ members: ['member'], notMembers: ['other-team-writer', 'former-member', 'copilot'], notChecked: [] },
				{ members: ['member'], notMembers: ['other-team-writer'], notChecked: [] },
				{ members: [], notMembers: externals.slice(0, 10), notChecked: externals.slice(10, 12) },
				{ members: ['member'], notMembers: externals.slice(10, 16), notChecked: [...externals.slice(16, 18), 'admin-member'] },
			]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('overlapping team member checks also check at most 20 people per run', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const stateFile = path.join(directory, 'team-checks.json');
			const github = new FakeGitHub(call => handlePermission(call) ?? 404);
			const batches = Array.from({ length: 3 }, (_, batch) => Array.from({ length: 10 }, (_, index) => `external-${batch * 10 + index}`).join(','));
			const results = await Promise.all(batches.map(batch => checkTeamMembers(github, 'microsoft', 'vscode', batch, stateFile)));
			assert.deepStrictEqual({ checks: github.calls.length, notChecked: results.map(result => result.notChecked.length) }, { checks: 20, notChecked: [0, 0, 10] });
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('assigns the first proposed owner who is a member of the team, or else requests triage', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const externals = Array.from({ length: 7 }, (_, index) => `external-${index}`);
			const results: Record<string, string[]> = {};
			for (const [name, assignees, labels, currentAssignees, staged, detectionConclusion] of [
				['assigns the first member', '@Former-Member, member, admin-member', ['triage-needed', 'stale'], ['placeholder'], false, 'success'],
				['sanitized mentions', '`@other-team-writer`, `@member`, admin-member', ['stale'], ['placeholder'], false, 'success'],
				['malformed or blocked mentions', '`@member, @member`, `@member`suffix, `@copilot`, `@renovate[bot]`', ['stale'], ['placeholder'], false, 'success'],
				['staged', 'member', ['triage-needed', 'stale'], ['placeholder'], true, 'success'],
				['threat detection flagged the output', 'member', ['stale'], ['placeholder'], false, 'warning'],
				['nobody on the team in the first 10', `copilot other-team-writer, former-member, ${externals.join(', ')}, member`, ['stale'], ['placeholder'], false, 'success'],
				['no owner found', undefined, ['stale'], ['placeholder'], false, 'success'],
				['no owner found, still labeled triage-needed', '', ['triage-needed'], ['placeholder'], false, 'success'],
				['assigned while triage ran', 'member', ['stale'], ['placeholder', 'someone'], false, 'success'],
			] as const) {
				const agentOutputPath = path.join(directory, 'agent-output.json');
				writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'add_labels', labels: ['~info-needed'] }, { type: 'assign_owner', assignees }] }));
				const github = new FakeGitHub(call => {
					if (call === 'GET /repos/microsoft/vscode/issues/100') {
						return issue(100, { labels: labels.map(label => ({ name: label })), assignees: currentAssignees.map(login => ({ login })) });
					}
					if (call === 'POST /repos/microsoft/vscode/issues/100/assignees') {
						return issue(100, { assignees: [{ login: 'placeholder' }, { login: 'member' }] });
					}
					return handlePermission(call) ?? {};
				});
				const core = new FakeCore();
				const payload = { action: 'labeled', label: { name: 'stale' }, issue: { number: 100, assignees: [{ login: 'placeholder' }] } };
				await assignOwner(github, { ...context, payload }, core, { agentOutputPath, detectionConclusion, staged });
				results[name] = [...github.calls.filter(call => call !== 'GET /repos/microsoft/vscode/issues/100'), ...core.messages];
			}
			assert.deepStrictEqual(results, {
				'assigns the first member': [
					'GET /repos/microsoft/vscode/collaborators/Former-Member/permission',
					'GET /repos/microsoft/vscode/collaborators/member/permission',
					'POST /repos/microsoft/vscode/issues/100/assignees',
					'DELETE /repos/microsoft/vscode/issues/100/labels/triage-needed',
					'DELETE /repos/microsoft/vscode/issues/100/labels/stale',
					'Assigned member to #100.',
				],
				'sanitized mentions': [
					'GET /repos/microsoft/vscode/collaborators/other-team-writer/permission',
					'GET /repos/microsoft/vscode/collaborators/member/permission',
					'POST /repos/microsoft/vscode/issues/100/assignees',
					'DELETE /repos/microsoft/vscode/issues/100/labels/stale',
					'Assigned member to #100.',
				],
				'malformed or blocked mentions': [
					'POST /repos/microsoft/vscode/issues/100/labels',
					'warning: Not assigning anybody: none of the proposed owners is a member of the team.',
					'Labeled #100 triage-needed, so that a person triages it.',
				],
				'staged': [
					'GET /repos/microsoft/vscode/collaborators/member/permission',
					'Staged mode: would assign member to #100 and remove the stale and triage-needed labels.',
				],
				'threat detection flagged the output': ['warning: Not assigning anybody: threat detection concluded \'warning\'.'],
				'nobody on the team in the first 10': [
					...['other-team-writer', 'former-member', ...externals].map(login => `GET /repos/microsoft/vscode/collaborators/${login}/permission`),
					'POST /repos/microsoft/vscode/issues/100/labels',
					'warning: Not assigning anybody: none of the proposed owners is a member of the team.',
					'Labeled #100 triage-needed, so that a person triages it.',
				],
				'no owner found': [
					'POST /repos/microsoft/vscode/issues/100/labels',
					'warning: Not assigning anybody: the agent did not find an owner.',
					'Labeled #100 triage-needed, so that a person triages it.',
				],
				'no owner found, still labeled triage-needed': [
					'warning: Not assigning anybody: the agent did not find an owner.',
					'#100 keeps the triage-needed label.',
				],
				'assigned while triage ran': ['Not assigning anybody because the issue was assigned while triage was running.'],
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
