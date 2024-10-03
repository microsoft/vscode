/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import {
	commands,
	Disposable,
	languages,
	Position,
	Range,
	TestMessage,
	TestResultSnapshot,
	TestRunResult,
	tests,
	TextDocument,
	Uri,
	workspace,
	WorkspaceEdit,
} from 'vscode';
import { memoizeLast } from './memoize';
import { getTestMessageMetadata } from './metadata';

const enum Constants {
	FixCommandId = 'selfhost-test.fix-test',
}

export class FailingDeepStrictEqualAssertFixer {
	private disposables: Disposable[] = [];

	constructor() {
		this.disposables.push(
			commands.registerCommand(Constants.FixCommandId, async (uri: Uri, position: Position) => {
				const document = await workspace.openTextDocument(uri);

				const failingAssertion = detectFailingDeepStrictEqualAssertion(document, position);
				if (!failingAssertion) {
					return;
				}

				const expectedValueNode = failingAssertion.assertion.expectedValue;
				if (!expectedValueNode) {
					return;
				}

				const start = document.positionAt(expectedValueNode.getStart());
				const end = document.positionAt(expectedValueNode.getEnd());

				const edit = new WorkspaceEdit();
				edit.replace(uri, new Range(start, end), formatJsonValue(failingAssertion.actualJSONValue));
				await workspace.applyEdit(edit);
			})
		);

		this.disposables.push(
			languages.registerCodeActionsProvider('typescript', {
				provideCodeActions: (document, range) => {
					const failingAssertion = detectFailingDeepStrictEqualAssertion(document, range.start);
					if (!failingAssertion) {
						return undefined;
					}

					return [
						{
							title: 'Fix Expected Value',
							command: Constants.FixCommandId,
							arguments: [document.uri, range.start],
						},
					];
				},
			})
		);
	}

	dispose() {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}

const identifierLikeRe = /^[$a-z_][a-z0-9_$]*$/i;

const tsPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

const formatJsonValue = (value: unknown) => {
	if (typeof value !== 'object') {
		return JSON.stringify(value);
	}

	const src = ts.createSourceFile('', `(${JSON.stringify(value)})`, ts.ScriptTarget.ES5, true);
	const outerExpression = src.statements[0] as ts.ExpressionStatement;
	const parenExpression = outerExpression.expression as ts.ParenthesizedExpression;

	const unquoted = ts.transform(parenExpression, [
		context => (node: ts.Node) => {
			const visitor = (node: ts.Node): ts.Node =>
				ts.isPropertyAssignment(node) &&
					ts.isStringLiteralLike(node.name) &&
					identifierLikeRe.test(node.name.text)
					? ts.factory.createPropertyAssignment(
						ts.factory.createIdentifier(node.name.text),
						ts.visitNode(node.initializer, visitor) as ts.Expression
					)
					: ts.isStringLiteralLike(node) && node.text === '[undefined]'
						? ts.factory.createIdentifier('undefined')
						: ts.visitEachChild(node, visitor, context);

			return ts.visitNode(node, visitor);
		},
	]);

	return tsPrinter.printNode(ts.EmitHint.Expression, unquoted.transformed[0], src);
};

/** Parses the source file, memoizing the last document so cursor moves are efficient */
const parseSourceFile = memoizeLast((text: string) =>
	ts.createSourceFile('', text, ts.ScriptTarget.ES5, true)
);

const assertionFailureMessageRe = /^Expected values to be strictly (deep-)?equal:/;

/** Gets information about the failing assertion at the poisition, if any. */
function detectFailingDeepStrictEqualAssertion(
	document: TextDocument,
	position: Position
): { assertion: StrictEqualAssertion; actualJSONValue: unknown } | undefined {
	const sf = parseSourceFile(document.getText());
	const offset = document.offsetAt(position);
	const assertion = StrictEqualAssertion.atPosition(sf, offset);
	if (!assertion) {
		return undefined;
	}

	const startLine = document.positionAt(assertion.offsetStart).line;
	const messages = getAllTestStatusMessagesAt(document.uri, startLine);
	const strictDeepEqualMessage = messages.find(m =>
		assertionFailureMessageRe.test(typeof m.message === 'string' ? m.message : m.message.value)
	);

	if (!strictDeepEqualMessage) {
		return undefined;
	}

	const metadata = getTestMessageMetadata(strictDeepEqualMessage);
	if (!metadata) {
		return undefined;
	}

	return {
		assertion: assertion,
		actualJSONValue: metadata.actualValue,
	};
}

class StrictEqualAssertion {
	/**
	 * Extracts the assertion at the current node, if it is one.
	 */
	public static fromNode(node: ts.Node): StrictEqualAssertion | undefined {
		if (!ts.isCallExpression(node)) {
			return undefined;
		}

		const expr = node.expression.getText();
		if (expr !== 'assert.deepStrictEqual' && expr !== 'assert.strictEqual') {
			return undefined;
		}

		return new StrictEqualAssertion(node);
	}

	/**
	 * Gets the equals assertion at the given offset in the file.
	 */
	public static atPosition(sf: ts.SourceFile, offset: number): StrictEqualAssertion | undefined {
		let node = findNodeAt(sf, offset);

		while (node.parent) {
			const obj = StrictEqualAssertion.fromNode(node);
			if (obj) {
				return obj;
			}
			node = node.parent;
		}

		return undefined;
	}

	constructor(private readonly expression: ts.CallExpression) { }

	/** Gets the expected value */
	public get expectedValue(): ts.Expression | undefined {
		return this.expression.arguments[1];
	}

	/** Gets the position of the assertion expression. */
	public get offsetStart(): number {
		return this.expression.getStart();
	}
}

function findNodeAt(parent: ts.Node, offset: number): ts.Node {
	for (const child of parent.getChildren()) {
		if (child.getStart() <= offset && offset <= child.getEnd()) {
			return findNodeAt(child, offset);
		}
	}
	return parent;
}

function getAllTestStatusMessagesAt(uri: Uri, lineNumber: number): TestMessage[] {
	if (tests.testResults.length === 0) {
		return [];
	}

	const run = tests.testResults[0];
	const snapshots = getTestResultsWithUri(run, uri);
	const result: TestMessage[] = [];

	for (const snapshot of snapshots) {
		for (const m of snapshot.taskStates[0].messages) {
			if (
				m.location &&
				m.location.range.start.line <= lineNumber &&
				lineNumber <= m.location.range.end.line
			) {
				result.push(m);
			}
		}
	}

	return result;
}

function getTestResultsWithUri(testRun: TestRunResult, uri: Uri): TestResultSnapshot[] {
	const results: TestResultSnapshot[] = [];

	const walk = (r: TestResultSnapshot) => {
		for (const c of r.children) {
			walk(c);
		}
		if (r.uri?.toString() === uri.toString()) {
			results.push(r);
		}
	};

	for (const r of testRun.results) {
		walk(r);
	}

	return results;
}
