/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, DiagnosticCollection, languages, Uri } from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';

export default class DiagnosticsManager {

	private syntaxDiagnostics: ObjectMap<Diagnostic[]>;
	private semanticDiagnostics: ObjectMap<Diagnostic[]>;
	private readonly currentDiagnostics: DiagnosticCollection;
	private _validate: boolean = true;

	constructor(
		language: string,
		private readonly client: ITypeScriptServiceClient
	) {
		this.syntaxDiagnostics = Object.create(null);
		this.semanticDiagnostics = Object.create(null);
		this.currentDiagnostics = languages.createDiagnosticCollection(language);
	}

	public dispose() {
		this.currentDiagnostics.dispose();
	}

	public reInitialize(): void {
		this.currentDiagnostics.clear();
		this.syntaxDiagnostics = Object.create(null);
		this.semanticDiagnostics = Object.create(null);
	}

	public set validate(value: boolean) {
		if (this._validate === value) {
			return;
		}
		this._validate = value;
		if (!value) {
			this.currentDiagnostics.clear();
		}
	}

	public syntaxDiagnosticsReceived(file: Uri, syntaxDiagnostics: Diagnostic[]): void {
		this.syntaxDiagnostics[this.key(file)] = syntaxDiagnostics;
		this.updateCurrentDiagnostics(file);
	}

	public semanticDiagnosticsReceived(file: Uri, semanticDiagnostics: Diagnostic[]): void {
		this.semanticDiagnostics[this.key(file)] = semanticDiagnostics;
		this.updateCurrentDiagnostics(file);
	}

	public configFileDiagnosticsReceived(file: Uri, diagnostics: Diagnostic[]): void {
		this.currentDiagnostics.set(file, diagnostics);
	}

	public delete(file: string): void {
		this.currentDiagnostics.delete(this.client.asUrl(file));
	}

	private key(file: Uri): string {
		return file.toString(true);
	}

	private updateCurrentDiagnostics(file: Uri) {
		if (!this._validate) {
			return;
		}

		const semanticDiagnostics = this.semanticDiagnostics[this.key(file)] || [];
		const syntaxDiagnostics = this.syntaxDiagnostics[this.key(file)] || [];
		this.currentDiagnostics.set(file, semanticDiagnostics.concat(syntaxDiagnostics));
	}
}