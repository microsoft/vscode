/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as ts from 'typescript';
import { MoveSymbolRequest, MoveValidationResult } from './types';
import { TextMoveEngine } from './textMoveEngine';

interface JavaScriptMethodCallSite {
	callExpression: ts.CallExpression;
	propertyAccess: ts.PropertyAccessExpression;
	range: vscode.Range;
}

interface JavaScriptThisUsage {
	node: ts.ThisExpression;
	range: vscode.Range;
}

interface JavaScriptMethodMoveAnalysis {
	methodName: string;
	receiverParameterName: string;
	method: ts.MethodDeclaration;
	enclosingClass: ts.ClassLikeDeclaration;
	callSites: JavaScriptMethodCallSite[];
	thisUsages: JavaScriptThisUsage[];
	usesThis: boolean;
}

function isMoveValidationFailure(
	value: JavaScriptMethodMoveAnalysis | MoveValidationResult
): value is MoveValidationResult {
	return 'allowed' in value;
}

export class JavaScriptMethodExtractEngine extends TextMoveEngine {
	private chooseReceiverParameterName(method: ts.MethodDeclaration): string {
		const usedNames = new Set<string>();

		for (const parameter of method.parameters) {
			if (ts.isIdentifier(parameter.name)) {
				usedNames.add(parameter.name.text);
			}
		}

		for (const candidate of ['obj', 'receiver', 'thisArg', 'self']) {
			if (!usedNames.has(candidate)) {
				return candidate;
			}
		}

		let index = 1;
		while (usedNames.has(`receiver${index}`)) {
			index++;
		}

		return `receiver${index}`;
	}

	public analyzeMove(request: MoveSymbolRequest): JavaScriptMethodMoveAnalysis | MoveValidationResult {
		if (request.document.languageId !== 'javascript') {
			return {
				allowed: false,
				reason: 'Only JavaScript files are supported for this refactoring right now.'
			};
		}

		if (request.sourceParent?.kind !== vscode.SymbolKind.Class) {
			return {
				allowed: false,
				reason: 'The selected method must be inside a class.'
			};
		}

		const basicMoveValidation = super.canMove(request);
		if (!basicMoveValidation.allowed) {
			return basicMoveValidation;
		}

		const sourceFile = ts.createSourceFile(
			request.document.fileName,
			request.document.getText(),
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.JS
		);

		const movedMethod = this.findMovedMethod(
			sourceFile,
			request.document,
			request.source.range
		);

		if (!movedMethod) {
			return {
				allowed: false,
				reason: 'Could not resolve the selected method in the syntax tree.'
			};
		}

		const { method, enclosingClass } = movedMethod;

		if (ts.isConstructorDeclaration(method)) {
			return {
				allowed: false,
				reason: 'Constructors cannot be moved out of a class yet.'
			};
		}

		if (ts.isGetAccessorDeclaration(method) || ts.isSetAccessorDeclaration(method)) {
			return {
				allowed: false,
				reason: 'Getters and setters cannot be moved out of a class yet.'
			};
		}

		if (ts.isPropertyDeclaration(method)) {
			return {
				allowed: false,
				reason: 'Class fields cannot be moved out of a class yet.'
			};
		}

		if (!ts.isMethodDeclaration(method)) {
			return {
				allowed: false,
				reason: 'Only class methods can be moved out of a class	for now.'
			};
		}

		if (ts.isPrivateIdentifier(method.name)) {
			return {
				allowed: false,
				reason: 'Private methods cannot be moved out of a class yet.'
			};
		}

		if (!ts.isIdentifier(method.name)) {
			return {
				allowed: false,
				reason: 'Only methods with simple identifier names can be moved for now.'
			};
		}

		if (this.containsPrivateIdentifier(method)) {
			return {
				allowed: false,
				reason: 'Methods that use private fields or private methods cannot be moved yet.'
			};
		}

		if (this.hasModifier(method, ts.SyntaxKind.StaticKeyword)) {
			return {
				allowed: false,
				reason: 'Static methods cannot be moved out of a class yet.'
			};
		}

		if (this.containsSuperKeyword(method)) {
			return {
				allowed: false,
				reason: 'Methods that use super cannot be moved out of a class yet.'
			};
		}

		if (this.containsDynamicThisAccess(method)) {
			return {
				allowed: false,
				reason: 'Methods with dynamic this[...] access cannot be moved safely for now.'
			};
		}

		const methodName = method.name.text;
		const callSiteValidation = this.validateCallSites(
			sourceFile,
			enclosingClass,
			method,
			methodName
		);

		if (!callSiteValidation.allowed) {
			return callSiteValidation;
		}

		const callSites = this.collectCallSites(
			enclosingClass,
			method,
			methodName,
			request.document
		);

		const thisUsages = this.collectThisUsages(
			method,
			request.document
		);

		const analysis: JavaScriptMethodMoveAnalysis = {
			methodName,
			receiverParameterName: this.chooseReceiverParameterName(method),
			method,
			enclosingClass,
			callSites,
			thisUsages,
			usesThis: thisUsages.length > 0
		};

		return analysis;
	}

