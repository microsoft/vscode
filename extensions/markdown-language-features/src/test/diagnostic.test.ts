/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { DiagnosticCollectionReporter, DiagnosticComputer, DiagnosticConfiguration, DiagnosticLevel, DiagnosticManager, DiagnosticOptions, DiagnosticReporter } from '../languageFeatures/diagnostics';
import { MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { MdReferencesProvider } from '../languageFeatures/references';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { noopToken } from '../util/cancellation';
import { disposeAll } from '../util/dispose';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { ResourceMap } from '../util/resourceMap';
import { MdWorkspaceContents } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';
import { assertRangeEqual, joinLines, workspacePath } from './util';

const defaultDiagnosticsOptions = Object.freeze<DiagnosticOptions>({
	enabled: true,
	validateFileLinks: DiagnosticLevel.warning,
	validateMarkdownFileLinkFragments: undefined,
	validateFragmentLinks: DiagnosticLevel.warning,
	validateReferences: DiagnosticLevel.warning,
	ignoreLinks: [],
});

async function getComputedDiagnostics(doc: InMemoryDocument, workspace: MdWorkspaceContents, options: Partial<DiagnosticOptions> = {}): Promise<vscode.Diagnostic[]> {
	const engine = createNewMarkdownEngine();
	const linkProvider = new MdLinkProvider(engine, workspace);
	const tocProvider = new MdTableOfContentsProvider(engine, workspace);
	const computer = new DiagnosticComputer(workspace, linkProvider, tocProvider);
	return (
		await computer.getDiagnostics(doc, { ...defaultDiagnosticsOptions, ...options, }, noopToken)
	).diagnostics;
}

function assertDiagnosticsEqual(actual: readonly vscode.Diagnostic[], expectedRanges: readonly vscode.Range[]) {
	assert.strictEqual(actual.length, expectedRanges.length);

	for (let i = 0; i < actual.length; ++i) {
		assertRangeEqual(actual[i].range, expectedRanges[i], `Range ${i} to be equal`);
	}
}

function orderDiagnosticsByRange(diagnostics: Iterable<vscode.Diagnostic>): readonly vscode.Diagnostic[] {
	return Array.from(diagnostics).sort((a, b) => a.range.start.compareTo(b.range.start));
}

class MemoryDiagnosticConfiguration implements DiagnosticConfiguration {

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	public readonly onDidChange = this._onDidChange.event;

	private _options: Partial<DiagnosticOptions>;

	constructor(options: Partial<DiagnosticOptions>) {
		this._options = options;
	}

	public getOptions(_resource: vscode.Uri): DiagnosticOptions {
		return {
			...defaultDiagnosticsOptions,
			...this._options,
		};
	}

	public update(newOptions: Partial<DiagnosticOptions>) {
		this._options = newOptions;
		this._onDidChange.fire();
	}
}

class MemoryDiagnosticReporter extends DiagnosticReporter {
	private readonly diagnostics = new ResourceMap<readonly vscode.Diagnostic[]>();

	override dispose(): void {
		super.clear();
		this.clear();
	}

	override clear(): void {
		super.clear();
		this.diagnostics.clear();
	}

	set(uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[]): void {
		this.diagnostics.set(uri, diagnostics);
	}

	delete(uri: vscode.Uri): void {
		this.diagnostics.delete(uri);
	}

	get(uri: vscode.Uri): readonly vscode.Diagnostic[] {
		return orderDiagnosticsByRange(this.diagnostics.get(uri) ?? []);
	}
}

suite('markdown: Diagnostic Computer', () => {

	test('Should not return any diagnostics for empty document', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`text`,
		));

		const diagnostics = await getComputedDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.deepStrictEqual(diagnostics, []);
	});

	test('Should generate diagnostic for link to file that does not exist', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[bad](/no/such/file.md)`,
			`[good](/doc.md)`,
			`[good-ref]: /doc.md`,
			`[bad-ref]: /no/such/file.md`,
		));

		const diagnostics = await getComputedDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(0, 6, 0, 22),
			new vscode.Range(3, 11, 3, 27),
		]);
	});

	test('Should generate diagnostics for links to header that does not exist in current file', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[good](#good-header)`,
			`# Good Header`,
			`[bad](#no-such-header)`,
			`[good](#good-header)`,
			`[good-ref]: #good-header`,
			`[bad-ref]: #no-such-header`,
		));

		const diagnostics = await getComputedDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(2, 6, 2, 21),
			new vscode.Range(5, 11, 5, 26),
		]);
	});

	test('Should generate diagnostics for links to non-existent headers in other files', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`# My header`,
			`[good](#my-header)`,
			`[good](/doc1.md#my-header)`,
			`[good](doc1.md#my-header)`,
			`[good](/doc2.md#other-header)`,
			`[bad](/doc2.md#no-such-other-header)`,
		));

		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(
			`# Other header`,
		));

		const diagnostics = await getComputedDiagnostics(doc1, new InMemoryWorkspaceMarkdownDocuments([doc1, doc2]));
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(5, 14, 5, 35),
		]);
	});

	test('Should support links both with and without .md file extension', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`# My header`,
			`[good](#my-header)`,
			`[good](/doc.md#my-header)`,
			`[good](doc.md#my-header)`,
			`[good](/doc#my-header)`,
			`[good](doc#my-header)`,
		));

		const diagnostics = await getComputedDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Should generate diagnostics for non-existent link reference', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[good link][good]`,
			`[bad link][no-such]`,
			``,
			`[good]: http://example.com`,
		));

		const diagnostics = await getComputedDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(1, 11, 1, 18),
		]);
	});

	test('Should not generate diagnostics when validate is disabled', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](#no-such-header)`,
			`[text][no-such-ref]`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);
		const diagnostics = await getComputedDiagnostics(doc1, workspace, new MemoryDiagnosticConfiguration({ enabled: false }).getOptions(doc1.uri));
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Should not generate diagnostics for email autolink', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`a <user@example.com> c`,
		));

		const diagnostics = await getComputedDiagnostics(doc1, new InMemoryWorkspaceMarkdownDocuments([doc1]));
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Should not generate diagnostics for html tag that looks like an autolink', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`a <tag>b</tag> c`,
			`a <scope:tag>b</scope:tag> c`,
		));

		const diagnostics = await getComputedDiagnostics(doc1, new InMemoryWorkspaceMarkdownDocuments([doc1]));
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Should allow ignoring invalid file link using glob', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](/no-such-file)`,
			`![img](/no-such-file)`,
			`[text]: /no-such-file`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);
		const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/no-such-file'] });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Should be able to disable fragment validation for external files', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1, doc2]);

		const diagnostics = await getComputedDiagnostics(doc1, workspace, { validateMarkdownFileLinkFragments: DiagnosticLevel.ignore });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Disabling own fragment validation should also disable path fragment validation by default', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[b](#no-head)`,
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1, doc2]);

		{
			const diagnostics = await getComputedDiagnostics(doc1, workspace, { validateFragmentLinks: DiagnosticLevel.ignore });
			assertDiagnosticsEqual(diagnostics, []);
		}
		{
			// But we should be able to override the default
			const diagnostics = await getComputedDiagnostics(doc1, workspace, { validateFragmentLinks: DiagnosticLevel.ignore, validateMarkdownFileLinkFragments: DiagnosticLevel.warning });
			assertDiagnosticsEqual(diagnostics, [
				new vscode.Range(1, 13, 1, 21),
			]);
		}
	});

	test('ignoreLinks should allow skipping link to non-existent file', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](/no-such-file#header)`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);

		const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/no-such-file'] });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('ignoreLinks should not consider link fragment', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](/no-such-file#header)`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);

		const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/no-such-file'] });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('ignoreLinks should support globs', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/images/aaa.png)`,
			`![i](/images/sub/bbb.png)`,
			`![i](/images/sub/sub2/ccc.png)`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);
		const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/images/**/*.png'] });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('ignoreLinks should support ignoring header', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](#no-such)`,
		));
		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);

		const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['#no-such'] });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('ignoreLinks should support ignoring header in file', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1, doc2]);
		{
			const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/doc2.md#no-such'] });
			assertDiagnosticsEqual(diagnostics, []);
		}
		{
			const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/doc2.md#*'] });
			assertDiagnosticsEqual(diagnostics, []);
		}
	});

	test('ignoreLinks should support ignore header links if file is ignored', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1, doc2]);

		const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/doc2.md'] });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Should not detect checkboxes as invalid links', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`- [x]`,
			`- [X]`,
			`- [ ]`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);

		const diagnostics = await getComputedDiagnostics(doc1, workspace, { ignoreLinks: ['/doc2.md'] });
		assertDiagnosticsEqual(diagnostics, []);
	});

	test('Should detect invalid links with titles', async () => {
		const doc = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[link](<no such.md> "text")`,
			`[link](<no such.md> 'text')`,
			`[link](<no such.md> (text))`,
			`[link](no-such.md "text")`,
			`[link](no-such.md 'text')`,
			`[link](no-such.md (text))`,
		));
		const diagnostics = await getComputedDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(0, 8, 0, 18),
			new vscode.Range(1, 8, 1, 18),
			new vscode.Range(2, 8, 2, 18),
			new vscode.Range(3, 7, 3, 17),
			new vscode.Range(4, 7, 4, 17),
			new vscode.Range(5, 7, 5, 17),
		]);
	});

	test('Should generate diagnostics for non-existent header using file link to own file', async () => {
		const doc = new InMemoryDocument(workspacePath('sub', 'doc.md'), joinLines(
			`[bad](doc.md#no-such)`,
			`[bad](doc#no-such)`,
			`[bad](/sub/doc.md#no-such)`,
			`[bad](/sub/doc#no-such)`,
		));

		const diagnostics = await getComputedDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertDiagnosticsEqual(orderDiagnosticsByRange(diagnostics), [
			new vscode.Range(0, 12, 0, 20),
			new vscode.Range(1, 9, 1, 17),
			new vscode.Range(2, 17, 2, 25),
			new vscode.Range(3, 14, 3, 22),
		]);
	});

	test('Own header link using file path link should be controlled by "validateMarkdownFileLinkFragments" instead of "validateFragmentLinks"', async () => {
		const doc1 = new InMemoryDocument(workspacePath('sub', 'doc.md'), joinLines(
			`[bad](doc.md#no-such)`,
			`[bad](doc#no-such)`,
			`[bad](/sub/doc.md#no-such)`,
			`[bad](/sub/doc#no-such)`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1]);

		const diagnostics = await getComputedDiagnostics(doc1, workspace, {
			validateFragmentLinks: DiagnosticLevel.ignore,
			validateMarkdownFileLinkFragments: DiagnosticLevel.warning,
		});
		assertDiagnosticsEqual(orderDiagnosticsByRange(diagnostics), [
			new vscode.Range(0, 12, 0, 20),
			new vscode.Range(1, 9, 1, 17),
			new vscode.Range(2, 17, 2, 25),
			new vscode.Range(3, 14, 3, 22),
		]);
	});
});

