/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MarkdownEditorHost, MarkdownEditorRenderer } from './markdownEditorProtocol';

export const clipboardMediaChunkSize = 256 * 1024;

type ClipboardMedia = Parameters<MarkdownEditorHost['pasteImages']>[0]['images'][number];
type ChunkRequest = Parameters<MarkdownEditorRenderer['readClipboardMedia']>[0];
type ChunkResult = Awaited<ReturnType<MarkdownEditorRenderer['readClipboardMedia']>>;

export class ClipboardMediaStore {
	readonly #files = new Map<string, File>();
	readonly images: readonly ClipboardMedia[];

	constructor(files: readonly File[]) {
		this.images = files.map(file => {
			const id = crypto.randomUUID();
			this.#files.set(id, file);
			return { id, name: file.name, mime: file.type, size: file.size };
		});
	}

	async read(request: ChunkRequest, signal: AbortSignal): Promise<ChunkResult> {
		signal.throwIfAborted();
		const file = this.#files.get(request.id);
		if (!file || !Number.isSafeInteger(request.offset) || !Number.isSafeInteger(request.length)
			|| request.offset < 0 || request.length <= 0 || request.length > clipboardMediaChunkSize
			|| request.offset > file.size - request.length) {
			throw new Error('Invalid or expired clipboard media chunk request.');
		}
		const bytes = new Uint8Array(await file.slice(request.offset, request.offset + request.length).arrayBuffer());
		signal.throwIfAborted();
		if (this.#files.get(request.id) !== file) {
			throw new Error('The clipboard media paste has expired.');
		}
		let binary = '';
		for (let offset = 0; offset < bytes.length; offset += 8192) {
			binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
		}
		return { base64: btoa(binary) };
	}

	dispose(): void {
		this.#files.clear();
	}
}

export async function readClipboardMediaContents(
	file: ClipboardMedia,
	read: (request: ChunkRequest) => Promise<ChunkResult>,
	checkCurrent: () => void,
): Promise<Uint8Array> {
	checkCurrent();
	const contents = new Uint8Array(file.size);
	for (let offset = 0; offset < contents.length; offset += clipboardMediaChunkSize) {
		checkCurrent();
		const length = Math.min(clipboardMediaChunkSize, contents.length - offset);
		const { base64 } = await read({ id: file.id, offset, length });
		checkCurrent();
		if (base64.length !== 4 * Math.ceil(length / 3)
			|| !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
			throw new Error('Invalid clipboard media chunk.');
		}
		const binary = atob(base64);
		if (binary.length !== length) {
			throw new Error('Unexpected clipboard media chunk length.');
		}
		for (let index = 0; index < binary.length; index++) {
			contents[offset + index] = binary.charCodeAt(index);
		}
	}
	return contents;
}
