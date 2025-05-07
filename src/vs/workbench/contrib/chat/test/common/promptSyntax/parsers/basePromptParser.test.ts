/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: @legomushroom
import assert from 'assert';
import { spy } from 'sinon';
import { URI } from '../../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { TPromptReference } from '../../../../common/promptSyntax/parsers/types.js';
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
import { IPromptContentsProvider } from '../../../../common/promptSyntax/contentProviders/types.js';
import { PromptContentsProviderBase } from '../../../../common/promptSyntax/contentProviders/promptContentsProviderBase.js';
import { VSBuffer, VSBufferReadableStream } from '../../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { randomInt } from '../../../../../../../base/common/numbers.js';
import { ObjectStream } from '../../../../../../../editor/common/codecs/utils/objectStream.js';
import { assertReferencesEqual } from './textModelPromptParser.test.js';
import { ExpectedReference } from '../testUtils/expectedReference.js';

/**
		 * TODO: @legomushroom
		 */
class TestContentsProvider extends PromptContentsProviderBase<object> {
	protected override async getContentsStream(
		_changesEvent: object | 'full',
		_cancellationToken?: CancellationToken,
	): Promise<VSBufferReadableStream> {
		return await this.getContentsStreamPromise.p;
	}

	// TODO: @legomushroom
	private getContentsStreamPromise = new DeferredPromise<VSBufferReadableStream>();

	public resolveContentsStream(
		contentsStream: VSBufferReadableStream,
	): this {
		this.getContentsStreamPromise.complete(contentsStream);
		this.getContentsStreamPromise = new DeferredPromise<VSBufferReadableStream>();

		return this;
	}

	constructor(
		public override readonly uri: URI,
	) {
		super({});
	}

	public override createNew(promptContentsSource: { uri: URI }): IPromptContentsProvider {
		return new TestContentsProvider(promptContentsSource.uri);
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

/**
 * TODO: @legomushroom
 */
class TestPromptParser extends BasePromptParser<TestContentsProvider> {
	/**
	 * TODO: @legomushroom
	 */
	public addReferences(
		references: TPromptReference[],
	): this {
		this._references.push(...references);

		return this;
	}
}

/**
 * TODO: @legomushroom
 */
class TestObjectStream<T extends object> extends ObjectStream<VSBuffer> {
	public static fromStrings(
		strings: string[],
		endOfLine: '\n' | '\r\n' = '\n',
	): ObjectStream<VSBuffer> {
		return ObjectStream.fromArray(
			strings.map((str) => {
				return VSBuffer.fromString(`${str}${endOfLine}`);
			}),
		);
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
					TestPromptParser,
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

			contentsProvider.resolveContentsStream(stream);

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
});