suite('Markdown: Diagnostics manager', () => {

	const _disposables: vscode.Disposable[] = [];

	setup(() => {
		disposeAll(_disposables);
	});

	teardown(() => {
		disposeAll(_disposables);
	});

	function createDiagnosticsManager(
		workspace: MdWorkspaceContents,
		configuration = new MemoryDiagnosticConfiguration({}),
		reporter: DiagnosticReporter = new DiagnosticCollectionReporter(),
	) {
		const engine = createNewMarkdownEngine();
		const linkProvider = new MdLinkProvider(engine, workspace);
		const tocProvider = new MdTableOfContentsProvider(engine, workspace);
		const referencesProvider = new MdReferencesProvider(engine, workspace, tocProvider);
		const manager = new DiagnosticManager(
			engine,
			workspace,
			new DiagnosticComputer(workspace, linkProvider, tocProvider),
			configuration,
			reporter,
			referencesProvider,
			0);
		_disposables.push(manager, referencesProvider);
		return manager;
	}

	test('Changing enable/disable should recompute diagnostics', async () => {
		const doc1Uri = workspacePath('doc1.md');
		const doc2Uri = workspacePath('doc2.md');
		const workspace = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(doc1Uri, joinLines(
				`[text](#no-such-1)`,
			)),
			new InMemoryDocument(doc2Uri, joinLines(
				`[text](#no-such-2)`,
			))
		]);

		const reporter = new MemoryDiagnosticReporter();
		const config = new MemoryDiagnosticConfiguration({ enabled: true });

		const manager = createDiagnosticsManager(workspace, config, reporter);
		await manager.ready;

		// Check initial state (Enabled)
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), [
			new vscode.Range(0, 7, 0, 17),
		]);
		assertDiagnosticsEqual(reporter.get(doc2Uri), [
			new vscode.Range(0, 7, 0, 17),
		]);

		// Disable
		config.update({ enabled: false });
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), []);
		assertDiagnosticsEqual(reporter.get(doc2Uri), []);

		// Enable
		config.update({ enabled: true });
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), [
			new vscode.Range(0, 7, 0, 17),
		]);
		assertDiagnosticsEqual(reporter.get(doc2Uri), [
			new vscode.Range(0, 7, 0, 17),
		]);
	});

	test('Should revalidate linked files when header changes', async () => {
		const doc1Uri = workspacePath('doc1.md');
		const doc1 = new InMemoryDocument(doc1Uri, joinLines(
			`[text](#no-such)`,
			`[text](/doc2.md#header)`,
		));
		const doc2Uri = workspacePath('doc2.md');
		const doc2 = new InMemoryDocument(doc2Uri, joinLines(
			`# Header`,
			`[text](#header)`,
			`[text](#no-such-2)`,
		));

		const workspace = new InMemoryWorkspaceMarkdownDocuments([doc1, doc2]);
		const reporter = new MemoryDiagnosticReporter();

		const manager = createDiagnosticsManager(workspace, new MemoryDiagnosticConfiguration({}), reporter);
		await manager.ready;

		// Check initial state
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), [
			new vscode.Range(0, 7, 0, 15),
		]);
		assertDiagnosticsEqual(reporter.get(doc2Uri), [
			new vscode.Range(2, 7, 2, 17),
		]);

		// Edit header
		workspace.updateDocument(new InMemoryDocument(doc2Uri, joinLines(
			`# new header`,
			`[text](#new-header)`,
			`[text](#no-such-2)`,
		)));
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), [
			new vscode.Range(0, 7, 0, 15),
			new vscode.Range(1, 15, 1, 22),
		]);
		assertDiagnosticsEqual(reporter.get(doc2Uri), [
			new vscode.Range(2, 7, 2, 17),
		]);

		// Revert to original file
		workspace.updateDocument(new InMemoryDocument(doc2Uri, joinLines(
			`# header`,
			`[text](#header)`,
			`[text](#no-such-2)`,
		)));
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), [
			new vscode.Range(0, 7, 0, 15)
		]);
		assertDiagnosticsEqual(reporter.get(doc2Uri), [
			new vscode.Range(2, 7, 2, 17),
		]);
	});
});
