/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Uri } from 'vscode';
import { URI, Utils as extUri } from 'vscode-uri';

import { createTestFolder, mock } from '../testUtils';
import { services } from '../../services';
import { Range } from '../../utils/vscode';
import { waitRandom } from '../../utils/wait';
import { randomBoolean } from '../../utils/randomBoolean';
import { IPromptFileReference } from '../../parsers/types';
import { FileReference } from '../../codecs/promptCodec/tokens';
import { TErrorCondition } from '../../parsers/promptParserBase';
import { FilePromptParser } from '../../parsers/filePromptParser';
import { IFileSystemService, ILogService } from '../../services/types';
import { ObservableDisposable } from '../../utils/vscode/observableDisposable';
import { FolderReference, NotPromptFile, OpenFailed, RecursiveReference } from '../../parsers/errors';

/**
 * Represents a file reference with an expected
 * error condition value for testing purposes.
 */
class ExpectedReference {
	/**
	 * URI component of the expected reference.
	 */
	public readonly uri: URI;

	constructor(
		dirname: URI,
		public readonly lineToken: FileReference,
		public readonly errorCondition?: TErrorCondition,
	) {
		this.uri = extUri.resolvePath(dirname, lineToken.path);
	}

	/**
	 * String representation of the expected reference.
	 */
	public toString(): string {
		return `file-prompt:${this.uri.path}`;
	}
}

/**
 * A reusable test utility to test the `PromptFileReference` class.
 */
class TestPromptFileReference extends ObservableDisposable {
	constructor(
		private readonly fileStructure: mock.IMockFolder[],
		private readonly rootFileUri: URI,
		private readonly expectedReferences: ExpectedReference[],
		private readonly filesystemService: IFileSystemService,
		private readonly logService: ILogService,
	) {
		super();
	}

	/**
	 * Run the test.
	 */
	public async run() {
		// create the files structure on the disk
		await new mock.MockFilesystem(this.fileStructure, this.filesystemService).mock();

		// randomly test with and without delay to ensure that the file
		// reference resolution is not susceptible to race conditions
		if (randomBoolean()) {
			await waitRandom(5);
		}

		// start resolving references for the specified root file
		const rootReference = this._register(new FilePromptParser(
			this.rootFileUri,
			[],
			this.filesystemService,
			this.logService,
		)).start();

		// wait until entire prompts tree is resolved
		await rootReference.allSettled();

		// resolve the root file reference including all nested references
		const resolvedReferences: readonly (IPromptFileReference | undefined)[] = rootReference.allReferences;

		for (let i = 0; i < this.expectedReferences.length; i++) {
			const expectedReference = this.expectedReferences[i];
			const resolvedReference = resolvedReferences[i];

			assert(
				(resolvedReference) &&
				(resolvedReference.uri.toString() === expectedReference.uri.toString()),
				[
					`Expected ${i}th resolved reference URI to be '${expectedReference.uri}'`,
					`got '${resolvedReference?.uri}'.`,
				].join(', '),
			);

			if (expectedReference.errorCondition === undefined) {
				assert(
					resolvedReference.errorCondition === undefined,
					[
						`Expected ${i}th error condition to be 'undefined'`,
						`got '${resolvedReference.errorCondition}'.`,
					].join(', '),
				);
				continue;
			}

			assert(
				expectedReference.errorCondition.equal(resolvedReference.errorCondition),
				[
					`Expected ${i}th error condition to be '${expectedReference.errorCondition}'`,
					`got '${resolvedReference.errorCondition}'.`,
				].join(', '),
			);
		}

		assert.strictEqual(
			resolvedReferences.length,
			this.expectedReferences.length,
			[
				`\nExpected(${this.expectedReferences.length}): [\n ${this.expectedReferences.join('\n ')}\n]`,
				`Received(${resolvedReferences.length}): [\n ${resolvedReferences.join('\n ')}\n]`,
			].join('\n')
		);
	}
}

/**
 * Create expected file reference for testing purposes.
 *
 * Note! This utility also use for `markdown links` at the moment.
 *
 * @param filePath The expected path of the file reference (without the `#file:` prefix).
 * @param lineNumber The expected line number of the file reference.
 * @param startColumnNumber The expected start column number of the file reference.
 */
