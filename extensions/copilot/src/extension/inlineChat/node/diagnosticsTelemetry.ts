/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';


export interface DiagnosticsTelemetryData {
	problems: string;
	problemsCount: number;
	diagnosticCodes: string;
	diagnosticsCount: number;
}

export function findDiagnosticsTelemetry(selection: vscode.Selection, fileDiagnostics: vscode.Diagnostic[]): { fileDiagnosticsTelemetry: DiagnosticsTelemetryData; selectionDiagnosticsTelemetry: DiagnosticsTelemetryData; diagnosticsProvider: string } {
	const selectionDiagnostics = fileDiagnostics.filter(d => selection.intersection(d.range));
	const fileDiagnosticsTelemetry: DiagnosticsTelemetryData = {
		problems: fileDiagnostics.map(d => d.message).join(', '),
		problemsCount: fileDiagnostics.length,
		diagnosticCodes: '',
		diagnosticsCount: 0
	};
	const selectionDiagnosticsTelemetry: DiagnosticsTelemetryData = {
		problems: selectionDiagnostics.map(d => d.message).join(', '),
		problemsCount: selectionDiagnostics.length,
		diagnosticCodes: '',
		diagnosticsCount: 0
	};
	const fileDiagnosticCodesMap = new Map<string, number>();
	const selectionDiagnosticCodesMap = new Map<string, number>();
	fileDiagnostics.forEach((d) => {
		const code = d.code;
		const codeValue = typeof code === 'string' || typeof code === 'number' ? code.toString() : (code ? code.value.toString() : '');
		const errorId = d.source ? `${d.source}@${codeValue}` : codeValue;
		fileDiagnosticCodesMap.set(errorId, (fileDiagnosticCodesMap.get(errorId) || 0) + 1);
		if (selection.intersection(d.range)) {
			selectionDiagnosticCodesMap.set(errorId, (selectionDiagnosticCodesMap.get(errorId) || 0) + 1);
		}
	});
	const findDiagnosticCodes = (errorMap: Map<string, number>): string => {
		let diagnosticsCodes = '';
		errorMap.forEach((value, key) => {
			diagnosticsCodes += `${key}:${value},`;
		});
		return diagnosticsCodes;
	};
	fileDiagnosticsTelemetry.diagnosticCodes = findDiagnosticCodes(fileDiagnosticCodesMap);
	fileDiagnosticsTelemetry.diagnosticsCount = fileDiagnosticCodesMap.size;
	selectionDiagnosticsTelemetry.diagnosticCodes = findDiagnosticCodes(selectionDiagnosticCodesMap);
	selectionDiagnosticsTelemetry.diagnosticsCount = selectionDiagnosticCodesMap.size;
	const diagnosticsProvider = fileDiagnostics.length > 0 ? (fileDiagnostics[0].source ?? '') : '';
	return { fileDiagnosticsTelemetry, selectionDiagnosticsTelemetry, diagnosticsProvider };
}
