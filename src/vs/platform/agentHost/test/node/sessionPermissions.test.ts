/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { SessionStatus, ToolCallConfirmationReason, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionPermissionManager, type IToolApprovalEvent } from '../../node/sessionPermissions.js';

suite('SessionPermissionManager', () => {

	const disposables = new DisposableStore();
	let manager: AgentHostStateManager;
	let permissions: SessionPermissionManager;

	// Real (symlink-resolved) temp directories so that the symlink-resolution
	// checks compare like-for-like (e.g. macOS `/var` -> `/private/var`).
	let workDir: string;
	let outsideDir: string;

	const sessionUri = URI.from({ scheme: 'copilot', path: '/s' }).toString();

	function makeSummary(resource: string, workingDirectory?: string): SessionSummary {
		return {
			resource,
			provider: 'copilot',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			project: { uri: 'file:///project', displayName: 'Project' },
			workingDirectory,
		};
	}

	function writeEvent(permissionPath: string): IToolApprovalEvent {
		return { toolCallId: 'tc-1', session: URI.parse(sessionUri), permissionKind: 'write', permissionPath };
	}

	setup(async () => {
		// Prefer the CI runner temp dir (a plain long path) over `os.tmpdir()`,
		// which on Windows CI is an 8.3 short path (`C:\Users\RUNNER~1\...`) that
		// `assertPathIsSafe` rejects for its `~1` segment — which would make every
		// write auto-approval fail. `AGENT_TEMPDIRECTORY` is set by Azure DevOps
		// (VS Code's CI) and `RUNNER_TEMP` by GitHub Actions. Note that the JS
		// `fs.realpathSync` does not expand 8.3 short names to their long form, so
		// the short-path fallback can't be repaired afterwards. `realpathSync`
		// keeps macOS `/var` -> `/private/var` consistent so the symlink-resolution
		// checks compare like-for-like.
		const baseTmp = process.env.AGENT_TEMPDIRECTORY || process.env.RUNNER_TEMP || tmpdir();
		workDir = realpathSync(mkdtempSync(join(baseTmp, 'sesperm-work-')));
		outsideDir = realpathSync(mkdtempSync(join(baseTmp, 'sesperm-out-')));

		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const configService = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
		permissions = disposables.add(new SessionPermissionManager(manager, configService, new NullLogService()));
		await permissions.initialize();

		manager.createSession(makeSummary(sessionUri, URI.file(workDir).toString()));
	});

	teardown(() => {
		disposables.clear();
		rmSync(workDir, { recursive: true, force: true });
		rmSync(outsideDir, { recursive: true, force: true });
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('auto-approves a normal file inside the working directory', async () => {
		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation for writes outside the working directory', async () => {
		const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, 'app.ts')), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('requires confirmation for protected files inside the working directory', async () => {
		const files = ['.env', 'package.json', join('.git', 'config'), 'deps.lock', join('.vscode', 'settings.json')];
		const results: (ToolCallConfirmationReason | undefined)[] = [];
		for (const file of files) {
			results.push(await permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri));
		}
		assert.deepStrictEqual(results, files.map(() => undefined));
	});

	test('requires confirmation for paths containing null bytes', async () => {
		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'a\u0000b.txt')), sessionUri);
		assert.strictEqual(result, undefined);
	});

	(isWindows ? test.skip : test)('requires confirmation when a symlink redirects outside the working directory', async () => {
		symlinkSync(outsideDir, join(workDir, 'link'), 'dir');
		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'link', 'secret.txt')), sessionUri);
		assert.strictEqual(result, undefined);
	});

	(isWindows ? test.skip : test)('auto-approves when a symlink stays inside the working directory', async () => {
		mkdirSync(join(workDir, 'real'));
		symlinkSync(join(workDir, 'real'), join(workDir, 'link-in'), 'dir');
		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'link-in', 'note.txt')), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation for home-directory dotfiles', async () => {
		const homeSession = URI.from({ scheme: 'copilot', path: '/home' }).toString();
		manager.createSession(makeSummary(homeSession, URI.file(homedir()).toString()));
		const result = await permissions.getAutoApproval(writeEvent(join(homedir(), '.sesperm-config-xyz')), homeSession);
		assert.strictEqual(result, undefined);
	});

	test('auto-approves any write when session bypass is enabled', async () => {
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
		});
		const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, 'anything.txt')), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.Setting);
	});

	test('auto-approves reads inside but requires confirmation outside the working directory', async () => {
		const inside = await permissions.getAutoApproval(
			{ toolCallId: 'r', session: URI.parse(sessionUri), permissionKind: 'read', permissionPath: join(workDir, 'a.txt') },
			sessionUri,
		);
		const outside = await permissions.getAutoApproval(
			{ toolCallId: 'r', session: URI.parse(sessionUri), permissionKind: 'read', permissionPath: join(outsideDir, 'a.txt') },
			sessionUri,
		);
		assert.deepStrictEqual([inside, outside], [ToolCallConfirmationReason.NotNeeded, undefined]);
	});
});
