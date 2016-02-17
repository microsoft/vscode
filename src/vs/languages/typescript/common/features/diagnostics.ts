/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import Options = require('vs/languages/typescript/common/options');
import Severity from 'vs/base/common/severity';
import converter = require('vs/languages/typescript/common/features/converter');
import lint = require('vs/languages/typescript/common/lint/lint');
import {IMarkerData} from 'vs/platform/markers/common/markers';

export function getSyntacticDiagnostics(languageService: ts.LanguageService, resource: URI, compilerOptions: ts.CompilerOptions, options: Options, isJavaScript:boolean): IMarkerData[]{

	var markers: IMarkerData[] = [];

	if (options.validate.enable && options.validate.syntaxValidation) {

		var filename = resource.toString(),
			diagnostics = languageService.getSyntacticDiagnostics(filename);

		if (isJavaScript) {
			var sourceFile = languageService.getSourceFile(filename);
			diagnostics.push.apply(diagnostics, _getJavaScriptSemanticDiagnostics(sourceFile, compilerOptions));
		}

		var classifier = createDiagnosticClassifier(options);

		for (var i = 0; i < diagnostics.length; i++) {
			_asMarker(diagnostics[i], classifier, markers);
		}
	}

	return markers;
}

export function getSemanticDiagnostics(languageService: ts.LanguageService, resource: URI, options: Options): { markers: IMarkerData[]; hasMissingFiles: boolean } {

	var markers: IMarkerData[] = [],
		hasMissingFiles = false;

	if (options.validate.enable && options.validate.semanticValidation) {

		var diagnostics = languageService.getSemanticDiagnostics(resource.toString()),
			classifier = createDiagnosticClassifier(options);

		for (var i = 0; i < diagnostics.length; i++) {
			_asMarker(diagnostics[i], classifier, markers);
			hasMissingFiles = hasMissingFiles || diagnostics[i].code === 2307 || diagnostics[i].code === 6053;
		}
	}

	return {
		markers,
		hasMissingFiles
	};
}

export function getExtraDiagnostics(languageService: ts.LanguageService, resource: URI, options: Options): IMarkerData[] {

	if (options.validate.enable === false || options.validate.semanticValidation === false) {
		return [];
	}

	return lint.check(options, languageService, resource).map(error => {
		return {
			message: error.message,
			severity: error.severity,
			startLineNumber: error.range.startLineNumber,
			startColumn: error.range.startColumn,
			endLineNumber: error.range.endLineNumber,
			endColumn: error.range.endColumn,
		};
	});
}

export interface DiagnosticClassifier {
	(diagnostic: ts.Diagnostic): Severity;
}

var _categorySeverity: { [n: number]: Severity } = Object.create(null);
_categorySeverity[ts.DiagnosticCategory.Error] = Severity.Error;
_categorySeverity[ts.DiagnosticCategory.Warning] = Severity.Warning;
_categorySeverity[ts.DiagnosticCategory.Message] = Severity.Info;

export function createDiagnosticClassifier(options: Options): DiagnosticClassifier {
	var map: { [code: number]: Severity } = Object.create(null);
	map[2403] = Severity.fromValue(options.validate.lint.redeclaredVariables);
	map[2403] = Severity.fromValue(options.validate.lint.redeclaredVariables);
	map[2304] = Severity.fromValue(options.validate.lint.undeclaredVariables);
	map[2339] = Severity.fromValue(options.validate.lint.unknownProperty);
	map[2459] = Severity.fromValue(options.validate.lint.unknownProperty);
	map[2460] = Severity.fromValue(options.validate.lint.unknownProperty);
	map[2306] = Severity.fromValue(options.validate.lint.unknownModule);
	map[2307] = Severity.fromValue(options.validate.lint.unknownModule);
	map[2322] = Severity.fromValue(options.validate.lint.forcedTypeConversion);
	map[2323] = Severity.fromValue(options.validate.lint.forcedTypeConversion);
	map[2345] = Severity.fromValue(options.validate.lint.forcedTypeConversion);
	map[2362] = Severity.fromValue(options.validate.lint.mixedTypesArithmetics);
	map[2363] = Severity.fromValue(options.validate.lint.mixedTypesArithmetics);
	map[2365] = Severity.fromValue(options.validate.lint.mixedTypesArithmetics);
	map[2356] = Severity.fromValue(options.validate.lint.mixedTypesArithmetics);
	map[2357] = Severity.fromValue(options.validate.lint.mixedTypesArithmetics);
	map[2359] = Severity.fromValue(options.validate.lint.primitivesInInstanceOf);
	map[2358] = Severity.fromValue(options.validate.lint.primitivesInInstanceOf);
	map[2350] = Severity.fromValue(options.validate.lint.newOnReturningFunctions);
	map[2346] = Severity.fromValue(options.validate.lint.parametersDontMatchSignature);
	map[1016] = Severity.fromValue(options.validate.lint.parametersOptionalButNotLast);
	map[2335] = options.validate._surpressSuperWithoutSuperTypeError ? Severity.Ignore : Severity.Error;
	return (diagnostic: ts.Diagnostic) => {
		var result = map[diagnostic.code];
		return typeof result !== 'undefined' ? result : _categorySeverity[diagnostic.category];
	};
}

