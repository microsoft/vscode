/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownEditorImagePaste } from '../preview/markdownEditorImagePaste';
import { CopyFilesSettings, ResourcePasteOrDropProvider } from '../languageFeatures/copyFiles/dropOrPasteResource';
import type { MarkdownEditorRenderer } from '../preview/markdownEditorProtocol';
import { clipboardMediaChunkSize } from '../preview/markdownEditorMediaTransfer';

suite('Markdown editor image paste', () => {
	const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
	const image = { id: 'image', name: 'image.png', mime: 'image/png', size: atob(base64).length };
	let files: Map<string, Uint8Array>;
	let chunks: Parameters<MarkdownEditorRenderer['readClipboardMedia']>[0][];
	const read: MarkdownEditorRenderer['readClipboardMedia'] = async request => {
		chunks.push(request);
		const contents = files.get(request.id);
		assert.ok(contents, `Missing test clipboard file ${request.id}`);
		return { base64: Buffer.from(contents.subarray(request.offset, request.offset + request.length)).toString('base64') };
	};
	let root: vscode.Uri;
	let document: vscode.TextDocument;
	let state: { text: string; editEpoch: number; editable: boolean };
	let paste: MarkdownEditorImagePaste;
	const request = () => ({ start: 9, endExclusive: 13, editEpoch: state.editEpoch, images: [image] });
	const apply = async (edit: vscode.WorkspaceEdit): Promise<boolean> => {
		const result = await vscode.workspace.applyEdit(edit);
		state.text = document.getText().replace(/\r\n/g, '\n');
		state.editEpoch++;
		return result;
	};

	setup(async () => {
		root = vscode.Uri.joinPath(vscode.Uri.file(__dirname), `markdown-image-paste-${crypto.randomUUID()}`);
		await vscode.workspace.fs.createDirectory(root);
		const uri = vscode.Uri.joinPath(root, 'document.md');
		await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode('# Title\r\n\r\nHERE'));
		document = await vscode.workspace.openTextDocument(uri);
		state = { text: '# Title\n\nHERE', editEpoch: 0, editable: true };
		files = new Map([[image.id, Uint8Array.from(atob(base64), c => c.charCodeAt(0))]]);
		chunks = [];
		paste = new MarkdownEditorImagePaste(document, async () => { }, () => state, () => state.editable, read, apply);
	});

	teardown(async () => {
		paste.dispose();
		await vscode.workspace.fs.delete(root, { recursive: true });
	});

	test('creates exact image bytes and replaces the selection with resolved Markdown, not snippet syntax', async () => {
		const result = await paste.paste(request());
		assert.strictEqual(document.getText(), '# Title\r\n\r\n![alt text](image.png)');
		assert.strictEqual(result.offset, state.text.length);
		assert.strictEqual(result.editEpoch, 1);
		assert.deepStrictEqual(Uint8Array.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'image.png'))), Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
	});

	test('uses the same naming and Markdown snippet as code-editor image paste', async () => {
		const data = new vscode.DataTransfer();
		const item = new vscode.DataTransferItem('');
		item.asFile = () => ({ name: 'image.png', uri: undefined, data: async () => Uint8Array.from(atob(base64), c => c.charCodeAt(0)) });
		data.set('image/png', item);
		const token = new vscode.CancellationTokenSource();
		try {
			const normal = await ResourcePasteOrDropProvider.createEditForMediaFiles(document, data, CopyFilesSettings.MediaFiles, token.token);
			assert.strictEqual(normal?.snippet.value, '![$' + '{1:alt text}](image.png)');
			await paste.paste(request());
			assert.ok(document.getText().endsWith('![alt text](image.png)'));
		} finally { token.dispose(); }
	});

	for (const kind of ['video', 'audio']) {
		test(`creates exact ${kind} bytes and the configured media embed`, async () => {
			const media = { id: kind, name: kind === 'video' ? 'clip.mp4' : 'sound.mp3', mime: kind === 'video' ? 'video/mp4' : 'audio/mpeg', size: 4 };
			files.set(media.id, new Uint8Array([1, 2, 3, 4]));
			const result = await paste.paste({ ...request(), images: [media] });
			assert.deepStrictEqual({
				text: document.getText(),
				bytes: [...await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, media.name))],
				result,
			}, {
				text: `# Title\r\n\r\n<${kind} controls src="${media.name}" title="Title"></${kind}>`,
				bytes: [1, 2, 3, 4],
				result: { offset: state.text.length, editEpoch: 1 },
			});
		});
	}

	test('reads files lazily, sequentially and in bounded chunks before applying a single workspace edit', async () => {
		const bytes = Uint8Array.from({ length: clipboardMediaChunkSize * 2 + 5 }, (_, index) => index % 256);
		files.set('video', bytes);
		await paste.paste({ ...request(), images: [
			{ id: 'video', name: 'clip.mp4', mime: 'video/mp4', size: bytes.length }, image,
		] });
		assert.deepStrictEqual({
			chunks,
			bytes: Uint8Array.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'clip.mp4'))),
			editEpoch: state.editEpoch,
		}, {
			chunks: [
				{ id: 'video', offset: 0, length: clipboardMediaChunkSize },
				{ id: 'video', offset: clipboardMediaChunkSize, length: clipboardMediaChunkSize },
				{ id: 'video', offset: clipboardMediaChunkSize * 2, length: 5 },
				{ id: 'image', offset: 0, length: image.size },
			],
			bytes,
			editEpoch: 1,
		});
	});

	test('stops requesting chunks after stale edits, cancellation or read errors without writing files', async () => {
		for (const reason of ['stale', 'cancelled', 'read error']) {
			paste.dispose();
			chunks = [];
			paste = new MarkdownEditorImagePaste(document, async () => { }, () => state, () => true, async request => {
				chunks.push(request);
				if (reason === 'stale') { state.editEpoch++; }
				if (reason === 'cancelled') { paste.dispose(); }
				if (reason === 'read error') { throw new Error('read failed'); }
				return { base64: Buffer.alloc(request.length).toString('base64') };
			}, apply);
			await assert.rejects(paste.paste({ ...request(), images: [
				{ id: 'video', name: 'clip.mp4', mime: 'video/mp4', size: clipboardMediaChunkSize + 1 },
			] }), reason === 'stale' ? /editor changed/ : reason === 'read error' ? /read failed/ : vscode.CancellationError);
			assert.deepStrictEqual({
				chunks: chunks.length,
				files: (await vscode.workspace.fs.readDirectory(root)).map(([name]) => name),
				text: document.getText(),
			}, { chunks: 1, files: ['document.md'], text: '# Title\r\n\r\nHERE' });
		}
	});

	test('increments collisions without overwriting and supports multiple images of one MIME type', async () => {
		await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'image.png'), new Uint8Array([1, 2, 3]));
		files.set('second', new Uint8Array([4, 5, 6]));
		await paste.paste({ ...request(), images: [image, { ...image, id: 'second', size: 3 }] });
		const links = Array.from(document.getText().matchAll(/!\[alt text\]\(([^)]+)\)/g), match => match[1]);
		assert.deepStrictEqual([...links].sort(), ['image-1.png', 'image-2.png']);
		assert.strictEqual(document.getText(), `# Title\r\n\r\n![alt text](${links[0]}) ![alt text](${links[1]})`);
		assert.deepStrictEqual(await Promise.all(links.map(async name =>
			Uint8Array.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, name))))), [
			Uint8Array.from(atob(base64), c => c.charCodeAt(0)),
			new Uint8Array([4, 5, 6]),
		]);
		assert.deepStrictEqual(Uint8Array.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'image.png'))), new Uint8Array([1, 2, 3]));
	});

	test('honors copy destination and overwrite settings', async () => {
		const config = vscode.workspace.getConfiguration('markdown', document);
		const destination = config.inspect('copyFiles.destination')?.globalValue;
		const overwrite = config.inspect('copyFiles.overwriteBehavior')?.globalValue;
		try {
			await config.update('copyFiles.destination', { '**/document.md': 'assets/${fileName}' }, vscode.ConfigurationTarget.Global);
			await config.update('copyFiles.overwriteBehavior', 'overwrite', vscode.ConfigurationTarget.Global);
			await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, 'assets'));
			await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'assets', 'image.png'), new Uint8Array([0]));
			await paste.paste(request());
			assert.ok(document.getText().endsWith('![alt text](assets/image.png)'));
			assert.strictEqual((await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'assets', 'image.png'))).length, atob(base64).length);
		} finally {
			await config.update('copyFiles.destination', destination, vscode.ConfigurationTarget.Global);
			await config.update('copyFiles.overwriteBehavior', overwrite, vscode.ConfigurationTarget.Global);
		}
	});

	test('rejects invalid input, stale epochs, and locked editors before creating files', async () => {
		await assert.rejects(paste.paste({ ...request(), images: [{ ...image, name: '../escape.png' }] }), /Invalid clipboard media/);
		await assert.rejects(paste.paste({ ...request(), images: [{ ...image, size: -1 }] }), /Invalid clipboard media/);
		await assert.rejects(paste.paste({ ...request(), images: [image, image] }), /Invalid clipboard media/);
		await assert.rejects(paste.paste({ ...request(), images: [{ ...image, mime: 'application/octet-stream' }] }), /Invalid clipboard media/);
		await assert.rejects(paste.paste({ ...request(), endExclusive: 999 }), /Invalid media paste range/);
		await assert.rejects(paste.paste({ ...request(), start: -1 }), /Invalid media paste range/);
		await assert.rejects(paste.paste({ ...request(), editEpoch: 9 }), /editor changed/);
		state.editable = false;
		await assert.rejects(paste.paste(request()), /editor changed/);
		assert.deepStrictEqual(chunks, []);
		assert.deepStrictEqual((await vscode.workspace.fs.readDirectory(root)).map(([name]) => name), ['document.md']);
	});

	test('rejects a changed document or disposal while preparing image edits', async () => {
		let drains = 0;
		paste.dispose();
		paste = new MarkdownEditorImagePaste(document, async () => {
			if (++drains === 2) { state.editEpoch++; }
		}, () => state, () => true, read, apply);
		await assert.rejects(paste.paste(request()), /editor changed/);
		assert.deepStrictEqual((await vscode.workspace.fs.readDirectory(root)).map(([name]) => name), ['document.md']);
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		paste = new MarkdownEditorImagePaste(document, async () => { entered.resolve(); await finish.promise; }, () => state, () => true, read, apply);
		const result = paste.paste(request());
		await entered.promise;
		paste.dispose();
		finish.resolve();
		await assert.rejects(result, vscode.CancellationError);
	});

	test('reports disabled settings, unsaved documents, and workspace rejection', async () => {
		const config = vscode.workspace.getConfiguration('editor', document);
		const previous = config.inspect('pasteAs.enabled')?.globalValue;
		try {
			await config.update('pasteAs.enabled', false, vscode.ConfigurationTarget.Global);
			await assert.rejects(paste.paste(request()), /disabled/);
		} finally { await config.update('pasteAs.enabled', previous, vscode.ConfigurationTarget.Global); }
		const untitled = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'HERE' });
		const unsaved = new MarkdownEditorImagePaste(untitled, async () => { }, () => ({ text: 'HERE', editEpoch: 0 }), () => true, read);
		try {
			await assert.rejects(unsaved.paste({ ...request(), start: 0, endExclusive: 4, editEpoch: 0 }), /Save the Markdown/);
		} finally { unsaved.dispose(); }
		paste = new MarkdownEditorImagePaste(document, async () => { }, () => state, () => true, read, async () => false);
		await assert.rejects(paste.paste(request()), /workspace rejected/);
		assert.deepStrictEqual((await vscode.workspace.fs.readDirectory(root)).map(([name]) => name), ['document.md']);
	});

	test('does not return a stale caret when another edit follows application', async () => {
		paste.dispose();
		paste = new MarkdownEditorImagePaste(document, async () => { }, () => state, () => true, read, async edit => {
			await apply(edit);
			const followup = new vscode.WorkspaceEdit();
			followup.insert(document.uri, new vscode.Position(0, 0), 'Other edit\n');
			return apply(followup);
		});
		const result = await paste.paste(request());
		assert.deepStrictEqual(result, { offset: undefined, editEpoch: 2 });
		assert.ok(document.getText().includes('![alt text](image.png)'));
	});
});
