/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, SemanticTokenData } from './languageModes';
import * as ts from 'typescript';


export function getSemanticTokens(jsLanguageService: ts.LanguageService, currentTextDocument: TextDocument, fileName: string): SemanticTokenData[] {
	//https://ts-ast-viewer.com/#code/AQ0g2CmAuwGbALzAJwG4BQZQGNwEMBnQ4AQQEYBmYAb2C22zgEtJwATJVTRxgcwD27AQAp8AGmAAjAJS0A9POB8+7NQ168oscAJz5wANXwAnLug2bsJmAFcTAO2XAA1MHyvgu-UdOeWbOw8ViAAvpagocBAA

	let resultTokens: SemanticTokenData[] = [];

	const program = jsLanguageService.getProgram();
	if (program) {
		const typeChecker = program.getTypeChecker();

		function visit(node: ts.Node) {
			if (node.kind === ts.SyntaxKind.Identifier) {
				const symbol = typeChecker.getSymbolAtLocation(node);
				if (symbol) {
					const decl = symbol.valueDeclaration || symbol.declarations && symbol.declarations[0];
					if (decl) {
						let typeIdx = tokenFromDeclarationMapping[decl.kind];
						let modifierSet = 0;
						if (node.parent) {
							const parentTypeIdx = tokenFromDeclarationMapping[node.parent.kind];
							if (parentTypeIdx === typeIdx && (<ts.NamedDeclaration>node.parent).name === node) {
								modifierSet = TokenModifier.declaration;
							}
						}
						const modifiers = ts.getCombinedModifierFlags(decl);
						if (modifiers & ts.ModifierFlags.Static) {
							modifierSet |= TokenModifier.static;
						}
						if (modifiers & ts.ModifierFlags.Async) {
							modifierSet |= TokenModifier.async;
						}
						if (typeIdx !== undefined) {
							resultTokens.push({ start: currentTextDocument.positionAt(node.getStart()), length: node.getWidth(), typeIdx, modifierSet });
						}
					}
				}
			}

			ts.forEachChild(node, visit);
		}
		const sourceFile = program.getSourceFile(fileName);
		if (sourceFile) {
			visit(sourceFile);
		}
	}

	return resultTokens;
}

enum TokenType {
	'class',
	'enum',
	'interface',
	'namespace',
	'typeParameter',
	'type',
	'parameter',
	'variable',
	'property',
	'constant',
	'function',
	'member',
	_sentinel
}


enum TokenModifier {
	'declaration',
	'static',
	'async',
	_sentinel
}

export function getSemanticTokenLegend() {
	const tokenTypes = [];
	for (let i = 0; i < TokenType._sentinel; i++) {
		tokenTypes.push(TokenType[i]);
	}
	const tokenModifiers = [];
	for (let i = 0; i < TokenModifier._sentinel; i++) {
		tokenModifiers.push(TokenModifier[i]);
	}
	return { types: tokenTypes, modifiers: tokenModifiers };
}

const tokenFromDeclarationMapping: { [name: string]: TokenType } = {
	[ts.SyntaxKind.VariableDeclaration]: TokenType.variable,
	[ts.SyntaxKind.Parameter]: TokenType.parameter,
	[ts.SyntaxKind.PropertyDeclaration]: TokenType.property,
	[ts.SyntaxKind.ModuleDeclaration]: TokenType.namespace,
	[ts.SyntaxKind.EnumDeclaration]: TokenType.enum,
	[ts.SyntaxKind.EnumMember]: TokenType.property,
	[ts.SyntaxKind.ClassDeclaration]: TokenType.class,
	[ts.SyntaxKind.MethodDeclaration]: TokenType.member,
	[ts.SyntaxKind.FunctionDeclaration]: TokenType.function,
	[ts.SyntaxKind.MethodSignature]: TokenType.member,
	[ts.SyntaxKind.GetAccessor]: TokenType.property,
	[ts.SyntaxKind.PropertySignature]: TokenType.property,
	[ts.SyntaxKind.InterfaceDeclaration]: TokenType.interface,
	[ts.SyntaxKind.TypeAliasDeclaration]: TokenType.type,
	[ts.SyntaxKind.TypeParameter]: TokenType.typeParameter
};
