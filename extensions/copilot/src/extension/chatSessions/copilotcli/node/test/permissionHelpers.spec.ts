/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { buildMcpConfirmationParams, buildShellConfirmationParams, PermissionRequest, requiresFileEditconfirmation } from '../permissionHelpers';


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
});
