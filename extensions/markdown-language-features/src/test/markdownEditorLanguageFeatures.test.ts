/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownEditorLanguageFeatures, mapMarkdownDiagnostics, type MarkdownCompletionApi } from '../preview/markdownEditorLanguageFeatures';

suite('Markdown editor diagnostics and completion', () => {
	const request = { requestId: 1, offset: 11, editEpoch: 0, automatic: false };

	async function setup(overrides: Partial<MarkdownCompletionApi> = {}) {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '# Title\r\n\r\nTa' });
		const state = { text: '# Title\n\nTa', editEpoch: 0, active: true };
		const item = new vscode.CompletionItem('Target', vscode.CompletionItemKind.Reference);
		item.range = new vscode.Range(2, 0, 2, 2);
		const counts: number[] = [];
		const commands: vscode.Command[] = [];
		let applied = 0;
		const api: MarkdownCompletionApi = {
			provide: async (_uri, position, resolveCount) => {
				assert.deepStrictEqual(position, new vscode.Position(2, 2));
				counts.push(resolveCount);
				return new vscode.CompletionList([item]);
			},
			apply: async edit => {
				applied++;
				const result = await vscode.workspace.applyEdit(edit);
				state.text = document.getText();
				state.editEpoch++;
				return result;
			},
			execute: async command => { commands.push(command); },
			...overrides,
		};
		const features = new MarkdownEditorLanguageFeatures(document, async () => { }, () => state, () => state.active, api);
		return { document, state, item, counts, commands, features, get applied() { return applied; } };
	}

	test('maps all diagnostic severities, source and code from CRLF documents to LF renderer offsets', async () => {
		const test = await setup();
		const diagnostics = [0, 1, 2, 3].map(severity => {
			const item = new vscode.Diagnostic(new vscode.Range(2, 0, 2, 2), `Message ${severity}`, severity);
			item.source = 'third-party';
			item.code = { value: 'rule', target: vscode.Uri.parse('https://example.com/rule') };
			return item;
		});
		assert.deepStrictEqual(mapMarkdownDiagnostics(test.document, test.state.text, diagnostics),
			['error', 'warning', 'info', 'hint'].map((severity, index) => ({
				start: 9, endExclusive: 11, message: `Message ${index}`, severity, source: 'third-party', code: 'rule', codeTarget: 'https://example.com/rule',
			})));
	});

	test('reads diagnostics from arbitrary collections and propagates clearing', async () => {
		const test = await setup();
		const collection = vscode.languages.createDiagnosticCollection('rich-editor-test');
		try {
			collection.set(test.document.uri, [new vscode.Diagnostic(new vscode.Range(2, 0, 2, 2), 'Third-party warning', vscode.DiagnosticSeverity.Warning)]);
			const result = await test.features.diagnostics();
			assert.ok(result.items.some(item => item.message === 'Third-party warning' && item.severity === 'warning'));
			collection.clear();
			assert.ok(!(await test.features.diagnostics()).items.some(item => item.message === 'Third-party warning'));
		} finally {
			collection.dispose();
		}
	});

	test('defaults automatic completion to off and honors live rich-editor and language settings without disabling manual completion', async () => {
		const test = await setup();
		const config = vscode.workspace.getConfiguration('editor', test.document);
		const previous = config.inspect('quickSuggestions')?.globalLanguageValue;
		const richConfig = vscode.workspace.getConfiguration('markdown.editor', test.document);
		const previousRich = richConfig.inspect('quickSuggestions')?.globalValue;
		try {
			assert.strictEqual(richConfig.inspect('quickSuggestions')?.defaultValue, false);
			await richConfig.update('quickSuggestions', undefined, vscode.ConfigurationTarget.Global);
			await config.update('quickSuggestions', { other: 'on' }, vscode.ConfigurationTarget.Global, true);
			assert.deepStrictEqual(await test.features.completions({ ...request, automatic: true }), { items: [], incomplete: false });
			assert.deepStrictEqual(test.counts, []);
			assert.strictEqual((await test.features.completions({ ...request, requestId: 2 })).items[0].label, 'Target');
			await richConfig.update('quickSuggestions', true, vscode.ConfigurationTarget.Global);
			const result = await test.features.completions({ ...request, requestId: 3, automatic: true });
			assert.strictEqual(result.items[0].label, 'Target');
			assert.strictEqual(result.items[0].highlightLength, 2);
			await config.update('quickSuggestions', { other: 'off' }, vscode.ConfigurationTarget.Global, true);
			assert.deepStrictEqual(await test.features.completions({ ...request, requestId: 4, automatic: true }), { items: [], incomplete: false });
			assert.strictEqual((await test.features.completions({ ...request, requestId: 5 })).items[0].label, 'Target');
			await config.update('quickSuggestions', { other: 'on' }, vscode.ConfigurationTarget.Global, true);
			await richConfig.update('quickSuggestions', false, vscode.ConfigurationTarget.Global);
			assert.deepStrictEqual(await test.features.completions({ ...request, requestId: 6, automatic: true }), { items: [], incomplete: false });
			assert.deepStrictEqual(test.counts, [0, 0, 0]);
		} finally {
			try {
				await richConfig.update('quickSuggestions', previousRich, vscode.ConfigurationTarget.Global);
			} finally {
				await config.update('quickSuggestions', previous, vscode.ConfigurationTarget.Global, true);
			}
		}
	});

	test('matches and highlights ASCII I independently of locale, including filter text', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'i' });
		const items = ['Image', 'Other', '\u0131tem'].map(label => new vscode.CompletionItem(label));
		items[1].filterText = 'IMAGE';
		for (const item of items) {
			item.range = new vscode.Range(0, 0, 0, 1);
		}
		const features = new MarkdownEditorLanguageFeatures(document, async () => { },
			() => ({ text: 'i', editEpoch: 0 }), () => true, {
				provide: async () => new vscode.CompletionList(items),
				apply: async () => { throw new Error('Unexpected edit'); },
				execute: async () => { throw new Error('Unexpected command'); },
			});
		assert.deepStrictEqual(await features.completions({ ...request, offset: 1 }), {
			items: [
				{ id: '0', label: 'Image', highlightLength: 1, detail: undefined, type: undefined, unsupported: undefined },
				{ id: '1', label: 'Other', highlightLength: 0, detail: undefined, type: undefined, unsupported: undefined },
			],
			incomplete: false,
		});
	});

	test('requests, resolves and applies a provider edit with CRLF-safe caret placement', async () => {
		const test = await setup();
		assert.deepStrictEqual((await test.features.completions(request)).items.map(item => item.label), ['Target']);
		const result = await test.features.accept({ requestId: 1, id: '0' });
		assert.deepStrictEqual(test.counts, [0, 1]);
		assert.strictEqual(test.document.getText(), '# Title\r\n\r\nTarget');
		assert.deepStrictEqual(result, { offset: 17, editEpoch: 1, retrigger: false });
		assert.strictEqual(test.applied, 1);
	});

	test('applies resolved additional edits and executes the provider command', async () => {
		const test = await setup({
			provide: async (_uri, _position, resolveCount) => {
				const item = new vscode.CompletionItem('Target');
				item.range = new vscode.Range(2, 0, 2, 2);
				if (resolveCount) {
					item.additionalTextEdits = [vscode.TextEdit.insert(new vscode.Position(0, 0), 'Top\n')];
					item.command = { command: 'test.followUp', title: '', arguments: [42] };
				}
				return new vscode.CompletionList([item]);
			},
		});
		await test.features.completions(request);
		assert.strictEqual((await test.features.accept({ requestId: 1, id: '0' })).offset, 22);
		assert.strictEqual(test.document.getText(), 'Top\r\n# Title\r\n\r\nTarget');
		assert.deepStrictEqual(test.commands, [{ command: 'test.followUp', title: '', arguments: [42] }]);
	});

	test('clearly marks snippet completions and never inserts snippet syntax literally', async () => {
		const test = await setup();
		test.item.insertText = new vscode.SnippetString('Target${1:value}$0');
		const result = await test.features.completions(request);
		assert.match(result.items[0].unsupported!, /Snippet editing is not supported/);
		await assert.rejects(test.features.accept({ requestId: 1, id: '0' }), /Snippet editing is not supported/);
		assert.strictEqual(test.applied, 0);
	});

	test('rejects stale, cancelled, and unknown sessions', async () => {
		const test = await setup();
		await test.features.completions(request);
		test.state.editEpoch++;
		await assert.rejects(test.features.accept({ requestId: 1, id: '0' }), /document changed/);
		test.state.editEpoch = 0;
		await test.features.completions({ ...request, requestId: 2 });
		test.features.cancel(1);
		await assert.rejects(test.features.accept({ requestId: 2, id: '999' }), /Unknown completion/);
		test.features.cancel(2);
		await assert.rejects(test.features.accept({ requestId: 2, id: '0' }), /Request suggestions again/);
		assert.strictEqual(test.applied, 0);
	});

	test('discards cancelled in-flight provider results', async () => {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const test = await setup({ provide: async () => { entered.resolve(); await finish.promise; return new vscode.CompletionList([]); } });
		const result = test.features.completions(request);
		await entered.promise;
		test.features.cancel(1);
		finish.resolve();
		await assert.rejects(result, vscode.CancellationError);
	});

	test('refuses a changed item identity when resolving instead of inserting the wrong completion', async () => {
		const test = await setup({ provide: async (_uri, _position, count) => new vscode.CompletionList([new vscode.CompletionItem(count ? 'Tampered' : 'Target')]) });
		await test.features.completions(request);
		await assert.rejects(test.features.accept({ requestId: 1, id: '0' }), /completion list changed/);
		assert.strictEqual(test.applied, 0);
	});

	test('compares effective edits when provider resolution drops redundant defaults', async () => {
		const test = await setup({
			provide: async (_uri, _position, count) => {
				const item = new vscode.CompletionItem('Target');
				if (!count) {
					item.sortText = 'Target';
					item.filterText = 'Target';
					item.insertText = 'Target';
					item.range = new vscode.Range(2, 0, 2, 2);
				}
				return new vscode.CompletionList([item]);
			}
		});
		await test.features.completions(request);
		await test.features.accept({ requestId: 1, id: '0' });
		assert.strictEqual(test.document.getText(), '# Title\r\n\r\nTarget');
	});

	test('rejects overlapping edits and workspace rejection', async () => {
		const test = await setup();
		test.item.additionalTextEdits = [vscode.TextEdit.replace(new vscode.Range(2, 1, 2, 2), 'X')];
		await test.features.completions(request);
		await assert.rejects(test.features.accept({ requestId: 1, id: '0' }), /overlapping edits/);
		assert.strictEqual(test.applied, 0);
		const rejected = await setup({ apply: async () => false });
		await rejected.features.completions(request);
		await assert.rejects(rejected.features.accept({ requestId: 1, id: '0' }), /workspace rejected/);
	});

	test('routes the trigger-suggest command back to the rich editor', async () => {
		const test = await setup();
		test.item.command = { command: 'editor.action.triggerSuggest', title: '' };
		await test.features.completions(request);
		assert.strictEqual((await test.features.accept({ requestId: 1, id: '0' })).retrigger, true);
		assert.deepStrictEqual(test.commands, []);
	});

	test('maps the accepted caret back to a normalized renderer snapshot', async () => {
		const test = await setup({
			apply: async edit => {
				const applied = await vscode.workspace.applyEdit(edit);
				test.state.text = test.document.getText().replace(/\r\n/g, '\n');
				test.state.editEpoch++;
				return applied;
			}
		});
		await test.features.completions(request);
		assert.strictEqual((await test.features.accept({ requestId: 1, id: '0' })).offset, 15);
		assert.strictEqual(test.state.text, '# Title\n\nTarget');
	});

	test('does not restore a stale caret after a follow-up command edits the document', async () => {
		const test = await setup({
			execute: async () => {
				const edit = new vscode.WorkspaceEdit();
				edit.insert(test.document.uri, new vscode.Position(0, 0), 'Command\n');
				await vscode.workspace.applyEdit(edit);
				test.state.text = test.document.getText();
				test.state.editEpoch++;
			}
		});
		test.item.command = { command: 'test.edit', title: '' };
		await test.features.completions(request);
		assert.deepStrictEqual(await test.features.accept({ requestId: 1, id: '0' }), { offset: undefined, editEpoch: 2, retrigger: false });
		assert.strictEqual(test.document.getText(), 'Command\r\n# Title\r\n\r\nTarget');
	});

	test('reports a failed follow-up command without hiding the successful insertion', async () => {
		const test = await setup({ execute: async () => { throw new Error('Command failed'); } });
		test.item.command = { command: 'test.fail', title: '' };
		await test.features.completions(request);
		const result = await test.features.accept({ requestId: 1, id: '0' });
		assert.match(result.warning!, /completion was inserted.*Command failed/);
		assert.strictEqual(result.offset, 17);
		assert.strictEqual(test.document.getText(), '# Title\r\n\r\nTarget');
	});

	test('rejects duplicate acceptance and cancellation during resolution before applying', async () => {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const test = await setup({
			provide: async (_uri, _position, count) => {
				if (count) { entered.resolve(); await finish.promise; }
				return new vscode.CompletionList([new vscode.CompletionItem('Target')]);
			}
		});
		await test.features.completions(request);
		const accepting = test.features.accept({ requestId: 1, id: '0' });
		await entered.promise;
		await assert.rejects(test.features.accept({ requestId: 1, id: '0' }), /Request suggestions again/);
		test.features.cancel(1);
		finish.resolve();
		await assert.rejects(accepting, vscode.CancellationError);
		assert.strictEqual(test.applied, 0);
	});

	test('rejects document changes during resolution and invalid provider ranges', async () => {
		const test = await setup({
			provide: async (_uri, _position, count) => {
				if (count) {
					const edit = new vscode.WorkspaceEdit();
					edit.insert(test.document.uri, new vscode.Position(0, 0), 'Changed\n');
					await vscode.workspace.applyEdit(edit);
				}
				return new vscode.CompletionList([new vscode.CompletionItem('Target')]);
			}
		});
		await test.features.completions(request);
		await assert.rejects(test.features.accept({ requestId: 1, id: '0' }), /document changed/);
		assert.strictEqual(test.applied, 0);

		const invalid = await setup();
		invalid.item.additionalTextEdits = [vscode.TextEdit.insert(new vscode.Position(99, 0), 'Out of bounds')];
		await invalid.features.completions(request);
		await assert.rejects(invalid.features.accept({ requestId: 1, id: '0' }), /invalid edit range/);
		assert.strictEqual(invalid.applied, 0);
	});
});
