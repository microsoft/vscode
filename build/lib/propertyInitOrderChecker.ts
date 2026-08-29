/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

const TS_CONFIG_PATH = path.join(import.meta.dirname, '../../', 'src', 'tsconfig.json');

//
// #############################################################################################
//
// A custom typescript checker that ensure constructor properties are NOT used to initialize
// defined properties. This is needed for the times when `useDefineForClassFields` is gone.
//
// see https://github.com/microsoft/vscode/issues/243049, https://github.com/microsoft/vscode/issues/186726,
// https://github.com/microsoft/vscode/pull/241544
//
// #############################################################################################
//

const EntryKind = Object.freeze({
	Span: 'Span',
	Node: 'Node',
	StringLiteral: 'StringLiteral',
	SearchedLocalFoundProperty: 'SearchedLocalFoundProperty',
	SearchedPropertyFoundLocal: 'SearchedPropertyFoundLocal'
});

type EntryKind = typeof EntryKind[keyof typeof EntryKind];

const cancellationToken: ts.CancellationToken = {
	isCancellationRequested: () => false,
	throwIfCancellationRequested: () => { },
};

const seenFiles = new Set<ts.SourceFile>();
let errorCount = 0;



function createProgram(tsconfigPath: string): ts.Program {
	const tsConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

	const configHostParser: ts.ParseConfigHost = { fileExists: fs.existsSync, readDirectory: ts.sys.readDirectory, readFile: file => fs.readFileSync(file, 'utf8'), useCaseSensitiveFileNames: process.platform === 'linux' };
	const tsConfigParsed = ts.parseJsonConfigFileContent(tsConfig.config, configHostParser, path.resolve(path.dirname(tsconfigPath)), { noEmit: true });

	const compilerHost = ts.createCompilerHost(tsConfigParsed.options, true);

	return ts.createProgram(tsConfigParsed.fileNames, tsConfigParsed.options, compilerHost);
}

const program = createProgram(TS_CONFIG_PATH);

program.getTypeChecker();

for (const file of program.getSourceFiles()) {
	if (!file || file.isDeclarationFile) {
		continue;
	}
	visit(file);
}

if (seenFiles.size) {
	console.log();
	console.log(`Found ${errorCount} error${errorCount === 1 ? '' : 's'} in ${seenFiles.size} file${seenFiles.size === 1 ? '' : 's'}.`);
	process.exit(errorCount);
}

function visit(node: ts.Node) {
	if (ts.isParameter(node) && ts.isParameterPropertyDeclaration(node, node.parent)) {
		checkParameterPropertyDeclaration(node);
	}

	ts.forEachChild(node, visit);
}

function checkParameterPropertyDeclaration(param: ts.ParameterPropertyDeclaration) {
	const uses = [...collectReferences(param.name, [])];
	if (!uses.length) {
		return;
	}

	const sourceFile = param.getSourceFile();
	if (!seenFiles.has(sourceFile)) {
		if (seenFiles.size) {
			console.log(``);
		}
		console.log(`${formatFileName(param)}:`);
		seenFiles.add(sourceFile);
	} else {
		console.log(``);
	}
	console.log(`  Parameter property '${param.name.getText()}' is used before its declaration.`);
	for (const { stack, container } of uses) {
		const use = stack[stack.length - 1];
		console.log(`    at ${formatLocation(use)}: ${formatMember(container)} -> ${formatStack(stack)}`);
		errorCount++;
	}
}

interface InvalidUse {
	stack: ts.Node[];
	container: ReferenceContainer;
}

function* collectReferences(node: ts.Node, stack: ts.Node[], requiresInvocationDepth: number = 0, seen = new Set<ReferenceContainer>()): Generator<InvalidUse> {
	for (const use of findAllReferencesInClass(node)) {
		const container = findContainer(use);
		if (!container || seen.has(container) || ts.isConstructorDeclaration(container)) {
			continue;
		}
		seen.add(container);

		const nextStack = [...stack, use];

		let nextRequiresInvocationDepth = requiresInvocationDepth;
		if (isInvocation(use) && nextRequiresInvocationDepth > 0) {
			nextRequiresInvocationDepth--;
		}

		if (ts.isPropertyDeclaration(container) && nextRequiresInvocationDepth === 0) {
			yield { stack: nextStack, container };
		}
		else if (requiresInvocation(container)) {
			nextRequiresInvocationDepth++;
		}

		yield* collectReferences(container.name ?? container, nextStack, nextRequiresInvocationDepth, seen);
	}
}

function requiresInvocation(definition: ReferenceContainer): boolean {
	return ts.isMethodDeclaration(definition) || ts.isFunctionDeclaration(definition) || ts.isFunctionExpression(definition) || ts.isArrowFunction(definition);
}

function isInvocation(use: ts.Node): boolean {
	let location = use;
	if (ts.isPropertyAccessExpression(location.parent) && location.parent.name === location) {
		location = location.parent;
	}
	else if (ts.isElementAccessExpression(location.parent) && location.parent.argumentExpression === location) {
		location = location.parent;
	}
	return ts.isCallExpression(location.parent) && location.parent.expression === location
		|| ts.isTaggedTemplateExpression(location.parent) && location.parent.tag === location;
}

function formatFileName(node: ts.Node): string {
	const sourceFile = node.getSourceFile();
	return path.resolve(sourceFile.fileName);
}

function formatLocation(node: ts.Node): string {
	const sourceFile = node.getSourceFile();
	const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.pos);
	return `${formatFileName(sourceFile)}(${line + 1},${character + 1})`;
}

