/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

interface IDisposable {
	dispose(): void;
}

const enum Constants {
	ConfigSection = 'testing',
	EnableCodeLensConfig = 'enableCodeLens',
	EnableDiagnosticsConfig = 'enableProblemDiagnostics',
}

export function activate(context: vscode.ExtensionContext) {
	const diagnostics = vscode.languages.createDiagnosticCollection();
	const services = new TestingEditorServices(diagnostics);
	context.subscriptions.push(
		services,
		diagnostics,
		vscode.languages.registerCodeLensProvider({ scheme: 'file' }, services),
	);
}

class TestingConfig implements IDisposable {
	private section = vscode.workspace.getConfiguration(Constants.ConfigSection);
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	private readonly listener = vscode.workspace.onDidChangeConfiguration(evt => {
		if (evt.affectsConfiguration(Constants.ConfigSection)) {
			this.section = vscode.workspace.getConfiguration(Constants.ConfigSection);
			this.changeEmitter.fire();
		}
	});

	public readonly onChange = this.changeEmitter.event;

	public get codeLens() {
		return this.section.get(Constants.EnableCodeLensConfig, true);
	}

	public get diagnostics() {
		return this.section.get(Constants.EnableDiagnosticsConfig, true);
	}

	public get isEnabled() {
		return this.codeLens || this.diagnostics;
	}

	public dispose() {
		this.listener.dispose();
	}
}

export class TestingEditorServices implements IDisposable, vscode.CodeLensProvider {
	private readonly codeLensChangeEmitter = new vscode.EventEmitter<void>();
	private readonly documents = new Map<string, DocumentTestObserver>();
	private readonly config = new TestingConfig();
	private disposables: IDisposable[];
	private wasEnabled = this.config.isEnabled;

	/**
	 * @inheritdoc
	 */
	public readonly onDidChangeCodeLenses = this.codeLensChangeEmitter.event;

	constructor(private readonly diagnostics: vscode.DiagnosticCollection) {
		this.disposables = [
			new vscode.Disposable(() => this.expireAll()),

			this.config,

			vscode.window.onDidChangeVisibleTextEditors((editors) => {
				if (!this.config.isEnabled) {
					return;
				}

				const expiredEditors = new Set(this.documents.keys());
				for (const editor of editors) {
					const key = editor.document.uri.toString();
					this.ensure(key, editor.document);
					expiredEditors.delete(key);
				}

				for (const expired of expiredEditors) {
					this.expire(expired);
				}
			}),

			vscode.workspace.onDidCloseTextDocument((document) => {
				this.expire(document.uri.toString());
			}),

			this.config.onChange(() => {
				if (!this.wasEnabled || this.config.isEnabled) {
					this.attachToAllVisible();
				} else if (this.wasEnabled || !this.config.isEnabled) {
					this.expireAll();
				}

				this.wasEnabled = this.config.isEnabled;
				this.codeLensChangeEmitter.fire();
			}),
		];

		if (this.config.isEnabled) {
			this.attachToAllVisible();
		}
	}

	/**
	 * @inheritdoc
	 */
	public provideCodeLenses(document: vscode.TextDocument) {
		if (!this.config.codeLens) {
			return [];
		}

		return this.documents.get(document.uri.toString())?.provideCodeLenses() ?? [];
	}

	/**
	 * Attach to all currently visible editors.
	 */
	private attachToAllVisible() {
		for (const editor of vscode.window.visibleTextEditors) {
			this.ensure(editor.document.uri.toString(), editor.document);
		}
	}

	/**
	 * Unattaches to all tests.
	 */
	private expireAll() {
		for (const observer of this.documents.values()) {
			observer.dispose();
		}

		this.documents.clear();
	}

