/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Diagnostic, DiagnosticChangeEvent, Uri } from 'vscode';
import { Emitter } from '../../../util/vs/base/common/event';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { AbstractLanguageDiagnosticsService } from './languageDiagnosticsService';

export class TestLanguageDiagnosticsService extends AbstractLanguageDiagnosticsService {
	private diagnosticsMap = new ResourceMap<Diagnostic[]>();
	private _onDidChangeDiagnostics = new Emitter<DiagnosticChangeEvent>();
	public readonly onDidChangeDiagnostics = this._onDidChangeDiagnostics.event;

	setDiagnostics(resource: Uri, diagnostics: Diagnostic[]): void {
		this.diagnosticsMap.set(resource, diagnostics);
		this._onDidChangeDiagnostics.fire({ uris: [resource] });
	}

	override getDiagnostics(resource: Uri): Diagnostic[] {
		return this.diagnosticsMap.get(resource) || [];
	}

	override getAllDiagnostics(): [Uri, Diagnostic[]][] {
		return Array.from(this.diagnosticsMap.entries());
	}
}
