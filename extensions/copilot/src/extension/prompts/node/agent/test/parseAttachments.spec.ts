/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment } from '@github/copilot/sdk';
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../../platform/filesystem/common/fileTypes';
import { MockFileSystemService } from '../../../../../platform/filesystem/node/test/mockFileSystemService';
import { IIgnoreService } from '../../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../../platform/log/common/logService';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { DiagnosticSeverity } from '../../../../../util/common/test/shims/enums';
import { createTextDocumentData } from '../../../../../util/common/test/shims/textDocument';
import { mock } from '../../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { Schemas } from '../../../../../util/vs/base/common/network';
import { URI } from '../../../../../util/vs/base/common/uri';
import { Location } from '../../../../../util/vs/workbench/api/common/extHostTypes/location';
import { Range } from '../../../../../util/vs/workbench/api/common/extHostTypes/range';
import { ChatReferenceDiagnostic } from '../../../../../vscodeTypes';
import { emptyWorkspaceInfo, IWorkspaceInfo } from '../../../../chatSessions/common/workspaceInfo';
import { extractChatPromptReferences } from '../../../../chatSessions/copilotcli/common/copilotCLIPrompt';
import { CopilotCLIImageSupport } from '../../../../chatSessions/copilotcli/node/copilotCLIImageSupport';
import { CopilotCLIPromptResolver } from '../../../../chatSessions/copilotcli/node/copilotcliPromptResolver';
import { MockSkillLocations } from '../../../../chatSessions/copilotcli/node/test/testHelpers';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import { MockExtensionContext } from '../../../../../platform/test/node/extensionContext';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';


