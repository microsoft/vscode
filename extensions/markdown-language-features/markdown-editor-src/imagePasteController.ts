/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncClipboardStrategy, EditorModel, EditorView, Selection, readNativeClipboard, type IClipboardContext, type IClipboardStrategy, type NativeClipboardData } from '@vscode/markdown-editor';
import { Disposable } from '@vscode/observables';
import type { MarkdownEditorHost, MarkdownEditorRenderer } from '../src/preview/markdownEditorProtocol';
import { ClipboardMediaStore } from '../src/preview/markdownEditorMediaTransfer';
import { clipboardFormatsUnavailableMessage, getNativeClipboardMedia } from './clipboardMedia';

export class ImagePasteController extends Disposable implements IClipboardStrategy {
	readonly #strategy: AsyncClipboardStrategy;
	readonly #status = document.createElement('div');
	#disposed = false;
	#request = 0;
	#interaction = 0;
	#media: ClipboardMediaStore | undefined;

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

	readClipboardMedia(request: Parameters<MarkdownEditorRenderer['readClipboardMedia']>[0], signal: AbortSignal): ReturnType<MarkdownEditorRenderer['readClipboardMedia']> {
		if (!this.#media || this.#disposed) {
			throw new Error('The clipboard media paste has expired.');
		}
		return this.#media.read(request, signal);
	}

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
		this.#media?.dispose();
		this.#media = undefined;
		const source = this.editor.sourceText.get();
		const selection = this.editor.selection.get();
		const epoch = this.epoch();
		const interaction = this.#interaction;
		if (this.editor.readonlyMode.get() || !selection) {
			this.#showError('Switch to editing mode and place the caret before pasting.');
			return;
		}
		let media: ClipboardMediaStore | undefined;
		try {
			const { images, text } = await read();
			if (this.#disposed || request !== this.#request) { return; }
			if (source !== this.editor.sourceText.get() || selection !== this.editor.selection.get() || epoch !== this.epoch()
				|| this.editor.readonlyMode.get() || document.activeElement !== context.element) {
				throw new Error('The editor changed while reading the clipboard. Paste again.');
			}
			this.#status.hidden = true;
			if (!images.length) {
				if (text) { context.insertText(text, plainText); }
				return;
			}
			this.#status.textContent = 'Pasting media...';
			this.#status.hidden = false;
			media = this.#media = new ClipboardMediaStore(images);
			const result = await this.host.pasteImages({
				start: selection.range.start, endExclusive: selection.range.endExclusive, editEpoch: epoch, images: [...media.images],
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
		} finally {
			media?.dispose();
			if (this.#media === media) { this.#media = undefined; }
		}
	}

	#showError(message: string): void {
		this.#status.textContent = message;
		this.#status.hidden = false;
	}

	override dispose(): void {
		this.#disposed = true;
		this.#media?.dispose();
		this.#media = undefined;
		super.dispose();
	}
}
