/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { DiagnosticCollectionReporter, DiagnosticComputer, DiagnosticConfiguration, DiagnosticLevel, DiagnosticManager, DiagnosticOptions, DiagnosticReporter } from '../languageFeatures/diagnostics';
import { MdLinkProvider } from '../languageFeatures/documentLinks';
import { MdReferencesProvider } from '../languageFeatures/references';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { ITextDocument } from '../types/textDocument';
import { noopToken } from '../util/cancellation';
import { DisposableStore } from '../util/dispose';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { ResourceMap } from '../util/resourceMap';
import { IMdWorkspace } from '../workspace';
import { createNewMarkdownEngine } from './engine';
import { InMemoryMdWorkspace } from './inMemoryWorkspace';
import { nulLogger } from './nulLogging';
import { assertRangeEqual, joinLines, withStore, workspacePath } from './util';

const defaultDiagnosticsOptions = Object.freeze<DiagnosticOptions>({
	enabled: true,
	validateFileLinks: DiagnosticLevel.warning,
	validateMarkdownFileLinkFragments: undefined,
	validateFragmentLinks: DiagnosticLevel.warning,
	validateReferences: DiagnosticLevel.warning,
	ignoreLinks: [],
});

async function getComputedDiagnostics(store: DisposableStore, doc: InMemoryDocument, workspace: IMdWorkspace, options: Partial<DiagnosticOptions> = {}): Promise<vscode.Diagnostic[]> {
	const engine = createNewMarkdownEngine();
	const linkProvider = store.add(new MdLinkProvider(engine, workspace, nulLogger));
	const tocProvider = store.add(new MdTableOfContentsProvider(engine, workspace, nulLogger));
	const computer = new DiagnosticComputer(workspace, linkProvider, tocProvider);
	return (
		await computer.getDiagnostics(doc, { ...defaultDiagnosticsOptions, ...options, }, noopToken)
	).diagnostics;
}

function assertDiagnosticsEqual(actual: readonly vscode.Diagnostic[], expectedRanges: readonly vscode.Range[]) {
	assert.strictEqual(actual.length, expectedRanges.length, "Diagnostic count equal");

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

	constructor(
		private readonly workspace: InMemoryMdWorkspace,
	) {
		super();
	}

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

	isOpen(_uri: vscode.Uri): boolean {
		return true;
	}

	delete(uri: vscode.Uri): void {
		this.diagnostics.delete(uri);
	}

	get(uri: vscode.Uri): readonly vscode.Diagnostic[] {
		return orderDiagnosticsByRange(this.diagnostics.get(uri) ?? []);
	}

	getOpenDocuments(): ITextDocument[] {
		return this.workspace.values();
	}
}

