/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './bootstrap';

import * as fs from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';
import { AsyncIterableObject, AsyncIterableSource } from '../../../src/util/vs/base/common/async';
import { CancellationToken } from '../../../src/util/vs/base/common/cancellation';
import { DisposableStore } from '../../../src/util/vs/base/common/lifecycle';
import { URI } from '../../../src/util/vs/base/common/uri';
import { generateUuid } from '../../../src/util/vs/base/common/uuid';
import { IDetectedSuiteOutput, IDetectedTestOutput, OutputType, RunOutput } from '../../../test/simulation/shared/sharedTypes';
import { ISpawnSimulationOptions, SIMULATION_MAIN_PATH, extractJSONL, spawnSimulation } from '../../../test/simulation/workbench/utils/simulationExec';
import { REPO_ROOT } from '../../../test/simulation/workbench/utils/utils';

export async function activate(context: vscode.ExtensionContext) {

	// probe for project root
	let isCorrectRepo = false;
	try {
		const pkg = JSON.parse(String(await fs.promises.readFile(join(REPO_ROOT, 'package.json'))));
		isCorrectRepo = pkg.name === 'copilot-chat';
	} catch (err) {
		console.error('[STEST] error reading ' + join(REPO_ROOT, 'package.json'));
		console.error(err);
		isCorrectRepo = false;
	}

	if (!isCorrectRepo) {
		console.log('[STEST] NO activation because in wrong REPO/WORKSPACE', REPO_ROOT);
		return;
	}

	const ctrl = vscode.tests.createTestController('simulation', 'STest');
	ctrl.refreshHandler = async (token) => {

		const stream = spawnSimulation<IDetectedTestOutput | IDetectedSuiteOutput>({ ignoreNonJSONLines: true, args: ['--list-tests', '--list-suites', '--json'] }, token);

		const suites = new Map<string, vscode.TestItem>();

		for await (const item of stream) {

			const testItem = ctrl.createTestItem(item.name, item.name, item.location && URI.file(item.location.path));
			testItem.range = item.location && new vscode.Range(item.location.position.line, item.location.position.character, item.location.position.line, item.location.position.character);

			if (item.type === OutputType.detectedSuite) {
				suites.set(item.name, testItem);
				ctrl.items.add(testItem);

			} else if (item.type === OutputType.detectedTest) {
				const suiteItem = suites.get(item.suiteName);
				(suiteItem?.children ?? ctrl.items).add(testItem);
			}
		}

	};
	ctrl.refreshHandler(CancellationToken.None);

	const simulationAsTestRun = async (request: vscode.TestRunRequest, options: { extraArgs: string[]; debug?: boolean }, token: vscode.CancellationToken) => {

		const run = ctrl.createTestRun(request, undefined, false);

		const args = ['--json'];

		if (options.extraArgs.length) {
			args.push(...options.extraArgs);
		}

		const items = new Map<string, vscode.TestItem>();
		const stack: vscode.TestItemCollection[] = [];

		if (request.include && request.include.length) {
			const grep: string[] = [];
			for (const item of request.include) {
				grep.push(item.label);
				items.set(item.label, item);
				stack.push(item.children);
			}
			args.push('--grep', grep.join('|'));

		} else {
			stack.push(ctrl.items);
		}
		while (stack.length > 0) {
			const coll = stack.pop()!;
			for (const [, item] of coll) {
				if (item.children.size > 0) {
					stack.push(item.children);
				} else {
					items.set(item.label, item);
				}
			}
		}

		if (request.exclude && request.exclude.length) {
			const omitGrep: string[] = [];
			for (const item of request.exclude) {
				omitGrep.push(item.label);
				items.delete(item.label);
			}
			args.push('--omit-grep', omitGrep.join('|'));
		}

		run.appendOutput('[STEST] will SPAWN simulation with: ' + args.join(' ') + '\r\n');

		try {
			const stream = !options.debug
				? spawnSimulation<RunOutput>({ ignoreNonJSONLines: true, args }, token)
				: debugSimulation<RunOutput>({ ignoreNonJSONLines: true, args }, token);

			class Runs {

				private _starts: number = 0;
				private _passes: number = 0;
				private _fails: number = 0;

				constructor(readonly n: number) { }

				get passes() {
					return this._passes;
				}

				get fails() {
					return this._fails;
				}

				start() {
					this._starts++;
					return this._starts === 1;
				}

				done(pass: boolean) {
					if (pass) {
						this._passes++;
					} else {
						this._fails++;
					}
					if (this._passes + this._fails === this.n) {
						return true;
					}
				}
			}

			const nRuns = new Map<vscode.TestItem, Runs>();

			for await (const output of stream) {

				run.appendOutput('[STEST] received output:\r\n' + JSON.stringify(output, undefined, 2).replaceAll('\n', '\r\n') + '\r\n');

				if (output.type === OutputType.initialTestSummary) {
					// mark tests as enqueued
					for (const item of output.testsToRun) {
						const test = items.get(item);
						if (test) {
							run.enqueued(test);
							nRuns.set(test, new Runs(output.nRuns));
						}
					}
				} else if (output.type === OutputType.skippedTest) {
					// mark tests as skipped
					const test = items.get(output.name);
					if (test) {
						run.skipped(test);
						nRuns.delete(test);
					}

				} else if (output.type === OutputType.testRunStart) {
					// mark tests as running
					const test = items.get(output.name);
					const runs = test && nRuns.get(test)!;
					if (test && runs?.start()) {
						run.started(test);
					}

				} else if (output.type === OutputType.testRunEnd) {
					// mark tests as done, process output
					const test = items.get(output.name);
					if (!test) {
						continue;
					}
					const runs = nRuns.get(test)!;
					if (runs.done(output.pass)) {
						run.passed(test);
						run.appendOutput(`[STEST] DONE with ${output.name}, ${runs.passes} passes and ${runs.fails} fails`, undefined, test);
					}
				} else if (output.type === OutputType.deviceCodeCallback) {
					vscode.env.openExternal(vscode.Uri.parse(output.url));
				}
			}

		} catch (err) {
			if (err instanceof Error && err.name !== 'Cancelled') {
				run.appendOutput('[STEST] FAILED to run\r\n');
				run.appendOutput(String(err) + '\r\n');
			}

		} finally {
			run.end();
		}
	};

	const defaultRunProfile = ctrl.createRunProfile('STest', vscode.TestRunProfileKind.Run, (request, token) => simulationAsTestRun(request, { extraArgs: ['-p', '20'], }, token));
	context.subscriptions.push(defaultRunProfile);
	defaultRunProfile.isDefault = true;

	const defaultDebugProfile = ctrl.createRunProfile('STest: debug', vscode.TestRunProfileKind.Debug, (request, token) => simulationAsTestRun(request, { extraArgs: ['--n', '1', '-p', '1'], debug: true }, token));
	context.subscriptions.push(defaultDebugProfile);

	const visualizeDebugProfile = ctrl.createRunProfile('STest: inspect and visualize', vscode.TestRunProfileKind.Debug, (request, token) => {
		const args = {
			fileName: request.include![0].uri!.fsPath,
			path: request.include![0].label,
		};
		vscode.commands.executeCommand(
			'debug-value-editor.debug-and-send-request',
			{
				launchConfigName: "Test Visualization Runner STests",
				args: args,
				revealAvailablePropertiesView: true,
			}
		);
	});
	context.subscriptions.push(visualizeDebugProfile);

	const updateBaselineProfile = ctrl.createRunProfile('STest: update-baseline', vscode.TestRunProfileKind.Run, (request, token) => simulationAsTestRun(request, { extraArgs: ['--update-baseline', '-p', '20'] }, token));
	context.subscriptions.push(updateBaselineProfile);

	context.subscriptions.push(ctrl);

}


