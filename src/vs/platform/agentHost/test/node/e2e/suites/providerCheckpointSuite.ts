/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { buildCompareTurnsChangesetUri } from '../../../../common/changesetUri.js';
import type { ResourceReadResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { buildDefaultChatUri, ROOT_STATE_URI, type ChangesetState } from '../../../../common/state/sessionState.js';
import { createRealSession, driveTurnToCompletion, initTestGitRepo, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineProviderCheckpointTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity') {
		return;
	}
	let sequence = 60_000;

	async function createSession(prefix: string, prepare?: (workspace: string) => void): Promise<{ session: string; workspace: string; chat: string }> {
		const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'ahp-provider-checkpoint-')));
		context.tempDirs.push(workspace);
		initTestGitRepo(workspace);
		execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: workspace });
		writeFileSync(join(workspace, 'seed.txt'), 'original\n');
		writeFileSync(join(workspace, 'delete.txt'), 'delete me\n');
		writeFileSync(join(workspace, '.gitignore'), 'checkpoint-witness.txt\n');
		execFileSync('git', ['add', '.'], { cwd: workspace });
		execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: workspace });
		prepare?.(workspace);
		const session = await createRealSession(context.client, context.config, `checkpoint-${prefix}-${context.config.provider}`, context.createdSessions, URI.file(workspace));
		await driveTurnToCompletion(context.client, session, 'baseline', 'Reply exactly "ready". Do not use tools.', sequence);
		sequence += 100;
		return { session, workspace, chat: buildDefaultChatUri(session) };
	}

	async function edit(session: string, turn: string, script: string): Promise<void> {
		const clientSeq = sequence;
		sequence += 100;
		await driveTurnToCompletion(context.client, session, turn,
			`Run only this exact command without modifications or directory overrides: \`node -e "${script}"\`. Do not inspect files or run any other command. Then reply exactly "done".`, clientSeq);
		// A subsequent provider turn serializes behind the asynchronous checkpoint capture.
		await driveTurnToCompletion(context.client, session, `${turn}-settled`, 'Reply exactly "settled". Do not use tools.', sequence);
		sequence += 100;
	}

	async function changeset(channel: string, files: readonly string[]): Promise<ChangesetState> {
		return retry(async () => {
			const result = await context.client.call<SubscribeResult>('subscribe', { channel });
			const state = result.snapshot!.state as ChangesetState;
			assert.strictEqual(state.status, 'ready', JSON.stringify(state));
			assert.deepStrictEqual(state.files.map(file => URI.parse(file.edit.after?.uri ?? file.edit.before!.uri).path.split('/').at(-1)).sort(), [...files].sort());
			return state;
		}, 100, 100);
	}

	async function contents(uri: string | undefined): Promise<string> {
		assert.ok(uri);
		const result = await context.client.call<ResourceReadResult>('resourceRead', { uri, encoding: ContentEncoding.Utf8 });
		assert.strictEqual(result.encoding, ContentEncoding.Utf8);
		return result.data;
	}

	test('provider checkpoints: one turn captures mixed shell edits without modifying the users index', async function () {
		this.timeout(180_000);
		const { session, workspace, chat } = await createSession('mixed', workspace => {
			writeFileSync(join(workspace, 'staged.txt'), 'staged\n');
			execFileSync('git', ['add', 'staged.txt'], { cwd: workspace });
		});
		await edit(session, 'mixed', `const fs=require('fs');fs.writeFileSync('seed.txt','edited\\n');fs.writeFileSync('added.txt','created\\n');fs.unlinkSync('delete.txt')`);
		assert.strictEqual(readFileSync(join(workspace, 'seed.txt'), 'utf8'), 'edited\n');
		assert.strictEqual(existsSync(join(workspace, 'delete.txt')), false);
		const state = await changeset(buildCompareTurnsChangesetUri(chat, 'baseline', 'mixed'), ['seed.txt', 'added.txt', 'delete.txt']);
		assert.deepStrictEqual({
			sides: state.files.map(file => ({
				name: URI.parse(file.edit.after?.uri ?? file.edit.before!.uri).path.split('/').at(-1),
				before: !!file.edit.before, after: !!file.edit.after,
			})).sort((a, b) => a.name!.localeCompare(b.name!)),
			staged: execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: workspace, encoding: 'utf8' }).trim(),
		}, {
			sides: [
				{ name: 'added.txt', before: false, after: true },
				{ name: 'delete.txt', before: true, after: false },
				{ name: 'seed.txt', before: true, after: true },
			],
			staged: 'staged.txt',
		});
	});

	test('provider checkpoints: historical contents remain readable after a later edit', async function () {
		this.timeout(180_000);
		const { session, chat } = await createSession('history');
		await edit(session, 'first', `require('fs').writeFileSync('seed.txt','first\\n')`);
		const first = await changeset(buildCompareTurnsChangesetUri(chat, 'baseline', 'first'), ['seed.txt']);
		await edit(session, 'second', `require('fs').writeFileSync('seed.txt','second\\n')`);
		const second = await changeset(buildCompareTurnsChangesetUri(chat, 'first', 'second'), ['seed.txt']);
		assert.deepStrictEqual({
			firstBefore: await contents(first.files[0].edit.before?.content.uri),
			firstAfter: await contents(first.files[0].edit.after?.content.uri),
			secondBefore: await contents(second.files[0].edit.before?.content.uri),
			secondAfter: await contents(second.files[0].edit.after?.content.uri),
		}, { firstBefore: 'original\n', firstAfter: 'first\n', secondBefore: 'first\n', secondAfter: 'second\n' });
	});

	test('provider checkpoints: comparing two turns excludes changes made before the first boundary', async function () {
		this.timeout(180_000);
		const { session, chat } = await createSession('compare');
		await edit(session, 'first', `require('fs').writeFileSync('early.txt','early')`);
		await changeset(buildCompareTurnsChangesetUri(chat, 'baseline', 'first'), ['early.txt']);
		await edit(session, 'second', `require('fs').writeFileSync('seed.txt','later\\n')`);
		const compared = await changeset(buildCompareTurnsChangesetUri(chat, 'first', 'second'), ['seed.txt']);
		assert.deepStrictEqual({
			before: await contents(compared.files[0].edit.before?.content.uri),
			after: await contents(compared.files[0].edit.after?.content.uri),
		}, { before: 'original\n', after: 'later\n' });
	});

	test('provider checkpoints: same-turn edits restored to their original bytes produce no changes', async function () {
		this.timeout(180_000);
		const { session, workspace, chat } = await createSession('restored');
		await edit(session, 'restored', `const fs=require('fs');fs.writeFileSync('seed.txt','temporary');fs.writeFileSync('checkpoint-witness.txt',fs.readFileSync('seed.txt'));fs.writeFileSync('seed.txt','original\\n')`);
		assert.deepStrictEqual({
			witness: readFileSync(join(workspace, 'checkpoint-witness.txt'), 'utf8'),
			restored: readFileSync(join(workspace, 'seed.txt'), 'utf8'),
		}, { witness: 'temporary', restored: 'original\n' });
		assert.deepStrictEqual((await changeset(buildCompareTurnsChangesetUri(chat, 'baseline', 'restored'), [])).files, []);
	});

	test('provider checkpoints: historical diff contents survive restarting the host', async function () {
		this.timeout(240_000);
		const { session, workspace, chat } = await createSession('restart');
		await edit(session, 'persisted', `require('fs').writeFileSync('seed.txt','persisted\\n')`);
		await changeset(buildCompareTurnsChangesetUri(chat, 'baseline', 'persisted'), ['seed.txt']);
		await context.restartServer();
		context.client.setWorkingDirectory(workspace);
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `checkpoint-restored-${context.config.provider}` });
		await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: context.config.githubToken ?? resolveGitHubToken() });
		await context.client.call('subscribe', { channel: session });
		await context.client.call('subscribe', { channel: chat });
		const restored = await changeset(buildCompareTurnsChangesetUri(chat, 'baseline', 'persisted'), ['seed.txt']);
		assert.deepStrictEqual({
			before: await contents(restored.files[0].edit.before?.content.uri),
			after: await contents(restored.files[0].edit.after?.content.uri),
		}, { before: 'original\n', after: 'persisted\n' });
	});
}
