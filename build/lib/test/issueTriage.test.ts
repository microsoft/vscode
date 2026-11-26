/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { advisoryAreaLabels, assignOwner, checkIssue, checkTeamMember, checkTeamMembers, getSkipReason, publishTranslation, run, suggestArea, type IIssue } from '../../../.github/actions/issue-triage/issueTriage.ts';

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
			'placeholder assignee': 'it is already assigned',
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

	test('manual dispatch validates the issue number and preserves eligibility checks', async () => {
		const results: Record<string, { calls: string[]; outputs: Record<string, string> }> = {};
		const invalidInputs = [undefined, '', '0', '-1', '1.5', '1e2', ' 200', '0200', '9007199254740992', '200; echo injected'];
		for (const [name, current] of [
			['eligible', issue(200)],
			['closed', issue(200, { state: 'closed' })],
			['assigned', issue(200, { assignees: [{ login: 'someone' }] })],
			['ignored', issue(200, { labels: ['ai-triaged'] })],
			['pull request', issue(200, { pull_request: {} })],
			['missing', 404],
		] as const) {
			const github = new FakeGitHub(() => current);
			const core = new FakeCore();
			await checkIssue(github, { ...context, eventName: 'workflow_dispatch', payload: { inputs: { issue_number: '200' } } }, core, 0);
			results[name] = { calls: github.calls, outputs: core.outputs };
		}
		for (const input of invalidInputs) {
			const github = new FakeGitHub(() => issue(200));
			const core = new FakeCore();
			await assert.rejects(checkIssue(github, { ...context, eventName: 'workflow_dispatch', payload: { inputs: { issue_number: input } } }, core, 0), /issue_number must be a positive safe integer/);
			results[`invalid: ${input}`] = { calls: github.calls, outputs: core.outputs };
		}
		assert.deepStrictEqual(results, {
			...Object.fromEntries(['eligible', 'closed', 'assigned', 'ignored', 'pull request', 'missing'].map(name => [name, {
				calls: ['GET /repos/microsoft/vscode/issues/200'],
				outputs: { issue_number: '200', proceed: name === 'eligible' ? 'true' : 'false' },
			}])),
			...Object.fromEntries(invalidInputs.map(input => [`invalid: ${input}`, { calls: [], outputs: {} }])),
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
				['assigns the first member', '@Former-Member, member, admin-member', ['triage-needed', 'stale'], [], false, 'success'],
				['sanitized mentions', '`@other-team-writer`, `@member`, admin-member', ['stale'], [], false, 'success'],
				['malformed or blocked mentions', '`@member, @member`, `@member`suffix, `@copilot`, `@renovate[bot]`', ['stale'], [], false, 'success'],
				['staged', 'member', ['triage-needed', 'stale'], [], true, 'success'],
				['threat detection flagged the output', 'member', ['stale'], [], false, 'warning'],
				['nobody on the team in the first 10', `copilot other-team-writer, former-member, ${externals.join(', ')}, member`, ['stale'], [], false, 'success'],
				['no owner found', undefined, ['stale'], [], false, 'success'],
				['no owner found, still labeled triage-needed', '', ['triage-needed'], [], false, 'success'],
				['placeholder remains assigned', 'member', ['triage-needed', 'stale'], ['placeholder'], false, 'success'],
				['assigned while triage ran', 'member', ['stale'], ['someone'], false, 'success'],
			] as const) {
				const agentOutputPath = path.join(directory, 'agent-output.json');
				writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'add_labels', labels: ['~info-needed'] }, { type: 'assign_owner', assignees }] }));
				const github = new FakeGitHub(call => {
					if (call === 'GET /repos/microsoft/vscode/issues/100') {
						return issue(100, { labels: labels.map(label => ({ name: label })), assignees: currentAssignees.map(login => ({ login })) });
					}
					if (call === 'POST /repos/microsoft/vscode/issues/100/assignees') {
						return issue(100, { assignees: [{ login: 'member' }] });
					}
					return handlePermission(call) ?? {};
				});
				const core = new FakeCore();
				const payload = { action: 'labeled', label: { name: 'stale' }, issue: { number: 100 } };
				const assignmentContext = name === 'assigns the first member'
					? { ...context, eventName: 'workflow_dispatch', payload: { inputs: { issue_number: '100' } } }
					: { ...context, payload };
				await assignOwner(github, assignmentContext, core, { agentOutputPath, detectionConclusion, staged });
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
				'placeholder remains assigned': ['Not assigning anybody because the issue already has an assignee.'],
				'assigned while triage ran': ['Not assigning anybody because the issue already has an assignee.'],
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('enforces allowlisted area suggestions regardless of agent-supplied flags', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const agentOutputPath = path.join(directory, 'agent-output.json');
			const github = new FakeGitHub(() => issue(100));
			const core = new FakeCore();
			const options = { agentOutputPath, detectionConclusion: 'success', staged: false };
			const suggestions: object[] = [];
			const suggest = async (label: object) => { suggestions.push(label); };
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'suggest_area', label: 'terminal', rationale: '@someone', confidence: 'HIGH', suggest: false }] }));
			await suggestArea(github, context, core, options, value => `sanitized:${value}`, suggest);
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'suggest_area', label: '~spam', rationale: 'reason', confidence: 'HIGH' }] }));
			await assert.rejects(suggestArea(github, context, core, options, value => value, suggest), /Invalid area label suggestion/);
			await suggestArea(github, context, core, { ...options, detectionConclusion: 'warning' }, value => value, suggest);
			assert.deepStrictEqual(suggestions, [{ name: 'terminal', rationale: 'sanitized:@someone', confidence: 'HIGH', suggest: true }]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('dispatches safe outputs through the gh-aw handlers', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const actionsDir = path.join(directory, 'gh-aw', 'actions');
			mkdirSync(actionsDir, { recursive: true });
			writeFileSync(path.join(actionsDir, 'setup_globals.cjs'), `
				const fs = require('node:fs');
				const path = require('node:path');
				exports.setupGlobals = (core, github, context, exec, io, getOctokit) => {
					fs.writeFileSync(path.join(__dirname, 'globals.json'), JSON.stringify({ exec, io, getOctokit: typeof getOctokit }));
				};
			`);
			writeFileSync(path.join(actionsDir, 'sanitize_content.cjs'), `
				exports.sanitizeContent = value => value.replace('@someone', '\`@someone\`');
			`);
			writeFileSync(path.join(actionsDir, 'add_labels.cjs'), `
				const fs = require('node:fs');
				const path = require('node:path');
				exports.main = async options => async (input, context) => {
					fs.writeFileSync(path.join(__dirname, 'label.json'), JSON.stringify({ options, input, context }));
					return JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
				};
			`);
			writeFileSync(path.join(actionsDir, 'comment_limit_helpers.cjs'), `
				exports.enforceCommentLimits = value => {
					if (value.includes('too long')) { throw new Error('comment limit'); }
				};
			`);
			const agentOutputPath = path.join(directory, 'agent-output.json');
			const env = { RUNNER_TEMP: directory, GH_AW_AGENT_OUTPUT: agentOutputPath, DETECTION_CONCLUSION: 'success', GH_AW_SAFE_OUTPUTS_STAGED: 'false' };
			const runtime = { exec: { name: 'exec' }, io: { name: 'io' }, getOctokit: () => ({}) };
			const dispatchContext = { ...context, eventName: 'workflow_dispatch', payload: { inputs: { issue_number: '100' } } };
			const writes: Parameters[] = [];
			const github = new FakeGitHub((call, parameters) => {
				if (call === 'GET /repos/microsoft/vscode/issues/100') {
					return issue(100);
				}
				if (call.startsWith('GET')) {
					return [];
				}
				writes.push(parameters);
				return {};
			});
			const core = new FakeCore();
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'suggest_area', label: 'terminal', rationale: '@someone', confidence: 'HIGH' }] }));
			writeFileSync(path.join(actionsDir, 'result.json'), JSON.stringify({ success: true }));
			await run(github, dispatchContext, core, { ...env, OPERATION: 'suggest-area' }, runtime);
			assert.deepStrictEqual({
				globals: JSON.parse(readFileSync(path.join(actionsDir, 'globals.json'), 'utf8')),
				label: JSON.parse(readFileSync(path.join(actionsDir, 'label.json'), 'utf8')),
			}, {
				globals: { exec: { name: 'exec' }, io: { name: 'io' }, getOctokit: 'function' },
				label: {
					options: { allowed: advisoryAreaLabels, issue_intent: true, target: '100', max: 1, staged: false },
					input: { labels: [{ name: 'terminal', rationale: '`@someone`', confidence: 'HIGH', suggest: true }] },
					context: {},
				},
			});
			writeFileSync(path.join(actionsDir, 'result.json'), JSON.stringify({ success: true, skipped: true, reason: 'not sent' }));
			await assert.rejects(run(github, context, core, { ...env, OPERATION: 'suggest-area' }, runtime), /Failed to suggest the area label: not sent/);
			writeFileSync(path.join(actionsDir, 'result.json'), JSON.stringify({ success: true }));
			await run(github, context, core, { ...env, OPERATION: 'suggest-area', GH_AW_SAFE_OUTPUTS_STAGED: 'true' }, runtime);
			assert.strictEqual(JSON.parse(readFileSync(path.join(actionsDir, 'label.json'), 'utf8')).options.staged, true);
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'publish_translation', body: '## AI Translation:\n\nHello @someone' }] }));
			await run(github, context, core, { ...env, OPERATION: 'publish-translation', DETECTION_CONCLUSION: 'warning' }, runtime);
			assert.strictEqual(writes.length, 0);
			await run(github, dispatchContext, core, { ...env, OPERATION: 'publish-translation' }, runtime);
			assert.deepStrictEqual(writes.map(parameters => ({ issue_number: parameters.issue_number, value: parameters.body ?? parameters.labels })), [
				{ issue_number: 100, value: '## AI Translation:\n\nHello `@someone`\n\n<!-- vscode-issue-triage-translation -->' },
				{ issue_number: 100, value: ['ai-translated'] },
			]);
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'publish_translation', body: '## AI Translation:\n\ntoo long' }] }));
			await assert.rejects(run(github, context, core, { ...env, OPERATION: 'publish-translation' }, runtime), /comment limit/);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('does not assign an owner if someone is assigned during the membership check', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const agentOutputPath = path.join(directory, 'agent-output.json');
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'assign_owner', assignees: 'member' }] }));
			let issueReads = 0;
			const github = new FakeGitHub(call => {
				if (call === 'GET /repos/microsoft/vscode/issues/100') {
					issueReads++;
					return issue(100, issueReads === 1 ? {} : { assignees: [{ login: 'someone' }] });
				}
				return handlePermission(call) ?? {};
			});
			const core = new FakeCore();
			await assignOwner(github, context, core, { agentOutputPath, detectionConclusion: 'success', staged: false });
			assert.deepStrictEqual(github.calls, [
				'GET /repos/microsoft/vscode/issues/100',
				'GET /repos/microsoft/vscode/collaborators/member/permission',
				'GET /repos/microsoft/vscode/issues/100',
			]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('keeps triage-needed if another assignee appears during assignment', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const agentOutputPath = path.join(directory, 'agent-output.json');
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'assign_owner', assignees: 'member' }] }));
			const github = new FakeGitHub(call => {
				if (call === 'GET /repos/microsoft/vscode/issues/100') {
					return issue(100, { labels: ['triage-needed', 'stale'] });
				}
				if (call === 'POST /repos/microsoft/vscode/issues/100/assignees') {
					return issue(100, { labels: ['triage-needed', 'stale'], assignees: [{ login: 'someone' }, { login: 'member' }] });
				}
				return handlePermission(call) ?? {};
			});
			const core = new FakeCore();
			await assignOwner(github, context, core, { agentOutputPath, detectionConclusion: 'success', staged: false });
			assert.deepStrictEqual({
				writes: github.calls.filter(call => !call.startsWith('GET')),
				messages: core.messages,
			}, {
				writes: ['POST /repos/microsoft/vscode/issues/100/assignees'],
				messages: ['warning: Another assignee appeared while assigning #100; leaving it for human triage.', '#100 keeps the triage-needed label.'],
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('marks a translation only after publication and recovers from label failure without a duplicate', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const agentOutputPath = path.join(directory, 'agent-output.json');
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'publish_translation', body: '## AI Translation:\n\nHello @someone' }] }));
			const options = { agentOutputPath, detectionConclusion: 'success', staged: false };
			const core = new FakeCore();
			const marker = '<!-- vscode-issue-triage-translation -->';
			let comment: string | undefined;
			let failComment = true;
			let failLabel = true;
			const github = new FakeGitHub((call, parameters) => {
				if (call === 'GET /repos/microsoft/vscode/issues/100') {
					return issue(100);
				}
				if (call.endsWith('/comments') && call.startsWith('GET')) {
					return comment ? [{ body: comment, user: { id: 41898282 } }] : [{ body: marker, user: { id: 1 } }];
				}
				if (call.endsWith('/comments') && call.startsWith('POST')) {
					if (failComment) {
						return 423;
					}
					comment = String(parameters.body);
					return {};
				}
				if (call.endsWith('/labels') && failLabel) {
					return 500;
				}
				return {};
			});
			const sanitize = (value: string) => value.replace('@someone', '`@someone`');
			await assert.rejects(publishTranslation(github, context, core, options, sanitize), /HTTP 423/);
			failComment = false;
			await assert.rejects(publishTranslation(github, context, core, options, sanitize), /HTTP 500/);
			failLabel = false;
			await publishTranslation(github, context, core, options, sanitize);
			assert.deepStrictEqual({
				comment,
				writes: github.calls.filter(call => call.startsWith('POST')),
			}, {
				comment: `## AI Translation:\n\nHello \`@someone\`\n\n${marker}`,
				writes: [
					'POST /repos/microsoft/vscode/issues/100/comments',
					'POST /repos/microsoft/vscode/issues/100/comments',
					'POST /repos/microsoft/vscode/issues/100/labels',
					'POST /repos/microsoft/vscode/issues/100/labels',
				],
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('finds an existing translation on later pages and does not write in staged or failed detection runs', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'issue-triage-'));
		try {
			const agentOutputPath = path.join(directory, 'agent-output.json');
			writeFileSync(agentOutputPath, JSON.stringify({ items: [{ type: 'publish_translation', body: '## AI Translation:\n\nHello' }] }));
			const options = { agentOutputPath, detectionConclusion: 'success', staged: false };
			const core = new FakeCore();
			const github = new FakeGitHub((call, parameters) => {
				if (call === 'GET /repos/microsoft/vscode/issues/100') {
					return issue(100);
				}
				if (call.startsWith('GET') && call.endsWith('/comments')) {
					return parameters.page === 1
						? Array.from({ length: 100 }, () => ({ body: 'comment', user: { id: 1 } }))
						: [{ body: '<!-- vscode-issue-triage-translation -->', user: { id: 41898282 } }];
				}
				return {};
			});
			await publishTranslation(github, context, core, { ...options, detectionConclusion: 'warning' }, value => value);
			await publishTranslation(github, context, core, { ...options, staged: true }, value => value);
			await publishTranslation(github, context, core, options, value => value);
			assert.deepStrictEqual(github.calls, [
				'GET /repos/microsoft/vscode/issues/100',
				'GET /repos/microsoft/vscode/issues/100/comments',
				'GET /repos/microsoft/vscode/issues/100/comments',
				'GET /repos/microsoft/vscode/issues/100',
				'GET /repos/microsoft/vscode/issues/100/comments',
				'GET /repos/microsoft/vscode/issues/100/comments',
				'POST /repos/microsoft/vscode/issues/100/labels',
			]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
