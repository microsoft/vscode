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
import { withChatSurfaceMeta } from '../../common/meta/agentChatSurfaceMeta.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostEditAutoApprovePatternsConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey, platformRootSchema, platformSessionSchema } from '../../common/agentHostSchema.js';
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../../common/sessionDataService.js';
import { DEFAULT_EDIT_AUTO_APPROVE_PATTERNS, getChatSensitiveEditLocations, mergeChatEditAutoApprovePatterns } from '../../../chat/common/chatSettings.js';
import { AgentPermissionKind, type IAgentToolPendingConfirmationSignal } from '../../common/agent.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageAttachmentKind, MessageKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, type SessionSummary } from '../../common/state/sessionState.js';
import { ConfirmationOptionKind, type ConfirmationOption } from '../../common/state/protocol/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { chatToolCallStart, chatTurnStarted } from '../common/chatActionBuilders.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { SessionPermissionManager, type IToolApprovalEvent } from '../../node/sessionPermissions.js';
import { createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

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

	function makeSummary(resource: string, ...workingDirectories: string[]): SessionSummary & { readonly defaultChat: string } {
		return {
			resource,
			provider: 'copilot',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///project', displayName: 'Project' },
			workingDirectories: workingDirectories.length > 0 ? workingDirectories : undefined,
			defaultChat: buildDefaultChatUri(resource),
		};
	}

	function writeEvent(permissionPath: string): IToolApprovalEvent {
		return { toolCallId: 'tc-1', session: URI.parse(sessionUri), permissionKind: AgentPermissionKind.Write, permissionPath };
	}

	function readEvent(permissionPath: string, resource = sessionUri): IToolApprovalEvent {
		return { toolCallId: 'tc-read', session: URI.parse(resource), permissionKind: AgentPermissionKind.Read, permissionPath };
	}

	function shellEvent(commandLine: string, shellLanguage: IToolApprovalEvent['shellLanguage']): IToolApprovalEvent {
		return { toolCallId: 'tc-shell', session: URI.parse(sessionUri), permissionKind: AgentPermissionKind.Shell, toolInput: commandLine, shellLanguage };
	}

	function powershellEvent(commandLine: string): IToolApprovalEvent {
		return shellEvent(commandLine, 'powershell');
	}

	function setPermissionRules(allow: readonly string[], deny: readonly string[] = [], ask: readonly string[] = []): void {
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: { [SessionConfigKey.Permissions]: { allow, deny, ...(ask.length ? { ask } : {}) } },
		});
	}

	function confirmationSignal(fields: Partial<IAgentToolPendingConfirmationSignal> = {}): IAgentToolPendingConfirmationSignal {
		return {
			kind: 'pending_confirmation',
			chat: URI.parse(buildDefaultChatUri(sessionUri)),
			state: {
				status: ToolCallStatus.PendingConfirmation, toolCallId: 'tc-scoped', toolName: 'custom', displayName: 'Custom',
				invocationMessage: 'Run tool', confirmationTitle: 'Run tool?',
			},
			...fields,
		};
	}

	function startConfirmation(signal: IAgentToolPendingConfirmationSignal, pathOptions: readonly ConfirmationOption[] = []): void {
		const chat = signal.chat.toString();
		manager.dispatchServerAction(chat, chatTurnStarted('turn-scoped', 'go'));
		manager.dispatchServerAction(chat, chatToolCallStart('turn-scoped', signal.state.toolCallId, signal.state.toolName, signal.state.displayName));
		manager.dispatchServerAction(chat, permissions.createToolReadyAction(signal, chat, 'turn-scoped', pathOptions));
	}

	function confirmToolCall(chat: string, toolCallId: string, selectedOptionId: string): void {
		const turnId = manager.getChatState(chat)?.activeTurn?.id;
		assert.ok(turnId);
		manager.dispatchClientAction(chat, {
			type: ActionType.ChatToolCallConfirmed, turnId, toolCallId,
			approved: true, confirmed: ToolCallConfirmationReason.UserAction, selectedOptionId,
			_meta: { 'agentHost.permissionDecisionSource': 'human_response' },
		}, { clientId: 'test-client', clientSeq: 1 });
		permissions.handleToolCallConfirmed(chat, toolCallId, selectedOptionId);
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
		permissions = disposables.add(new SessionPermissionManager(manager, {}, configService, new NullLogService(), sessionDataService, createTestChatOwnershipService(manager)));
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

	test('legacy bare tool names still approve concrete tools', async () => {
		setPermissionRules(['bash']);
		const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'unknown-command', shellLanguage: 'bash' });
		startConfirmation({ ...signal, state: { ...signal.state, toolName: 'bash' } });
		assert.strictEqual(await permissions.getAutoApproval({ ...shellEvent('unknown-command', 'bash'), toolCallId: signal.state.toolCallId }, signal.chat.toString()), ToolCallConfirmationReason.Setting);
	});

	test('scoped shell grants must cover every sub-command, together with terminal rules', async () => {
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: true });
		setPermissionRules(['Shell(git log *)']);
		const event = shellEvent('git log && git status', 'bash');
		const partial = await permissions.getAutoApproval(event, sessionUri);
		setPermissionRules(['Shell(git log *)', 'Shell(git status *)']);
		const complete = await permissions.getAutoApproval(event, sessionUri);
		setPermissionRules(['Shell(my-command *)']);
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: false });
		const mixed = await permissions.getAutoApproval(shellEvent('my-command --flag && git status', 'bash'), sessionUri);
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveEnabledConfigKey]: false });
		const disabled = await permissions.getAutoApproval(shellEvent('my-command --flag', 'bash'), sessionUri);
		assert.deepStrictEqual([partial, complete, mixed, disabled], [undefined, ToolCallConfirmationReason.NotNeeded, ToolCallConfirmationReason.NotNeeded, undefined]);
	});

	test('the same Shell grant works across languages while preserving command case semantics', async () => {
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: true });
		setPermissionRules(['Shell(My-Command *)']);
		assert.deepStrictEqual(await Promise.all([
			permissions.getAutoApproval(powershellEvent('my-command --flag'), sessionUri),
			permissions.getAutoApproval(shellEvent('My-Command --flag', 'bash'), sessionUri),
			permissions.getAutoApproval(shellEvent('my-command --flag', 'bash'), sessionUri),
		]), [ToolCallConfirmationReason.NotNeeded, ToolCallConfirmationReason.NotNeeded, undefined]);
	});

	test('explicit shell grants override implicit defaults without becoming permission denies', async () => {
		setPermissionRules(['Shell(rm *)']);
		assert.deepStrictEqual([
			await permissions.getAutoApproval(shellEvent('rm file.txt', 'bash'), sessionUri),
			await permissions.isDeniedByPermissions(shellEvent('rm file.txt', 'bash'), sessionUri),
		], [ToolCallConfirmationReason.NotNeeded, false]);
	});

	test('ask rules force confirmation over explicit allows and implicit defaults', async () => {
		const event = shellEvent('rm file.txt && git status', 'bash');
		setPermissionRules(['Shell(rm *)'], [], ['Shell(rm *)']);
		const subCommandAsk = await permissions.getAutoApproval(event, sessionUri);
		setPermissionRules(['Shell(commandLine:rm file.txt && git status)'], [], ['Shell(rm *)']);
		const askOverCommandLine = await permissions.getAutoApproval(event, sessionUri);
		setPermissionRules(['Shell'], [], ['Shell(commandLine:rm file.txt && git status)']);
		const commandLineAsk = await permissions.getAutoApproval(event, sessionUri);
		setPermissionRules(['Shell(commandLine:custom-command && rm file.txt)']);
		const commandLineAllow = await permissions.getAutoApproval(shellEvent('custom-command && rm file.txt', 'bash'), sessionUri);
		setPermissionRules(['Shell(echo *)'], [], ['Shell(echo *)']);
		const askOverDefaults = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.deepStrictEqual({ subCommandAsk, askOverCommandLine, commandLineAsk, commandLineAllow, askOverDefaults }, {
			subCommandAsk: undefined, askOverCommandLine: undefined, commandLineAsk: undefined,
			commandLineAllow: ToolCallConfirmationReason.NotNeeded, askOverDefaults: undefined,
		});
	});

	test('ask rules cover read, edit, URL and generic tool permissions', async () => {
		setPermissionRules(['Read', 'Edit', 'WebFetch', 'custom'], [], ['Read', 'Edit', 'WebFetch', 'custom']);
		assert.deepStrictEqual(await Promise.all([
			readEvent(join(workDir, 'file.txt')),
			writeEvent(join(workDir, 'file.txt')),
			{ toolCallId: 'url', session: URI.parse(sessionUri), permissionKind: AgentPermissionKind.Url, permissionUrl: 'https://example.com' },
			{ toolCallId: 'custom', toolName: 'custom', session: URI.parse(sessionUri) },
		].map(event => permissions.getAutoApproval(event, sessionUri))), [undefined, undefined, undefined, undefined]);
	});

	test('ignoring defaults preserves explicit shell decisions and never writes implicit rules into permissions', async () => {
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: true });
		setPermissionRules(['Shell(custom-command *)'], [], ['Shell(echo *)']);
		assert.deepStrictEqual({
			results: await Promise.all(['echo hello', 'git status', 'custom-command --flag'].map(command => permissions.getAutoApproval(shellEvent(command, 'bash'), sessionUri))),
			root: configService.getRootValue(platformRootSchema, SessionConfigKey.Permissions),
			session: manager.getSessionState(sessionUri)?.config?.values[SessionConfigKey.Permissions],
		}, {
			results: [undefined, undefined, ToolCallConfirmationReason.NotNeeded],
			root: { allow: [], deny: [] },
			session: { allow: ['Shell(custom-command *)'], deny: [], ask: ['Shell(echo *)'] },
		});
	});

	test('shell regex and command-line deny rules reject before Allow All', async () => {
		configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });
		setPermissionRules(['Shell'], ['Shell(/^rm /)', 'Shell(commandLine:echo hello && custom-command)']);
		assert.deepStrictEqual(await Promise.all([
			permissions.isDeniedByPermissions(shellEvent('git status && rm file.txt', 'bash'), sessionUri),
			permissions.isDeniedByPermissions(shellEvent('echo hello && custom-command', 'bash'), sessionUri),
			permissions.isDeniedByPermissions(shellEvent('echo hello', 'bash'), sessionUri),
		]), [true, true, false]);
	});

	test('permission rules are the union of chat, session and root lists', async () => {
		setPermissionRules(['WebFetch(session.test)', 'WebFetch(session-asked.test)'], ['WebFetch(session-denied.test)'], ['WebFetch(session-asked.test)']);
		configService.updateRootConfig({ [SessionConfigKey.Permissions]: { allow: ['WebFetch(root.test)', 'WebFetch(root-asked.test)'], deny: ['WebFetch(root-denied.test)'], ask: ['WebFetch(root-asked.test)'] } });
		const peer = buildChatUri(sessionUri, 'permission-peer');
		manager.addChat(sessionUri, peer, creationTimeChatStorageResource(sessionUri, peer, buildDefaultChatUri(sessionUri)), {
			config: { values: { [SessionConfigKey.Permissions]: { allow: ['WebFetch(chat.test)', 'WebFetch(chat-asked.test)'], deny: ['WebFetch(chat-denied.test)'], ask: ['WebFetch(chat-asked.test)'] } } },
		});
		const result = await Promise.all(['chat', 'session', 'root'].map(async scope => {
			const event: IToolApprovalEvent = { toolCallId: 'tc-url', session: URI.parse(peer), permissionKind: AgentPermissionKind.Url, permissionUrl: `https://${scope}.test` };
			return [await permissions.getAutoApproval(event, peer), await permissions.isDeniedByPermissions({ ...event, permissionUrl: `https://${scope}-denied.test` }, peer), await permissions.getAutoApproval({ ...event, permissionUrl: `https://${scope}-asked.test` }, peer)];
		}));
		assert.deepStrictEqual(result, Array.from({ length: 3 }, () => [ToolCallConfirmationReason.Setting, true, undefined]));
	});

	test('URL wildcard grants use shared hostname matching', async () => {
		setPermissionRules(['WebFetch(*.example.com)']);
		const results = await Promise.all(['https://a.example.com/path', 'https://example.com', 'https://notexample.com'].map(permissionUrl => permissions.getAutoApproval({ toolCallId: 'tc-url', session: URI.parse(sessionUri), permissionKind: AgentPermissionKind.Url, permissionUrl }, sessionUri)));
		assert.deepStrictEqual(results, [ToolCallConfirmationReason.Setting, ToolCallConfirmationReason.Setting, undefined]);
	});

	test('root WebFetch URL-pattern grants approve matching paths but not sibling paths', async () => {
		configService.updateRootConfig({ [SessionConfigKey.Permissions]: { allow: ['WebFetch(github.com/microsoft/vscode/wiki/*)'], deny: [] } });
		const results = await Promise.all(['https://github.com/microsoft/vscode/wiki/Home', 'https://github.com/microsoft/vscode/issues/1'].map(permissionUrl => permissions.getAutoApproval({ toolCallId: 'tc-url', session: URI.parse(sessionUri), permissionKind: AgentPermissionKind.Url, permissionUrl }, sessionUri)));
		assert.deepStrictEqual(results, [ToolCallConfirmationReason.Setting, undefined]);
	});

	test('Read and Edit rules approve matching paths outside the working directory', async () => {
		const target = join(outsideDir, 'allowed.txt');
		setPermissionRules([`Read(//${target.replace(/\\/g, '/').replace(/^\//, '')})`, `Edit(//${target.replace(/\\/g, '/').replace(/^\//, '')})`]);
		assert.deepStrictEqual(await Promise.all([
			permissions.getAutoApproval(readEvent(target), sessionUri),
			permissions.getAutoApproval(writeEvent(target), sessionUri),
			permissions.getAutoApproval(writeEvent(join(outsideDir, 'other.txt')), sessionUri),
		]), [ToolCallConfirmationReason.Setting, ToolCallConfirmationReason.Setting, undefined]);
	});

	test('Read and Edit allow rules must match both literal and resolved paths, and fail closed on resolution errors', async () => {
		const target = join(outsideDir, 'allowed', 'link.txt');
		const allowedPath = join(outsideDir, 'allowed', 'real.txt');
		const outsidePath = join(outsideDir, 'elsewhere', 'secret.txt');
		const pattern = `//${join(outsideDir, 'allowed').replace(/\\/g, '/').replace(/^\//, '')}/**`;
		setPermissionRules([`Read(${pattern})`, `Edit(${pattern})`]);
		let resolvedPath: string | undefined;
		const scopedPermissions = disposables.add(new SessionPermissionManager(manager, {
			realpath: async fsPath => {
				// Compare as URIs: `URI.file(...).fsPath` normalizes the Windows drive letter casing.
				if (URI.file(fsPath).toString() !== URI.file(target).toString()) {
					return fsPath;
				}
				if (resolvedPath === undefined) {
					throw Object.assign(new Error('Cannot resolve path'), { code: 'EACCES' });
				}
				return resolvedPath;
			},
		}, configService, new NullLogService(), sessionDataService, createTestChatOwnershipService(manager)));
		const results = [];
		for (resolvedPath of [outsidePath, allowedPath, undefined]) {
			results.push(await Promise.all([readEvent(target), writeEvent(target)].map(event => scopedPermissions.getAutoApproval(event, sessionUri))));
		}
		assert.deepStrictEqual(results, [[undefined, undefined], [ToolCallConfirmationReason.Setting, ToolCallConfirmationReason.Setting], [undefined, undefined]]);
	});

	test('permission deny rules reject compound and unparseable shell commands', async () => {
		setPermissionRules([], ['Shell(rm *)', 'Shell(export *)', 'Shell(Remove-Item *)']);
		assert.deepStrictEqual(await Promise.all([
			permissions.isDeniedByPermissions(shellEvent('echo hello && rm file.txt', 'bash'), sessionUri),
			permissions.isDeniedByPermissions(shellEvent('export FOO=bar', 'bash'), sessionUri),
			permissions.isDeniedByPermissions(powershellEvent('Get-ChildItem; Remove-Item file.txt'), sessionUri),
			permissions.isDeniedByPermissions(shellEvent('echo hello', 'bash'), sessionUri),
		]), [true, true, true, false]);
		setPermissionRules([], ['Shell']);
		assert.strictEqual(await permissions.isDeniedByPermissions(shellEvent('echo hello', 'bash'), sessionUri), true);
	});

	test('read and write denies check literal paths and symlink targets', async () => {
		const link = join(workDir, 'linked');
		symlinkSync(outsideDir, link, directoryLinkType);
		const literal = join(link, 'secret.txt');
		const resolved = join(outsideDir, 'secret.txt');
		const rulePath = (value: string) => `//${value.replace(/\\/g, '/').replace(/^\//, '')}`;
		setPermissionRules([], [`Read(${rulePath(resolved)})`, `Edit(${rulePath(resolved)})`]);
		const realPathDenies = await Promise.all([readEvent(literal), writeEvent(literal)].map(event => permissions.isDeniedByPermissions(event, sessionUri)));
		setPermissionRules([], [`Read(${rulePath(literal)})`, `Edit(${rulePath(literal)})`]);
		const literalDenies = await Promise.all([readEvent(literal), writeEvent(literal)].map(event => permissions.isDeniedByPermissions(event, sessionUri)));
		assert.deepStrictEqual({ realPathDenies, literalDenies }, { realPathDenies: [true, true], literalDenies: [true, true] });
	});

	test('shell confirmations offer scoped prefix and exact grants with Allow Once first', () => {
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: true });
		const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'grep needle file && git log', shellLanguage: 'bash' });
		const action = permissions.createToolReadyAction(signal, sessionUri, 'turn');
		assert.deepStrictEqual(action.options, [
			{ id: 'allow-once', label: 'Allow Once', kind: 'approve' },
			{ id: 'allow-session-rules:["Shell(grep *)","Shell(git log *)"]', label: 'Allow Commands `grep …`, `git log …` in this Session', kind: 'approve', group: 1 },
			{ id: 'allow-session-rules:["Shell(grep needle file)","Shell(git log)"]', label: 'Allow Exact Command in this Session', kind: 'approve', group: 1 },
			{ id: 'allow-always-rules:["Shell(grep *)","Shell(git log *)"]', label: 'Always Allow Commands `grep …`, `git log …`', kind: 'approve', group: 1 },
			{ id: 'allow-always-rules:["Shell(grep needle file)","Shell(git log)"]', label: 'Always Allow Exact Command', kind: 'approve', group: 1 },
			{ id: 'skip', label: 'Skip', kind: 'deny', group: 2 },
		]);
	});

	test('shell suggestions include only unapproved sub-commands and use Shell rules for PowerShell', () => {
		const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'Get-ChildItem | My-Cmdlet -Flag', shellLanguage: 'powershell' });
		const action = permissions.createToolReadyAction(signal, sessionUri, 'turn');
		assert.deepStrictEqual(action.options, [
			{ id: 'allow-once', label: 'Allow Once', kind: 'approve' },
			{ id: 'allow-session-rules:["Shell(My-Cmdlet *)"]', label: 'Allow `My-Cmdlet …` in this Session', kind: 'approve', group: 1 },
			{ id: 'allow-session-rules:["Shell(My-Cmdlet -Flag)"]', label: 'Allow Exact Command in this Session', kind: 'approve', group: 1 },
			{ id: 'allow-always-rules:["Shell(My-Cmdlet *)"]', label: 'Always Allow `My-Cmdlet …`', kind: 'approve', group: 1 },
			{ id: 'allow-always-rules:["Shell(My-Cmdlet -Flag)"]', label: 'Always Allow Exact Command', kind: 'approve', group: 1 },
			{ id: 'skip', label: 'Skip', kind: 'deny', group: 2 },
		]);
	});

	test('unsafe, unparseable and disabled shell commands offer no scoped grants', () => {
		const commands = [
			confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'FOO=bar custom-command', shellLanguage: 'bash' }),
			confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'export FOO=bar', shellLanguage: 'bash' }),
			confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'custom-command', shellLanguage: undefined }),
		];
		const options = commands.map(signal => permissions.createToolReadyAction(signal, sessionUri, 'turn').options?.map(option => option.id));
		configService.updateRootConfig({ [AgentHostTerminalAutoApproveEnabledConfigKey]: false });
		options.push(permissions.createToolReadyAction(confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'custom-command', shellLanguage: 'bash' }), sessionUri, 'turn').options?.map(option => option.id));
		assert.deepStrictEqual(options, Array.from({ length: 4 }, () => ['allow-once', 'skip']));
	});

	test('exact shell grants are omitted when a sub-command contains a wildcard', () => {
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: true });
		const action = permissions.createToolReadyAction(confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'my-command *.txt', shellLanguage: 'bash' }), sessionUri, 'turn');
		assert.deepStrictEqual(action.options?.map(option => option.id), ['allow-once', 'allow-session-rules:["Shell(my-command *)"]', 'allow-always-rules:["Shell(my-command *)"]', 'skip']);
	});

	test('asked shell sub-commands and command lines offer only one-time approval', () => {
		const commands = ['echo hello && custom-command', 'custom-command && git status'];
		const rules = ['Shell(echo *)', 'Shell(commandLine:custom-command && git status)'];
		const options = commands.map((shellCommand, index) => {
			setPermissionRules(['Shell'], [], [rules[index]]);
			return permissions.createToolReadyAction(confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand, shellLanguage: 'bash' }), sessionUri, 'turn').options?.map(option => option.id);
		});
		assert.deepStrictEqual(options, [['allow-once', 'skip'], ['allow-once', 'skip']]);
	});

	test('Always shell prefix and exact grants write root permissions and preserve ask rules', async () => {
		const cases = [
			{ command: 'my-command --flag', rule: 'Shell(my-command *)' },
			{ command: 'my-command --flag', rule: 'Shell(my-command --flag)' },
			{ command: 'rm file.txt', rule: 'Shell(rm *)' },
		];
		const results = [];
		for (const { command, rule } of cases) {
			setPermissionRules(['existing'], ['blocked'], ['Shell(asked-command *)']);
			configService.updateRootConfig({ [SessionConfigKey.Permissions]: { allow: ['WebFetch(existing.test)'], deny: ['WebFetch(blocked.test)'], ask: ['Shell(other-asked-command *)'] } });
			const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: command, shellLanguage: 'bash' });
			startConfirmation(signal);
			confirmToolCall(signal.chat.toString(), signal.state.toolCallId, `allow-always-rules:${JSON.stringify([rule])}`);
			results.push({
				root: configService.getRootValue(platformRootSchema, SessionConfigKey.Permissions),
				session: manager.getSessionState(sessionUri)?.config?.values[SessionConfigKey.Permissions],
				approval: await permissions.getAutoApproval(shellEvent(command, 'bash'), sessionUri),
			});
		}
		assert.deepStrictEqual(results, cases.map(({ rule }) => ({
			root: { allow: ['WebFetch(existing.test)', rule], deny: ['WebFetch(blocked.test)'], ask: ['Shell(other-asked-command *)'] },
			session: { allow: ['existing'], deny: ['blocked'], ask: ['Shell(asked-command *)'] },
			approval: ToolCallConfirmationReason.NotNeeded,
		})));
	});

	test('URL confirmations offer session and always grants for the exact hostname', () => {
		const actions = ['https://api.example.com/path', 'https://example.co.uk', 'https://127.0.0.1:8080', 'https://[::1]:8080', 'not a URL'].map(permissionUrl => permissions.createToolReadyAction(confirmationSignal({ permissionKind: AgentPermissionKind.Url, permissionUrl }), sessionUri, 'turn'));
		assert.deepStrictEqual(actions.map(action => action.options?.map(option => [option.id, option.label])), [
			[['allow-once', 'Allow Once'], ['allow-session-rules:["WebFetch(api.example.com)"]', 'Allow Fetching api.example.com in this Session'], ['allow-always-rules:["WebFetch(api.example.com)"]', 'Always Allow Fetching api.example.com'], ['skip', 'Skip']],
			[['allow-once', 'Allow Once'], ['allow-session-rules:["WebFetch(example.co.uk)"]', 'Allow Fetching example.co.uk in this Session'], ['allow-always-rules:["WebFetch(example.co.uk)"]', 'Always Allow Fetching example.co.uk'], ['skip', 'Skip']],
			[['allow-once', 'Allow Once'], ['allow-session-rules:["WebFetch(127.0.0.1)"]', 'Allow Fetching 127.0.0.1 in this Session'], ['allow-always-rules:["WebFetch(127.0.0.1)"]', 'Always Allow Fetching 127.0.0.1'], ['skip', 'Skip']],
			[['allow-once', 'Allow Once'], ['allow-session-rules:["WebFetch([::1])"]', 'Allow Fetching [::1] in this Session'], ['allow-always-rules:["WebFetch([::1])"]', 'Always Allow Fetching [::1]'], ['skip', 'Skip']],
			[['allow-once', 'Allow Once'], ['skip', 'Skip']],
		]);
	});

	test('Always Allow Fetching deduplicates root allow rules, preserves deny rules and auto-approves the host', async () => {
		configService.updateRootConfig({ [SessionConfigKey.Permissions]: { allow: ['WebFetch(existing.test)'], deny: ['WebFetch(blocked.test)'] } });
		const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Url, permissionUrl: 'https://api.example.com/path' });
		const chat = signal.chat.toString();
		const event: IToolApprovalEvent = { toolCallId: signal.state.toolCallId, session: signal.chat, permissionKind: AgentPermissionKind.Url, permissionUrl: signal.permissionUrl };
		const before = await permissions.getAutoApproval(event, chat);
		for (let i = 0; i < 2; i++) {
			startConfirmation(signal);
			confirmToolCall(chat, signal.state.toolCallId, 'allow-always-rules:["WebFetch(api.example.com)"]');
		}
		assert.deepStrictEqual({
			before,
			root: configService.getRootValue(platformRootSchema, SessionConfigKey.Permissions),
			session: manager.getSessionState(sessionUri)?.config?.values[SessionConfigKey.Permissions],
			chat: manager.getChatConfig(chat),
			after: await permissions.getAutoApproval({ ...event, permissionUrl: 'https://api.example.com/another-path' }, chat),
			subdomain: await permissions.getAutoApproval({ ...event, permissionUrl: 'https://sub.api.example.com/path' }, chat),
			denied: await permissions.isDeniedByPermissions({ ...event, permissionUrl: 'https://blocked.test' }, chat),
		}, {
			before: undefined,
			root: { allow: ['WebFetch(existing.test)', 'WebFetch(api.example.com)'], deny: ['WebFetch(blocked.test)'] },
			session: undefined,
			chat: undefined,
			after: ToolCallConfirmationReason.Setting,
			subdomain: undefined,
			denied: true,
		});
	});

	test('read and write confirmations offer file and nearest Git-root grants without a tool-wide session option', async () => {
		const checkedPaths: string[] = [];
		const scopedPermissions = disposables.add(new SessionPermissionManager(manager, {
			exists: async path => {
				checkedPaths.push(path);
				return path === '/repo/nested/.git' || path === '/repo/.git';
			},
		}, configService, new NullLogService(), sessionDataService, createTestChatOwnershipService(manager)));
		const options: (readonly ConfirmationOption[] | undefined)[] = [];
		for (const permissionKind of [AgentPermissionKind.Read, AgentPermissionKind.Write]) {
			const signal = confirmationSignal({ permissionKind, permissionPath: '/repo/nested/src/app.ts' });
			const pathOptions = await scopedPermissions.getPathConfirmationOptions(signal);
			options.push(scopedPermissions.createToolReadyAction(signal, sessionUri, 'turn', pathOptions).options);
		}
		assert.deepStrictEqual({ checkedPaths, options }, {
			checkedPaths: ['/repo/nested/src/.git', '/repo/nested/.git', '/repo/nested/src/.git', '/repo/nested/.git'],
			options: [
				[
					{ id: 'allow-once', label: 'Allow Once', kind: 'approve' },
					{ id: 'allow-session-rules:["Read(//repo/nested/src/app.ts)"]', label: 'Allow Reading app.ts in this Session', kind: 'approve', group: 1 },
					{ id: 'allow-session-rules:["Read(//repo/nested/**)"]', label: 'Allow Reading Files in nested in this Session', kind: 'approve', group: 1 },
					{ id: 'skip', label: 'Skip', kind: 'deny', group: 2 },
				],
				[
					{ id: 'allow-once', label: 'Allow Once', kind: 'approve' },
					{ id: 'allow-session-rules:["Edit(//repo/nested/src/app.ts)"]', label: 'Allow Edits to app.ts in this Session', kind: 'approve', group: 1 },
					{ id: 'allow-session-rules:["Edit(//repo/nested/**)"]', label: 'Allow Edits in nested in this Session', kind: 'approve', group: 1 },
					{ id: 'skip', label: 'Skip', kind: 'deny', group: 2 },
				],
			],
		});
	});

	test('read and write confirmations fall back to the direct parent when no Git root exists', async () => {
		const checkedPaths: string[] = [];
		const scopedPermissions = disposables.add(new SessionPermissionManager(manager, {
			exists: async path => {
				checkedPaths.push(path);
				return false;
			},
		}, configService, new NullLogService(), sessionDataService, createTestChatOwnershipService(manager)));
		const options: (readonly ConfirmationOption[] | undefined)[] = [];
		for (const permissionKind of [AgentPermissionKind.Read, AgentPermissionKind.Write]) {
			const signal = confirmationSignal({ permissionKind, permissionPath: '/repo/src/app.ts' });
			const pathOptions = await scopedPermissions.getPathConfirmationOptions(signal);
			options.push(scopedPermissions.createToolReadyAction(signal, sessionUri, 'turn', pathOptions).options);
		}
		assert.deepStrictEqual({ checkedPaths, options }, {
			checkedPaths: ['/repo/src/.git', '/repo/.git', '/.git', '/repo/src/.git', '/repo/.git', '/.git'],
			options: [
				[
					{ id: 'allow-once', label: 'Allow Once', kind: 'approve' },
					{ id: 'allow-session-rules:["Read(//repo/src/app.ts)"]', label: 'Allow Reading app.ts in this Session', kind: 'approve', group: 1 },
					{ id: 'allow-session-rules:["Read(//repo/src/**)"]', label: 'Allow Reading Files in src in this Session', kind: 'approve', group: 1 },
					{ id: 'skip', label: 'Skip', kind: 'deny', group: 2 },
				],
				[
					{ id: 'allow-once', label: 'Allow Once', kind: 'approve' },
					{ id: 'allow-session-rules:["Edit(//repo/src/app.ts)"]', label: 'Allow Edits to app.ts in this Session', kind: 'approve', group: 1 },
					{ id: 'allow-session-rules:["Edit(//repo/src/**)"]', label: 'Allow Edits in src in this Session', kind: 'approve', group: 1 },
					{ id: 'skip', label: 'Skip', kind: 'deny', group: 2 },
				],
			],
		});
	});

	test('confirming a folder grant appends a recursive Edit rule to session permissions', async () => {
		setPermissionRules(['existing'], ['blocked'], ['Shell(rm *)']);
		permissions = disposables.add(new SessionPermissionManager(manager, {
			exists: async path => path === '/repo/.git',
		}, configService, new NullLogService(), sessionDataService, createTestChatOwnershipService(manager)));
		const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Write, permissionPath: '/repo/src/app.ts' });
		const pathOptions = await permissions.getPathConfirmationOptions(signal);
		startConfirmation(signal, pathOptions);
		confirmToolCall(signal.chat.toString(), signal.state.toolCallId, 'allow-session-rules:["Edit(//repo/**)"]');
		assert.deepStrictEqual({
			session: manager.getSessionState(sessionUri)?.config?.values[SessionConfigKey.Permissions],
			root: configService.getRootValue(platformRootSchema, SessionConfigKey.Permissions),
			chat: manager.getChatConfig(signal.chat.toString()),
		}, {
			session: { allow: ['existing', 'Edit(//repo/**)'], deny: ['blocked'], ask: ['Shell(rm *)'] },
			root: { allow: [], deny: [] },
			chat: undefined,
		});
	});

	test('other kinds keep the session grant first, while managed and sandbox asks remain one-time', () => {
		assert.deepStrictEqual([
			confirmationSignal({ permissionKind: AgentPermissionKind.Mcp }),
			confirmationSignal({ permissionKind: AgentPermissionKind.Shell, managedApprovalRequired: true }),
			confirmationSignal({ permissionKind: AgentPermissionKind.Url, requestSandboxBypass: true }),
			confirmationSignal({ permissionKind: AgentPermissionKind.Shell, requestSandboxPermissive: true }),
		].map(signal => permissions.createToolReadyAction(signal, sessionUri, 'turn').options?.map(option => option.id)), [
			['allow-session', 'allow-once', 'skip'], ['allow-once', 'skip'], ['allow-once', 'skip'], ['allow-once', 'skip'],
		]);
	});

	test('confirmed scoped grants are deduplicated in session permissions and unknown ids are ignored', () => {
		setPermissionRules(['existing'], ['blocked']);
		const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Url, permissionUrl: 'https://api.example.com' });
		const chat = signal.chat.toString();
		const grantId = 'allow-session-rules:["WebFetch(api.example.com)"]';
		for (const id of ['unknown', 'allow-session', 'allow-once', 'allow-session-rules:["WebFetch"]', grantId, grantId]) {
			startConfirmation(signal);
			confirmToolCall(chat, signal.state.toolCallId, id);
		}
		assert.deepStrictEqual({ session: manager.getSessionState(sessionUri)?.config?.values[SessionConfigKey.Permissions], chat: manager.getChatConfig(chat) }, {
			session: { allow: ['existing', 'WebFetch(api.example.com)'], deny: ['blocked'] }, chat: undefined,
		});
	});

	test('shell prefix and exact grants survive confirmation reduction and stay session-scoped', () => {
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: true });
		const signal = confirmationSignal({ permissionKind: AgentPermissionKind.Shell, shellCommand: 'my-command --flag && other --test', shellLanguage: 'bash' });
		const granted: string[] = [];
		for (const selectedOptionId of ['allow-session-rules:["Shell(my-command *)","Shell(other *)"]', 'allow-session-rules:["Shell(my-command --flag)","Shell(other --test)"]']) {
			setPermissionRules([], ['blocked']);
			startConfirmation(signal);
			confirmToolCall(signal.chat.toString(), signal.state.toolCallId, selectedOptionId);
			const value = configService.getEffectiveValue(sessionUri, platformSessionSchema, SessionConfigKey.Permissions);
			granted.push(...(value?.allow ?? []));
		}
		assert.deepStrictEqual(granted, ['Shell(my-command *)', 'Shell(other *)', 'Shell(my-command --flag)', 'Shell(other --test)']);
	});

	test('unknown and malformed confirmation options do not create permissions', () => {
		for (const id of ['unknown', 'allow-session-rules:not-json', 'allow-session-rules:{}', 'allow-session-rules:[1]']) {
			const signal = confirmationSignal();
			startConfirmation({ ...signal, state: { ...signal.state, options: [{ id, label: 'Allow', kind: ConfirmationOptionKind.Approve }] } });
			confirmToolCall(signal.chat.toString(), signal.state.toolCallId, id);
		}
		assert.strictEqual(manager.getSessionState(sessionUri)?.config?.values[SessionConfigKey.Permissions], undefined);
	});

	test('auto-approves a normal file inside the working directory', async () => {
		const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('auto-approves the owning session attachment for a peer chat, not that of the session named by its URI', async () => {
		const peerChat = buildChatUri(URI.from({ scheme: 'copilot', path: '/other' }), 'peer');
		manager.addChat(sessionUri, peerChat, creationTimeChatStorageResource(sessionUri, peerChat, buildDefaultChatUri(sessionUri)));
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

	test('auto-approves reads of the local files and folders the user attached to the chat, and nothing else', async () => {
		const chat = buildDefaultChatUri(sessionUri);
		const attachedFile = join(outsideDir, 'Desktop', 'mockup.txt');
		const attachedFolder = join(outsideDir, 'notes');
		mkdirSync(join(outsideDir, 'Desktop'), { recursive: true });
		mkdirSync(join(attachedFolder, 'nested'), { recursive: true });
		mkdirSync(join(outsideDir, 'secret'), { recursive: true });
		symlinkSync(join(outsideDir, 'secret'), join(attachedFolder, 'escape'), directoryLinkType);
		manager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: new Date().toISOString(), message: {
				text: 'summarize', origin: { kind: MessageKind.User }, attachments: [
					{ type: MessageAttachmentKind.Resource, uri: URI.file(attachedFile).toString(), label: 'mockup.txt', displayKind: 'file' },
					{ type: MessageAttachmentKind.Resource, uri: URI.file(attachedFolder).toString(), label: 'notes', displayKind: 'directory' },
				]
			}
		});

		const reads = await Promise.all([
			attachedFile,
			join(attachedFolder, 'nested', 'a.txt'),
			join(outsideDir, 'Desktop', 'other.txt'),
			join(attachedFolder, 'escape', 'key.txt'),
		].map(path => permissions.getAutoApproval(readEvent(path, chat), chat)));
		const write = await permissions.getAutoApproval(writeEvent(attachedFile), chat);

		assert.deepStrictEqual({ reads, write }, {
			reads: [ToolCallConfirmationReason.NotNeeded, ToolCallConfirmationReason.NotNeeded, undefined, undefined],
			write: undefined,
		});
	});

	test('a moved peer chat reads the attachments of its owner, its own storage and the session it came from (Block 4)', async () => {
		const origin = URI.from({ scheme: 'copilot', path: '/origin' }).toString();
		const unrelated = URI.from({ scheme: 'copilot', path: '/unrelated' }).toString();
		const peerChat = buildChatUri(URI.parse(origin), 'peer');
		manager.addChat(sessionUri, peerChat, peerChat);
		manager.recordMovedChatOrigins(new Map([[peerChat, origin]]));
		const attachmentOf = (scope: string) => URI.joinPath(sessionDataService.getSessionDataDir(URI.parse(scope)), SESSION_ATTACHMENTS_DIRNAME, 'id', 'a.txt').fsPath;

		const reads = await Promise.all([sessionUri, peerChat, origin, unrelated].map(scope => permissions.getAutoApproval(readEvent(attachmentOf(scope), peerChat), peerChat)));
		const writes = [sessionUri, peerChat, origin, unrelated].map(scope => permissions.isForbiddenSnapshotWrite({ ...writeEvent(attachmentOf(scope)), session: URI.parse(peerChat) }, peerChat));

		assert.deepStrictEqual({ reads, writes }, {
			reads: [ToolCallConfirmationReason.NotNeeded, ToolCallConfirmationReason.NotNeeded, ToolCallConfirmationReason.NotNeeded, undefined],
			writes: [true, true, true, false],
		});
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
			'.mcp.json',
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
			const files = ['.ENV', '.MCP.JSON', 'Package.json', join('.GIT', 'config'), join('.VSCODE', 'settings.json')];
			const results = await Promise.all(files.map(file => permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri)));
			assert.deepStrictEqual(results, files.map(() => undefined));
		});

		test('requires confirmation for lifecycle configuration files with non-canonical casing', async () => {
			const files = [
				join('.GITHUB', 'agents', 'dev-helper.md'),
				join('.GITHUB', 'hooks', 'say-hi.json'),
				join('.CLAUDE', 'agents', 'dev-helper.md'),
				join('.CLAUDE', 'settings.json'),
				join('.CLAUDE', 'settings.local.json'),
				join('.claude', 'SETTINGS.LOCAL.JSON'),
				join('.CODEX', 'hooks.json'),
				join('.codex', 'CONFIG.TOML'),
			];
			const results = await Promise.all(files.map(file => permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri)));
			assert.deepStrictEqual(results, files.map(() => undefined));
		});

		test('requires confirmation for configured locations with non-canonical casing', async () => {
			manager.setSessionConfig(sessionUri, {
				schema: platformSessionSchema.toProtocol(),
				values: {
					[SessionConfigKey.SensitiveEditLocations]: [{ path: 'custom-hooks', isDirectory: true }],
				},
			});

			const result = await permissions.getAutoApproval(writeEvent(join(workDir, 'CUSTOM-HOOKS', 'hook.json')), sessionUri);

			assert.strictEqual(result, undefined);
		});
	}

	test('respects forwarded edit auto-approve patterns', async () => {
		configService.updateRootConfig({
			[AgentHostEditAutoApprovePatternsConfigKey]: {
				'**/*': false,
				'**/*.ts': true,
				'**/.github/hooks/**': true,
				'**/.npmrc': true,
			},
		});

		assert.deepStrictEqual([
			await permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri),
			await permissions.getAutoApproval(writeEvent(join(workDir, 'README.md')), sessionUri),
			await permissions.getAutoApproval(writeEvent(join(workDir, '.github', 'hooks', 'pre-tool.json')), sessionUri),
			await permissions.getAutoApproval(writeEvent(join(workDir, '.npmrc')), sessionUri),
			await permissions.getAutoApproval(writeEvent(join(workDir, 'packages', 'nested', '.npmrc')), sessionUri),
		], [ToolCallConfirmationReason.NotNeeded, undefined, undefined, undefined, undefined]);
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
			join('.codex', 'agents', 'dev-helper.md'),
			join('.codex', 'config.toml'),
			join('.codex', 'hooks.json'),
		];
		const results: (ToolCallConfirmationReason | undefined)[] = [];
		for (const file of files) {
			results.push(await permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri));
		}
		assert.deepStrictEqual(results, files.map(() => undefined));
	});

	test('requires confirmation for configured custom hook file location', async () => {
		const sensitiveEditLocations = getChatSensitiveEditLocations({
			'custom-hooks/hooks.json': true,
			'custom-hook-dir': true,
			'disabled-hooks': false,
			'~/personal-hooks': true,
		}, {
			'custom-agents': true,
			'disabled-agents': false,
		});
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: {
				[SessionConfigKey.SensitiveEditLocations]: sensitiveEditLocations,
			},
		});

		assert.deepStrictEqual({
			sensitiveEditLocations,
			approvals: await Promise.all([
				permissions.getAutoApproval(writeEvent(join(workDir, 'custom-hooks', 'hooks.json')), sessionUri),
				permissions.getAutoApproval(writeEvent(join(workDir, 'custom-hooks', 'other.json')), sessionUri),
				permissions.getAutoApproval(writeEvent(join(workDir, 'custom-hook-dir', 'nested', 'hook.json')), sessionUri),
				permissions.getAutoApproval(writeEvent(join(workDir, 'custom-agents', 'reviewer.agent.md')), sessionUri),
				permissions.getAutoApproval(writeEvent(join(workDir, 'disabled-hooks', 'hook.json')), sessionUri),
				permissions.getAutoApproval(writeEvent(join(workDir, 'disabled-agents', 'reviewer.agent.md')), sessionUri),
				permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri),
			]),
		}, {
			sensitiveEditLocations: [
				{ path: 'custom-agents', isDirectory: true },
				{ path: 'custom-hook-dir', isDirectory: true },
				{ path: 'custom-hooks/hooks.json', isDirectory: true },
			],
			approvals: [
				undefined,
				ToolCallConfirmationReason.NotNeeded,
				undefined,
				undefined,
				ToolCallConfirmationReason.NotNeeded,
				ToolCallConfirmationReason.NotNeeded,
				ToolCallConfirmationReason.NotNeeded,
			],
		});
	});

	for (const location of ['settings.json', 'settings.json/', 'settings.JSON']) {
		for (const exists of [false, true]) {
			test(`requires confirmation for configured dotted hook location ${location} (exists: ${exists})`, async () => {
				if (exists) {
					mkdirSync(join(workDir, location));
				}
				configService.updateRootConfig({ [AgentHostEditAutoApprovePatternsConfigKey]: { '**/*': true } });
				manager.setSessionConfig(sessionUri, {
					schema: platformSessionSchema.toProtocol(),
					values: {
						[SessionConfigKey.SensitiveEditLocations]: getChatSensitiveEditLocations({ [location]: true }, {}),
					},
				});
				const directory = location.replace(/\/+$/, '');

				assert.deepStrictEqual(await Promise.all([
					permissions.getAutoApproval(writeEvent(join(workDir, directory, 'hook.json')), sessionUri),
					permissions.getAutoApproval(writeEvent(join(workDir, `${directory}-other`, 'hook.json')), sessionUri),
					permissions.getAutoApproval(writeEvent(join(workDir, 'src', 'app.ts')), sessionUri),
				]), [
					undefined,
					ToolCallConfirmationReason.NotNeeded,
					ToolCallConfirmationReason.NotNeeded,
				]);
			});
		}
	}

	test('requires confirmation for configured locations in every working directory', async () => {
		const multiRootSession = URI.from({ scheme: 'copilot', path: '/multi-root' }).toString();
		manager.createSession(makeSummary(multiRootSession, URI.file(workDir).toString(), URI.file(workDir2).toString()));
		manager.setSessionConfig(multiRootSession, {
			schema: platformSessionSchema.toProtocol(),
			values: {
				[SessionConfigKey.SensitiveEditLocations]: [{ path: 'custom-hooks', isDirectory: true }],
			},
		});

		const results = await Promise.all([
			permissions.getAutoApproval(writeEvent(join(workDir, 'custom-hooks', 'one.json')), multiRootSession),
			permissions.getAutoApproval(writeEvent(join(workDir2, 'custom-hooks', 'two.json')), multiRootSession),
			permissions.getAutoApproval(writeEvent(join(workDir2, 'src', 'app.ts')), multiRootSession),
		]);

		assert.deepStrictEqual(results, [undefined, undefined, ToolCallConfirmationReason.NotNeeded]);
	});

	test('requires confirmation through either side of a configured symlink location', async () => {
		mkdirSync(join(workDir, 'real-hooks'));
		symlinkSync(join(workDir, 'real-hooks'), join(workDir, 'custom-hooks'), directoryLinkType);
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: {
				[SessionConfigKey.SensitiveEditLocations]: [{ path: 'custom-hooks', isDirectory: true }],
			},
		});

		const results = await Promise.all([
			permissions.getAutoApproval(writeEvent(join(workDir, 'custom-hooks', 'hook.json')), sessionUri),
			permissions.getAutoApproval(writeEvent(join(workDir, 'real-hooks', 'hook.json')), sessionUri),
		]);

		assert.deepStrictEqual(results, [undefined, undefined]);
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

	test('shell redirects use canonical containment for symlink ancestors', async () => {
		mkdirSync(join(workDir, 'shell-real'));
		symlinkSync(join(workDir, 'shell-real'), join(workDir, 'shell-link-in'), directoryLinkType);
		symlinkSync(outsideDir, join(workDir, 'shell-link-out'), directoryLinkType);

		const inside = await permissions.getAutoApproval(shellEvent('echo hi > shell-link-in/note.txt', 'bash'), sessionUri);
		const outside = await permissions.getAutoApproval(shellEvent('echo hi > shell-link-out/note.txt', 'bash'), sessionUri);

		assert.deepStrictEqual([inside, outside], [ToolCallConfirmationReason.NotNeeded, undefined]);
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
			}, configService, new NullLogService(), sessionDataService, createTestChatOwnershipService(manager)));
			await deniedPermissions.initialize();
			results.push(await deniedPermissions.getAutoApproval(readEvent(join(workDir, 'secret.txt')), sessionUri));
		}

		assert.deepStrictEqual(results, [undefined, undefined]);
	});

	test('auto-approves shell commands in default permission mode when terminal auto-approve is enabled', async () => {
		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation when a shell redirect targets a configured sensitive location', async () => {
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: {
				[SessionConfigKey.SensitiveEditLocations]: [{ path: 'custom-hooks', isDirectory: true }],
			},
		});

		const results = await Promise.all([
			permissions.getAutoApproval(shellEvent('echo hook > custom-hooks/hooks.json', 'bash'), sessionUri),
			permissions.getAutoApproval(shellEvent('echo code > src/app.ts', 'bash'), sessionUri),
		]);

		assert.deepStrictEqual(results, [undefined, ToolCallConfirmationReason.NotNeeded]);
	});

	test('requires confirmation for sed in-place edits', async () => {
		const event = shellEvent('sed -i "s/foo/bar/" file.txt', 'bash');
		assert.deepStrictEqual({
			approval: await permissions.getAutoApproval(event, sessionUri),
		}, {
			approval: undefined,
		});
	});

	test('ignores implicit terminal defaults when requested', async () => {
		configService.updateRootConfig({ [AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: true });

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('explicit ask rules override implicit allows in default permission mode', async () => {
		setPermissionRules([], [], ['Shell(echo *)']);

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, undefined);
	});

	test('explicit shell allow rules work in default permission mode', async () => {
		setPermissionRules(['Shell(python *)']);

		const result = await permissions.getAutoApproval(shellEvent('python script.py', 'bash'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
	});

	test('requires confirmation for shell commands in default permission mode when terminal auto-approve is disabled', async () => {
		configService.updateRootConfig({
			[AgentHostTerminalAutoApproveEnabledConfigKey]: false,
			[AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: false,
		});

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, undefined);
	});


	// `get-childitem` only matches the default `Get-ChildItem` allow rule under
	// PowerShell's case-insensitive matching, so it distinguishes which grammar
	// the approver used.
	test('shell approval respects the event shell language', async () => {
		const pwshEvent = powershellEvent('get-childitem');
		assert.deepStrictEqual([
			await permissions.getAutoApproval(pwshEvent, sessionUri),
			await permissions.getAutoApproval(shellEvent('get-childitem', 'bash'), sessionUri),
		], [ToolCallConfirmationReason.NotNeeded, undefined]);
	});

	test('PowerShell script-block payloads with nested denials require confirmation', async () => {
		setPermissionRules(['Shell(Measure-Command *)'], [], ['Shell(Set-Content *)', 'Shell(Invoke-Expression *)']);
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

	test('redirect pathname globs require confirmation', async () => {
		const events = [
			shellEvent('echo hi > .[g]it/config', 'bash'),
			shellEvent('echo hi > .[e]nv', 'bash'),
			shellEvent('echo hi > packag?.json', 'bash'),
			shellEvent('echo hi > "packag"[e]".json"', 'bash'),
			powershellEvent(`Write-Host hi >'.[m]cp.json'`),
			powershellEvent(`Write-Host hi >".[c]odex/hooks.json"`),
		];
		assert.deepStrictEqual(
			await Promise.all(events.map(event => permissions.getAutoApproval(event, sessionUri))),
			events.map(() => undefined)
		);
	});

	test('quoted non-glob redirects outside the working directory require confirmation', async () => {
		const events = [
			shellEvent(`echo hi > "${outsideDir}/"report".txt"`, 'bash'),
			shellEvent(`echo hi >> '${outsideDir}/'report'.txt'`, 'bash'),
			powershellEvent(`Write-Host hi > '${outsideDir}/report''s.txt'`),
			powershellEvent(`Write-Host hi >>'${outsideDir}/report''s.txt'`),
		];
		assert.deepStrictEqual({
			approvals: await Promise.all(events.map(event => permissions.getAutoApproval(event, sessionUri))),
		}, {
			approvals: events.map(() => undefined),
		});
	});

	test('CMD delayed-expansion redirect destinations require confirmation', async () => {
		const delayedExpansion = shellEvent('echo hi >!APPDATA!\\outside.txt', 'bash');
		const literalExclamation = shellEvent('echo hi >important!.txt', 'bash');
		assert.deepStrictEqual({
			delayedApproval: await permissions.getAutoApproval(delayedExpansion, sessionUri),
			literalApproval: await permissions.getAutoApproval(literalExclamation, sessionUri),
		}, {
			delayedApproval: undefined,
			literalApproval: ToolCallConfirmationReason.NotNeeded,
		});
	});

	test('missing shell language disables terminal rules and rule suggestions', async () => {
		const event = shellEvent('Get-ChildItem', undefined);
		assert.deepStrictEqual({
			approval: await permissions.getAutoApproval(event, sessionUri),
		}, {
			approval: undefined,
		});
	});

	test('does not affect session bypass permission mode when terminal auto-approve is disabled', async () => {
		configService.updateRootConfig({
			[AgentHostTerminalAutoApproveEnabledConfigKey]: false,
			[AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey]: false,
		});
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
		});

		const result = await permissions.getAutoApproval(shellEvent('echo hello', 'bash'), sessionUri);
		assert.strictEqual(result, ToolCallConfirmationReason.Setting);
	});

	for (const mode of ['session', 'global'] as const) {
		for (const terminalAutoApproveEnabled of [true, false]) {
			test(`${mode} allow-all overrides terminal approval settings and restores them in default mode (terminal auto-approve ${terminalAutoApproveEnabled})`, async () => {
				configService.updateRootConfig({
					[AgentHostTerminalAutoApproveEnabledConfigKey]: terminalAutoApproveEnabled,
					[SessionConfigKey.Permissions]: { allow: ['Shell(ls *)'], deny: [], ask: ['Shell(ls *)', 'Shell(rm *)'] },
				});
				const events = [shellEvent('ls -lh', 'bash'), shellEvent('rm -f file.txt', 'bash')];
				const before = await Promise.all(events.map(event => permissions.getAutoApproval(event, sessionUri)));

				if (mode === 'global') {
					configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });
				} else {
					manager.setSessionConfig(sessionUri, {
						schema: platformSessionSchema.toProtocol(),
						values: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
					});
				}
				const allowAll = await Promise.all(events.map(event => permissions.getAutoApproval(event, sessionUri)));

				if (mode === 'global') {
					configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: false });
				} else {
					manager.setSessionConfig(sessionUri, {
						schema: platformSessionSchema.toProtocol(),
						values: { [SessionConfigKey.AutoApprove]: 'default' },
					});
				}
				const after = await Promise.all(events.map(event => permissions.getAutoApproval(event, sessionUri)));

				assert.deepStrictEqual({ before, allowAll, after }, {
					before: [undefined, undefined],
					allowAll: [ToolCallConfirmationReason.Setting, ToolCallConfirmationReason.Setting],
					after: [undefined, undefined],
				});
			});
		}
	}

	test('approval levels stay chat-scoped while "Allow in this Session" grants apply to all chats', async () => {
		const protocol = platformSessionSchema.toProtocol();
		manager.setSessionConfig(sessionUri, {
			schema: {
				...protocol, properties: {
					...protocol.properties,
					[SessionConfigKey.AutoApprove]: { ...protocol.properties[SessionConfigKey.AutoApprove], chatMutable: true },
					[SessionConfigKey.Permissions]: { ...protocol.properties[SessionConfigKey.Permissions], chatMutable: true },
				}
			},
			values: { [SessionConfigKey.AutoApprove]: 'default' },
		});
		const defaultChat = buildDefaultChatUri(sessionUri);
		const allowAll = buildChatUri(sessionUri, 'allow-all');
		const allowAllSubagent = buildChatUri(sessionUri, 'allow-all-subagent');
		const peer = buildChatUri(sessionUri, 'peer');
		const peerSubagent = buildChatUri(sessionUri, 'peer-subagent');
		const storage = (chat: string) => creationTimeChatStorageResource(sessionUri, chat, defaultChat);
		manager.addChat(sessionUri, allowAll, storage(allowAll), { config: { values: { [SessionConfigKey.AutoApprove]: 'autoApprove' } } });
		manager.addChat(sessionUri, allowAllSubagent, storage(allowAll), { origin: { kind: ChatOriginKind.Tool, chat: allowAll, toolCallId: 'spawn-1' } });
		manager.addChat(sessionUri, peer, storage(peer));
		manager.addChat(sessionUri, peerSubagent, storage(peer), { origin: { kind: ChatOriginKind.Tool, chat: peer, toolCallId: 'spawn-2' } });
		const startToolCall = (chat: string, toolCallId: string, toolName: string) => {
			manager.dispatchServerAction(chat, chatTurnStarted(`turn-${toolCallId}`, 'go'));
			manager.dispatchServerAction(chat, chatToolCallStart(`turn-${toolCallId}`, toolCallId, toolName, toolName));
			manager.dispatchServerAction(chat, permissions.createToolReadyAction(confirmationSignal({ chat: URI.parse(chat), state: { status: ToolCallStatus.PendingConfirmation, toolCallId, toolName, displayName: toolName, invocationMessage: 'Run tool', confirmationTitle: 'Run tool?' } }), chat, `turn-${toolCallId}`));
		};
		const outsideWrite = writeEvent(join(outsideDir, 'outside.txt'));
		const approvals = {
			defaultChat: await permissions.getAutoApproval(outsideWrite, defaultChat),
			allowAll: await permissions.getAutoApproval(outsideWrite, allowAll),
			allowAllSubagent: await permissions.getAutoApproval(outsideWrite, allowAllSubagent),
		};

		startToolCall(peer, 'tc-peer', 'peerTool');
		confirmToolCall(peer, 'tc-peer', 'allow-session');
		startToolCall(peerSubagent, 'tc-sub', 'subagentTool');
		confirmToolCall(peerSubagent, 'tc-sub', 'allow-session');
		startToolCall(defaultChat, 'tc-default', 'peerTool');

		assert.deepStrictEqual({
			approvals,
			peer: manager.getChatConfig(peer)?.values,
			peerSubagent: manager.getChatConfig(peerSubagent),
			sessionPermissions: manager.getSessionState(sessionUri)?.config?.values[SessionConfigKey.Permissions],
			peerToolInPeer: await permissions.getAutoApproval({ ...outsideWrite, toolCallId: 'tc-peer' }, peer),
			peerToolInDefaultChat: await permissions.getAutoApproval({ ...outsideWrite, toolCallId: 'tc-default' }, defaultChat),
		}, {
			approvals: { defaultChat: undefined, allowAll: ToolCallConfirmationReason.Setting, allowAllSubagent: ToolCallConfirmationReason.Setting },
			peer: undefined,
			peerSubagent: undefined,
			sessionPermissions: { allow: ['peerTool', 'subagentTool'], deny: [] },
			peerToolInPeer: ToolCallConfirmationReason.Setting,
			peerToolInDefaultChat: ToolCallConfirmationReason.Setting,
		});
	});

	test('a host-reported approval mode applies to the chat it was reported for', () => {
		manager.setSessionConfig(sessionUri, {
			schema: {
				type: 'object', properties: {
					autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'assisted', 'autoApprove'], chatMutable: true },
					availableApprovalModes: { type: 'array', title: 'Available', readOnly: true },
					effectiveApprovalMode: { type: 'string', title: 'Effective', readOnly: true, chatMutable: true },
				}
			},
			values: { autoApprove: 'default', availableApprovalModes: ['default', 'autoApprove'], effectiveApprovalMode: 'default' },
		});
		const defaultChat = buildDefaultChatUri(sessionUri);
		const peer = buildChatUri(sessionUri, 'peer');
		manager.addChat(sessionUri, peer, creationTimeChatStorageResource(sessionUri, peer, defaultChat), { config: { values: { autoApprove: 'autoApprove', effectiveApprovalMode: 'autoApprove' } } });
		assert.deepStrictEqual([defaultChat, peer].map(chat => permissions.getEffectiveApprovalLevel(chat)), ['default', 'autoApprove']);
	});

	test('a chat that chose its own approvals has them, not the session\'s reported mode, until a mode is reported for the chat', () => {
		const configure = (sessionApproval: string, sessionMode: string) => manager.setSessionConfig(sessionUri, {
			schema: {
				type: 'object', properties: {
					autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'assisted', 'autoApprove'], chatMutable: true },
					availableApprovalModes: { type: 'array', title: 'Available', readOnly: true },
					effectiveApprovalMode: { type: 'string', title: 'Effective', readOnly: true, chatMutable: true },
				}
			},
			values: { autoApprove: sessionApproval, availableApprovalModes: ['default', 'autoApprove'], effectiveApprovalMode: sessionMode },
		});
		const defaultChat = buildDefaultChatUri(sessionUri);
		const manual = buildChatUri(sessionUri, 'manual');
		const allowAll = buildChatUri(sessionUri, 'allow-all');
		const reported = buildChatUri(sessionUri, 'reported');
		manager.addChat(sessionUri, manual, creationTimeChatStorageResource(sessionUri, manual, defaultChat), { config: { values: { autoApprove: 'default' } } });
		manager.addChat(sessionUri, allowAll, creationTimeChatStorageResource(sessionUri, allowAll, defaultChat), { config: { values: { autoApprove: 'autoApprove' } } });
		manager.addChat(sessionUri, reported, creationTimeChatStorageResource(sessionUri, reported, defaultChat), { config: { values: { autoApprove: 'autoApprove', effectiveApprovalMode: 'default' } } });
		const levels = () => [defaultChat, manual, allowAll, reported].map(chat => permissions.getEffectiveApprovalLevel(chat));
		configure('autoApprove', 'autoApprove');
		const sessionAllowsAll = levels();
		configure('default', 'default');
		const sessionManual = levels();
		assert.deepStrictEqual({ sessionAllowsAll, sessionManual }, {
			sessionAllowsAll: ['autoApprove', 'default', 'autoApprove', 'default'],
			sessionManual: ['default', 'default', 'autoApprove', 'default'],
		});
	});

	test('global approval cannot bypass the host-reported permission policy', async () => {
		configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });
		const config = {
			schema: {
				...platformSessionSchema.toProtocol(), properties: {
					...platformSessionSchema.toProtocol().properties,
					availableApprovalModes: { type: 'array' as const, title: 'Available', readOnly: true },
					effectiveApprovalMode: { type: 'string' as const, title: 'Effective', readOnly: true },
				}
			},
			values: { autoApprove: 'autoApprove', availableApprovalModes: ['default'], effectiveApprovalMode: 'default' },
		};
		manager.setSessionConfig(sessionUri, config);
		const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, 'outside.txt')), sessionUri);
		assert.deepStrictEqual({ result, level: permissions.getEffectiveApprovalLevel(sessionUri) }, { result: undefined, level: 'default' });
	});

	for (const global of [false, true]) {
		test(`standard approval reports control automatic approval (global=${global})`, async () => {
			configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: global });
			const results = [];
			for (const [effective, available] of [
				['manual', ['manual', 'assisted', 'allow-all']],
				['assisted', ['manual', 'assisted', 'allow-all']],
				['allow-all', ['manual', 'assisted', 'allow-all']],
				['allow-all', ['manual']],
				['invalid', ['manual', 'invalid']],
			] as const) {
				manager.setSessionConfig(sessionUri, {
					schema: {
						type: 'object', properties: {
							approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'] },
							availableApprovalModes: { type: 'array', title: 'Available', readOnly: true },
							effectiveApprovalMode: { type: 'string', title: 'Effective', readOnly: true },
						}
					},
					values: { approvalMode: 'manual', effectiveApprovalMode: effective, availableApprovalModes: [...available] },
				});
				results.push({
					level: permissions.getEffectiveApprovalLevel(sessionUri),
					approved: await permissions.getAutoApproval(writeEvent(join(outsideDir, 'outside.txt')), sessionUri),
				});
			}
			assert.deepStrictEqual(results, [
				{ level: 'default', approved: undefined },
				{ level: 'assisted', approved: undefined },
				{ level: 'autoApprove', approved: ToolCallConfirmationReason.Setting },
				{ level: 'default', approved: undefined },
				{ level: 'default', approved: undefined },
			]);
		});
	}

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

	test('managed policy disables a persisted session auto-approve level', () => {
		manager.setSessionConfig(sessionUri, {
			schema: platformSessionSchema.toProtocol(),
			values: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
		});
		assert.strictEqual(permissions.isSessionAutoApproveEnabled(sessionUri), true);

		configService.updateRootConfig({ [AgentHostAutoApprovePolicyRestrictedConfigKey]: true });

		assert.strictEqual(permissions.isSessionAutoApproveEnabled(sessionUri), false);
	});

	// ---- Multi-root auto-approval ------------------------------------------
	// A session with multiple working directories auto-approves a read/write/
	// shell destination when it is contained by *any* root (index 0 = primary).
	// The multi-root path is otherwise dormant today (the create-time length
	// guard keeps sessions single-root), so these tests synthesize a two-root
	// session state directly.
	suite('surface edit scope', () => {

		const inlineSessionUri = URI.from({ scheme: 'copilot', path: '/inline' }).toString();

		/** Creates an inline-chat session scoped to `targetUri`, or to nothing when omitted. */
		function createInlineSession(targetUri: string | undefined): void {
			manager.createSession({
				...makeSummary(inlineSessionUri, URI.file(workDir).toString()),
				_meta: withChatSurfaceMeta(undefined, {
					surface: 'editorInline',
					languageId: 'typescript',
					...(targetUri !== undefined ? { targetUri } : {}),
				}),
			});
		}

		function inlineEvent(event: IToolApprovalEvent): IToolApprovalEvent {
			return { ...event, session: URI.parse(inlineSessionUri) };
		}

		test('auto-approves a write to the inline chat target file', async () => {
			const target = join(workDir, 'src', 'inline.ts');
			createInlineSession(URI.file(target).toString());

			const result = await permissions.getAutoApproval(inlineEvent(writeEvent(target)), inlineSessionUri);
			assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
		});

		test('auto-approves reads and writes of the target file outside the working directory', async () => {
			// Inline chat can be invoked on any open document, so consent follows
			// the target rather than the workspace root. The agent has to read the
			// file before editing it, so both kinds must stay silent.
			const target = join(outsideDir, 'detached.ts');
			createInlineSession(URI.file(target).toString());

			assert.deepStrictEqual({
				inlineWrite: await permissions.getAutoApproval(inlineEvent(writeEvent(target)), inlineSessionUri),
				inlineRead: await permissions.getAutoApproval(inlineEvent(readEvent(target, inlineSessionUri)), inlineSessionUri),
				unscopedWrite: await permissions.getAutoApproval(writeEvent(target), sessionUri),
				unscopedRead: await permissions.getAutoApproval(readEvent(target), sessionUri),
			}, {
				inlineWrite: ToolCallConfirmationReason.NotNeeded,
				inlineRead: ToolCallConfirmationReason.NotNeeded,
				unscopedWrite: undefined,
				unscopedRead: undefined,
			});
		});

		test('requires confirmation for a write to another file in the working directory', async () => {
			createInlineSession(URI.file(join(workDir, 'src', 'inline.ts')).toString());
			const otherFile = join(workDir, 'src', 'app.ts');

			// The same write auto-approves for a non-inline session, so this
			// asserts the scope is what withholds approval.
			assert.deepStrictEqual({
				inline: await permissions.getAutoApproval(inlineEvent(writeEvent(otherFile)), inlineSessionUri),
				unscoped: await permissions.getAutoApproval(writeEvent(otherFile), sessionUri),
			}, {
				inline: undefined,
				unscoped: ToolCallConfirmationReason.NotNeeded,
			});
		});

		test('requires confirmation for shell commands that would otherwise auto-approve', async () => {
			createInlineSession(URI.file(join(workDir, 'src', 'inline.ts')).toString());

			assert.deepStrictEqual({
				inline: await permissions.getAutoApproval(inlineEvent(powershellEvent('echo hello')), inlineSessionUri),
				unscoped: await permissions.getAutoApproval(powershellEvent('echo hello'), sessionUri),
			}, {
				inline: undefined,
				unscoped: ToolCallConfirmationReason.NotNeeded,
			});
		});

		test('leaves reads unscoped so context gathering stays silent', async () => {
			createInlineSession(URI.file(join(workDir, 'src', 'inline.ts')).toString());

			const result = await permissions.getAutoApproval(
				inlineEvent(readEvent(join(workDir, 'src', 'app.ts'), inlineSessionUri)),
				inlineSessionUri,
			);
			assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
		});

		test('fails closed when the surface recorded no usable target', async () => {
			createInlineSession(undefined);

			const result = await permissions.getAutoApproval(inlineEvent(writeEvent(join(workDir, 'src', 'app.ts'))), inlineSessionUri);
			assert.strictEqual(result, undefined);
		});

		test('does not override an explicit global auto-approve opt-in', async () => {
			createInlineSession(URI.file(join(workDir, 'src', 'inline.ts')).toString());
			configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });

			const result = await permissions.getAutoApproval(inlineEvent(writeEvent(join(workDir, 'src', 'app.ts'))), inlineSessionUri);
			assert.strictEqual(result, ToolCallConfirmationReason.Setting);
		});
	});

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
			const shellWrite = await permissions.getAutoApproval(shellEvent('echo hi > cross-link/note.txt', 'bash'), multiUri);
			assert.deepStrictEqual([read, write, shellWrite], [undefined, undefined, undefined]);
		});
	});
});
