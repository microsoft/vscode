/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import *  as vscode from 'vscode';

export class DiagnosticSet {
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

	private readonly _diagnostics = new Map<DiagnosticKind, DiagnosticSet>();
	private readonly _currentDiagnostics: vscode.DiagnosticCollection;
	private _validate: boolean = true;
	private _enableSuggestions: boolean = true;

	constructor(
		owner: string
	) {
		for (const kind of allDiagnosticKinds) {
			this._diagnostics.set(kind, new DiagnosticSet());
		}

		this._currentDiagnostics = vscode.languages.createDiagnosticCollection(owner);
	}

	public dispose() {
		this._currentDiagnostics.dispose();
	}

	public reInitialize(): void {
		this._currentDiagnostics.clear();

		for (const diagnosticSet of this._diagnostics.values()) {
			diagnosticSet.clear();
		}
	}

	public set validate(value: boolean) {
		if (this._validate === value) {
			return;
		}

		this._validate = value;
		if (!value) {
			this._currentDiagnostics.clear();
		}
	}

	public set enableSuggestions(value: boolean) {
		if (this._enableSuggestions === value) {
			return;
		}

		this._enableSuggestions = value;
		if (!value) {
			this._currentDiagnostics.clear();
		}
	}

	public diagnosticsReceived(
		kind: DiagnosticKind,
		file: vscode.Uri,
		diagnostics: vscode.Diagnostic[]
	): void {
		const collection = this._diagnostics.get(kind);
		if (collection) {
			collection.set(file, diagnostics);
			this.updateCurrentDiagnostics(file);
		}
	}

	public configFileDiagnosticsReceived(file: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
		this._currentDiagnostics.set(file, diagnostics);
	}

	public delete(resource: vscode.Uri): void {
		this._currentDiagnostics.delete(resource);
	}

	private updateCurrentDiagnostics(file: vscode.Uri) {
		if (!this._validate) {
			return;
		}

		const allDiagnostics = [
			...this._diagnostics.get(DiagnosticKind.Syntax)!.get(file),
			...this._diagnostics.get(DiagnosticKind.Semantic)!.get(file),
			...this.getSuggestionDiagnostics(file),
		];
		this._currentDiagnostics.set(file, allDiagnostics);
	}

	private getSuggestionDiagnostics(file: vscode.Uri) {
		if (!this._enableSuggestions) {
			return [];
		}

		return this._diagnostics.get(DiagnosticKind.Suggestion)!.get(file);
	}

	public getDiagnostics(file: vscode.Uri): vscode.Diagnostic[] {
		return this._currentDiagnostics.get(file) || [];
	}
}