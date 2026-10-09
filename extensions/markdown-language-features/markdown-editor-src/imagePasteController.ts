/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncClipboardStrategy, EditorModel, EditorView, Selection, readNativeClipboard, type IClipboardContext, type IClipboardStrategy } from '@vscode/markdown-editor';
import { Disposable } from '@vscode/observables';
import type { MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';

export class ImagePasteController extends Disposable implements IClipboardStrategy {
	readonly #strategy: AsyncClipboardStrategy;
	readonly #status = document.createElement('div');
	#disposed = false;
	#request = 0;
	#interaction = 0;

	constructor(
		readonly editor: EditorModel,
		readonly view: EditorView,
		readonly host: Pick<MarkdownEditorHost, 'pasteImages'>,
		readonly epoch: () => number,
		readonly clipboard: Clipboard = navigator.clipboard,
	) {
		super();
		this.#strategy = new AsyncClipboardStrategy(clipboard, (context, plainText) => this.#paste(context, async () => {
			const native = readNativeClipboard(context.element);
			if (native) {
				return { text: native.text, images: plainText ? [] : native.files.filter(file => file.type.startsWith('image/')) };
			}
			if (plainText || !clipboard.read) { return { text: await clipboard.readText(), images: [] }; }
			const items = await clipboard.read();
			const images: File[] = [];
			let text = '';
			for (const item of items) {
				const type = item.types.find(type => type === 'image/png') ?? item.types.find(type => type.startsWith('image/'));
				if (type) {
					const blob = await item.getType(type);
					const extension = type.slice('image/'.length).split('+')[0];
					images.push(new File([blob], `image.${extension}`, { type }));
				} else if (item.types.includes('text/plain')) {
					text += await (await item.getType('text/plain')).text();
				}
			}
			if (items.length && !images.length && !text && items.every(item => !item.types.includes('text/plain'))) {
				throw new Error('The clipboard formats are not available to this editor. Try copying the image itself instead of its file.');
			}
			return { text, images };
		}, plainText));
		this.#status.className = 'md-language-status';
		this.#status.setAttribute('role', 'status');
		this.#status.hidden = true;
		this._register(view.mountOverlay(this.#status, 'top-chrome'));
	}

	writeText(text: string): Promise<void> { return this.#strategy.writeText(text); }

	connect(context: IClipboardContext): { dispose(): void } {
		const interact = (): void => { this.#interaction++; };
		context.element.addEventListener('pointerdown', interact);
		context.element.addEventListener('keydown', interact);
		const connection = this.#strategy.connect(context);
		const paste = (event: ClipboardEvent): void => {
			if (event.target !== context.element || !event.clipboardData) { return; }
			const images = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
			const text = event.clipboardData.getData('text/plain');
			event.preventDefault();
			event.stopPropagation();
			void this.#paste(context, async () => ({ images, text }));
		};
		context.element.addEventListener('paste', paste);
		return {
			dispose: () => {
				connection.dispose();
				context.element.removeEventListener('pointerdown', interact);
				context.element.removeEventListener('keydown', interact);
				context.element.removeEventListener('paste', paste);
			}
		};
	}

	async #paste(context: IClipboardContext, read: () => Promise<{ readonly images: readonly File[]; readonly text: string }>, plainText = false): Promise<void> {
		const request = ++this.#request;
		const source = this.editor.sourceText.get();
		const selection = this.editor.selection.get();
		const epoch = this.epoch();
		const interaction = this.#interaction;
		if (this.editor.readonlyMode.get() || !selection) {
			this.#showError('Switch to editing mode and place the caret before pasting.');
			return;
		}
		try {
			const { images, text } = await read();
			const payload = await Promise.all(images.map(async image => ({
				name: image.name,
				mime: image.type,
				base64: await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result).split(',')[1]);
					reader.onerror = () => reject(reader.error ?? new Error('Could not read clipboard image.'));
					reader.onabort = () => reject(new Error('Clipboard image reading was cancelled.'));
					reader.readAsDataURL(image);
				}),
			})));
			if (this.#disposed || request !== this.#request) { return; }
			if (source !== this.editor.sourceText.get() || selection !== this.editor.selection.get() || epoch !== this.epoch()
				|| this.editor.readonlyMode.get() || document.activeElement !== context.element) {
				throw new Error('The editor changed while reading the clipboard. Paste again.');
			}
			this.#status.hidden = true;
			if (!payload.length) {
				if (text) { context.insertText(text, plainText); }
				return;
			}
			this.#status.textContent = 'Pasting image...';
			this.#status.hidden = false;
			const result = await this.host.pasteImages({
				start: selection.range.start, endExclusive: selection.range.endExclusive, editEpoch: epoch, images: payload,
			});
			if (this.#disposed || request !== this.#request) { return; }
			this.#status.hidden = true;
			if (result.offset !== undefined && result.editEpoch === this.epoch() && interaction === this.#interaction
				&& !this.editor.readonlyMode.get() && document.activeElement === context.element) {
				this.editor.selection.set(Selection.collapsed(result.offset), undefined);
			}
		} catch (error) {
			if (!this.#disposed && request === this.#request) {
				this.#showError(`Could not paste: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	#showError(message: string): void {
		this.#status.textContent = message;
		this.#status.hidden = false;
	}

	override dispose(): void {
		this.#disposed = true;
		super.dispose();
	}
}