suite('markdown: Diagnostic Computer', () => {

	test('Should not return any diagnostics for empty document', withStore(async (store) => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`text`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc]));

		const diagnostics = await getComputedDiagnostics(store, doc, workspace);
		assert.deepStrictEqual(diagnostics, []);
	}));

	test('Should generate diagnostic for link to file that does not exist', withStore(async (store) => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[bad](/no/such/file.md)`,
			`[good](/doc.md)`,
			`[good-ref]: /doc.md`,
			`[bad-ref]: /no/such/file.md`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc]));

		const diagnostics = await getComputedDiagnostics(store, doc, workspace);
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(0, 6, 0, 22),
			new vscode.Range(3, 11, 3, 27),
		]);
	}));

	test('Should generate diagnostics for links to header that does not exist in current file', withStore(async (store) => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[good](#good-header)`,
			`# Good Header`,
			`[bad](#no-such-header)`,
			`[good](#good-header)`,
			`[good-ref]: #good-header`,
			`[bad-ref]: #no-such-header`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc]));

		const diagnostics = await getComputedDiagnostics(store, doc, workspace);
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(2, 6, 2, 21),
			new vscode.Range(5, 11, 5, 26),
		]);
	}));

	test('Should generate diagnostics for links to non-existent headers in other files', withStore(async (store) => {
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

		const diagnostics = await getComputedDiagnostics(store, doc1, new InMemoryMdWorkspace([doc1, doc2]));
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(5, 14, 5, 35),
		]);
	}));

	test('Should support links both with and without .md file extension', withStore(async (store) => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`# My header`,
			`[good](#my-header)`,
			`[good](/doc.md#my-header)`,
			`[good](doc.md#my-header)`,
			`[good](/doc#my-header)`,
			`[good](doc#my-header)`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc]));

		const diagnostics = await getComputedDiagnostics(store, doc, workspace);
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Should generate diagnostics for non-existent link reference', withStore(async (store) => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[good link][good]`,
			`[bad link][no-such]`,
			``,
			`[good]: http://example.com`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc]));

		const diagnostics = await getComputedDiagnostics(store, doc, workspace);
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(1, 11, 1, 18),
		]);
	}));

	test('Should not generate diagnostics when validate is disabled', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](#no-such-header)`,
			`[text][no-such-ref]`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));
		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, new MemoryDiagnosticConfiguration({ enabled: false }).getOptions(doc1.uri));
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Should not generate diagnostics for email autolink', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`a <user@example.com> c`,
		));

		const diagnostics = await getComputedDiagnostics(store, doc1, new InMemoryMdWorkspace([doc1]));
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Should not generate diagnostics for html tag that looks like an autolink', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`a <tag>b</tag> c`,
			`a <scope:tag>b</scope:tag> c`,
		));

		const diagnostics = await getComputedDiagnostics(store, doc1, new InMemoryMdWorkspace([doc1]));
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Should allow ignoring invalid file link using glob', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](/no-such-file)`,
			`![img](/no-such-file)`,
			`[text]: /no-such-file`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));
		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/no-such-file'] });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Should be able to disable fragment validation for external files', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));
		const workspace = new InMemoryMdWorkspace([doc1, doc2]);

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { validateMarkdownFileLinkFragments: DiagnosticLevel.ignore });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Disabling own fragment validation should also disable path fragment validation by default', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[b](#no-head)`,
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));
		const workspace = new InMemoryMdWorkspace([doc1, doc2]);

		{
			const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { validateFragmentLinks: DiagnosticLevel.ignore });
			assertDiagnosticsEqual(diagnostics, []);
		}
		{
			// But we should be able to override the default
			const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { validateFragmentLinks: DiagnosticLevel.ignore, validateMarkdownFileLinkFragments: DiagnosticLevel.warning });
			assertDiagnosticsEqual(diagnostics, [
				new vscode.Range(1, 13, 1, 21),
			]);
		}
	}));

	test('ignoreLinks should allow skipping link to non-existent file', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](/no-such-file#header)`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/no-such-file'] });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('ignoreLinks should not consider link fragment', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[text](/no-such-file#header)`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/no-such-file'] });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('ignoreLinks should support globs', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/images/aaa.png)`,
			`![i](/images/sub/bbb.png)`,
			`![i](/images/sub/sub2/ccc.png)`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/images/**/*.png'] });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('ignoreLinks should support ignoring header', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](#no-such)`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['#no-such'] });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('ignoreLinks should support ignoring header in file', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));
		const workspace = store.add(new InMemoryMdWorkspace([doc1, doc2]));

		{
			const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/doc2.md#no-such'] });
			assertDiagnosticsEqual(diagnostics, []);
		}
		{
			const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/doc2.md#*'] });
			assertDiagnosticsEqual(diagnostics, []);
		}
	}));

	test('ignoreLinks should support ignore header links if file is ignored', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`![i](/doc2.md#no-such)`,
		));
		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(''));
		const workspace = new InMemoryMdWorkspace([doc1, doc2]);

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/doc2.md'] });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Should not detect checkboxes as invalid links', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`- [x]`,
			`- [X]`,
			`- [ ]`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, { ignoreLinks: ['/doc2.md'] });
		assertDiagnosticsEqual(diagnostics, []);
	}));

	test('Should detect invalid links with titles', withStore(async (store) => {
		const doc = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`[link](<no such.md> "text")`,
			`[link](<no such.md> 'text')`,
			`[link](<no such.md> (text))`,
			`[link](no-such.md "text")`,
			`[link](no-such.md 'text')`,
			`[link](no-such.md (text))`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc]));

		const diagnostics = await getComputedDiagnostics(store, doc, workspace);
		assertDiagnosticsEqual(diagnostics, [
			new vscode.Range(0, 8, 0, 18),
			new vscode.Range(1, 8, 1, 18),
			new vscode.Range(2, 8, 2, 18),
			new vscode.Range(3, 7, 3, 17),
			new vscode.Range(4, 7, 4, 17),
			new vscode.Range(5, 7, 5, 17),
		]);
	}));

	test('Should generate diagnostics for non-existent header using file link to own file', withStore(async (store) => {
		const doc = new InMemoryDocument(workspacePath('sub', 'doc.md'), joinLines(
			`[bad](doc.md#no-such)`,
			`[bad](doc#no-such)`,
			`[bad](/sub/doc.md#no-such)`,
			`[bad](/sub/doc#no-such)`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc]));

		const diagnostics = await getComputedDiagnostics(store, doc, workspace);
		assertDiagnosticsEqual(orderDiagnosticsByRange(diagnostics), [
			new vscode.Range(0, 12, 0, 20),
			new vscode.Range(1, 9, 1, 17),
			new vscode.Range(2, 17, 2, 25),
			new vscode.Range(3, 14, 3, 22),
		]);
	}));

	test('Own header link using file path link should be controlled by "validateMarkdownFileLinkFragments" instead of "validateFragmentLinks"', withStore(async (store) => {
		const doc1 = new InMemoryDocument(workspacePath('sub', 'doc.md'), joinLines(
			`[bad](doc.md#no-such)`,
			`[bad](doc#no-such)`,
			`[bad](/sub/doc.md#no-such)`,
			`[bad](/sub/doc#no-such)`,
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1]));

		const diagnostics = await getComputedDiagnostics(store, doc1, workspace, {
			validateFragmentLinks: DiagnosticLevel.ignore,
			validateMarkdownFileLinkFragments: DiagnosticLevel.warning,
		});
		assertDiagnosticsEqual(orderDiagnosticsByRange(diagnostics), [
			new vscode.Range(0, 12, 0, 20),
			new vscode.Range(1, 9, 1, 17),
			new vscode.Range(2, 17, 2, 25),
			new vscode.Range(3, 14, 3, 22),
		]);
	}));
});