	public override canMove(request: MoveSymbolRequest): MoveValidationResult {
		const result = this.analyzeMove(request);

		if (isMoveValidationFailure(result)) {
			return result;
		}

		return { allowed: true };
	}

	public override buildEdit(request: MoveSymbolRequest): vscode.WorkspaceEdit | undefined {
		const analysis = this.analyzeMove(request);

		if (isMoveValidationFailure(analysis)) {
			return undefined;
		}

		const document = request.document;
		const originalText = document.getText();
		const eol = this.getDocumentEOL(document);
		const sourceFile = analysis.method.getSourceFile();

		const standaloneFunctionText = this.buildStandaloneFunctionText(request, analysis);
		if (!standaloneFunctionText) {
			return undefined;
		}

		const sourceRange = this.expandMethodRemovalRange(document, request);
		const targetRange = this.expandToWholeLines(document, request.target.range);

		const sourceStart = document.offsetAt(sourceRange.start);
		const sourceEnd = document.offsetAt(sourceRange.end);

		const insertionOffset = request.dropPosition === 'before'
			? document.offsetAt(targetRange.start)
			: document.offsetAt(targetRange.end);

		const replacements: Array<{ start: number; end: number; text: string }> = [];

		replacements.push({
			start: sourceStart,
			end: sourceEnd,
			text: ''
		});

		replacements.push({
			start: insertionOffset,
			end: insertionOffset,
			text: this.formatInsertedFunction(originalText, insertionOffset, standaloneFunctionText, eol)
		});

		// Rewrite direct calls so they invoke the extracted function instead of the class method.
		for (const callSite of analysis.callSites) {
			const argsText = callSite.callExpression.arguments
				.map(argument => argument.getText(sourceFile))
				.join(', ');

			let rewrittenArgs: string;
			if (analysis.usesThis) {
				rewrittenArgs = argsText.length > 0 ? `this, ${argsText}` : 'this';
			} else {
				rewrittenArgs = argsText;
			}

			replacements.push({
				start: callSite.callExpression.getStart(sourceFile),
				end: callSite.callExpression.getEnd(),
				text: `${analysis.methodName}(${rewrittenArgs})`
			});
		}

		const newText = this.applyReplacements(originalText, replacements);

		const edit = new vscode.WorkspaceEdit();
		const fullDocumentRange = new vscode.Range(
			document.positionAt(0),
			document.positionAt(originalText.length)
		);

		edit.replace(document.uri, fullDocumentRange, newText);

		return edit;
	}

	private buildStandaloneFunctionText(
		request: MoveSymbolRequest,
		analysis: JavaScriptMethodMoveAnalysis
	): string | undefined {
		const document = request.document;
		const method = analysis.method;
		const body = method.body;

		if (!body) {
			return undefined;
		}

		const sourceFile = method.getSourceFile();
		const eol = this.getDocumentEOL(document);

		const methodParameters = method.parameters.map(parameter =>
			parameter.getText(sourceFile)
		);

		const functionParameters = analysis.usesThis ? [
			analysis.receiverParameterName,
			...methodParameters
		] : [
			...methodParameters
		];

		let bodyText = body.getText(sourceFile);

		bodyText = this.replaceThisUsagesInBody(
			bodyText,
			body,
			analysis,
			sourceFile
		);

		bodyText = this.outdentBodyText(
			bodyText,
			this.getLineIndent(document, method.getStart(sourceFile)),
			eol
		);

		return `function ${analysis.methodName}(${functionParameters.join(', ')}) ${bodyText}`;
	}

	private replaceThisUsagesInBody(
		bodyText: string,
		body: ts.Block,
		analysis: JavaScriptMethodMoveAnalysis,
		sourceFile: ts.SourceFile
	): string {
		const bodyStart = body.getStart(sourceFile);
		const bodyEnd = body.getEnd();

		const replacements = analysis.thisUsages
			.map(usage => ({
				start: usage.node.getStart(sourceFile),
				end: usage.node.getEnd()
			}))
			.filter(usage => bodyStart <= usage.start && usage.end <= bodyEnd)
			.sort((a, b) => b.start - a.start);

		let rewrittenBody = bodyText;

		for (const replacement of replacements) {
			const relativeStart = replacement.start - bodyStart;
			const relativeEnd = replacement.end - bodyStart;

			rewrittenBody =
				rewrittenBody.slice(0, relativeStart) +
				analysis.receiverParameterName +
				rewrittenBody.slice(relativeEnd);
		}

		return rewrittenBody;
	}

