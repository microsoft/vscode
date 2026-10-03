/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	ILinkPresentation,
	ILinkPresentationProvider,
	LinkPresentation,
	LinkPresentationKind,
} from '@vscode/markdown-editor';
import { Disposable, observableValue, type ISettableObservable } from '@vscode/observables';
import type { RichLinkPresentationUpdate, MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';

interface LinkPresentationEntry {
	readonly presentation: ISettableObservable<WebviewLinkPresentation | undefined>;
	references: number;
}

type WebviewLinkPresentation = LinkPresentation & { readonly isLoading?: boolean };

export class WebviewLinkPresentationProvider extends Disposable implements ILinkPresentationProvider {
	readonly #entries = new Map<string, LinkPresentationEntry>();
	readonly #rules: readonly { id: string; uriPattern: RegExp; kind: LinkPresentationKind }[];
	readonly #syncTargets: (hrefs: string[]) => Promise<void>;
	#syncScheduled = false;
	#disposed = false;

	constructor(
		rules: readonly { id: string; source: string; flags: string; kind: LinkPresentationKind }[],
		host: Pick<MarkdownEditorHost, 'richLinkTargets'>,
	) {
		super();
		this.#rules = rules.map(rule => ({
			id: rule.id,
			uriPattern: new RegExp(rule.source, rule.flags),
			kind: rule.kind,
		}));
		this.#syncTargets = hrefs => host.richLinkTargets({ hrefs });
	}

	createLinkPresentation(url: string): ILinkPresentation | undefined {
		const rule = this.#rules.find(rule => matchesRule(rule.uriPattern, url));
		if (!rule) {
			return undefined;
		}

		let entry = this.#entries.get(url);
		if (!entry) {
			entry = {
				presentation: observableValue(`linkPresentation:${url}`, {
					kind: rule.kind,
					isLoading: true,
				}),
				references: 0,
			};
			this.#entries.set(url, entry);
		}
		entry.references++;
		this.#scheduleTargetSync();

		let disposed = false;
		return {
			presentation: entry.presentation,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				this.#release(url, entry);
			},
		};
	}

	updatePresentations(presentations: readonly RichLinkPresentationUpdate[]): void {
		for (const value of presentations) {
			const entry = this.#entries.get(value.href);
			if (!entry) {
				continue;
			}
			entry.presentation.set(value.presentation, undefined);
		}
	}

	override dispose(): void {
		this.#disposed = true;
		this.#entries.clear();
		super.dispose();
	}

	#release(url: string, entry: LinkPresentationEntry): void {
		entry.references--;
		if (entry.references === 0 && this.#entries.get(url) === entry) {
			this.#entries.delete(url);
			this.#scheduleTargetSync();
		}
	}

	#scheduleTargetSync(): void {
		if (this.#syncScheduled) {
			return;
		}
		this.#syncScheduled = true;
		queueMicrotask(() => {
			this.#syncScheduled = false;
			if (this.#disposed) {
				return;
			}
			void this.#syncTargets([...this.#entries.keys()]).catch(error => {
				if (!this.#disposed) {
					console.error('Markdown editor rich link target synchronization failed', error);
				}
			});
		});
	}
}

function matchesRule(rule: RegExp, value: string): boolean {
	rule.lastIndex = 0;
	return rule.test(value);
}