function _asMarker(diagnostic: ts.Diagnostic, classifier: DiagnosticClassifier, markers: IMarkerData[]): void {

	var severity = classifier(diagnostic);
	if (severity === Severity.Ignore) {
		return;
	}

	var range = converter.getRange(diagnostic.file, diagnostic.start, diagnostic.start + diagnostic.length);

	markers.push({
		severity,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		code: diagnostic.code.toString(),
		startLineNumber: range.startLineNumber,
		startColumn: range.startColumn,
		endLineNumber: range.endLineNumber,
		endColumn: range.endColumn
	});
}

// typescript checks

function _getJavaScriptSemanticDiagnostics(sourceFile: ts.SourceFile, options: ts.CompilerOptions): ts.Diagnostic[]{
	var diagnostics: ts.Diagnostic[] = [];
	walk(sourceFile);

	return diagnostics;

	function walk(node: ts.Node): boolean {
		if (!node) {
			return false;
		}

		switch (node.kind) {
			case ts.SyntaxKind.ExportKeyword:
			case ts.SyntaxKind.ImportKeyword:
				if (options.target !== ts.ScriptTarget.ES6) {
					diagnostics.push(createDiagnosticForNode(node, true));
					return;
				}
				break;
				// fall through on purpose
			case ts.SyntaxKind.ImportEqualsDeclaration:
				diagnostics.push(createDiagnosticForNode(node));
				return true;
			case ts.SyntaxKind.ExportAssignment:
				if((<ts.ExportAssignment> node).isExportEquals) {
					diagnostics.push(createDiagnosticForNode(node));
				} else if (options.target !== ts.ScriptTarget.ES6) {
					diagnostics.push(createDiagnosticForNode(node, true));
				}
				return true;
			case ts.SyntaxKind.ClassDeclaration:
				var classDeclaration = <ts.ClassDeclaration>node;
				if (options.target !== ts.ScriptTarget.ES6) {
					diagnostics.push(createDiagnosticForNode(classDeclaration, true));
					return;
				}
				if (checkModifiers(classDeclaration.modifiers) ||
					checkTypeParameters(classDeclaration.typeParameters)) {
					return true;
				}
				break;
			case ts.SyntaxKind.HeritageClause:
				var heritageClause = <ts.HeritageClause>node;
				if (heritageClause.token === ts.SyntaxKind.ImplementsKeyword) {
					diagnostics.push(createDiagnosticForNode(node));
					return true;
				}
				break;
			case ts.SyntaxKind.InterfaceDeclaration:
				diagnostics.push(createDiagnosticForNode(node));
				return true;
			case ts.SyntaxKind.ModuleDeclaration:
				diagnostics.push(createDiagnosticForNode(node));
				return true;
			case ts.SyntaxKind.TypeAliasDeclaration:
				diagnostics.push(createDiagnosticForNode(node));
				return true;
			case ts.SyntaxKind.ArrowFunction:
				if (options.target !== ts.ScriptTarget.ES6) {
					diagnostics.push(createDiagnosticForNode(node, true));
				}
			case ts.SyntaxKind.MethodDeclaration:
			case ts.SyntaxKind.MethodSignature:
			case ts.SyntaxKind.Constructor:
			case ts.SyntaxKind.GetAccessor:
			case ts.SyntaxKind.SetAccessor:
			case ts.SyntaxKind.FunctionExpression:
			case ts.SyntaxKind.FunctionDeclaration:
				var functionDeclaration = <ts.FunctionLikeDeclaration>node;
				if (checkModifiers(functionDeclaration.modifiers) ||
					checkTypeParameters(functionDeclaration.typeParameters) ||
					checkTypeAnnotation(functionDeclaration.type)) {
					return true;
				}
				break;
			case ts.SyntaxKind.VariableStatement:
				if (options.target !== ts.ScriptTarget.ES6) {
					if (/^const|^let/.test(node.getText())) {
						diagnostics.push(createDiagnosticForNode(node, true));
						return;
					}
				}
				var variableStatement = <ts.VariableStatement>node;
				if (checkModifiers(variableStatement.modifiers)) {
					return true;
				}
				break;
			case ts.SyntaxKind.VariableDeclaration:
				var variableDeclaration = <ts.VariableDeclaration>node;
				if (checkTypeAnnotation(variableDeclaration.type)) {
					return true;
				}
				break;
			case ts.SyntaxKind.CallExpression:
			case ts.SyntaxKind.NewExpression:
				var expression = <ts.CallExpression>node;
				if (expression.typeArguments && expression.typeArguments.length > 0) {
					var start = expression.typeArguments.pos;
					diagnostics.push(createFileDiagnostic(sourceFile, start, expression.typeArguments.end - start));
					return true;
				}
				break;
			case ts.SyntaxKind.Parameter:
				var parameter = <ts.ParameterDeclaration>node;
				if (parameter.modifiers) {
					var start = parameter.modifiers.pos;
					diagnostics.push(createFileDiagnostic(sourceFile, start, parameter.modifiers.end - start));
					return true;
				}
				if (parameter.questionToken) {
					diagnostics.push(createDiagnosticForNode(parameter.questionToken));
					return true;
				}
				if (parameter.type) {
					diagnostics.push(createDiagnosticForNode(parameter.type));
					return true;
				}
				if (options.target !== ts.ScriptTarget.ES6) {
					if (parameter.initializer || parameter.dotDotDotToken) {
						diagnostics.push(createDiagnosticForNode(parameter.initializer || parameter.dotDotDotToken, true));
					}
				}
				break;
			case ts.SyntaxKind.PropertyDeclaration:
				diagnostics.push(createDiagnosticForNode(node));
				return true;
			case ts.SyntaxKind.EnumDeclaration:
				diagnostics.push(createDiagnosticForNode(node));
				return true;
			case ts.SyntaxKind.TypeAssertionExpression:
				var typeAssertionExpression = <ts.TypeAssertion>node;
				diagnostics.push(createDiagnosticForNode(typeAssertionExpression.type));
				return true;
			case ts.SyntaxKind.ShorthandPropertyAssignment:
				if (options.target !== ts.ScriptTarget.ES6) {
					diagnostics.push(createDiagnosticForNode(node, true));
				}
				return true;
			case ts.SyntaxKind.Decorator:
				if(!options.experimentalDecorators) {
					let diag = createDiagnosticForNode(node);
					diag.messageText = 'Decorators is an experimental feature which must be enabled explicitly. Use a jsconfig.json file and the \'experimentalDecorators\' switch.';
					diag.category = ts.DiagnosticCategory.Warning;
					diagnostics.push(diag);
				}
				return true;
		}

		return ts.forEachChild(node, walk);
	}

	function checkTypeParameters(typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>): boolean {
		if (typeParameters) {
			var start = typeParameters.pos;
			diagnostics.push(createFileDiagnostic(sourceFile, start, typeParameters.end - start));
			return true;
		}
		return false;
	}

	function checkTypeAnnotation(type: ts.TypeNode): boolean {
		if (type) {
			diagnostics.push(createDiagnosticForNode(type));
			return true;
		}

		return false;
	}

	function checkModifiers(modifiers: ts.ModifiersArray): boolean {
		if (modifiers) {
			modifiers.forEach(modifier => {
				switch (modifier.kind) {
					case ts.SyntaxKind.PublicKeyword:
					case ts.SyntaxKind.PrivateKeyword:
					case ts.SyntaxKind.ProtectedKeyword:
					case ts.SyntaxKind.DeclareKeyword:
						diagnostics.push(createDiagnosticForNode(modifier));
						return true;

					// These are all legal modifiers.
					case ts.SyntaxKind.StaticKeyword:
					case ts.SyntaxKind.ExportKeyword:
					case ts.SyntaxKind.ConstKeyword:
					case ts.SyntaxKind.DefaultKeyword:
				}
			});
		}
		return false;
	}

	function createDiagnosticForNode(node: ts.Node, target = false): ts.Diagnostic {
		return createFileDiagnostic(node.getSourceFile(), node.getStart(), node.getEnd() - node.getStart(), target);
	}

	function createFileDiagnostic(file: ts.SourceFile, start: number, length: number, target = false): ts.Diagnostic {
		return {
			file,
			start,
			length,
			messageText: !target
				? 'This can only be used in ts files.'
				: 'This can only be used with ES6. Make sure to have a jsconfig.json file which sets the target to ES6.',
			category: ts.DiagnosticCategory.Error,
			code: -1
		};
	}
}