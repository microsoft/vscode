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
import type { RichLinkPresentationUpdate, RichLinkSubscriptions, MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';

interface LinkPresentationEntry {
	readonly href: string;
	readonly presentation: ISettableObservable<WebviewLinkPresentation | undefined>;
	references: number;
	subscriptionId?: string;
}

type WebviewLinkPresentation = LinkPresentation & { readonly isLoading?: boolean };

const idleCacheDurationMs = 5 * 60_000;
const idleCacheCapacity = 256;

export class WebviewLinkPresentationProvider extends Disposable implements ILinkPresentationProvider {
	readonly #entries = new Map<string, LinkPresentationEntry>();
	readonly #inactive = new Map<string, number>();
	readonly #subscriptions = new Map<string, LinkPresentationEntry>();
	readonly #pending = new Set<LinkPresentationEntry>();
	readonly #rules: readonly { id: string; uriPattern: RegExp; kind: LinkPresentationKind }[];
	readonly #host: Pick<MarkdownEditorHost, 'richLinkSubscriptions'>;
	#syncScheduled = false;
	#disposed = false;
	#cacheTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		rules: readonly { id: string; source: string; flags: string; kind: LinkPresentationKind }[],
		host: Pick<MarkdownEditorHost, 'richLinkSubscriptions'>,
	) {
		super();
		this.#rules = rules.map(rule => ({
			id: rule.id,
			uriPattern: new RegExp(rule.source, rule.flags),
			kind: rule.kind,
		}));
		this.#host = host;
	}

	createLinkPresentation(url: string): ILinkPresentation | undefined {
		if (this.#disposed) {
			throw new Error('Link presentation provider is disposed');
		}
		const rule = this.#rules.find(rule => matchesRule(rule.uriPattern, url));
		if (!rule) {
			return undefined;
		}

		const expiresAt = this.#inactive.get(url);
		if (expiresAt !== undefined && expiresAt <= Date.now()) {
			this.#pruneCache();
		}
		let entry = this.#entries.get(url);
		if (!entry) {
			entry = {
				href: url,
				presentation: observableValue(`linkPresentation:${url}`, {
					kind: rule.kind,
					isLoading: true,
				}),
				references: 0,
			};
			this.#entries.set(url, entry);
		}
		if (entry.references++ === 0) {
			this.#inactive.delete(url);
			this.#scheduleSubscriptions(entry);
		}

		let disposed = false;
		return {
			presentation: entry.presentation,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				if (--entry.references === 0 && !this.#disposed) {
					this.#scheduleSubscriptions(entry);
				}
			},
		};
	}

	updatePresentations(presentations: readonly RichLinkPresentationUpdate[]): void {
		for (const value of presentations) {
			const entry = this.#subscriptions.get(value.subscriptionId);
			if (!entry) {
				continue;
			}
			entry.presentation.set(value.presentation?.isLoading
				? { ...entry.presentation.get(), ...value.presentation }
				: value.presentation, undefined);
		}
	}

	override dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		if (this.#cacheTimer !== undefined) {
			clearTimeout(this.#cacheTimer);
		}
		if (this.#subscriptions.size) {
			this.#host.richLinkSubscriptions({ subscribe: [], unsubscribe: [...this.#subscriptions.keys()] });
		}
		this.#subscriptions.clear();
		this.#pending.clear();
		this.#inactive.clear();
		this.#entries.clear();
		super.dispose();
	}

	#scheduleSubscriptions(entry: LinkPresentationEntry): void {
		this.#pending.add(entry);
		if (this.#syncScheduled) {
			return;
		}
		this.#syncScheduled = true;
		queueMicrotask(() => {
			this.#syncScheduled = false;
			if (this.#disposed) {
				return;
			}
			const subscribe: RichLinkSubscriptions['subscribe'][number][] = [];
			const unsubscribe: string[] = [];
			for (const entry of this.#pending) {
				if (entry.references > 0) {
					if (!entry.subscriptionId) {
						entry.subscriptionId = crypto.randomUUID();
						this.#subscriptions.set(entry.subscriptionId, entry);
						subscribe.push({ subscriptionId: entry.subscriptionId, href: entry.href });
					}
				} else {
					if (entry.subscriptionId) {
						unsubscribe.push(entry.subscriptionId);
						this.#subscriptions.delete(entry.subscriptionId);
						entry.subscriptionId = undefined;
					}
					this.#inactive.set(entry.href, Date.now() + idleCacheDurationMs);
				}
			}
			this.#pending.clear();
			this.#pruneCache();
			if (subscribe.length || unsubscribe.length) {
				this.#host.richLinkSubscriptions({ subscribe, unsubscribe });
			}
		});
	}

	#pruneCache(): void {
		if (this.#cacheTimer !== undefined) {
			clearTimeout(this.#cacheTimer);
			this.#cacheTimer = undefined;
		}
		const now = Date.now();
		for (const [href, expiresAt] of this.#inactive) {
			if (expiresAt > now && this.#inactive.size <= idleCacheCapacity) {
				this.#cacheTimer = setTimeout(() => {
					this.#cacheTimer = undefined;
					this.#pruneCache();
				}, expiresAt - now);
				break;
			}
			this.#inactive.delete(href);
			this.#entries.delete(href);
		}
	}
}

function matchesRule(rule: RegExp, value: string): boolean {
	rule.lastIndex = 0;
	return rule.test(value);
}
