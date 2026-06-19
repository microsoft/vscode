/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorController, EditorModel, EditorView, StringEdit, StringValue, findNodeOffsetById, taskCheckboxRange } from '@vscode/markdown-editor';
import { Disposable, autorun } from '@vscode/markdown-editor/observables';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import '@vscode/markdown-editor/editor.css';
import '@vscode/markdown-editor/themes/github.css';
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
	#mermaidCounter = 0;
	#initialized = false;

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
			}
		});

		this.#vscode.postMessage({ type: 'ready' });
	}

	#createView(host: HTMLElement, readonly: boolean): void {
		const model = this.model;

		const view = this._register(new EditorView(model, {
			classNames: ['github-markdown-theme'],
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

		if (!readonly) {
			this._register(autorun((reader) => {
				const text = reader.readObservable(this.model.sourceText).value;
				if (!this.isUpdatingFromExtension) {
					this.#vscode.postMessage({ type: 'edit', content: text });
				}
			}));
		}
	}
}

new Editor(document.getElementById('editor')!);
