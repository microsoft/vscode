/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from '../../../src/util/vs/editor/common/core/ranges/offsetRange';
import { ICrossFileJump, ISameFileJump, normalizeRelativePathForModel } from './detectJump';

export interface ISameFileGeneratedResponse {
	readonly assistant: string;
	readonly jump: {
		readonly fromLine: number;
		readonly toLine: number;
		readonly distance: number;
	};
}

export interface ICrossFileGeneratedResponse {
	readonly assistant: string;
	readonly jump: {
		readonly fromLine: number;
		readonly toLine: number;
		readonly toFilePath: string;
		readonly distance: number;
	};
}

/**
 * Format a same-file jump as `<lineNumber>` (0-based, document-line space).
 * Returns an error when the target line falls outside the prompt's kept
 * range — the predictor rejects such outputs at parse time so we drop the
 * sample at generation time instead of poisoning the dataset.
 */
export function generateSameFileResponse(
	jump: ISameFileJump,
	keptRange: OffsetRange,
): ISameFileGeneratedResponse | { error: string } {
	if (jump.toLine < keptRange.start || jump.toLine >= keptRange.endExclusive) {
		return { error: `outsideKeptRange (toLine=${jump.toLine}, keptRange=[${keptRange.start}, ${keptRange.endExclusive}))` };
	}
	return {
		assistant: String(jump.toLine),
		jump: {
			fromLine: jump.fromLine,
			toLine: jump.toLine,
			distance: Math.abs(jump.toLine - jump.fromLine),
		},
	};
}

/**
 * Format a cross-file jump as `<normalizedPath>:<lineNumber>`.
 * `jump.toLine` is guaranteed non-undefined by `detectCrossFileJump`.
 */
export function generateCrossFileResponse(
	jump: ICrossFileJump,
	cursorAtRequestLine: number,
): ICrossFileGeneratedResponse | { error: string } {
	const normalizedPath = normalizeRelativePathForModel(jump.toRelativePath);
	if (!normalizedPath) {
		return { error: 'crossFileEmptyPath' };
	}
	return {
		assistant: `${normalizedPath}:${jump.toLine}`,
		jump: {
			fromLine: cursorAtRequestLine,
			toLine: jump.toLine,
			toFilePath: normalizedPath,
			distance: 0,
		},
	};
}