	/**
	 * Subscribes to tests for the document URI.
	 */
	private ensure(key: string, document: vscode.TextDocument) {
		const state = this.documents.get(key);
		if (!state) {
			const observer = new DocumentTestObserver(document, this.diagnostics, this.config);
			this.documents.set(key, observer);
			observer.onDidChangeCodeLenses(() => this.config.codeLens && this.codeLensChangeEmitter.fire());
		}
	}

	/**
	 * Expires and removes the watcher for the document.
	 */
	private expire(key: string) {
		const observer = this.documents.get(key);
		if (!observer) {
			return;
		}

		observer.dispose();
		this.documents.delete(key);
	}

	/**
	 * @override
	 */
	public dispose() {
		this.disposables.forEach((d) => d.dispose());
	}
}

class DocumentTestObserver implements IDisposable {
	private readonly codeLensChangeEmitter = new vscode.EventEmitter<void>();
	private readonly observer = vscode.test.createDocumentTestObserver(this.document);
	private readonly disposables: IDisposable[];
	public readonly onDidChangeCodeLenses = this.codeLensChangeEmitter.event;
	private didHaveDiagnostics = this.config.diagnostics;

	constructor(
		private readonly document: vscode.TextDocument,
		private readonly diagnostics: vscode.DiagnosticCollection,
		private readonly config: TestingConfig,
	) {
		this.disposables = [
			this.observer,
			this.codeLensChangeEmitter,

			config.onChange(() => {
				if (this.didHaveDiagnostics && !config.diagnostics) {
					this.diagnostics.set(document.uri, []);
				} else if (!this.didHaveDiagnostics && config.diagnostics) {
					this.updateDiagnostics();
				}

				this.didHaveDiagnostics = config.diagnostics;
			}),

			this.observer.onDidChangeTest(() => {
				this.updateDiagnostics();
				this.codeLensChangeEmitter.fire();
			}),
		];

	}

	private updateDiagnostics() {
		if (!this.config.diagnostics) {
			return;
		}

		const uriString = this.document.uri.toString();
		const diagnostics: vscode.Diagnostic[] = [];
		for (const test of iterateOverTests(this.observer.tests)) {
			for (const message of test.state.messages) {
				if (message.location?.uri.toString() === uriString) {
					diagnostics.push({
						range: message.location.range,
						message: message.message.toString(),
						severity: testToDiagnosticSeverity(message.severity),
					});
				}
			}
		}

		this.diagnostics.set(this.document.uri, diagnostics);
	}

	public provideCodeLenses(): vscode.CodeLens[] {
		const lenses: vscode.CodeLens[] = [];

		for (const test of iterateOverTests(this.observer.tests)) {
			const { debuggable = false, runnable = true } = test;
			if (!test.location || !(debuggable || runnable)) {
				continue;
			}

			const summary = summarize(test);

			lenses.push({
				isResolved: true,
				range: test.location.range,
				command: {
					title: `$(${testStateToIcon[summary.computedState]}) ${getLabelFor(test, summary)}`,
					command: 'vscode.runTests',
					arguments: [[test]],
					tooltip: localize('tooltip.debug', 'Debug {0}', test.label),
				},
			});

			if (debuggable) {
				lenses.push({
					isResolved: true,
					range: test.location.range,
					command: {
						title: localize('action.debug', 'Debug'),
						command: 'vscode.debugTests',
						arguments: [[test]],
						tooltip: localize('tooltip.debug', 'Debug {0}', test.label),
					},
				});
			}
		}

		return lenses;
	}

	/**
	 * @override
	 */
	public dispose() {
		this.diagnostics.set(this.document.uri, []);
		this.disposables.forEach(d => d.dispose());
	}
}

