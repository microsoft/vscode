/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { isEqual } from '../../../util/vs/base/common/resources';
import { DiagnosticSeverity } from '../../../vscodeTypes';

export const ILanguageDiagnosticsService = createServiceIdentifier<ILanguageDiagnosticsService>('ILanguageDiagnosticService');

export interface ILanguageDiagnosticsService {
	_serviceBrand: undefined;
	onDidChangeDiagnostics: vscode.Event<vscode.DiagnosticChangeEvent>;
	getDiagnostics(resource: vscode.Uri): vscode.Diagnostic[];
	getAllDiagnostics(): [vscode.Uri, vscode.Diagnostic[]][];
	waitForNewDiagnostics(resource: vscode.Uri, token: vscode.CancellationToken, timeout?: number): Promise<vscode.Diagnostic[]>;
}

export abstract class AbstractLanguageDiagnosticsService implements ILanguageDiagnosticsService {

	declare readonly _serviceBrand: undefined;

	abstract onDidChangeDiagnostics: vscode.Event<vscode.DiagnosticChangeEvent>;

	abstract getDiagnostics(resource: vscode.Uri): vscode.Diagnostic[];
	abstract getAllDiagnostics(): [vscode.Uri, vscode.Diagnostic[]][];

	waitForNewDiagnostics(resource: vscode.Uri, token: vscode.CancellationToken, timeout: number = 5000): Promise<vscode.Diagnostic[]> {
		let onCancellationRequest: vscode.Disposable;
		let diagnosticsChangeListener: vscode.Disposable;
		let timer: any;
		return new Promise<vscode.Diagnostic[]>((resolve) => {
			onCancellationRequest = token.onCancellationRequested(() => resolve([]));
			timer = setTimeout(() => resolve(this.getDiagnostics(resource)), timeout);
			diagnosticsChangeListener = this.onDidChangeDiagnostics(e => {
				for (const uri of e.uris) {
					if (isEqual(uri, resource)) {
						resolve(this.getDiagnostics(resource));
						break;
					}
				}
			});
		}).finally(() => {
			onCancellationRequest.dispose();
			diagnosticsChangeListener.dispose();
			clearTimeout(timer);
		});
	}
}

/**
* Smallest range covering all of the diagnostics
* @param diagnostics diagnostics to cover
* @returns minimal covering range
*/
export function rangeSpanningDiagnostics(diagnostics: vscode.Diagnostic[]): vscode.Range {
	return diagnostics.map(d => d.range).reduce((a, b) => a.union(b));
}

export function isError(diagnostics: vscode.Diagnostic) {
	return diagnostics.severity === DiagnosticSeverity.Error;
}

export function getDiagnosticsAtSelection(diagnostics: vscode.Diagnostic[], selection: vscode.Range, severities: DiagnosticSeverity[] = [DiagnosticSeverity.Error, DiagnosticSeverity.Warning]): vscode.Diagnostic | undefined {
	return diagnostics.find(d => d.range.contains(selection) && severities.includes(d.severity));
}
