/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as ExternalDiff from '@vscode/diff';
import { resolveAmdNodeModulePath } from '../../../amdX.js';
import { Range } from '../core/range.js';
import { LineRange } from '../core/ranges/lineRange.js';
import { ILinesDiffComputer, ILinesDiffComputerOptions, LinesDiff, MovedText } from './linesDiffComputer.js';
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from './rangeMapping.js';

type ExternalDiffModule = typeof ExternalDiff;

let externalModulePromise: Promise<ExternalDiffModule> | undefined;

function loadExternalModule(): Promise<ExternalDiffModule> {
	if (!externalModulePromise) {
		const url = resolveAmdNodeModulePath('@vscode/diff', 'dist/index.js');
		// Use a runtime-computed URL to keep bundlers from rewriting the import.
		externalModulePromise = import(/* webpackIgnore: true */ /* @vite-ignore */ `${url}`) as Promise<ExternalDiffModule>;
	}
	return externalModulePromise;
}

export async function getExternalLinesDiffComputer(useWasm: boolean): Promise<ILinesDiffComputer> {
	return createExternalLinesDiffComputer(await loadExternalModule(), useWasm);
}

export async function createExternalLinesDiffComputer(externalModule: ExternalDiffModule, useWasm: boolean): Promise<ILinesDiffComputer> {
	if (useWasm) {
		await externalModule._initWasm();
		return new ExternalWasmLinesDiffComputer(externalModule);
	}
	return new ExternalTsLinesDiffComputer(externalModule);
}

/**
 * Uses the line-based diff of `@vscode/diff` instead of its string-edit API:
 * string edits cannot represent diffs that ignore trim whitespace, as applying them does not reproduce the modified text.
 */
class ExternalTsLinesDiffComputer implements ILinesDiffComputer {
	constructor(private readonly _module: ExternalDiffModule) { }

	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): LinesDiff {
		const result = new this._module._DefaultLinesDiffComputer().computeDiff(originalLines, modifiedLines, {
			ignoreTrimWhitespace: options.ignoreTrimWhitespace,
			maxComputationTimeMs: options.maxComputationTimeMs,
			computeMoves: options.computeMoves,
			extendToSubwords: options.extendToSubwords ?? false,
		});
		return new LinesDiff(
			result.changes.map(toDetailedLineRangeMapping),
			result.moves.map(m => new MovedText(
				new LineRangeMapping(toLineRange(m.lineRangeMapping.original), toLineRange(m.lineRangeMapping.modified)),
				m.changes.map(toDetailedLineRangeMapping),
			)),
			result.hitTimeout,
		);
	}
}

class ExternalWasmLinesDiffComputer implements ILinesDiffComputer {
	constructor(private readonly _module: ExternalDiffModule) { }

	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): LinesDiff {
		// serde-wasm-bindgen rejects properties that are present but `undefined`, so all options must be defined.
		const result = this._module._getWasm().computeDiffLines(originalLines, modifiedLines, {
			ignoreTrimWhitespace: options.ignoreTrimWhitespace,
			// TODO: support this. Currently throws with "Time is not implemented in this environment."
			// maxComputationTimeMs: options.maxComputationTimeMs,
			computeMoves: options.computeMoves,
			extendToSubwords: options.extendToSubwords ?? false,
		});
		const changes = result.changes.map(c => new DetailedLineRangeMapping(
			toLineRange(c.original),
			toLineRange(c.modified),
			c.innerChanges?.map(i => new RangeMapping(
				new Range(i.originalStartLine, i.originalStartColumn, i.originalEndLine, i.originalEndColumn),
				new Range(i.modifiedStartLine, i.modifiedStartColumn, i.modifiedEndLine, i.modifiedEndColumn),
			)),
		));
		return new LinesDiff(changes, [], result.hitTimeout);
	}
}

interface IExternalLineRange {
	readonly startLineNumber: number;
	readonly endLineNumberExclusive: number;
}

interface IExternalRange {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber: number;
	readonly endColumn: number;
}

interface IExternalDetailedLineRangeMapping {
	readonly original: IExternalLineRange;
	readonly modified: IExternalLineRange;
	readonly innerChanges: readonly { readonly originalRange: IExternalRange; readonly modifiedRange: IExternalRange }[] | undefined;
}

function toLineRange(r: IExternalLineRange): LineRange {
	return new LineRange(r.startLineNumber, r.endLineNumberExclusive);
}

function toRange(r: IExternalRange): Range {
	return new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn);
}

function toDetailedLineRangeMapping(c: IExternalDetailedLineRangeMapping): DetailedLineRangeMapping {
	return new DetailedLineRangeMapping(
		toLineRange(c.original),
		toLineRange(c.modified),
		c.innerChanges?.map(i => new RangeMapping(toRange(i.originalRange), toRange(i.modifiedRange))),
	);
}