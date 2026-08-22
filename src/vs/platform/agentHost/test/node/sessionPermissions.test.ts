/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostEditAutoApprovePatternsConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, platformSessionSchema } from '../../common/agentHostSchema.js';
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../../common/sessionDataService.js';
import { DEFAULT_EDIT_AUTO_APPROVE_PATTERNS, mergeChatEditAutoApprovePatterns } from '../../../chat/common/chatSettings.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildChatUri, SessionStatus, ToolCallConfirmationReason, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionPermissionManager, type IToolApprovalEvent } from '../../node/sessionPermissions.js';
import { createSessionDataService } from '../common/sessionTestHelpers.js';

suite('SessionPermissionManager', () => {

	const disposables = new DisposableStore();
	let manager: AgentHostStateManager;
	let configService: AgentConfigurationService;
	let permissions: SessionPermissionManager;
	let sessionDataService: ISessionDataService;

	// Real (symlink-resolved) temp directories so that the symlink-resolution
	// checks compare like-for-like (e.g. macOS `/var` -> `/private/var`).
	let workDir: string;
	let workDir2: string;
	let outsideDir: string;
	const sessionUri = URI.from({ scheme: 'copilot', path: '/s' }).toString();
	const directoryLinkType = isWindows ? 'junction' : 'dir';

	function makeSummary(resource: string, ...workingDirectories: string[]): SessionSummary {
		return {
			resource,
			provider: 'copilot',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///project', displayName: 'Project' },
			workingDirectories: workingDirectories.length > 0 ? workingDirectories : undefined,
		};
	}

	function writeEvent(permissionPath: string): IToolApprovalEvent {
		return { toolCallId: 'tc-1', session: URI.parse(sessionUri), permissionKind: 'write', permissionPath };
	}

	function readEvent(permissionPath: string, resource = sessionUri): IToolApprovalEvent {
		return { toolCallId: 'tc-read', session: URI.parse(resource), permissionKind: 'read', permissionPath };
	}

	function shellEvent(commandLine: string, shellLanguage: IToolApprovalEvent['shellLanguage']): IToolApprovalEvent {
		return { toolCallId: 'tc-shell', session: URI.parse(sessionUri), permissionKind: 'shell', toolInput: commandLine, shellLanguage };
	}

	function powershellEvent(commandLine: string): IToolApprovalEvent {
		return shellEvent(commandLine, 'powershell');
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
		workDir2 = realpathSync(mkdtempSync(join(baseTmp, 'sesperm-work2-')));
		outsideDir = realpathSync(mkdtempSync(join(baseTmp, 'sesperm-out-')));

		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
		configService = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
		const baseSessionDataService = createSessionDataService();
		const sessionDataRoot = URI.file(join(outsideDir, 'session-data'));
		sessionDataService = {
			...baseSessionDataService,
			getSessionDataDir: session => URI.joinPath(sessionDataRoot, session.path.slice(1)),
		};
		permissions = disposables.add(new SessionPermissionManager(manager, {}, configService, new NullLogService(), sessionDataService));
		await permissions.initialize();

		manager.createSession(makeSummary(sessionUri, URI.file(workDir).toString()));
	});

	teardown(() => {
		disposables.clear();
		rmSync(workDir, { recursive: true, force: true });
		rmSync(workDir2, { recursive: true, force: true });
		rmSync(outsideDir, { recursive: true, force: true });
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('auto-approves a normal file inside the working directory', async () => {
		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('auto-approves an owning-session attachment for a peer chat but not another session attachment', async () => {
		const peerChat = buildChatUri(sessionUri, 'peer');
		const attachmentPath = URI.joinPath(
			sessionDataService.getSessionDataDir(URI.parse(sessionUri)),
			SESSION_ATTACHMENTS_DIRNAME,
			'attachment-id',
			'Pasted text #1.txt',
		).fsPath;
		const otherAttachmentPath = URI.joinPath(
			sessionDataService.getSessionDataDir(URI.from({ scheme: 'copilot', path: '/other' })),
			SESSION_ATTACHMENTS_DIRNAME,
			'attachment-id',
			'other.txt',
		).fsPath;

		const results = await Promise.all([
			permissions.getAutoApproval(readEvent(attachmentPath, peerChat), peerChat),
			permissions.getAutoApproval(readEvent(otherAttachmentPath, peerChat), peerChat),
		]);

		assert.deepStrictEqual(results, [ToolCallConfirmationReason.NotNeeded, undefined]);
	});

	test('isForbiddenSnapshotWrite flags writes to a session attachment snapshot but not reads or working-dir writes (#331154)', () => {
		const snapshot = URI.joinPath(sessionDataService.getSessionDataDir(URI.parse(sessionUri)), SESSION_ATTACHMENTS_DIRNAME, 'id', 'Pasted text #1.txt').fsPath;
		assert.deepStrictEqual({
			snapshotWrite: permissions.isForbiddenSnapshotWrite(writeEvent(snapshot), sessionUri),
			workingDirWrite: permissions.isForbiddenSnapshotWrite(writeEvent(join(workDir, 'app.ts')), sessionUri),
			snapshotRead: permissions.isForbiddenSnapshotWrite(readEvent(snapshot), sessionUri),
		}, {
			snapshotWrite: true,
			workingDirWrite: false,
			snapshotRead: false,
		});
	});

	test('isForbiddenSnapshotWrite is independent of auto-approve config (used by the interactive deny path) (#331154)', async () => {
		configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });
		const snapshot = URI.joinPath(sessionDataService.getSessionDataDir(URI.parse(sessionUri)), SESSION_ATTACHMENTS_DIRNAME, 'id', 'Pasted text #1.txt').fsPath;
		// getAutoApproval approves the write once global auto-approve is on (the auto-approve checks
		// return before the write-path logic). isForbiddenSnapshotWrite ignores that, so _handleToolReady
		// can hard-deny before consulting getAutoApproval. NOTE: this only matters when a provider raises
		// an interactive pending_confirmation; providers that auto-approve upstream never reach it.
		assert.deepStrictEqual({
			autoApproval: await permissions.getAutoApproval(writeEvent(snapshot), sessionUri),
			forbidden: permissions.isForbiddenSnapshotWrite(writeEvent(snapshot), sessionUri),
		}, {
			autoApproval: ToolCallConfirmationReason.Setting,
			forbidden: true,
		});
	});

	test('requires confirmation for writes outside the working directory', async () => {
		const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, 'app.ts')), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('requires confirmation for protected files inside the working directory', async () => {
		const files = [
			'.env',
			'package.json',
			'Cargo.toml',
			'build.gradle',
			'build.gradle.kts',
			'gradle.properties',
			join('ruby_lsp', 'example', 'addon'),
			join('.git', 'config'),
			'deps.lock',
			join('.vscode', 'settings.json'),
		];
		const results: (ToolCallConfirmationReason | undefined)[] = [];
		for (const file of files) {
			results.push(await permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri));
		}
		assert.deepStrictEqual(results, files.map(() => undefined));
	});

	if (!isLinux) {
		test('requires confirmation for protected files with non-canonical casing', async () => {
			const files = ['.ENV', 'Package.json', join('.GIT', 'config'), join('.VSCODE', 'settings.json')];
			const results = await Promise.all(files.map(file => permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri)));
			assert.deepStrictEqual(results, files.map(() => undefined));
		});
	}

	test('respects forwarded edit auto-approve patterns', async () => {
		configService.updateRootConfig({
			[AgentHostEditAutoApprovePatternsConfigKey]: {
				'**/*': false,
				'**/*.ts': true,
				'**/.github/hooks/**': true,
			},
		});

		assert.deepStrictEqual([
			await permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri),
			await permissions.getAutoApproval(writeEvent(join(workDir, 'README.md')), sessionUri),
			await permissions.getAutoApproval(writeEvent(join(workDir, '.github', 'hooks', 'pre-tool.json')), sessionUri),
		], [ToolCallConfirmationReason.NotNeeded, undefined, undefined]);
	});

	test('merges configured edit auto-approve patterns with defaults', () => {
		assert.deepStrictEqual(mergeChatEditAutoApprovePatterns({
			'**/generated/**': false,
		}), {
			...DEFAULT_EDIT_AUTO_APPROVE_PATTERNS,
			'**/generated/**': false,
		});
	});

	test('overriding a default pattern keeps the configured order', async () => {
		// `'**/*': false` is configured last, so it has to decide the outcome for a
		// file the earlier `'**/*.ts'` rule would otherwise approve.
		const patterns = mergeChatEditAutoApprovePatterns({ '**/*.ts': true, '**/*': false });
		configService.updateRootConfig({ [AgentHostEditAutoApprovePatternsConfigKey]: patterns });

		assert.deepStrictEqual({
			lastPatterns: Object.keys(patterns).slice(-2),
			approval: await permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri),
		}, {
			lastPatterns: ['**/*.ts', '**/*'],
			approval: undefined,
		});
	});

	test('malformed edit auto-approve values fail closed', async () => {
		configService.updateRootConfig({
			[AgentHostEditAutoApprovePatternsConfigKey]: {
				'**/*': 'false',
			},
		});

		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri);

		assert.strictEqual(result, undefined);
	});

	test('requires confirmation for files that can register lifecycle hooks', async () => {
		const files = [
			join('.github', 'agents', 'dev-helper.md'),
			join('.github', 'hooks', 'say-hi.json'),
			join('.claude', 'agents', 'dev-helper.md'),
			join('.claude', 'settings.json'),
			join('.claude', 'settings.local.json'),
			join('.agents', 'agents', 'dev-helper.md'),
		];
		const results: (ToolCallConfirmationReason | undefined)[] = [];
		for (const file of files) {
			results.push(await permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri));
		}
		assert.deepStrictEqual(results, files.map(() => undefined));
	});

	test('requires confirmation for package manager configuration files', async () => {
		const files = [
			'.npmrc',
			'.yarnrc',
			'.yarnrc.yml',
			'.pnpmfile.js',
			'.pnpmfile.cjs',
			'.pnpmfile.mjs',
			'pnpm-workspace.yaml',
			join('packages', 'nested', '.npmrc'),
		];
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

	test('requires confirmation when a symlink redirects outside the working directory', async () => {
		symlinkSync(outsideDir, join(workDir, 'link'), directoryLinkType);
		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'link', 'secret.txt')), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('auto-approves when a symlink stays inside the working directory', async () => {
		mkdirSync(join(workDir, 'real'));
		symlinkSync(join(workDir, 'real'), join(workDir, 'link-in'), directoryLinkType);
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
		const inside = await permissions.getAutoApproval(readEvent(join(workDir, 'a.txt')), sessionUri);
		const outside = await permissions.getAutoApproval(readEvent(join(outsideDir, 'a.txt')), sessionUri);
		assert.deepStrictEqual([inside, outside], [ToolCallConfirmationReason.NotNeeded, undefined]);
	});

	test('requires confirmation when the working directory is not a file URI', async () => {
		const remoteSessionUri = URI.from({ scheme: 'copilot', path: '/remote' }).toString();
		const remoteWorkingDirectory = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: URI.file(workDir).path });
		manager.createSession(makeSummary(remoteSessionUri, remoteWorkingDirectory.toString()));

		const result = await permissions.getAutoApproval(readEvent(join(workDir, 'a.txt'), remoteSessionUri), remoteSessionUri);

		assert.strictEqual(result, undefined);
	});

	test('requires confirmation when a symlinked read ancestor redirects outside the working directory', async () => {
		mkdirSync(join(workDir, 'nested'));
		symlinkSync(outsideDir, join(workDir, 'nested', 'link'), directoryLinkType);

		const result = await permissions.getAutoApproval(readEvent(join(workDir, 'nested', 'link', 'secret.txt')), sessionUri);

		assert.strictEqual(result, undefined);
	});

	test('auto-approves a read through a symlink that stays inside the working directory', async () => {
		mkdirSync(join(workDir, 'real-read'));
		symlinkSync(join(workDir, 'real-read'), join(workDir, 'link-read'), directoryLinkType);

		const result = await permissions.getAutoApproval(readEvent(join(workDir, 'link-read', 'note.txt')), sessionUri);

		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation when only the real read path is inside the working directory', async () => {
		symlinkSync(workDir, join(outsideDir, 'link-to-workspace'), directoryLinkType);

		const result = await permissions.getAutoApproval(readEvent(join(outsideDir, 'link-to-workspace', 'note.txt')), sessionUri);

		assert.strictEqual(result, undefined);
	});

	test('auto-approves reads when the working directory is itself symlinked', async () => {
		const linkedWorkDir = join(outsideDir, 'linked-workspace');
		const linkedSessionUri = URI.from({ scheme: 'copilot', path: '/linked' }).toString();
		symlinkSync(workDir, linkedWorkDir, directoryLinkType);
		manager.createSession(makeSummary(linkedSessionUri, URI.file(linkedWorkDir).toString()));

		const result = await permissions.getAutoApproval(readEvent(join(linkedWorkDir, 'note.txt'), linkedSessionUri), linkedSessionUri);

		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation when read realpath resolution is denied', async () => {
		const results: (ToolCallConfirmationReason | undefined)[] = [];
		for (const code of ['EACCES', 'EPERM']) {
			const deniedPermissions = disposables.add(new SessionPermissionManager(manager, {
				realpath: async () => {
					const error: NodeJS.ErrnoException = new Error(`realpath failed with ${code}`);
					error.code = code;
					throw error;
				},
			}, configService, new NullLogService(), sessionDataService));
			await deniedPermissions.initialize();
			results.push(await deniedPermissions.getAutoApproval(readEvent(join(workDir, 'secret.txt')), sessionUri));
		}

		assert.deepStrictEqual(results, [undefined, undefined]);
	});

	test('auto-approves shell commands in default permission mode when terminal auto-approve is enabled', async () => {
		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation for sed in-place edits', async () => {
		const event = shellEvent('sed -i "s/foo/bar/" file.txt', 'bash');
		assert.deepStrictEqual({
			approval: await permissions.getAutoApproval(event, sessionUri),
			ruleResolvable: permissions.isAutoApproveRuleResolvable(event, sessionUri),
		}, {
			approval: undefined,
			ruleResolvable: false,
		});
	});

	test('uses forwarded terminal auto-approve rules as the source of truth over fallback defaults', async () => {
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: {} });

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('respects forwarded terminal auto-approve deny rules in default permission mode', async () => {
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: { echo: false } });

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('respects forwarded terminal auto-approve allow rules in default permission mode', async () => {
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: { python: true } });

		const result = await permissions.getAutoApproval(shellEvent('python script.py', 'bash'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation for shell commands in default permission mode when terminal auto-approve is disabled', async () => {
		configService.updateRootConfig({
			[AgentHostTerminalAutoApproveEnabledConfigKey]: false,
			[AgentHostTerminalAutoApproveRulesConfigKey]: { echo: true },
		});

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('isAutoApproveRuleResolvable is true only when a missing allow rule is the sole blocker', () => {
		const cases: [name: string, event: IToolApprovalEvent, expected: boolean][] = [
			['unknown command', shellEvent('my-custom-script', 'bash'), true],
			['already approved', shellEvent('echo hello', 'bash'), false],
			['denied', shellEvent('rm file.txt', 'bash'), false],
			['unapproved write redirect', shellEvent('my-custom-script > /etc/passwd', 'bash'), false],
			['sandbox bypass', { ...shellEvent('my-custom-script', 'bash'), requestSandboxBypass: true }, false],
			['non-shell', writeEvent('/outside/app.ts'), false],
		];
		assert.deepStrictEqual(
			cases.map(([name, e]) => `${name}=${permissions.isAutoApproveRuleResolvable(e, sessionUri)}`),
			cases.map(([name, , expected]) => `${name}=${expected}`));
	});

	test('isAutoApproveRuleResolvable is false when terminal auto-approve is disabled', () => {
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveEnabledConfigKey]: false });
		assert.strictEqual(permissions.isAutoApproveRuleResolvable(shellEvent('my-custom-script', 'bash'), sessionUri), false);
	});

	// `get-childitem` only matches the default `Get-ChildItem` allow rule under
	// PowerShell's case-insensitive matching, so it distinguishes which grammar
	// the approver used.
	test('shell approval and rule eligibility respect the event shell language', async () => {
		const pwshEvent = powershellEvent('get-childitem');
		assert.deepStrictEqual([
			await permissions.getAutoApproval(pwshEvent, sessionUri),
			await permissions.getAutoApproval(shellEvent('get-childitem', 'bash'), sessionUri),
			permissions.isAutoApproveRuleResolvable(pwshEvent, sessionUri),
			permissions.isAutoApproveRuleResolvable(shellEvent('get-childitem', 'bash'), sessionUri),
		], [ToolCallConfirmationReason.NotNeeded, undefined, false, true]);
	});

	test('PowerShell script-block payloads with nested denials require confirmation', async () => {
		configService.updateRootConfig({
			[AgentHostTerminalAutoApproveRulesConfigKey]: {
				'Measure-Command': true,
				'Set-Content': false,
				'Invoke-Expression': false,
			},
		});
		assert.deepStrictEqual([
			await permissions.getAutoApproval(powershellEvent('Measure-Command { Set-Content -Path out.txt -Value pwned }'), sessionUri),
			await permissions.getAutoApproval(powershellEvent('Measure-Command { Invoke-Expression "Write-Output hi" }'), sessionUri),
			await permissions.getAutoApproval(shellEvent('Write-Host hi; Set-Content -Path out.txt -Value pwned', 'powershell'), sessionUri),
			// Missing dialect remains fail-closed even for an otherwise allowlisted outer command.
			await permissions.getAutoApproval(shellEvent('Measure-Command { Get-ChildItem }', undefined), sessionUri),
		], [undefined, undefined, undefined, undefined]);
	});

	test('PowerShell redirects require a literal approved destination', async () => {
		const dynamicResults = [];
		for (const dest of ['$HOME/outside.txt', '$env:TEMP/x.txt', '$(Get-Location)/x.txt', '`pwd`/x.txt', '${HOME}/x.txt', '%APPDATA%/x.txt']) {
			dynamicResults.push(await permissions.getAutoApproval(powershellEvent(`Write-Host hi >${dest}`), sessionUri));
		}
		assert.deepStrictEqual({
			dynamicResults,
			literalWorkspaceDestination: await permissions.getAutoApproval(powershellEvent('Write-Host hi >out.txt'), sessionUri),
			nullSink: await permissions.getAutoApproval(powershellEvent('Write-Host hi >$null'), sessionUri),
		}, {
			dynamicResults: [undefined, undefined, undefined, undefined, undefined, undefined],
			literalWorkspaceDestination: ToolCallConfirmationReason.NotNeeded,
			nullSink: ToolCallConfirmationReason.NotNeeded,
		});
	});

	test('CMD delayed-expansion redirect destinations require confirmation', async () => {
		const delayedExpansion = shellEvent('echo hi >!APPDATA!\\outside.txt', 'bash');
		const literalExclamation = shellEvent('echo hi >important!.txt', 'bash');
		assert.deepStrictEqual({
			delayedApproval: await permissions.getAutoApproval(delayedExpansion, sessionUri),
			delayedRuleResolvable: permissions.isAutoApproveRuleResolvable(delayedExpansion, sessionUri),
			literalApproval: await permissions.getAutoApproval(literalExclamation, sessionUri),
		}, {
			delayedApproval: undefined,
			delayedRuleResolvable: false,
			literalApproval: ToolCallConfirmationReason.NotNeeded,
		});
	});

	test('missing shell language disables terminal rules and rule suggestions', async () => {
		const event = shellEvent('Get-ChildItem', undefined);
		assert.deepStrictEqual({
			approval: await permissions.getAutoApproval(event, sessionUri),
			ruleResolvable: permissions.isAutoApproveRuleResolvable(event, sessionUri),
		}, {
			approval: undefined,
			ruleResolvable: false,
		});
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

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
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
		const result = await permissions.getAutoApproval(shellEvent('rm -rf /tmp/whatever', 'bash'), sessionUri);
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

	// ---- Multi-root auto-approval ------------------------------------------
	// A session with multiple working directories auto-approves a read/write/
	// shell destination when it is contained by *any* root (index 0 = primary).
	// The multi-root path is otherwise dormant today (the create-time length
	// guard keeps sessions single-root), so these tests synthesize a two-root
	// session state directly.
	suite('multi-root', () => {
		const multiUri = URI.from({ scheme: 'copilot', path: '/multi' }).toString();

		setup(() => {
			// Index 0 (`workDir`) is the primary/process cwd; `workDir2` is a peer root.
			manager.createSession(makeSummary(multiUri, URI.file(workDir).toString(), URI.file(workDir2).toString()));
		});

		test('auto-approves reads and writes under any root, confirms outside all roots', async () => {
			const results = [
				await permissions.getAutoApproval(readEvent(join(workDir, 'a.txt'), multiUri), multiUri),
				await permissions.getAutoApproval(readEvent(join(workDir2, 'a.txt'), multiUri), multiUri),
				await permissions.getAutoApproval(readEvent(join(outsideDir, 'a.txt'), multiUri), multiUri),
				await permissions.getAutoApproval(writeEvent(join(workDir, 'x.txt')), multiUri),
				await permissions.getAutoApproval(writeEvent(join(workDir2, 'x.txt')), multiUri),
				await permissions.getAutoApproval(writeEvent(join(outsideDir, 'x.txt')), multiUri),
			];
			assert.deepStrictEqual(results, [
				ToolCallConfirmationReason.NotNeeded,
				ToolCallConfirmationReason.NotNeeded,
				undefined,
				ToolCallConfirmationReason.NotNeeded,
				ToolCallConfirmationReason.NotNeeded,
				undefined,
			]);
		});

		test('a relative shell redirect resolves against the primary root (index 0)', async () => {
			// `out.txt` resolves against the single process cwd = `workDir`, so it
			// is contained by the primary root and auto-approves.
			const result = await permissions.getAutoApproval(shellEvent('echo hi > out.txt', 'bash'), multiUri);
			assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
		});

		(isWindows ? test.skip : test)('an absolute shell redirect auto-approves under a non-primary root but confirms outside', async () => {
			// POSIX-only: embedding absolute paths in the command string avoids
			// Windows backslash/drive-colon parsing pitfalls. The containment rule
			// itself is platform-agnostic and covered by the read/write test above.
			const intoPeer = await permissions.getAutoApproval(shellEvent(`echo hi > ${join(workDir2, 'out.txt')}`, 'bash'), multiUri);
			const outside = await permissions.getAutoApproval(shellEvent(`echo hi > ${join(outsideDir, 'out.txt')}`, 'bash'), multiUri);
			assert.deepStrictEqual([intoPeer, outside], [ToolCallConfirmationReason.NotNeeded, undefined]);
		});

		test('requires confirmation for a symlink that crosses from one root into another (fail-closed)', async () => {
			// A symlink inside `workDir` pointing at the peer root `workDir2`: the
			// literal path is under root A and the real path under root B, so no
			// single root contains both the literal and resolved path. Fail-closed
			// ⇒ confirmation for both read and write.
			symlinkSync(workDir2, join(workDir, 'cross-link'), directoryLinkType);
			const read = await permissions.getAutoApproval(readEvent(join(workDir, 'cross-link', 'note.txt'), multiUri), multiUri);
			const write = await permissions.getAutoApproval(writeEvent(join(workDir, 'cross-link', 'note.txt')), multiUri);
			assert.deepStrictEqual([read, write], [undefined, undefined]);
		});
	});
});
