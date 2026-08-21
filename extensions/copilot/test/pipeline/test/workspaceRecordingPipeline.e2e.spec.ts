/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HeaderLogEntry, LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { NesDatagenInputFormat, NesDatagenSampleTask, PivotStrategy } from '../../base/simulationOptions';
import type { Scoring } from '../alternativeAction/types';
import type { ISample } from '../output';
import { runInputPipeline } from '../pipeline';

const configPath = path.join(__dirname, 'fixtures', 'config.json');
const header: HeaderLogEntry = {
	kind: 'header',
	documentType: 'workspaceRecording@1.0',
	repoRootUri: 'file:///private/workspace',
	time: 0,
	uuid: 'recording-id',
	revision: 4,
};

let tmpDir: string;

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nes-workspace-recording-e2e-'));
});

afterAll(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

async function runRecording(
	entries: readonly LogEntry[],
	sampleTask: NesDatagenSampleTask,
	generateScoredEdits = false,
	maxOracleEdits = 10,
): Promise<{ samples: ISample[]; logs: string[]; scoredEdits: { fileName: string; value: Scoring.t }[] }> {
	const inputPath = path.join(tmpDir, `input-${sampleTask}.workspaceRecording.jsonl`);
	const outputPath = path.join(tmpDir, `output-${sampleTask}.jsonl`);
	await fs.writeFile(inputPath, `\n${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`);
	const logs: string[] = [];

	await runInputPipeline({
		nesDatagen: {
			input: inputPath,
			output: outputPath,
			rowOffset: 0,
			workerMode: false,
			sampleTask,
			inputFormat: NesDatagenInputFormat.WorkspaceRecording,
			pivotStrategy: PivotStrategy.Random,
			seed: 0,
			sameFileJumpMinAbove: 2,
			sameFileJumpMinBelow: 5,
			maxSamplesPerRecording: 100,
			maxOracleEdits,
			generateScoredEdits,
		},
		configFile: configPath,
		verbose: false,
		parallelism: 1,
	}, (...args: unknown[]) => {
		logs.push(args.map(arg => String(arg)).join(' '));
	});

	const samples = (await fs.readFile(outputPath, 'utf8'))
		.split('\n')
		.filter(line => line.length > 0)
		.map(line => JSON.parse(line) as ISample);
	const scoredEditsDirectory = path.join(tmpDir, `output-${sampleTask}.scoredEdits`);
	const scoredEdits = generateScoredEdits
		? await Promise.all((await fs.readdir(scoredEditsDirectory)).sort().map(async fileName => ({
			fileName,
			value: JSON.parse(await fs.readFile(path.join(scoredEditsDirectory, fileName), 'utf8')) as Scoring.t,
		})))
		: [];
	return { samples, logs, scoredEdits };
}

describe('nes-datagen workspace recording pipeline', () => {
	it('generates an Xtab sample from a raw stateful recording', async () => {
		const documentContent =
			`export function add(a: number, b: number): number {\n` +
			`\treturn a + b;\n` +
			`}\n`;
		const oracleEdits: [number, number, string][] = [
			[16, 19, 'sum'],
			[documentContent.length + 1, documentContent.length + 1, '// done\n'],
		];
		const entries: LogEntry[] = [
			header,
			{ kind: 'applicationStart', time: 1, commitHash: 'commit' },
			{ kind: 'documentEncountered', id: 0, time: 1001, relativePath: 'src/math.ts' },
			{ kind: 'setContent', id: 0, time: 1000, content: documentContent, v: 1 },
			{ kind: 'selectionChanged', id: 0, time: 1001, selection: [[16, 16]] },
			{
				kind: 'changed',
				id: 0,
				time: 1002,
				edit: [[documentContent.length, documentContent.length, '\n']],
				v: 2,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			{
				kind: 'changed',
				id: 0,
				time: 1004,
				edit: oracleEdits,
				v: 3,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			{
				kind: 'changed',
				id: 0,
				time: 1005,
				edit: [[0, 0, 'generated']],
				v: 4,
				metadata: { source: 'applyEdits' },
			},
		];

		const { samples, logs, scoredEdits } = await runRecording(entries, NesDatagenSampleTask.Xtab, true);
		expect({
			samples: samples.map(sample => ({
				id: sample.metadata.rowIndex,
				task: sample.metadata.task,
				language: sample.metadata.language,
				filePath: sample.metadata.filePath,
				oracleEdits: sample.metadata.oracleEdits,
				workspaceRecording: sample.metadata.workspaceRecording,
			})),
			scoredEdits: scoredEdits.map(({ fileName, value }) => ({
				fileName,
				edits: value.edits,
				historyKinds: value.scoringContext.recording.log.map(entry => entry.kind),
				nextUserEdit: value.scoringContext.recording.nextUserEdit,
			})),
		}, logs.join('\n')).toEqual({
			samples: [{
				id: 0,
				task: NesDatagenSampleTask.Xtab,
				language: 'typescript',
				filePath: 'src/math.ts',
				oracleEdits,
				workspaceRecording: {
					sourceFormat: 'workspace-recording',
					recordingRevision: 4,
					policyVersion: 2,
					pivotKind: 'user-edit',
					pivotOperationIndex: 2,
					oracleOperationCount: 1,
					oracleStopReason: 'generated-edit',
					contextTruncated: false,
				},
			}],
			scoredEdits: [{
				fileName: '0.scoredEdits.w.json',
				edits: [{
					documentUri: 'src/math.ts',
					edit: oracleEdits,
					scoreCategory: 'nextEdit',
					score: 0,
				}],
				historyKinds: ['meta', 'documentEncountered', 'setContent', 'selectionChanged', 'changed'],
				nextUserEdit: {
					edit: oracleEdits,
					relativePath: 'src/math.ts',
					originalOpIdx: 4,
				},
			}],
		});
	});

	it('limits the composed oracle edits using the configured maximum', async () => {
		const documentContent = 'const value = 1;\n';
		const entries: LogEntry[] = [
			header,
			{ kind: 'documentEncountered', id: 0, time: 1000, relativePath: 'src/value.ts' },
			{ kind: 'setContent', id: 0, time: 1000, content: documentContent, v: 1 },
			{ kind: 'selectionChanged', id: 0, time: 1001, selection: [[documentContent.length, documentContent.length]] },
			{
				kind: 'changed',
				id: 0,
				time: 1002,
				edit: [[documentContent.length, documentContent.length, 'p']],
				v: 2,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			{
				kind: 'changed',
				id: 0,
				time: 1003,
				edit: [[0, 0, 'a'], [6, 6, 'b'], [12, 12, 'c']],
				v: 3,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			{
				kind: 'changed',
				id: 0,
				time: 1004,
				edit: [[documentContent.length + 1, documentContent.length + 1, 'generated']],
				v: 4,
				metadata: { source: 'applyEdits' },
			},
		];

		const { samples, logs } = await runRecording(entries, NesDatagenSampleTask.Xtab, false, 2);
		expect(samples.map(sample => sample.metadata.oracleEdits), logs.join('\n')).toEqual([[
			[0, 0, 'a'],
			[6, 6, 'b'],
		]]);
	});

	it('retains the first deliberate cursor boundary for cursor-task generation', async () => {
		const documentContent = Array.from({ length: 30 }, (_, index) => `// A${String(index).padStart(2, '0')}`).join('\n') + '\n';
		const cursorOffset = 7 * 2;
		const jumpEditOffset = 7 * 25;
		const boundaryOffset = 7 * 10;
		const entries: LogEntry[] = [
			header,
			{ kind: 'documentEncountered', id: 0, time: 1000, relativePath: 'src/same_file_jump.ts' },
			{ kind: 'setContent', id: 0, time: 1000, content: documentContent, v: 1 },
			{ kind: 'selectionChanged', id: 0, time: 1001, selection: [[0, 0]] },
			{
				kind: 'changed',
				id: 0,
				time: 400_000,
				edit: [[0, 0, '']],
				v: 2,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			{ kind: 'selectionChanged', id: 0, time: 400_300, selection: [[cursorOffset, cursorOffset]] },
			{
				kind: 'changed',
				id: 0,
				time: 400_400,
				edit: [[jumpEditOffset, jumpEditOffset, 'X']],
				v: 3,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			{ kind: 'selectionChanged', id: 0, time: 401_000, selection: [[boundaryOffset, boundaryOffset]] },
		];

		const { samples, logs } = await runRecording(entries, NesDatagenSampleTask.CursorSameFile);
		expect(samples.map(sample => ({
			task: sample.metadata.task,
			jump: 'jump' in sample.metadata ? sample.metadata.jump : undefined,
			pivotKind: sample.metadata.workspaceRecording?.pivotKind,
			stopReason: sample.metadata.workspaceRecording?.oracleStopReason,
		})), logs.join('\n')).toEqual([{
			task: NesDatagenSampleTask.CursorSameFile,
			jump: { fromLine: 2, toLine: 25, distance: 23 },
			pivotKind: 'cursor-move',
			stopReason: 'cursor-move',
		}]);
	});
});
