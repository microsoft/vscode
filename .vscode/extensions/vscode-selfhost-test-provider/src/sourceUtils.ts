/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as vscode from 'vscode';
import { TestCase, TestConstruct, TestSuite, VSCodeTest } from './testTree';

const suiteNames = new Set(['suite', 'flakySuite']);

export const enum Action {
	Skip,
	Recurse,
}

export const extractTestFromNode = (src: ts.SourceFile, node: ts.Node, parent: VSCodeTest) => {
	if (!ts.isCallExpression(node)) {
		return Action.Recurse;
	}

	let lhs = node.expression;
	if (isSkipCall(lhs)) {
		return Action.Skip;
	}

	if (isPropertyCall(lhs) && lhs.name.text === 'only') {
		lhs = lhs.expression;
	}

	const name = node.arguments[0];
	const func = node.arguments[1];
	if (!name || !ts.isIdentifier(lhs) || !ts.isStringLiteralLike(name)) {
		return Action.Recurse;
	}

	if (!func) {
		return Action.Recurse;
	}

	const start = src.getLineAndCharacterOfPosition(name.pos);
	const end = src.getLineAndCharacterOfPosition(func.end);
	const range = new vscode.Range(
		new vscode.Position(start.line, start.character),
		new vscode.Position(end.line, end.character)
	);

	const cparent = parent instanceof TestConstruct ? parent : undefined;
	if (lhs.escapedText === 'test') {
		return new TestCase(name.text, range, cparent);
	}

	if (suiteNames.has(lhs.escapedText.toString())) {
		return new TestSuite(name.text, range, cparent);
	}

	return Action.Recurse;
};

const isPropertyCall = (
	lhs: ts.LeftHandSideExpression
): lhs is ts.PropertyAccessExpression & { expression: ts.Identifier; name: ts.Identifier } =>
	ts.isPropertyAccessExpression(lhs) &&
	ts.isIdentifier(lhs.expression) &&
	ts.isIdentifier(lhs.name);

const isSkipCall = (lhs: ts.LeftHandSideExpression) =>
	isPropertyCall(lhs) && suiteNames.has(lhs.expression.text) && lhs.name.text === 'skip';
