/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel, EditorView, OffsetRange } from '@vscode/markdown-editor';
import { Disposable, autorun, observableValue } from '@vscode/observables';
import type { MarkdownDiagnostic, MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';
import './languageFeatures.css';

export class DiagnosticsController extends Disposable {
	readonly #items = observableValue<readonly MarkdownDiagnostic[]>('markdownDiagnostics', []);
	#request = 0;
	#disposed = false;
	readonly #refresh: () => Promise<void>;

	constructor(editor: EditorModel, view: EditorView, host: MarkdownEditorHost, epoch: () => number) {
		super();
		const layer = document.createElement('div');
		layer.className = 'md-diagnostics-layer';
		layer.setAttribute('aria-hidden', 'true');
		this._register(view.mountOverlay(layer, 'above-decorations'));
		const status = document.createElement('div');
		status.className = 'md-language-status';
		status.setAttribute('role', 'status');
		status.hidden = true;
		this._register(view.mountOverlay(status, 'above-decorations'));
		this.#refresh = async () => {
			const request = ++this.#request;
			const source = editor.sourceText.get().value;
			try {
				const result = await host.getDiagnostics({});
				if (this.#disposed || request !== this.#request || source !== editor.sourceText.get().value || epoch() !== result.editEpoch) { return; }
				this.#items.set(result.items, undefined);
				status.hidden = true;
			} catch (error) {
				if (!this.#disposed && request === this.#request) {
					status.textContent = `Could not load diagnostics: ${error instanceof Error ? error.message : String(error)}`;
					status.hidden = false;
				}
			}
		};
		this._register(autorun(reader => {
			editor.sourceText.read(reader);
			this.#items.set([], undefined);
			void this.refresh();
		}));
		const originalTitle = view.element.title;
		this._register(autorun(reader => {
			view.element.title = originalTitle;
			const marks: HTMLElement[] = [];
			const map = view.measuredLayout.visualLineMap.read(reader);
			for (const item of this.#items.read(reader)) {
				const point = item.start === item.endExclusive && !map.isEmpty ? map.lineRect(map.lineIndexOfOffset(item.start)) : undefined;
				const rects = point
					? [{ x: map.xAtOffset(item.start), y: point.y, width: point.height * 0.4, height: point.height }]
					: view.rangeRects(OffsetRange.fromTo(item.start, item.endExclusive)).read(reader);
				for (const rect of item.severity === 'hint' ? rects.slice(0, 1) : rects) {
					const mark = document.createElement('div');
					mark.className = `md-diagnostic md-diagnostic-${item.severity}`;
					mark.dataset.message = `${item.source ? `${item.source}: ` : ''}${item.message}${item.code ? ` (${item.code})` : ''}`;
					mark.dataset.lineHeight = String(rect.height);
					mark.style.left = `${rect.x}px`;
					mark.style.top = `${rect.y + rect.height - 3}px`;
					mark.style.width = `${item.severity === 'hint' ? 12 : Math.max(4, rect.width)}px`;
					marks.push(mark);
				}
			}
			layer.replaceChildren(...marks);
		}));
		const mousemove = (event: MouseEvent): void => {
			const messages = [...layer.children].flatMap(child => {
				const rect = child.getBoundingClientRect();
				return child instanceof HTMLElement && event.clientX >= rect.left && event.clientX <= rect.right
					&& event.clientY >= rect.bottom - Number(child.dataset.lineHeight) && event.clientY <= rect.bottom + 3 ? [child.dataset.message] : [];
			});
			view.element.title = messages.length ? [...new Set(messages)].join('\n') : originalTitle;
		};
		const mouseleave = (): void => { view.element.title = originalTitle; };
		view.element.addEventListener('mousemove', mousemove);
		view.element.addEventListener('mouseleave', mouseleave);
		this._register({
			dispose: () => {
				view.element.removeEventListener('mousemove', mousemove);
				view.element.removeEventListener('mouseleave', mouseleave);
				view.element.title = originalTitle;
			}
		});
	}

	refresh(): Promise<void> { return this.#refresh(); }

	override dispose(): void {
		this.#disposed = true;
		super.dispose();
	}
}
