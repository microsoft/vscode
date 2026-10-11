/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');

interface IRun {
	id: number;
	head_sha: string;
	head_branch: string;
	path: string;
	event: string;
	created_at: string;
	updated_at?: string;
	status: string;
	conclusion?: string;
}

function action(run: IRun, id: number, head: string, now: number): 'complete' | 'cancel' | 'poll' {
	assert.equal(run.id, id);
	assert.equal(run.head_sha, head);
	assert.equal(run.head_branch, 'roblou/agents/tmpfs-holder-oss-native-20261011');
	assert.equal(run.path, '.github/workflows/tmpfs-holder-oss-probe.yml');
	assert.equal(run.event, 'workflow_dispatch');
	const queuedAt = Date.parse(run.created_at);
	assert.ok(Number.isFinite(queuedAt), 'Require the actual original service timestamp');
	if (run.status === 'completed') {
		assert.ok(run.updated_at && Date.parse(run.updated_at) <= queuedAt + 60 * 60 * 1000, 'Service reported completion beyond the original absolute budget');
		return 'complete';
	}
	assert.ok(now < queuedAt + 60 * 60 * 1000, 'The original absolute budget expired before service completion');
	return now >= queuedAt + 55 * 60 * 1000 ? 'cancel' : 'poll';
}

function selfTest(): void {
	const head = 'a'.repeat(40);
	const run: IRun = { id: 42, head_sha: head, head_branch: 'roblou/agents/tmpfs-holder-oss-native-20261011', path: '.github/workflows/tmpfs-holder-oss-probe.yml', event: 'workflow_dispatch', created_at: '2026-10-11T00:00:00Z', status: 'in_progress' };
	const start = Date.parse(run.created_at);
	assert.equal(action(run, 42, head, start + 55 * 60 * 1000 - 1), 'poll');
	assert.equal(action(run, 42, head, start + 55 * 60 * 1000), 'cancel');
	assert.equal(action({ ...run, status: 'completed', updated_at: '2026-10-11T00:59:00Z' }, 42, head, start + 59 * 60 * 1000), 'complete');
	assert.throws(() => action({ ...run, status: 'completed', updated_at: '2026-10-11T01:01:00Z' }, 42, head, start + 61 * 60 * 1000));
	for (const changed of [{ id: 43 }, { head_sha: 'b'.repeat(40) }, { head_branch: 'parent' }, { path: 'another.yml' }, { event: 'push' }, { created_at: 'invalid' }]) {
		assert.throws(() => action({ ...run, ...changed }, 42, head, start));
	}
	assert.throws(() => action(run, 42, head, start + 60 * 60 * 1000));
	console.log('OSS watchdog contracts passed: exact run/ref/head/workflow/event and original +55/+60-minute bounds.');
}

let cancellationRequested = false;

function watch(id: number, head: string): void {
	const result = spawnSync('gh', ['api', `repos/microsoft/vscode/actions/runs/${id}`], { encoding: 'utf8', timeout: 30_000 });
	if (result.error) {
		throw result.error;
	}
	assert.equal(result.status, 0, result.stderr);
	const run: IRun = JSON.parse(result.stdout);
	const next = action(run, id, head, Date.now());
	console.log(JSON.stringify({ runId: id, status: run.status, conclusion: run.conclusion, action: next }));
	if (next === 'complete') {
		return;
	}
	if (next === 'cancel' && !cancellationRequested) {
		const cancellation = spawnSync('gh', ['run', 'cancel', String(id), '--repo', 'microsoft/vscode'], { stdio: 'inherit', timeout: 30_000 });
		assert.equal(cancellation.status, 0, 'Cancellation must be confirmed for the reviewed run');
		cancellationRequested = true;
	}
	const remaining = Date.parse(run.created_at) + 55 * 60 * 1000 - Date.now();
	setTimeout(() => watch(id, head), remaining > 0 ? Math.min(30_000, remaining) : 30_000);
}

if (process.argv[2] === '--self-test') {
	selfTest();
} else {
	const id = Number(process.argv[2]);
	const head = process.argv[3];
	assert.ok(Number.isInteger(id) && id > 0 && /^[a-f0-9]{40}$/.test(head ?? ''));
	watch(id, head);
}
