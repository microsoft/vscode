/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel, EditorView, Selection, SuggestModel, SuggestWidget } from '@vscode/markdown-editor';
import { Disposable, autorun } from '@vscode/observables';
import type { MarkdownCompletion, MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';
import '@vscode/markdown-editor/suggest.css';
import './languageFeatures.css';

export class CompletionController extends Disposable {
	readonly #editor: EditorModel;
	readonly #view: EditorView;
	readonly #host: MarkdownEditorHost;
	readonly #epoch: () => number;
	readonly #suggest: SuggestModel<MarkdownCompletion>;
	#requestId = 0;
	#active: number | undefined;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#applying = false;
	#disposed = false;

	constructor(editor: EditorModel, view: EditorView, host: MarkdownEditorHost, epoch: () => number) {
		super();
		this.#editor = editor;
		this.#view = view;
		this.#host = host;
		this.#epoch = epoch;
		this.#suggest = new SuggestModel({ onAccept: item => { void this.#accept(item); }, onCancel: () => this.cancel() });
		const widget = this._register(new SuggestWidget({
			model: this.#suggest, focusTarget: view.element, id: `markdown-suggest-${crypto.randomUUID()}`,
		}));
		widget.element.classList.add('md-completion-overlay');
		this._register(view.mountOverlay(widget.element, 'above-decorations'));
		this._register({ dispose: () => this.#suggest.close() });
		const layout = (): void => {
			const caret = view.caretRect.get();
			if (!caret || this.#suggest.state.get().kind === 'closed') { return; }
			const container = view.overlayContainer.getBoundingClientRect();
			const editorBounds = view.element.getBoundingClientRect();
			const top = Math.max(0, -container.top);
			const bottom = Math.min(window.innerHeight, editorBounds.bottom) - container.top;
			const below = Math.max(0, bottom - caret.y - caret.height);
			const above = Math.max(0, caret.y - top);
			const flipped = below < widget.element.offsetHeight && above > below;
			widget.element.style.setProperty('--md-suggest-max-height', `${Math.max(19, (flipped ? above : below) - 4)}px`);
			widget.element.style.left = `${Math.max(0, Math.min(caret.x, view.overlayContainer.clientWidth - widget.element.offsetWidth))}px`;
			widget.element.style.top = `${flipped ? Math.max(top, caret.y - widget.element.offsetHeight) : caret.y + caret.height}px`;
		};
		this._register(autorun(reader => {
			this.#suggest.state.read(reader);
			view.caretRect.read(reader);
			layout();
		}));
		const resize = new ResizeObserver(layout);
		resize.observe(widget.element);
		resize.observe(view.element);
		document.addEventListener('scroll', layout, true);
		window.addEventListener('resize', layout);
		this._register({
			dispose: () => {
				resize.disconnect();
				document.removeEventListener('scroll', layout, true);
				window.removeEventListener('resize', layout);
			}
		});
		let previousSource = editor.sourceText.get().value;
		this._register(autorun(reader => {
			const source = editor.sourceText.read(reader).value;
			editor.selection.read(reader);
			const readonly = editor.readonlyMode.read(reader);
			const changed = previousSource !== source;
			previousSource = source;
			if (this.#applying) { return; }
			this.cancel();
			if (changed && !readonly && document.activeElement === view.element && document.hasFocus()) {
				this.#timer = setTimeout(() => { this.#timer = undefined; void this.start(true); }, 150);
			}
		}));
		const keydown = (event: KeyboardEvent): void => {
			if (event.code === 'Space' && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && !event.isComposing) {
				event.preventDefault();
				event.stopPropagation();
				void this.start();
			}
		};
		const blur = (): void => this.cancel();
		view.element.addEventListener('keydown', keydown, true);
		view.element.addEventListener('blur', blur);
		window.addEventListener('blur', blur);
		this._register({
			dispose: () => {
				view.element.removeEventListener('keydown', keydown, true);
				view.element.removeEventListener('blur', blur);
				window.removeEventListener('blur', blur);
			}
		});
	}

	async start(automatic = false): Promise<void> {
		this.cancel();
		const selection = this.#editor.selection.get();
		if (!selection || this.#editor.readonlyMode.get()) {
			if (!automatic) { this.#suggest.showError('Switch to editing mode and place the caret to request suggestions.'); }
			return;
		}
		const requestId = ++this.#requestId;
		this.#active = requestId;
		if (!automatic) { this.#suggest.showLoading(); }
		try {
			const result = await this.#host.completions({ requestId, offset: selection.active, editEpoch: this.#epoch(), automatic });
			if (this.#disposed || this.#active !== requestId) { return; }
			if (automatic && !result.items.length) { this.cancel(); return; }
			this.#suggest.show(result.items.map(item => item.unsupported ? { ...item, detail: item.unsupported } : item));
		} catch (error) {
			if (!this.#disposed && this.#active === requestId) { this.#suggest.showError(error instanceof Error ? error.message : String(error)); }
		}
	}

	async #accept(item: MarkdownCompletion): Promise<void> {
		if (item.unsupported) { this.#suggest.showError(item.unsupported); return; }
		const requestId = this.#active;
		if (requestId === undefined) { return; }
		this.#applying = true;
		try {
			const result = await this.#host.acceptCompletion({ requestId, id: item.id });
			if (!this.#disposed && this.#active === requestId && result.editEpoch === this.#epoch()) {
				if (result.offset !== undefined) {
					this.#editor.selection.set(Selection.collapsed(Math.min(result.offset, this.#editor.sourceText.get().value.length)), undefined);
					this.#view.focus();
				}
				this.#applying = false;
				if (result.warning) { this.#suggest.showError(result.warning); }
				else if (result.retrigger) { await this.start(); }
			}
		} catch (error) {
			if (!this.#disposed && this.#active === requestId) { this.#suggest.showError(error instanceof Error ? error.message : String(error)); }
		} finally {
			this.#applying = false;
		}
	}

	cancel(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		const requestId = this.#active;
		this.#active = undefined;
		this.#suggest.close();
		if (requestId !== undefined) {
			void this.#host.cancelCompletions({ requestId }).catch(error => {
				if (!this.#disposed) { console.error('Markdown completion cancellation failed', error); }
			});
		}
	}

	override dispose(): void {
		this.#disposed = true;
		this.cancel();
		super.dispose();
	}
}
