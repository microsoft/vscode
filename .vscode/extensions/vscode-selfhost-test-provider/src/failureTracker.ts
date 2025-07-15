/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import * as vscode from 'vscode';

interface IGitState {
	commitId: string;
	tracked: string;
	untracked: Record<string, string>;
}

interface ITrackedRemediation {
	snapshot: vscode.TestResultSnapshot;
	failing: IGitState;
	passing: IGitState;
}

const MAX_FAILURES = 10;

export class FailureTracker {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly lastFailed = new Map<
		string,
		{ snapshot: vscode.TestResultSnapshot; failing: IGitState }
	>();

	private readonly logFile: string;
	private logs?: ITrackedRemediation[];

	constructor(storageLocation: string, private readonly rootDir: string) {
		this.logFile = join(storageLocation, '.build/vscode-test-failures.json');
		mkdirSync(dirname(this.logFile), { recursive: true });

		const oldLogFile = join(rootDir, '.build/vscode-test-failures.json');
		if (existsSync(oldLogFile)) {
			try {
				renameSync(oldLogFile, this.logFile);
			} catch {
				// ignore
			}
		}

		this.disposables.push(
			vscode.commands.registerCommand('selfhost-test-provider.openFailureLog', async () => {
				const doc = await vscode.workspace.openTextDocument(this.logFile);
				await vscode.window.showTextDocument(doc);
			})
		);

		this.disposables.push(
			vscode.tests.onDidChangeTestResults(() => {
				const last = vscode.tests.testResults[0];
				if (!last) {
					return;
				}

				let gitState: Promise<IGitState> | undefined;
				const getGitState = () => gitState ?? (gitState = this.captureGitState());

				const queue = [last.results];
				for (let i = 0; i < queue.length; i++) {
					for (const snapshot of queue[i]) {
						// only interested in states of leaf tests
						if (snapshot.children.length) {
							queue.push(snapshot.children);
							continue;
						}

						const key = `${snapshot.uri}/${snapshot.id}`;
						const prev = this.lastFailed.get(key);
						if (snapshot.taskStates.some(s => s.state === vscode.TestResultState.Failed)) {
							// unset the parent to avoid a circular JSON structure:
							getGitState().then(s =>
								this.lastFailed.set(key, {
									snapshot: { ...snapshot, parent: undefined },
									failing: s,
								})
							);
						} else if (prev) {
							this.lastFailed.delete(key);
							getGitState().then(s => this.append({ ...prev, passing: s }));
						}
					}
				}
			})
		);
	}

	private async append(log: ITrackedRemediation) {
		if (!this.logs) {
			try {
				this.logs = JSON.parse(await readFile(this.logFile, 'utf-8'));
			} catch {
				this.logs = [];
			}
		}

		const logs = this.logs!;
		logs.push(log);
		if (logs.length > MAX_FAILURES) {
			logs.splice(0, logs.length - MAX_FAILURES);
		}

		await writeFile(this.logFile, JSON.stringify(logs, undefined, 2));
	}

	private async captureGitState() {
		const [commitId, tracked, untracked] = await Promise.all([
			this.exec('git', ['rev-parse', 'HEAD']),
			this.exec('git', ['diff', 'HEAD']),
			this.exec('git', ['ls-files', '--others', '--exclude-standard']).then(async output => {
				const mapping: Record<string, string> = {};
				await Promise.all(
					output
						.trim()
						.split('\n')
						.map(async f => {
							mapping[f] = await readFile(join(this.rootDir, f), 'utf-8');
						})
				);
				return mapping;
			}),
		]);
		return { commitId, tracked, untracked };
	}

	public dispose() {
		this.disposables.forEach(d => d.dispose());
	}

	private exec(command: string, args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			const child = spawn(command, args, { stdio: 'pipe', cwd: this.rootDir });
			let output = '';
			child.stdout.setEncoding('utf-8').on('data', b => (output += b));
			child.stderr.setEncoding('utf-8').on('data', b => (output += b));
			child.on('error', reject);
			child.on('exit', code =>
				code === 0
					? resolve(output)
					: reject(new Error(`Failed with error code ${code}\n${output}`))
			);
		});
	}
}
