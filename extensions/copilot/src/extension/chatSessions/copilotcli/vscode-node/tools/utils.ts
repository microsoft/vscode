/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

/**
 * Normalizes a `vscode.Diagnostic.code` into a plain string or number for serialization.
 *
 * `Diagnostic.code` may be a string, a number, `undefined`, `null` (language servers and
 * extensions are free to set it), or a `{ value, target }` object. Because
 * `typeof null === 'object'`, callers must guard against `null` before reading `.value`;
 * this helper centralizes that guard so every consumer of `vscode.languages.getDiagnostics`
 * handles the value the same way.
 */
export function normalizeDiagnosticCode(code: vscode.Diagnostic['code']): string | number | undefined {
	if (typeof code === 'object' && code !== null) {
		return code.value;
	}
	return code;
}

export function makeTextResult(data: unknown): { content: [{ type: 'text'; text: string }] } {
	return {
		content: [
			{
				type: 'text',
				text: typeof data === 'string' ? data : (JSON.stringify(data, null, 2) ?? String(data)),
			},
		],
	};
}
