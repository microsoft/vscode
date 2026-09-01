/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { serializeDiagnostic } from '../diagnosticsChanged';

suite('serializeDiagnostic', () => {
	const range = new vscode.Range(0, 0, 0, 1);

	test('preserves a null code without throwing', () => {
		const diagnostic = new vscode.Diagnostic(range, 'no code', vscode.DiagnosticSeverity.Warning);
		diagnostic.code = null as unknown as undefined;

		const serialized = serializeDiagnostic(diagnostic);

		assert.strictEqual(serialized.code, null);
	});

	test('serializes string, number and structured codes', () => {
		const stringDiagnostic = new vscode.Diagnostic(range, 'string code', vscode.DiagnosticSeverity.Error);
		stringDiagnostic.code = 'no-unused-vars';

		const numberDiagnostic = new vscode.Diagnostic(range, 'number code', vscode.DiagnosticSeverity.Error);
		numberDiagnostic.code = 42;

		const structuredDiagnostic = new vscode.Diagnostic(range, 'structured code', vscode.DiagnosticSeverity.Error);
		structuredDiagnostic.code = { value: 'E123', target: vscode.Uri.parse('https://example.com') };

		assert.deepStrictEqual(
			[stringDiagnostic, numberDiagnostic, structuredDiagnostic].map(d => serializeDiagnostic(d).code),
			['no-unused-vars', 42, 'E123']
		);
	});
});
