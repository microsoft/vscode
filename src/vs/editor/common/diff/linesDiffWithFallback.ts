/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../base/common/errors.js';
import type { DiffAlgorithmName } from '../services/editorWorker.js';
import { DiffFallbackReason } from './documentDiffProvider.js';
import { ILinesDiffComputer, ILinesDiffComputerOptions, LinesDiff } from './linesDiffComputer.js';
import { linesDiffComputers } from './linesDiffComputers.js';
import { LinesDiffValidity, verifyLinesDiff } from './verifyLinesDiff.js';

export interface ILinesDiffWithFallback {
	readonly result: LinesDiff;
	readonly validity: LinesDiffValidity | undefined;
	readonly fallback: DiffFallbackReason | undefined;
}

/**
 * Computes a diff with the requested algorithm. Diffs from `@vscode/diff` are replaced by the built-in
 * algorithm's diff if the package throws, or if `verify` is set and the diff turns out to be invalid.
 * Verification is linear in the document size, so it only happens for sampled diffs.
 * The built-in algorithms are used as is.
 */
export async function computeLinesDiffWithFallback(
	originalLines: string[],
	modifiedLines: string[],
	options: ILinesDiffComputerOptions,
	algorithm: DiffAlgorithmName,
	verify: boolean,
	resolve: (algorithm: DiffAlgorithmName) => ILinesDiffComputer | Promise<ILinesDiffComputer>,
): Promise<ILinesDiffWithFallback> {
	const verifyDiff = (diff: LinesDiff) => verify ? verifyLinesDiff(diff, originalLines, modifiedLines, options.ignoreTrimWhitespace) : undefined;
	const computeBuiltin = (fallback: DiffFallbackReason) => {
		const result = linesDiffComputers.getDefault().computeDiff(originalLines, modifiedLines, options);
		return { result, validity: verifyDiff(result), fallback };
	};

	const isPackage = algorithm === 'advanced-external' || algorithm === 'advanced-wasm';
	let result: LinesDiff;
	try {
		result = (await resolve(algorithm)).computeDiff(originalLines, modifiedLines, options);
	} catch (e) {
		if (!isPackage) {
			throw e;
		}
		onUnexpectedError(e);
		return computeBuiltin('error');
	}

	const validity = verifyDiff(result);
	if (isPackage && validity === 'invalid') {
		return computeBuiltin('invalid');
	}
	return { result, validity, fallback: undefined };
}
