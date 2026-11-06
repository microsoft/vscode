/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ISerializedEdit } from '../../src/platform/workspaceRecorder/common/workspaceLog';
import { NesDatagenSampleTask } from '../base/simulationOptions';
import { Scoring } from './alternativeAction/types';
import { type ISample, validateSample } from './output';
import type { IProcessedRow } from './replayRecording';

const scoredEditsFilePattern = /^(?<sampleId>-?\d+)\.scoredEdits\.w\.json$/;

export interface IWriteScoredEditsResult {
	readonly outputDirectory: string;
	readonly written: number;
}

export async function writeScoredEditsFiles(
	outputDirectory: string,
	samples: readonly ISample[],
	processedRows: readonly IProcessedRow[],
	rowOffset: number,
): Promise<IWriteScoredEditsResult> {
	const processedBySampleId = new Map(
		processedRows.map(row => [row.originalRowIndex + rowOffset, row]),
	);
	const validSamples = samples.filter(sample => validateSample(sample).valid);
	const fileNames = new Set<string>();
	for (const sample of validSamples) {
		const fileName = getScoredEditsFileName(sample);
		if (fileNames.has(fileName)) {
			throw new Error(`Multiple samples have ID ${sample.metadata.rowIndex}`);
		}
		fileNames.add(fileName);
		validateProcessedRow(sample, processedBySampleId);
	}

	const resolvedOutputDirectory = path.resolve(outputDirectory);
	await fs.mkdir(resolvedOutputDirectory, { recursive: true });
	for (const sample of validSamples) {
		const file = createScoredEditsFile(sample, processedBySampleId);
		await fs.writeFile(
			path.join(resolvedOutputDirectory, file.fileName),
			JSON.stringify(file.scoring, null, '\t') + '\n',
		);
	}

	return { outputDirectory: resolvedOutputDirectory, written: validSamples.length };
}

export async function publishScoredEditsFiles(
	samplesOutputPath: string,
	stagedSamplesOutputPath: string,
	samples: readonly ISample[],
	stagingDirectories: readonly string[],
	rename: typeof fs.rename = fs.rename,
): Promise<IWriteScoredEditsResult> {
	const validSamples = samples.filter(sample => validateSample(sample).valid);
	const expectedIds = new Set(validSamples.map(sample => sample.metadata.rowIndex));
	if (expectedIds.size !== validSamples.length) {
		throw new Error('Generated samples contain duplicate IDs');
	}

	const stagedFiles = new Map<number, string>();
	for (const stagingDirectory of stagingDirectories) {
		const entries = await fs.readdir(stagingDirectory, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) {
				throw new Error(`Unexpected directory in scoredEdits staging output: ${path.join(stagingDirectory, entry.name)}`);
			}
			const match = scoredEditsFilePattern.exec(entry.name);
			if (!match?.groups) {
				throw new Error(`Unexpected file in scoredEdits staging output: ${path.join(stagingDirectory, entry.name)}`);
			}
			const sampleId = Number(match.groups['sampleId']);
			if (stagedFiles.has(sampleId)) {
				throw new Error(`Multiple staged scoredEdits files have sample ID ${sampleId}`);
			}
			stagedFiles.set(sampleId, path.join(stagingDirectory, entry.name));
		}
	}

	for (const expectedId of expectedIds) {
		if (!stagedFiles.has(expectedId)) {
			throw new Error(`Missing staged scoredEdits file for sample ID ${expectedId}`);
		}
	}
	for (const stagedId of stagedFiles.keys()) {
		if (!expectedIds.has(stagedId)) {
			throw new Error(`Staged scoredEdits file has no generated sample with ID ${stagedId}`);
		}
	}

	const outputDirectory = resolveScoredEditsOutputDirectory(samplesOutputPath);
	const parentDirectory = path.dirname(outputDirectory);
	await fs.mkdir(parentDirectory, { recursive: true });
	const pendingDirectory = await fs.mkdtemp(path.join(parentDirectory, `.${path.basename(outputDirectory)}.pending-`));
	try {
		const pendingSamplesOutputPath = path.join(pendingDirectory, path.basename(samplesOutputPath));
		const pendingScoredEditsDirectory = path.join(pendingDirectory, path.basename(outputDirectory));
		await fs.copyFile(stagedSamplesOutputPath, pendingSamplesOutputPath);
		await fs.mkdir(pendingScoredEditsDirectory);
		for (const [sampleId, stagedFile] of stagedFiles) {
			await fs.copyFile(stagedFile, path.join(pendingScoredEditsDirectory, `${sampleId}.scoredEdits.w.json`));
		}
		await replaceGeneratedOutputs(
			[
				{ source: pendingSamplesOutputPath, target: path.resolve(samplesOutputPath) },
				{ source: pendingScoredEditsDirectory, target: outputDirectory },
			],
			rename,
		);
	} finally {
		await fs.rm(pendingDirectory, { recursive: true, force: true });
	}

	return { outputDirectory, written: stagedFiles.size };
}

