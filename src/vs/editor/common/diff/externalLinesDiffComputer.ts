/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDiffComputer as IExternalDiffComputer, createDiffComputer as createExternalDiffComputer } from '@vscode/diff';
import { resolveAmdNodeModulePath } from '../../../amdX.js';
import { LineRange } from '../core/ranges/lineRange.js';
import { OffsetRange } from '../core/ranges/offsetRange.js';
import { StringText } from '../core/text/abstractText.js';
import { PositionOffsetTransformerBase } from '../core/text/positionToOffsetImpl.js';
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

		// The edit always contains whitespace changes, so it reproduces the modified text.
		// Ignoring trim whitespace only hides the replacements annotated as such.
		const result = this._computer.computeDiff(originalText.value, modifiedText.value, {
			maxComputationTimeMs: options.maxComputationTimeMs,
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

			if (options.ignoreTrimWhitespace && r.data.isTrimWhitespaceChange) {
				continue;
			}
			rangeMappings.push(new RangeMapping(originalTransformer.getRange(originalRange), modifiedTransformer.getRange(modifiedRange)));
		}

		const changes = lineRangeMappingFromRangeMappings(rangeMappings, originalText, modifiedText);

		const moves: MovedText[] = [];
		if (options.computeMoves) {
			for (const move of result.moves) {
				const original = move.range.original;
				const modified = move.range.modified;

				// The inner edit is relative to the moved text.
				const innerMappings: RangeMapping[] = [];
				let innerDelta = 0;
				for (const r of move.innerEdit.replacements) {
					const innerOriginal = new OffsetRange(original.start + r.range.start, original.start + r.range.endExclusive);
					const innerModified = new OffsetRange(modified.start + r.range.start + innerDelta, modified.start + r.range.start + innerDelta + r.newText.length);
					innerDelta += r.newText.length - innerOriginal.length;
					innerMappings.push(new RangeMapping(originalTransformer.getRange(innerOriginal), modifiedTransformer.getRange(innerModified)));
				}

				moves.push(new MovedText(
					new LineRangeMapping(toLineRange(originalTransformer, original), toLineRange(modifiedTransformer, modified)),
					lineRangeMappingFromRangeMappings(innerMappings, originalText, modifiedText, true),
				));
			}
		}

		return new LinesDiff(changes, moves, result.hitTimeout);
	}
}

/**
 * Moves cover whole lines. Their range ends after the line break of the last moved line,
 * or at the end of the document if that line is the last one.
 */
function toLineRange(transformer: PositionOffsetTransformerBase, range: { readonly start: number; readonly endExclusive: number }): LineRange {
	const start = transformer.getPosition(range.start);
	const end = transformer.getPosition(range.endExclusive);
	return new LineRange(start.lineNumber, end.column === 1 ? end.lineNumber : end.lineNumber + 1);
}