suite('CopilotCLI Generate & parse prompts', () => {
	(['emptyWorkspace', 'workspace', 'worktree'] as const).forEach(workspaceType => {
		suite(workspaceType, () => {
			const disposables = new DisposableStore();
			let fileSystem: MockFileSystemService;
			let workspaceService: TestWorkspaceService;
			let resolver: CopilotCLIPromptResolver;
			const workspaceInfo = createWorkspaceInfo(workspaceType);
			beforeEach(() => {
				const services = createExtensionUnitTestingServices(disposables);
				const accessor = disposables.add(services.createTestingAccessor());
				fileSystem = accessor.get(IFileSystemService) as MockFileSystemService;
				workspaceService = accessor.get(IWorkspaceService) as TestWorkspaceService;
				const logService = accessor.get(ILogService);
				const imageSupport = new class extends mock<CopilotCLIImageSupport>() {
					override storeImage(imageData: Uint8Array, mimeType: string): Promise<URI> {
						throw new Error('Method not implemented.');
					}
				};
				if (workspaceType === 'workspace' || workspaceType === 'worktree') {
					workspaceService.getWorkspaceFolders().push(URI.file('/workspace'));
				}
				resolver = new CopilotCLIPromptResolver(imageSupport, logService, fileSystem, workspaceService, services.seal(), accessor.get(IIgnoreService), new MockSkillLocations(), new MockExtensionContext() as unknown as IVSCodeExtensionContext);
			});
			afterEach(() => {
				disposables.clear();
				vi.resetAllMocks();
			});
			test('just the prompt without anything else', async () => {
				const req = new TestChatRequest('hello world');
				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('returns original prompt unchanged for slash command', async () => {
				const req = new TestChatRequest('/help something');
				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('returns overridden prompt instead of using the request prompt', async () => {
				const req = new TestChatRequest('/help something');
				const resolved = await resolver.resolvePrompt(req, 'What is 1+2', [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('files are attached as just references without content', async () => {
				const tsUri = URI.file('/workspace/file.ts');
				createMockFile(tsUri,
					`function add(a: number, b: number) {
				return a + b;
			}

			function subtract(a: number, b: number) {
				return a - b;
			}
			`);
				const pyUri = URI.file('/workspace/sample.py');
				createMockFile(pyUri,
					`deff add(a, b):
				return a + b;

			def subtract(a, b):
				return a - b
			`);

				const req = new TestChatRequest('explain contents of #file:file.ts and other files', [
					{
						id: tsUri.toString(),
						name: 'file:file.ts',
						range: [20, 32],
						value: tsUri
					},
					{
						id: pyUri.toString(),
						name: 'sample.py',
						value: pyUri
					}
				]);
				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});
			test('Folders are attached with just references', async () => {
				const folderUri = URI.file('/workspace/folder');

				fileSystem.mockDirectory(folderUri, [
					['file1.txt', FileType.File],
					['file2.txt', FileType.File],
				]);
				if (workspaceType === 'worktree') {
					fileSystem.mockDirectory(URI.file('/worktree/folder'), [
						['file1.txt', FileType.File],
						['file2.txt', FileType.File],
					]);
				}
				const req = new TestChatRequest('list files in #file:folder', [
					{
						id: folderUri.toString(),
						name: 'file:folder',
						value: folderUri
					}
				]);
				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('parses single error diagnostic', async () => {
				createMockFile(URI.file('/workspace/file.py'), `pass`);
				const req = new TestChatRequest('Fix this error', [
					{
						id: new Location(URI.file('/workspace/file.py'), new Range(12, 0, 12, 20)).toString(),
						name: 'Unterminated string',
						value: new ChatReferenceDiagnostic([
							[
								URI.file('/workspace/file.py'),
								[{
									message: 'Unterminated string',
									severity: DiagnosticSeverity.Error,
									range: new Range(12, 0, 12, 20),
									code: 'E001'
								}]
							]])
					}
				]);
				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('groups diagnostics based on same range', async () => {
				createMockFile(URI.file('/workspace/file.py'), `pass`);
				const req = new TestChatRequest('Fix these errors', [
					{
						id: new Location(URI.file('/workspace/file.py'), new Range(12, 0, 12, 20)).toString(),
						name: 'Unterminated string',
						value: new ChatReferenceDiagnostic([
							[
								URI.file('/workspace/file.py'),
								[
									{
										message: 'Msg1',
										severity: DiagnosticSeverity.Warning,
										range: new Range(1, 0, 1, 20),
										code: 'E001'
									},
									{
										message: 'MsgB',
										severity: DiagnosticSeverity.Error,
										range: new Range(1, 0, 4, 20),
										code: 'E002'
									},
									{
										message: 'MsgC',
										severity: DiagnosticSeverity.Information,
										range: new Range(6, 1, 6, 20),
										code: 'E003'
									},
									{
										message: 'MsgD',
										severity: DiagnosticSeverity.Hint,
										range: new Range(6, 10, 6, 15),
										code: 'E004',
									},
								]
							]
						])
					}
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});
			test('aggregates multiple errors across same and different files', async () => {
				createMockFile(URI.file('/workspace/file.py'), `pass`);
				createMockFile(URI.file('/workspace/sample.py'), `pass`);

				const req = new TestChatRequest('Fix these errors', [
					{
						id: new Location(URI.file('/workspace/file.py'), new Range(12, 0, 12, 20)).toString(),
						name: 'Unterminated string',
						value: new ChatReferenceDiagnostic([
							[
								URI.file('/workspace/file.py'),
								[
									{
										message: 'Msg1',
										severity: DiagnosticSeverity.Warning,
										range: new Range(1, 0, 1, 20),
										code: 'E001'
									},
									{
										message: 'MsgB',
										severity: DiagnosticSeverity.Error,
										range: new Range(4, 0, 4, 20),
										code: 'E002'
									},
									{
										message: 'MsgC',
										severity: DiagnosticSeverity.Information,
										range: new Range(6, 1, 6, 20),
										code: 'E003'
									},
									{
										message: 'MsgD',
										severity: DiagnosticSeverity.Hint,
										range: new Range(1, 1, 1, 10),
										code: 'E004',
									},
								]
							],
							[
								URI.file('/workspace/sample.py'),
								[
									{
										message: 'Msg2',
										severity: DiagnosticSeverity.Warning,
										range: new Range(20, 0, 21, 10),
										code: 'W001'
									},
								]
							]])
					}
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});
			test('parses locations including files with spaces', async () => {
				const tsUri = URI.file('/workspace/file.ts');
				createMockFile(tsUri,
					`function add(a: number, b: number) {
				return a + b;
			}

			function subtract(a: number, b: number) {
				return a - b;
			}
			`);
				const tsWithSpacesUri = URI.file('/workspace/hello world/sample.ts');
				createMockFile(tsWithSpacesUri,
					`function mod(a: number) {
				return a;
			}`);
				const pyUri = URI.file('/workspace/sample.py');
				createMockFile(pyUri,
					`deff add(a, b):
				return a + b;

			def subtract(a, b):
				return a - b
			`);
				const req = new TestChatRequest('base', [
					{
						id: tsUri.toString(),
						name: 'file:file.ts',
						value: new Location(tsUri, new Range(4, 0, 4, 15))
					},
					{
						id: tsWithSpacesUri.toString(),
						name: 'file:sample.ts',
						value: new Location(tsWithSpacesUri, new Range(4, 0, 4, 15))
					},
					{
						id: pyUri.toString(),
						name: 'file:sample.py',
						value: new Location(pyUri, new Range(3, 0, 3, 15))
					}
				]);
				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('uses attachment id attribute for name/id', async () => {
				const tsUri = URI.file('/workspace/add.py');
				createMockFile(tsUri,
					`# Basic arithmetic ops
			def add(a, b):
				return a + b
			}

			def subtract(a, b):
				return a - b
			`);
				const req = new TestChatRequest('explain #sym:add', [
					{
						id: 'sym:add',
						name: 'sym:add',
						value: new Location(URI.file('/workspace/add.py'), new Range(1, 0, 3, 15)),
						range: [1, 3]
					}
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('includes contents of untitled file', async () => {
				const untitledTsFile = {
					id: 'file:untitled-1',
					name: 'file:untitled-1',
					value: URI.from({ scheme: Schemas.untitled, path: 'untitled-1' })
				};
				createMockFile(untitledTsFile.value, `function example() {
	console.log("This is an example");
}`);
				const req = new TestChatRequest('Process these files', [
					untitledTsFile
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('includes contents of untitled prompt files', async () => {
				const untitledPromptFile = {
					id: 'vscode.prompt.file__untitled:untitled-1',
					name: 'prompt:Untitled-2',
					value: URI.from({ scheme: Schemas.untitled, path: 'untitled-1' })
				};
				const regularFileRef = {
					id: 'regular-file',
					name: 'regular.ts',
					value: URI.file('/workspace/regular.ts')
				};
				createMockFile(untitledPromptFile.value, `This is a prompt file`);
				createMockFile(regularFileRef.value, `This is a regular file`);

				const req = new TestChatRequest('Process these files', [
					untitledPromptFile,
					regularFileRef
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('includes contents of regular prompt files', async () => {
				const promptFile = {
					id: 'vscode.prompt.file__file:doit.prompt.md',
					name: 'prompt:doit.prompt.md',
					value: URI.file('doit.prompt.md')
				};
				createMockFile(promptFile.value, `This is a prompt file`);

				const req = new TestChatRequest('Process these files', [
					promptFile
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				const result = extractChatPromptReferences(resolved.prompt);
				expect(resolved.prompt).toMatchSnapshot();
				expect(fixFilePathsForTestComparison(resolved.attachments)).toMatchSnapshot();
				expect(result).toMatchSnapshot();
			});

			test('excludes instruction files from references and attachments', async () => {
				const instructionFile = {
					id: 'vscode.instructions.file__file:/workspace/my.instructions.md',
					name: 'my.instructions.md',
					value: URI.file('/workspace/my.instructions.md')
				};
				const regularFileRef = {
					id: 'regular-file',
					name: 'regular.ts',
					value: URI.file('/workspace/regular.ts')
				};
				createMockFile(instructionFile.value, `# Instructions\nDo things this way.`);
				createMockFile(regularFileRef.value, `const x = 1;`);

				const req = new TestChatRequest('Process these files', [
					instructionFile,
					regularFileRef
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				// Instruction file should be excluded from references and attachments
				const instructionRef = resolved.references.find(r => URI.isUri(r.value) && (r.value as URI).fsPath.includes('my.instructions.md'));
				expect(instructionRef).toBeUndefined();
				// Regular file reference should still be included
				const regularRef = resolved.references.find(r => URI.isUri(r.value) && (r.value as URI).fsPath.includes('regular.ts'));
				expect(regularRef).toBeDefined();
				// Attachment for instruction file should not be present
				const instructionAttachment = resolved.attachments.find(a => a.type === 'file' && a.path.includes('my.instructions.md'));
				expect(instructionAttachment).toBeUndefined();
			});

			test('excludes customizations index from references and attachments', async () => {
				const customizationsIndex = {
					id: 'vscode.customizations.index',
					name: 'customizations',
					value: URI.file('/workspace/.github/copilot-instructions.md')
				};
				const regularFileRef = {
					id: 'regular-file',
					name: 'regular.ts',
					value: URI.file('/workspace/regular.ts')
				};
				createMockFile(customizationsIndex.value, `# Customizations\nSome instructions.`);
				createMockFile(regularFileRef.value, `const x = 1;`);

				const req = new TestChatRequest('Process these files', [
					customizationsIndex,
					regularFileRef
				]);

				const resolved = await resolver.resolvePrompt(req, undefined, [], workspaceInfo, [], CancellationToken.None);

				// Customizations index should be excluded from references and attachments
				const customizationsRef = resolved.references.find(r => URI.isUri(r.value) && (r.value as URI).fsPath.includes('copilot-instructions.md'));
				expect(customizationsRef).toBeUndefined();
				// Regular file reference should still be included
				const regularRef = resolved.references.find(r => URI.isUri(r.value) && (r.value as URI).fsPath.includes('regular.ts'));
				expect(regularRef).toBeDefined();
				// Attachment for customizations index should not be present
				const customizationsAttachment = resolved.attachments.find(a => a.type === 'file' && a.path.includes('copilot-instructions.md'));
				expect(customizationsAttachment).toBeUndefined();
			});

			test('extract GitHub PR/Issues', async () => {
				const result = extractChatPromptReferences(getPromptTextWithGithubIssuePR());
				expect(result).toMatchSnapshot();
			});
			test('extract Git Commit', async () => {
				const result = extractChatPromptReferences(getPromptTextWithGitCommit());
				expect(result).toMatchSnapshot();
			});
			function createMockFile(uri: URI, text: string) {
				const doc = createTextDocumentData(uri, text, 'plaintext', '\n').document;
				workspaceService.textDocuments.push(doc);
				if (workspaceService.getWorkspaceFolders().length === 0) {
					workspaceService.getWorkspaceFolders().push(URI.file('/workspace'));
				}
				if (uri.scheme !== Schemas.untitled) {
					fileSystem.mockFile(uri, text);
					if (workspaceType === 'worktree') {
						if (uri.fsPath.startsWith('/workspace')) {
							fileSystem.mockFile(URI.file(uri.fsPath.replace('/workspace', '/worktree')), text);
						} else if (uri.fsPath.startsWith('\\workspace')) {
							fileSystem.mockFile(URI.file(uri.fsPath.replace('\\workspace', '\\worktree')), text);
						}
					}
				}
			}
		});
	});
});

suite('multi-workspace with additionalWorkspaces', () => {
	const disposables = new DisposableStore();
	let fileSystem: MockFileSystemService;
	let workspaceService: TestWorkspaceService;
	let resolver: CopilotCLIPromptResolver;

	beforeEach(() => {
		const services = createExtensionUnitTestingServices(disposables);
		const accessor = disposables.add(services.createTestingAccessor());
		fileSystem = accessor.get(IFileSystemService) as MockFileSystemService;
		workspaceService = accessor.get(IWorkspaceService) as TestWorkspaceService;
		const logService = accessor.get(ILogService);
		const imageSupport = new class extends mock<CopilotCLIImageSupport>() {
			override storeImage(_imageData: Uint8Array, _mimeType: string): Promise<URI> {
				throw new Error('Method not implemented.');
			}
		};
		workspaceService.getWorkspaceFolders().push(URI.file('/workspace'));
		workspaceService.getWorkspaceFolders().push(URI.file('/workspace2'));
		resolver = new CopilotCLIPromptResolver(imageSupport, logService, fileSystem, workspaceService, services.seal(), accessor.get(IIgnoreService), new MockSkillLocations(), new MockExtensionContext() as unknown as IVSCodeExtensionContext);
	});

	afterEach(() => {
		disposables.clear();
		vi.resetAllMocks();
	});

	test('translates file reference in additionalWorkspaces to its worktree path', async () => {
		const fileUri = URI.file('/workspace2/src/main.ts');
		const worktreeFileUri = URI.file('/worktree2/src/main.ts');

		fileSystem.mockFile(fileUri, 'const x = 1;');
		fileSystem.mockFile(worktreeFileUri, 'const x = 1;');

		const primaryWorkspaceInfo: IWorkspaceInfo = {
			folder: URI.file('/workspace'),
			repository: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		};
		const additionalWorkspace: IWorkspaceInfo = {
			folder: URI.file('/workspace2'),
			repository: URI.file('/workspace2'),
			worktree: URI.file('/worktree2'),
			worktreeProperties: {
				version: 2,
				baseCommit: 'HEAD',
				branchName: 'worktree2-branch',
				repositoryPath: '/workspace2',
				worktreePath: '/worktree2',
				baseBranchName: 'main',
			},
		};

		const req = new TestChatRequest('explain file', [
			{
				id: fileUri.toString(),
				name: 'file:main.ts',
				value: fileUri,
			},
		]);

		const resolved = await resolver.resolvePrompt(req, undefined, [], primaryWorkspaceInfo, [additionalWorkspace], CancellationToken.None);

		// File reference should be translated to the worktree path of additionalWorkspace
		const fileRef = resolved.references.find(r => URI.isUri(r.value));
		expect((fileRef?.value as {}).toString()).toBe(worktreeFileUri.toString());
	});

	test('falls back to original URI when worktree file does not exist for additionalWorkspaces', async () => {
		const fileUri = URI.file('/workspace2/src/main.ts');

		fileSystem.mockFile(fileUri, 'const x = 1;');
		// Note: worktree file is NOT mocked, so stat will fail

		const primaryWorkspaceInfo: IWorkspaceInfo = {
			folder: URI.file('/workspace'),
			repository: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		};
		const additionalWorkspace: IWorkspaceInfo = {
			folder: URI.file('/workspace2'),
			repository: URI.file('/workspace2'),
			worktree: URI.file('/worktree2'),
			worktreeProperties: {
				version: 2,
				baseCommit: 'HEAD',
				branchName: 'worktree2-branch',
				repositoryPath: '/workspace2',
				worktreePath: '/worktree2',
				baseBranchName: 'main',
			},
		};

		const req = new TestChatRequest('explain file', [
			{
				id: fileUri.toString(),
				name: 'file:main.ts',
				value: fileUri,
			},
		]);

		const resolved = await resolver.resolvePrompt(req, undefined, [], primaryWorkspaceInfo, [additionalWorkspace], CancellationToken.None);

		// File reference should remain at original URI since worktree file doesn't exist
		const fileRef = resolved.references.find(r => URI.isUri(r.value));
		expect((fileRef?.value as {}).toString()).toBe(fileUri.toString());
	});

	test('uses findMatchingWorktree fallback when file is under repository but not in workspace service', async () => {
		// Remove /workspace2 from workspace service so getWorkspaceFolder returns undefined
		const folders = workspaceService.getWorkspaceFolders();
		const idx = folders.findIndex(f => f.toString() === URI.file('/workspace2').toString());
		if (idx >= 0) {
			folders.splice(idx, 1);
		}

		const fileUri = URI.file('/workspace2/src/main.ts');
		const worktreeFileUri = URI.file('/worktree2/src/main.ts');

		fileSystem.mockFile(fileUri, 'const x = 1;');
		fileSystem.mockFile(worktreeFileUri, 'const x = 1;');

		const primaryWorkspaceInfo: IWorkspaceInfo = {
			folder: URI.file('/workspace'),
			repository: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		};
		// additionalWorkspace has isolation enabled and its repository covers the file
		const additionalWorkspace: IWorkspaceInfo = {
			folder: URI.file('/workspace2'),
			repository: URI.file('/workspace2'),
			worktree: URI.file('/worktree2'),
			worktreeProperties: {
				version: 2,
				baseCommit: 'HEAD',
				branchName: 'worktree2-branch',
				repositoryPath: '/workspace2',
				worktreePath: '/worktree2',
				baseBranchName: 'main',
			},
		};

		const req = new TestChatRequest('explain file', [
			{
				id: fileUri.toString(),
				name: 'file:main.ts',
				value: fileUri,
			},
		]);

		const resolved = await resolver.resolvePrompt(req, undefined, [], primaryWorkspaceInfo, [additionalWorkspace], CancellationToken.None);

		// findMatchingWorktree should map /workspace2/src/main.ts -> /worktree2/src/main.ts
		const fileRef = resolved.references.find(r => URI.isUri(r.value));
		expect((fileRef?.value as {}).toString()).toBe(worktreeFileUri.toString());
	});

	test('falls back to original URI when findMatchingWorktree candidate does not exist', async () => {
		// Remove /workspace2 from workspace service so getWorkspaceFolder returns undefined → triggers findMatchingWorktree
		const folders = workspaceService.getWorkspaceFolders();
		const idx = folders.findIndex(f => f.toString() === URI.file('/workspace2').toString());
		if (idx >= 0) {
			folders.splice(idx, 1);
		}

		const fileUri = URI.file('/workspace2/src/main.ts');
		fileSystem.mockFile(fileUri, 'const x = 1;');
		// worktree file is NOT mocked → stat throws ENOENT → should fall back to original URI

		const primaryWorkspaceInfo: IWorkspaceInfo = {
			folder: URI.file('/workspace'),
			repository: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		};
		const additionalWorkspace: IWorkspaceInfo = {
			folder: URI.file('/workspace2'),
			repository: URI.file('/workspace2'),
			worktree: URI.file('/worktree2'),
			worktreeProperties: {
				version: 2,
				baseCommit: 'HEAD',
				branchName: 'worktree2-branch',
				repositoryPath: '/workspace2',
				worktreePath: '/worktree2',
				baseBranchName: 'main',
			},
		};

		const req = new TestChatRequest('explain file', [
			{
				id: fileUri.toString(),
				name: 'file:main.ts',
				value: fileUri,
			},
		]);

		const resolved = await resolver.resolvePrompt(req, undefined, [], primaryWorkspaceInfo, [additionalWorkspace], CancellationToken.None);

		// findMatchingWorktree candidate stat fails → original URI returned unchanged
		const fileRef = resolved.references.find(r => URI.isUri(r.value));
		expect((fileRef?.value as {}).toString()).toBe(fileUri.toString());
	});

	test('does not translate URIs when isolation is not enabled in any workspace', async () => {
		const fileUri = URI.file('/workspace2/src/main.ts');
		fileSystem.mockFile(fileUri, 'const x = 1;');

		const primaryWorkspaceInfo: IWorkspaceInfo = {
			folder: URI.file('/workspace'),
			repository: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		};
		// additionalWorkspace has NO isolation
		const additionalWorkspace: IWorkspaceInfo = {
			folder: URI.file('/workspace2'),
			repository: URI.file('/workspace2'),
			worktree: undefined,
			worktreeProperties: undefined,
		};

		const req = new TestChatRequest('explain file', [
			{
				id: fileUri.toString(),
				name: 'file:main.ts',
				value: fileUri,
			},
		]);

		const resolved = await resolver.resolvePrompt(req, undefined, [], primaryWorkspaceInfo, [additionalWorkspace], CancellationToken.None);

		// No translation should occur
		const fileRef = resolved.references.find(r => URI.isUri(r.value));
		expect((fileRef?.value as {}).toString()).toBe(fileUri.toString());
	});
});

function createWorkspaceInfo(workspaceType: 'emptyWorkspace' | 'workspace' | 'worktree'): IWorkspaceInfo {
	if (workspaceType === 'workspace') {
		return {
			...emptyWorkspaceInfo(),
			folder: URI.file('/workspace'),
		};
	}

	if (workspaceType === 'worktree') {
		return {
			...emptyWorkspaceInfo(),
			folder: URI.file('/workspace'),
			repository: URI.file('/workspace'),
			worktree: URI.file('/worktree'),
			worktreeProperties: {
				version: 2,
				baseCommit: 'HEAD',
				branchName: 'worktree-branch',
				repositoryPath: '/workspace',
				worktreePath: '/worktree',
				baseBranchName: 'main',
			},
		};
	}

	return emptyWorkspaceInfo();
}

/**
 * As we want test to run on all platforms, we need to fix file paths in attachments
 * to use forward slashes for comparison.
 */
function fixFilePathsForTestComparison(attachments: Attachment[]): Attachment[] {
	attachments.forEach(attachment => {
		if (attachment.type === 'file') {
			attachment.path = attachment.path.replace(/\\/g, '/');
		} else if (attachment.type === 'directory') {
			attachment.path = attachment.path.replace(/\\/g, '/');
		} else if (attachment.type === 'selection') {
			attachment.filePath = attachment.filePath.replace(/\\/g, '/');
		}
	});
	return attachments;
}


function getPromptTextWithGithubIssuePR() {
	return `
'Explain this
<reminder>
IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task
</reminder>
<attachments>
<attachment id="#17143 Kernel interrupt_mode \\"message\\" sends interrupt_request on shell channel instead of control channel">
{"issueNumber":17143,"owner":"microsoft","repo":"vscode-jupyter","title":"Kernel interrupt_mode \\"message\\" sends interrupt_request on shell channel instead of control channel","body":"### Applies To\\n\\n- [x] Notebooks (.ipynb files)\\n- [ ] Interactive Window and\\\\/or Cell Scripts (.py files with \\\\#%% markers)\\n\\n### What happened?\\n\\n  **Description**\\n\\n  When a kernel has interrupt_mode set to \'message\', the extension incorrectly sends the interrupt_request message on the shell channel instead of the control channel as specified by the Jupyter protocol.\\n\\n  **Expected Behavior**\\n\\n  According to the Jupyter [kernel spec documentation](https://github.com/microsoft/vscode-jupyter/blob/4efd36fb61d83bf0c99008648ca633ad688d4ab9/src/kernels/raw/session/rawKernelConnection.node.ts#L361-L370):\\n\\n> In case a kernel can not catch operating system interrupt signals (e.g. the used runtime handles signals and does not allow a user program to define a callback), a kernel can choose to be notified using a message instead. For this to work, the kernels kernelspec must set \`interrupt_mode\` to \`message\`. An interruption will then result in the following message on the \`control\` channel:\\n\\n  The interrupt request should:\\n  1. Be created with channel: \'control\'\\n  2. Be sent via sendControlMessage()\\n\\n  **Actual Behavior**\\n\\n  The current implementation ([rawKernelConnection.node.ts](https://github.com/microsoft/vscode-jupyter/blob/4efd36fb61d83bf0c99008648ca633ad688d4ab9/src/kernels/raw/session/rawKernelConnection.node.ts#L361-L370)):\\n  1. Creates message with channel: \'shell\'\\n  2. Sends via sendShellMessage()\\n\\n  This causes two problems:\\n  1. The interrupt is queued behind other shell messages - The shell channel processes messages sequentially, so if there are pending execution requests or other shell messages, the interrupt will wait in the queue instead of being processed immediately. This defeats the purpose of interrupting, as the kernel continues executing while the interrupt waits.\\n  2. Interrupt may fail entirely - Kernels expect interrupt_request on the control channel and may ignore or reject it on the shell channel.\\n\\n### VS Code Version\\n\\n1.105.1\\n\\n### Jupyter Extension Version\\n\\n2025.9.1\\n\\n### Jupyter logs\\n\\n\`\`\`shell\\n\\n\`\`\`\\n\\n### Coding Language and Runtime Version\\n\\n_No response_\\n\\n### Language Extension Version (if applicable)\\n\\n_No response_\\n\\n### Anaconda Version (if applicable)\\n\\n_No response_\\n\\n### Running Jupyter locally or remotely?\\n\\nNone","comments":[]}
</attachment>
<attachment id="#17131 Bump ipywidgets from 7.7.2 to 8.1.8">
{"prNumber":17131,"owner":"microsoft","repo":"vscode-jupyter","title":"Bump ipywidgets from 7.7.2 to 8.1.8","body":"Bumps [ipywidgets](https://github.com/jupyter-widgets/ipywidgets) from 7.7.2 to 8.1.8.\\n<details>\\n<summary>Release notes</summary>\\n<p><em>Sourced from <a href=\\"https://github.com/jupyter-widgets/ipywidgets/releases\\">ipywidgets\'s releases</a>.</em></p>\\n<blockquote>\\n<h2>8.1.8</h2>\\n<h2>What\'s Changed</h2>\\n<ul>\\n<li>Add JupyterCon banner and jupyter colors by <a href=\\"https://github.com/choldgraf\\"><code>@​choldgraf</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3998\\">jupyter-widgets/ipywidgets#3998</a></li>\\n<li>Fix badge formatting in README.md by <a href=\\"https://github.com/Carreau\\"><code>@​Carreau</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/4000\\">jupyter-widgets/ipywidgets#4000</a></li>\\n<li>Add Plausible web stats by <a href=\\"https://github.com/jasongrout\\"><code>@​jasongrout</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/4003\\">jupyter-widgets/ipywidgets#4003</a></li>\\n<li>Update jupyterlab_widgets metadata to indicate it works with JupyterLab 4 by <a href=\\"https://github.com/jasongrout\\"><code>@​jasongrout</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/4004\\">jupyter-widgets/ipywidgets#4004</a></li>\\n</ul>\\n<h2>New Contributors</h2>\\n<ul>\\n<li><a href=\\"https://github.com/choldgraf\\"><code>@​choldgraf</code></a> made their first contribution in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3998\\">jupyter-widgets/ipywidgets#3998</a></li>\\n</ul>\\n<p><strong>Full Changelog</strong>: <a href=\\"https://github.com/jupyter-widgets/ipywidgets/compare/8.1.7...8.1.8\\">https://github.com/jupyter-widgets/ipywidgets/compare/8.1.7...8.1.8</a></p>\\n<h2>8.1.7</h2>\\n<h2>What\'s Changed</h2>\\n<ul>\\n<li>Fix CI + remove Python 3.8 by <a href=\\"https://github.com/martinRenou\\"><code>@​martinRenou</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3989\\">jupyter-widgets/ipywidgets#3989</a></li>\\n<li>Dynamic widgets registry by <a href=\\"https://github.com/martinRenou\\"><code>@​martinRenou</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3988\\">jupyter-widgets/ipywidgets#3988</a></li>\\n</ul>\\n<p><strong>Full Changelog</strong>: <a href=\\"https://github.com/jupyter-widgets/ipywidgets/compare/8.1.6...8.1.7\\">https://github.com/jupyter-widgets/ipywidgets/compare/8.1.6...8.1.7</a></p>\\n<h2>8.1.6</h2>\\n<h2>What\'s Changed</h2>\\n<ul>\\n<li>Fix lumino and lab packages pinning by <a href=\\"https://github.com/martinRenou\\"><code>@​martinRenou</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3958\\">jupyter-widgets/ipywidgets#3958</a></li>\\n<li>Typo fix by <a href=\\"https://github.com/david4096\\"><code>@​david4096</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3960\\">jupyter-widgets/ipywidgets#3960</a></li>\\n<li>Update lables even without MatJax/TypeSetter by <a href=\\"https://github.com/DonJayamanne\\"><code>@​DonJayamanne</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3962\\">jupyter-widgets/ipywidgets#3962</a></li>\\n<li>Update github actions and fix readthedocs by <a href=\\"https://github.com/brichet\\"><code>@​brichet</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3983\\">jupyter-widgets/ipywidgets#3983</a></li>\\n<li>Fix the new line when pressing enter in textarea widget by <a href=\\"https://github.com/brichet\\"><code>@​brichet</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3982\\">jupyter-widgets/ipywidgets#3982</a></li>\\n<li>Backward compatibility on processPhosphorMessage by <a href=\\"https://github.com/martinRenou\\"><code>@​martinRenou</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3945\\">jupyter-widgets/ipywidgets#3945</a></li>\\n<li>Include sourcemaps in npm tarballs by <a href=\\"https://github.com/manzt\\"><code>@​manzt</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3978\\">jupyter-widgets/ipywidgets#3978</a></li>\\n<li>Fix deprecation warning when importing the backend_inline by <a href=\\"https://github.com/emolinlu\\"><code>@​emolinlu</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3984\\">jupyter-widgets/ipywidgets#3984</a></li>\\n</ul>\\n<h2>New Contributors</h2>\\n<ul>\\n<li><a href=\\"https://github.com/david4096\\"><code>@​david4096</code></a> made their first contribution in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3960\\">jupyter-widgets/ipywidgets#3960</a></li>\\n<li><a href=\\"https://github.com/brichet\\"><code>@​brichet</code></a> made their first contribution in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3983\\">jupyter-widgets/ipywidgets#3983</a></li>\\n<li><a href=\\"https://github.com/emolinlu\\"><code>@​emolinlu</code></a> made their first contribution in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3984\\">jupyter-widgets/ipywidgets#3984</a></li>\\n</ul>\\n<p><strong>Full Changelog</strong>: <a href=\\"https://github.com/jupyter-widgets/ipywidgets/compare/8.1.5...8.1.6\\">https://github.com/jupyter-widgets/ipywidgets/compare/8.1.5...8.1.6</a></p>\\n<h2>8.1.5</h2>\\n<h2>What\'s Changed</h2>\\n<ul>\\n<li>More Phosphor backward compatibility by <a href=\\"https://github.com/martinRenou\\"><code>@​martinRenou</code></a> in <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/pull/3942\\">jupyter-widgets/ipywidgets#3942</a></li>\\n</ul>\\n<p><strong>Full Changelog</strong>: <a href=\\"https://github.com/jupyter-widgets/ipywidgets/compare/8.1.4...8.1.5\\">https://github.com/jupyter-widgets/ipywidgets/compare/8.1.4...8.1.5</a></p>\\n<h2>8.1.4</h2>\\n<h2>What\'s Changed</h2>\\n<h3>New features</h3>\\n<!-- raw HTML omitted -->\\n</blockquote>\\n<p>... (truncated)</p>\\n</details>\\n<details>\\n<summary>Commits</summary>\\n<ul>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/3171b1c746643a3893987190dc505661c5562877\\"><code>3171b1c</code></a> Update Output Widget.ipynb (<a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/issues/3881\\">#3881</a>)</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/cd817839ab8b6ef80c8e2b7a94c8f1df1de29734\\"><code>cd81783</code></a> update image processing example notebok imports and function call (<a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/issues/3896\\">#3896</a>)</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/cecd2b0d0314a92b71dce364e3db7a06af8cf64a\\"><code>cecd2b0</code></a> specify Jupyterlab (version 3.x or above) (<a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/issues/3880\\">#3880</a>)</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/0aa1efb563edeb3564f5738dfbee630fd6e4ed6f\\"><code>0aa1efb</code></a> Allow <code>interact</code> to use basic type hint annotations (<a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/issues/3908\\">#3908</a>)</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/2e15cfc030b8f6c319114be23b4f95efb537fd4d\\"><code>2e15cfc</code></a> Update Widget List.ipynb</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/06ed868181a3192067ffcff0ed94815f72a1f7bf\\"><code>06ed868</code></a> Merge pull request <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/issues/3793\\">#3793</a> from ferdnyc/mappings-work-again</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/31259ca8ba33c44a29ba8ffede9de0eece61fb44\\"><code>31259ca</code></a> Merge pull request <a href=\\"https://redirect.github.com/jupyter-widgets/ipywidgets/issues/3801\\">#3801</a> from warrickball/patch-2</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/dd250bfacd875561ad05f692d39c41f350a56b42\\"><code>dd250bf</code></a> Handle Notebook 7 in dev install script</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/a1282ec692b35d91e0b3062016962634c7a8012e\\"><code>a1282ec</code></a> Fix link to &quot;Output widget examples&quot;</li>\\n<li><a href=\\"https://github.com/jupyter-widgets/ipywidgets/commit/b6b3051e0b89c1086ea79327d3e957af7da957fd\\"><code>b6b3051</code></a> Revert &quot;Add note on removal of mapping types in documentation&quot;</li>\\n<li>Additional commits viewable in <a href=\\"https://github.com/jupyter-widgets/ipywidgets/compare/7.7.2...8.1.8\\">compare view</a></li>\\n</ul>\\n</details>\\n<br />\\n\\n\\n[![Dependabot compatibility score](https://dependabot-badges.githubapp.com/badges/compatibility_score?dependency-name=ipywidgets&package-manager=pip&previous-version=7.7.2&new-version=8.1.8)](https://docs.github.com/en/github/managing-security-vulnerabilities/about-dependabot-security-updates#about-compatibility-scores)\\n\\nDependabot will resolve any conflicts with this PR as long as you don\'t alter it yourself. You can also trigger a rebase manually by commenting \`@dependabot rebase\`.\\n\\n[//]: # (dependabot-automerge-start)\\n[//]: # (dependabot-automerge-end)\\n\\n---\\n\\n<details>\\n<summary>Dependabot commands and options</summary>\\n<br />\\n\\nYou can trigger Dependabot actions by commenting on this PR:\\n- \`@dependabot rebase\` will rebase this PR\\n- \`@dependabot recreate\` will recreate this PR, overwriting any edits that have been made to it\\n- \`@dependabot merge\` will merge this PR after your CI passes on it\\n- \`@dependabot squash and merge\` will squash and merge this PR after your CI passes on it\\n- \`@dependabot cancel merge\` will cancel a previously requested merge and block automerging\\n- \`@dependabot reopen\` will reopen this PR if it is closed\\n- \`@dependabot close\` will close this PR and stop Dependabot recreating it. You can achieve the same result by closing it manually\\n- \`@dependabot show <dependency name> ignore conditions\` will show all of the ignore conditions of the specified dependency\\n- \`@dependabot ignore this major version\` will close this PR and stop Dependabot creating any more for this major version (unless you reopen the PR or upgrade to it yourself)\\n- \`@dependabot ignore this minor version\` will close this PR and stop Dependabot creating any more for this minor version (unless you reopen the PR or upgrade to it yourself)\\n- \`@dependabot ignore this dependency\` will close this PR and stop Dependabot creating any more for this dependency (unless you reopen the PR or upgrade to it yourself)\\n\\n\\n</details>","comments":[],"threads":[],"changes":["@@ -5,7 +5,7 @@ pandas\\n jupyter\\n # List of requirements for conda environments that cannot be installed using conda\\n # Pinned per ipywidget 8 support: https://github.com/microsoft/vscode-jupyter/issues/11598\\n-ipywidgets==7.7.2\\n+ipywidgets==8.1.8\\n anywidget\\n matplotlib\\n ipympl"]}
</attachment>
<attachment id="microsoft/vscode-jupyter">
Information about the current repository. You can use this information when you need to calculate diffs or compare changes with the default branch:
Repository name: vscode-jupyter
Owner: microsoft
Current branch: don/well-landfowl
Default branch: main
Active pull request (may not be the same as open pull request): Skip failing tests https://github.com/microsoft/vscode-jupyter/pull/17155
</attachment>

</attachments>
<userRequest>
Explain this (See <attachments> above for file contents. You may not need to search or read the file again.)
</userRequest>`;
}

function getPromptTextWithGitCommit() {
	return `
Explain this
<reminder>
IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task
</reminder>
<attachments>
<attachment id="microsoft/vscode-jupyter">
Information about the current repository. You can use this information when you need to calculate diffs or compare changes with the default branch:
Repository name: vscode-jupyter
Owner: microsoft
Current branch: don/well-landfowl
Default branch: main
Active pull request (may not be the same as open pull request): Skip failing tests https://github.com/microsoft/vscode-jupyter/pull/17155
</attachment>
<attachment id="$(repo) select-impala $(git-commit) 4efd36f" filePath="scm-history-item:/Users/donjayamanne/Development/vsc/vscode-jupyter.worktrees/select-impala?%7B%22repositoryId%22%3A%22scm10%22%2C%22historyItemId%22%3A%224efd36fb61d83bf0c99008648ca633ad688d4ab9%22%2C%22historyItemParentId%22%3A%22b67ca34030530fdb75e326293e2c023d59f24fc8%22%2C%22historyItemDisplayId%22%3A%224efd36f%22%7D">
commit 4efd36fb61d83bf0c99008648ca633ad688d4ab9
Author: Don Jayamanne <don.jayamanne@outlook.com>
Date:   Fri Oct 10 18:58:40 2025 +1100

	Fix identification of self signed certs (#17049)

diff --git a/src/platform/errors/jupyterSelfCertsError.ts b/src/platform/errors/jupyterSelfCertsError.ts
index f30ade6977b4..b564ebfafc09 100644
--- a/src/platform/errors/jupyterSelfCertsError.ts
+++ b/src/platform/errors/jupyterSelfCertsError.ts
@@ -18,14 +18,19 @@ export class JupyterSelfCertsError extends BaseError {
	}
	public static isSelfCertsError(err: unknown) {
		const message = (err as undefined | { message: string })?.message ?? \'\';
+        const name = (err as undefined | { name: string })?.name ?? \'\';
+        const messageToCheck = "";
		return (
-            message.indexOf(\'reason: self signed certificate\') >= 0 ||
+            messageToCheck.indexOf(\'reason: self signed certificate\') >= 0 ||
			// https://github.com/microsoft/vscode-jupyter-hub/issues/36#issuecomment-1854097594
-            message.indexOf(\'reason: unable to verify the first certificate\') >= 0 ||
+            messageToCheck.indexOf(\'reason: unable to verify the first certificate\') >= 0 ||
			// https://github.com/microsoft/vscode-jupyter-hub/issues/36#issuecomment-1761234981
-            message.indexOf(\'reason: unable to get issuer certificate\') >= 0 ||
+            messageToCheck.indexOf(\'reason: unable to get issuer certificate\') >= 0 ||
			// https://github.com/microsoft/vscode-jupyter/issues/7558#issuecomment-993054968
-            message.indexOf("is not in the cert\'s list") >= 0
+            messageToCheck.indexOf("is not in the cert\'s list") >= 0 ||
+            // https://github.com/microsoft/vscode-jupyter/issues/16522
+            messageToCheck.indexOf(\'unable to verify the first certificate\') >= 0 ||
+            messageToCheck.indexOf(\'UNABLE_TO_GET_ISSUER_CERT\') >= 0
		);
	}
}
</attachment>

</attachments>
<userRequest>
Explain this (See <attachments> above for file contents. You may not need to search or read the file again.)
</userRequest>`;
}
