/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownEditorRename, type MarkdownRenameApi } from '../preview/markdownEditorRename';

suite('Markdown editor rename', () => {
	const prepared = { range: new vscode.Range(2, 0, 2, 6), placeholder: 'Target' };
	const request = { requestId: 1, offset: 10, editEpoch: 0 };

	async function setup(overrides: Partial<MarkdownRenameApi> = {}, drain: () => Promise<void> = async () => { }) {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '# Title\r\n\r\nTarget' });
		const state = { text: '# Title\n\nTarget', editEpoch: 0, active: true };
		const calls: { uri: vscode.Uri; position: vscode.Position; name?: string }[] = [];
		const edit = new vscode.WorkspaceEdit();
		edit.replace(document.uri, prepared.range, 'Renamed');
		let applications = 0;
		const api: MarkdownRenameApi = {
			prepare: async (uri, position) => { calls.push({ uri, position }); return prepared; },
			rename: async (uri, position, name) => { calls.push({ uri, position, name }); return edit; },
			apply: async changes => { applications++; return vscode.workspace.applyEdit(changes); },
			...overrides,
		};
		const rename = new MarkdownEditorRename(document, drain, () => state, () => state.active, api);
		return { document, state, calls, edit, rename, get applications() { return applications; } };
	}

	test('maps LF renderer offsets to CRLF document positions and back', async () => {
		const test = await setup();
		assert.deepStrictEqual(await test.rename.prepare(request), { start: 9, endExclusive: 15, placeholder: 'Target' });
		assert.deepStrictEqual(test.calls[0].position, new vscode.Position(2, 1));
		await test.rename.rename({ requestId: 1, newName: 'Renamed' });
		assert.deepStrictEqual(test.calls[1].position, new vscode.Position(2, 1));
		assert.strictEqual(test.document.getText(), '# Title\r\n\r\nRenamed');
		assert.strictEqual(test.applications, 1);
		await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Again' }), /Start rename again/);
	});

	test('drains accepted edits before preparing and rejects stale epochs or offsets', async () => {
		const drained = Promise.withResolvers<void>();
		const test = await setup({}, () => drained.promise);
		const result = test.rename.prepare(request);
		assert.strictEqual(test.calls.length, 0);
		drained.resolve();
		await result;
		await assert.rejects(test.rename.prepare({ ...request, editEpoch: 1 }), /document changed/);
		await assert.rejects(test.rename.prepare({ ...request, offset: 100 }), /document changed/);
		assert.strictEqual(test.calls.length, 1);
	});

	test('cancels an in-flight prepare and ignores cancellation for an older session', async () => {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const test = await setup({ prepare: async () => { entered.resolve(); await finish.promise; return prepared; } });
		const result = test.rename.prepare(request);
		await entered.promise;
		test.rename.cancel(1);
		finish.resolve();
		await assert.rejects(result, vscode.CancellationError);
		await test.rename.prepare({ ...request, requestId: 2 });
		test.rename.cancel(1);
		await test.rename.rename({ requestId: 2, newName: 'Renamed' });
		assert.strictEqual(test.applications, 1);
	});

	test('rejects unsupported symbols and prepare provider errors', async () => {
		const unsupported = await setup({ prepare: async () => undefined });
		await assert.rejects(unsupported.rename.prepare(request), /cannot be renamed/);
		const failed = await setup({ prepare: async () => { throw new Error('Provider rejected preparation'); } });
		await assert.rejects(failed.rename.prepare(request), /Provider rejected preparation/);
		assert.strictEqual(failed.applications, 0);
	});

	test('rejects a document changed during prepare', async () => {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const test = await setup({ prepare: async () => { entered.resolve(); await finish.promise; return prepared; } });
		const result = test.rename.prepare(request);
		await entered.promise;
		await vscode.workspace.applyEdit(test.edit);
		finish.resolve();
		await assert.rejects(result, /document changed/);
		assert.strictEqual(test.applications, 0);
	});

	test('rejects renamed sessions after document changes, reload, or deactivation', async () => {
		for (const invalidate of [
			async (test: Awaited<ReturnType<typeof setup>>) => { await vscode.workspace.applyEdit(test.edit); },
			async (test: Awaited<ReturnType<typeof setup>>) => { test.state.editEpoch++; },
			async (test: Awaited<ReturnType<typeof setup>>) => { test.state.active = false; },
			async (test: Awaited<ReturnType<typeof setup>>) => { test.rename.cancel(); },
		]) {
			const test = await setup();
			await test.rename.prepare(request);
			await invalidate(test);
			await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Renamed' }));
			assert.strictEqual(test.applications, 0);
		}
	});

	test('cancels during provider execution and rejects concurrent submissions', async () => {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const test = await setup({ rename: async () => { entered.resolve(); await finish.promise; return test.edit; } });
		await test.rename.prepare(request);
		const result = test.rename.rename({ requestId: 1, newName: 'Renamed' });
		await entered.promise;
		await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Twice' }), /already in progress/);
		test.rename.cancel(1);
		finish.resolve();
		await assert.rejects(result, vscode.CancellationError);
		assert.strictEqual(test.applications, 0);
		assert.strictEqual(test.document.getText(), '# Title\r\n\r\nTarget');
	});

	test('applies all files from the provider workspace edit', async () => {
		const test = await setup();
		const reference = await vscode.workspace.openTextDocument({ language: 'markdown', content: '[Target](#target)' });
		test.edit.replace(reference.uri, new vscode.Range(0, 10, 0, 16), 'renamed');
		await test.rename.prepare(request);
		await test.rename.rename({ requestId: 1, newName: 'Renamed' });
		assert.strictEqual(test.document.lineAt(2).text, 'Renamed');
		assert.strictEqual(reference.getText(), '[Target](#renamed)');
	});

	test('drains edits accepted during provider execution before applying', async () => {
		let drains = 0;
		const test = await setup({}, async () => {
			if (++drains === 3) {
				await vscode.workspace.applyEdit(test.edit);
			}
		});
		await test.rename.prepare(request);
		await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Renamed' }), /document changed/);
		assert.strictEqual(drains, 3);
		assert.strictEqual(test.applications, 0);
	});

	test('does not overwrite a referenced document changed during provider execution', async () => {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const reference = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'Target' });
		const test = await setup({ rename: async () => { entered.resolve(); await finish.promise; return test.edit; } });
		test.edit.replace(reference.uri, new vscode.Range(0, 0, 0, 6), 'Renamed');
		await test.rename.prepare(request);
		const result = test.rename.rename({ requestId: 1, newName: 'Renamed' });
		await entered.promise;
		const external = new vscode.WorkspaceEdit();
		external.insert(reference.uri, new vscode.Position(0, 0), 'External ');
		await vscode.workspace.applyEdit(external);
		finish.resolve();
		await assert.rejects(result, /document changed/);
		assert.strictEqual(reference.getText(), 'External Target');
		assert.strictEqual(test.document.lineAt(2).text, 'Target');
		assert.strictEqual(test.applications, 0);
	});

	test('surfaces provider errors and workspace rejection, allowing retry', async () => {
		let attempt = 0;
		const test = await setup({
			rename: async () => {
				if (++attempt === 1) { throw new Error('Provider rejected name'); }
				return test.edit;
			},
			apply: async () => false,
		});
		await test.rename.prepare(request);
		await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Invalid' }), /Provider rejected name/);
		await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Rejected' }), /workspace rejected/);
		assert.strictEqual(attempt, 2);
		assert.strictEqual(test.document.lineAt(2).text, 'Target');
	});

	test('applies a resource-only rename even though WorkspaceEdit.size is zero', async () => {
		const root = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), `markdown-rename-${crypto.randomUUID()}`);
		const before = vscode.Uri.joinPath(root, 'before.md');
		const after = vscode.Uri.joinPath(root, 'after.md');
		const contents = new TextEncoder().encode('# Target');
		await vscode.workspace.fs.createDirectory(root);
		try {
			await vscode.workspace.fs.writeFile(before, contents);
			const edit = new vscode.WorkspaceEdit();
			edit.renameFile(before, after);
			assert.strictEqual(edit.size, 0);
			const test = await setup({ rename: async () => edit });
			await test.rename.prepare(request);
			await test.rename.rename({ requestId: 1, newName: 'after' });
			assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(root), [['after.md', vscode.FileType.File]]);
			assert.deepStrictEqual(Uint8Array.from(await vscode.workspace.fs.readFile(after)), contents);
			assert.strictEqual(test.applications, 1);
		} finally {
			await vscode.workspace.fs.delete(root, { recursive: true });
		}
	});

	test('rejects missing edits, missing preparation, and invalid names', async () => {
		const test = await setup({ rename: async () => undefined });
		await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Name' }), /Start rename again/);
		await test.rename.prepare(request);
		for (const newName of ['', ' ', 'two\nlines', 'two\rlines']) {
			await assert.rejects(test.rename.rename({ requestId: 1, newName }), /non-empty, single-line/);
		}
		await assert.rejects(test.rename.rename({ requestId: 1, newName: 'Name' }), /no changes/);
		assert.strictEqual(test.applications, 0);
	});
});
