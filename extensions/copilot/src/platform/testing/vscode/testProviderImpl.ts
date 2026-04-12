/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { findLast } from '../../../util/vs/base/common/arraysFind';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { ITestFailure, ITestProvider } from '../common/testProvider';

export class TestProvider extends Disposable implements ITestProvider {
	public readonly _serviceBrand: undefined;
	/** Position then status-ordered arrays of tests in the document for the last test result */
	private readonly resultsDocs = new ResourceMap<Readonly<vscode.TestResultSnapshot>[]>();
	private resultsDocsAreForTestRun: vscode.TestRunResult | undefined;

	constructor() {
		super();

		this._register(vscode.tests.onDidChangeTestResults(() => this.setHasFailureContextKey()));
		this.setHasFailureContextKey();
	}

	private setHasFailureContextKey() {
		vscode.commands.executeCommand(
			'setContext',
			'github.copilot.chat.fixTestFailures.hasFailure',
			!!Iterable.first(this.getAllFailures()),
		);
	}

	get onDidChangeResults() {
		return vscode.tests.onDidChangeTestResults;
	}

	get lastResultsFrom() {
		return vscode.tests.testResults.find(r => r.completedAt && r.results.length)?.completedAt;
	}

	/** @inheritdoc */
	public getAllFailures(): Iterable<ITestFailure> {
		const r = vscode.tests.testResults.find(r => r.results.length);
		if (!r) {
			return Iterable.empty();
		}

		return this.dfsFailures(r.results);
	}

	/** @inheritdoc */
	public getLastFailureFor(testItem: vscode.TestItem): ITestFailure | undefined {
		const chain: string[] = [];
		for (let i: vscode.TestItem | undefined = testItem; i; i = i.parent) {
			chain.push(i.id);
		}
		chain.reverse();

		for (const testRun of vscode.tests.testResults) {
			for (const _node of testRun.results) {
				let node: Readonly<vscode.TestResultSnapshot> | undefined = _node;
				for (const path of chain) {
					node = node.children.find(c => c.id === path);
					if (!node) {
						break;
					}
				}

				const failingTask = node?.taskStates.find(t => t.state === vscode.TestResultState.Failed || t.state === vscode.TestResultState.Errored);
				if (failingTask && node) {
					return { snapshot: node, task: failingTask };
				}
			}
		}
	}

	/** @inheritdoc */
	public getFailureAtPosition(uri: vscode.Uri, position: vscode.Position): ITestFailure | undefined {
		const r = vscode.tests.testResults.find(r => r.results.length);
		if (this.resultsDocsAreForTestRun !== r) {
			this.makeResultsDocs(r);
		}

		if (!r) {
			return undefined;
		}

		// Some frameworks only mark the test declaration and not the entire body.
		// If a test is a failure before the cursor position, still return it
		// unless there's another passed test below it and before the cursor.
		// Only compare the line numbers for #5292
		const results = this.resultsDocs.get(uri) || [];
		const test = findLast(results, i => !!i.range && i.range.start.line <= position.line);
		if (!test) {
			return undefined;
		}

		for (const task of test.taskStates) {
			if (task.state === vscode.TestResultState.Failed || task.state === vscode.TestResultState.Errored) {
				return { snapshot: test, task };
			}
		}

		return undefined;
	}

	/** @inheritdoc */
	public async hasAnyTests(): Promise<boolean> {
		return !!(await vscode.commands.executeCommand<string[]>('vscode.testing.getControllersWithTests')).length;
	}

	/** @inheritdoc */
	public async hasTestsInUri(uri: vscode.Uri): Promise<boolean> {
		try {
			const r = await vscode.commands.executeCommand<string[][]>('vscode.testing.getTestsInFile', uri);
			return !!r.length;
		} catch {
			return false;
		}
	}

	/**
	 * DFS is important because we want to get the most-granular tests possible
	 * rather then e.g. suites that would be less relevant.
	 */
	private *dfsFailures(tests: readonly Readonly<vscode.TestResultSnapshot>[]): Iterable<ITestFailure> {
		for (const test of tests) {
			yield* this.dfsFailures(test.children);
			for (const task of test.taskStates) {
				if (task.state === vscode.TestResultState.Failed || task.state === vscode.TestResultState.Errored) {
					yield { snapshot: test, task };
				}
			}
		}
	}

	private makeResultsDocs(r: vscode.TestRunResult | undefined) {
		this.resultsDocs.clear();
		this.resultsDocsAreForTestRun = r;
		if (!r) {
			return;
		}

		const queue = [r.results];
		while (queue.length) {
			for (const result of queue.pop()!) {
				queue.push(result.children);
				if (!result.uri) {
					continue;
				}

				const arr = this.resultsDocs.get(result.uri);
				if (!arr) {
					this.resultsDocs.set(result.uri, [result]);
				} else {
					arr.push(result);
				}
			}
		}

		const zeroRange = new vscode.Range(0, 0, 0, 0);
		for (const results of this.resultsDocs.values()) {
			results.sort((a, b) =>
				// sort by location  (ascending)
				(a.range || zeroRange).start.compareTo((b.range || zeroRange).start)
				// sort by test status (passed first)
				|| compareTaskStates(a.taskStates, b.taskStates)
			);
		}
	}
}

const compareTaskStates = (a: readonly vscode.TestSnapshotTaskState[], b: readonly vscode.TestSnapshotTaskState[]) => {
	let maxA = 0;
	let maxB = 0;
	for (const ta of a) {
		maxA = Math.max(maxA, ta.state);
	}
	for (const tb of b) {
		maxB = Math.max(maxB, tb.state);
	}
	return maxA - maxB;
};
