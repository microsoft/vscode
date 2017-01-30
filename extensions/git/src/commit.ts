/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, languages, Disposable, Uri, TextDocumentChangeEvent, DiagnosticCollection, Diagnostic, DiagnosticSeverity } from 'vscode';
import { Model } from './model';
import { filterEvent } from './util';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

function isSCMInput(uri: Uri) {
	return uri.toString() === 'scm:input';
}

// TODO@Joao: prevent these diagnostics from showing in global error/warnings
// TODO@Joao: hover dissapears if editor is scrolled
export class CommitHandler {

	private diagnosticCollection: DiagnosticCollection;
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		const onDidChange = filterEvent(workspace.onDidChangeTextDocument, e => e.document && isSCMInput(e.document.uri));
		onDidChange(this.onSCMInputChange, this, this.disposables);

		this.diagnosticCollection = languages.createDiagnosticCollection(localize('git commit message', "Git Commit Message"));
		this.disposables.push(this.diagnosticCollection);
	}

	private onSCMInputChange(e: TextDocumentChangeEvent): void {
		const uri = e.document.uri;
		const firstLineRange = e.document.lineAt(0).range;
		const firstLineLength = firstLineRange.end.character - firstLineRange.start.character;

		if (firstLineLength > 80) {
			const warning = new Diagnostic(firstLineRange, localize('too long', "You should keep the first line under 50 characters.\nYou can use more lines for extra information."), DiagnosticSeverity.Warning);
			this.diagnosticCollection.set(uri, [warning]);
		} else {
			this.diagnosticCollection.clear();
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
