/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: @legomushroom
import assert from 'assert';
import { spy } from 'sinon';
import { URI } from '../../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { NullPolicyService } from '../../../../../../../platform/policy/common/policy.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { wait } from '../../../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID } from '../../../../common/promptSyntax/constants.js';
import { ConfigurationService } from '../../../../../../../platform/configuration/common/configurationService.js';
import { INSTRUCTION_FILE_EXTENSION, PROMPT_FILE_EXTENSION } from '../../../../../../../platform/prompts/common/constants.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { BasePromptParser } from '../../../../common/promptSyntax/parsers/basePromptParser.js';
import { PromptContentsProviderBase } from '../../../../common/promptSyntax/contentProviders/promptContentsProviderBase.js';
import { VSBuffer, VSBufferReadableStream } from '../../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { randomInt } from '../../../../../../../base/common/numbers.js';
import { arrayToGenerator, ObjectStream } from '../../../../../../../editor/common/codecs/utils/objectStream.js';
import { assertReferencesEqual } from './textModelPromptParser.test.js';
import { ExpectedReference } from '../testUtils/expectedReference.js';
import { TTree } from '../../../../common/promptSyntax/utils/treeUtils.js';
import { OpenFailed, RecursiveReference } from '../../../../common/promptFileReferenceErrors.js';

/**
 * TODO: @legomushroom
 */
class Test extends Disposable { }

/**
 * TODO: @legomushroom
 */
const asTreeNode = <T extends object>(
	item: T,
	children: readonly TTree<T>[],
): TTree<T> => {
	return new Proxy(item, {
		get(target, prop, receiver) {
			if (prop === 'children') {
				return children;
			}

			// TODO: @legomushroom
			if (prop === '__debug') {
				return 'tree-node-proxy';
			}

			const result = Reflect.get(target, prop);
			// if (typeof result === 'function') {
			// 	return result.bind(target);
			// }

			return result;
		},
		// TODO: @legomushroom - comment about the type assertion
	}) as TTree<T>;
};

/**
 * TODO: @legomushroom
 */
const resolveAllStreams = async (
	parserTree: TTree<BasePromptParser<TestContentsProvider>>,
	streamTree: TTree<TestObjectStream | Error>,
) => {
	await parserTree.provider.resolveContentsStream(streamTree);
	await parserTree.settled();

	const parserChildren = parserTree.children ?? [];
	const streamChildren = streamTree.children ?? [];

	assert.strictEqual(
		parserChildren.length,
		streamChildren.length,
		'The number of child parsers and streams must be the same.',
	);

	// resolve streams of all child parsers recursively
	await Promise.all(
		parserChildren.map((parserChild, index) => {
			return resolveAllStreams(parserChild, streamChildren[index]);
		}),
	);
};

/**
 * TODO: @legomushroom
 */
class TestContentsProvider extends PromptContentsProviderBase<object> {
	// /**
	//  * TODO: @legomushroom
	//  */
	// private readonly childProviders: TestContentsProvider[] = [];

	// /**
	//  * TODO: @legomushroom
	//  */
	// public get children(): readonly TestContentsProvider[] {
	// 	return this.childProviders;
	// }

	// TODO: @legomushroom
	private getContentsStreamPromise = new DeferredPromise<VSBufferReadableStream>();

	protected override async getContentsStream(
		_changesEvent: object | 'full',
		_cancellationToken?: CancellationToken,
	): Promise<VSBufferReadableStream> {
		return await this.getContentsStreamPromise.p;
	}

	/**
	 * TODO: @legomushroom
	 */
	public async resolveContentsStream(
		contentsStream: TestObjectStream | Error,
	): Promise<this> {
		setTimeout(() => {
			if (contentsStream instanceof Error) {
				this.getContentsStreamPromise.error(contentsStream);

			} else {
				this.getContentsStreamPromise.complete(contentsStream);
			}

			this.getContentsStreamPromise = new DeferredPromise<VSBufferReadableStream>();
		});

		try {
			await this.getContentsStreamPromise.p;
		} catch {
			// ignore
		}

		return this;
	}

