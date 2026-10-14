/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncClipboardStrategy, EditorModel, EditorView, Selection, readNativeClipboard, type IClipboardContext, type IClipboardStrategy, type NativeClipboardData } from '@vscode/markdown-editor';
import { Disposable } from '@vscode/observables';
import type { MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';
import { clipboardFormatsUnavailableMessage, getNativeClipboardMedia } from './clipboardMedia';

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
		this.#strategy = new AsyncClipboardStrategy(clipboard, (context, plainText, nativeData?: NativeClipboardData) => this.#paste(context, async () => {
			const native = nativeData ?? readNativeClipboard(context.element);
			if (native) {
				return getNativeClipboardMedia(native, plainText);
			}
			if (plainText || !clipboard.read) { return { text: await clipboard.readText(), images: [] }; }
			const items = await clipboard.read();
			const images: File[] = [];
			let text = '';
			for (const item of items) {
				const type = item.types.find(type => type === 'image/png') ?? item.types.find(type => /^(image|video|audio)\//.test(type));
				if (type) {
					const blob = await item.getType(type);
					const [kind, subtype] = type.split('/');
					const extension = subtype.split('+')[0];
					images.push(new File([blob], `${kind}.${extension}`, { type }));
				} else if (item.types.includes('text/plain')) {
					text += await (await item.getType('text/plain')).text();
				}
			}
			if (items.length && !images.length && !text && items.every(item => !item.types.includes('text/plain'))) {
				throw new Error(clipboardFormatsUnavailableMessage);
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
		return {
			dispose: () => {
				connection.dispose();
				context.element.removeEventListener('pointerdown', interact);
				context.element.removeEventListener('keydown', interact);
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
					reader.onerror = () => reject(reader.error ?? new Error('Could not read clipboard media.'));
					reader.onabort = () => reject(new Error('Clipboard media reading was cancelled.'));
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
			this.#status.textContent = 'Pasting media...';
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
