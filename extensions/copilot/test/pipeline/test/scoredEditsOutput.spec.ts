/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, expect, suite, test } from 'vitest';
import { NesDatagenSampleTask } from '../../base/simulationOptions';
import type { ISample } from '../output';
import { publishScoredEditsFiles, resolveScoredEditsOutputDirectory } from '../scoredEditsOutput';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

suite('scoredEdits output', () => {
	test('publishes exactly the staged files associated with generated sample IDs', async () => {
		const temporaryDirectory = await createTemporaryDirectory();
		const samplesOutputPath = path.join(temporaryDirectory, 'samples.jsonl');
		const outputDirectory = resolveScoredEditsOutputDirectory(samplesOutputPath);
		const firstStagingDirectory = path.join(temporaryDirectory, 'worker-1');
		const secondStagingDirectory = path.join(temporaryDirectory, 'worker-2');
		await Promise.all([
			fs.mkdir(outputDirectory),
			fs.mkdir(firstStagingDirectory),
			fs.mkdir(secondStagingDirectory),
		]);
		await Promise.all([
			fs.writeFile(path.join(outputDirectory, 'stale.scoredEdits.w.json'), 'stale'),
			fs.writeFile(path.join(firstStagingDirectory, '0.scoredEdits.w.json'), 'sample 0'),
			fs.writeFile(path.join(secondStagingDirectory, '2.scoredEdits.w.json'), 'sample 2'),
		]);

		const result = await publishScoredEditsFiles(
			samplesOutputPath,
			[createSample(2), createSample(0)],
			[firstStagingDirectory, secondStagingDirectory],
		);
		const fileNames = (await fs.readdir(outputDirectory)).sort();
		const contents = await Promise.all(fileNames.map(fileName => fs.readFile(path.join(outputDirectory, fileName), 'utf8')));

		expect({ result, fileNames, contents }).toEqual({
			result: { outputDirectory, written: 2 },
			fileNames: ['0.scoredEdits.w.json', '2.scoredEdits.w.json'],
			contents: ['sample 0', 'sample 2'],
		});
	});

	test('preserves the previous output when staged sample IDs do not match', async () => {
		const temporaryDirectory = await createTemporaryDirectory();
		const samplesOutputPath = path.join(temporaryDirectory, 'samples.jsonl');
		const outputDirectory = resolveScoredEditsOutputDirectory(samplesOutputPath);
		const stagingDirectory = path.join(temporaryDirectory, 'worker');
		await Promise.all([fs.mkdir(outputDirectory), fs.mkdir(stagingDirectory)]);
		await fs.writeFile(path.join(outputDirectory, 'previous.scoredEdits.w.json'), 'previous');

		const error = await publishScoredEditsFiles(samplesOutputPath, [createSample(1)], [stagingDirectory])
			.then(() => undefined, value => value);
		const fileNames = await fs.readdir(outputDirectory);
		const contents = await fs.readFile(path.join(outputDirectory, fileNames[0]), 'utf8');

		expect({ message: error instanceof Error ? error.message : undefined, fileNames, contents }).toEqual({
			message: 'Missing staged scoredEdits file for sample ID 1',
			fileNames: ['previous.scoredEdits.w.json'],
			contents: 'previous',
		});
	});
});

async function createTemporaryDirectory(): Promise<string> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scored-edits-output-'));
	temporaryDirectories.push(directory);
	return directory;
}

function createSample(rowIndex: number): ISample {
	return {
		messages: [
			{ role: 'system', content: 'system' },
			{ role: 'user', content: 'user' },
			{ role: 'assistant', content: 'assistant' },
		],
		metadata: {
			rowIndex,
			language: 'typescript',
			strategy: 'customDiffPatch',
			oracleEditCount: 1,
			suggestionStatus: 'accepted',
			filePath: 'src/file.ts',
			docContent: 'value',
			oracleEdits: [[0, 0, 'value']],
			originalPrompt: [],
			modelResponse: '',
			task: NesDatagenSampleTask.Xtab,
		},
	};
}