	private applyReplacements(
		text: string,
		replacements: Array<{ start: number; end: number; text: string }>
	): string {
		const sortedReplacements = [...replacements].sort((a, b) => {
			if (a.start !== b.start) {
				return b.start - a.start;
			}

			return b.end - a.end;
		});

		let result = text;

		for (const replacement of sortedReplacements) {
			result =
				result.slice(0, replacement.start) +
				replacement.text +
				result.slice(replacement.end);
		}

		return result;
	}

	private formatInsertedFunction(
		originalText: string,
		offset: number,
		functionText: string,
		eol: string
	): string {
		const before = originalText.slice(0, offset);
		const after = originalText.slice(offset);

		const prefix = this.getSeparatorBeforeInsertion(before, eol);
		const suffix = this.getSeparatorAfterInsertion(after, eol);

		return prefix + functionText.trim() + suffix;
	}

	private getSeparatorBeforeInsertion(before: string, eol: string): string {
		if (before.length === 0 || before.endsWith(eol + eol)) {
			return '';
		}

		return before.endsWith(eol) ? eol : eol + eol;
	}

	private getSeparatorAfterInsertion(after: string, eol: string): string {
		if (after.length === 0 || after.startsWith(eol + eol)) {
			return '';
		}

		return after.startsWith(eol) ? eol : eol + eol;
	}

	private expandMethodRemovalRange(
		document: vscode.TextDocument,
		request: MoveSymbolRequest
	): vscode.Range {
		let startLine = request.source.range.start.line;
		let endLine = request.source.range.end.character === 0
			? request.source.range.end.line
			: request.source.range.end.line + 1;

		const minimumStartLine = request.sourceParent
			? request.sourceParent.range.start.line + 1
			: 0;

		let consumedLeadingBlankLine = false;
		while (startLine > minimumStartLine && this.isBlankLine(document, startLine - 1)) {
			startLine--;
			consumedLeadingBlankLine = true;
		}

		if (!consumedLeadingBlankLine) {
			while (endLine < document.lineCount && this.isBlankLine(document, endLine)) {
				endLine++;
			}
		}

		if (endLine >= document.lineCount) {
			const lastLine = document.lineAt(document.lineCount - 1);
			return new vscode.Range(
				new vscode.Position(startLine, 0),
				new vscode.Position(document.lineCount - 1, lastLine.text.length)
			);
		}

		return new vscode.Range(
			new vscode.Position(startLine, 0),
			new vscode.Position(endLine, 0)
		);
	}

	private isBlankLine(document: vscode.TextDocument, line: number): boolean {
		return line >= 0
			&& line < document.lineCount
			&& document.lineAt(line).text.trim() === '';
	}

	private getDocumentEOL(document: vscode.TextDocument): string {
		return document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
	}

	private getLineIndent(document: vscode.TextDocument, offset: number): string {
		const position = document.positionAt(offset);
		const lineText = document.lineAt(position.line).text;

		return lineText.match(/^\s*/)?.[0] ?? '';
	}

	private outdentBodyText(bodyText: string, indentToRemove: string, eol: string): string {
		if (!indentToRemove) {
			return bodyText;
		}

		const lines = bodyText.split(/\r\n|\r|\n/);

		const outdentedLines = lines.map((line, index) => {
			// Preserve the opening brace line while outdenting the function body.
			if (index === 0) {
				return line;
			}

			return line.startsWith(indentToRemove)
				? line.slice(indentToRemove.length)
				: line;
		});

		return outdentedLines.join(eol);
	}

