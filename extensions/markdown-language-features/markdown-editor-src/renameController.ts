/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel, EditorView, OffsetRange, RenameModel, RenameWidget } from '@vscode/markdown-editor';
import { Disposable, autorun, observableValue } from '@vscode/observables';
import type { MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';
import '@vscode/markdown-editor/rename.css';
import './rename.css';

export class RenameController extends Disposable {
	readonly #editor: EditorModel;
	readonly #host: MarkdownEditorHost;
	readonly #epoch: () => number;
	readonly #rename: RenameModel<RenameContext>;
	readonly #widget: RenameWidget<RenameContext>;
	readonly #status = observableValue<string | undefined>('renameStatus', undefined);
	#nextRequestId = 0;
	#active: { requestId: number; source: string; offset: number } | undefined;
	#disposed = false;

	constructor(editor: EditorModel, view: EditorView, host: MarkdownEditorHost, epoch: () => number) {
		super();
		this.#editor = editor;
		this.#host = host;
		this.#epoch = epoch;
		this.#rename = this._register(new RenameModel({
			validate: name => /[\r\n]/.test(name) ? 'Enter a single-line name.' : undefined,
			onSubmit: async ({ name, context, signal }) => {
				signal.throwIfAborted();
				const cancel = () => this.#cancelRemote(context.requestId);
				signal.addEventListener('abort', cancel, { once: true });
				try {
					await host.rename({ requestId: context.requestId, newName: name });
				} finally {
					signal.removeEventListener('abort', cancel);
				}
			},
			onCancel: () => this.cancel(),
		}));
		this.#widget = this._register(new RenameWidget(view.overlayContainer, this.#rename, {
			autoFocus: false,
			onDidHide: () => {
				if (!this.#disposed) {
					view.focus();
				}
			},
		}));
		this._register(view.suspendEditContextWhileFocused(this.#widget.element));
		const status = document.createElement('div');
		status.className = 'md-rename-status';
		status.setAttribute('role', 'status');
		status.setAttribute('aria-live', 'polite');
		view.overlayContainer.appendChild(status);
		this._register({ dispose: () => status.remove() });
		const highlights = document.createElement('div');
		highlights.className = 'md-rename-target-layer';
		highlights.setAttribute('aria-hidden', 'true');
		this._register(view.mountOverlay(highlights, 'below-selection'));
		this._register(autorun(reader => {
			const message = this.#status.read(reader);
			status.textContent = message ?? '';
			status.hidden = !message;
			const session = this.#rename.session.read(reader);
			const rects = session ? view.rangeRects(session.context.range).read(reader) : [];
			highlights.replaceChildren(...rects.map(rect => {
				const highlight = document.createElement('div');
				highlight.className = 'md-rename-target';
				highlight.style.left = `${rect.x}px`;
				highlight.style.top = `${rect.y}px`;
				highlight.style.width = `${Math.max(1, rect.width)}px`;
				highlight.style.height = `${rect.height}px`;
				return highlight;
			}));
			const rect = rects[0];
			const caret = view.caretRect.read(reader);
			const anchor = rect ? { left: rect.x, top: rect.y, height: rect.height }
				: caret ? { left: caret.x, top: caret.y, height: caret.height } : { left: 0, top: 0, height: 20 };
			this.#widget.layout(anchor);
			status.style.left = `${anchor.left}px`;
			status.style.top = `${anchor.top + anchor.height}px`;
		}));
		this._register(autorun(reader => {
			const source = editor.sourceText.read(reader).value;
			const selection = editor.selection.read(reader);
			const readonly = editor.readonlyMode.read(reader);
			if (this.#active && (readonly || source !== this.#active.source || selection?.active !== this.#active.offset)) {
				this.cancel();
			}
		}));
		const keydown = (event: KeyboardEvent): void => {
			if (event.isComposing) { return; }
			if (event.key === 'F2' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
				event.preventDefault();
				event.stopPropagation();
				void this.start();
			} else if (event.key === 'Escape' && (this.#active || this.#status.get())) {
				event.preventDefault();
				event.stopPropagation();
				this.cancel();
			}
		};
		const focusout = (): void => {
			queueMicrotask(() => {
				if (!this.#disposed && this.#active && !this.#widget.element.contains(document.activeElement)) {
					this.cancel();
				}
			});
		};
		const documentFocusout = (): void => {
			queueMicrotask(() => {
				if (!this.#disposed && this.#active && !view.element.contains(document.activeElement)) {
					this.cancel();
				}
			});
		};
		const blur = (): void => this.cancel();
		const inputFocus = (): void => { view.element.classList.add('md-rename-active'); };
		const inputBlur = (): void => { view.element.classList.remove('md-rename-active'); };
		this.#widget.inputElement.addEventListener('focus', inputFocus);
		this.#widget.inputElement.addEventListener('blur', inputBlur);
		view.element.addEventListener('keydown', keydown, true);
		this.#widget.element.addEventListener('focusout', focusout);
		document.addEventListener('focusout', documentFocusout);
		window.addEventListener('blur', blur);
		this._register({
			dispose: () => {
				view.element.classList.remove('md-rename-active');
				this.#widget.inputElement.removeEventListener('focus', inputFocus);
				this.#widget.inputElement.removeEventListener('blur', inputBlur);
				view.element.removeEventListener('keydown', keydown, true);
				this.#widget.element.removeEventListener('focusout', focusout);
				document.removeEventListener('focusout', documentFocusout);
				window.removeEventListener('blur', blur);
			}
		});
	}

	async start(): Promise<void> {
		this.cancel();
		const selection = this.#editor.selection.get();
		if (!selection || this.#editor.readonlyMode.get()) {
			this.#status.set('Switch to editing mode and place the caret on a symbol to rename.', undefined);
			return;
		}
		const active = { requestId: ++this.#nextRequestId, source: this.#editor.sourceText.get().value, offset: selection.active };
		this.#active = active;
		this.#status.set('Preparing rename...', undefined);
		try {
			const prepared = await this.#host.prepareRename({ requestId: active.requestId, offset: active.offset, editEpoch: this.#epoch() });
			if (this.#disposed || this.#active !== active) { return; }
			this.#status.set(undefined, undefined);
			this.#rename.open({
				initialName: prepared.placeholder,
				context: { requestId: active.requestId, range: OffsetRange.fromTo(prepared.start, prepared.endExclusive) },
			});
			this.#widget.focusAndSelect();
		} catch (error) {
			if (!this.#disposed && this.#active === active) {
				this.#status.set(error instanceof Error ? error.message : String(error), undefined);
			}
		}

	}

	cancel(): void {
		const active = this.#active;
		this.#active = undefined;
		this.#status.set(undefined, undefined);
		this.#rename.cancel();
		if (active) {
			this.#cancelRemote(active.requestId);
		}
	}

	#cancelRemote(requestId: number): void {
		void this.#host.cancelRename({ requestId }).catch(error => {
			if (!this.#disposed) { console.error('Markdown editor cancel rename failed', error); }
		});
	}

	override dispose(): void {
		this.#disposed = true;
		this.cancel();
		super.dispose();
	}
}

interface RenameContext {
	readonly requestId: number;
	readonly range: OffsetRange;
}
