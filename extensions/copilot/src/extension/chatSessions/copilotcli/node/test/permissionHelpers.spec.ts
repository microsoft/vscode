/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken, ChatParticipantToolToken } from 'vscode';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { CancellationTokenSource } from '../../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { extUriBiasedIgnorePathCase } from '../../../../../util/vs/base/common/resources';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult2 } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { IToolsService } from '../../../../tools/common/toolsService';
import { ExternalEditTracker } from '../../../common/externalEditTracker';
import { IWorkspaceInfo } from '../../../common/workspaceInfo';
import { ICopilotCLIImageSupport } from '../copilotCLIImageSupport';
import { buildMcpConfirmationParams, buildShellConfirmationParams, handleReadPermission, handleWritePermission, isFileFromSessionWorkspace, PermissionRequest, requiresFileEditconfirmation, showInteractivePermissionPrompt } from '../permissionHelpers';


describe('CopilotCLI permissionHelpers', () => {
	const disposables = new DisposableStore();
	let instaService: IInstantiationService;
	beforeEach(() => {
		const services = disposables.add(createExtensionUnitTestingServices());
		instaService = services.seal();
	});

	afterEach(() => {
		disposables.clear();
	});

	describe('buildShellConfirmationParams', () => {
		it('shell: uses intention over command text and sets terminal confirmation tool', () => {
			const req = { kind: 'shell', intention: 'List workspace files', fullCommandText: 'ls -la' } as any;
			const result = buildShellConfirmationParams(req, undefined);
			expect(result.tool).toBe(ToolName.CoreTerminalConfirmationTool);
			expect(result.input.message).toBe('List workspace files');
			expect(result.input.command).toBe('ls -la');
			expect(result.input.isBackground).toBe(false);
		});

		it('shell: falls back to fullCommandText when no intention', () => {
			const req = { kind: 'shell', fullCommandText: 'echo "hi"' } as any;
			const result = buildShellConfirmationParams(req, undefined);
			expect(result.tool).toBe(ToolName.CoreTerminalConfirmationTool);
			expect(result.input.message).toBe('echo "hi"');
			expect(result.input.command).toBe('echo "hi"');
		});

		it('shell: falls back to codeBlock when neither intention nor command text provided', () => {
			const req = { kind: 'shell' } as any;
			const result = buildShellConfirmationParams(req, undefined);
			expect(result.tool).toBe(ToolName.CoreTerminalConfirmationTool);
			// codeBlock starts with two newlines then ```
			expect(result.input.message).toMatch(/^\n\n```/);
		});

		it('shell: strips cd prefix from command when matching workingDirectory on bash', () => {
			const workingDirectory = URI.file('/workspace');
			const req = { kind: 'shell', fullCommandText: `cd ${workingDirectory.fsPath} && npm test` } as any;
			const result = buildShellConfirmationParams(req, workingDirectory, false);
			expect(result.input.command).toBe('npm test');
			expect(result.input.message).toBe('npm test');
		});

		it('shell: keeps full command when cd prefix does not match workingDirectory on bash', () => {
			const fullCommandText = `cd ${URI.file('/other').fsPath} && npm test`;
			const req = { kind: 'shell', fullCommandText: fullCommandText } as any;
			const workingDirectory = URI.file('/workspace');
			const result = buildShellConfirmationParams(req, workingDirectory, false);
			expect(result.input.command).toBe(fullCommandText);
			expect(result.input.message).toBe(fullCommandText);
		});

		it('shell: keeps full command with cd prefix when no workingDirectory', () => {
			const fullCommandText = 'cd /workspace && npm test';
			const req = { kind: 'shell', fullCommandText: fullCommandText } as any;
			const result = buildShellConfirmationParams(req, undefined, false);
			expect(result.input.command).toBe(fullCommandText);
			expect(result.input.message).toBe(fullCommandText);
		});

		it('shell: plain command without cd prefix is unchanged', () => {
			const req = { kind: 'shell', fullCommandText: 'npm test' } as any;
			const workingDirectory = URI.file('/workspace');
			const result = buildShellConfirmationParams(req, workingDirectory, false);
			expect(result.input.command).toBe('npm test');
			expect(result.input.message).toBe('npm test');
		});

		it('shell: intention takes priority in message even when cd prefix is stripped', () => {
			const workingDirectory = URI.file('/workspace');
			const fullCommandText = `cd ${workingDirectory.fsPath} && npm test`;
			const req = { kind: 'shell', intention: 'Run unit tests', fullCommandText: fullCommandText } as any;
			const result = buildShellConfirmationParams(req, workingDirectory, false);
			expect(result.input.message).toBe('Run unit tests');
			expect(result.input.command).toBe('npm test');
		});

		it('shell: strips Set-Location prefix when matching workingDirectory on Windows', () => {
			const workingDirectory = URI.file('C:\\workspace');
			const fullCommandText = `Set-Location ${workingDirectory.fsPath}; npm test`;
			const req = { kind: 'shell', fullCommandText: fullCommandText } as any;
			const result = buildShellConfirmationParams(req, workingDirectory, true);
			expect(result.input.command).toBe('npm test');
			expect(result.input.message).toBe('npm test');
		});

		it('shell: strips cd /d prefix when matching workingDirectory on Windows', () => {
			const workingDirectory = URI.file('C:\\project');
			const fullCommandText = `cd /d ${workingDirectory.fsPath} && npm start`;
			const req = { kind: 'shell', fullCommandText } as any;
			const result = buildShellConfirmationParams(req, workingDirectory, true);
			expect(result.input.command).toBe('npm start');
			expect(result.input.message).toBe('npm start');
		});

		it('shell: strips Set-Location -Path prefix when matching workingDirectory on Windows', () => {
			const workingDirectory = URI.file('C:\\project');
			const fullCommandText = `Set-Location -Path ${workingDirectory.fsPath} && npm start`;
			const req = { kind: 'shell', fullCommandText } as any;
			const result = buildShellConfirmationParams(req, workingDirectory, true);
			expect(result.input.command).toBe('npm start');
			expect(result.input.message).toBe('npm start');
		});

		it('shell: bash cd prefix not recognized when isWindows is true', () => {
			// On Windows, isPowershell=true, so bash-style `cd /workspace &&` may not match the powershell regex
			const workingDirectory = URI.file('/workspace');
			const fullCommandText = `cd ${workingDirectory.fsPath} && npm test`;
			const req = { kind: 'shell', fullCommandText } as any;
			const result = buildShellConfirmationParams(req, workingDirectory, true);
			// Powershell regex does match `cd <dir> &&` pattern (cd without /d), so stripping still happens
			expect(result.input.command).toBe('npm test');
		});

		it('shell: Windows Set-Location not recognized when isWindows is false', () => {
			// On non-Windows, isPowershell=false, so Set-Location is not recognized
			const workingDirectory = URI.file('C:\\workspace');
			const fullCommandText = `Set-Location -Path ${workingDirectory.fsPath}; npm test`;
			const req = { kind: 'shell', fullCommandText } as any;
			const result = buildShellConfirmationParams(req, workingDirectory, false);
			// Bash regex doesn't recognize Set-Location, so full command is kept
			expect(result.input.command).toBe(fullCommandText);
		});

		it('shell: passes sandboxBypass and reason when the command opts out of the sandbox', () => {
			const req = { kind: 'shell', intention: 'Read secret', fullCommandText: 'cat ~/secret', requestSandboxBypass: true, requestSandboxBypassReason: 'Needs access outside the workspace' } as any;
			const result = buildShellConfirmationParams(req, undefined);
			expect(result.input.command).toBe('cat ~/secret');
			expect(result.input.sandboxBypass).toBe(true);
			expect(result.input.sandboxBypassReason).toBe('Needs access outside the workspace');
		});

		it('shell: omits sandboxBypass for ordinary commands', () => {
			const req = { kind: 'shell', intention: 'List workspace files', fullCommandText: 'ls -la' } as any;
			const result = buildShellConfirmationParams(req, undefined);
			expect(result.input.sandboxBypass).toBeUndefined();
			expect(result.input.sandboxBypassReason).toBeUndefined();
		});
	});

	describe('buildMcpConfirmationParams', () => {
		it('mcp: formats with serverName, toolTitle and args JSON', () => {
			const req = { kind: 'mcp', serverName: 'files', toolTitle: 'List Files', toolName: 'list', args: { path: '/tmp' } } as any;
			const result = buildMcpConfirmationParams(req as Extract<PermissionRequest, { kind: 'mcp' }>);
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
			expect(result.input.title).toBe('List Files');
			expect(result.input.message).toContain('Server: files');
			expect(result.input.message).toContain('"path": "/tmp"');
		});

		it('mcp: falls back to generated title and full JSON when no serverName', () => {
			const req = { kind: 'mcp', toolName: 'info', args: { detail: true } } as any;
			const result = buildMcpConfirmationParams(req as Extract<PermissionRequest, { kind: 'mcp' }>);
			expect(result.input.title).toBe('MCP Tool: info');
			expect(result.input.message).toMatch(/```json/);
			expect(result.input.message).toContain('"detail": true');
		});

		it('mcp: uses Unknown when neither toolTitle nor toolName provided', () => {
			const req = { kind: 'mcp', args: {} } as any;
			const result = buildMcpConfirmationParams(req as Extract<PermissionRequest, { kind: 'mcp' }>);
			expect(result.input.title).toBe('MCP Tool: Unknown');
		});
	});

	describe('requiresFileEditconfirmation', () => {
		it('returns false for non-write requests', async () => {
			const req = { kind: 'shell', fullCommandText: 'ls' } as any;
			expect(await requiresFileEditconfirmation(instaService, req)).toBe(false);
		});

		it('returns false when no fileName is provided', async () => {
			const req = { kind: 'write', intention: 'edit' } as any;
			expect(await requiresFileEditconfirmation(instaService, req)).toBe(false);
		});

		it('requires confirmation for file outside workspace when no workingDirectory', async () => {
			const req = { kind: 'write', fileName: URI.file('/some/path/foo.ts').fsPath, diff: '', intention: '' } as any;
			expect(await requiresFileEditconfirmation(instaService, req)).toBe(true);
		});

		it('does not require confirmation when workingDirectory covers the file', async () => {
			const req = { kind: 'write', fileName: URI.file('/workspace/src/foo.ts').fsPath, diff: '', intention: '' } as any;
			const workingDirectory = URI.file('/workspace');
			expect(await requiresFileEditconfirmation(instaService, req, undefined, workingDirectory)).toBe(false);
		});

		it('does not require confirmation when workingDirectory is provided', async () => {
			const req = { kind: 'write', fileName: URI.file('/workspace/other/foo.ts').fsPath, diff: '', intention: '' } as any;
			const workingDirectory = URI.file('/workspace');
			// workingDirectory callback always returns the same folder, treating all files as in-workspace
			expect(await requiresFileEditconfirmation(instaService, req, undefined, workingDirectory)).toBe(false);
		});
	});

	describe('isFileFromSessionWorkspace', () => {
		it('returns true for file inside the working directory (folder)', () => {
			const workspaceInfo: IWorkspaceInfo = {
				folder: URI.file('/workspace'),
				repository: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
			};
			expect(isFileFromSessionWorkspace(URI.file('/workspace/src/foo.ts'), workspaceInfo)).toBe(true);
		});

		it('returns false for file outside all known directories', () => {
			const workspaceInfo: IWorkspaceInfo = {
				folder: URI.file('/workspace'),
				repository: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
			};
			expect(isFileFromSessionWorkspace(URI.file('/other/path/foo.ts'), workspaceInfo)).toBe(false);
		});

		it('returns true for file inside the worktree', () => {
			const workspaceInfo: IWorkspaceInfo = {
				folder: URI.file('/workspace'),
				repository: URI.file('/repo'),
				worktree: URI.file('/worktree'),
				worktreeProperties: { autoCommit: true, baseCommit: 'abc', branchName: 'test', repositoryPath: '/repo', worktreePath: '/worktree', version: 1 },
			};
			expect(isFileFromSessionWorkspace(URI.file('/worktree/src/foo.ts'), workspaceInfo)).toBe(true);
		});

		it('returns true for file inside repository when worktree exists', () => {
			const workspaceInfo: IWorkspaceInfo = {
				folder: URI.file('/workspace'),
				repository: URI.file('/repo'),
				worktree: URI.file('/worktree'),
				worktreeProperties: { autoCommit: true, baseCommit: 'abc', branchName: 'test', repositoryPath: '/repo', worktreePath: '/worktree', version: 1 },
			};
			expect(isFileFromSessionWorkspace(URI.file('/repo/src/foo.ts'), workspaceInfo)).toBe(true);
		});

		it('returns false for file inside repository when no worktree exists', () => {
			const workspaceInfo: IWorkspaceInfo = {
				folder: URI.file('/workspace'),
				repository: URI.file('/repo'),
				worktree: undefined,
				worktreeProperties: undefined,
			};
			expect(isFileFromSessionWorkspace(URI.file('/repo/src/foo.ts'), workspaceInfo)).toBe(false);
		});

		it('returns false when workspaceInfo has no folder, no repository, no worktree', () => {
			const workspaceInfo: IWorkspaceInfo = {
				folder: undefined,
				repository: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
			};
			expect(isFileFromSessionWorkspace(URI.file('/any/file.ts'), workspaceInfo)).toBe(false);
		});
	});

	describe('handleReadPermission', () => {
		let logService: ILogService;
		let token: CancellationToken;
		let tokenSource: CancellationTokenSource;

		beforeEach(() => {
			const services = disposables.add(createExtensionUnitTestingServices());
			const accessor = services.createTestingAccessor();
			logService = accessor.get(ILogService);
			tokenSource = new CancellationTokenSource();
			token = tokenSource.token;
		});

		afterEach(() => {
			tokenSource.dispose();
		});

		function makeWorkspaceInfo(folder?: URI, worktree?: URI, repository?: URI): IWorkspaceInfo {
			return {
				folder,
				repository,
				worktree,
				worktreeProperties: worktree ? { autoCommit: true, baseCommit: 'abc', branchName: 'test', repositoryPath: repository?.fsPath ?? '', worktreePath: worktree.fsPath, version: 1 } : undefined,
			};
		}

		function makeImageSupport(trusted: boolean): ICopilotCLIImageSupport {
			return { _serviceBrand: undefined, storeImage: vi.fn(), isTrustedImage: () => trusted };
		}

		function makeWorkspaceService(folders: URI[]): IWorkspaceService {
			return { getWorkspaceFolder: (resource: URI) => folders.find(folder => extUriBiasedIgnorePathCase.isEqualOrParent(resource, folder)) } as unknown as IWorkspaceService;
		}

		function makeToolsService(response: string): IToolsService {
			return {
				invokeTool: vi.fn(async () => new LanguageModelToolResult2([new LanguageModelTextPart(response)])),
			} as unknown as IToolsService;
		}

		it('auto-approves trusted images', async () => {
			const req = { kind: 'read', path: '/images/cat.png' } as any;
			const result = await handleReadPermission(
				'session-1', req, undefined, [], makeImageSupport(true),
				makeWorkspaceInfo(), makeWorkspaceService([]), makeToolsService('no'),
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
		});

		it('auto-approves files in session workspace (folder)', async () => {
			const req = { kind: 'read', path: '/workspace/src/file.ts' } as any;
			const result = await handleReadPermission(
				'session-1', req, undefined, [], makeImageSupport(false),
				makeWorkspaceInfo(URI.file('/workspace')), makeWorkspaceService([]),
				makeToolsService('no'), undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
		});

		it('auto-approves files in a VS Code workspace folder', async () => {
			const req = { kind: 'read', path: '/vscode-ws/src/file.ts' } as any;
			const result = await handleReadPermission(
				'session-1', req, undefined, [], makeImageSupport(false),
				makeWorkspaceInfo(URI.file('/other')), makeWorkspaceService([URI.file('/vscode-ws')]),
				makeToolsService('no'), undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
		});

		it('auto-approves attached files', async () => {
			const filePath = '/external/attached.ts';
			const req = { kind: 'read', path: filePath } as any;
			const attachments = [{ type: 'file', path: filePath }] as any;
			const result = await handleReadPermission(
				'session-1', req, undefined, attachments, makeImageSupport(false),
				makeWorkspaceInfo(), makeWorkspaceService([]),
				makeToolsService('no'), undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
		});

		it('falls back to confirmation tool for out-of-workspace reads and approves on "yes"', async () => {
			const toolsService = makeToolsService('yes');
			const req = { kind: 'read', path: '/external/secret.txt', intention: 'Read config' } as any;
			const result = await handleReadPermission(
				'session-1', req, undefined, [], makeImageSupport(false),
				makeWorkspaceInfo(URI.file('/workspace')), makeWorkspaceService([]),
				toolsService, undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
			expect(toolsService.invokeTool).toHaveBeenCalled();
		});

		it('requires confirmation when a workspace link resolves outside the workspace', async () => {
			const tempRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-cli-read-symlink-')));
			const workspaceRoot = path.join(tempRoot, 'workspace');
			const outsideRoot = path.join(tempRoot, 'outside');
			fs.mkdirSync(workspaceRoot);
			fs.mkdirSync(outsideRoot);
			try {
				const outsideSecret = path.join(outsideRoot, 'secret.txt');
				fs.writeFileSync(outsideSecret, 'outside secret');
				const insideFile = path.join(workspaceRoot, 'notes.txt');
				fs.writeFileSync(insideFile, 'inside');
				const workspaceLink = path.join(workspaceRoot, 'linked-outside');
				fs.symlinkSync(outsideRoot, workspaceLink, process.platform === 'win32' ? 'junction' : 'dir');
				const symlinkedSecret = path.join(workspaceLink, 'secret.txt');
				const missingThroughLink = path.join(workspaceLink, 'missing.txt');
				const linkedWorkspace = path.join(tempRoot, 'linked-workspace');
				fs.symlinkSync(workspaceRoot, linkedWorkspace, process.platform === 'win32' ? 'junction' : 'dir');

				const toolsService = makeToolsService('no');
				const read = (target: string, workspace = workspaceRoot) => handleReadPermission(
					'session-1',
					{ kind: 'read', path: target, intention: 'Read file' } as any,
					undefined,
					[],
					makeImageSupport(false),
					makeWorkspaceInfo(URI.file(workspace)),
					makeWorkspaceService([URI.file(workspace)]),
					toolsService,
					undefined as unknown as ChatParticipantToolToken,
					logService,
					token,
				);

				const direct = await read(outsideSecret);
				const linked = await read(symlinkedSecret);
				const missing = await read(missingThroughLink);
				const inside = await read(insideFile);
				const throughWorkspaceLink = await read(path.join(linkedWorkspace, 'notes.txt'), linkedWorkspace);
				const prompts = (toolsService.invokeTool as ReturnType<typeof vi.fn>).mock.calls.map(call => call[1].input.message as string);
				const mentionsPath = (message: string | undefined, target: string) => !!message && message.toLowerCase().includes(target.toLowerCase());

				expect({
					resolvedSecret: fs.realpathSync(symlinkedSecret),
					direct: direct.kind,
					linked: linked.kind,
					missing: missing.kind,
					inside: inside.kind,
					throughWorkspaceLink: throughWorkspaceLink.kind,
					linkedPromptMentionsOutside: mentionsPath(prompts[1], fs.realpathSync(outsideSecret)),
					missingPromptMentionsOutside: mentionsPath(prompts[2], fs.realpathSync(outsideRoot)),
					promptCount: prompts.length,
				}).toEqual({
					resolvedSecret: fs.realpathSync(outsideSecret),
					direct: 'denied-interactively-by-user',
					linked: 'denied-interactively-by-user',
					missing: 'denied-interactively-by-user',
					inside: 'approve-once',
					throughWorkspaceLink: 'approve-once',
					linkedPromptMentionsOutside: true,
					missingPromptMentionsOutside: true,
					promptCount: 3,
				});
			} finally {
				fs.rmSync(tempRoot, { recursive: true, force: true });
			}
		});

		it('denies when confirmation tool returns non-"yes"', async () => {
			const toolsService = makeToolsService('no');
			const req = { kind: 'read', path: '/external/secret.txt' } as any;
			const result = await handleReadPermission(
				'session-1', req, undefined, [], makeImageSupport(false),
				makeWorkspaceInfo(URI.file('/workspace')), makeWorkspaceService([]),
				toolsService, undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('denied-interactively-by-user');
		});

		it('uses intention as message when available', async () => {
			const toolsService = makeToolsService('yes');
			const req = { kind: 'read', path: '/external/file.txt', intention: 'Read 3 config files' } as any;
			await handleReadPermission(
				'session-1', req, undefined, [], makeImageSupport(false),
				makeWorkspaceInfo(), makeWorkspaceService([]),
				toolsService, undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			const callArgs = (toolsService.invokeTool as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(callArgs[0]).toBe(ToolName.CoreConfirmationTool);
			expect(callArgs[1].input.message).toBe('Read 3 config files');
		});

		it('falls back to path when no intention', async () => {
			const toolsService = makeToolsService('yes');
			const req = { kind: 'read', path: '/external/file.txt' } as any;
			await handleReadPermission(
				'session-1', req, undefined, [], makeImageSupport(false),
				makeWorkspaceInfo(), makeWorkspaceService([]),
				toolsService, undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			const callArgs = (toolsService.invokeTool as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(callArgs[1].input.message).toBe('/external/file.txt');
		});
	});

	describe('handleWritePermission', () => {
		let logService: ILogService;
		let token: CancellationToken;
		let tokenSource: CancellationTokenSource;
		let editTracker: ExternalEditTracker;

		beforeEach(() => {
			const services = disposables.add(createExtensionUnitTestingServices());
			const accessor = services.createTestingAccessor();
			logService = accessor.get(ILogService);
			tokenSource = new CancellationTokenSource();
			token = tokenSource.token;
			editTracker = new ExternalEditTracker();
			editTracker.trackEdit = vi.fn(async () => { });
		});

		afterEach(() => {
			tokenSource.dispose();
		});

		function makeWorkspaceInfo(opts: { folder?: URI; worktree?: URI; repository?: URI; worktreeProperties?: any } = {}): IWorkspaceInfo {
			return {
				folder: opts.folder,
				repository: opts.repository,
				worktree: opts.worktree,
				worktreeProperties: opts.worktreeProperties,
			};
		}

		function makeWorkspaceService(folders: URI[]): IWorkspaceService {
			return { getWorkspaceFolder: (resource: URI) => folders.find(f => resource.fsPath.startsWith(f.fsPath)) } as unknown as IWorkspaceService;
		}

		function makeToolsService(response: string): IToolsService {
			return {
				invokeTool: vi.fn(async () => new LanguageModelToolResult2([new LanguageModelTextPart(response)])),
			} as unknown as IToolsService;
		}

		it('auto-approves writes in workspace folder for non-protected files', async () => {
			const wsFolder = URI.file('/workspace');
			const req = { kind: 'write', fileName: URI.file('/workspace/src/foo.ts').fsPath, diff: '', intention: '' } as any;
			const result = await handleWritePermission(
				'session-1', req, undefined, undefined, undefined, editTracker,
				makeWorkspaceInfo({ folder: wsFolder }),
				makeWorkspaceService([wsFolder]),
				instaService, makeToolsService('no'),
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
		});

		it('auto-approves writes in working directory when isolation is enabled', async () => {
			const worktree = URI.file('/worktree');
			const req = { kind: 'write', fileName: URI.file('/worktree/src/foo.ts').fsPath, diff: '', intention: '' } as any;
			const result = await handleWritePermission(
				'session-1', req, undefined, undefined, undefined, editTracker,
				makeWorkspaceInfo({
					folder: URI.file('/workspace'),
					worktree,
					worktreeProperties: { autoCommit: true, baseCommit: 'abc', branchName: 'test', repositoryPath: '/repo', worktreePath: '/worktree', version: 1 },
				}),
				makeWorkspaceService([]),
				instaService, makeToolsService('no'),
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
		});

		it('falls back to confirmation for writes outside workspace', async () => {
			const toolsService = makeToolsService('yes');
			const req = { kind: 'write', fileName: URI.file('/external/foo.ts').fsPath, diff: '', intention: '' } as any;
			const result = await handleWritePermission(
				'session-1', req, undefined, undefined, undefined, editTracker,
				makeWorkspaceInfo({ folder: URI.file('/workspace') }),
				makeWorkspaceService([URI.file('/workspace')]),
				instaService, toolsService,
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
			expect(toolsService.invokeTool).toHaveBeenCalled();
		});

		it('denies writes outside workspace when user declines confirmation', async () => {
			const toolsService = makeToolsService('no');
			const req = { kind: 'write', fileName: URI.file('/external/foo.ts').fsPath, diff: '', intention: '' } as any;
			const result = await handleWritePermission(
				'session-1', req, undefined, undefined, undefined, editTracker,
				makeWorkspaceInfo({ folder: URI.file('/workspace') }),
				makeWorkspaceService([URI.file('/workspace')]),
				instaService, toolsService,
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('denied-interactively-by-user');
		});

		it('requires confirmation when a write resolves outside its trusted folder', async () => {
			const tempRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-cli-write-symlink-')));
			const linkType = process.platform === 'win32' ? 'junction' : 'dir';
			const makeDir = (...segments: string[]) => {
				const dir = path.join(tempRoot, ...segments);
				fs.mkdirSync(dir, { recursive: true });
				return dir;
			};
			const workspaceRoot = makeDir('workspace');
			const outsideRoot = makeDir('outside');
			const worktreeRoot = makeDir('worktree');
			const sessionRoot = makeDir('copilot-home', 'session-state', 'session-1');
			const previousCopilotHome = process.env.COPILOT_HOME;
			process.env.COPILOT_HOME = path.join(tempRoot, 'copilot-home');
			try {
				const outsideScript = path.join(outsideRoot, 'script.sh');
				const insideFile = path.join(workspaceRoot, 'notes.txt');
				fs.writeFileSync(outsideScript, 'echo outside');
				fs.writeFileSync(insideFile, 'inside');
				fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'linked-outside'), linkType);
				fs.symlinkSync(outsideRoot, path.join(worktreeRoot, 'linked-outside'), linkType);
				fs.symlinkSync(workspaceRoot, path.join(worktreeRoot, 'linked-workspace'), linkType);
				fs.symlinkSync(outsideRoot, path.join(sessionRoot, 'linked-outside'), linkType);
				fs.symlinkSync(workspaceRoot, path.join(tempRoot, 'linked-workspace'), linkType);
				// A dangling link: writing through it creates its missing target outside the workspace.
				fs.symlinkSync(path.join(outsideRoot, 'missing'), path.join(workspaceRoot, 'linked-missing'), linkType);
				const nestedWorkingDirectory = makeDir('workspace', 'subdir');
				fs.symlinkSync(workspaceRoot, path.join(nestedWorkingDirectory, 'linked-root'), linkType);

				const workspace = URI.file(workspaceRoot);
				const linkedWorkspace = URI.file(path.join(tempRoot, 'linked-workspace'));
				const foldersService = (...folders: URI[]) => ({
					getWorkspaceFolder: (resource: URI) => folders.find(folder => extUriBiasedIgnorePathCase.isEqualOrParent(resource, folder)),
				}) as unknown as IWorkspaceService;
				const inWorkspace = makeWorkspaceInfo({ folder: workspace });
				const isolated = makeWorkspaceInfo({
					folder: workspace,
					repository: workspace,
					worktree: URI.file(worktreeRoot),
					worktreeProperties: { autoCommit: true, baseCommit: 'abc', branchName: 'test', repositoryPath: workspaceRoot, worktreePath: worktreeRoot, version: 1 },
				});
				const toolsService = makeToolsService('no');
				const invokeTool = toolsService.invokeTool as ReturnType<typeof vi.fn>;
				// Reports whether the write was approved, or prompted and (if expected) named the resolved target.
				const write = async (fileName: string, info: IWorkspaceInfo, service: IWorkspaceService, resolvedTarget?: string) => {
					const promptsBefore = invokeTool.mock.calls.length;
					const result = await handleWritePermission(
						'session-1', { kind: 'write', fileName, diff: '', intention: 'Edit file' } as any, undefined, undefined, undefined, editTracker,
						info, service, instaService, toolsService,
						undefined as unknown as ChatParticipantToolToken, logService, token,
					);
					if (invokeTool.mock.calls.length === promptsBefore) {
						return result.kind;
					}
					const message = String(invokeTool.mock.calls.at(-1)![1].input.message).toLowerCase();
					const expectedTarget = resolvedTarget && (fs.existsSync(resolvedTarget) ? fs.realpathSync(resolvedTarget) : resolvedTarget);
					return expectedTarget && message.includes(expectedTarget.toLowerCase()) ? 'prompted with resolved target' : 'prompted';
				};

				expect({
					insideWorkspace: await write(insideFile, inWorkspace, foldersService(workspace)),
					protectedInsideWorkspace: await write(path.join(workspaceRoot, '.vscode', 'settings.json'), inWorkspace, foldersService(workspace)),
					throughLinkedWorkspace: await write(path.join(linkedWorkspace.fsPath, 'notes.txt'), makeWorkspaceInfo({ folder: linkedWorkspace }), foldersService(linkedWorkspace)),
					workspaceLinkOutside: await write(path.join(workspaceRoot, 'linked-outside', 'script.sh'), inWorkspace, foldersService(workspace), outsideScript),
					noWorkingDirectoryLinkOutside: await write(path.join(workspaceRoot, 'linked-outside', 'script.sh'), makeWorkspaceInfo(), foldersService(workspace), outsideScript),
					isolatedLinkOutside: await write(path.join(worktreeRoot, 'linked-outside', 'script.sh'), isolated, foldersService(workspace), outsideScript),
					isolatedLinkIntoWorkspace: await write(path.join(worktreeRoot, 'linked-workspace', 'notes.txt'), isolated, foldersService(workspace), insideFile),
					sessionState: await write(path.join(sessionRoot, 'plan.md'), inWorkspace, foldersService(workspace)),
					sessionStateLinkOutside: await write(path.join(sessionRoot, 'linked-outside', 'script.sh'), inWorkspace, foldersService(workspace), outsideScript),
					danglingLinkOutside: await write(path.join(workspaceRoot, 'linked-missing', 'new.sh'), inWorkspace, foldersService(workspace), path.join(outsideRoot, 'missing', 'new.sh')),
					danglingLinkItselfOutside: await write(path.join(workspaceRoot, 'linked-missing'), inWorkspace, foldersService(workspace), path.join(outsideRoot, 'missing')),
					nestedWorkingDirectoryLinkIntoWorkspace: await write(
						path.join(nestedWorkingDirectory, 'linked-root', '.vscode', 'settings.json'),
						makeWorkspaceInfo({ folder: URI.file(nestedWorkingDirectory) }),
						foldersService(workspace),
						path.join(workspaceRoot, '.vscode', 'settings.json'),
					),
				}).toEqual({
					insideWorkspace: 'approve-once',
					protectedInsideWorkspace: 'prompted',
					throughLinkedWorkspace: 'approve-once',
					workspaceLinkOutside: 'prompted with resolved target',
					noWorkingDirectoryLinkOutside: 'prompted with resolved target',
					isolatedLinkOutside: 'prompted with resolved target',
					isolatedLinkIntoWorkspace: 'prompted with resolved target',
					sessionState: 'approve-once',
					sessionStateLinkOutside: 'prompted with resolved target',
					danglingLinkOutside: 'prompted with resolved target',
					danglingLinkItselfOutside: 'prompted with resolved target',
					nestedWorkingDirectoryLinkIntoWorkspace: 'prompted with resolved target',
				});
			} finally {
				if (previousCopilotHome === undefined) {
					delete process.env.COPILOT_HOME;
				} else {
					process.env.COPILOT_HOME = previousCopilotHome;
				}
				fs.rmSync(tempRoot, { recursive: true, force: true });
			}
		});

		it('approves and tracks a write through a workspace link when the user confirms', async () => {
			const tempRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-cli-write-symlink-')));
			const workspaceRoot = path.join(tempRoot, 'workspace');
			const outsideRoot = path.join(tempRoot, 'outside');
			fs.mkdirSync(workspaceRoot);
			fs.mkdirSync(outsideRoot);
			try {
				fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir');
				const symlinkedScript = path.join(workspaceRoot, 'linked-outside', 'script.sh');
				const workspace = URI.file(workspaceRoot);
				const toolsService = makeToolsService('yes');
				const toolCall = { toolName: 'str_replace_editor', toolCallId: 'edit-1', arguments: { command: 'str_replace', path: symlinkedScript } } as any;

				const result = await handleWritePermission(
					'session-1', { kind: 'write', fileName: symlinkedScript, diff: '', intention: 'Edit script' } as any, toolCall, undefined, {} as any, editTracker,
					makeWorkspaceInfo({ folder: workspace }),
					{ getWorkspaceFolder: (resource: URI) => extUriBiasedIgnorePathCase.isEqualOrParent(resource, workspace) ? workspace : undefined } as unknown as IWorkspaceService,
					instaService, toolsService,
					undefined as unknown as ChatParticipantToolToken, logService, token,
				);

				expect({
					result: result.kind,
					prompts: (toolsService.invokeTool as ReturnType<typeof vi.fn>).mock.calls.length,
					trackedEdits: (editTracker.trackEdit as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0]),
				}).toEqual({
					result: 'approve-once',
					prompts: 1,
					trackedEdits: ['edit-1'],
				});
			} finally {
				fs.rmSync(tempRoot, { recursive: true, force: true });
			}
		});

		it('auto-approves when no file can be determined (no fileName, no toolCall)', async () => {
			const req = { kind: 'write', intention: 'some write' } as any;
			const result = await handleWritePermission(
				'session-1', req, undefined, undefined, undefined, editTracker,
				makeWorkspaceInfo({ folder: URI.file('/workspace') }),
				makeWorkspaceService([URI.file('/workspace')]),
				instaService, makeToolsService('no'),
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			// No file => getFileEditConfirmationToolParams returns undefined => auto-approve
			expect(result.kind).toBe('approve-once');
		});
	});

	describe('showInteractivePermissionPrompt', () => {
		let logService: ILogService;
		let token: CancellationToken;
		let tokenSource: CancellationTokenSource;

		beforeEach(() => {
			const services = disposables.add(createExtensionUnitTestingServices());
			const accessor = services.createTestingAccessor();
			logService = accessor.get(ILogService);
			tokenSource = new CancellationTokenSource();
			token = tokenSource.token;
		});

		afterEach(() => {
			tokenSource.dispose();
		});

		function makeToolsService(response: string): IToolsService {
			return {
				invokeTool: vi.fn(async () => new LanguageModelToolResult2([new LanguageModelTextPart(response)])),
			} as unknown as IToolsService;
		}

		it('approves when user confirms with "yes"', async () => {
			const toolsService = makeToolsService('yes');
			const req = { kind: 'url', url: 'https://example.com' } as any;
			const result = await showInteractivePermissionPrompt(
				req, undefined, toolsService,
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
			const callArgs = (toolsService.invokeTool as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(callArgs[0]).toBe(ToolName.CoreConfirmationTool);
			expect(callArgs[1].input.title).toBe('Copilot CLI Permission Request');
		});

		it('denies when user declines', async () => {
			const toolsService = makeToolsService('no');
			const req = { kind: 'url', url: 'https://example.com' } as any;
			const result = await showInteractivePermissionPrompt(
				req, undefined, toolsService,
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('denied-interactively-by-user');
		});

		it('denies when invokeTool throws', async () => {
			const toolsService = {
				invokeTool: vi.fn(async () => { throw new Error('tool failure'); }),
			} as unknown as IToolsService;
			const req = { kind: 'url', url: 'https://example.com' } as any;
			const result = await showInteractivePermissionPrompt(
				req, undefined, toolsService,
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('denied-interactively-by-user');
		});

		it('passes toolParentCallId as subAgentInvocationId', async () => {
			const toolsService = makeToolsService('yes');
			const req = { kind: 'url', url: 'https://example.com' } as any;
			await showInteractivePermissionPrompt(
				req, 'parent-123', toolsService,
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			const callArgs = (toolsService.invokeTool as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(callArgs[1].subAgentInvocationId).toBe('parent-123');
		});

		it('approves with case-insensitive "Yes"', async () => {
			const toolsService = makeToolsService('Yes');
			const req = { kind: 'url', url: 'https://example.com' } as any;
			const result = await showInteractivePermissionPrompt(
				req, undefined, toolsService,
				undefined as unknown as ChatParticipantToolToken, logService, token,
			);
			expect(result.kind).toBe('approve-once');
		});
	});
});