const createTestFileReference = (
	filePath: string,
	lineNumber: number,
	startColumnNumber: number,
): FileReference => {
	const range = new Range(
		lineNumber,
		startColumnNumber,
		lineNumber,
		startColumnNumber + `#file:${filePath}`.length,
	);

	return new FileReference(range, filePath);
};

suite('PromptFileReference', () => {
	const testsRootFolder = createTestFolder('prompt-file-reference-unit-test');

	test('• resolves nested file references', async function () {
		const rootUri = Uri.joinPath(testsRootFolder, 'resolves-nested-file-references-test');

		const test = new TestPromptFileReference(
			/**
			 * The file structure to be created on the disk for the test.
			 */
			[{
				name: rootUri.path,
				children: [
					{
						name: 'file1.prompt.md',
						contents: '## Some Header\nsome contents\n ',
					},
					{
						name: 'file2.prompt.md',
						contents: '## Files\n\t- this file #file:folder1/file3.prompt.md \n\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!\n ',
					},
					{
						name: 'folder1',
						children: [
							{
								name: 'file3.prompt.md',
								contents: `\n[](./some-other-folder/non-existing-folder)\n\t- some seemingly random #file:${rootUri.path}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md contents\n some more\t content`,
							},
							{
								name: 'some-other-folder',
								children: [
									{
										name: 'file4.prompt.md',
										contents: 'this file has a non-existing #file:./some-non-existing/file.prompt.md\t\treference\n\n\nand some\n non-prompt #file:./some-non-prompt-file.md\t\t \t[](../../folder1/)\t',
									},
									{
										name: 'file.txt',
										contents: 'contents of a non-prompt-snippet file',
									},
									{
										name: 'yetAnotherFolder🤭',
										children: [
											{
												name: 'another-file.prompt.md',
												contents: `[](${rootUri.path}/folder1/some-other-folder)\nanother-file.prompt.md contents\t [#file:file.txt](../file.txt)`,
											},
											{
												name: 'one_more_file_just_in_case.prompt.md',
												contents: 'one_more_file_just_in_case.prompt.md contents',
											},
										],
									},
								],
							},
						],
					},
				],
			}],
			/**
			 * The root file path to start the resolve process from.
			 */
			Uri.joinPath(rootUri, 'file2.prompt.md'),
			/**
			 * The expected references to be resolved.
			 */
			[
				new ExpectedReference(
					rootUri,
					createTestFileReference('folder1/file3.prompt.md', 2, 14),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1'),
					createTestFileReference(
						`./some-other-folder/non-existing-folder`,
						2,
						1,
					),
					new OpenFailed(
						Uri.joinPath(rootUri, './folder1/some-other-folder/non-existing-folder'),
						'Reference to non-existing file cannot be opened.',
					),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1'),
					createTestFileReference(
						`${rootUri.path}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md`,
						3,
						26,
					),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('.', 1, 1),
					new FolderReference(
						Uri.joinPath(rootUri, './folder1/some-other-folder'),
						'This folder is not a prompt file!',
					),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1/some-other-folder/yetAnotherFolder🤭'),
					createTestFileReference('../file.txt', 2, 35),
					new NotPromptFile(
						Uri.joinPath(rootUri, './folder1/some-other-folder/file.txt'),
						'Ugh oh, that is not a prompt file!',
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference('./folder1/some-other-folder/file4.prompt.md', 3, 14),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('./some-non-existing/file.prompt.md', 1, 30),
					new OpenFailed(
						Uri.joinPath(rootUri, './folder1/some-other-folder/some-non-existing/file.prompt.md'),
						'Failed to open non-existing prompt snippets file',
					),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('./some-non-prompt-file.md', 5, 13),
					new OpenFailed(
						Uri.joinPath(rootUri, './folder1/some-other-folder/some-non-prompt-file.md'),
						'Oh no!',
					),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './some-other-folder/folder1'),
					createTestFileReference('../../folder1', 5, 48),
					new FolderReference(
						Uri.joinPath(rootUri, './folder1'),
						'Ugh ohh!',
					),
				),
			],
			services.filesystemService,
			services.logService,
		);

		await test.run();
	});

	test('• does not fall into infinite reference recursion', async function () {
		const rootUri = Uri.joinPath(testsRootFolder, 'infinite-recursion-test');

		const test = new TestPromptFileReference(
			/**
			 * The file structure to be created on the disk for the test.
			 */
			[{
				name: rootUri.path,
				children: [
					{
						name: 'file1.md',
						contents: '## Some Header\nsome contents\n ',
					},
					{
						name: 'file2.prompt.md',
						contents: `## Files\n\t- this file #file:folder1/file3.prompt.md \n\t- also this #file:./folder1/some-other-folder/file4.prompt.md\n\n#file:${rootUri.path}/folder1/some-other-folder/file5.prompt.md\t please!\n\t[some (snippet!) #name))](./file1.md)`,
					},
					{
						name: 'folder1',
						children: [
							{
								name: 'file3.prompt.md',
								contents: `\n\n\t- some seemingly random [another-file.prompt.md](${rootUri.path}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md) contents\n some more\t content`,
							},
							{
								name: 'some-other-folder',
								children: [
									{
										name: 'file4.prompt.md',
										contents: 'this file has a non-existing #file:../some-non-existing/file.prompt.md\t\treference',
									},
									{
										name: 'file5.prompt.md',
										contents: 'this file has a relative recursive #file:../../file2.prompt.md\nreference\n ',
									},
									{
										name: 'yetAnotherFolder🤭',
										children: [
											{
												name: 'another-file.prompt.md',
												// absolute path with recursion
												contents: `some test goes\t\nhere #file:${rootUri.path}/file2.prompt.md`,
											},
											{
												name: 'one_more_file_just_in_case.prompt.md',
												contents: 'one_more_file_just_in_case.prompt.md contents',
											},
										],
									},
								],
							},
						],
					},
				],
			}],
			/**
			 * The root file path to start the resolve process from.
			 */
			Uri.joinPath(rootUri, 'file2.prompt.md'),
			/**
			 * The expected references to be resolved.
			 */
			[
				new ExpectedReference(
					rootUri,
					createTestFileReference('folder1/file3.prompt.md', 2, 9),
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1'),
					createTestFileReference(
						`${rootUri.path}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md`,
						3,
						23,
					),
				),
				/**
				 * This reference should be resolved with a recursive
				 * reference error condition. (the absolute reference case)
				 */
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1/some-other-folder/yetAnotherFolder🤭'),
					createTestFileReference(`${rootUri.path}/file2.prompt.md`, 2, 6),
					new RecursiveReference(
						Uri.joinPath(rootUri, './file2.prompt.md'),
						[
							Uri.joinPath(rootUri, 'file2.prompt.md').path,
							Uri.joinPath(rootUri, 'folder1/file3.prompt.md').path,
							Uri.joinPath(rootUri, 'folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md').path,
							Uri.joinPath(rootUri, 'file2.prompt.md').path,
						],
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference('./folder1/some-other-folder/file4.prompt.md', 3, 14),
					undefined,
				),
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('../some-non-existing/file.prompt.md', 1, 30),
					new OpenFailed(
						Uri.joinPath(rootUri, './folder1/some-non-existing/file.prompt.md'),
						'Ugh ohh!',
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference(
						`${rootUri.path}/folder1/some-other-folder/file5.prompt.md`,
						5,
						1,
					),
					undefined,
				),
				/**
				 * This reference should be resolved with a recursive
				 * reference error condition. (the relative reference case)
				 */
				new ExpectedReference(
					Uri.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('../../file2.prompt.md', 1, 36),
					new RecursiveReference(
						Uri.joinPath(rootUri, './file2.prompt.md'),
						[
							Uri.joinPath(rootUri, 'file2.prompt.md').path,
							Uri.joinPath(rootUri, 'folder1/some-other-folder/file5.prompt.md').path,
							Uri.joinPath(rootUri, 'file2.prompt.md').path,
						],
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference('./file1.md', 6, 2),
					new NotPromptFile(
						Uri.joinPath(rootUri, './file1.md'),
						'Ugh oh!',
					),
				),
			],
			services.filesystemService,
			services.logService,
		);

		await test.run();
	});
});