	private collectCallSites(
		enclosingClass: ts.ClassLikeDeclaration,
		movedMethod: ts.MethodDeclaration,
		methodName: string,
		document: vscode.TextDocument
	): JavaScriptMethodCallSite[] {
		const callSites: JavaScriptMethodCallSite[] = [];

		const visit = (node: ts.Node): void => {
			// Calls inside the moved method are moved with the function and do not need call-site rewriting.
			if (node === movedMethod) {
				return;
			}

			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const propertyAccess = node.expression;

				if (
					propertyAccess.expression.kind === ts.SyntaxKind.ThisKeyword &&
					propertyAccess.name.text === methodName
				) {
					callSites.push({
						callExpression: node,
						propertyAccess,
						range: this.nodeToRange(document, node)
					});
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(enclosingClass);

		return callSites;
	}

	private collectThisUsages(
		method: ts.MethodDeclaration,
		document: vscode.TextDocument
	): JavaScriptThisUsage[] {
		const usages: JavaScriptThisUsage[] = [];

		const visit = (node: ts.Node): void => {
			if (node.kind === ts.SyntaxKind.ThisKeyword) {
				usages.push({
					node: node as ts.ThisExpression,
					range: this.nodeToRange(document, node)
				});
				return;
			}

			ts.forEachChild(node, visit);
		};

		if (method.body) {
			visit(method.body);
		}

		return usages;
	}

	private nodeToRange(
		document: vscode.TextDocument,
		node: ts.Node
	): vscode.Range {
		return new vscode.Range(
			document.positionAt(node.getStart()),
			document.positionAt(node.getEnd())
		);
	}

	private findMovedMethod(
		sourceFile: ts.SourceFile,
		document: vscode.TextDocument,
		sourceRange: vscode.Range
	): { method: ts.ClassElement; enclosingClass: ts.ClassLikeDeclaration } | undefined {
		const sourceStart = document.offsetAt(sourceRange.start);
		const sourceEnd = document.offsetAt(sourceRange.end);

		let bestMatch: { method: ts.ClassElement; enclosingClass: ts.ClassLikeDeclaration } | undefined;
		let bestMatchLength = Number.MAX_SAFE_INTEGER;

		const visit = (node: ts.Node): void => {
			if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
				for (const member of node.members) {
					const memberStart = member.getFullStart();
					const memberEnd = member.getEnd();

					if (memberStart <= sourceStart && sourceEnd <= memberEnd) {
						const memberLength = memberEnd - memberStart;
						if (memberLength < bestMatchLength) {
							bestMatch = {
								method: member,
								enclosingClass: node
							};
							bestMatchLength = memberLength;
						}
					}
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(sourceFile);
		return bestMatch;
	}

	private validateCallSites(
		sourceFile: ts.SourceFile,
		enclosingClass: ts.ClassLikeDeclaration,
		movedMethod: ts.MethodDeclaration,
		methodName: string
	): MoveValidationResult {
		let invalidReason: string | undefined;

		const visit = (node: ts.Node): void => {
			if (invalidReason) {
				return;
			}

			// Validate references to the moved method outside the method body; the body itself is rewritten separately.
			if (node === movedMethod) {
				return;
			}

			if (ts.isPropertyAccessExpression(node) && node.name.text === methodName) {
				const isThisAccess = node.expression.kind === ts.SyntaxKind.ThisKeyword;
				const isDirectCall = ts.isCallExpression(node.parent) && node.parent.expression === node;
				const isInsideSourceClass = this.isNodeInside(node, enclosingClass);

				if (!isThisAccess || !isDirectCall || !isInsideSourceClass) {
					invalidReason = `Cannot safely rewrite all call sites for '${methodName}'.`;
					return;
				}
			}

			if (ts.isElementAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
				invalidReason = 'Dynamic this[...] access prevents safe call-site analysis.';
				return;
			}

			ts.forEachChild(node, visit);
		};

		visit(sourceFile);

		if (invalidReason) {
			return {
				allowed: false,
				reason: invalidReason
			};
		}

		return { allowed: true };
	}

	private isNodeInside(node: ts.Node, parent: ts.Node): boolean {
		return parent.getFullStart() <= node.getFullStart() && node.getEnd() <= parent.getEnd();
	}

	private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
		return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === kind) === true;
	}

	private containsPrivateIdentifier(node: ts.Node): boolean {
		let found = false;

		const visit = (child: ts.Node): void => {
			if (found) {
				return;
			}

			if (ts.isPrivateIdentifier(child)) {
				found = true;
				return;
			}

			ts.forEachChild(child, visit);
		};

		visit(node);
		return found;
	}

	private containsSuperKeyword(node: ts.Node): boolean {
		let found = false;

		const visit = (child: ts.Node): void => {
			if (found) {
				return;
			}

			if (child.kind === ts.SyntaxKind.SuperKeyword) {
				found = true;
				return;
			}

			ts.forEachChild(child, visit);
		};

		visit(node);
		return found;
	}

	private containsDynamicThisAccess(node: ts.Node): boolean {
		let found = false;

		const visit = (child: ts.Node): void => {
			if (found) {
				return;
			}

			if (ts.isElementAccessExpression(child) && child.expression.kind === ts.SyntaxKind.ThisKeyword) {
				found = true;
				return;
			}

			ts.forEachChild(child, visit);
		};

		visit(node);
		return found;
	}
}
