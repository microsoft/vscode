/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	EditorController,
	EditorModel,
	EditorView,
	StringEdit,
	StringValue,
	findNodeOffsetById,
	taskCheckboxRange,
} from '@vscode/markdown-editor';
// The `@vscode/markdown-editor` typings re-export observables from
// `@vscode/observables`, which is not installed (the runtime is bundled via the
// `observables` subpath). Ignore the resulting type errors until the package
// ships self-contained typings.
// @ts-ignore
import { autorun } from '@vscode/markdown-editor/observables';
import { WebviewSyntaxHighlighter } from './syntaxHighlighter';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import '@vscode/markdown-editor/editor.css';
import '@vscode/markdown-editor/themes/github.css';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

let mermaidCounter = 0;

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const syntaxHighlighter = new WebviewSyntaxHighlighter((message) => vscode.postMessage(message));

interface EditorInstance {
	readonly model: EditorModel;
	isUpdatingFromExtension: boolean;
}

function createEditor(
	host: HTMLElement,
	content: string,
	options: { readonly readonly: boolean; readonly onEdit?: (text: string) => void }
): EditorInstance {
	const model = new EditorModel();
	model.sourceText.set(new StringValue(content), undefined);

	const instance: EditorInstance = {
		model,
		isUpdatingFromExtension: false,
	};

	const view = new EditorView(model, {
		classNames: ['github-markdown-theme'],
		syntaxHighlighter,
		onToggleCheckbox(item, newChecked) {
			if (options.readonly) {
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
		renderCustomCodeBlock(language, content) {
			if (language !== 'mermaid') {
				return undefined;
			}
			const div = document.createElement('div');
			div.className = 'md-mermaid';
			const id = `mermaid-${mermaidCounter++}`;
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
	});
	new EditorController(model, view);
	host.appendChild(view.element);

	if (!options.readonly && options.onEdit) {
		const onEdit = options.onEdit;
		autorun((reader: any) => {
			const text = reader.readObservable(model.sourceText).value;
			if (!instance.isUpdatingFromExtension) {
				onEdit(text);
			}
		});
	}

	return instance;
}

let single: EditorInstance | undefined;
const diff: { original?: EditorInstance; modified?: EditorInstance } = {};

window.addEventListener('message', (event) => {
	const message = event.data;
	if (syntaxHighlighter.handleMessage(message)) {
		return;
	}
	switch (message.type) {
		case 'init': {
			const host = document.getElementById('editor')!;
			single = createEditor(host, message.content, {
				readonly: !!message.readonly,
				onEdit: (text) => vscode.postMessage({ type: 'edit', content: text }),
			});
			break;
		}
		case 'init-diff': {
			diff.original = createEditor(
				document.getElementById('editor-original')!,
				message.original,
				{ readonly: true }
			);
			diff.modified = createEditor(
				document.getElementById('editor-modified')!,
				message.modified,
				{ readonly: true }
			);
			break;
		}
		case 'update': {
			const target = message.side === 'original'
				? diff.original
				: message.side === 'modified'
					? diff.modified
					: single;
			if (!target) {
				return;
			}
			target.isUpdatingFromExtension = true;
			target.model.sourceText.set(new StringValue(message.content), undefined);
			target.isUpdatingFromExtension = false;
			break;
		}
	}
});

vscode.postMessage({ type: 'ready' });