function formatStack(stack: ts.Node[]): string {
	return stack.slice().reverse().map((use) => formatUse(use)).join(' -> ');
}

function formatMember(container: ReferenceContainer): string {
	const name = container.name?.getText();
	if (name) {
		const className = findClass(container)?.name?.getText();
		if (className) {
			return `${className}.${name}`;
		}
		return name;
	}
	return '<unknown>';
}

function formatUse(use: ts.Node): string {
	let text = use.getText();
	if (use.parent && ts.isPropertyAccessExpression(use.parent) && use.parent.name === use) {
		if (use.parent.expression.kind === ts.SyntaxKind.ThisKeyword) {
			text = `this.${text}`;
		}
		use = use.parent;
	}
	else if (use.parent && ts.isElementAccessExpression(use.parent) && use.parent.argumentExpression === use) {
		if (use.parent.expression.kind === ts.SyntaxKind.ThisKeyword) {
			text = `this['${text}']`;
		}
		use = use.parent;
	}
	if (ts.isCallExpression(use.parent)) {
		text = `${text}(...)`;
	}
	return text;
}

type ReferenceContainer =
	| ts.PropertyDeclaration
	| ts.MethodDeclaration
	| ts.GetAccessorDeclaration
	| ts.SetAccessorDeclaration
	| ts.ConstructorDeclaration
	| ts.ClassStaticBlockDeclaration
	| ts.ArrowFunction
	| ts.FunctionExpression
	| ts.FunctionDeclaration
	| ts.ParameterDeclaration;

function findContainer(node: ts.Node): ReferenceContainer | undefined {
	return ts.findAncestor(node, ancestor => {
		switch (ancestor.kind) {
			case ts.SyntaxKind.PropertyDeclaration:
			case ts.SyntaxKind.MethodDeclaration:
			case ts.SyntaxKind.GetAccessor:
			case ts.SyntaxKind.SetAccessor:
			case ts.SyntaxKind.Constructor:
			case ts.SyntaxKind.ClassStaticBlockDeclaration:
			case ts.SyntaxKind.ArrowFunction:
			case ts.SyntaxKind.FunctionExpression:
			case ts.SyntaxKind.FunctionDeclaration:
			case ts.SyntaxKind.Parameter:
				return true;
		}
		return false;
	}) as ReferenceContainer | undefined;
}

function findClass(node: ts.Node): ts.ClassLikeDeclaration | undefined {
	return ts.findAncestor(node, ts.isClassLike);
}

function* findAllReferencesInClass(node: ts.Node): Generator<ts.Node> {
	const classDecl = findClass(node);
	if (!classDecl) {
		return [];
	}
	for (const ref of findAllReferences(node)) {
		for (const entry of ref.references) {
			if (entry.kind !== EntryKind.Node || entry.node === node) {
				continue;
			}
			if (findClass(entry.node) === classDecl) {
				yield entry.node;
			}
		}
	}
}

// NOTE: The following uses TypeScript internals and are subject to change from version to version.

interface TypeScriptInternals {
	getTouchingPropertyName(sourceFile: ts.SourceFile, position: number): ts.Node;
	FindAllReferences: {
		FindReferencesUse: {
			References: number;
		};
		Core: {
			getReferencedSymbolsForNode(
				position: number,
				node: ts.Node,
				program: ts.Program,
				sourceFiles: readonly ts.SourceFile[],
				cancellationToken: ts.CancellationToken,
				options: { use: number }
			): readonly SymbolAndEntries[] | undefined;
		};
	};
}

function findAllReferences(node: ts.Node): readonly SymbolAndEntries[] {
	const sourceFile = node.getSourceFile();
	const position = node.getStart();
	const tsInternal = ts as unknown as TypeScriptInternals;
	const name: ts.Node = tsInternal.getTouchingPropertyName(sourceFile, position);
	const options = { use: tsInternal.FindAllReferences.FindReferencesUse.References };
	return tsInternal.FindAllReferences.Core.getReferencedSymbolsForNode(position, name, program, [sourceFile], cancellationToken, options) ?? [];
}

interface SymbolAndEntries {
	readonly definition: Definition | undefined;
	readonly references: readonly Entry[];
}

const DefinitionKind = Object.freeze({
	Symbol: 0,
	Label: 1,
	Keyword: 2,
	This: 3,
	String: 4,
	TripleSlashReference: 5,
});
type DefinitionKind = typeof DefinitionKind[keyof typeof DefinitionKind];

type Definition =
	| { readonly type: DefinitionKind; readonly symbol: ts.Symbol }
	| { readonly type: DefinitionKind; readonly node: ts.Identifier }
	| { readonly type: DefinitionKind; readonly node: ts.Node }
	| { readonly type: DefinitionKind; readonly node: ts.Node }
	| { readonly type: DefinitionKind; readonly node: ts.StringLiteralLike }
	| { readonly type: DefinitionKind; readonly reference: ts.FileReference; readonly file: ts.SourceFile };

type NodeEntryKind = typeof EntryKind.Node | typeof EntryKind.StringLiteral | typeof EntryKind.SearchedLocalFoundProperty | typeof EntryKind.SearchedPropertyFoundLocal;
type Entry = NodeEntry | SpanEntry;
interface ContextWithStartAndEndNode {
	start: ts.Node;
	end: ts.Node;
}
type ContextNode = ts.Node | ContextWithStartAndEndNode;
interface NodeEntry {
	readonly kind: NodeEntryKind;
	readonly node: ts.Node;
	readonly context?: ContextNode;
}
interface SpanEntry {
	readonly kind: typeof EntryKind.Span;
	readonly fileName: string;
	readonly textSpan: ts.TextSpan;
}
