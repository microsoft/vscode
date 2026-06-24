/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AbstractLanguageDiagnosticsService } from '../common/languageDiagnosticsService';

export class LanguageDiagnosticsServiceImpl extends AbstractLanguageDiagnosticsService {
	private static ignoredSchemes = new Set(['git', 'chat-editing-snapshot-text-model', 'chat-editing-text-model']);
	override onDidChangeDiagnostics: vscode.Event<vscode.DiagnosticChangeEvent> = vscode.languages.onDidChangeDiagnostics;

	override getDiagnostics(resource: vscode.Uri): vscode.Diagnostic[] {
		return vscode.languages.getDiagnostics(resource);
	}

	override getAllDiagnostics(): [vscode.Uri, vscode.Diagnostic[]][] {
		return vscode.languages.getDiagnostics()
			.filter(([uri]) => !LanguageDiagnosticsServiceImpl.ignoredSchemes.has(uri.scheme));
	}
}
