/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');

interface IProbeBuild {
	id: number;
	status: string;
	result?: string;
	sourceBranch: string;
	sourceVersion: string;
	queueTime: string;
	finishTime?: string;
}

const probeBranch = 'refs/heads/roblou/agents/tmpfs-holder-probe-20261009';
const cancellationRequestMs = 55 * 60 * 1000;
const absoluteBudgetMs = 60 * 60 * 1000;

function actionFor(build: IProbeBuild, id: number, head: string, now: number): 'poll' | 'cancel' | 'complete' {
	assert.equal(build.id, id, 'Refuse to act on another build');
	assert.equal(build.sourceBranch, probeBranch, 'Refuse to act on another session branch');
	assert.equal(build.sourceVersion, head, 'Refuse to act on an unreviewed head');
	const queuedAt = Date.parse(build.queueTime);
	assert.ok(Number.isFinite(queuedAt), 'Require the actual original service queue time');
	if (build.status === 'completed') {
		assert.ok(build.finishTime && Date.parse(build.finishTime) <= queuedAt + absoluteBudgetMs, 'Build exceeded the original absolute 60-minute budget');
		return 'complete';
	}
	assert.ok(now < queuedAt + absoluteBudgetMs, 'Cancellation has not completed within the original absolute 60-minute budget');
	return now >= queuedAt + cancellationRequestMs && build.status !== 'cancelling' ? 'cancel' : 'poll';
}

function selfTest(): void {
	const head = 'a'.repeat(40);
	const queuedAt = Date.parse('2026-10-09T00:00:00Z');
	const build: IProbeBuild = { id: 42, status: 'inProgress', sourceBranch: probeBranch, sourceVersion: head, queueTime: new Date(queuedAt).toISOString() };
	assert.equal(actionFor(build, 42, head, queuedAt + cancellationRequestMs - 1), 'poll');
	assert.equal(actionFor(build, 42, head, queuedAt + cancellationRequestMs), 'cancel');
	assert.equal(actionFor(build, 42, head, queuedAt + cancellationRequestMs + 30_000), 'cancel');
	assert.equal(actionFor({ ...build, status: 'cancelling' }, 42, head, queuedAt + 59 * 60 * 1000), 'poll');
	assert.equal(actionFor({ ...build, status: 'completed', finishTime: new Date(queuedAt + 59 * 60 * 1000).toISOString() }, 42, head, queuedAt + absoluteBudgetMs), 'complete');
	assert.throws(() => actionFor(build, 43, head, queuedAt));
	assert.throws(() => actionFor({ ...build, sourceBranch: 'refs/heads/parent' }, 42, head, queuedAt));
	assert.throws(() => actionFor(build, 42, 'b'.repeat(40), queuedAt));
	assert.throws(() => actionFor({ ...build, queueTime: 'invalid' }, 42, head, queuedAt));
	assert.throws(() => actionFor({ ...build, status: 'cancelling' }, 42, head, queuedAt + absoluteBudgetMs));
	assert.throws(() => actionFor({ ...build, status: 'completed', finishTime: new Date(queuedAt + absoluteBudgetMs + 1).toISOString() }, 42, head, queuedAt + absoluteBudgetMs));
	console.log('Watch contracts passed: actual queueTime +55-minute cancel request, +60-minute absolute bound, exact ID/branch/head guards, no deadline reset.');
}

function watch(id: number, head: string): void {
	const result = spawnSync('az', [
		'pipelines', 'build', 'show', '--id', String(id),
		'--org', 'https://dev.azure.com/monacotools', '--project', 'Monaco',
		'--query', '{id:id,status:status,result:result,sourceBranch:sourceBranch,sourceVersion:sourceVersion,queueTime:queueTime,finishTime:finishTime}', '-o', 'json',
	], { encoding: 'utf8', timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
	if (result.error) {
		throw result.error;
	}
	assert.equal(result.status, 0, result.stderr);
	const build: IProbeBuild = JSON.parse(result.stdout);
	const action = actionFor(build, id, head, Date.now());
	console.log(JSON.stringify({ buildId: id, status: build.status, result: build.result, action }));
	if (action === 'complete') {
		return;
	}
	if (action === 'cancel') {
		const cancellation = spawnSync(process.execPath, [
			'.github/skills/azure-pipelines/azure-pipeline.ts', 'cancel', '--build-id', String(id),
		], { stdio: 'inherit', timeout: 45_000 });
		if (cancellation.error) {
			throw cancellation.error;
		}
		assert.equal(cancellation.status, 0, 'Probe cancellation request must be confirmed');
	}
	const untilCancellation = Date.parse(build.queueTime) + cancellationRequestMs - Date.now();
	setTimeout(() => watch(id, head), untilCancellation > 0 ? Math.min(30_000, untilCancellation) : 30_000);
}

if (process.argv[2] === '--self-test') {
	selfTest();
} else {
	const id = Number(process.argv[2]);
	const head = process.argv[3];
	assert.ok(Number.isInteger(id) && id > 0 && /^[a-f0-9]{40}$/.test(head ?? ''), 'Supply the reviewed build ID and candidate head');
	watch(id, head);
}
