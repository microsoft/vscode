/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import dedent from 'ts-dedent';
import { DocumentInfoWithOffset, SimilarFileInfo } from '../prompt';
import { FixedWindowSizeJaccardMatcher, computeScore } from '../snippetInclusion/jaccardMatching';
import { ScoredSnippetMarker, SortOptions, splitIntoWords } from '../snippetInclusion/selectRelevance';
import {
	SimilarFilesOptions,
	conservativeFilesOptions,
	defaultCppSimilarFilesOptions,
	defaultSimilarFilesOptions,
	getSimilarSnippets,
	nullSimilarFilesOptions,
} from '../snippetInclusion/similarFiles';
import { SnippetWithProviderInfo } from '../snippetInclusion/snippets';
import { initializeTokenizers } from '../tokenization';

async function retrieveAllSnippetsWithJaccardScore(
	objectDoc: SimilarFileInfo,
	referenceDoc: SimilarFileInfo,
	windowLength: number,
	sortOption: SortOptions
): Promise<ScoredSnippetMarker[]> {
	const referenceDocWithOffset: DocumentInfoWithOffset = {
		...referenceDoc,
		languageId: '',
		offset: referenceDoc.source.length,
	};
	const matcher = FixedWindowSizeJaccardMatcher.FACTORY(windowLength).to(referenceDocWithOffset);
	const match = await matcher.retrieveAllSnippets(objectDoc, sortOption);

	return match;
}

async function findBestJaccardMatch(
	objectDoc: SimilarFileInfo,
	referenceDoc: SimilarFileInfo,
	windowLength: number
): Promise<SnippetWithProviderInfo[]> {
	const referenceDocWithOffset: DocumentInfoWithOffset = {
		...referenceDoc,
		languageId: '',
		offset: referenceDoc.source.length,
	};
	const matcher = FixedWindowSizeJaccardMatcher.FACTORY(windowLength).to(referenceDocWithOffset);
	const match = await matcher.findBestMatch(objectDoc, defaultCppSimilarFilesOptions.maxSnippetsPerFile);
	return match;
}

