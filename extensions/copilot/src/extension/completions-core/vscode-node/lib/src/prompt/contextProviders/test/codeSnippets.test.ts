/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import os from 'os';
import { IIgnoreService } from '../../../../../../../../platform/ignore/common/ignoreService';
import { TestingServiceCollection } from '../../../../../../../../platform/test/node/services';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsFileSystemService } from '../../../fileSystem';
import { createLibTestingContext } from '../../../test/context';
import { FakeFileSystem } from '../../../test/filesystem';
import { MockIgnoreService } from '../../../test/testContentExclusion';
import { SimpleTestTextDocumentManager, TestTextDocumentManager } from '../../../test/textDocument';
import { TextDocumentIdentifier, TextDocumentValidation } from '../../../textDocument';
import { ICompletionsTextDocumentManagerService } from '../../../textDocumentManager';
import { ResolvedContextItem } from '../../contextProviderRegistry';
import { ContextProviderStatistics, ICompletionsContextProviderService } from '../../contextProviderStatistics';
import { TestContextProviderStatistics } from '../../test/contextProviderStatistics';
import { getCodeSnippetsFromContextItems } from '../codeSnippets';
import { CodeSnippetWithId } from '../contextItemSchemas';

suite('codeSnippetsContextProvider', function () {
	let accessor: ServicesAccessor;
	let serviceCollection: TestingServiceCollection;
	let tdm: TestTextDocumentManager;
	let ignoreService: MockIgnoreService;
	const resolvedContextItems: ResolvedContextItem<CodeSnippetWithId>[] = [
		{
			providerId: 'testCodeSnippetsProvider1',
			matchScore: 1,
			resolution: 'full',
			resolutionTimeMs: 10,
			data: [
				{
					uri: 'file:///foo.js',
					value: 'foovalue',
					additionalUris: ['file:///foo2.js'],
					id: '1',
					type: 'CodeSnippet',
				},
				{
					uri: 'file:///bar.js',
					value: 'barvalue',
					id: '2',
					type: 'CodeSnippet',
				},
				// Multiple snippets for the same file are allowed
				{
					uri: 'file:///bar.js',
					value: 'anotherbarvalue',
					id: '3',
					type: 'CodeSnippet',
				},
			],
		},
		{
			providerId: 'testCodeSnippetsProvider2',
			matchScore: 1,
			resolution: 'full',
			resolutionTimeMs: 10,
			data: [
				{ uri: 'file:///baz.js', value: 'bazvalue', id: '4', type: 'CodeSnippet' },
				{ uri: 'file:///maybe.js', value: 'maybevalue', id: '5', type: 'CodeSnippet' },
			],
		},
	];

	setup(function () {
		serviceCollection = createLibTestingContext();
		serviceCollection.define(IIgnoreService, new MockIgnoreService());
		accessor = serviceCollection.createTestingAccessor();

		ignoreService = accessor.get(IIgnoreService) as MockIgnoreService;
		tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.setTextDocument('file:///foo.js', 'javascript', 'doesntmatter');
		tdm.setTextDocument('file:///bar.js', 'javascript', 'doesntmatter');
		tdm.setTextDocument('file:///baz.js', 'javascript', 'doesntmatter');
		tdm.setTextDocument('file:///foo2.js', 'javascript', 'doesntmatter');
	});

	test('can get code snippets from context text providers and flattens them', async function () {
		const codeSnippets = await getCodeSnippetsFromContextItems(
			accessor,
			'COMPLETION_ID',
			resolvedContextItems,
			'javascript'
		);

		assert.deepStrictEqual(codeSnippets.length, 5);
		assert.deepStrictEqual(
			codeSnippets.map(t => t.value),
			['foovalue', 'barvalue', 'anotherbarvalue', 'bazvalue', 'maybevalue']
		);
	});

	test('set expectations for contextProviderStatistics', async function () {
		const statistics = new TestContextProviderStatistics();
		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsContextProviderService, new ContextProviderStatistics(() => statistics));
		const accessor = serviceCollectionClone.createTestingAccessor();

		await getCodeSnippetsFromContextItems(accessor, 'COMPLETION_ID', resolvedContextItems, 'javascript');

		assert.deepStrictEqual(statistics.expectations.size, 2);

		const expectations = statistics.expectations.get('testCodeSnippetsProvider1');
		assert.ok(expectations);
		assert.deepStrictEqual(expectations, [
			[
				{
					uri: 'file:///foo.js',
					value: 'foovalue',
					additionalUris: ['file:///foo2.js'],
					id: '1',
					type: 'CodeSnippet',
				},
				'included',
			],
			[{ uri: 'file:///bar.js', value: 'barvalue', id: '2', type: 'CodeSnippet' }, 'included'],
			[{ uri: 'file:///bar.js', value: 'anotherbarvalue', id: '3', type: 'CodeSnippet' }, 'included'],
		]);

		const expectations2 = statistics.expectations.get('testCodeSnippetsProvider2');
		assert.ok(expectations2);
		assert.deepStrictEqual(expectations2, [
			[{ uri: 'file:///baz.js', value: 'bazvalue', id: '4', type: 'CodeSnippet' }, 'included'],
			[{ uri: 'file:///maybe.js', value: 'maybevalue', id: '5', type: 'CodeSnippet' }, 'included'],
		]);
	});

	test('content excluded files are not returned', async function () {
		// maybe.js is set but not content excluded
		tdm.setTextDocument('file:///maybe.js', 'javascript', 'doesntmatter');

		const codeSnippets = await getCodeSnippetsFromContextItems(
			accessor,
			'COMPLETION_ID',
			resolvedContextItems,
			'javascript'
		);

		assert.deepStrictEqual(codeSnippets.length, 5);
		assert.ok(codeSnippets.map(t => t.uri).includes('file:///maybe.js'));

		// If it's content excluded, it's not returned
		ignoreService.setBlockListUris(['file:///maybe.js']);
		const codeSnippetsAfterExclusion = await getCodeSnippetsFromContextItems(
			accessor,
			'COMPLETION_ID',
			resolvedContextItems,
			'javascript'
		);

		assert.deepStrictEqual(codeSnippetsAfterExclusion.length, 4);
		assert.ok(!codeSnippetsAfterExclusion.map(t => t.uri).includes('file:///maybe.js'));
	});

	test('documents can be read from the file system,', async function () {
		// The additionalUri for the code snippet is not open, so we create a fake file system
		// entry depending on the OS to test the normalization of the URI.
		const drive = os.platform() === 'win32' ? 'c:' : '';
		const uriPrefix = os.platform() === 'win32' ? 'file:///c:' : 'file://';
		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(
			ICompletionsFileSystemService,
			new FakeFileSystem({
				[`${drive}/fake2.js`]: 'content',
			})
		);

		// Use a SimpleTestTextDocumentManager to read from the FakeFileSystem
		const tdm = accessor.get(IInstantiationService).createInstance(SimpleTestTextDocumentManager);
		serviceCollectionClone.define(ICompletionsTextDocumentManagerService, tdm);
		const accessorClone = serviceCollectionClone.createTestingAccessor();

		const additionalUri = `${uriPrefix}/fake2.js`;

		// Set the main uri as an open file
		const mainUri = `${uriPrefix}/fake.js`;
		tdm.setTextDocument(mainUri, 'javascript', 'doesntmatter');

		const resolvedContextItems: ResolvedContextItem<CodeSnippetWithId>[] = [
			{
				providerId: 'testCodeSnippetsProvider1',
				matchScore: 1,
				resolution: 'full',
				resolutionTimeMs: 10,
				data: [
					{
						uri: mainUri,
						value: 'foovalue',
						additionalUris: [additionalUri],
						id: '1',
						type: 'CodeSnippet',
					},
				],
			},
		];

		const codeSnippets = await getCodeSnippetsFromContextItems(
			accessorClone,
			'COMPLETION_ID',
			resolvedContextItems,
			'javascript'
		);

		assert.deepStrictEqual(codeSnippets.length, 1);
	});

	test('content exclusion does not check multiple times', async function () {
		const serviceCollectionClone = serviceCollection.clone();
		const tdm = accessor.get(IInstantiationService).createInstance(FakeTextDocumentManager);
		serviceCollectionClone.define(ICompletionsTextDocumentManagerService, tdm);
		const accessorClone = serviceCollectionClone.createTestingAccessor();

		await getCodeSnippetsFromContextItems(accessorClone, 'COMPLETION_ID', resolvedContextItems, 'javascript');
		const uris = resolvedContextItems.map(t => t.data.flatMap(d => [d.uri, ...(d.additionalUris ?? [])])).flat();
		assert.ok(uris.length > tdm.checkedUris.length);
		assert.deepStrictEqual(tdm.checkedUris.length, new Set(tdm.checkedUris).size);
	});

	test('files are not returned if any of their additionalUris are excluded', async function () {
		ignoreService.setBlockListUris(['file:///foo2.js']);
		const codeSnippets = await getCodeSnippetsFromContextItems(
			accessor,
			'COMPLETION_ID',
			resolvedContextItems,
			'javascript'
		);

		assert.deepStrictEqual(codeSnippets.length, 4);
		assert.ok(!codeSnippets.map(t => t.uri).includes('file:///foo.js'));
	});

	test('documents do not have to be open', async function () {
		tdm.setDiskContents('file:///maybe.js', 'doesntmatter');

		const codeSnippets = await getCodeSnippetsFromContextItems(
			accessor,
			'COMPLETION_ID',
			resolvedContextItems,
			'javascript'
		);

		assert.deepStrictEqual(codeSnippets.length, 5);
		assert.ok(codeSnippets.map(t => t.uri).includes('file:///maybe.js'));
	});
});

class FakeTextDocumentManager extends TestTextDocumentManager {
	checkedUris: string[] = [];

	override getTextDocumentValidation(docId: TextDocumentIdentifier): Promise<TextDocumentValidation> {
		this.checkedUris.push(docId.uri);
		return Promise.resolve({ status: 'valid' });
	}
}
