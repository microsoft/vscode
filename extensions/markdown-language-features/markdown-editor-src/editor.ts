/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentModeController, CommentsModel, EditorController, EditorModel, EditorView, GutterMarker, OffsetRange, Selection, StringEdit, StringValue, VsCodeV2CommentsView, findNodeOffsetById, taskCheckboxRange } from '@vscode/markdown-editor';
import { Disposable, autorun } from '@vscode/markdown-editor/observables';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import '@vscode/markdown-editor/editor.css';
import '@vscode/markdown-editor/themes/vscode-default.css';
import '@vscode/markdown-editor/commentInput.css';
import '@vscode/markdown-editor/vscodeCommentWidgetV2.css';
import './markdownEditor.css';
import { WebviewSyntaxHighlighter } from './syntaxHighlighter';

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/**
 * The editor's view state, persisted as webview state (`getState`/`setState`) so
 * the scroll and cursor position are restored when the webview is reloaded or the
 * custom editor is re-created (e.g. after switching sessions and back).
 */
interface PersistedViewState {
	scrollTop?: number;
	selection?: { anchor: number; active: number };
}

class Editor extends Disposable {
	readonly model = new EditorModel();
	isUpdatingFromExtension = false;
	#isUpdatingComments = false;
	#mermaidCounter = 0;
	#initialized = false;

	readonly #comments = new CommentsModel();
	readonly #vscode = acquireVsCodeApi();
	readonly #syntaxHighlighter = new WebviewSyntaxHighlighter((message) => this.#vscode.postMessage(message));

