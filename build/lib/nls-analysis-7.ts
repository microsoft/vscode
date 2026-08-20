/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { API, type Checker, type Project, type Snapshot } from '@typescript/native/unstable/sync';
import { createVirtualFileSystem, type FileSystem } from '@typescript/native/unstable/fs';
import {
	isCallExpression,
	isExternalModuleReference,
	isImportDeclaration,
	isImportEqualsDeclaration,
	isNamedImports,
	isNamespaceImport,
	isPropertyAccessExpression,
	isStringLiteral,
	type CallExpression,
	type Identifier,
	type LineAndCharacter,
	type Node,
	type SourceFile,
} from '@typescript/native/unstable/ast';

// ============================================================================
// Types
// ============================================================================

export interface ISpan {
	start: LineAndCharacter;
	end: LineAndCharacter;
}

export interface ILocalizeCall {
	keySpan: ISpan;
	key: string;
	valueSpan: ISpan;
	value: string;
}

export interface ITextSpan {
	start: number;
	length: number;
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

export function collect(node: Node, fn: (node: Node) => CollectStepResult): Node[] {
	const result: Node[] = [];

	function loop(node: Node): void {
		const stepResult = fn(node);

		if (stepResult === CollectStepResult.Yes || stepResult === CollectStepResult.YesAndRecurse) {
			result.push(node);
		}

		if (stepResult === CollectStepResult.YesAndRecurse || stepResult === CollectStepResult.NoAndRecurse) {
			node.forEachChild(loop);
		}
	}

	loop(node);
	return result;
}

export function isImportNode(node: Node): boolean {
	return isImportDeclaration(node) || isImportEqualsDeclaration(node);
}

export function isCallExpressionWithinTextSpanCollectStep(textSpan: ITextSpan, node: Node): CollectStepResult {
	if (textSpan.start < node.pos || textSpan.start + textSpan.length > node.end) {
		return CollectStepResult.No;
	}

	return isCallExpression(node) ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse;
}

// ============================================================================
// Analysis
// ============================================================================

const virtualRoot = normalizePath(path.join(path.parse(process.cwd()).root, '__vscode_nls_analysis__'));

function normalizePath(value: string): string {
	const normalized = value.replaceAll('\\', '/');
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isNlsModuleSpecifier(node: Node): boolean {
	return isStringLiteral(node) && (/\/nls(?:\.js)?$/).test(node.text);
}

function findContainingCallExpression(node: Node, sourceFile: SourceFile): CallExpression | undefined {
	let current = node;
	while (current !== sourceFile) {
		if (isCallExpression(current)) {
			return current;
		}
		current = current.parent;
	}
	return undefined;
}

function getReferences(checker: Checker, project: Project, sourceFile: SourceFile, name: Identifier): Node[] {
	const symbol = checker.getSymbolAtLocation(name);
	if (!symbol) {
		return [];
	}

	const result: Node[] = [];
	for (const handle of checker.getReferencesToSymbolInFile(sourceFile.fileName, symbol)) {
		const node = handle.resolve(project);
		if (node) {
			result.push(node);
		}
	}
	return result;
}

function analyzeSourceFile(sourceFile: SourceFile, project: Project, functionName: 'localize' | 'localize2'): ILocalizeCall[] {
	const imports = collect(sourceFile, node => isImportNode(node) ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse);
	const namespaceNames: Identifier[] = [];
	const namedImportNames: Identifier[] = [];

	for (const node of imports) {
		if (isImportEqualsDeclaration(node)) {
			if (isExternalModuleReference(node.moduleReference) && isNlsModuleSpecifier(node.moduleReference.expression)) {
				namespaceNames.push(node.name);
			}
			continue;
		}

		if (!isImportDeclaration(node) || !isNlsModuleSpecifier(node.moduleSpecifier)) {
			continue;
		}

		const namedBindings = node.importClause?.namedBindings;
		if (namedBindings && isNamespaceImport(namedBindings)) {
			namespaceNames.push(namedBindings.name);
		} else if (namedBindings && isNamedImports(namedBindings)) {
			for (const element of namedBindings.elements) {
				if (element.name.getText() === functionName || element.propertyName?.getText() === functionName) {
					namedImportNames.push(element.name);
				}
			}
		}
	}

	const calls: CallExpression[] = [];
	for (const name of namespaceNames) {
		for (const reference of getReferences(project.checker, project, sourceFile, name)) {
			const call = findContainingCallExpression(reference, sourceFile);
			if (call && isPropertyAccessExpression(call.expression) && call.expression.name.getText() === functionName) {
				calls.push(call);
			}
		}
	}

	for (const name of namedImportNames) {
		for (const reference of getReferences(project.checker, project, sourceFile, name)) {
			const call = findContainingCallExpression(reference, sourceFile);
			if (call) {
				calls.push(call);
			}
		}
	}

	const seen = new Set<number>();
	return calls
		.filter(call => {
			const start = call.getStart();
			if (seen.has(start)) {
				return false;
			}
			seen.add(start);
			return call.arguments.length > 1;
		})
		.sort((a, b) => a.arguments[0].getStart() - b.arguments[0].getStart())
		.map(call => {
			const args = call.arguments;
			return {
				keySpan: {
					start: sourceFile.getLineAndCharacterOfPosition(args[0].getStart()),
					end: sourceFile.getLineAndCharacterOfPosition(args[0].getEnd())
				},
				key: args[0].getText(),
				valueSpan: {
					start: sourceFile.getLineAndCharacterOfPosition(args[1].getStart()),
					end: sourceFile.getLineAndCharacterOfPosition(args[1].getEnd())
				},
				value: args[1].getText()
			};
		});
}

export class NlsAnalyzer {
	private readonly fileSystem: FileSystem;
	private readonly api: API;
	private snapshot: Snapshot | undefined;
	private project: Project | undefined;
	private sourceFile: SourceFile | undefined;
	private fileName: string | undefined;
	private fileCounter = 0;
	private contents: string | undefined;
	private disposed = false;

	constructor() {
		this.fileSystem = createVirtualFileSystem({});
		this.api = new API({ cwd: virtualRoot, fs: this.fileSystem });
	}

	analyzeLocalizeCalls(contents: string, functionName: 'localize' | 'localize2'): ILocalizeCall[] {
		if (this.disposed) {
			throw new Error('NlsAnalyzer has been disposed.');
		}
		if (contents !== this.contents) {
			this.updateSourceFile(contents);
		}
		return analyzeSourceFile(this.sourceFile!, this.project!, functionName);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.snapshot?.dispose();
		this.api.close();
		this.disposed = true;
	}

	private updateSourceFile(contents: string): void {
		const previousFileName = this.fileName;
		const fileName = `${virtualRoot}/file-${this.fileCounter++}.ts`;
		this.fileSystem.writeFile!(fileName, contents);
		const previousSnapshot = this.snapshot;
		this.snapshot = this.api.updateSnapshot(previousFileName
			? { closeFiles: [previousFileName], openFiles: [fileName] }
			: { openFiles: [fileName] });
		previousSnapshot?.dispose();
		if (previousFileName) {
			this.fileSystem.removeFile!(previousFileName);
		}

		this.project = this.snapshot.getDefaultProjectForFile(fileName);
		this.sourceFile = this.project?.program.getSourceFile(fileName);
		if (!this.project || !this.sourceFile) {
			throw new Error('Unable to create a TypeScript project for NLS analysis.');
		}
		this.fileName = fileName;
		this.contents = contents;
	}
}

/**
 * Analyzes one TypeScript source string using a short-lived TypeScript 7 session.
 * Reuse {@link NlsAnalyzer} when processing more than one source or function name.
 */
export function analyzeLocalizeCalls(contents: string, functionName: 'localize' | 'localize2'): ILocalizeCall[] {
	const analyzer = new NlsAnalyzer();
	try {
		return analyzer.analyzeLocalizeCalls(contents, functionName);
	} finally {
		analyzer.dispose();
	}
}

function collectTypeScriptFiles(inputPath: string): string[] {
	const stat = fs.statSync(inputPath);
	if (stat.isFile()) {
		return inputPath.endsWith('.ts') && !inputPath.endsWith('.d.ts') ? [inputPath] : [];
	}

	const result: string[] = [];
	for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
		const entryPath = path.join(inputPath, entry.name);
		if (entry.isDirectory()) {
			result.push(...collectTypeScriptFiles(entryPath));
		} else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
			result.push(entryPath);
		}
	}
	return result;
}

