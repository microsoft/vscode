/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/cssNodes';
import {TextDocument, Range, Diagnostic, DiagnosticSeverity} from 'vscode-languageserver';
import {ILintConfigurationSettings, sanitize} from './lintRules';
import {LintVisitor} from './lint';
import {LanguageSettings} from '../cssLanguageService';

export class CSSValidation {

	private lintSettings: ILintConfigurationSettings;
	private validationEnabled: boolean;

	constructor() {
	}

	public configure(raw: LanguageSettings) {
		if (raw) {
			this.validationEnabled = raw.validate;
			if (raw.lint) {
				this.lintSettings = sanitize(raw.lint);
			} else {
				this.lintSettings = {};
			}
		}
	}

	public doValidation(document: TextDocument, stylesheet: nodes.Stylesheet): Thenable<Diagnostic[]> {
		if (!this.validationEnabled) {
			return Promise.resolve([]);
		}

		let entries: nodes.IMarker[] = [];
		entries.push.apply(entries, nodes.ParseErrorCollector.entries(stylesheet));
		entries.push.apply(entries, LintVisitor.entries(stylesheet, this.lintSettings));

		function toDiagnostic(marker: nodes.IMarker): Diagnostic {
			let range = Range.create(document.positionAt(marker.getOffset()), document.positionAt(marker.getOffset() + marker.getLength()));
			return <Diagnostic>{
				code: marker.getRule().id,
				source: document.languageId,
				message: marker.getMessage(),
				severity: marker.getLevel() === nodes.Level.Warning ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
				range: range
			};
		}

		return Promise.resolve(entries.filter(entry => entry.getLevel() !== nodes.Level.Ignore).map(toDiagnostic));
	}
}