suite('selectRelevance Test Suite', function () {
	setup(async function () {
		await initializeTokenizers;
	});

	test('findBestJaccardMatch computes correct score of two single lines', async function () {
		// 100% match if equal
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{ source: 'good morning', uri: 'file:///home/user/test.js' },
					{ source: 'good morning', uri: 'file:///home/user/test.js' },
					1
				)
			)[0].score,
			1
		);
		// no match if different
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{ source: 'good morning', uri: 'file:///home/user/test.js' },
					{ source: 'bad night', uri: 'file:///home/user/test.js' },
					1
				)
			).length,
			0
		);
		// 33% match if 1 same, 1 different (because it's 1 overlap of 3 tokens in total)
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{ source: 'good morning', uri: 'file:///home/user/test.js' },
					{ source: 'good night', uri: 'file:///home/user/test.js' },
					1
				)
			)[0].score,
			1 / 3
		);
		// 50% match if half the tokens are missing (because it's 1 overlap of 2 tokens in total)
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{ source: 'good morning', uri: 'file:///home/user/test.js' },
					{ source: 'good', uri: 'file:///home/user/test.js' },
					1
				)
			)[0].score,
			0.5
		);
		// order is ignored
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{ source: 'good morning', uri: 'file:///home/user/test.js' },
					{ source: 'morning good', uri: 'file:///home/user/test.js' },
					1
				)
			)[0].score,
			1
		);
		// so are stop words
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{ source: 'good morning', uri: 'file:///home/user/test.js' },
					{ source: 'morning is good', uri: 'file:///home/user/test.js' },
					1
				)
			)[0].score,
			1
		);
		// and non alphanumeric_ characters
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{ source: 'good !morning   sunshine', uri: 'file:///home/user/test.js' },
					{ source: 'goodâ‚¬morning,sunshine', uri: 'file:///home/user/test.js' },
					1
				)
			)[0].score,
			1
		);
	});

	/**
	 * When requesting matches with a certain length,
	 * the returns have that length
	 */
	test('findBestJaccardMatch respects windowLength', async function () {
		// no window no match
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{
						source: 'good morning\ngood night\nthe day\nis bright',
						uri: 'file:///home/user/test.js',
					},
					{
						source: 'good morning\ngood night\nthe day\nis bright',
						uri: 'file:///home/user/test.js',
					},
					0
				)
			).length,
			0
		);
		// for identical object and reference docs
		for (const n of [1, 2]) {
			assert.strictEqual(
				(
					await findBestJaccardMatch(
						{
							source: 'good morning\ngood night\nthe day\nis bright',
							uri: 'file:///home/user/test.js',
						},
						{
							source: 'good morning\ngood night\nthe day\nis bright',
							uri: 'file:///home/user/test.js',
						},
						n
					)
				)[0].snippet.split('\n').length,
				n
			);
		}
		// if the ref doc is shorter
		for (const n of [1, 2]) {
			assert.strictEqual(
				(
					await findBestJaccardMatch(
						{
							source: 'good morning\ngood night\nthe day\nis bright',
							uri: 'file:///home/user/test.js',
						},
						{ source: 'good night', uri: 'file:///home/user/test.js' },
						n
					)
				)[0].snippet.split('\n').length,
				n
			);
		}
		// if the ref doc is longer
		for (const n of [1, 2]) {
			const matches = await findBestJaccardMatch(
				{
					source: 'good morning\ngood night\nthe day\nis bright',
					uri: 'file:///home/user/test.js',
				},
				{
					source: 'good morning\ngood night\nthe day\nis bright\nthe sun',
					uri: 'file:///home/user/test.js',
				},
				n
			);
			if (n === 1) { assert.strictEqual(matches.length, 0); }
			else if (n === 2) {
				assert.strictEqual(matches.length, 1);
				assert.strictEqual(matches[0].snippet.split('\n').length, n > 1 ? n : []);
			} else {
				throw new Error('Unexpected value for `n`');
			}
		}
	});

	test('findBestJaccardMatch returns the best match', async function () {
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{
						source: ['abcd', 'efgh', 'ijkl', 'mnop', 'qrst', 'uvwx', 'yz'].join('\n'),
						uri: 'file:///home/user/test.js',
					},
					{ source: ['ijkl', 'qrst'].join('\n'), uri: 'file:///home/user/test.js' },
					3
				)
			)[0].snippet,
			['ijkl', 'mnop', 'qrst'].join('\n')
		);
	});

	test('findBestJaccardMatch works on strings with or without a newline at the end', async function () {
		assert.strictEqual(
			(
				await findBestJaccardMatch(
					{
						source: ['abcd', 'efgh', 'ijkl', 'mnop', 'qrst', 'uvwx', 'yz'].join('\n'),
						uri: 'file:///home/user/test.js',
					},
					{ source: ['ijkl', 'qrst'].join('\n'), uri: 'file:///home/user/test.js' },
					3
				)
			)[0].snippet,
			['ijkl', 'mnop', 'qrst'].join('\n')
		);
	});

	test('Tokenization splits words on whitespace', function () {
		assert.deepStrictEqual(splitIntoWords('def hello'), ['def', 'hello']);
		assert.deepStrictEqual(splitIntoWords('def   hello'), ['def', 'hello']);
		assert.deepStrictEqual(splitIntoWords('def \n\t hello'), ['def', 'hello']);
	});

	test('Tokenization keeps numbers attached to words', function () {
		assert.deepStrictEqual(splitIntoWords('def hello1:\n\treturn world49'), ['def', 'hello1', 'return', 'world49']);
	});

	test('Tokenization splits words on special characters', function () {
		assert.deepStrictEqual(splitIntoWords('def hello(world):\n\treturn a.b+1'), [
			'def',
			'hello',
			'world',
			'return',
			'a',
			'b',
			'1',
		]);
	});

	test('Tokenization splits words on underscores', function () {
		assert.deepStrictEqual(splitIntoWords(`def hello_world:\n\treturn 'I_am_a_sentence!'`), [
			'def',
			'hello',
			'world',
			'return',
			'I',
			'am',
			'a',
			'sentence',
		]);
	});

	test('Find all snippets.', async function () {
		const windowLength = 2;
		const doc1 = {
			source: 'or not\ngood morning\ngood night\nthe day\nis bright\nthe morning sun\nis hot',
			uri: 'file:///home/user/test.js',
		};
		const refDoc = {
			source: 'good morning good night the day is bright',
			languageId: '',
			uri: 'file:///home/user/test.js',
		};
		assert.deepStrictEqual(
			await retrieveAllSnippetsWithJaccardScore(doc1, refDoc, windowLength, SortOptions.None),
			[
				{ score: 0.6, startLine: 1, endLine: 3 },
				{ score: 0.4, startLine: 3, endLine: 5 },
				{ score: 0.14285714285714285, startLine: 5, endLine: 7 },
			]
		);

		assert.deepStrictEqual(
			await retrieveAllSnippetsWithJaccardScore(doc1, refDoc, windowLength, SortOptions.Ascending),
			[
				{ score: 0.14285714285714285, startLine: 5, endLine: 7 },
				{ score: 0.4, startLine: 3, endLine: 5 },
				{ score: 0.6, startLine: 1, endLine: 3 },
			]
		);

		assert.deepStrictEqual(
			await retrieveAllSnippetsWithJaccardScore(doc1, refDoc, windowLength, SortOptions.Descending),
			[
				{ score: 0.6, startLine: 1, endLine: 3 },
				{ score: 0.4, startLine: 3, endLine: 5 },
				{ score: 0.14285714285714285, startLine: 5, endLine: 7 },
			]
		);
	});

	test('Test Jaccard similarity.', function () {
		const bagOfWords1 = 'one two three four five';
		const bagOfWords2 = 'zone ztwo zthree zfour zfive';
		const bagOfWords3 = 'one two three four five six'; // single word difference with bagOfWords1
		const bagOfWords4 = 'one ztwo zthree zfour zfive'; // single word intersection with bagOfWords1
		const bagOfWords5 = 'one ztwo ztwo zthree zfour zfive'; // repeated words
		assert.strictEqual(computeScore(new Set(splitIntoWords(bagOfWords1)), new Set(splitIntoWords(bagOfWords2))), 0);
		assert.strictEqual(computeScore(new Set(splitIntoWords(bagOfWords1)), new Set(splitIntoWords(bagOfWords1))), 1);
		assert.strictEqual(
			computeScore(new Set(splitIntoWords(bagOfWords1)), new Set(splitIntoWords(bagOfWords3))),
			5 / 6
		);
		assert.strictEqual(
			computeScore(new Set(splitIntoWords(bagOfWords1)), new Set(splitIntoWords(bagOfWords4))),
			1 / 9
		);
		assert.strictEqual(
			computeScore(new Set(splitIntoWords(bagOfWords1)), new Set(splitIntoWords(bagOfWords5))),
			1 / 9
		);
	});

	test('Snippets never overlap, the highest score wins.', async function () {
		// When overlapping snippets are found, the snippet with the highest score wins and the others are dropped, e.g.:
		// given the ref doc of "the speed of light is incredibly fast", the doc "the light is incredibly fast" matches
		// with score 0.75, but the next "The speed of light is incredibly fast" matches with score 1, so the previous overlapping
		// snippet is dropped.
		const windowLength = 2;
		const doc1 = {
			source: 'the light\nis incredibly fast\nthe speed of light\nis incredibly fast\nexcessively bright, the morning sun\n was hot casting elongated shadows',
			uri: 'file:///home/user/test.js',
		};
		const refDoc = {
			source: 'the speed of light\nis incredibly fast',
			languageId: '',
			uri: 'file:///home/user/test2.js',
		};
		assert.deepStrictEqual(
			await retrieveAllSnippetsWithJaccardScore(doc1, refDoc, windowLength, SortOptions.None),
			[
				{ score: 1, startLine: 1, endLine: 3 },
				{ score: 0.25, startLine: 3, endLine: 5 },
			]
		);
	});
});

