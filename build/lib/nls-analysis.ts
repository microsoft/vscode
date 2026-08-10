/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';

// ============================================================================
// Types
// ============================================================================

export interface ISpan {
	start: ts.LineAndCharacter;
	end: ts.LineAndCharacter;
}

export interface ILocalizeCall {
	keySpan: ISpan;
	key: string;
	valueSpan: ISpan;
	value: string;
}

// ============================================================================
// AST Collection
// ============================================================================

export const CollectStepResult = Object.freeze({
	Yes: 'Yes',
	YesAndRecurse: 'YesAndRecurse',
	No: 'No',
	NoAndRecurse: 'NoAndRecurse'
});

export type CollectStepResult = typeof CollectStepResult[keyof typeof CollectStepResult];

export function collect(node: ts.Node, fn: (node: ts.Node) => CollectStepResult): ts.Node[] {
	const result: ts.Node[] = [];

	function loop(node: ts.Node) {
		const stepResult = fn(node);

		if (stepResult === CollectStepResult.Yes || stepResult === CollectStepResult.YesAndRecurse) {
			result.push(node);
		}

		if (stepResult === CollectStepResult.YesAndRecurse || stepResult === CollectStepResult.NoAndRecurse) {
			ts.forEachChild(node, loop);
		}
	}

	loop(node);
	return result;
}

export function isImportNode(node: ts.Node): boolean {
	return node.kind === ts.SyntaxKind.ImportDeclaration || node.kind === ts.SyntaxKind.ImportEqualsDeclaration;
}

export function isCallExpressionWithinTextSpanCollectStep(textSpan: ts.TextSpan, node: ts.Node): CollectStepResult {
	if (!ts.textSpanContainsTextSpan({ start: node.pos, length: node.end - node.pos }, textSpan)) {
		return CollectStepResult.No;
	}

	return node.kind === ts.SyntaxKind.CallExpression ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse;
}

// ============================================================================
// Language Service Host
// ============================================================================

export class SingleFileServiceHost implements ts.LanguageServiceHost {
	private file: ts.IScriptSnapshot;
	private lib: ts.IScriptSnapshot;
	private options: ts.CompilerOptions;
	private filename: string;

	constructor(options: ts.CompilerOptions, filename: string, contents: string) {
		this.options = options;
		this.filename = filename;
		this.file = ts.ScriptSnapshot.fromString(contents);
		this.lib = ts.ScriptSnapshot.fromString('');
	}

	getCompilationSettings = () => this.options;
	getScriptFileNames = () => [this.filename];
	getScriptVersion = () => '1';
	getScriptSnapshot = (name: string) => name === this.filename ? this.file : this.lib;
	getCurrentDirectory = () => '';
	getDefaultLibFileName = () => 'lib.d.ts';

	readFile(path: string): string | undefined {
		if (path === this.filename) {
			return this.file.getText(0, this.file.getLength());
		}
		return undefined;
	}

	fileExists(path: string): boolean {
		return path === this.filename;
	}
}

// ============================================================================
// Analysis
// ============================================================================

/**
 * Analyzes TypeScript source code to find localize() or localize2() calls.
 */
