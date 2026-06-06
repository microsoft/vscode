/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { IGeneratedPrompt } from './promptStep';
import { IProcessedRow } from './replayRecording';
import { IGeneratedResponse } from './responseStep';
import { openWriteStream } from './writeStream';

export interface IMessage {
	readonly role: 'system' | 'user' | 'assistant';
	readonly content: string;
}

export interface ISampleMetadata {
	readonly rowIndex: number;
	readonly language: string;
	readonly strategy: string;
	readonly oracleEditCount: number;
	readonly suggestionStatus: string;
	readonly filePath: string;
	readonly docContent: string;
	readonly oracleEdits: readonly (readonly [start: number, endEx: number, text: string])[];
	readonly originalPrompt: unknown[];
	readonly modelResponse: string;
}

export interface ISample {
	readonly messages: readonly IMessage[];
	readonly metadata: ISampleMetadata;
}

interface ISkipReason {
	readonly rowIndex: number;
	readonly reason: string;
}

export interface IWriteResult {
	readonly written: number;
	readonly skipped: number;
	readonly skipReasons: readonly ISkipReason[];
	readonly fileSize: number;
	readonly outputPath: string;
	readonly languageCounts: ReadonlyMap<string, number>;
}

export function assembleSample(
	index: number,
	prompt: IGeneratedPrompt,
	response: IGeneratedResponse,
	processedRow: IProcessedRow,
	strategy: string,
	modelResponse: string,
): ISample {
	const messages: IMessage[] = [
		{ role: 'system', content: prompt.system },
		{ role: 'user', content: prompt.user },
		{ role: 'assistant', content: response.assistant },
	];

	const metadata: ISampleMetadata = {
		rowIndex: index,
		language: processedRow.row.activeDocumentLanguageId,
		strategy,
		oracleEditCount: processedRow.nextUserEdit?.edit?.length ?? 0,
		suggestionStatus: processedRow.row.suggestionStatus,
		filePath: processedRow.activeFilePath.replace(/\\/g, '/'),
		docContent: processedRow.activeDocument.value.get().value,
		oracleEdits: processedRow.nextUserEdit?.edit ?? [],
		originalPrompt: processedRow.row.prompt,
		modelResponse,
	};

	return { messages, metadata };
}

interface IStructuralValidationResult {
	readonly valid: boolean;
	readonly reason?: string;
}

/**
 * Structural check: ensures messages are non-empty before writing.
 */
export function validateSample(sample: ISample): IStructuralValidationResult {
	for (const msg of sample.messages) {
		if (msg.content === undefined || msg.content === null) {
			return { valid: false, reason: `${msg.role} message content is null/undefined` };
		}
	}

	const system = sample.messages.find(m => m.role === 'system');
	const user = sample.messages.find(m => m.role === 'user');
	const assistant = sample.messages.find(m => m.role === 'assistant');

	if (!system || !system.content.trim()) {
		return { valid: false, reason: 'Empty system message' };
	}
	if (!user || !user.content.trim()) {
		return { valid: false, reason: 'Empty user message' };
	}
	if (!assistant || !assistant.content.trim()) {
		return { valid: false, reason: 'Empty assistant message' };
	}

	return { valid: true };
}

export function resolveOutputPath(inputPath: string, explicitPath: string | undefined): string {
	if (explicitPath) {
		return path.resolve(explicitPath);
	}
	const parsed = path.parse(inputPath);
	return path.join(parsed.dir, `${parsed.name}_output.jsonl`);
}

/**
 * Write validated samples to a JSON Lines file (one JSON object per line).
 * Samples are sorted by rowIndex for deterministic output.
 *
 * JSONL was chosen over a pretty-printed JSON array specifically so the writer
 * (and any reader) can operate one record at a time, with no surrounding
 * brackets/commas to track. This keeps memory bounded for multi-GB outputs and
 * avoids hitting V8's ~512 MiB max-string-length limit.
 */
export async function writeSamples(
	outputPath: string,
	samples: readonly ISample[],
): Promise<IWriteResult> {
	const skipReasons: ISkipReason[] = [];
	const validSamples: ISample[] = [];

	for (const sample of samples) {
		const result = validateSample(sample);
		if (result.valid) {
			validSamples.push(sample);
		} else {
			skipReasons.push({
				rowIndex: sample.metadata.rowIndex,
				reason: result.reason!,
			});
		}
	}

	validSamples.sort((a, b) => a.metadata.rowIndex - b.metadata.rowIndex);

	const resolvedPath = path.resolve(outputPath);
	await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

	const writer = openWriteStream(resolvedPath);
	let fileSize = 0;

	try {
		for (const sample of validSamples) {
			const out = {
				messages: sample.messages.map(m => ({ role: m.role, content: m.content })),
				metadata: sample.metadata,
			};
			const line = JSON.stringify(out) + '\n';
			await writer.write(line);
			fileSize += Buffer.byteLength(line, 'utf-8');
		}
		await writer.close();
	} catch (err) {
		try { await writer.close(); } catch { /* swallow secondary errors */ }
		throw err;
	}

	const languageCounts = new Map<string, number>();
	for (const sample of validSamples) {
		const lang = sample.metadata.language || 'unknown';
		languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
	}

	return {
		written: validSamples.length,
		skipped: skipReasons.length,
		skipReasons,
		fileSize,
		outputPath: resolvedPath,
		languageCounts,
	};
}
