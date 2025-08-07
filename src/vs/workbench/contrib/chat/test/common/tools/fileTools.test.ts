/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService, FileSystemProviderErrorCode } from '../../../../../../platform/files/common/files.js';
import { FileSystemProviderError } from '../../../../../../platform/files/common/files.js';
import { ReadFileTool } from '../../../common/tools/readFileTool.js';
import { CreateDirectoryTool } from '../../../common/tools/createDirectoryTool.js';
import { IToolInvocation } from '../../../common/languageModelToolsService.js';

class MockFileService implements Partial<IFileService> {
	private files = new Map<string, VSBuffer>();
	private directories = new Set<string>();

	addFile(path: string, content: string) {
		this.files.set(path, VSBuffer.fromString(content));
	}

	addDirectory(path: string) {
		this.directories.add(path);
	}

	async readFile(resource: URI) {
		const content = this.files.get(resource.fsPath);
		if (!content) {
			throw new FileSystemProviderError('File not found', FileSystemProviderErrorCode.FileNotFound);
		}
		return { value: content, resource };
	}

	async createFolder(resource: URI) {
		this.directories.add(resource.fsPath);
	}

	hasDirectory(path: string): boolean {
		return this.directories.has(path);
	}
}

suite('File Tools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let mockFileService: MockFileService;

	setup(() => {
		mockFileService = new MockFileService();
	});

	suite('ReadFileTool', () => {
		test('should read file contents successfully', async () => {
			const tool = new ReadFileTool(mockFileService as IFileService);
			const testContent = 'Hello, world!\nThis is a test file.';
			const testPath = '/test/file.txt';
			
			mockFileService.addFile(testPath, testContent);

			const invocation: IToolInvocation = {
				toolId: 'vscode_readFile_internal',
				parameters: { uri: URI.file(testPath).toJSON() },
				context: { sessionId: 'test-session' }
			};

			const result = await tool.invoke(invocation, async () => 0, undefined!, CancellationToken.None);

			ok(result.content);
			strictEqual(result.content.length, 1);
			strictEqual(result.content[0].kind, 'text');
			const value = result.content[0].value as string;
			ok(value.includes(testContent));
			ok(value.includes(testPath));
			ok(value.includes('```'));
		});

		test('should handle file not found error', async () => {
			const tool = new ReadFileTool(mockFileService as IFileService);
			const testPath = '/non/existent/file.txt';

			const invocation: IToolInvocation = {
				toolId: 'vscode_readFile_internal',
				parameters: { uri: URI.file(testPath).toJSON() },
				context: { sessionId: 'test-session' }
			};

			const result = await tool.invoke(invocation, async () => 0, undefined!, CancellationToken.None);

			ok(result.content);
			strictEqual(result.content.length, 1);
			strictEqual(result.content[0].kind, 'text');
			const value = result.content[0].value as string;
			ok(value.includes('Error reading file'));
			ok(value.includes(testPath));
		});

		test('should prepare tool invocation', async () => {
			const tool = new ReadFileTool(mockFileService as IFileService);

			const preparation = await tool.prepareToolInvocation({} as any, CancellationToken.None);

			ok(preparation);
			strictEqual(preparation.presentation, 'hidden');
		});
	});

	suite('CreateDirectoryTool', () => {
		test('should create directory successfully', async () => {
			const tool = new CreateDirectoryTool(mockFileService as IFileService);
			const testPath = '/test/newdir';

			const invocation: IToolInvocation = {
				toolId: 'vscode_createDirectory_internal',
				parameters: { uri: URI.file(testPath).toJSON() },
				context: { sessionId: 'test-session' }
			};

			const result = await tool.invoke(invocation, async () => 0, undefined!, CancellationToken.None);

			ok(result.content);
			strictEqual(result.content.length, 1);
			strictEqual(result.content[0].kind, 'text');
			const value = result.content[0].value as string;
			ok(value.includes('Directory created successfully'));
			ok(value.includes(testPath));
			ok(mockFileService.hasDirectory(testPath));
		});

		test('should handle directory creation error', async () => {
			const tool = new CreateDirectoryTool({
				async createFolder() {
					throw new Error('Permission denied');
				}
			} as IFileService);
			const testPath = '/test/newdir';

			const invocation: IToolInvocation = {
				toolId: 'vscode_createDirectory_internal',
				parameters: { uri: URI.file(testPath).toJSON() },
				context: { sessionId: 'test-session' }
			};

			const result = await tool.invoke(invocation, async () => 0, undefined!, CancellationToken.None);

			ok(result.content);
			strictEqual(result.content.length, 1);
			strictEqual(result.content[0].kind, 'text');
			const value = result.content[0].value as string;
			ok(value.includes('Error creating directory'));
			ok(value.includes(testPath));
			ok(value.includes('Permission denied'));
		});

		test('should prepare tool invocation', async () => {
			const tool = new CreateDirectoryTool(mockFileService as IFileService);

			const preparation = await tool.prepareToolInvocation({} as any, CancellationToken.None);

			ok(preparation);
			strictEqual(preparation.presentation, 'hidden');
		});
	});
});