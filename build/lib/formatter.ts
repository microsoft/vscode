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
	const cache = new Map<string, ts.FormatCodeSettings>();
	return (fileName: string) => {
		let dir = path.dirname(fileName);
		while (dir !== path.dirname(dir)) {
			const tsfmtPath = path.join(dir, 'tsfmt.json');
			if (cache.has(tsfmtPath)) {
				return cache.get(tsfmtPath)!;
			}
			if (fs.existsSync(tsfmtPath)) {
				const value = JSON.parse(fs.readFileSync(tsfmtPath, 'utf8'));
				cache.set(tsfmtPath, value);
				return value;
			}
			dir = path.dirname(dir);
		}
		// Fallback to the root tsfmt.json
		const rootTsfmtPath = path.join(import.meta.dirname, '..', '..', 'tsfmt.json');
		if (!cache.has(rootTsfmtPath)) {
			cache.set(rootTsfmtPath, JSON.parse(fs.readFileSync(rootTsfmtPath, 'utf8')));
		}
		return cache.get(rootTsfmtPath)!;
	};
})();

export function format(fileName: string, text: string) {

	const host = new LanguageServiceHost();
	host.addFile(fileName, text);

	const languageService = ts.createLanguageService(host);
	const edits = languageService.getFormattingEditsForDocument(fileName, { ...defaults, ...getOverrides(fileName) });
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

export function verifyFormatting(fileName: string, text: string): boolean {
	const formatted = format(fileName, text);
	return text.replace(/\r\n/gm, '\n') === formatted.replace(/\r\n/gm, '\n');
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const verify = args.includes('--verify');
	const replace = args.includes('--replace');
	const files = args.filter(arg => !arg.startsWith('--'));

	let errorCount = 0;
	for (const file of files) {
		const absolutePath = path.resolve(file);
		const text = fs.readFileSync(absolutePath, 'utf8');
		if (replace) {
			const formatted = format(absolutePath, text);
			if (text !== formatted) {
				fs.writeFileSync(absolutePath, formatted, 'utf8');
				console.log(`Formatted ${file}`);
			}
		}
		if (verify && !verifyFormatting(absolutePath, replace ? fs.readFileSync(absolutePath, 'utf8') : text)) {
			console.error(`File not formatted. Run the 'Format Document' command to fix it: ${file}`);
			errorCount++;
		}
	}
	if (errorCount > 0) {
		process.exit(1);
	}
}
