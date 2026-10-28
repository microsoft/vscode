/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDiffComputer as IExternalDiffComputer, createDiffComputer as createExternalDiffComputer } from '@vscode/diff';
import { resolveAmdNodeModulePath } from '../../../amdX.js';
import { LineRange } from '../core/ranges/lineRange.js';
import { OffsetRange } from '../core/ranges/offsetRange.js';
import { StringText } from '../core/text/abstractText.js';
import { ensureDependenciesAreSet } from '../core/text/positionToOffset.js';
import { ILinesDiffComputer, ILinesDiffComputerOptions, LinesDiff, MovedText } from './linesDiffComputer.js';
import { lineRangeMappingFromRangeMappings, LineRangeMapping, RangeMapping } from './rangeMapping.js';

type ExternalDiffModule = { createDiffComputer: typeof createExternalDiffComputer };

let externalModulePromise: Promise<ExternalDiffModule> | undefined;

function loadExternalModule(): Promise<ExternalDiffModule> {
	if (!externalModulePromise) {
		const url = resolveAmdNodeModulePath('@vscode/diff', 'dist/index.js');
		// Use a runtime-computed URL to keep bundlers from rewriting the import.
		externalModulePromise = import(/* webpackIgnore: true */ /* @vite-ignore */ `${url}`) as Promise<ExternalDiffModule>;
	}
	return externalModulePromise;
}

const externalComputers = new Map<boolean, Promise<ILinesDiffComputer>>();

export function getExternalLinesDiffComputer(useWasm: boolean): Promise<ILinesDiffComputer> {
	let computer = externalComputers.get(useWasm);
	if (!computer) {
		computer = loadExternalModule().then(m => createExternalLinesDiffComputer(m, useWasm));
		externalComputers.set(useWasm, computer);
	}
	return computer;
}

export async function createExternalLinesDiffComputer(externalModule: ExternalDiffModule, useWasm: boolean): Promise<ILinesDiffComputer> {
	return new ExternalLinesDiffComputer(await externalModule.createDiffComputer({ useWasm }));
}

/**
 * Adapts the offset-based string edit of `@vscode/diff` to line range mappings.
 */
class ExternalLinesDiffComputer implements ILinesDiffComputer {
	constructor(private readonly _computer: IExternalDiffComputer) { }

	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): LinesDiff {
		ensureDependenciesAreSet();

		const originalText = new StringText(originalLines.join('\n'));
		const modifiedText = new StringText(modifiedLines.join('\n'));

		// Always diff whitespace, so that the edit reproduces the modified text.
		// Ignoring trim whitespace only hides some of its replacements.
		const result = this._computer.computeDiff(originalText.value, modifiedText.value, {
			ignoreTrimWhitespace: false,
			// TODO: forward `maxComputationTimeMs` after updating @vscode/diff. The wasm build of the pinned version panics when measuring time.
			computeMoves: options.computeMoves,
			extendToSubwords: options.extendToSubwords,
		});

		const originalTransformer = originalText.getTransformer();
		const modifiedTransformer = modifiedText.getTransformer();

		const rangeMappings: RangeMapping[] = [];
		let delta = 0;
		for (const r of result.edits.replacements) {
			const originalRange = new OffsetRange(r.range.start, r.range.endExclusive);
			const modifiedRange = new OffsetRange(r.range.start + delta, r.range.start + delta + r.newText.length);
			delta += r.newText.length - originalRange.length;

			if (options.ignoreTrimWhitespace && isInTrimWhitespace(originalText.value, originalRange) && isInTrimWhitespace(modifiedText.value, modifiedRange)) {
				continue;
			}
			rangeMappings.push(new RangeMapping(originalTransformer.getRange(originalRange), modifiedTransformer.getRange(modifiedRange)));
		}

		const changes = lineRangeMappingFromRangeMappings(rangeMappings, originalText, modifiedText);

		const moves: MovedText[] = [];
		if (options.computeMoves) {
			for (const move of result.moves) {
				const originalStartPos = originalTransformer.getPosition(move.range.original.start);
				const originalEndPos = originalTransformer.getPosition(move.range.original.endExclusive);
				const modifiedStartPos = modifiedTransformer.getPosition(move.range.modified.start);
				const modifiedEndPos = modifiedTransformer.getPosition(move.range.modified.endExclusive);
				const originalLineRange = new LineRange(originalStartPos.lineNumber, originalEndPos.lineNumber);
				const modifiedLineRange = new LineRange(modifiedStartPos.lineNumber, modifiedEndPos.lineNumber);
				moves.push(new MovedText(new LineRangeMapping(originalLineRange, modifiedLineRange), []));
			}
		}

		return new LinesDiff(changes, moves, result.hitTimeout);
	}
}

const whitespaceWithoutLineBreak = /^[^\S\n]*$/;

/**
 * Whether `range` only covers whitespace before the first or after the last non-whitespace character of a single line.
 * Changes to such whitespace are hidden when ignoring trim whitespace.
 */
function isInTrimWhitespace(text: string, range: OffsetRange): boolean {
	if (!whitespaceWithoutLineBreak.test(range.substring(text))) {
		return false;
	}
	const lineStart = range.start === 0 ? 0 : text.lastIndexOf('\n', range.start - 1) + 1;
	const nextLineBreak = text.indexOf('\n', range.endExclusive);
	const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
	return whitespaceWithoutLineBreak.test(text.substring(lineStart, range.start))
		|| whitespaceWithoutLineBreak.test(text.substring(range.endExclusive, lineEnd));
}