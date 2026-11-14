/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { suite, test } from 'node:test';
import ts from 'typescript';
import { collectSourceDependencies, repositoryRoot, resolveSourceImport } from './sourceDependencies.ts';

const editorWindowEntry = 'src/vs/workbench/workbench.desktop.main.ts';

/** The files that set up the main service collection of an editor window, before any registered singleton. */
const mainServiceCollectionFiles = ['src/vs/workbench/electron-browser/desktop.main.ts', 'src/vs/workbench/browser/workbench.ts'];

/** The sessions code shared with the Agents window, which can depend on services that only the Agents window registers. */
const sessionsRoots = ['src/vs/workbench/contrib/sessions/', 'src/vs/workbench/services/sessions/'];

/**
 * The services that an instantiation service scoped to a part of the sessions UI provides, rather than the window: their
 * consumers are created through that scope only.
 */
const scopedServices = new Set<string>([
	// The model and picker state of a chat input composer, for its toolbar's pickers (see SharedChatInputComposer)
	'newChatModelPickerService', 'sessionModelSelection', 'sessionInputPickerVisibility',
]);

const registrationFunctions = new Set(['registerSingleton', 'registerMainProcessRemoteService', 'registerSharedProcessRemoteService']);

const sourceFiles = new Map<string, ts.SourceFile>();

function parse(file: string): ts.SourceFile {
	let source = sourceFiles.get(file);
	if (!source) {
		source = ts.createSourceFile(file, fs.readFileSync(path.join(repositoryRoot, file), 'utf8'), ts.ScriptTarget.Latest, true);
		sourceFiles.set(file, source);
	}
	return source;
}

function forEachDescendant(node: ts.Node, callback: (node: ts.Node) => void): void {
	node.forEachChild(child => {
		callback(child);
		forEachDescendant(child, callback);
	});
}

interface IDeclaration {
	readonly file: string;
	readonly node: ts.ClassDeclaration | ts.VariableDeclaration;
}

const declarations = new Map<string, IDeclaration | undefined>();

/** The class or variable that `name` refers to in `file`: declared there, or imported, also through re-exports. */
function findDeclaration(file: string, name: string): IDeclaration | undefined {
	const key = `${file}#${name}`;
	if (declarations.has(key)) {
		return declarations.get(key);
	}
	declarations.set(key, undefined);
	let result: IDeclaration | undefined;
	const source = parse(file);
	for (const statement of source.statements) {
		if (ts.isClassDeclaration(statement) && statement.name?.text === name) {
			result = { file, node: statement };
		} else if (ts.isVariableStatement(statement)) {
			const declaration = statement.declarationList.declarations.find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === name);
			if (declaration) {
				result = { file, node: declaration };
			}
		}
		if (result) {
			break;
		}
	}
	for (const statement of source.statements) {
		if (result) {
			break;
		}
		if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.moduleSpecifier.text.startsWith('.')) {
			continue;
		}
		const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : statement.exportClause;
		const target = resolveSourceImport(file, statement.moduleSpecifier.text);
		if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
			const element = bindings.elements.find(candidate => candidate.name.text === name);
			if (element) {
				result = findDeclaration(target, (element.propertyName ?? element.name).text);
			}
		} else if (ts.isExportDeclaration(statement) && !bindings) {
			result = findDeclaration(target, name);
		}
	}
	declarations.set(key, result);
	return result;
}

/** The ID of the service decorator `name` in `file`, which a refined decorator shares with the decorator it refines. */
function serviceIdOf(file: string, name: string): string | undefined {
	const declaration = findDeclaration(file, name);
	if (!declaration || !ts.isVariableDeclaration(declaration.node)) {
		return undefined;
	}
	const initializer = declaration.node.initializer;
	if (!initializer || !ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression)) {
		return undefined;
	}
	const [argument] = initializer.arguments;
	if (initializer.expression.text === 'createDecorator' && argument && ts.isStringLiteral(argument)) {
		return argument.text;
	}
	if (initializer.expression.text === 'refineServiceDecorator' && argument && ts.isIdentifier(argument)) {
		return serviceIdOf(declaration.file, argument.text);
	}
	return undefined;
}

/** Whether `node` is within a class, rather than at the top level of its module, such as in a function there. */
function isInClass(node: ts.Node): boolean {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (ts.isClassLike(parent)) {
			return true;
		}
	}
	return false;
}

/** The classes that the `createInstance` calls within `node` create. */
function createdClassesOf(node: ts.Node): string[] {
	const created: string[] = [];
	forEachDescendant(node, descendant => {
		if (ts.isCallExpression(descendant) && ts.isPropertyAccessExpression(descendant.expression) && descendant.expression.name.text === 'createInstance') {
			const name = classNameOf(descendant.arguments[0]);
			if (name) {
				created.push(name);
			}
		}
	});
	return created;
}

/** The class that `expression`, such as the first argument of `createInstance`, names. */
function classNameOf(expression: ts.Expression | undefined): string | undefined {
	if (expression && ts.isExpressionWithTypeArguments(expression)) {
		expression = expression.expression;
	}
	return expression && ts.isIdentifier(expression) ? expression.text : undefined;
}

