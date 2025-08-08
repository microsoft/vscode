/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../chat/common/languageModelToolsService.js';
import { FileOperationHeuristics, getCommandReRoutingRecommendation, getRecommendedToolsOverRunInTerminal } from '../../browser/alternativeRecommendation.js';

suite('AlternativeRecommendation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let mockLanguageModelToolsService: ILanguageModelToolsService;

	setup(() => {
		const mockTools: IToolData[] = [
			{
				id: 'file-reader-tool',
				source: ToolDataSource.Internal,
				displayName: 'File Reader',
				modelDescription: 'Read file contents',
				tags: ['file read', 'file operations']
			},
			{
				id: 'directory-creator-tool',
				source: ToolDataSource.Internal,
				displayName: 'Directory Creator',
				modelDescription: 'Create directories',
				tags: ['directory creation', 'file operations']
			},
			{
				id: 'python-tool',
				source: ToolDataSource.Internal,
				displayName: 'Python Environment',
				modelDescription: 'Manage Python environment',
				tags: ['python environment']
			}
		];

		mockLanguageModelToolsService = {
			getTools: () => mockTools,
		} as any;
	});

	suite('FileOperationHeuristics', () => {
		let heuristics: FileOperationHeuristics;

		setup(() => {
			heuristics = new FileOperationHeuristics();
		});

		test('extractFilePaths - cat command with single file', () => {
			const result = heuristics.extractFilePaths('cat file.txt');
			deepStrictEqual(result, ['file.txt']);
		});

		test('extractFilePaths - cat command with multiple files', () => {
			const result = heuristics.extractFilePaths('cat file1.txt file2.txt');
			deepStrictEqual(result, ['file1.txt', 'file2.txt']);
		});

		test('extractFilePaths - cat command with quoted paths', () => {
			const result = heuristics.extractFilePaths('cat "file with spaces.txt" normal-file.txt');
			deepStrictEqual(result, ['file with spaces.txt', 'normal-file.txt']);
		});

		test('extractFilePaths - type command (Windows)', () => {
			const result = heuristics.extractFilePaths('type file.txt');
			deepStrictEqual(result, ['file.txt']);
		});

		test('extractFilePaths - mkdir command', () => {
			const result = heuristics.extractFilePaths('mkdir new-directory');
			deepStrictEqual(result, ['new-directory']);
		});

		test('extractFilePaths - mkdir with -p flag', () => {
			const result = heuristics.extractFilePaths('mkdir -p path/to/directory');
			deepStrictEqual(result, ['path/to/directory']);
		});

		test('extractFilePaths - ls command', () => {
			const result = heuristics.extractFilePaths('ls directory');
			deepStrictEqual(result, ['directory']);
		});

		test('detectCommandType - cat command', () => {
			const result = heuristics.detectCommandType('cat file.txt');
			strictEqual(result, 'file-read');
		});

		test('detectCommandType - type command', () => {
			const result = heuristics.detectCommandType('type file.txt');
			strictEqual(result, 'file-read');
		});

		test('detectCommandType - mkdir command', () => {
			const result = heuristics.detectCommandType('mkdir directory');
			strictEqual(result, 'directory-create');
		});

		test('detectCommandType - ls command', () => {
			const result = heuristics.detectCommandType('ls directory');
			strictEqual(result, 'file-list');
		});

		test('detectCommandType - echo with redirect', () => {
			const result = heuristics.detectCommandType('echo "content" > file.txt');
			strictEqual(result, 'file-write');
		});

		test('detectCommandType - unknown command', () => {
			const result = heuristics.detectCommandType('unknown-command');
			strictEqual(result, 'unknown');
		});
	});

	suite('getCommandReRoutingRecommendation', () => {
		test('should detect cat command and suggest re-routing', () => {
			const result = getCommandReRoutingRecommendation('cat file.txt', mockLanguageModelToolsService);
			
			strictEqual(result.shouldReRoute, true);
			strictEqual(result.commandType, 'file-read');
			deepStrictEqual(result.targetFiles, ['file.txt']);
		});

		test('should detect mkdir command and suggest re-routing', () => {
			const result = getCommandReRoutingRecommendation('mkdir new-dir', mockLanguageModelToolsService);
			
			strictEqual(result.shouldReRoute, true);
			strictEqual(result.commandType, 'directory-create');
			deepStrictEqual(result.targetFiles, ['new-dir']);
		});

		test('should handle commands with no matching tools', () => {
			const emptyToolsService = {
				getTools: () => []
			} as any;
			
			const result = getCommandReRoutingRecommendation('cat file.txt', emptyToolsService);
			
			strictEqual(result.shouldReRoute, false);
			strictEqual(result.commandType, 'file-read');
			deepStrictEqual(result.targetFiles, ['file.txt']);
		});

		test('should handle unknown commands', () => {
			const result = getCommandReRoutingRecommendation('unknown-command', mockLanguageModelToolsService);
			
			strictEqual(result.shouldReRoute, false);
			strictEqual(result.commandType, undefined);
		});
	});

	suite('getRecommendedToolsOverRunInTerminal', () => {
		test('should recommend tools for cat command', () => {
			const result = getRecommendedToolsOverRunInTerminal('cat file.txt', mockLanguageModelToolsService);
			
			strictEqual(typeof result, 'string');
			strictEqual(result!.includes('file-reader-tool'), true);
		});

		test('should recommend tools for mkdir command', () => {
			const result = getRecommendedToolsOverRunInTerminal('mkdir directory', mockLanguageModelToolsService);
			
			strictEqual(typeof result, 'string');
			strictEqual(result!.includes('directory-creator-tool'), true);
		});

		test('should recommend tools for python commands', () => {
			const result = getRecommendedToolsOverRunInTerminal('pip install package', mockLanguageModelToolsService);
			
			strictEqual(typeof result, 'string');
			strictEqual(result!.includes('python-tool'), true);
		});

		test('should return undefined for unrecognized commands', () => {
			const result = getRecommendedToolsOverRunInTerminal('unknown-command', mockLanguageModelToolsService);
			
			strictEqual(result, undefined);
		});

		test('should return undefined when no tools are available', () => {
			const emptyToolsService = {
				getTools: () => []
			} as any;
			
			const result = getRecommendedToolsOverRunInTerminal('cat file.txt', emptyToolsService);
			
			strictEqual(result, undefined);
		});
	});
});