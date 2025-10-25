/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { es5ClassCompat } from './es5ClassCompat.js';

@es5ClassCompat
export class CodeActionKind {
	private static readonly sep = '.';

	public static Empty: CodeActionKind;
	public static QuickFix: CodeActionKind;
	public static Refactor: CodeActionKind;
	public static RefactorExtract: CodeActionKind;
	public static RefactorInline: CodeActionKind;
	public static RefactorMove: CodeActionKind;
	public static RefactorRewrite: CodeActionKind;
	public static Source: CodeActionKind;
	public static SourceOrganizeImports: CodeActionKind;
	public static SourceFixAll: CodeActionKind;
	public static Notebook: CodeActionKind;

	constructor(
		public readonly value: string
	) { }

	public append(parts: string): CodeActionKind {
		return new CodeActionKind(this.value ? this.value + CodeActionKind.sep + parts : parts);
	}

	public intersects(other: CodeActionKind): boolean {
		return this.contains(other) || other.contains(this);
	}

	public contains(other: CodeActionKind): boolean {
		return this.value === other.value || other.value.startsWith(this.value + CodeActionKind.sep);
	}
}
CodeActionKind.Empty = new CodeActionKind('');
CodeActionKind.QuickFix = CodeActionKind.Empty.append('quickfix');
CodeActionKind.Refactor = CodeActionKind.Empty.append('refactor');
CodeActionKind.RefactorExtract = CodeActionKind.Refactor.append('extract');
CodeActionKind.RefactorInline = CodeActionKind.Refactor.append('inline');
CodeActionKind.RefactorMove = CodeActionKind.Refactor.append('move');
CodeActionKind.RefactorRewrite = CodeActionKind.Refactor.append('rewrite');
CodeActionKind.Source = CodeActionKind.Empty.append('source');
CodeActionKind.SourceOrganizeImports = CodeActionKind.Source.append('organizeImports');
CodeActionKind.SourceFixAll = CodeActionKind.Source.append('fixAll');
CodeActionKind.Notebook = CodeActionKind.Empty.append('notebook');
