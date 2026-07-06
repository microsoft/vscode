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
import { MarkdownString } from '../../../../util/vs/base/common/htmlContent';
import { isWindows } from '../../../../util/vs/base/common/platform';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { CopilotToolMode } from '../../common/toolsRegistry';
import { FindTextInFilesTool } from '../findTextInFilesTool';
import { createMockEndpointProvider, mockLanguageModelChat } from './searchToolTestUtils';

suite('FindTextInFiles', () => {
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

		const searchService = new TestSearchService(patterns);
		collection.define(ISearchService, searchService);
		accessor = collection.createTestingAccessor();
		return searchService;
	}

	test('passes through simple query', async () => {
		setup('*.ts', false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: 'hello', includePattern: '*.ts' }, toolInvocationToken: null!, }, CancellationToken.None);
	});

	test('using **/ correctly', async () => {
		setup('src/**', false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: 'hello', includePattern: 'src/**' }, toolInvocationToken: null!, }, CancellationToken.None);
	});

	test('handles absolute path with glob', async () => {
		setup(new RelativePattern(URI.file(workspaceFolder), 'test/**/*.ts'), false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: 'hello', includePattern: `${workspaceFolder}/test/**/*.ts` }, toolInvocationToken: null!, }, CancellationToken.None);
	});

	test('handles absolute path to folder', async () => {
		setup(new RelativePattern(URI.file(workspaceFolder), ''), false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: 'hello', includePattern: workspaceFolder }, toolInvocationToken: null!, }, CancellationToken.None);
	});

	test('escapes backtick', async () => {
		setup(new RelativePattern(URI.file(workspaceFolder), ''), false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		const prepared = await tool.prepareInvocation({ input: { query: 'hello `world`' }, }, CancellationToken.None);
		expect((prepared?.invocationMessage as any as MarkdownString).value).toMatchInlineSnapshot(`"Searching for regex \`\` hello \`world\` \`\`"`);
	});

	test('prepares invocation message with text for literal search', async () => {
		setup(new RelativePattern(URI.file(workspaceFolder), ''), false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		const prepared = await tool.prepareInvocation({ input: { query: 'hello', isRegexp: false }, }, CancellationToken.None);
		expect((prepared?.invocationMessage as any as MarkdownString).value).toMatchInlineSnapshot(`"Searching for text \`hello\`"`);
	});

	test('retries with plain text when regex yields no results', async () => {
		const searchService = setup('*.ts', false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: '(?:hello)', includePattern: '*.ts' }, toolInvocationToken: null!, }, CancellationToken.None);

		expect(searchService.calls.map(call => call.isRegExp)).toEqual([true, false]);
		expect(searchService.calls.every(call => call.pattern === '(?:hello)')).toBe(true);
	});

	test('does not retry when text pattern is invalid regex', async () => {
		const searchService = setup('*.ts', false);

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: '[', includePattern: '*.ts', isRegexp: false }, toolInvocationToken: null!, }, CancellationToken.None);

		expect(searchService.calls.map(call => call.isRegExp)).toEqual([false]);
	});

	suite('gpt-4.1 model glob pattern', () => {
		test('adds extra pattern for gpt-4.1 model with simple query', async () => {
			setup('src', true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
			const result = await tool.invoke({ input: { query: 'hello', includePattern: 'src' }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});

		test('adds extra pattern for gpt-4.1 with string query ending in /**', async () => {
			setup('src/**', true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
			const result = await tool.invoke({ input: { query: 'hello', includePattern: 'src/**' }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});

		test('adds extra pattern for gpt-4.1 with RelativePattern', async () => {
			setup(new RelativePattern(URI.file(workspaceFolder), 'src'), true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
			const result = await tool.invoke({ input: { query: 'hello', includePattern: `${workspaceFolder}/src` }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});

		test('does not duplicate extra pattern when RelativePattern already ends with /**', async () => {
			setup(new RelativePattern(URI.file(workspaceFolder), 'src/**'), true, 'gpt-4.1');

			const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
			const result = await tool.invoke({ input: { query: 'hello', includePattern: `${workspaceFolder}/src/**` }, toolInvocationToken: null!, model: mockLanguageModelChat }, CancellationToken.None);
			expect(result).toBeDefined();
		});
	});
});

suite('FindTextInFiles - absolute workspace folder path', () => {
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
		const searchService = new RecordingSearchService();
		collection.define(ISearchService, searchService);
		accessor = collection.createTestingAccessor();
		return searchService;
	}

	test('scopes search to workspace folder when absolute path used as includePattern', async () => {
		const searchService = setup();

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: 'hello', includePattern: folder1 }, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastInclude).toHaveLength(1);
		expect(searchService.lastInclude![0]).toMatchObject({ pattern: '' });
		expect((searchService.lastInclude![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('scopes search with glob suffix when includePattern is absolute path with pattern', async () => {
		const searchService = setup();

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: 'hello', includePattern: `${folder1}/**/*.ts` }, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastInclude).toHaveLength(1);
		expect(searchService.lastInclude![0]).toMatchObject({ pattern: '**/*.ts' });
		expect((searchService.lastInclude![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('absolute path survives resolveInput without corruption', async () => {
		const searchService = setup();
		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);

		// Simulate the full pipeline: resolveInput then invoke
		const resolved = await tool.resolveInput({ query: 'hello', includePattern: folder1 }, null!, CopilotToolMode.PartialContext);
		await tool.invoke({ input: resolved, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastInclude).toHaveLength(1);
		expect(searchService.lastInclude![0]).toMatchObject({ pattern: '' });
		expect((searchService.lastInclude![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('absolute path with glob survives resolveInput without corruption', async () => {
		const searchService = setup();
		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);

		const resolved = await tool.resolveInput({ query: 'hello', includePattern: `${folder1}/src/**/*.ts` }, null!, CopilotToolMode.PartialContext);
		await tool.invoke({ input: resolved, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastInclude).toHaveLength(1);
		expect(searchService.lastInclude![0]).toMatchObject({ pattern: 'src/**/*.ts' });
		expect((searchService.lastInclude![0] as RelativePattern).baseUri.path).toBe(URI.file(folder1).path);
	});

	test('passes caseInsensitive option to findTextInFiles2', async () => {
		const searchService = setup();

		const tool = accessor.get(IInstantiationService).createInstance(FindTextInFilesTool);
		await tool.invoke({ input: { query: 'hello', includePattern: '*.ts' }, toolInvocationToken: null! }, CancellationToken.None);

		expect(searchService.lastOptions?.caseInsensitive).toBe(true);
	});
});

interface IRecordedSearchCall {
	readonly pattern: string;
	readonly isRegExp: boolean | undefined;
}

class TestSearchService extends AbstractSearchService {

	public readonly arr1: string[] = [];
	public arr2: readonly string[] = [];

	constructor(private readonly expectedIncludePattern: readonly vscode.GlobPattern[]) {
		super();
	}

	private readonly recordedCalls: IRecordedSearchCall[] = [];

	public get calls(): readonly IRecordedSearchCall[] {
		return this.recordedCalls;
	}

	override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
		throw new Error('Method not implemented.');
	}

	override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
		if (this.expectedIncludePattern.length > 0) {
			const actual = options?.include ?? [];
			expect(actual.length).toBe(this.expectedIncludePattern.length);
			for (let i = 0; i < this.expectedIncludePattern.length; i++) {
				if (typeof this.expectedIncludePattern[i] === 'string') {
					expect(actual[i]).toBe(this.expectedIncludePattern[i]);
				} else {
					const exp = this.expectedIncludePattern[i] as RelativePattern;
					const act = actual[i] as RelativePattern;
					expect(act.pattern).toBe(exp.pattern);
					expect(act.baseUri.path).toBe(exp.baseUri.path);
				}
			}
		}
		this.recordedCalls.push({
			pattern: query.pattern,
			isRegExp: query.isRegExp,
		});
		return {
			complete: Promise.resolve({}),
			results: (async function* () { })()
		};
	}

	override async findFiles(filePattern: vscode.GlobPattern, options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
		throw new Error('Method not implemented.');
	}
}

class RecordingSearchService extends AbstractSearchService {
	public lastInclude: vscode.GlobPattern[] | undefined;
	public lastOptions: vscode.FindTextInFilesOptions2 | undefined;

	override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
		throw new Error('Method not implemented.');
	}

	override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
		this.lastInclude = options?.include ? [...options.include] : undefined;
		this.lastOptions = options;
		return {
			complete: Promise.resolve({}),
			results: (async function* () { })()
		};
	}

	override async findFiles(filePattern: vscode.GlobPattern, options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
		throw new Error('Method not implemented.');
	}
}