suite('Test getSimilarSnippets function', function () {
	const docSource: string = dedent`
		A
			B
			C
		D|
			E
		F
		G`;
	const doc: DocumentInfoWithOffset = {
		relativePath: 'source1',
		uri: 'source1',
		source: docSource,
		languageId: 'python',
		offset: docSource.indexOf('|'), // reference snippet will be A B C D
	};

	const similarFiles: SimilarFileInfo[] = [
		{
			relativePath: 'similarFile1',
			uri: 'similarFile1',
			source: dedent`
				A
					B
					C
					H
				X
					Y
					Z
				`,
		},
		{
			relativePath: 'similarFile2',
			uri: 'similarFile2',
			source: dedent`
		  D
			  H
		  `,
		},
	];

	setup(async function () {
		await initializeTokenizers;
	});

	test('Returns correct snippet in conservative mode', async function () {
		const options: SimilarFilesOptions = conservativeFilesOptions;

		const snippetLocations = (await getSimilarSnippets(doc, similarFiles, options)).map(snippet => [
			snippet.startLine,
			snippet.endLine,
		]);
		const correctSnippetLocations: number[][] = [
			[0, 7], // A B C H X Y Z
		];
		assert.deepStrictEqual(snippetLocations, correctSnippetLocations);
	});
	test('Returns correct snippets in eager mode', async function () {
		const options: SimilarFilesOptions = defaultSimilarFilesOptions;
		const snippetLocations = (await getSimilarSnippets(doc, similarFiles, options)).map(snippet => [
			snippet.startLine,
			snippet.endLine,
		]);
		const correctSnippetLocations: number[][] = [
			[0, 7], // A B C H X Y Z
			[0, 2], // D H - included as get up to 4 similar docs
		];
		assert.deepStrictEqual(snippetLocations.sort(), correctSnippetLocations.sort());
	});
	test('Returns no snippet in None mode', async function () {
		const options: SimilarFilesOptions = nullSimilarFilesOptions;
		const snippetLocations = (await getSimilarSnippets(doc, similarFiles, options)).map(snippet => [
			snippet.startLine,
			snippet.endLine,
		]);
		const correctSnippetLocations: number[][] = [];
		assert.deepStrictEqual(snippetLocations, correctSnippetLocations);
	});
});

suite('Test trimming reference document', function () {
	const docSource: string = dedent`
		1
			2
			3
		4
			5
		6|
		7`;
	const doc: DocumentInfoWithOffset = {
		relativePath: 'source1',
		uri: 'source1',
		source: docSource,
		languageId: 'python',
		offset: docSource.indexOf('|'),
	};

	test('FixedWindowSizeJaccardMatcher trims reference document correctly', async function () {
		for (let windowLength = 1; windowLength < 7; windowLength++) {
			const matcherFactory = FixedWindowSizeJaccardMatcher.FACTORY(windowLength);
			const matcher = matcherFactory.to(doc);
			const referenceTokens = [...(await matcher.referenceTokens)];
			// Don't get 7 because it's after the cursor
			const correctReferenceTokens: string[] = ['1', '2', '3', '4', '5', '6'].slice(-windowLength);
			assert.deepStrictEqual(referenceTokens, correctReferenceTokens);
		}
	});
});
