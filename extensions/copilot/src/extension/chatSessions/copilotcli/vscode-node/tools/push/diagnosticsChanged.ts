/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogger } from '../../../../../../platform/log/common/logService';
import { Delayer } from '../../../../../../util/vs/base/common/async';
import { InProcHttpServer } from '../../inProcHttpServer';

interface DiagnosticInfo {
	uri: string;
	diagnostics: Array<{
		range: {
			start: { line: number; character: number };
			end: { line: number; character: number };
		};
		message: string;
		severity: string;
		source?: string;
		code?: string | number;
	}>;
}

function severityToString(severity: vscode.DiagnosticSeverity): string {
	switch (severity) {
		case vscode.DiagnosticSeverity.Error:
			return 'error';
		case vscode.DiagnosticSeverity.Warning:
			return 'warning';
		case vscode.DiagnosticSeverity.Information:
			return 'information';
		case vscode.DiagnosticSeverity.Hint:
			return 'hint';
		default:
			return 'unknown';
	}
}

function getDiagnosticsForUri(uri: vscode.Uri): DiagnosticInfo {
	const diagnostics = vscode.languages.getDiagnostics(uri);
	return {
		uri: uri.toString(),
		diagnostics: diagnostics.map(d => ({
			range: {
				start: { line: d.range.start.line, character: d.range.start.character },
				end: { line: d.range.end.line, character: d.range.end.character },
			},
			message: d.message,
			severity: severityToString(d.severity),
			source: d.source,
			code: typeof d.code === 'object' ? d.code.value : d.code,
		})),
	};
}

export function registerDiagnosticsChangedNotification(logger: ILogger, httpServer: InProcHttpServer): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	const diagnosticsDelayer = new Delayer<void>(200);
	const handleDiagnosticsChange = (event: vscode.DiagnosticChangeEvent) => {
		diagnosticsDelayer.trigger(() => {
			const changedDiagnostics: DiagnosticInfo[] = event.uris.map(uri => getDiagnosticsForUri(uri));
			httpServer.broadcastNotification('diagnostics_changed', {
				uris: changedDiagnostics,
			} as unknown as Record<string, unknown>);
		});
	};

	disposables.push(vscode.languages.onDidChangeDiagnostics(handleDiagnosticsChange));
	disposables.push(diagnosticsDelayer);

	logger.debug('Registered diagnostics change notification');
	return disposables;
}
