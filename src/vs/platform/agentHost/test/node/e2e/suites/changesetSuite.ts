/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Host-owned changeset channel contracts: file-monitor-driven content updates
 * and the `invokeChangesetOperation` command surface.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { buildUncommittedChangesetUri } from '../../../../common/changesetUri.js';
import type { ChangesetContentChangedAction } from '../../../../common/state/sessionActions.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { createRealSession, initTestGitRepo } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineChangesetTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	conformanceTest(context, 'an externally written workspace file appears in the uncommitted changeset', async function () {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-changeset-write-'));
		tempDirs.push(workspace);
		initTestGitRepo(workspace);
		writeFileSync(join(workspace, 'seed.txt'), 'seed\n');
		execSync('git add .', { cwd: workspace });
		execSync('git commit -m "init"', { cwd: workspace });

		const sessionUri = await createRealSession(
			context.client,
			config,
			`changeset-write-${config.provider}`,
			createdSessions,
			URI.file(workspace),
		);
		const changesetUri = buildUncommittedChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: changesetUri });
		context.client.clearReceived();

		const editedPath = join(workspace, 'from-e2e.txt');
		writeFileSync(editedPath, 'external write\n');

		const fileUri = (edit: ChangesetContentChangedAction['files'][number]['edit']) =>
			edit.after?.uri ?? edit.before?.uri;
		const contentChanged = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'changeset/contentChanged') || getActionEnvelope(n).channel !== changesetUri) {
				return false;
			}
			const action = getActionEnvelope(n).action as ChangesetContentChangedAction;
			return action.files.some(file => {
				const uri = fileUri(file.edit);
				return typeof uri === 'string' && uri.endsWith('/from-e2e.txt');
			});
		}, 30_000);

		const action = getActionEnvelope(contentChanged).action as ChangesetContentChangedAction;
		const file = action.files.find(entry => {
			const uri = fileUri(entry.edit);
			return typeof uri === 'string' && uri.endsWith('/from-e2e.txt');
		});
		assert.ok(file, 'expected the externally written file in the changeset');
		assert.ok(file.edit.after, 'newly added file should have an after-side');
		assert.ok(!file.edit.before, 'newly added file should have no before-side');
	});

	conformanceTest(context, 'invokeChangesetOperation rejects an unknown operation', async function () {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-changeset-invoke-'));
		tempDirs.push(workspace);
		initTestGitRepo(workspace);
		writeFileSync(join(workspace, 'seed.txt'), 'seed\n');
		execSync('git add .', { cwd: workspace });
		execSync('git commit -m "init"', { cwd: workspace });

		const sessionUri = await createRealSession(
			context.client,
			config,
			`changeset-invoke-${config.provider}`,
			createdSessions,
			URI.file(workspace),
		);
		const changesetUri = buildUncommittedChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: changesetUri });

		await assert.rejects(
			() => context.client.call('invokeChangesetOperation', {
				channel: changesetUri,
				operationId: 'does-not-exist',
			}),
			/unknown operation/i,
		);
	});
}
