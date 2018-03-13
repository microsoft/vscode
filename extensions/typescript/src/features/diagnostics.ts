/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, DiagnosticCollection, languages, Uri } from 'vscode';

class DiagnosticSet {
	private _map: ObjectMap<Diagnostic[]> = Object.create(null);

	public set(
		file: Uri,
		diagnostics: Diagnostic[]
	) {
		this._map[this.key(file)] = diagnostics;
	}

	public get(
		file: Uri
	): Diagnostic[] {
		return this._map[this.key(file)] || [];
	}

	public clear(): void {
		this._map = Object.create(null);
	}

	private key(file: Uri): string {
		return file.toString(true);
	}
}

export default class DiagnosticsManager {

	private readonly syntaxDiagnostics: DiagnosticSet;
	private readonly semanticDiagnostics: DiagnosticSet;
	private readonly currentDiagnostics: DiagnosticCollection;
	private _validate: boolean = true;

	constructor(
		language: string
	) {
		this.syntaxDiagnostics = new DiagnosticSet();
		this.semanticDiagnostics = new DiagnosticSet();
		this.currentDiagnostics = languages.createDiagnosticCollection(language);
	}

	public dispose() {
		this.currentDiagnostics.dispose();
	}

	public reInitialize(): void {
		this.currentDiagnostics.clear();
		this.syntaxDiagnostics.clear();
		this.semanticDiagnostics.clear();
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
		this.syntaxDiagnostics.set(file, syntaxDiagnostics);
		this.updateCurrentDiagnostics(file);
	}

	public semanticDiagnosticsReceived(file: Uri, semanticDiagnostics: Diagnostic[]): void {
		this.semanticDiagnostics.set(file, semanticDiagnostics);
		this.updateCurrentDiagnostics(file);
	}

	public configFileDiagnosticsReceived(file: Uri, diagnostics: Diagnostic[]): void {
		this.currentDiagnostics.set(file, diagnostics);
	}

	public delete(resource: Uri): void {
		this.currentDiagnostics.delete(resource);
	}

	private updateCurrentDiagnostics(file: Uri) {
		if (!this._validate) {
			return;
		}

		const semanticDiagnostics = this.semanticDiagnostics.get(file);
		const syntaxDiagnostics = this.syntaxDiagnostics.get(file);
		this.currentDiagnostics.set(file, semanticDiagnostics.concat(syntaxDiagnostics));
	}

	public getDiagnostics(file: Uri): Diagnostic[] {
		return this.currentDiagnostics.get(file) || [];
	}
}