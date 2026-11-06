/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { Schemas } from '../../../../util/vs/base/common/network';
import { isWindows } from '../../../../util/vs/base/common/platform';
import { URI } from '../../../../util/vs/base/common/uri';
import { TestWorkspaceService } from '../../../test/node/testWorkspaceService';
import { PromptPathRepresentationService, TestPromptPathRepresentationService } from '../../common/promptPathRepresentationService';

/**
 * Subclass that simulates a Windows environment for testing Windows-specific code paths.
 */
class WindowsPromptPathRepresentationService extends PromptPathRepresentationService {
	protected override isWindows() {
		return true;
	}
}

describe('PromptPathRepresentationService', () => {
	let workspaceService: TestWorkspaceService;
	let service: PromptPathRepresentationService;

	beforeEach(() => {
		workspaceService = new TestWorkspaceService();
		service = new PromptPathRepresentationService(workspaceService);
	});

	describe('getFilePath', () => {
		it('returns fsPath for file scheme URIs', () => {
			const uri = URI.file('/home/user/project/file.ts');
			expect(service.getFilePath(uri)).toBe(uri.fsPath);
		});

		it('returns fsPath for vscode-remote scheme URIs', () => {
			const uri = URI.from({ scheme: Schemas.vscodeRemote, path: '/home/user/project/file.ts', authority: 'ssh-remote+myhost' });
			expect(service.getFilePath(uri)).toBe(uri.fsPath);
		});

		it('returns toString for other schemes', () => {
			const uri = URI.from({ scheme: 'untitled', path: '/Untitled-1' });
			expect(service.getFilePath(uri)).toBe(uri.toString());
		});

		it('returns toString for virtual filesystem schemes', () => {
			const uri = URI.from({ scheme: 'vscode-vfs', authority: 'github', path: '/owner/repo/file.ts' });
			expect(service.getFilePath(uri)).toBe(uri.toString());
		});
	});

	describe('resolveFilePath', () => {
		it('resolves posix absolute paths to file URIs', () => {
			const result = service.resolveFilePath('/home/user/project/file.ts');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.file);
			expect(result!.path).toBe('/home/user/project/file.ts');
		});

		it('resolves posix paths with a custom predominant scheme', () => {
			const result = service.resolveFilePath('/home/user/project/file.ts', Schemas.vscodeRemote);
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.vscodeRemote);
			expect(result!.path).toBe('/home/user/project/file.ts');
		});

		it('parses valid URI strings', () => {
			const result = service.resolveFilePath('https://example.com/path');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe('https');
		});

		it('parses file:// URI strings', () => {
			const result = service.resolveFilePath('file:///home/user/file.ts');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.file);
			expect(result!.path).toBe('/home/user/file.ts');
		});

		it('parses vscode-vfs URI strings', () => {
			const result = service.resolveFilePath('vscode-vfs://github/owner/repo/file.ts');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe('vscode-vfs');
			expect(result!.path).toBe('/owner/repo/file.ts');
		});

		it('returns undefined for relative paths', () => {
			expect(service.resolveFilePath('src/file.ts')).toBeUndefined();
		});

		it('returns undefined for empty strings', () => {
			expect(service.resolveFilePath('')).toBeUndefined();
		});

		it('returns undefined for plain text without scheme', () => {
			expect(service.resolveFilePath('just some text')).toBeUndefined();
		});

		it('roundtrips posix file URIs through getFilePath and resolveFilePath', () => {
			const original = URI.file('/home/user/project/file.ts');
			const filepath = service.getFilePath(original);
			const resolved = service.resolveFilePath(filepath);
			expect(resolved).toBeDefined();
			expect(resolved!.path).toBe(original.path);
		});
	});

	describe.skipIf(!isWindows)('resolveFilePath (Windows simulation)', () => {
		let windowsService: WindowsPromptPathRepresentationService;

		beforeEach(() => {
			workspaceService = new TestWorkspaceService();
			windowsService = new WindowsPromptPathRepresentationService(workspaceService);
		});

		it('resolves Windows drive-letter paths', () => {
			const result = windowsService.resolveFilePath('C:\\Users\\user\\file.ts');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.file);
			expect(result!.path).toBe('/C:/Users/user/file.ts');
		});

		it('collapses double-escaped backslashes', () => {
			const result = windowsService.resolveFilePath('C:\\\\Users\\\\user\\\\file.ts');
			expect(result).toBeDefined();
			expect(result!.path).toBe('/C:/Users/user/file.ts');
		});

		it('preserves UNC paths while collapsing extra backslashes', () => {
			const result = windowsService.resolveFilePath('\\\\server\\share\\\\file.ts');
			expect(result).toBeDefined();
			// UNC paths get their leading \\ preserved
			expect(result?.toString()).toContain('server');
			expect(result?.toString()).toContain('share');
		});

		it('resolves backslash-only path as Windows path', () => {
			const result = windowsService.resolveFilePath('\\Users\\file.ts');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.file);
		});

		it('prepends drive letter for posix paths on Windows when workspace folders exist', () => {
			const folderUri = URI.file('D:/Projects/myapp');
			workspaceService = new TestWorkspaceService([folderUri]);
			windowsService = new WindowsPromptPathRepresentationService(workspaceService);

			const result = windowsService.resolveFilePath('/Projects/myapp/src/file.ts');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.file);
			// Should have prepended the drive letter from workspace folder
			expect(result!.path).toMatch(/^\/d:/i);
		});

		it('does not prepend drive letter for posix paths on Windows when workspace folders don\'t exist', () => {
			const folderUri = URI.file('D:/Projects/myapp2');
			workspaceService = new TestWorkspaceService([folderUri]);
			windowsService = new WindowsPromptPathRepresentationService(workspaceService);

			const result = windowsService.resolveFilePath('/Projects/myapp/src/file.ts');
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.file);
			// Should not have prepended the drive letter since workspace folders don't match
			expect(result!.path).toBe('/Projects/myapp/src/file.ts');
		});

		it('does not prepend drive letter for posix paths when predominant scheme is not file', () => {
			const folderUri = URI.file('C:/Projects');
			workspaceService = new TestWorkspaceService([folderUri]);
			windowsService = new WindowsPromptPathRepresentationService(workspaceService);

			const result = windowsService.resolveFilePath('/Projects/file.ts', Schemas.vscodeRemote);
			expect(result).toBeDefined();
			expect(result!.scheme).toBe(Schemas.vscodeRemote);
			// Should not have a drive letter since predominantScheme is not file
			expect(result!.path).toBe('/Projects/file.ts');
		});

		it('resolves posix paths without drive letter prepended when no workspace folders', () => {
			const result = windowsService.resolveFilePath('/home/user/file.ts');
			expect(result).toBeDefined();
			// No workspace folders, so no drive letter rectification
			expect(result!.path).toBe('/home/user/file.ts');
		});
	});

	describe('getExampleFilePath', () => {
		it.skipIf(isWindows)('returns a posix-style file path on non-Windows', () => {
			const result = service.getExampleFilePath('/workspace/src/file.ts');
			expect(result).toContain('/workspace/src/file.ts');
		});

		it.skipIf(!isWindows)('returns a Windows-style path when on Windows', () => {
			workspaceService = new TestWorkspaceService();
			const windowsService = new WindowsPromptPathRepresentationService(workspaceService);
			const result = windowsService.getExampleFilePath('/workspace/src/file.ts');
			// On Windows, the example path should include c: drive letter (URI.file lowercases it)
			expect(result.toLowerCase()).toContain('c:');
			expect(result).toContain('workspace');
		});
	});
});

describe('TestPromptPathRepresentationService', () => {
	let workspaceService: TestWorkspaceService;
	let service: TestPromptPathRepresentationService;

	beforeEach(() => {
		workspaceService = new TestWorkspaceService();
		service = new TestPromptPathRepresentationService(workspaceService);
	});

	describe('getFilePath', () => {
		it('returns posix path for file scheme URIs (not fsPath)', () => {
			const uri = URI.file('/home/user/project/file.ts');
			expect(service.getFilePath(uri)).toBe(uri.path);
		});

		it('returns posix path for vscode-remote scheme URIs', () => {
			const uri = URI.from({ scheme: Schemas.vscodeRemote, path: '/home/user/project/file.ts', authority: 'ssh-remote+myhost' });
			expect(service.getFilePath(uri)).toBe(uri.path);
		});

		it('returns toString for other schemes', () => {
			const uri = URI.from({ scheme: 'untitled', path: '/Untitled-1' });
			expect(service.getFilePath(uri)).toBe(uri.toString());
		});
	});

	describe('getExampleFilePath', () => {
		it('always returns posix path regardless of platform', () => {
			const result = service.getExampleFilePath('/workspace/src/file.ts');
			expect(result).toBe('/workspace/src/file.ts');
		});
	});
});
