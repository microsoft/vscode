/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownEditorNavigation } from '../preview/markdownEditorNavigation';
import type { MarkdownEditorRenderer, MarkdownNavigationState } from '../preview/markdownEditorProtocol';

suite('Markdown editor outline navigation', () => {
	const disposables: vscode.Disposable[] = [];
	teardown(() => disposables.splice(0).reverse().forEach(item => item.dispose()));

	function token(): vscode.CancellationToken {
		const source = new vscode.CancellationTokenSource();
		disposables.push(source);
		return source.token;
	}

	async function setup(drain: () => Promise<void> = async () => { }) {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '# One\r\n\r\n## Two' });
		const snapshot = { text: '# One\n\n## Two', editEpoch: 2 };
		const state: MarkdownNavigationState = { editEpoch: 2, revision: 4, scrollTop: 120, selection: { anchor: 10, active: 13 } };
		const revealed: Parameters<MarkdownEditorRenderer['revealRange']>[0][] = [];
		const restored: MarkdownNavigationState[] = [];
		const renderer = {
			captureNavigationState: async () => state,
			revealRange: async (request: Parameters<MarkdownEditorRenderer['revealRange']>[0]) => { revealed.push(request); },
			restoreNavigationState: async (request: MarkdownNavigationState) => { restored.push(request); },
		};
		const navigation = new MarkdownEditorNavigation(document, drain, () => snapshot, () => renderer, async () => { });
		disposables.push(navigation);
		return { navigation, document, snapshot, state, revealed, restored, renderer };
	}

	test('maps selection and reveal between LF renderer offsets and CRLF source positions', async () => {
		const test = await setup();
		const selections: (vscode.Selection | undefined)[] = [];
		disposables.push(test.navigation.onDidChangeSelection(selection => selections.push(selection)));
		await test.navigation.acceptSelection({ editEpoch: 2, selection: { anchor: 13, active: 10 } });
		assert.deepStrictEqual(selections, [new vscode.Selection(2, 6, 2, 3)]);
		assert.deepStrictEqual(test.navigation.selection, selections[0]);
		await test.navigation.revealRange(new vscode.Range(2, 0, 2, 6), {
			selection: new vscode.Selection(2, 3, 2, 6), preserveFocus: true,
		}, token());
		assert.deepStrictEqual(test.revealed, [{
			start: 7, endExclusive: 13, editEpoch: 2, revision: 4,
			selection: { anchor: 10, active: 13 }, preserveFocus: true,
		}]);
	});

	test('isolates selection and navigation between editor instances of the same document', async () => {
		const test = await setup();
		const otherRevealed: Parameters<MarkdownEditorRenderer['revealRange']>[0][] = [];
		const other = new MarkdownEditorNavigation(test.document, async () => { }, () => test.snapshot,
			() => ({ ...test.renderer, revealRange: async request => { otherRevealed.push(request); } }), async () => { });
		disposables.push(other);
		await test.navigation.acceptSelection({ editEpoch: 2, selection: { anchor: 0, active: 0 } });
		await other.revealRange(new vscode.Range(2, 0, 2, 6), { preserveFocus: true }, token());
		assert.strictEqual(other.selection, undefined);
		assert.deepStrictEqual(test.revealed, []);
		assert.strictEqual(otherRevealed.length, 1);
		assert.strictEqual(otherRevealed[0].selection, undefined);
	});

	test('ignores stale selection reports and clears selection on reload', async () => {
		const test = await setup();
		await test.navigation.acceptSelection({ editEpoch: 1, selection: { anchor: 1, active: 1 } });
		assert.strictEqual(test.navigation.selection, undefined);
		await test.navigation.acceptSelection({ editEpoch: 2, selection: { anchor: 1, active: 1 } });
		test.navigation.reset();
		assert.strictEqual(test.navigation.selection, undefined);
		await assert.rejects(test.navigation.acceptSelection({ editEpoch: 2, selection: { anchor: 99, active: 99 } }), /Invalid/);
	});

	test('drains accepted edits before navigating and rejects cancellation', async () => {
		const pending = Promise.withResolvers<void>();
		const test = await setup(() => pending.promise);
		const cancelled = new vscode.CancellationTokenSource();
		disposables.push(cancelled);
		const reveal = test.navigation.revealRange(new vscode.Range(0, 0, 0, 1), {}, cancelled.token);
		cancelled.cancel();
		pending.resolve();
		await assert.rejects(reveal);
		assert.deepStrictEqual(test.revealed, []);
	});

	test('rejects a document changed while capturing the renderer state', async () => {
		const test = await setup();
		test.renderer.captureNavigationState = async () => {
			const edit = new vscode.WorkspaceEdit();
			edit.insert(test.document.uri, new vscode.Position(0, 0), 'Changed');
			await vscode.workspace.applyEdit(edit);
			return test.state;
		};
		await assert.rejects(test.navigation.revealRange(new vscode.Range(2, 0, 2, 6), {}, token()), vscode.CancellationError);
		assert.deepStrictEqual(test.revealed, []);
	});

	test('restores captured view state but rejects captures from a previous webview generation', async () => {
		const test = await setup();
		const saved = await test.navigation.captureViewState();
		await test.navigation.restoreViewState(saved, token());
		assert.deepStrictEqual(test.restored, [test.state]);
		test.navigation.reset();
		await assert.rejects(test.navigation.restoreViewState(saved, token()), vscode.CancellationError);
		test.navigation.dispose();
		await assert.rejects(test.navigation.revealRange(new vscode.Range(0, 0, 0, 1), {}, token()), vscode.CancellationError);
	});
});