	constructor(
		public override readonly uri: URI,
	) {
		super({});
	}

	public override createNew(promptContentsSource: { uri: URI }): TestContentsProvider {
		return new TestContentsProvider(promptContentsSource.uri);
		// TODO: @legomushroom
		// const provider = new TestContentsProvider(promptContentsSource.uri);

		// this.childProviders.push(provider);

		// return provider;
	}

	public override get languageId(): string {
		return PROMPT_LANGUAGE_ID;
	}

	public override get sourceName(): string {
		return 'TestContentsProvider';
	}

	public override toString(): string {
		return `TestContentsProvider(${this.uri.path})`;
	}
}

// /**
//  * TODO: @legomushroom
//  */
// class TestPromptParser extends BasePromptParser<TestContentsProvider> {
// 	/**
// 	 * TODO: @legomushroom
// 	 */
// 	public async resolveContentsStream(
// 		contentsStream: VSBufferReadableStream,
// 	): Promise<this> {
// 		await this.promptContentsProvider
// 			.resolveContentsStream(contentsStream);

// 		return this;
// 	}

// 	// /**
// 	//  * TODO: @legomushroom
// 	//  */
// 	// public override get children(): readonly TestPromptParser[] {
// 	// 	// TODO: @legomushroom
// 	// 	throw new Error('Method not implemented.');
// 	// 	// // TODO: @legomushroom - fix type assertion
// 	// 	// return (this.references as readonly TestPromptParser[]);
// 	// }

// 	// TODO: @legomushroom
// 	// protected override getPromptReferenceClass() {
// 	// 	return TestPromptReference;
// 	// }
// }

// // /**
// //  * TODO: @legomushroom
// //  */
// // class TestPromptReference extends TestPromptParser implements TPromptReference {
// // 	public readonly type: 'file' = 'file';
// // 	public readonly subtype: 'prompt' | 'markdown' = 'prompt';
// // 	range: Range;
// // 	linkRange: IRange | undefined;
// // 	text: string;
// // 	path: string;
// // 	// /**
// // 	//  * TODO: @legomushroom
// // 	//  */
// // 	// public async resolveContentsStream(
// // 	// 	contentsStream: VSBufferReadableStream,
// // 	// ): Promise<this> {
// // 	// 	await this.promptContentsProvider
// // 	// 		.resolveContentsStream(contentsStream);

// // 	// 	return this;
// // 	// }

// // 	// /**
// // 	//  * TODO: @legomushroom
// // 	//  */
// // 	// public get children(): readonly TestPromptReference[] {
// // 	// 	// TODO: @legomushroom - fix type assertion
// // 	// 	return (this.references as readonly TestPromptReference[]);
// // 	// }

// // 	// protected override getPromptReferenceClass() {
// // 	// 	return TestPromptReference;
// // 	// }
// // }

/**
 * TODO: @legomushroom
 */
class TestObjectStream extends ObjectStream<VSBuffer> {
	// TODO: @legomushroom
	constructor(
		private readonly data: Generator<T, undefined>,
		private readonly cancellationToken?: CancellationToken,
	) {
		super(data, cancellationToken);
	}

	public static fromStrings(
		strings: string[],
		endOfLine: '\n' | '\r\n' = '\n',
	): ObjectStream<VSBuffer> {
		const buffers = strings.map((str) => {
			return VSBuffer.fromString(`${str}${endOfLine}`);
		});

		return new TestObjectStream(arrayToGenerator(buffers));
	}

	/**
	 * TODO: @legomushroom
	 */
	public override dispose(): void {
		super.dispose();
	}
}

