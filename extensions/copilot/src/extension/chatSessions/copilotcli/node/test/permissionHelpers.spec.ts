/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assert } from '../../../../../util/vs/base/common/assert';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { getConfirmationToolParams, PermissionRequest, requiresFileEditconfirmation } from '../permissionHelpers';


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

	describe('getConfirmationToolParams', () => {
		it('shell: uses intention over command text and sets terminal confirmation tool', async () => {
			const req: PermissionRequest = { kind: 'shell', intention: 'List workspace files', fullCommandText: 'ls -la' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.tool).toBe(ToolName.CoreTerminalConfirmationTool);
			expect(result.input.message).toBe('List workspace files');
			expect(result.input.command).toBe('ls -la');
			expect(result.input.isBackground).toBe(false);
		});

		it('shell: falls back to fullCommandText when no intention', async () => {
			const req: PermissionRequest = { kind: 'shell', fullCommandText: 'echo "hi"' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.tool).toBe(ToolName.CoreTerminalConfirmationTool);
			expect(result.input.message).toBe('echo "hi"');
			expect(result.input.command).toBe('echo "hi"');
		});

		it('shell: falls back to codeBlock when neither intention nor command text provided', async () => {
			const req: PermissionRequest = { kind: 'shell' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.tool).toBe(ToolName.CoreTerminalConfirmationTool);
			// codeBlock starts with two newlines then ```
			expect(result.input.message).toMatch(/^\n\n```/);
		});

		it('shell: strips cd prefix from command when matching workingDirectory on bash', async () => {
			const workingDirectory = URI.file('/workspace');
			const req: PermissionRequest = { kind: 'shell', fullCommandText: `cd ${workingDirectory.fsPath} && npm test` } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, false);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.command).toBe('npm test');
			expect(result.input.message).toBe('npm test');
		});

		it('shell: keeps full command when cd prefix does not match workingDirectory on bash', async () => {
			const fullCommandText = `cd ${URI.file('/other').fsPath} && npm test`;
			const req: PermissionRequest = { kind: 'shell', fullCommandText: fullCommandText } as any;
			const workingDirectory = URI.file('/workspace');
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, false);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.command).toBe(fullCommandText);
			expect(result.input.message).toBe(fullCommandText);
		});

		it('shell: keeps full command with cd prefix when no workingDirectory', async () => {
			const fullCommandText = 'cd /workspace && npm test';
			const req: PermissionRequest = { kind: 'shell', fullCommandText: fullCommandText } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, undefined, false);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.command).toBe(fullCommandText);
			expect(result.input.message).toBe(fullCommandText);
		});

		it('shell: plain command without cd prefix is unchanged', async () => {
			const req: PermissionRequest = { kind: 'shell', fullCommandText: 'npm test' } as any;
			const workingDirectory = URI.file('/workspace');
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, false);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.command).toBe('npm test');
			expect(result.input.message).toBe('npm test');
		});

		it('shell: intention takes priority in message even when cd prefix is stripped', async () => {
			const workingDirectory = URI.file('/workspace');
			const fullCommandText = `cd ${workingDirectory.fsPath} && npm test`;
			const req: PermissionRequest = { kind: 'shell', intention: 'Run unit tests', fullCommandText: fullCommandText } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, false);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.message).toBe('Run unit tests');
			expect(result.input.command).toBe('npm test');
		});

		it('shell: strips Set-Location prefix when matching workingDirectory on Windows', async () => {
			const workingDirectory = URI.file('C:\\workspace');
			const fullCommandText = `Set-Location ${workingDirectory.fsPath}; npm test`;
			const req: PermissionRequest = { kind: 'shell', fullCommandText: fullCommandText } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, true);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.command).toBe('npm test');
			expect(result.input.message).toBe('npm test');
		});

		it('shell: strips cd /d prefix when matching workingDirectory on Windows', async () => {
			const workingDirectory = URI.file('C:\\project');
			const fullCommandText = `cd /d ${workingDirectory.fsPath} && npm start`;
			const req: PermissionRequest = { kind: 'shell', fullCommandText } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, true);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.command).toBe('npm start');
			expect(result.input.message).toBe('npm start');
		});

		it('shell: strips Set-Location -Path prefix when matching workingDirectory on Windows', async () => {
			const workingDirectory = URI.file('C:\\project');
			const fullCommandText = `Set-Location -Path ${workingDirectory.fsPath} && npm start`;
			const req: PermissionRequest = { kind: 'shell', fullCommandText } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, true);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			expect(result.input.command).toBe('npm start');
			expect(result.input.message).toBe('npm start');
		});

		it('shell: bash cd prefix not recognized when isWindows is true', async () => {
			// On Windows, isPowershell=true, so bash-style `cd /workspace &&` may not match the powershell regex
			const workingDirectory = URI.file('/workspace');
			const fullCommandText = `cd ${workingDirectory.fsPath} && npm test`;
			const req: PermissionRequest = { kind: 'shell', fullCommandText } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, true);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			// Powershell regex does match `cd <dir> &&` pattern (cd without /d), so stripping still happens
			expect(result.input.command).toBe('npm test');
		});

		it('shell: Windows Set-Location not recognized when isWindows is false', async () => {
			// On non-Windows, isPowershell=false, so Set-Location is not recognized
			const workingDirectory = URI.file('C:\\workspace');
			const fullCommandText = `Set-Location -Path ${workingDirectory.fsPath}; npm test`;
			const req: PermissionRequest = { kind: 'shell', fullCommandText } as any;
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory, false);
			assert(!!result);
			if (result.tool !== ToolName.CoreTerminalConfirmationTool) {
				expect.fail('Expected CoreTerminalConfirmationTool');
			}
			// Bash regex doesn't recognize Set-Location, so full command is kept
			expect(result.input.command).toBe(fullCommandText);
		});

		it('write: uses intention as title and fileName for message', async () => {
			const req: PermissionRequest = { kind: 'write', intention: 'Modify configuration', fileName: 'config.json' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreConfirmationTool) {
				expect.fail('Expected CoreConfirmationTool');
			}
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
			expect(result.input.title).toBe('Allow edits to sensitive files?');
			expect(result.input.message).toContain(`The model wants to edit`);
			expect(result.input.confirmationType).toBe('basic');
		});

		it('write: falls back to default title and codeBlock message when no intention and no fileName', async () => {
			const req: PermissionRequest = { kind: 'write' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			expect(result).toBeUndefined();
		});

		it('write: no confirmation when workingDirectory covers the file', async () => {
			const req: PermissionRequest = { kind: 'write', fileName: URI.file('/workspace/src/foo.ts').fsPath, diff: '', intention: '' } as any;
			const workingDirectory = URI.file('/workspace');
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory);
			expect(result).toBeUndefined();
		});

		it('write: requires confirmation when workingDirectory does not cover the file', async () => {
			const req: PermissionRequest = { kind: 'write', fileName: URI.file('/other/path/foo.ts').fsPath, diff: '', intention: '' } as any;
			const workingDirectory = URI.file('/workspace');
			const result = await getConfirmationToolParams(instaService, req, undefined, workingDirectory);
			assert(!!result);
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
		});

		it('write: requires confirmation when no workingDirectory and file is outside workspace', async () => {
			const req: PermissionRequest = { kind: 'write', fileName: URI.file('/some/external/file.ts').fsPath, diff: '', intention: '' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
		});

		it('mcp: formats with serverName, toolTitle and args JSON', async () => {
			const req: PermissionRequest = { kind: 'mcp', serverName: 'files', toolTitle: 'List Files', toolName: 'list', args: { path: '/tmp' } } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
			if (result.tool !== ToolName.CoreConfirmationTool) {
				expect.fail('Expected CoreConfirmationTool');
			}
			expect(result.input.title).toBe('List Files');
			expect(result.input.message).toContain('Server: files');
			expect(result.input.message).toContain('"path": "/tmp"');
		});

		it('mcp: falls back to generated title and full JSON when no serverName', async () => {
			const req: PermissionRequest = { kind: 'mcp', toolName: 'info', args: { detail: true } } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreConfirmationTool) {
				expect.fail('Expected CoreConfirmationTool');
			}
			expect(result.input.title).toBe('MCP Tool: info');
			expect(result.input.message).toMatch(/```json/);
			expect(result.input.message).toContain('"detail": true');
		});

		it('mcp: uses Unknown when neither toolTitle nor toolName provided', async () => {
			const req: PermissionRequest = { kind: 'mcp', args: {} } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreConfirmationTool) {
				expect.fail('Expected CoreConfirmationTool');
			}
			expect(result.input.title).toBe('MCP Tool: Unknown');
		});

		it('read: returns specialized title and intention message', async () => {
			const req: PermissionRequest = { kind: 'read', intention: 'Read 2 files', path: '/tmp/a' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
			if (result.tool !== ToolName.CoreConfirmationTool) {
				expect.fail('Expected CoreConfirmationTool');
			}
			expect(result.input.title).toBe('Read file(s)');
			expect(result.input.message).toBe('Read 2 files');
		});

		it('read: falls through to default when intention empty string', async () => {
			const req: PermissionRequest = { kind: 'read', intention: '', path: '/tmp/a' } as any;
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreConfirmationTool) {
				expect.fail('Expected CoreConfirmationTool');
			}
			expect(result.input.title).toBe('Copilot CLI Permission Request');
			expect(result.input.message).toMatch(/"kind": "read"/);
		});

		it('default: unknown kind uses generic confirmation and wraps JSON in code block', async () => {
			const req: any = { kind: 'some_new_kind', extra: 1 };
			const result = await getConfirmationToolParams(instaService, req);
			assert(!!result);
			if (result.tool !== ToolName.CoreConfirmationTool) {
				expect.fail('Expected CoreConfirmationTool');
			}
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
			expect(result.input.title).toBe('Copilot CLI Permission Request');
			expect(result.input.message).toMatch(/^\n\n```/);
			expect(result.input.message).toContain('"some_new_kind"');
		});
	});

	describe('getConfirmationToolParams', () => {
		it('maps shell requests to terminal confirmation tool', async () => {
			const result = await getConfirmationToolParams(instaService, { kind: 'shell', fullCommandText: 'rm -rf /tmp/test', canOfferSessionApproval: true, commands: [], hasWriteFileRedirection: true, intention: '', possiblePaths: [], possibleUrls: [] });
			assert(!!result);
			expect(result.tool).toBe(ToolName.CoreTerminalConfirmationTool);
		});

		it('maps write requests with filename', async () => {
			const result = await getConfirmationToolParams(instaService, { kind: 'write', fileName: 'foo.ts', diff: '', intention: '' });
			assert(!!result);
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
			const input = result.input as any;
			expect(input.message).toContain('The model wants to edit');
		});

		it('maps mcp requests', async () => {
			const result = await getConfirmationToolParams(instaService, { kind: 'mcp', serverName: 'srv', toolTitle: 'Tool', toolName: 'run', args: { a: 1 }, readOnly: false });
			assert(!!result);
			expect(result.tool).toBe(ToolName.CoreConfirmationTool);
		});
	});

	describe('requiresFileEditconfirmation', () => {
		it('returns false for non-write requests', async () => {
			const req: PermissionRequest = { kind: 'shell', fullCommandText: 'ls' } as any;
			expect(await requiresFileEditconfirmation(instaService, req)).toBe(false);
		});

		it('returns false when no fileName is provided', async () => {
			const req: PermissionRequest = { kind: 'write', intention: 'edit' } as any;
			expect(await requiresFileEditconfirmation(instaService, req)).toBe(false);
		});

		it('requires confirmation for file outside workspace when no workingDirectory', async () => {
			const req: PermissionRequest = { kind: 'write', fileName: URI.file('/some/path/foo.ts').fsPath, diff: '', intention: '' } as any;
			expect(await requiresFileEditconfirmation(instaService, req)).toBe(true);
		});

		it('does not require confirmation when workingDirectory covers the file', async () => {
			const req: PermissionRequest = { kind: 'write', fileName: URI.file('/workspace/src/foo.ts').fsPath, diff: '', intention: '' } as any;
			const workingDirectory = URI.file('/workspace');
			expect(await requiresFileEditconfirmation(instaService, req, undefined, workingDirectory)).toBe(false);
		});

		it('does not require confirmation when workingDirectory is provided', async () => {
			const req: PermissionRequest = { kind: 'write', fileName: URI.file('/workspace/other/foo.ts').fsPath, diff: '', intention: '' } as any;
			const workingDirectory = URI.file('/workspace');
			// workingDirectory callback always returns the same folder, treating all files as in-workspace
			expect(await requiresFileEditconfirmation(instaService, req, undefined, workingDirectory)).toBe(false);
		});
	});
});