interface IClassReference {
	readonly file: string;
	readonly name: string;
}

interface IEditorWindowServices {
	/** The IDs of the services that an editor window provides. */
	readonly provided: Set<string>;
	/** The implementations that an editor window registers, by service ID. */
	readonly implementations: Map<string, IClassReference[]>;
	/** The classes that the sessions code of an editor window registers, or creates outside of classes. */
	readonly roots: IClassReference[];
}

function collectEditorWindowServices(): IEditorWindowServices {
	const provided = new Set<string>(['instantiationService']);
	const implementations = new Map<string, IClassReference[]>();
	const roots: IClassReference[] = [];
	for (const file of mainServiceCollectionFiles) {
		forEachDescendant(parse(file), node => {
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'set' && node.arguments[0] && ts.isIdentifier(node.arguments[0])) {
				const id = serviceIdOf(file, node.arguments[0].text);
				if (id) {
					provided.add(id);
				}
			}
		});
	}
	for (const file of collectSourceDependencies(editorWindowEntry)) {
		if (!file.startsWith('src/') || !file.endsWith('.ts') || file.endsWith('.d.ts')) {
			continue;
		}
		const isSessions = sessionsRoots.some(root => file.startsWith(root));
		const text = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
		if (!/register(Singleton|MainProcessRemoteService|SharedProcessRemoteService)\(/.test(text) && !isSessions) {
			continue;
		}
		forEachDescendant(parse(file), node => {
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && registrationFunctions.has(node.expression.text) && node.arguments[0] && ts.isIdentifier(node.arguments[0])) {
				const id = serviceIdOf(file, node.arguments[0].text);
				if (!id) {
					return;
				}
				provided.add(id);
				const implementation = classNameOf(node.arguments[1]);
				if (implementation) {
					const references = implementations.get(id) ?? [];
					references.push({ file, name: implementation });
					implementations.set(id, references);
				}
			}
			if (!isSessions) {
				return;
			}
			// What the sessions code registers or creates outside of classes: services, contributions, views and editors. A
			// class creates what it creates once it is created itself.
			let root: string | undefined;
			if (ts.isCallExpression(node)) {
				const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isIdentifier(node.expression) ? node.expression.text : undefined;
				if (callee === 'createInstance' && !isInClass(node)) {
					root = classNameOf(node.arguments[0]);
				} else if (callee === 'registerSingleton' || callee === 'registerWorkbenchContribution2') {
					root = classNameOf(node.arguments[1]);
				}
			} else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'SyncDescriptor') {
				root = classNameOf(node.arguments?.[0]);
			}
			if (root) {
				roots.push({ file, name: root });
			}
		});
	}
	return { provided, implementations, roots };
}

/**
 * The services that the classes of `roots` inject, through their constructors and those of their base classes, and of
 * the classes they create and the editor window's implementations of the services they inject, within the sessions code:
 * each with the class that injects it.
 */
function collectInjectedServices(roots: readonly IClassReference[], implementations: Map<string, IClassReference[]>): Map<string, string> {
	const injected = new Map<string, string>();
	const visited = new Set<ts.ClassDeclaration>();
	const pending = [...roots];
	while (pending.length > 0) {
		const reference = pending.pop()!;
		const declaration = findDeclaration(reference.file, reference.name);
		if (!declaration || !ts.isClassDeclaration(declaration.node) || visited.has(declaration.node) || !sessionsRoots.some(root => declaration.file.startsWith(root))) {
			continue;
		}
		visited.add(declaration.node);
		const className = `${declaration.node.name?.text} (${declaration.file})`;
		const constructor = declaration.node.members.find(ts.isConstructorDeclaration);
		for (const parameter of constructor?.parameters ?? []) {
			for (const decorator of ts.getDecorators(parameter) ?? []) {
				const id = ts.isIdentifier(decorator.expression) ? serviceIdOf(declaration.file, decorator.expression.text) : undefined;
				if (!id) {
					continue;
				}
				if (!injected.has(id)) {
					injected.set(id, className);
				}
				pending.push(...implementations.get(id) ?? []);
			}
		}
		pending.push(...createdClassesOf(declaration.node).map(name => ({ file: declaration.file, name })));
		for (const clause of declaration.node.heritageClauses ?? []) {
			if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
				const base = classNameOf(clause.types[0]);
				if (base) {
					pending.push({ file: declaration.file, name: base });
				}
			}
		}
	}
	return injected;
}

suite('Editor window sessions services', () => {

	test('an editor window provides every service that the sessions code it loads injects, also those that only the Agents window registers', () => {
		const { provided, implementations, roots } = collectEditorWindowServices();
		const injected = collectInjectedServices(roots, implementations);

		const missing = [...injected].filter(([id]) => !provided.has(id) && !scopedServices.has(id)).map(([id, consumer]) => `${id}, injected by ${consumer}`).sort();
		assert.deepStrictEqual(missing, []);
	});
});
