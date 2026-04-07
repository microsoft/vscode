/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import { Range, languages, workspace } from 'vscode';
import { timeout } from '../../../src/util/vs/base/common/async';
import { CachedFunction, LRUCachedFunction } from '../../../src/util/vs/base/common/cache';
import { Disposable } from '../../../src/util/vs/base/common/lifecycle';

export class Extension extends Disposable {
	private readonly _testCaches = new CachedFunction((fileName: string) => {
		let first = true;
		return new LRUCachedFunction(async (modelVersion: number) => {
			if (first) {
				first = false;
			} else {
				await timeout(1000);
			}

			const document = workspace.textDocuments.find(d => d.fileName === fileName);
			if (document?.version !== modelVersion) { return []; }
			const text = document.getText();
			if (!text.includes('test')) { return []; }
			const tests = getTests(text);
			return tests.filter(isVisualizableTest);
		});
	});

	constructor() {
		super();
		this._register(languages.registerCodeLensProvider([
			{ language: 'javascript', scheme: 'file' },
			{ language: 'typescript', scheme: 'file' }
		], {
			provideCodeLenses: async (document, token) => {
				const info = await (this._testCaches.get(document.fileName).get(document.version));
				return info.map(t => ({
					range: new Range(t.lineNumber, 0, t.lineNumber, 0),
					command: {
						title: 'Visualize Test',
						command: 'debug-value-editor.debug-and-send-request',
						arguments: [{
							launchConfigName: "Test Visualization Runner",
							args: {
								fileName: document.fileName,
								path: t.path,
							},
							revealAvailablePropertiesView: true,
						}],
					},
					isResolved: true,
				}));
			},
		}));
	}
}

function isVisualizableTest(info: TestInfo): boolean {
	return info.path.some(p => p.indexOf('[visualizable]') !== -1);
}

type TestInfo = {
	path: string[];
	lineNumber: number;
};
function getTests(document: string): TestInfo[] {
	let sf;
	try {
		sf = ts.createSourceFile('', document, ts.ScriptTarget.ESNext, true);
	} catch (e) {
		console.error(e);
		return [];
	}

	function parseTest(node: ts.Node): { testName: string; node: ts.Node } | undefined {
		if (!ts.isCallExpression(node)) { return undefined; }
		if (!ts.isIdentifier(node.expression)) { return undefined; }
		if (node.expression.text !== 'test') { return undefined; }
		const firstArg = node.arguments[0];
		if (!ts.isStringLiteral(firstArg)) { return undefined; }
		return {
			testName: firstArg.text,
			node: node.expression,
		};
	}

	function parseDescribeOrSuite(node: ts.Node): { describeName: string; node: ts.Node } | undefined {
		if (!ts.isCallExpression(node)) { return undefined; }
		if (!ts.isIdentifier(node.expression)) { return undefined; }
		if (node.expression.text !== 'describe' && node.expression.text !== 'suite') { return undefined; }
		const firstArg = node.arguments[0];
		if (!ts.isStringLiteral(firstArg)) { return undefined; }
		return {
			describeName: firstArg.text,
			node: node.expression,
		};
	}

	const currentPath: string[] = [];
	const result: TestInfo[] = [];
	function find(node: ts.Node) {

		const test = parseTest(node);
		if (test) {
			const pos = sf.getLineAndCharacterOfPosition(test.node.getStart());
			result.push({ path: [...currentPath, test.testName], lineNumber: pos.line });
		}

		const describe = parseDescribeOrSuite(node);
		if (describe) {
			currentPath.push(describe.describeName);
		}

		ts.forEachChild(node, find);

		if (describe) {
			currentPath.pop();
		}
	}
	find(sf);

	return result;
}
