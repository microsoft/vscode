/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Extracts extension point names from TypeScript source files by parsing the AST
 * to find all calls to `ExtensionsRegistry.registerExtensionPoint(...)`.
 *
 * Handles:
 * - Inline string literals: `{ extensionPoint: 'foo' }`
 * - Enum member values passed via function parameters
 * - Imported descriptor variables where the `extensionPoint` property is in another file
 *
 * This module can be used standalone (`node build/lib/extractExtensionPoints.ts`)
 * to regenerate the extension points file, or imported for use in gulp build tasks.
 */

import ts from 'typescript';
import path from 'path';
import fs from 'fs';

/**
 * Extract extension point names registered via `registerExtensionPoint` from
 * a single TypeScript source file's AST. No type checker is needed.
 */
export function extractExtensionPointNamesFromFile(sourceFile: ts.SourceFile): string[] {
	const results: string[] = [];
	visit(sourceFile);
	return results;

	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'registerExtensionPoint') {
				handleRegisterCall(node);
			}
		}
		ts.forEachChild(node, visit);
	}

	function handleRegisterCall(call: ts.CallExpression): void {
		const arg = call.arguments[0];
		if (!arg) {
			return;
		}
		if (ts.isObjectLiteralExpression(arg)) {
			handleInlineDescriptor(call, arg);
		} else if (ts.isIdentifier(arg)) {
			handleImportedDescriptor(arg);
		}
	}

	function handleInlineDescriptor(call: ts.CallExpression, obj: ts.ObjectLiteralExpression): void {
		const epProp = findExtensionPointProperty(obj);
		if (!epProp) {
			return;
		}
		if (ts.isStringLiteral(epProp.initializer)) {
			results.push(epProp.initializer.text);
		} else if (ts.isIdentifier(epProp.initializer)) {
			// The value references a function parameter - resolve via call sites
			handleParameterReference(call, epProp.initializer.text);
		}
	}

	function handleParameterReference(registerCall: ts.CallExpression, paramName: string): void {
		// Walk up to find the containing function
		let current: ts.Node | undefined = registerCall.parent;
		while (current && !ts.isFunctionDeclaration(current) && !ts.isFunctionExpression(current) && !ts.isArrowFunction(current)) {
			current = current.parent;
		}
		if (!current) {
			return;
		}
		const fn = current as ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

		// Find which parameter position matches paramName
		const paramIndex = fn.parameters.findIndex(
			p => ts.isIdentifier(p.name) && p.name.text === paramName
		);
		if (paramIndex < 0) {
			return;
		}

		// Find the function name to locate call sites
		const fnName = ts.isFunctionDeclaration(fn) && fn.name ? fn.name.text : undefined;
		if (!fnName) {
			return;
		}

		// Find all call sites of this function in the same file
		ts.forEachChild(sourceFile, function findCalls(node) {
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === fnName) {
				const callArg = node.arguments[paramIndex];
				if (callArg) {
					const value = resolveStringValue(callArg);
					if (value) {
						results.push(value);
					}
				}
			}
			ts.forEachChild(node, findCalls);
		});
	}

	function handleImportedDescriptor(identifier: ts.Identifier): void {
		const name = identifier.text;
		for (const stmt of sourceFile.statements) {
			if (!ts.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) {
				continue;
			}
			if (!ts.isNamedImports(stmt.importClause.namedBindings)) {
				continue;
			}
			for (const element of stmt.importClause.namedBindings.elements) {
				if (element.name.text !== name || !ts.isStringLiteral(stmt.moduleSpecifier)) {
					continue;
				}
				const modulePath = stmt.moduleSpecifier.text;
				const resolvedPath = path.resolve(
					path.dirname(sourceFile.fileName),
					modulePath.replace(/\.js$/, '.ts')
				);
				try {
					const content = fs.readFileSync(resolvedPath, 'utf-8');
					const importedFile = ts.createSourceFile(resolvedPath, content, ts.ScriptTarget.Latest, true);
					const originalName = element.propertyName?.text || element.name.text;
					const value = findExtensionPointInVariable(importedFile, originalName);
					if (value) {
						results.push(value);
					}
				} catch {
					// Imported file not found, skip
				}
				return;
			}
		}
	}

	function resolveStringValue(node: ts.Node): string | undefined {
		if (ts.isStringLiteral(node)) {
			return node.text;
		}
		// Property access: Enum.Member
		if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
			const enumName = node.expression.text;
			const memberName = node.name.text;
			for (const stmt of sourceFile.statements) {
				if (ts.isEnumDeclaration(stmt) && stmt.name.text === enumName) {
					for (const member of stmt.members) {
						if (ts.isIdentifier(member.name) && member.name.text === memberName
							&& member.initializer && ts.isStringLiteral(member.initializer)) {
							return member.initializer.text;
						}
					}
				}
			}
		}
		return undefined;
	}
}

function findExtensionPointProperty(obj: ts.ObjectLiteralExpression): ts.PropertyAssignment | undefined {
	for (const prop of obj.properties) {
		if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'extensionPoint') {
			return prop;
		}
	}
	return undefined;
}

function findExtensionPointInVariable(sourceFile: ts.SourceFile, varName: string): string | undefined {
	for (const stmt of sourceFile.statements) {
		if (!ts.isVariableStatement(stmt)) {
			continue;
		}
		for (const decl of stmt.declarationList.declarations) {
			if (ts.isIdentifier(decl.name) && decl.name.text === varName
				&& decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
				const epProp = findExtensionPointProperty(decl.initializer);
				if (epProp && ts.isStringLiteral(epProp.initializer)) {
					return epProp.initializer.text;
				}
			}
		}
	}
	return undefined;
}

// --- Standalone CLI ---

const rootDir = path.resolve(import.meta.dirname, '..', '..');
const srcDir = path.join(rootDir, 'src');
const outputPath = path.join(srcDir, 'vs', 'workbench', 'services', 'extensions', 'common', 'extensionPoints.json');

function scanDirectory(dir: string): string[] {
	const names: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			names.push(...scanDirectory(fullPath));
		} else if (entry.name.endsWith('.ts')) {
			const content = fs.readFileSync(fullPath, 'utf-8');
			if (content.includes('registerExtensionPoint')) {
				const sourceFile = ts.createSourceFile(fullPath, content, ts.ScriptTarget.Latest, true);
				names.push(...extractExtensionPointNamesFromFile(sourceFile));
			}
		}
	}
	return names;
}

function normalize(s: string): string {
	return s.replace(/\r\n/g, '\n');
}

function main(): void {
	const names = scanDirectory(path.join(srcDir, 'vs', 'workbench'));
	names.sort();
	const output = JSON.stringify(names, undefined, '\t') + '\n';
	try {
		const existing = fs.readFileSync(outputPath, 'utf-8');
		if (normalize(existing) === normalize(output)) {
			console.log(`No changes to ${path.relative(rootDir, outputPath)}`);
			return;
		}
	} catch {
		// File doesn't exist yet, write it
	}
	fs.writeFileSync(outputPath, output, 'utf-8');
	console.log(`Wrote ${names.length} extension points to ${path.relative(rootDir, outputPath)}`);
}

if (import.meta.main) {
	main();
}