function debugSimulation<T>(options: ISpawnSimulationOptions, token: CancellationToken): AsyncIterableObject<T> {

	const source = new AsyncIterableSource<string>();

	const key = generateUuid();
	const store = new DisposableStore();
	const sessions = new Set<vscode.DebugSession>();

	// (1) launch
	Promise.resolve(vscode.debug.startDebugging(vscode.workspace.workspaceFolders![0], {
		type: 'node-terminal',
		request: 'launch',
		name: 'Debug Simulation Tests',
		command: `node ${SIMULATION_MAIN_PATH} ${options.args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`,
		__key: key,
	})).catch(err => source.reject(err));

	token.onCancellationRequested(() => {
		sessions.forEach(s => !s.parentSession && vscode.debug.stopDebugging(s));
		source.resolve();
	});

	//(2) spy
	store.add(vscode.debug.registerDebugAdapterTrackerFactory('*', {
		createDebugAdapterTracker: (session) => {

			if (sessions.has(session)) {
				return;
			}

			const __key = session.configuration.__key ?? session.parentSession?.configuration.__key;
			if (__key !== key) {
				return;
			}

			sessions.add(session);

			return {
				onDidSendMessage({ type, event, body }) {
					if (type === 'event' && event === 'output' && body.category === 'stdout') {
						source.emitOne(body.output);
					}
				}
			};
		}
	}));
	store.add(vscode.debug.onDidTerminateDebugSession(session => {
		if (sessions.delete(session)) {
			source.resolve();
		}
	}));

	source.asyncIterable.toPromise().finally(() => store.dispose());

	return extractJSONL<T>(source.asyncIterable, options);
}