suite('Markdown: Diagnostics manager', () => {

	function createDiagnosticsManager(
		store: DisposableStore,
		workspace: IMdWorkspace,
		configuration = new MemoryDiagnosticConfiguration({}),
		reporter: DiagnosticReporter = new DiagnosticCollectionReporter(),
	) {
		const engine = createNewMarkdownEngine();
		const linkProvider = store.add(new MdLinkProvider(engine, workspace, nulLogger));
		const tocProvider = store.add(new MdTableOfContentsProvider(engine, workspace, nulLogger));
		const referencesProvider = store.add(new MdReferencesProvider(engine, workspace, tocProvider, nulLogger));
		const manager = store.add(new DiagnosticManager(
			workspace,
			new DiagnosticComputer(workspace, linkProvider, tocProvider),
			configuration,
			reporter,
			referencesProvider,
			tocProvider,
			nulLogger,
			0));
		return manager;
	}

	test('Changing enable/disable should recompute diagnostics', withStore(async (store) => {
		const doc1Uri = workspacePath('doc1.md');
		const doc2Uri = workspacePath('doc2.md');
		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(doc1Uri, joinLines(
				`[text](#no-such-1)`,
			)),
			new InMemoryDocument(doc2Uri, joinLines(
				`[text](#no-such-2)`,
			))
		]));

		const reporter = store.add(new MemoryDiagnosticReporter(workspace));
		const config = new MemoryDiagnosticConfiguration({ enabled: true });

		const manager = createDiagnosticsManager(store, workspace, config, reporter);
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
	}));

	test('Should revalidate linked files when header changes', withStore(async (store) => {
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
		const workspace = store.add(new InMemoryMdWorkspace([doc1, doc2]));
		const reporter = store.add(new MemoryDiagnosticReporter(workspace));

		const manager = createDiagnosticsManager(store, workspace, new MemoryDiagnosticConfiguration({}), reporter);
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
	}));

	test('Should revalidate linked files when file is deleted/created', withStore(async (store) => {
		const doc1Uri = workspacePath('doc1.md');
		const doc1 = new InMemoryDocument(doc1Uri, joinLines(
			`[text](/doc2.md)`,
			`[text](/doc2.md#header)`,
		));
		const doc2Uri = workspacePath('doc2.md');
		const doc2 = new InMemoryDocument(doc2Uri, joinLines(
			`# Header`
		));
		const workspace = store.add(new InMemoryMdWorkspace([doc1, doc2]));
		const reporter = store.add(new MemoryDiagnosticReporter(workspace));

		const manager = createDiagnosticsManager(store, workspace, new MemoryDiagnosticConfiguration({}), reporter);
		await manager.ready;

		// Check initial state
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), []);

		// Edit header
		workspace.deleteDocument(doc2Uri);

		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), [
			new vscode.Range(0, 7, 0, 15),
			new vscode.Range(1, 7, 1, 22),
		]);

		// Revert to original file
		workspace.createDocument(doc2);
		await reporter.waitPendingWork();
		assertDiagnosticsEqual(reporter.get(doc1Uri), []);
	}));
});