function getLabelFor(test: vscode.TestItem, summary: ITestSummary) {
	if (summary.duration !== undefined) {
		return localize(
			'tooltip.runStateWithDuration',
			'{0}/{1} Tests Passed in {2}',
			summary.passed,
			summary.passed + summary.failed,
			formatDuration(summary.duration),
		);
	}

	if (summary.passed > 0 || summary.failed > 0) {
		return localize('tooltip.runState', '{0}/{1} Tests Passed', summary.passed, summary.failed);
	}

	if (test.state.runState === vscode.TestRunState.Passed) {
		return test.state.duration !== undefined
			? localize('state.passedWithDuration', 'Passed in {0}', formatDuration(test.state.duration))
			: localize('state.passed', 'Passed');
	}

	if (isFailedState(test.state.runState)) {
		return localize('state.failed', 'Failed');
	}

	return localize('action.run', 'Run Tests');
}

function formatDuration(duration: number) {
	if (duration < 1_000) {
		return `${Math.round(duration)}ms`;
	}

	if (duration < 100_000) {
		return `${(duration / 1000).toPrecision(3)}s`;
	}

	return `${(duration / 1000 / 60).toPrecision(3)}m`;
}

const statePriority: { [K in vscode.TestRunState]: number } = {
	[vscode.TestRunState.Running]: 6,
	[vscode.TestRunState.Queued]: 5,
	[vscode.TestRunState.Errored]: 4,
	[vscode.TestRunState.Failed]: 3,
	[vscode.TestRunState.Passed]: 2,
	[vscode.TestRunState.Skipped]: 1,
	[vscode.TestRunState.Unset]: 0,
};

const maxPriority = (a: vscode.TestRunState, b: vscode.TestRunState) =>
	statePriority[a] > statePriority[b] ? a : b;

const isFailedState = (s: vscode.TestRunState) =>
	s === vscode.TestRunState.Failed || s === vscode.TestRunState.Errored;

interface ITestSummary {
	passed: number;
	failed: number;
	duration: number | undefined;
	computedState: vscode.TestRunState;
}

function summarize(test: vscode.TestItem) {
	let passed = 0;
	let failed = 0;
	let duration: number | undefined;
	let computedState = test.state.runState;

	const queue = test.children ? [test.children] : [];
	while (queue.length) {
		for (const test of queue.pop()!) {
			computedState = maxPriority(computedState, test.state.runState);
			if (test.state.runState === vscode.TestRunState.Passed) {
				passed++;
				if (test.state.duration !== undefined) {
					duration = test.state.duration + (duration ?? 0);
				}
			} else if (isFailedState(test.state.runState)) {
				failed++;
				if (test.state.duration !== undefined) {
					duration = test.state.duration + (duration ?? 0);
				}
			}

			if (test.children) {
				queue.push(test.children);
			}
		}
	}

	return { passed, failed, duration, computedState };
}

function* iterateOverTests(tests: ReadonlyArray<vscode.TestItem>) {
	const queue = [tests];
	while (queue.length) {
		for (const test of queue.pop()!) {
			yield test;
			if (test.children) {
				queue.push(test.children);
			}
		}
	}
}

const testStateToIcon: { [K in vscode.TestRunState]: string } = {
	[vscode.TestRunState.Errored]: 'testing-error-icon',
	[vscode.TestRunState.Failed]: 'testing-failed-icon',
	[vscode.TestRunState.Passed]: 'testing-passed-icon',
	[vscode.TestRunState.Queued]: 'testing-queued-icon',
	[vscode.TestRunState.Skipped]: 'testing-skipped-icon',
	[vscode.TestRunState.Unset]: 'beaker',
	[vscode.TestRunState.Running]: 'loading~spin',
};

const testToDiagnosticSeverity = (severity: vscode.TestMessageSeverity | undefined) => {
	switch (severity) {
		case vscode.TestMessageSeverity.Hint:
			return vscode.DiagnosticSeverity.Hint;
		case vscode.TestMessageSeverity.Information:
			return vscode.DiagnosticSeverity.Information;
		case vscode.TestMessageSeverity.Warning:
			return vscode.DiagnosticSeverity.Warning;
		case vscode.TestMessageSeverity.Error:
		default:
			return vscode.DiagnosticSeverity.Error;
	}
};
