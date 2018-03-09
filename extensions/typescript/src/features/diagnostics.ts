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

export enum DiagnosticKind {
	Syntax,
	Semantic,
	Suggestion
}

export class DiagnosticsManager {

	private readonly diagnostics: Map<DiagnosticKind, DiagnosticSet>;
	private readonly currentDiagnostics: DiagnosticCollection;
	private _validate: boolean = true;

	constructor(
		language: string
	) {
		this.diagnostics = new Map([
			[DiagnosticKind.Syntax, new DiagnosticSet()],
			[DiagnosticKind.Semantic, new DiagnosticSet()],
			[DiagnosticKind.Suggestion, new DiagnosticSet()]
		]);
		this.currentDiagnostics = languages.createDiagnosticCollection(language);
	}

	public dispose() {
		this.currentDiagnostics.dispose();
	}

	public reInitialize(): void {
		this.currentDiagnostics.clear();

		for (const diagnosticSet of this.diagnostics.values()) {
			diagnosticSet.clear();
		}
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

	public diagnosticsReceived(
		kind: DiagnosticKind,
		file: Uri,
		syntaxDiagnostics: Diagnostic[]
	): void {
		const diagnostics = this.diagnostics.get(kind);
		if (diagnostics) {
			diagnostics.set(file, syntaxDiagnostics);
			this.updateCurrentDiagnostics(file);
		}
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

		const semanticDiagnostics = this.diagnostics.get(DiagnosticKind.Semantic)!.get(file);
		const syntaxDiagnostics = this.diagnostics.get(DiagnosticKind.Syntax)!.get(file);
		const suggestionDiagnostics = this.diagnostics.get(DiagnosticKind.Suggestion)!.get(file);
		this.currentDiagnostics.set(file, semanticDiagnostics.concat(syntaxDiagnostics, suggestionDiagnostics));
	}

	public getDiagnostics(file: Uri): Diagnostic[] {
		return this.currentDiagnostics.get(file) || [];
	}
}