function formatDuration(milliseconds: number): string {
	return `${(milliseconds / 1_000).toFixed(3)}s`;
}

function main(): void {
	const inputPath = path.resolve(process.argv[2] ?? 'src');
	if (!fs.existsSync(inputPath)) {
		throw new Error(`Path does not exist: ${inputPath}`);
	}

	const loadStart = performance.now();
	const files = collectTypeScriptFiles(inputPath).sort((a, b) => a.localeCompare(b));
	const sources = files.map(file => fs.readFileSync(file, 'utf8'));
	const loadDuration = performance.now() - loadStart;

	let localizeCalls = 0;
	let localize2Calls = 0;
	const analysisStart = performance.now();
	const analyzer = new NlsAnalyzer();
	try {
		for (const source of sources) {
			localizeCalls += analyzer.analyzeLocalizeCalls(source, 'localize').length;
			localize2Calls += analyzer.analyzeLocalizeCalls(source, 'localize2').length;
		}
	} finally {
		analyzer.dispose();
	}
	const analysisDuration = performance.now() - analysisStart;

	console.log(`Analyzed ${files.length} TypeScript files.`);
	console.log(`Found ${localizeCalls} localize calls and ${localize2Calls} localize2 calls.`);
	console.log(`Loading: ${formatDuration(loadDuration)}`);
	console.log(`Analysis: ${formatDuration(analysisDuration)}`);
}

if (import.meta.main) {
	main();
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