export function analyzeLocalizeCalls(
	contents: string,
	functionName: 'localize' | 'localize2'
): ILocalizeCall[] {
	const filename = 'file.ts';
	const options: ts.CompilerOptions = { noResolve: true };
	const serviceHost = new SingleFileServiceHost(options, filename, contents);
	const service = ts.createLanguageService(serviceHost);
	const sourceFile = ts.createSourceFile(filename, contents, ts.ScriptTarget.ES5, true);

	// Find all imports
	const imports = collect(sourceFile, n => isImportNode(n) ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse);

	// import nls = require('vs/nls');
	const importEqualsDeclarations = imports
		.filter(n => n.kind === ts.SyntaxKind.ImportEqualsDeclaration)
		.map(n => n as ts.ImportEqualsDeclaration)
		.filter(d => d.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference)
		.filter(d => {
			const text = (d.moduleReference as ts.ExternalModuleReference).expression.getText();
			return text.endsWith(`/nls'`) || text.endsWith(`/nls"`) || text.endsWith(`/nls.js'`) || text.endsWith(`/nls.js"`);
		});

	// import ... from 'vs/nls';
	const importDeclarations = imports
		.filter(n => n.kind === ts.SyntaxKind.ImportDeclaration)
		.map(n => n as ts.ImportDeclaration)
		.filter(d => d.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral)
		.filter(d => {
			const text = d.moduleSpecifier.getText();
			return text.endsWith(`/nls'`) || text.endsWith(`/nls"`) || text.endsWith(`/nls.js'`) || text.endsWith(`/nls.js"`);
		})
		.filter(d => !!d.importClause && !!d.importClause.namedBindings);

	// `nls.localize(...)` calls via namespace import
	const nlsLocalizeCallExpressions: ts.CallExpression[] = [];

	const namespaceImports = importDeclarations
		.filter(d => d.importClause?.namedBindings?.kind === ts.SyntaxKind.NamespaceImport)
		.map(d => (d.importClause!.namedBindings as ts.NamespaceImport).name);

	const importEqualsNames = importEqualsDeclarations.map(d => d.name);

	for (const name of [...namespaceImports, ...importEqualsNames]) {
		const refs = service.getReferencesAtPosition(filename, name.pos + 1) ?? [];
		for (const ref of refs) {
			if (ref.isWriteAccess) {
				continue;
			}
			const calls = collect(sourceFile, n => isCallExpressionWithinTextSpanCollectStep(ref.textSpan, n));
			const lastCall = calls[calls.length - 1] as ts.CallExpression | undefined;
			if (lastCall &&
				lastCall.expression.kind === ts.SyntaxKind.PropertyAccessExpression &&
				(lastCall.expression as ts.PropertyAccessExpression).name.getText() === functionName) {
				nlsLocalizeCallExpressions.push(lastCall);
			}
		}
	}

	// `localize` named imports
	const namedImports = importDeclarations
		.filter(d => d.importClause?.namedBindings?.kind === ts.SyntaxKind.NamedImports)
		.flatMap(d => Array.from((d.importClause!.namedBindings! as ts.NamedImports).elements));

	const localizeCallExpressions: ts.CallExpression[] = [];

	// Direct named import: import { localize } from 'vs/nls'
	for (const namedImport of namedImports) {
		const isTarget = namedImport.name.getText() === functionName ||
			(namedImport.propertyName && namedImport.propertyName.getText() === functionName);

		if (!isTarget) {
			continue;
		}

		const searchName = namedImport.propertyName ? namedImport.name : namedImport.name;
		const refs = service.getReferencesAtPosition(filename, searchName.pos + 1) ?? [];

		for (const ref of refs) {
			if (ref.isWriteAccess) {
				continue;
			}
			const calls = collect(sourceFile, n => isCallExpressionWithinTextSpanCollectStep(ref.textSpan, n));
			const lastCall = calls[calls.length - 1] as ts.CallExpression | undefined;
			if (lastCall) {
				localizeCallExpressions.push(lastCall);
			}
		}
	}

	// Combine and deduplicate
	const allCalls = [...nlsLocalizeCallExpressions, ...localizeCallExpressions];
	const seen = new Set<number>();
	const uniqueCalls = allCalls.filter(call => {
		const start = call.getStart();
		if (seen.has(start)) {
			return false;
		}
		seen.add(start);
		return true;
	});

	// Convert to ILocalizeCall
	return uniqueCalls
		.filter(e => e.arguments.length > 1)
		.sort((a, b) => a.arguments[0].getStart() - b.arguments[0].getStart())
		.map(e => {
			const args = e.arguments;
			return {
				keySpan: {
					start: ts.getLineAndCharacterOfPosition(sourceFile, args[0].getStart()),
					end: ts.getLineAndCharacterOfPosition(sourceFile, args[0].getEnd())
				},
				key: args[0].getText(),
				valueSpan: {
					start: ts.getLineAndCharacterOfPosition(sourceFile, args[1].getStart()),
					end: ts.getLineAndCharacterOfPosition(sourceFile, args[1].getEnd())
				},
				value: args[1].getText()
			};
		});
}

// ============================================================================
// Text Model for patching
// ============================================================================

export class TextModel {
	private lines: string[];
	private lineEndings: string[];

	constructor(contents: string) {
		const regex = /\r\n|\r|\n/g;
		let index = 0;
		let match: RegExpExecArray | null;

		this.lines = [];
		this.lineEndings = [];

		while (match = regex.exec(contents)) {
			this.lines.push(contents.substring(index, match.index));
			this.lineEndings.push(match[0]);
			index = regex.lastIndex;
		}

		if (contents.length > 0) {
			this.lines.push(contents.substring(index, contents.length));
			this.lineEndings.push('');
		}
	}

	get(index: number): string {
		return this.lines[index];
	}

	set(index: number, line: string): void {
		this.lines[index] = line;
	}

	get lineCount(): number {
		return this.lines.length;
	}

	/**
	 * Applies patch(es) to the model.
	 * Multiple patches must be ordered.
	 * Does not support patches spanning multiple lines.
	 */
	apply(span: ISpan, content: string): void {
		const startLineNumber = span.start.line;
		const endLineNumber = span.end.line;

		const startLine = this.lines[startLineNumber] || '';
		const endLine = this.lines[endLineNumber] || '';

		this.lines[startLineNumber] = [
			startLine.substring(0, span.start.character),
			content,
			endLine.substring(span.end.character)
		].join('');

		for (let i = startLineNumber + 1; i <= endLineNumber; i++) {
			this.lines[i] = '';
		}
	}

	toString(): string {
		let result = '';
		for (let i = 0; i < this.lines.length; i++) {
			result += this.lines[i] + this.lineEndings[i];
		}
		return result;
	}
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parses a localize key or value expression.
 * sourceExpression can be "foo", 'foo', `foo` or { key: 'foo', comment: [...] }
 */
export function parseLocalizeKeyOrValue(sourceExpression: string): string | { key: string; comment?: string[] } {
	// eslint-disable-next-line no-eval
	return eval(`(${sourceExpression})`);
}