	constructor(host: HTMLElement) {
		super();

		mermaid.initialize({ startOnLoad: false, theme: 'default' });

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (this.#syntaxHighlighter.handleMessage(message)) {
				return;
			}
			switch (message.type) {
				case 'init': {
					if (!this.#initialized) {
						this.#initialized = true;
						this.#createView(host, !!message.readonly, message.content);
					}
					break;
				}
				case 'update': {
					this.isUpdatingFromExtension = true;
					this.model.sourceText.set(new StringValue(message.content), undefined);
					this.isUpdatingFromExtension = false;
					break;
				}
				case 'gutterMarkers': {
					const markers: GutterMarker[] = message.markers.map((marker: { start: number; endExclusive: number; type: GutterMarker['type'] }) => ({
						range: OffsetRange.fromTo(marker.start, marker.endExclusive),
						type: marker.type,
					}));
					this.model.gutterMarkers.set(markers, undefined);
					break;
				}
				case 'comments': {
					this.#isUpdatingComments = true;
					this.#comments.set(message.comments.map((comment: { id: string; start: number; endExclusive: number; body: string; author?: string }) => ({
						id: comment.id,
						range: OffsetRange.fromTo(comment.start, comment.endExclusive),
						body: comment.body,
						author: comment.author,
					})));
					this.#isUpdatingComments = false;
					break;
				}
			}
		});

		this.#vscode.postMessage({ type: 'ready' });
	}

	#createView(host: HTMLElement, readonly: boolean, content: string): void {
		const model = this.model;
		// The scroll + cursor position last persisted for this document, captured
		// before any listener below can overwrite it, so it survives the editor being
		// re-created (e.g. after a session switch).
		const savedViewState = this.#getViewState();

		// Start in the last globally chosen edit/read-only mode. The lock toggle in
		// the editor drives `readonlyMode` from here on; changes are persisted below.
		model.readonlyMode.set(readonly, undefined);

		const view = this._register(new EditorView(model, {
			classNames: ['md-theme-vscode-default'],
			syntaxHighlighter: this.#syntaxHighlighter,
			onToggleCheckbox: (item, newChecked) => {
				if (model.readonlyMode.get()) {
					return;
				}
				const doc = model.document.get();
				const itemOffset = findNodeOffsetById(doc, item);
				if (itemOffset === undefined) { return; }
				const range = taskCheckboxRange(item);
				if (!range) { return; }
				model.applyEdit(
					StringEdit.replace(
						range.delta(itemOffset),
						newChecked ? '[x]' : '[ ]'
					)
				);
			},
			renderCustomCodeBlock: (language, content) => {
				if (language !== 'mermaid') {
					return undefined;
				}
				const div = document.createElement('div');
				div.className = 'md-mermaid';
				const id = `mermaid-${this.#mermaidCounter++}`;
				mermaid
					.render(id, content)
					.then(({ svg }) => {
						div.innerHTML = svg;
					})
					.catch(() => {
						div.textContent = content;
					});
				return div;
			},
		}));

		this._register(new EditorController(model, view));
		host.appendChild(view.element);

		// Render comments as the VS Code V2 markdown cards. The card colours come
		// from the webview's own `--vscode-*` theme variables; `theme` only picks
		// the light/dark token wrapper. `resolveLine` maps a comment's start offset
		// to a 1-based line for the card header.
		const isLight = document.body.classList.contains('vscode-light');
		this._register(new VsCodeV2CommentsView(this.#comments, view, {
			theme: isLight ? 'light' : 'dark',
			resolveLine: (offset) => model.sourceText.get().value.slice(0, offset).split('\n').length,
		}));
		this._register(new CommentModeController(model, view, {
			onSubmit: ({ text, range }) => {
				this.#vscode.postMessage({ type: 'addComment', start: range.start, endExclusive: range.endExclusive, text });
			},
		}));

		// The comment card's delete button mutates the local CommentsModel
		// directly. Mirror those removals back to the extension so the shared
		// store (and the code editor) stay in sync. Removals coming from an
		// extension-driven update set `#isUpdatingComments`, so they are not
		// echoed back.
		let knownCommentIds = new Set(this.#comments.comments.get().map(comment => comment.id));
		this._register(autorun((reader) => {
			const currentIds = new Set(reader.readObservable(this.#comments.comments).map(comment => comment.id));
			if (!this.#isUpdatingComments) {
				for (const id of knownCommentIds) {
					if (!currentIds.has(id)) {
						this.#vscode.postMessage({ type: 'deleteComment', id });
					}
				}
			}
			knownCommentIds = currentIds;
		}));

		// Load the document content, then restore the persisted cursor so it lands on
		// the same text. Offsets are clamped defensively in case the document shifted.
		model.sourceText.set(new StringValue(content), undefined);
		if (savedViewState.selection) {
			const max = content.length;
			const anchor = Math.min(savedViewState.selection.anchor, max);
			const active = Math.min(savedViewState.selection.active, max);
			model.selection.set(new Selection(anchor, active), undefined);
		}

		// Persist scroll as webview state (throttled to a frame). Registered after the
		// restore above so it never clobbers the values we are about to restore.
		let scrollSaveScheduled = false;
		const saveScroll = (): void => {
			scrollSaveScheduled = false;
			this.#patchViewState({ scrollTop: host.scrollTop });
		};
		const onScroll = (): void => {
			if (scrollSaveScheduled) { return; }
			scrollSaveScheduled = true;
			requestAnimationFrame(saveScroll);
		};
		host.addEventListener('scroll', onScroll, { passive: true });
		this._register({ dispose: () => host.removeEventListener('scroll', onScroll) });

		// Flush the latest scroll synchronously before the webview is hidden or torn
		// down, since the frame-throttled save above may not have run yet.
		const onHide = (): void => {
			if (document.visibilityState === 'hidden') {
				this.#patchViewState({ scrollTop: host.scrollTop });
			}
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', saveScroll);
		this._register({ dispose: () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveScroll); } });

		// Persist the cursor whenever it moves.
		this._register(autorun((reader) => {
			const sel = reader.readObservable(this.model.selection);
			this.#patchViewState({ selection: sel ? { anchor: sel.anchor, active: sel.active } : undefined });
		}));

		// Persist the edit/read-only mode as the global default whenever the lock
		// toggle flips it, so the next Markdown editor opens in the same mode. The
		// initial (restored) value is skipped so opening an editor doesn't re-write it.
		let firstReadonly = true;
		this._register(autorun((reader) => {
			const isReadonly = reader.readObservable(this.model.readonlyMode);
			if (!firstReadonly) {
				this.#vscode.postMessage({ type: 'setReadonly', readonly: isReadonly });
			}
			firstReadonly = false;
		}));

		// Forward user edits to the extension. Edits are ignored by the model while
		// read-only, so this is a no-op in that mode; keeping it always registered
		// means unlocking a read-only editor immediately resumes edit forwarding.
		let firstTime = true;
		this._register(autorun((reader) => {
			const text = reader.readObservable(this.model.sourceText).value;
			if (!this.isUpdatingFromExtension && !firstTime) {
				this.#vscode.postMessage({ type: 'edit', content: text });
			}
			firstTime = false;
		}));

		// Restore scroll last: content height settles over a few frames (async parse,
		// syntax highlighting, mermaid), so re-apply until it sticks.
		// TODO@copilot: Consider using a more robust method for restoring scroll position, e.g. by waiting for the editor to stabilize
		this.#restoreScroll(host, savedViewState.scrollTop);
	}

	#getViewState(): PersistedViewState {
		return (this.#vscode.getState() as PersistedViewState | undefined) ?? {};
	}

	#patchViewState(patch: PersistedViewState): void {
		this.#vscode.setState({ ...this.#getViewState(), ...patch });
	}

	#restoreScroll(host: HTMLElement, scrollTop: number | undefined): void {
		if (typeof scrollTop !== 'number' || scrollTop <= 0) {
			return;
		}
		let tries = 0;
		const apply = (): void => {
			host.scrollTop = scrollTop;
			if (++tries < 6 && Math.abs(host.scrollTop - scrollTop) > 1) {
				requestAnimationFrame(apply);
			}
		};
		requestAnimationFrame(apply);
	}
}

new Editor(document.getElementById('editor')!);
