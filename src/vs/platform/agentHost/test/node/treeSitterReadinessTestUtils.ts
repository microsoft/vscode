/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ITreeSitterReadiness } from '../../node/commandAutoApprover.js';

/**
 * Asserts that tree-sitter is fully usable before running tests that depend on
 * shell command analysis.
 *
 * Without a working parser and both grammars, every command silently degrades
 * to `noMatch` (fail-closed). In a test suite that surfaces as many unrelated
 * looking assertion mismatches rather than one actionable failure — see
 * https://github.com/microsoft/vscode-engineering/issues/3484, where a single
 * environment problem produced 37 of them across three suites.
 */
export function assertTreeSitterReady(readiness: ITreeSitterReadiness): void {
	assert.deepStrictEqual(
		readiness,
		{ parser: true, bash: true, powershell: true },
		'tree-sitter must be fully available for these tests');
}
