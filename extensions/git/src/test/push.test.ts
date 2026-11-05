/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { commands, ConfigurationTarget, extensions, Uri, window, workspace } from 'vscode';
import type { API, GitExtension, Repository } from '../api/git';

interface TestContextOptions {
	createFeatureCommit?: boolean;
	createForkFeature?: boolean;
	breakForkPush?: boolean;
	disableForkPush?: boolean;
	disableUpstreamPush?: boolean;
	pushDefault: string;
	remotePushDefault?: string;
}

interface TestContext {
	forkPath: string;
	featureCommit: string;
	repository: Repository;
	dispose(): Promise<void>;
	upstreamMain: string;
	upstreamPath: string;
}

suite('git push', function () {
	let gitApi: API;

	suiteSetup(async function () {
		const ext = extensions.getExtension<GitExtension>('vscode.git');
		await ext?.activate();
		gitApi = ext!.exports.getAPI(1);
	});

	test('push uses the configured push target instead of the upstream branch', async function () {
		// Arrange
		const context = await createTestContext({ pushDefault: 'simple', remotePushDefault: 'fork' });

		try {
			// Act
			await commands.executeCommand('git.push', context.repository);

			// Assert
			assert.deepStrictEqual(getRemoteBranches(context), {
				forkFeature: context.featureCommit,
				upstreamFeature: undefined,
				upstreamMain: context.upstreamMain
			});
		} finally {
			await context.dispose();
		}
	});

	test('push passes the configured push target to push error handlers', async function () {
		// Arrange
		const context = await createTestContext({ disableForkPush: true, pushDefault: 'simple', remotePushDefault: 'fork' });
		const handledPushErrors: { remoteName: string; refspec: string }[] = [];
		const disposable = gitApi.registerPushErrorHandler({
			async handlePushError(_repository, remote, refspec) {
				handledPushErrors.push({ remoteName: remote.name, refspec });
				return true;
			}
		});

		try {
			// Act
			await commands.executeCommand('git.push', context.repository);

			// Assert
			assert.deepStrictEqual(handledPushErrors, [{ remoteName: 'fork', refspec: 'feature:feature' }]);
			assert.strictEqual(getRemoteBranchCommit(context.forkPath, 'feature'), undefined);
		} finally {
			disposable.dispose();
			await context.dispose();
		}
	});

	test('push does not pass a synthetic refspec to push error handlers when Git refuses simple mode', async function () {
		// Arrange
		const context = await createTestContext({ pushDefault: 'simple', remotePushDefault: 'upstream' });
		const handledPushErrors: { remoteName: string; refspec: string }[] = [];
		const showErrorMessage = sinon.stub(window, 'showErrorMessage').resolves(undefined);
		const disposable = gitApi.registerPushErrorHandler({
			async handlePushError(_repository, remote, refspec) {
				handledPushErrors.push({ remoteName: remote.name, refspec });
				return true;
			}
		});

		try {
			// Act
			await commands.executeCommand('git.push', context.repository);

			// Assert
			assert.deepStrictEqual(handledPushErrors, []);
			assert.strictEqual(getRemoteBranchCommit(context.upstreamPath, 'feature'), undefined);
		} finally {
			disposable.dispose();
			showErrorMessage.restore();
			await context.dispose();
		}
	});

	test('sync confirmation omits the push target when there are no outgoing commits', async function () {
		// Arrange
		const context = await createTestContext({ createFeatureCommit: false, createForkFeature: true, pushDefault: 'simple', remotePushDefault: 'fork' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;
		const messages: string[] = [];
		const showWarningMessage = sinon.stub(window, 'showWarningMessage').callsFake(async (message, _options, yes) => {
			messages.push(message);
			return yes;
		});

		await config.update('confirmSync', true, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(messages, ['This action will pull commits from "upstream/main".']);
		} finally {
			showWarningMessage.restore();
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	test('sync confirmation includes the push target when the upstream is current but the push target is missing', async function () {
		// Arrange
		const context = await createTestContext({ createFeatureCommit: false, pushDefault: 'simple', remotePushDefault: 'fork' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;
		const messages: string[] = [];
		const showWarningMessage = sinon.stub(window, 'showWarningMessage').callsFake(async (message, _options, yes) => {
			messages.push(message);
			return yes;
		});

		await config.update('confirmSync', true, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(messages, ['This action will pull commits from "upstream/main" and push outgoing commits using your configured Git push target.']);
			assert.strictEqual(getRemoteBranchCommit(context.forkPath, 'feature'), context.upstreamMain);
		} finally {
			showWarningMessage.restore();
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	test('sync confirmation includes the push target when there are outgoing commits', async function () {
		// Arrange
		const context = await createTestContext({ pushDefault: 'simple', remotePushDefault: 'fork' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;
		const messages: string[] = [];
		const showWarningMessage = sinon.stub(window, 'showWarningMessage').callsFake(async (message, _options, yes) => {
			messages.push(message);
			return yes;
		});

		await config.update('confirmSync', true, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(messages, ['This action will pull commits from "upstream/main" and push outgoing commits using your configured Git push target.']);
		} finally {
			showWarningMessage.restore();
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	test('sync pushes when the upstream is current but the configured push target is missing', async function () {
		// Arrange
		const context = await createTestContext({ createFeatureCommit: false, pushDefault: 'simple', remotePushDefault: 'fork' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;

		await config.update('confirmSync', false, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(getRemoteBranches(context), {
				forkFeature: context.upstreamMain,
				upstreamFeature: undefined,
				upstreamMain: context.upstreamMain
			});
		} finally {
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	test('sync pushes to the configured push remote instead of the upstream remote', async function () {
		// Arrange
		const context = await createTestContext({ pushDefault: 'current', remotePushDefault: 'fork' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;

		await config.update('confirmSync', false, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(getRemoteBranches(context), {
				forkFeature: context.featureCommit,
				upstreamFeature: undefined,
				upstreamMain: context.upstreamMain
			});
		} finally {
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	test('sync passes the configured push target to push error handlers', async function () {
		// Arrange
		const context = await createTestContext({ breakForkPush: true, pushDefault: 'current', remotePushDefault: 'fork' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;
		const handledPushErrors: { remoteName: string; refspec: string }[] = [];
		const disposable = gitApi.registerPushErrorHandler({
			async handlePushError(_repository, remote, refspec) {
				handledPushErrors.push({ remoteName: remote.name, refspec });
				return true;
			}
		});

		await config.update('confirmSync', false, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(handledPushErrors, [{ remoteName: 'fork', refspec: 'feature:feature' }]);
			assert.strictEqual(getRemoteBranchCommit(context.forkPath, 'feature'), undefined);
		} finally {
			disposable.dispose();
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	test('sync skips pushing when the configured push target is read-only', async function () {
		// Arrange
		const context = await createTestContext({ disableUpstreamPush: true, pushDefault: 'current' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;

		await config.update('confirmSync', false, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(getRemoteBranches(context), {
				forkFeature: undefined,
				upstreamFeature: undefined,
				upstreamMain: context.upstreamMain
			});
		} finally {
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	test('sync does not skip pushing when the upstream remote is read-only and Git has a push remote', async function () {
		// Arrange
		const context = await createTestContext({ disableUpstreamPush: true, pushDefault: 'current', remotePushDefault: 'fork' });
		const config = workspace.getConfiguration('git');
		const confirmSyncWorkspaceValue = config.inspect<boolean>('confirmSync')?.workspaceValue;

		await config.update('confirmSync', false, ConfigurationTarget.Workspace);

		try {
			// Act
			await commands.executeCommand('git.sync', context.repository);

			// Assert
			assert.deepStrictEqual(getRemoteBranches(context), {
				forkFeature: context.featureCommit,
				upstreamFeature: undefined,
				upstreamMain: context.upstreamMain
			});
		} finally {
			await config.update('confirmSync', confirmSyncWorkspaceValue, ConfigurationTarget.Workspace);
			await context.dispose();
		}
	});

	async function createTestContext({ createFeatureCommit = true, createForkFeature = false, breakForkPush = false, disableForkPush = false, disableUpstreamPush = false, pushDefault, remotePushDefault }: TestContextOptions): Promise<TestContext> {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-git-push-'));
		const upstreamPath = path.join(tempRoot, 'upstream.git');
		const forkPath = path.join(tempRoot, 'fork.git');
		const repoRoot = path.join(tempRoot, 'work');

		runGit(tempRoot, ['init', '--bare', upstreamPath]);
		runGit(tempRoot, ['init', '--bare', forkPath]);
		runGit(tempRoot, ['clone', upstreamPath, repoRoot]);

		runGit(repoRoot, ['config', 'user.name', 'testuser']);
		runGit(repoRoot, ['config', 'user.email', 'monacotools@example.com']);
		runGit(repoRoot, ['config', 'commit.gpgsign', 'false']);
		runGit(repoRoot, ['config', 'push.autoSetupRemote', 'false']);

		fs.writeFileSync(path.join(repoRoot, 'app.js'), 'console.log("base");\n');
		runGit(repoRoot, ['add', 'app.js']);
		runGit(repoRoot, ['commit', '-m', 'initial commit']);
		runGit(repoRoot, ['push', 'origin', 'HEAD:main']);
		runGit(repoRoot, ['remote', 'rename', 'origin', 'upstream']);
		runGit(repoRoot, ['remote', 'add', 'fork', forkPath]);
		runGit(repoRoot, ['push', 'fork', 'HEAD:main']);

		if (disableUpstreamPush) {
			runGit(repoRoot, ['remote', 'set-url', '--push', 'upstream', 'no_push']);
		}

		runGit(repoRoot, ['fetch', 'upstream', 'main']);
		runGit(repoRoot, ['switch', '-c', 'feature']);
		runGit(repoRoot, ['branch', '--set-upstream-to=upstream/main', 'feature']);
		runGit(repoRoot, ['config', 'push.default', pushDefault]);

		if (remotePushDefault) {
			runGit(repoRoot, ['config', 'remote.pushDefault', remotePushDefault]);
		}

		if (createForkFeature) {
			runGit(repoRoot, ['push', 'fork', 'HEAD:feature']);
			runGit(repoRoot, ['fetch', 'fork', 'feature']);
		}

		if (disableForkPush) {
			runGit(repoRoot, ['remote', 'set-url', '--push', 'fork', 'no_push']);
		}

		if (breakForkPush) {
			runGit(repoRoot, ['remote', 'set-url', '--push', 'fork', path.join(tempRoot, 'missing.git')]);
		}

		if (createFeatureCommit) {
			fs.appendFileSync(path.join(repoRoot, 'app.js'), 'console.log("feature");\n');
			runGit(repoRoot, ['commit', '-am', 'feature commit']);
		}

		const repository = await gitApi.openRepository(Uri.file(repoRoot));
		assert.ok(repository);
		await repository.status();

		return {
			forkPath,
			featureCommit: runGit(repoRoot, ['rev-parse', 'HEAD']),
			repository,
			async dispose() {
				await waitForAsyncOperationListeners();
				await commands.executeCommand('git.close', repository);
				fs.rmSync(tempRoot, { recursive: true, force: true });
			},
			upstreamMain: getRemoteBranchCommit(upstreamPath, 'main')!,
			upstreamPath
		};
	}

	function getRemoteBranches(context: { forkPath: string; upstreamPath: string }): {
		forkFeature: string | undefined;
		upstreamFeature: string | undefined;
		upstreamMain: string | undefined;
	} {
		return {
			forkFeature: getRemoteBranchCommit(context.forkPath, 'feature'),
			upstreamFeature: getRemoteBranchCommit(context.upstreamPath, 'feature'),
			upstreamMain: getRemoteBranchCommit(context.upstreamPath, 'main')
		};
	}

	function getRemoteBranchCommit(remotePath: string, branchName: string): string | undefined {
		try {
			return runGit(remotePath, ['rev-parse', `refs/heads/${branchName}`]);
		} catch {
			return undefined;
		}
	}

	function runGit(cwd: string, args: string[]): string {
		return cp.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	}

	async function waitForAsyncOperationListeners(): Promise<void> {
		await new Promise(resolve => setTimeout(resolve, 100));
	}
});
