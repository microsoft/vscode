/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { IRecordingInformation } from '../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { LogEntry, serializeEdit } from '../../src/platform/workspaceRecorder/common/workspaceLog';
import { assert } from '../../src/util/vs/base/common/assert';
import { assertDefined } from '../../src/util/vs/base/common/types';
import { StringEdit, StringReplacement } from '../../src/util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../src/util/vs/editor/common/core/ranges/offsetRange';
import { SimulationOptions } from '../base/simulationOptions';
import { Configuration, SimulationSuite, SimulationTest } from '../base/stest';
import { InlineEditTester } from './inlineEdit/inlineEditTester';
import { CompletionStests } from './nesCoffeTestsTypes';
import { nesOptionsToConfigurations } from './nesOptionsToConfigurations';

const TEST_FILE_SUFFIX = '.completion.yml';
const RESULT_FILE_SUFFIX = '.response.json';

export async function discoverCoffeTests(rootFolder: string, options: SimulationOptions) {
	const rootFolderContents = await fs.promises.readdir(rootFolder, { withFileTypes: true });

	const recordingFiles = rootFolderContents.filter(fileEntry => fileEntry.isFile() && fileEntry.name.endsWith(TEST_FILE_SUFFIX));

	const tester = new InlineEditTester();

	const configurations = nesOptionsToConfigurations(options);

	const rootSuite = new SimulationSuite({ title: 'NES', location: 'external' });

	let tests = recordingFiles.map((file) => generateExternalStestFromRecording(file, rootSuite, tester, configurations));

	tests = tests.sort((a, b) => a.fullName.localeCompare(b.fullName));

	rootSuite.tests.push(...tests);

	return rootSuite;
}

function generateExternalStestFromRecording(file: fs.Dirent<string>, containingSuite: SimulationSuite, tester: InlineEditTester, configurations: Configuration<unknown>[]): SimulationTest {

	const basename = file.name;
	const testName = basename.slice(0, -TEST_FILE_SUFFIX.length); // strip suffix
	const filePath = path.join(file.parentPath, basename);


	const stest = new SimulationTest({ description: testName, configurations }, {}, containingSuite, async (collection) => {
		const accessor = collection.createTestingAccessor();

		const fileContents = fs.readFileSync(filePath, 'utf8');
		const testInput = CompletionStests.parseTestInput(fileContents);

		const recordingLog: LogEntry[] = [
			{
				documentType: 'workspaceRecording@1.0',
				kind: 'header',
				repoRootUri: 'file:///Users/john/myProject/',
				time: Date.now(),
				uuid: 'random-uuid-1234',
			},
		];

		const filesWithoutTargetFile = testInput.state.openFiles.filter(f => f.uri !== testInput.completion.uri);

		const targetFile = testInput.state.openFiles.find(f => f.uri === testInput.completion.uri);
		assertDefined(targetFile, `Target file ${testInput.completion.uri} not found in open files.`);

		const targetFileId = filesWithoutTargetFile.length; // careful: needs to be in sync with loop logic

		const { targetFileBeforeEdit, edit } = computeTargetFileBeforeEditAndEdit(targetFile);

		let id = 0;
		for (const openFile of [...filesWithoutTargetFile, targetFile]) {
			const currentFileId = id++;
			const date = Date.now();
			recordingLog.push({
				kind: 'documentEncountered',
				id: currentFileId,
				relativePath: openFile.uri,
				time: date,
			});

			recordingLog.push({
				kind: 'setContent',
				id: currentFileId,
				v: 1,
				content: openFile === targetFile ? targetFileBeforeEdit : openFile.text,
				time: date,
			});

			recordingLog.push({
				kind: 'opened',
				id: currentFileId,
				time: date,
			});
		}

		recordingLog.push({
			kind: 'changed',
			id: targetFileId,
			time: Date.now(),
			v: 2,
			edit: serializeEdit(edit)
		});

		const recording: IRecordingInformation = {
			log: recordingLog,
		};

		const r = await tester.runTestFromRecording(accessor, recording);

		const completions: CompletionStests.TestCompletion[] = [];

		if (r.aiRootedEdit && r.aiRootedEdit.edit.replacements.length > 0) {
			const rootedEdit = r.aiRootedEdit;
			const singleEdit = rootedEdit.edit.replacements[0];

			const baseTrans = rootedEdit.base.getTransformer();
			const start = baseTrans.getPosition(singleEdit.replaceRange.start);
			const end = baseTrans.getPosition(singleEdit.replaceRange.endExclusive);

			const trimmedEdit = rootedEdit.edit.removeCommonSuffixAndPrefix(rootedEdit.base.value);

			completions.push({
				insertText: singleEdit.newText,
				displayText: trimmedEdit.replacements.at(0)?.newText ?? '<edits disappeared during trimming>',
				range: {
					start: {
						line: start.lineNumber - 1,
						character: start.column - 1,
					},
					end: {
						line: end.lineNumber - 1,
						character: end.column - 1
					}
				},
			});
		}

		const completionsOutput: CompletionStests.TestOutput = {
			completions,
		};

		const resultFilePath = path.join(file.parentPath, `${testName}${RESULT_FILE_SUFFIX}`);

		await fs.promises.writeFile(resultFilePath, JSON.stringify(completionsOutput, null, 2));
	});

	return stest;
}

function computeTargetFileBeforeEditAndEdit(targetFile: CompletionStests.TestDocument): { targetFileBeforeEdit: string; edit: StringEdit } {
	const cursorOffset = targetFile.text.indexOf('⮑');
	assert(cursorOffset !== -1, 'Cursor marker ⮑ not found in target file text.');

	const targetFileWithoutCursor = targetFile.text.replace('⮑', '');
	let wordAtCursorStartOffset = cursorOffset - 1;
	while (wordAtCursorStartOffset > 0 && /(\w|\.)/.test(targetFileWithoutCursor[wordAtCursorStartOffset - 1])) {
		wordAtCursorStartOffset--;
	}
	const editToRemoveWordAtCursor = StringEdit.create([StringReplacement.delete(new OffsetRange(wordAtCursorStartOffset, cursorOffset))]);
	const editToInsertWordAtCursor = editToRemoveWordAtCursor.inverse(targetFileWithoutCursor);
	const targetFileBeforeEdit = editToRemoveWordAtCursor.apply(targetFileWithoutCursor);
	return { targetFileBeforeEdit, edit: editToInsertWordAtCursor };
}
