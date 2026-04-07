/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as fs from 'fs/promises';
import { describe, expect, test } from 'vitest';
import * as path from '../../../../util/vs/base/common/path';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { SummarizedDocumentLineNumberStyle } from '../inline/summarizedDocument/implementation';
import { RemovableNode } from '../inline/summarizedDocument/summarizeDocument';
import { fileVariableCostFn } from '../panel/fileVariable';
import { DEFAULT_CHAR_LIMIT, fixture, fromFixtureOld, generateSummarizedDocument, generateSummarizedDocumentAndExtractGoodSelection, generateSummarizedDocuments, getSummarizedSnapshotPath, loadFile, selectionDocPathInFixture, summarizedDocPathInFixture } from './utils';

describe('createSummarizedDocument[visualizable]', () => {

	test('[tsx] can summarize public fields', async () => {
		const filename = 'simpleClass.tsx';

		const result = await generateSummarizedDocument(
			fromFixtureOld(filename, 'typescriptreact'),
			[9, 0],
			1,
			{ alwaysUseEllipsisForElisions: true }
		);

		await expect(result.text).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
	});

	test('[cpp] CppNoExtraSemicolons', async () => {
		const file = await loadFile({ filePath: fixture('cppNoExtraSemicolons.cpp'), languageId: 'cpp' });
		const result = await generateSummarizedDocument(file, [50, 0], 628, { alwaysUseEllipsisForElisions: true });
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file));
	});

	test('[cpp] Do not throw invalid range error', async () => {
		const file = await loadFile({ filePath: fixture('problem1.cpp'), languageId: 'cpp' });
		const result = await generateSummarizedDocument(file, [17, 10], 10, { alwaysUseEllipsisForElisions: true });
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file));
	});

	test('[cpp] Do not throw invalid range error - 2', async () => {
		const file = await loadFile({ filePath: fixture('problem2.cpp'), languageId: 'cpp' });
		const result = await generateSummarizedDocument(file, [6, 19], 100, { alwaysUseEllipsisForElisions: true });
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file));
	});

	test('should include nearby code - strings.test.ts', async () => {
		const file = await loadFile({ filePath: fixture('strings.test-example.ts'), languageId: 'typescript' });
		const result = await generateSummarizedDocument(file, [344, 0]);
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file));
	});

	test('should include nearby code - strings.test.ts - SummarizedDocumentLineNumberStyle.OmittedRanges', async () => {
		const file = await loadFile({ filePath: fixture('strings.test-example.ts'), languageId: 'typescript' });
		const result = await generateSummarizedDocument(file, [344, 0], undefined, { lineNumberStyle: SummarizedDocumentLineNumberStyle.OmittedRanges });
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file, '2'));
	});

	test('should include nearby code - strings.test.ts - SummarizedDocumentLineNumberStyle.Full', async () => {
		const file = await loadFile({ filePath: fixture('strings.test-example.ts'), languageId: 'typescript' });
		const result = await generateSummarizedDocument(file, [344, 0], undefined, { lineNumberStyle: SummarizedDocumentLineNumberStyle.Full });
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file, '3'));
	});

	test('should include whitespace touching the selection - codeEditorWidget.ts', async () => {
		const file = await loadFile({ filePath: fixture('codeEditorWidget.ts'), languageId: 'typescript' });
		const result = await generateSummarizedDocument(file, [1085, 2, 1089, 3]);
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file, '1'));
	});

	test('should not select parent node when the selection contains children but starts/ends in whitespace - codeEditorWidget.ts', async () => {
		const file = await loadFile({ filePath: fixture('codeEditorWidget.ts'), languageId: 'typescript' });
		const result = await generateSummarizedDocument(file, [211, 0, 213, 0]);
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file, '2'));
	});

	test('no selection - codeEditorWidget.ts', async () => {
		const file = await loadFile({ filePath: fixture('codeEditorWidget.ts'), languageId: 'typescript' });
		const result = await generateSummarizedDocument(file, undefined, DEFAULT_CHAR_LIMIT, {
			costFnOverride: fileVariableCostFn,
		});
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file, '3'));
	});

	test('should select at least one node - codeEditorWidget.ts', async () => {
		const file = await loadFile({ filePath: fixture('editorGroupWatermark.ts'), languageId: 'typescript' });
		const result = await generateSummarizedDocument(file, [24, 0]);
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file));
	});

	test('issue #6614: Should include ... only once when eliding code', async () => {
		const file = await loadFile({ filePath: fixture('view.css'), languageId: 'css' });
		const result = await generateSummarizedDocument(file, [225, 0, 237, 15], 0, { alwaysUseEllipsisForElisions: false });
		await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file));
	});

	test('should expand selection end to closing brace - extHost.api.impl.ts', async () => {
		const filename = 'extHost.api.impl.ts';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescript'),
				[696, 0, 711, 0]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('should expand selection when it sits on identifier - webview/index.ts', async () => {
		const filename = 'webview-index.ts';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescript'),
				[47, 14]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('should not expand selection to the left in whitespace - pullRequestModel.ts', async () => {
		const filename = 'pullRequestModel.ts';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescript'),
				[1071, 0]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('should not expand selection to select whitespace - keybindingParser.ts', async () => {
		const filename = 'keybindingParser.ts';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescript'),
				[15, 8]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		expect(selectedCode).toMatchInlineSnapshot(`""`);
	});

	test('should expand selection start to opening brace - BasketService.cs', async () => {
		const filename = 'BasketService.cs';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'csharp', {
					insertSpaces: true,
					tabSize: 4,
				}),
				[44, 5]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('should not expand end selection to select whitespace - pseudoStartStopConversationCallbackTest.ts', async () => {
		const filename = 'pseudoStartStopConversationCallbackTest.ts';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescript'),
				[125, 0, 132, 0]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('issue #5755: should not expand selection from property to the entire interface', async () => {
		const filename = 'vscode.proposed.chatParticipantAdditions.d.ts';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescript'),
				[158, 0, 166, 0]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('issue #5710: should move the start of the selection to next line', async () => {
		const filename = '5710.ts';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescript'),
				[7, 66, 10, 5],
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('issue #7487: should not expand selection outside the React element', async () => {
		const filename = 'EditForm.tsx';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'typescriptreact'),
				[138, 0, 147, 17]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

	test('issue #6614: should not expand selection to entire HTML document', async () => {
		const filename = 'workbench-dev.html';
		const [otherCode, selectedCode] =
			await generateSummarizedDocumentAndExtractGoodSelection(
				fromFixtureOld(filename, 'html'),
				[75, 4, 75, 4]
			);
		await expect(otherCode).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
		await expect(selectedCode).toMatchFileSnapshot(selectionDocPathInFixture(filename));
	});

});

describe('cutoff cost', () => {

	test('Everything is too expensive', async () => {

		const filename = 'map.ts';

		const result = await generateSummarizedDocument(
			fromFixtureOld(filename, 'typescript'),
			undefined,
			DEFAULT_CHAR_LIMIT,
			{
				costFnOverride: () => false
			}
		);

		expect(result.text).toBe('');
	});

	test('cutoff cost is respected', async () => {

		const viewport = OffsetRange.ofStartAndLength(0, 1323);

		function costFnOverride(n: RemovableNode, currentScore: number) {
			// view port line 1 to line 49
			if (n.range.intersectsOrTouches(viewport)) {
				return 1;
			} else {
				return false;
			}
		}

		const filename = 'map.ts';
		const result = await generateSummarizedDocument(
			fromFixtureOld(filename, 'typescript'),
			undefined,
			Number.MAX_SAFE_INTEGER,
			{
				costFnOverride
			}
		);
		await expect(result.text).toMatchFileSnapshot(summarizedDocPathInFixture(filename) + '.view-port');
	});

});

describe('/tests summarization[visualizable]', () => {
	test('keep constructor & method signatures', async () => {

		function costFnOverride(node: RemovableNode, currentScore: number) {
			return node.kind === 'constructor' || node.kind === 'method_definition' ? 0 : currentScore;
		}

		const filename = 'bracketPairsTree.ts';

		const result = await generateSummarizedDocument(
			fromFixtureOld(filename, 'typescript'),
			[88, 4, 102, 5],
			DEFAULT_CHAR_LIMIT,
			{ costFnOverride }
		);

		await expect(result.text).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
	});

	test('keep constructor - 2', async () => {

		function costFnOverride(node: RemovableNode, currentScore: number) {
			return node.kind === 'constructor' ? 0 : currentScore;
		}

		const filename = 'map.ts';

		const result = await generateSummarizedDocument(
			fromFixtureOld(filename, 'typescript'),
			[671, 0, 725, 1],
			DEFAULT_CHAR_LIMIT,
			{ costFnOverride }
		);

		await expect(result.text).toMatchFileSnapshot(summarizedDocPathInFixture(filename));
	});
});


describe('createSummarizedDocuments', () => {

	test('summarize two document equally', async () => {


		const filenames: string[] = [
			'editorGroupWatermark.ts',
			'strings.test-example.ts'
		];

		const files = [
			await loadFile({ filePath: fixture(filenames[0]), languageId: 'typescript' }),
			await loadFile({ filePath: fixture(filenames[1]), languageId: 'typescript' })
		];

		const docs = await generateSummarizedDocuments([
			{
				filePromise: files[0],
				selection: [24, 0]
			},
			{
				filePromise: files[1],
				selection: [344, 0]
			},
		]);

		expect(docs.length).toBe(2);

		for (let i = 0; i < docs.length; i++) {
			const document = docs[i];
			expect(document.originalText).toBe(files[i].contents);
			await expect(document.text).toMatchFileSnapshot(summarizedDocPathInFixture(filenames[i] + '.round1'));
		}
	});

	test('summarize two document un-equally', async () => {

		const filenames: string[] = [
			'editorGroupWatermark.ts',
			'strings.test-example.ts'
		];

		const files = [
			await loadFile({ filePath: fixture(filenames[0]), languageId: 'typescript' }),
			await loadFile({ filePath: fixture(filenames[1]), languageId: 'typescript' })
		];

		const docs = await generateSummarizedDocuments([
			{
				filePromise: files[0],
				selection: [24, 0]
			},
			{
				filePromise: files[1],
				selection: [344, 0]
			},
		], 5000, {
			costFnOverride(node, currentCost, document) {
				if (document.uri.path.includes(filenames[1])) {
					return 1;
				}
				return 100;
			},
		});

		// small budget, BIASED scores

		expect(docs.length).toBe(2);

		for (let i = 0; i < docs.length; i++) {
			const document = docs[i];
			expect(document.originalText).toBe(files[i].contents);
			await expect(document.text).toMatchFileSnapshot(summarizedDocPathInFixture(filenames[i] + '.round2'));
		}
	});


	test.skip('run on repositories', async () => {

		const N_FILES_LIMIT = 1500;

		const reposWithLangs: Record<string, { repoPath: string; language: string }> = {
			'vscode-copilot': { repoPath: path.join(__dirname, '../../../../../src/'), language: 'typescript' },
			'llama.cpp': { repoPath: path.join(__dirname, '../../../../../../llama.cpp/src'), language: 'cpp' },
		};

		const langToExts: Record<string, string[]> = {
			'cpp': ['cpp', 'h'],
			'typescript': ['ts', 'tsx'],
		};

		const { repoPath, language } = reposWithLangs['vscode-copilot'];
		const exts = langToExts[language];

		async function* traverseDirectory(pathToDir: string): AsyncGenerator<string> {
			const dirEntries = await fs.readdir(pathToDir, { withFileTypes: true });
			for (const entry of dirEntries) {
				if (entry.isDirectory()) {
					yield* traverseDirectory(path.join(pathToDir, entry.name));
				} else if (exts.some(ext => !entry.parentPath.includes('fixture') && !entry.name.includes('.summarized.') && entry.name.endsWith('.' + ext))) {
					console.log(path.join(pathToDir, entry.name));
					yield path.join(pathToDir, entry.name);
				}
			}
		}

		let i = -1;
		for await (const filePath of traverseDirectory(repoPath)) {
			++i;
			try {
				if (i > N_FILES_LIMIT) {
					break;
				}
				const file = await loadFile({ filePath, languageId: language });
				const fileLines = file.contents.split('\n');
				const selection: [number, number] = [Math.floor(fileLines.length / 2), Math.floor(fileLines[Math.floor(fileLines.length / 2)].length / 2)];
				const result = await generateSummarizedDocument(file, selection, 400, { alwaysUseEllipsisForElisions: true });
				await expect(result.text).toMatchFileSnapshot(getSummarizedSnapshotPath(file));
			} catch (e) {
				console.log(`processing ${filePath} threw error`, e);
			}
		}
	});

});
