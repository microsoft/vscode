/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as fs from 'fs';
import * as path from 'path';
import { serializeSingleEdit } from '../../src/platform/inlineEdits/common/dataTypes/editUtils';
import { assert } from '../../src/util/vs/base/common/assert';
import { SimulationOptions } from '../base/simulationOptions';
import { Configuration, ISimulationTestRuntime, SimulationSuite, SimulationTest } from '../base/stest';
import { loadFile } from './inlineEdit/fileLoading';
import { EditNotScoredError, InlineEditTester } from './inlineEdit/inlineEditTester';
import { nesOptionsToConfigurations } from './nesOptionsToConfigurations';

const RECORDING_BASENAME = 'recording.w.json';
const RECORDING_FILE_SUFFIX = '.recording.w.json';

async function discoverRecordingFiles(rootPath: string) {
	const recordings: fs.Dirent<string>[] = [];

	async function dfs(root: string) {
		const contents = await fs.promises.readdir(root, { withFileTypes: true });

		await Promise.all(contents.map(entry => {
			if (entry.isFile() && entry.name.includes(RECORDING_BASENAME)) {
				recordings.push(entry);
				return;
			}
			if (entry.isDirectory()) {
				return dfs(path.join(entry.parentPath, entry.name));
			}
		}));
	}

	await dfs(rootPath);

	return recordings;
}

export async function discoverNesTests(rootFolder: string, options: SimulationOptions) {
	const recordingFiles = await discoverRecordingFiles(rootFolder);

	const tester = new InlineEditTester();

	const configurations = nesOptionsToConfigurations(options);

	const rootSuite = new SimulationSuite({ title: 'NES', location: 'external' });

	let tests = recordingFiles.map((file) => generateExternalStestFromRecording(file, rootSuite, tester, configurations));

	tests = tests.sort((a, b) => a.fullName.localeCompare(b.fullName));

	rootSuite.tests.push(...tests);

	return rootSuite;
}

function generateExternalStestFromRecording(file: fs.Dirent<string>, containingSuite: SimulationSuite, tester: InlineEditTester, configurations: Configuration<unknown>[]): SimulationTest {
	const fileDir = file.parentPath;
	const basename = file.name;

	const testName = computeTestNameFromFile(file);

	const stest = new SimulationTest({ description: testName, configurations }, {}, containingSuite, async (collection) => {
		const accessor = collection.createTestingAccessor();

		const { isScored, result, scoredEditsFilePath } = await tester.runAndScoreFromRecording(accessor, loadFile({ filePath: path.join(fileDir, basename) }));

		accessor.get(ISimulationTestRuntime).writeFile(`${testName}.textAfterAiEdit.txt`, result.textAfterAiEdit?.value ?? '<NO AI EDIT>', 'textAfterAiEdit');
		accessor.get(ISimulationTestRuntime).writeFile(`${testName}.aiEdit.json`, result.nextEdit === undefined ? '<NO AI EDIT>' : JSON.stringify(result.nextEdit ? serializeSingleEdit(result.nextEdit) : undefined), 'nextEdit');

		if (!isScored) {
			throw new EditNotScoredError(scoredEditsFilePath);
		}
	});

	return stest;
}

function computeTestNameFromFile(file: fs.Dirent<string>): string {
	const basename = file.name;

	// if ends with recording file suffix, remove suffix
	if (basename.endsWith(RECORDING_FILE_SUFFIX)) {
		return basename.slice(0, -RECORDING_FILE_SUFFIX.length);
	}

	// if basename is just the recording file name, use parent directory name as test name
	if (basename === RECORDING_BASENAME) {
		const fileDir = file.parentPath;
		const pathChunks = fileDir.split(path.sep);
		const parentBasename = pathChunks.at(-1);
		assert(parentBasename !== undefined, `Expected recording's ${path.join(file.parentPath, file.name)} parent directory name to be defined`);

		if (pathChunks.at(-2)?.[0].match(/^[A-Z]/)) { // if the recording is at `path/to/MustHave/MyAwesomeTest/recording.w.json` - test name should be `[MustHave] MyAwesomeTest`
			return `[${pathChunks.at(-2)}] ${parentBasename}`;
		}

		return parentBasename;
	}

	throw new Error('Unexpected file name format');
}
