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
					let typeIdx = classifySymbol(symbol);

					if (typeIdx !== undefined) {

						let modifierSet = 0;
						if (node.parent) {
							const parentTypeIdx = tokenFromDeclarationMapping[node.parent.kind];
							if (parentTypeIdx === typeIdx && (<ts.NamedDeclaration>node.parent).name === node) {
								modifierSet = TokenModifier.declaration;
							}
						}
						const decl = symbol.valueDeclaration;
						const modifiers = decl ? ts.getCombinedModifierFlags(decl) : 0;
						const nodeFlags = decl ? ts.getCombinedNodeFlags(decl) : 0;
						if (modifiers & ts.ModifierFlags.Static) {
							modifierSet |= TokenModifier.static;
						}
						if (modifiers & ts.ModifierFlags.Async) {
							modifierSet |= TokenModifier.async;
						}
						if ((modifiers & ts.ModifierFlags.Readonly) || (nodeFlags & ts.NodeFlags.Const) || (symbol.getFlags() & ts.SymbolFlags.EnumMember)) {
							modifierSet |= TokenModifier.readonly;
						}
						resultTokens.push({ start: currentTextDocument.positionAt(node.getStart()), length: node.getWidth(), typeIdx, modifierSet });
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

function classifySymbol(symbol: ts.Symbol) {

	const flags = symbol.getFlags();
	if (flags & ts.SymbolFlags.Class) {
		return TokenType.class;
	} else if (flags & ts.SymbolFlags.Enum) {
		return TokenType.enum;
	} else if (flags & ts.SymbolFlags.TypeAlias) {
		return TokenType.type;
	} else if (flags & ts.SymbolFlags.Type) {
		if (flags & ts.SymbolFlags.Interface) {
			return TokenType.interface;
		} if (flags & ts.SymbolFlags.TypeParameter) {
			return TokenType.typeParameter;
		}
	}
	const decl = symbol.valueDeclaration || symbol.declarations && symbol.declarations[0];
	return tokenFromDeclarationMapping[decl.kind];
}



export function getSemanticTokenLegend() {
	return { types: tokenTypes, modifiers: tokenModifiers };
}


const tokenTypes: string[] = ['class', 'enum', 'interface', 'namespace', 'typeParameter', 'type', 'parameter', 'variable', 'property', 'constant', 'function', 'member'];
const tokenModifiers: string[] = ['declaration', 'static', 'async', 'readonly'];

const enum TokenType {
	'class' = 0,
	'enum' = 1,
	'interface' = 2,
	'namespace' = 3,
	'typeParameter' = 4,
	'type' = 5,
	'parameter' = 6,
	'variable' = 7,
	'property' = 8,
	'constant' = 9,
	'function' = 10,
	'member' = 11
}


const enum TokenModifier {
	'declaration' = 0x01,
	'static' = 0x02,
	'async' = 0x04,
	'readonly' = 0x08,
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
