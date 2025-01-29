/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'fs';
import path from 'path';
import ts from 'typescript';


class LanguageServiceHost implements ts.LanguageServiceHost {
	files: ts.MapLike<ts.IScriptSnapshot> = {};
	addFile(fileName: string, text: string) {
		this.files[fileName] = ts.ScriptSnapshot.fromString(text);
	}

	fileExists(path: string): boolean {
		return !!this.files[path];
	}

	readFile(path: string): string | undefined {
		return this.files[path]?.getText(0, this.files[path]!.getLength());
	}

	// for ts.LanguageServiceHost

	getCompilationSettings = () => ts.getDefaultCompilerOptions();
	getScriptFileNames = () => Object.keys(this.files);
	getScriptVersion = (_fileName: string) => '0';
	getScriptSnapshot = (fileName: string) => this.files[fileName];
	getCurrentDirectory = () => process.cwd();
	getDefaultLibFileName = (options: ts.CompilerOptions) => ts.getDefaultLibFilePath(options);
}

const defaults: ts.FormatCodeSettings = {
	baseIndentSize: 0,
	indentSize: 4,
	tabSize: 4,
	indentStyle: ts.IndentStyle.Smart,
	newLineCharacter: '\r\n',
	convertTabsToSpaces: false,
	insertSpaceAfterCommaDelimiter: true,
	insertSpaceAfterSemicolonInForStatements: true,
	insertSpaceBeforeAndAfterBinaryOperators: true,
	insertSpaceAfterConstructor: false,
	insertSpaceAfterKeywordsInControlFlowStatements: true,
	insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
	insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
	insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
	insertSpaceAfterTypeAssertion: false,
	insertSpaceBeforeFunctionParenthesis: false,
	placeOpenBraceOnNewLineForFunctions: false,
	placeOpenBraceOnNewLineForControlBlocks: false,
	insertSpaceBeforeTypeAnnotation: false,
};

const getOverrides = (() => {
	let value: ts.FormatCodeSettings | undefined;
	return () => {
		value ??= JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'tsfmt.json'), 'utf8'));
		return value;
	};
})();

export function format(fileName: string, text: string) {

	const host = new LanguageServiceHost();
	host.addFile(fileName, text);

	const languageService = ts.createLanguageService(host);
	const edits = languageService.getFormattingEditsForDocument(fileName, { ...defaults, ...getOverrides() });
	edits
		.sort((a, b) => a.span.start - b.span.start)
		.reverse()
		.forEach(edit => {
			const head = text.slice(0, edit.span.start);
			const tail = text.slice(edit.span.start + edit.span.length);
			text = `${head}${edit.newText}${tail}`;
		});

	return text;
}