export function resolveScoredEditsOutputDirectory(samplesOutputPath: string): string {
	const parsed = path.parse(path.resolve(samplesOutputPath));
	return path.join(parsed.dir, `${parsed.name}.scoredEdits`);
}

function createScoredEditsFile(
	sample: ISample,
	processedBySampleId: ReadonlyMap<number, IProcessedRow>,
): { readonly fileName: string; readonly scoring: Scoring.t } {
	const processedRow = validateProcessedRow(sample, processedBySampleId);
	const oracleEdits: ISerializedEdit = sample.metadata.oracleEdits.map(
		([start, endEx, text]) => [start, endEx, text],
	);
	const recording = {
		log: [...processedRow.recordingInfo.log],
		nextUserEdit: {
			edit: oracleEdits,
			relativePath: processedRow.nextUserEdit.relativePath,
			originalOpIdx: processedRow.nextUserEdit.originalOpIdx,
		},
	};
	return {
		fileName: getScoredEditsFileName(sample),
		scoring: Scoring.create(recording, [{
			documentUri: processedRow.nextUserEdit.relativePath,
			edit: oracleEdits,
			scoreCategory: 'nextEdit',
			score: 0,
		}]),
	};
}

function validateProcessedRow(
	sample: ISample,
	processedBySampleId: ReadonlyMap<number, IProcessedRow>,
): IProcessedRow {
	if (sample.metadata.task !== NesDatagenSampleTask.Xtab) {
		throw new Error(`Sample ${sample.metadata.rowIndex} is not an xtab sample`);
	}
	const processedRow = processedBySampleId.get(sample.metadata.rowIndex);
	if (!processedRow) {
		throw new Error(`No processed row found for sample ${sample.metadata.rowIndex}`);
	}
	if (!serializedEditsEqual(sample.metadata.oracleEdits, processedRow.nextUserEdit.edit)) {
		throw new Error(`Expected next edit does not match the recording for sample ${sample.metadata.rowIndex}`);
	}
	return processedRow;
}

function getScoredEditsFileName(sample: ISample): string {
	return `${sample.metadata.rowIndex}.scoredEdits.w.json`;
}

interface IOutputReplacement {
	readonly source: string;
	readonly target: string;
}

async function replaceGeneratedOutputs(replacements: readonly IOutputReplacement[], rename: typeof fs.rename): Promise<void> {
	const backups = new Map<string, string>();
	try {
		for (const replacement of replacements) {
			const backup = `${replacement.target}.backup-${randomUUID()}`;
			try {
				await rename(replacement.target, backup);
				backups.set(replacement.target, backup);
			} catch (error) {
				if (!isFileNotFoundError(error)) {
					throw error;
				}
			}
		}
	} catch (error) {
		const rollbackErrors = await restoreBackups(backups, rename);
		if (rollbackErrors.length > 0) {
			throw new AggregateError([error, ...rollbackErrors], 'Failed to prepare generated output publication and restore existing outputs');
		}
		throw error;
	}

	const publishedTargets: string[] = [];
	try {
		for (const replacement of replacements) {
			await rename(replacement.source, replacement.target);
			publishedTargets.push(replacement.target);
		}
	} catch (publishError) {
		const rollbackErrors: Error[] = [];
		for (const publishedTarget of publishedTargets.reverse()) {
			try {
				await fs.rm(publishedTarget, { recursive: true, force: true });
			} catch (error) {
				rollbackErrors.push(toError(error));
			}
		}
		rollbackErrors.push(...await restoreBackups(backups, rename));
		if (rollbackErrors.length > 0) {
			throw new AggregateError([publishError, ...rollbackErrors], 'Failed to publish generated outputs and restore previous outputs');
		}
		throw publishError;
	}

	for (const backup of backups.values()) {
		await fs.rm(backup, { recursive: true, force: true });
	}
}

function isFileNotFoundError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function restoreBackups(backups: ReadonlyMap<string, string>, rename: typeof fs.rename): Promise<Error[]> {
	const errors: Error[] = [];
	for (const [target, backup] of [...backups].reverse()) {
		try {
			await rename(backup, target);
		} catch (error) {
			errors.push(toError(error));
		}
	}
	return errors;
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function serializedEditsEqual(
	first: readonly (readonly [number, number, string])[],
	second: readonly (readonly [number, number, string])[],
): boolean {
	return first.length === second.length && first.every((edit, index) =>
		edit[0] === second[index][0]
		&& edit[1] === second[index][1]
		&& edit[2] === second[index][2]
	);
}
