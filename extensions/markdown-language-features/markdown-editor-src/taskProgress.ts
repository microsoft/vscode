/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ListItemAstNode, type AstNode, type EditorModel } from '@vscode/markdown-editor';
import type { IframeEmbeddedEditorHostTransport, IframeEmbeddedEditorProvider } from '@vscode/markdown-editor/web-editors';
import { autorun, derived, type IObservable } from '@vscode/observables';
import type { TaskProgressMessage } from './taskProgressProtocol';
import type { TaskProgressLabels } from '../src/preview/webviewInitialState';

interface TaskProgressCounts {
	readonly checked: number;
	readonly total: number;
}

export function createTaskProgressProvider(model: EditorModel, html: string, labels: TaskProgressLabels): IframeEmbeddedEditorProvider {
	const counts = derived(reader => countTasks(model.document.read(reader)));
	return {
		id: 'vscode.markdown.taskProgress',
		selector: { language: 'widget:task-progress' },
		resolve: async () => ({
			html,
			runtimeKey: 'vscode.markdown.taskProgress',
			hostTransport: true,
			initialHeight: 88,
		}),
		createHostTransport: () => new TaskProgressHostTransport(counts, labels),
	};
}

export function countTasks(document: AstNode): TaskProgressCounts {
	let checked = 0;
	let total = 0;
	const pending = [document];
	while (pending.length) {
		const node = pending.pop()!;
		if (node instanceof ListItemAstNode && node.checked !== undefined) {
			total++;
			if (node.checked) {
				checked++;
			}
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return { checked, total };
}

class TaskProgressHostTransport implements IframeEmbeddedEditorHostTransport {
	readonly #_listeners = new Set<(message: unknown) => void>();
	readonly #_subscription;
	readonly #_labels: TaskProgressLabels;
	#_counts: TaskProgressCounts = { checked: 0, total: 0 };
	#_ready = false;
	#_disposed = false;

	constructor(counts: IObservable<TaskProgressCounts>, labels: TaskProgressLabels) {
		this.#_labels = labels;
		this.#_subscription = autorun(reader => {
			const next = counts.read(reader);
			const changed = next.checked !== this.#_counts.checked || next.total !== this.#_counts.total;
			this.#_counts = next;
			if (changed && this.#_ready) {
				this.#_publish();
			}
		});
	}

	readonly onMessage: IframeEmbeddedEditorHostTransport['onMessage'] = listener => {
		if (!this.#_disposed) {
			this.#_listeners.add(listener);
		}
		return { dispose: () => this.#_listeners.delete(listener) };
	};

	sendMessage(message: unknown): void {
		if (!this.#_disposed && typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'ready') {
			this.#_ready = true;
			this.#_publish();
		}
	}

	#_publish(): void {
		const numbers = new Intl.NumberFormat(this.#_labels.language);
		const message: TaskProgressMessage = {
			type: 'taskProgress',
			...this.#_counts,
			title: this.#_labels.title,
			label: this.#_labels.summary.replace(/\{([01])\}/g, (_, index: string) =>
				numbers.format(index === '0' ? this.#_counts.checked : this.#_counts.total)),
			language: this.#_labels.language,
		};
		for (const listener of this.#_listeners) {
			listener(message);
		}
	}

	dispose(): void {
		if (!this.#_disposed) {
			this.#_disposed = true;
			this.#_subscription.dispose();
			this.#_listeners.clear();
		}
	}
}
