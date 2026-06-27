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
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, platformSessionSchema } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { SessionStatus, ToolCallConfirmationReason, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionPermissionManager, type IToolApprovalEvent } from '../../node/sessionPermissions.js';

suite('SessionPermissionManager', () => {

	const disposables = new DisposableStore();
	let manager: AgentHostStateManager;
	let configService: AgentConfigurationService;
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
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///project', displayName: 'Project' },
			workingDirectory,
		};
	}

	function writeEvent(permissionPath: string): IToolApprovalEvent {
		return { toolCallId: 'tc-1', session: URI.parse(sessionUri), permissionKind: 'write', permissionPath };
	}

	function shellEvent(commandLine: string): IToolApprovalEvent {
		return { toolCallId: 'tc-shell', session: URI.parse(sessionUri), permissionKind: 'shell', toolInput: commandLine };
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
		configService = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
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

	test('auto-approves shell commands in default permission mode when terminal auto-approve is enabled', async () => {
		const result = await permissions.getAutoApproval(shellEvent('echo hello'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('uses forwarded terminal auto-approve rules as the source of truth over fallback defaults', async () => {
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: {} });

		const result = await permissions.getAutoApproval(shellEvent('echo hello'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('respects forwarded terminal auto-approve deny rules in default permission mode', async () => {
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: { echo: false } });

		const result = await permissions.getAutoApproval(shellEvent('echo hello'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('respects forwarded terminal auto-approve allow rules in default permission mode', async () => {
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: { python: true } });

		const result = await permissions.getAutoApproval(shellEvent('python script.py'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation for shell commands in default permission mode when terminal auto-approve is disabled', async () => {
		configService.updateRootConfig({
			[AgentHostTerminalAutoApproveEnabledConfigKey]: false,
			[AgentHostTerminalAutoApproveRulesConfigKey]: { echo: true },
		});

		const result = await permissions.getAutoApproval(shellEvent('echo hello'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('does not affect session bypass permission mode when terminal auto-approve is disabled', async () => {
		configService.updateRootConfig({
			[AgentHostTerminalAutoApproveEnabledConfigKey]: false,
			[AgentHostTerminalAutoApproveRulesConfigKey]: { echo: false },
		});
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
		});

		const result = await permissions.getAutoApproval(shellEvent('echo hello'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.Setting);
	});

	test('auto-approves any write when global auto-approve is enabled, even in default permission mode', async () => {
		configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });

		const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, 'anything.txt')), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.Setting);
	});

	test('auto-approves shell commands when global auto-approve is enabled, even with terminal auto-approve disabled', async () => {
		configService.updateRootConfig({
			[AgentHostGlobalAutoApproveEnabledConfigKey]: true,
			[AgentHostTerminalAutoApproveEnabledConfigKey]: false,
		});

		// A command that would otherwise require confirmation (terminal
		// auto-approve disabled) is approved because global auto-approve is a
		// superset that short-circuits before the per-kind checks.
		const result = await permissions.getAutoApproval(shellEvent('rm -rf /tmp/whatever'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.Setting);
	});

	test('global auto-approve is reported independently of the session permission picker', () => {
		assert.strictEqual(permissions.isGlobalAutoApproveEnabled(), false);
		assert.strictEqual(permissions.isSessionAutoApproveEnabled(sessionUri), false);

		configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });

		// The global setting is a superset of all settings but does not change the
		// session's own approval level (the permissions picker stays at default).
		assert.strictEqual(permissions.isGlobalAutoApproveEnabled(), true);
		assert.strictEqual(permissions.isSessionAutoApproveEnabled(sessionUri), false);
	});
});