suite('BasePromptParser', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;
	setup(async () => {
		// TODO: @legomushroom - cleanup?
		const nullPolicyService = new NullPolicyService();
		const nullLogService = disposables.add(new NullLogService());
		const nullFileService = disposables.add(new FileService(nullLogService));
		const nullConfigService = disposables.add(new ConfigurationService(
			URI.file('/config.json'),
			nullFileService,
			nullPolicyService,
			nullLogService,
		));
		instaService = disposables.add(new TestInstantiationService());

		instaService.stub(IFileService, nullFileService);
		instaService.stub(ILogService, nullLogService);
		instaService.stub(IConfigurationService, nullConfigService);
		instaService.stub(IModelService, { getModel() { return null; } });
		instaService.stub(ILanguageService, {
			guessLanguageIdByFilepathOrFirstLine(uri: URI) {
				if (uri.path.endsWith(PROMPT_FILE_EXTENSION)) {
					return PROMPT_LANGUAGE_ID;
				}

				if (uri.path.endsWith(INSTRUCTION_FILE_EXTENSION)) {
					return INSTRUCTIONS_LANGUAGE_ID;
				}

				return null;
			}
		});
	});

	suite(`• 'onSettled' event`, () => {
		test('• called when parsing is settled', async () => {
			const promptFileUri = URI.file('/some/path/test.prompt.md');

			const contentsProvider = disposables.add(
				instaService.createInstance(TestContentsProvider, promptFileUri),
			);

			const parser = disposables.add(
				instaService.createInstance(
					BasePromptParser,
					contentsProvider,
					{},
				),
			);

			const onSettled = spy();
			disposables.add(parser.onSettled(onSettled));

			await wait(randomInt(10, 5));

			assert(
				onSettled.getCalls().length === 0,
				'The event must not be called before the contents stream is resolved.',
			);

			parser.start();

			await wait(randomInt(10, 5));

			assert(
				onSettled.getCalls().length === 0,
				'The event must not be called before the contents stream is resolved.',
			);

			assert.deepStrictEqual(
				parser.metadata,
				{},
				'Must have empty metadata.',
			);

			const stream = TestObjectStream.fromStrings([
				'---',
				'description: \'Description of my prompt.\'',
				'---',
				'## Files',
				'\t- this file #file:folder1/file3.prompt.md ',
				'\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
				' ',
			]);

			await contentsProvider.resolveContentsStream(stream);

			// TODO: @legomushroom - remove?
			await wait(randomInt(10, 5));

			assert(
				onSettled.getCalls().length === 1,
				'The event must be called after contents stream is resolved.',
			);

			assert.deepStrictEqual(
				onSettled.getCalls()[0].args,
				[undefined],
				'The event must be called with the correct arguments.',
			);

			// TODO: @legomushroom  - test 'header.settled' ?
			const { metadata } = parser;

			assert.deepStrictEqual(
				metadata,
				{
					description: 'Description of my prompt.',
					applyTo: undefined,
					tools: undefined,
					mode: undefined,
				},
				'Must have correct metadata.',
			);

			assertReferencesEqual(
				parser.references,
				[
					new ExpectedReference({
						uri: URI.joinPath(promptFileUri, '../folder1/file3.prompt.md'),
						text: '#file:folder1/file3.prompt.md',
						path: 'folder1/file3.prompt.md',
						startLine: 5,
						startColumn: 14,
						pathStartColumn: 14 + 6,
						childrenOrError: undefined,
						// TODO: @legomushroom
						// childrenOrError: new OpenFailed(URI.joinPath(promptFileUri, '../folder1/file3.prompt.md'), 'File not found.'),
					}),
					new ExpectedReference({
						uri: URI.joinPath(promptFileUri, '../folder1/some-other-folder/file4.prompt.md'),
						text: '[file4.prompt.md](./folder1/some-other-folder/file4.prompt.md)',
						path: './folder1/some-other-folder/file4.prompt.md',
						startLine: 6,
						startColumn: 14,
						pathStartColumn: 14 + 18,
						childrenOrError: undefined,
						// TODO: @legomushroom
						// childrenOrError: new OpenFailed(URI.joinPath(promptFileUri, '../folder1/file3.prompt.md'), 'File not found.'),
					}),
				],
			);
		});
	});

	suite(`• 'onAllSettled' event`, () => {
		test('• called when parsing of entire prompt tree is settled', async () => {
			const promptFileUri = URI.file('/some/path/test.prompt.md');

			const contentsProvider = disposables.add(
				instaService.createInstance(TestContentsProvider, promptFileUri),
			);

			const parser = disposables.add(
				instaService.createInstance(
					BasePromptParser,
					contentsProvider,
					{},
				),
			);

			const onAllSettled = spy();
			disposables.add(parser.onAllSettled(onAllSettled));

			await wait(randomInt(10, 5));

			assert(
				onAllSettled.getCalls().length === 0,
				'The event must not be called before the contents stream is resolved.',
			);

			parser.start();

			await wait(randomInt(10, 5));

			assert(
				onAllSettled.getCalls().length === 0,
				'The event must not be called before the contents stream is resolved.',
			);

			assert.deepStrictEqual(
				parser.metadata,
				{},
				'Must have empty metadata.',
			);

			await resolveAllStreams(
				// TODO: @legomushroom - remove the type assertion?
				parser as TTree<BasePromptParser<TestContentsProvider>>,
				asTreeNode<TestObjectStream | Error>(
					TestObjectStream.fromStrings([
						'---',
						'description: \'Description of my prompt.\'',
						'---',
						'## Files',
						'\t- this file #file:folder1/file3.prompt.md ',
						'\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
						'\t- and [another link](../path/test.prompt.md) please!',
						' ',
					]),
					[
						new OpenFailed(URI.joinPath(promptFileUri, '../folder1/file3.prompt.md'), 'File not found.'),
						TestObjectStream.fromStrings([]),
						new RecursiveReference(promptFileUri, new Array(2).fill(promptFileUri.path)),
					],
				),
			);

			// TODO: @legomushroom - remove?
			// await wait(randomInt(10, 5));

			assert(
				onAllSettled.getCalls().length === 1,
				'The event must be called after contents stream is resolved.',
			);

			assert.deepStrictEqual(
				onAllSettled.getCalls()[0].args,
				[undefined],
				'The event must be called with the correct arguments.',
			);

			// TODO: @legomushroom - test 'header.settled' ?
			const { metadata } = parser;

			assert.deepStrictEqual(
				metadata,
				{
					description: 'Description of my prompt.',
					applyTo: undefined,
					tools: undefined,
					mode: undefined,
				},
				'Must have correct metadata.',
			);

			// assertReferencesEqual(
			// 	parser.references,
			// 	[
			// 		new ExpectedReference({
			// 			uri: URI.joinPath(promptFileUri, '../folder1/file3.prompt.md'),
			// 			text: '#file:folder1/file3.prompt.md',
			// 			path: 'folder1/file3.prompt.md',
			// 			startLine: 5,
			// 			startColumn: 14,
			// 			pathStartColumn: 14 + 6,
			// 			childrenOrError: new OpenFailed(URI.joinPath(promptFileUri, '../folder1/file3.prompt.md'), 'File not found.'),
			// 		}),
			// 		new ExpectedReference({
			// 			uri: URI.joinPath(promptFileUri, '../folder1/some-other-folder/file4.prompt.md'),
			// 			text: '[file4.prompt.md](./folder1/some-other-folder/file4.prompt.md)',
			// 			path: './folder1/some-other-folder/file4.prompt.md',
			// 			startLine: 6,
			// 			startColumn: 14,
			// 			pathStartColumn: 14 + 18,
			// 			childrenOrError: undefined,
			// 			// TODO: @legomushroom
			// 			// childrenOrError: new OpenFailed(URI.joinPath(promptFileUri, '../folder1/file3.prompt.md'), 'File not found.'),
			// 		}),
			// 	],
			// );
		});
	});
});
