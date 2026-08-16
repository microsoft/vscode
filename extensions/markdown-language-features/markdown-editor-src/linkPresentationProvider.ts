/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	ILinkPresentation,
	ILinkPresentationProvider,
	LinkPresentation,
	LinkPresentationKind,
	LinkPresentationStatusKind,
} from '@vscode/markdown-editor';
import { Disposable, observableValue, type ISettableObservable } from '@vscode/observables';

interface LinkPresentationEntry {
	readonly presentation: ISettableObservable<WebviewLinkPresentation | undefined>;
	references: number;
}

type WebviewLinkPresentation = LinkPresentation & { readonly isLoading?: boolean };

export class WebviewLinkPresentationProvider extends Disposable implements ILinkPresentationProvider {
	readonly #entries = new Map<string, LinkPresentationEntry>();
	readonly #rules: readonly { id: string; uriPattern: RegExp; initialKind: LinkPresentationKind }[];
	readonly #postMessage: (message: unknown) => void;
	#syncScheduled = false;

	constructor(
		rules: readonly { id: string; source: string; flags: string; initialKind: LinkPresentationKind }[],
		postMessage: (message: unknown) => void,
	) {
		super();
		this.#rules = rules.map(rule => ({
			id: rule.id,
			uriPattern: new RegExp(rule.source, rule.flags),
			initialKind: rule.initialKind,
		}));
		this.#postMessage = postMessage;
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
					kind: rule.initialKind,
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

	handleMessage(message: unknown): boolean {
		if (!isRecord(message) || message.type !== 'richLinkPresentations' || !Array.isArray(message.presentations)) {
			return false;
		}
		for (const value of message.presentations) {
			if (!isRecord(value) || typeof value.href !== 'string') {
				continue;
			}
			const entry = this.#entries.get(value.href);
			if (!entry) {
				continue;
			}
			entry.presentation.set(readLinkPresentation(value.presentation), undefined);
		}
		return true;
	}

	override dispose(): void {
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
			this.#postMessage({ type: 'richLinkTargets', hrefs: [...this.#entries.keys()] });
		});
	}
}

function matchesRule(rule: RegExp, value: string): boolean {
	rule.lastIndex = 0;
	return rule.test(value);
}

function readLinkPresentation(value: unknown): WebviewLinkPresentation | undefined {
	if (!isRecord(value) || !isLinkPresentationKind(value.kind)) {
		return undefined;
	}
	const title = typeof value.title === 'string' ? value.title : undefined;
	const detail = typeof value.detail === 'string' ? value.detail : undefined;
	const reference = typeof value.reference === 'string' ? value.reference : undefined;
	const tooltip = typeof value.tooltip === 'string' ? value.tooltip : undefined;
	const ariaLabel = typeof value.ariaLabel === 'string' ? value.ariaLabel : undefined;
	const status = readStatus(value.status);
	const secondaryStatus = readStatus(value.secondaryStatus);
	const isLoading = value.isLoading === true;
	return {
		kind: value.kind,
		...(title ? { title } : {}),
		...(detail ? { detail } : {}),
		...(reference ? { reference } : {}),
		...(status ? { status } : {}),
		...(secondaryStatus ? { secondaryStatus } : {}),
		...(tooltip ? { tooltip } : {}),
		...(ariaLabel ? { ariaLabel } : {}),
		...(isLoading ? { isLoading: true } : {}),
	};
}

function readStatus(value: unknown): LinkPresentation['status'] {
	return isRecord(value) && isStatusKind(value.kind) && typeof value.label === 'string'
		? { kind: value.kind, label: value.label }
		: undefined;
}

function isLinkPresentationKind(value: unknown): value is LinkPresentationKind {
	return value === 'resource'
		|| value === 'issue'
		|| value === 'pullRequest'
		|| value === 'commit'
		|| value === 'file'
		|| value === 'folder'
		|| value === 'session'
		|| value === 'repository'
		|| value === 'branch';
}

function isStatusKind(value: unknown): value is LinkPresentationStatusKind {
	return value === 'neutral'
		|| value === 'pending'
		|| value === 'success'
		|| value === 'warning'
		|| value === 'error'
		|| value === 'open'
		|| value === 'closed'
		|| value === 'merged'
		|| value === 'draft'
		|| value === 'notPlanned';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
