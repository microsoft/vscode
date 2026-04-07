/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { RelativePattern } from '../../../../platform/filesystem/common/fileTypes';
import { AbstractSearchService, ISearchService } from '../../../../platform/search/common/searchService';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { isWindows } from '../../../../util/vs/base/common/platform';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { CopilotToolMode } from '../../common/toolsRegistry';
import { FindFilesTool, IFindFilesToolParams } from '../findFilesTool';
import { createMockEndpointProvider, mockLanguageModelChat } from './searchToolTestUtils';

suite('FindFiles', () => {
	let accessor: ITestingServicesAccessor;
	let collection: TestingServiceCollection;

	const workspaceFolder = isWindows ? 'c:\\test\\workspace' : '/test/workspace';

	beforeEach(() => {
		collection = createExtensionUnitTestingServices();
		collection.define(IWorkspaceService, new SyncDescriptor(TestWorkspaceService, [[URI.file(workspaceFolder)]]));
	});

	afterEach(() => {
		accessor.dispose();
	});

	function setup(expected: vscode.GlobPattern, includeExtraPattern = true, modelFamily?: string) {
		if (modelFamily) {
			collection.define(IEndpointProvider, createMockEndpointProvider(modelFamily));
		}

		const patterns: vscode.GlobPattern[] = [expected];
		if (includeExtraPattern) {
			if (typeof expected === 'string' && !expected.endsWith('/**')) {
				patterns.push(expected + '/**');
			} else if (typeof expected !== 'string' && !expected.pattern.endsWith('/**')) {
				patterns.push(new RelativePattern(expected.baseUri, expected.pattern + '/**'));
			}
		}
		collection.define(ISearchService, new TestSearchService(patterns));
		accessor = collection.createTestingAccessor();
	}

	test('passes through simple query', async () => {
		setup('test/**/*.ts', false);

		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
		await tool.invoke({ input: { query: 'test/**/*.ts' }, toolInvocationToken: null!, }, CancellationToken.None);
	});

	test('handles absolute path with glob', async () => {
		setup(new RelativePattern(URI.file(workspaceFolder), 'test/**/*.ts'), false);

		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
		await tool.invoke({ input: { query: `${workspaceFolder}/test/**/*.ts` }, toolInvocationToken: null!, }, CancellationToken.None);
	});

	test('handles absolute path to folder', async () => {
		setup(new RelativePattern(URI.file(workspaceFolder), ''), false);

		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
		await tool.invoke({ input: { query: workspaceFolder }, toolInvocationToken: null!, }, CancellationToken.None);
	});

	suite('gpt-4.1 model glob pattern', () => {
		test('adds extra pattern for gpt-4.1 model with simple query', async () => {
			setup('src', true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
			const result = await tool.invoke({ input: { query: 'src' }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});

		test('adds extra pattern for gpt-4.1 with string query ending in /**', async () => {
			setup('src/**', true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
			const result = await tool.invoke({ input: { query: 'src/**' }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});

		test('adds extra pattern for gpt-4.1 with RelativePattern', async () => {
			setup(new RelativePattern(URI.file(workspaceFolder), 'src'), true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
			const result = await tool.invoke({ input: { query: `${workspaceFolder}/src` }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});

		test('does not duplicate extra pattern when RelativePattern already ends with /**', async () => {
			setup(new RelativePattern(URI.file(workspaceFolder), 'src/**'), true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
			const result = await tool.invoke({ input: { query: `${workspaceFolder}/src/**` }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});
	});

	suite('resolveInput', () => {
		beforeEach(() => {
			setup('hello');
		});

		async function testIt(input: IFindFilesToolParams, context: CopilotToolMode) {
			const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
			const resolved = await tool.resolveInput(input, null!, context);
			expect(resolved).toMatchSnapshot();
		}

		test('resolveInput with FullContext and no maxResults', async () => {
			await testIt({ query: 'hello' }, CopilotToolMode.FullContext);
		});

		test('resolveInput with FullContext and maxResults < 200', async () => {
			await testIt({ query: 'hello', maxResults: 50 }, CopilotToolMode.FullContext);
		});

		test('resolveInput with FullContext and maxResults > 200', async () => {
			await testIt({ query: 'hello', maxResults: 300 }, CopilotToolMode.FullContext);
		});

		test('resolveInput with PartialContext and no maxResults', async () => {
			await testIt({ query: 'hello' }, CopilotToolMode.PartialContext);
		});

		test('resolveInput with PartialContext and maxResults defined', async () => {
			await testIt({ query: 'hello', maxResults: 123 }, CopilotToolMode.PartialContext);
		});
	});
});

suite('FindFiles - absolute workspace folder path', () => {
	let accessor: ITestingServicesAccessor;
	let collection: TestingServiceCollection;

	const folder1 = isWindows ? 'c:\\test\\workspace1' : '/test/workspace1';
	const folder2 = isWindows ? 'c:\\test\\workspace2' : '/test/workspace2';

	beforeEach(() => {
		collection = createExtensionUnitTestingServices();
		collection.define(IWorkspaceService, new SyncDescriptor(TestWorkspaceService, [[URI.file(folder1), URI.file(folder2)]]));
	});

	afterEach(() => {
		accessor.dispose();
	});

	function setup() {
		const searchService = new RecordingFindFilesSearchService();
		collection.define(ISearchService, searchService);
		accessor = collection.createTestingAccessor();
		return searchService;
	}

	test('scopes search to workspace folder when absolute path is used as query', async () => {
		const searchService = setup();

		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
		await tool.invoke({ input: { query: folder1 }, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastFilePattern).toHaveLength(1);
		expect(searchService.lastFilePattern![0]).toMatchObject({ pattern: '' });
		expect((searchService.lastFilePattern![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('scopes search with glob suffix when absolute path includes pattern', async () => {
		const searchService = setup();

		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
		await tool.invoke({ input: { query: `${folder1}/**/*.ts` }, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastFilePattern).toHaveLength(1);
		expect(searchService.lastFilePattern![0]).toMatchObject({ pattern: '**/*.ts' });
		expect((searchService.lastFilePattern![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('absolute path survives resolveInput without corruption', async () => {
		const searchService = setup();
		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);

		const resolved = await tool.resolveInput({ query: folder1 }, null!, CopilotToolMode.PartialContext);
		await tool.invoke({ input: resolved, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastFilePattern).toHaveLength(1);
		expect(searchService.lastFilePattern![0]).toMatchObject({ pattern: '' });
		expect((searchService.lastFilePattern![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('absolute path with glob survives resolveInput without corruption', async () => {
		const searchService = setup();
		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);

		const resolved = await tool.resolveInput({ query: `${folder1}/**/*.ts` }, null!, CopilotToolMode.PartialContext);
		await tool.invoke({ input: resolved, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastFilePattern).toHaveLength(1);
		expect(searchService.lastFilePattern![0]).toMatchObject({ pattern: '**/*.ts' });
		expect((searchService.lastFilePattern![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('passes caseInsensitive option to findFiles', async () => {
		const searchService = setup();

		const tool = accessor.get(IInstantiationService).createInstance(FindFilesTool);
		await tool.invoke({ input: { query: 'src/**/*.ts' }, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastOptions?.caseInsensitive).toBe(true);
	});
});

class TestSearchService extends AbstractSearchService {
	constructor(private readonly expectedPattern: vscode.GlobPattern | vscode.GlobPattern[]) {
		super();
	}

	override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
		throw new Error('Method not implemented.');
	}

	override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
		throw new Error('Method not implemented.');
	}

	override async findFiles(filePattern: vscode.GlobPattern | vscode.GlobPattern[], options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
		// Verify pattern and baseUri paths match structurally
		const expected = Array.isArray(this.expectedPattern) ? this.expectedPattern : [this.expectedPattern];
		const actual = Array.isArray(filePattern) ? filePattern : [filePattern];
		expect(actual.length).toBe(expected.length);
		for (let i = 0; i < expected.length; i++) {
			if (typeof expected[i] === 'string') {
				expect(actual[i]).toBe(expected[i]);
			} else {
				const exp = expected[i] as RelativePattern;
				const act = actual[i] as RelativePattern;
				expect(act.pattern).toBe(exp.pattern);
				expect(act.baseUri.path).toBe(exp.baseUri.path);
			}
		}
		return [];
	}
}

class RecordingFindFilesSearchService extends AbstractSearchService {
	public lastFilePattern: vscode.GlobPattern[] | undefined;
	public lastOptions: vscode.FindFiles2Options | undefined;

	override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
		throw new Error('Method not implemented.');
	}

	override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
		throw new Error('Method not implemented.');
	}

	override async findFiles(filePattern: vscode.GlobPattern | vscode.GlobPattern[], options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
		this.lastFilePattern = Array.isArray(filePattern) ? filePattern : [filePattern];
		this.lastOptions = options;
		return [];
	}
}