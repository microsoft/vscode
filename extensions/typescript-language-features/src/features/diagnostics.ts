/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import *  as vscode from 'vscode';

class DiagnosticSet {
	private _map: ObjectMap<vscode.Diagnostic[]> = Object.create(null);

	public set(
		file: vscode.Uri,
		diagnostics: vscode.Diagnostic[]
	) {
		this._map[this.key(file)] = diagnostics;
	}

	public get(file: vscode.Uri): vscode.Diagnostic[] {
		return this._map[this.key(file)] || [];
	}

	public clear(): void {
		this._map = Object.create(null);
	}

	private key(file: vscode.Uri): string {
		return file.toString(true);
	}
}

export enum DiagnosticKind {
	Syntax,
	Semantic,
	Suggestion
}

const allDiagnosticKinds = [DiagnosticKind.Syntax, DiagnosticKind.Semantic, DiagnosticKind.Suggestion];

export class DiagnosticsManager {

	private readonly diagnostics = new Map<DiagnosticKind, DiagnosticSet>();
	private readonly currentDiagnostics: vscode.DiagnosticCollection;
	private _validate: boolean = true;

	constructor(
		language: string
	) {
		for (const kind of allDiagnosticKinds) {
			this.diagnostics.set(kind, new DiagnosticSet());
		}

		this.currentDiagnostics = vscode.languages.createDiagnosticCollection(language);
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
		file: vscode.Uri,
		syntaxDiagnostics: vscode.Diagnostic[]
	): void {
		const diagnostics = this.diagnostics.get(kind);
		if (diagnostics) {
			diagnostics.set(file, syntaxDiagnostics);
			this.updateCurrentDiagnostics(file);
		}
	}

	public configFileDiagnosticsReceived(file: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
		this.currentDiagnostics.set(file, diagnostics);
	}

	public delete(resource: vscode.Uri): void {
		this.currentDiagnostics.delete(resource);
	}

	private updateCurrentDiagnostics(file: vscode.Uri) {
		if (!this._validate) {
			return;
		}

		const allDiagnostics = allDiagnosticKinds.reduce((sum, kind) => {
			sum.push(...this.diagnostics.get(kind)!.get(file));
			return sum;
		}, [] as vscode.Diagnostic[]);
		this.currentDiagnostics.set(file, allDiagnostics);
	}

	public getDiagnostics(file: vscode.Uri): vscode.Diagnostic[] {
		return this.currentDiagnostics.get(file) || [];
	}
}