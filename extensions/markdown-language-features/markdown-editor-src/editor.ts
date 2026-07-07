/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentModeController, CommentsModel, EditorController, EditorModel, EditorView, GutterMarker, OffsetRange, StringEdit, StringValue, VsCodeV2CommentsView, findNodeOffsetById, taskCheckboxRange } from '@vscode/markdown-editor';
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
						this.#createView(host, !!message.readonly);
						this.model.sourceText.set(new StringValue(message.content), undefined);
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

	#createView(host: HTMLElement, readonly: boolean): void {
		const model = this.model;

		const view = this._register(new EditorView(model, {
			classNames: ['md-theme-vscode-default'],
			syntaxHighlighter: this.#syntaxHighlighter,
			onToggleCheckbox: (item, newChecked) => {
				if (readonly) {
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

		if (!readonly) {
			let firstTime = true;
			this._register(autorun((reader) => {
				const text = reader.readObservable(this.model.sourceText).value;
				if (!this.isUpdatingFromExtension && !firstTime) {
					this.#vscode.postMessage({ type: 'edit', content: text });
				}
				firstTime = false;
			}));
		}
	}
}

new Editor(document.getElementById('editor')!);
