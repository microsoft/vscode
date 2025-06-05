/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as vscode from 'vscode';
import { TestCase, TestConstruct, TestSuite, VSCodeTest } from './testTree';

const suiteNames = new Set(['suite', 'flakySuite']);
const testNames = new Set(['test']);

export const enum Action {
	Skip,
	Recurse,
}

export const extractTestFromNode = (src: ts.SourceFile, node: ts.Node, parent: VSCodeTest) => {
	if (!ts.isCallExpression(node)) {
		return Action.Recurse;
	}

	const asSuite = identifyCall(node.expression, suiteNames);
	const asTest = identifyCall(node.expression, testNames);
	const either = asSuite || asTest;
	if (either === IdentifiedCall.Skipped) {
		return Action.Skip;
	}
	if (either === IdentifiedCall.Nothing) {
		return Action.Recurse;
	}

	const name = node.arguments[0];
	const func = node.arguments[1];
	if (!name || !ts.isStringLiteralLike(name) || !func) {
		return Action.Recurse;
	}

	const start = src.getLineAndCharacterOfPosition(name.pos);
	const end = src.getLineAndCharacterOfPosition(func.end);
	const range = new vscode.Range(
		new vscode.Position(start.line, start.character),
		new vscode.Position(end.line, end.character)
	);

	const cparent = parent instanceof TestConstruct ? parent : undefined;

	// we know this is either a suite or a test because we checked for skipped/nothing above

	if (asTest) {
		return new TestCase(name.text, range, cparent);
	}

	if (asSuite) {
		return new TestSuite(name.text, range, cparent);
	}

	throw new Error('unreachable');
};

const enum IdentifiedCall {
	Nothing,
	Skipped,
	IsThing,
}

const identifyCall = (lhs: ts.Node, needles: ReadonlySet<string>): IdentifiedCall => {
	if (ts.isIdentifier(lhs)) {
		return needles.has(lhs.escapedText || lhs.text) ? IdentifiedCall.IsThing : IdentifiedCall.Nothing;
	}

	if (isPropertyCall(lhs) && lhs.name.text === 'skip') {
		return needles.has(lhs.expression.text) ? IdentifiedCall.Skipped : IdentifiedCall.Nothing;
	}

	if (ts.isParenthesizedExpression(lhs) && ts.isConditionalExpression(lhs.expression)) {
		return Math.max(identifyCall(lhs.expression.whenTrue, needles), identifyCall(lhs.expression.whenFalse, needles));
	}

	return IdentifiedCall.Nothing;
};

const isPropertyCall = (
	lhs: ts.Node
): lhs is ts.PropertyAccessExpression & { expression: ts.Identifier; name: ts.Identifier } =>
	ts.isPropertyAccessExpression(lhs) &&
	ts.isIdentifier(lhs.expression) &&
	ts.isIdentifier(lhs.name);
