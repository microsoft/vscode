/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentation as MarkdownLinkPresentation } from '@vscode/markdown-editor';
import { derived, observableValue, type IObservable, type ISettableObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import type { ILogger } from '../../logging';

const cacheLifetimeMs = 60_000;
const persistentCacheLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const persistentCacheEntryLimit = 100;
const persistentCacheKey = 'markdown.linkPresentations.cache.v1';

export type LinkPresentation = MarkdownLinkPresentation & {
	readonly isLoading?: boolean;
};

export interface LinkPresentationResolver extends vscode.Disposable {
	readonly refreshOnInterval: boolean;

	resolve(href: string, context: LinkPresentationResolverContext): IObservable<LinkPresentation> | undefined;
	open?(href: string): Promise<boolean>;
}

export interface LinkPresentationResolverContext {
	readonly onDidRequestRefresh: vscode.Event<void>;
	readonly logger: ILogger;
}

export function decodeUrlPathSegments(uri: URL): string[] | undefined {
	try {
		return uri.pathname.split('/').filter(Boolean).map(decodeURIComponent);
	} catch {
		return undefined;
	}
}

interface LinkPresentationCacheEntry {
	readonly value: Promise<LinkPresentation>;
	readonly expiresAt: number;
}

interface PersistedLinkPresentationCacheEntry {
	readonly href: string;
	readonly presentation: LinkPresentation;
	readonly storedAt: number;
}

export class LinkPresentationCache {
	readonly #entries = new Map<string, LinkPresentationCacheEntry>();
	readonly #persistentEntries = new Map<string, PersistedLinkPresentationCacheEntry>();
	readonly #storage: vscode.Memento | undefined;
	readonly #logger: ILogger | undefined;
	#writeQueue = Promise.resolve();
	#generation = 0;

	constructor(storage?: vscode.Memento, logger?: ILogger) {
		this.#storage = storage;
		this.#logger = logger;
		for (const entry of readPersistentLinkPresentationCache(storage?.get(persistentCacheKey))) {
			this.#persistentEntries.set(entry.href, entry);
		}
	}

	getPersisted(href: string, now = Date.now()): LinkPresentation | undefined {
		const entry = this.#persistentEntries.get(href);
		if (!entry) {
			return undefined;
		}
		if (entry.storedAt + persistentCacheLifetimeMs <= now) {
			this.#persistentEntries.delete(href);
			this.#persist();
			return undefined;
		}
		return { ...entry.presentation, isLoading: true };
	}

	get(
		href: string,
		resolve: () => Promise<LinkPresentation>,
		now = Date.now(),
	): Promise<LinkPresentation> {
		this.#removeExpiredMemoryEntries(now);
		const cached = this.#entries.get(href);
		if (cached) {
			return cached.value;
		}

		const value = resolve();
		const entry = { value, expiresAt: now + cacheLifetimeMs };
		const generation = this.#generation;
		this.#entries.set(href, entry);
		void value.then(presentation => {
			if (generation !== this.#generation) {
				return;
			}
			this.#persistentEntries.set(href, {
				href,
				presentation: { ...presentation, isLoading: undefined },
				storedAt: Date.now(),
			});
			this.#trimPersistentEntries();
			this.#persist();
		}, () => {
			if (this.#entries.get(href) === entry) {
				this.#entries.delete(href);
			}
		});
		return value;
	}

	clear(): void {
		this.#generation++;
		this.#entries.clear();
		this.#persistentEntries.clear();
		this.#persist();
	}

	#removeExpiredMemoryEntries(now: number): void {
		for (const [key, entry] of this.#entries) {
			if (entry.expiresAt <= now) {
				this.#entries.delete(key);
			}
		}
	}

	#trimPersistentEntries(): void {
		const entries = [...this.#persistentEntries.values()].sort((a, b) => b.storedAt - a.storedAt);
		this.#persistentEntries.clear();
		for (const entry of entries.slice(0, persistentCacheEntryLimit)) {
			this.#persistentEntries.set(entry.href, entry);
		}
	}

	#persist(): void {
		const storage = this.#storage;
		if (!storage) {
			return;
		}
		const value = {
			version: 1,
			entries: [...this.#persistentEntries.values()],
		};
		this.#writeQueue = this.#writeQueue.then(() => storage.update(persistentCacheKey, value)).then(undefined, error => {
			this.#logger?.trace('Markdown rich link', 'Failed to persist link presentation cache', error);
		});
	}
}

export class ImmutableLinkPresentationCache {
	readonly #entries = new Map<string, Promise<LinkPresentation>>();

	get(href: string, resolve: () => Promise<LinkPresentation>): Promise<LinkPresentation> {
		const cached = this.#entries.get(href);
		if (cached) {
			return cached;
		}

		const value = resolve();
		this.#entries.set(href, value);
		void value.catch(() => {
			if (this.#entries.get(href) === value) {
				this.#entries.delete(href);
			}
		});
		return value;
	}
}

export function createAsyncLinkPresentation(
	href: string,
	initialPresentation: LinkPresentation,
	context: LinkPresentationResolverContext,
	resolve: () => Promise<LinkPresentation>,
	getFailurePresentation: (error: unknown) => LinkPresentation,
	onDidRequestRefresh: readonly vscode.Event<void>[] = [context.onDidRequestRefresh],
	resetOnRefresh?: { readonly event: vscode.Event<void>; readonly presentation: LinkPresentation },
): IObservable<LinkPresentation> {
	return derived(reader => reader.store.add(new AsyncLinkPresentation(
		href,
		initialPresentation,
		context,
		resolve,
		getFailurePresentation,
		onDidRequestRefresh,
		resetOnRefresh,
	))).map((value, reader) => value.presentation.read(reader));
}

class AsyncLinkPresentation implements vscode.Disposable {
	readonly presentation: ISettableObservable<LinkPresentation>;
	readonly #subscriptions: vscode.Disposable;
	readonly #resolve: () => Promise<LinkPresentation>;
	readonly #getFailurePresentation: (error: unknown) => LinkPresentation;
	readonly #context: LinkPresentationResolverContext;
	readonly #href: string;
	#generation = 0;

	constructor(
		href: string,
		initialPresentation: LinkPresentation,
		context: LinkPresentationResolverContext,
		resolve: () => Promise<LinkPresentation>,
		getFailurePresentation: (error: unknown) => LinkPresentation,
		onDidRequestRefresh: readonly vscode.Event<void>[],
		resetOnRefresh: { readonly event: vscode.Event<void>; readonly presentation: LinkPresentation } | undefined,
	) {
		this.#href = href;
		this.#context = context;
		this.#resolve = resolve;
		this.#getFailurePresentation = getFailurePresentation;
		this.presentation = observableValue(`linkPresentation:${href}`, initialPresentation);
		this.#subscriptions = vscode.Disposable.from(
			...onDidRequestRefresh.map(event => event(() => this.#refresh())),
			...(resetOnRefresh ? [resetOnRefresh.event(() => {
				this.presentation.set(resetOnRefresh.presentation, undefined);
				this.#refresh();
			})] : []),
		);
		this.#refresh();
	}

	dispose(): void {
		this.#generation++;
		this.#subscriptions.dispose();
	}

	#refresh(): void {
		const currentGeneration = ++this.#generation;
		void this.#resolve().then(value => {
			if (currentGeneration === this.#generation) {
				this.presentation.set({ ...value, isLoading: undefined }, undefined);
			}
		}, error => {
			if (currentGeneration === this.#generation) {
				this.#context.logger.trace('Markdown rich link', `Failed to resolve ${this.#href}`, error);
				if (this.presentation.get().status?.kind === 'pending') {
					this.presentation.set(this.#getFailurePresentation(error), undefined);
				}
			}
		});
	}
}

function readPersistentLinkPresentationCache(value: unknown): readonly PersistedLinkPresentationCacheEntry[] {
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
		return [];
	}
	return value.entries.flatMap(entry => {
		if (!isRecord(entry) || typeof entry.href !== 'string' || typeof entry.storedAt !== 'number') {
			return [];
		}
		const presentation = readLinkPresentation(entry.presentation);
		return presentation ? [{ href: entry.href, presentation, storedAt: entry.storedAt }] : [];
	});
}

function readLinkPresentation(value: unknown): LinkPresentation | undefined {
	if (!isRecord(value) || !isLinkPresentationKind(value.kind)) {
		return undefined;
	}
	const status = readLinkPresentationStatus(value.status);
	const secondaryStatus = readLinkPresentationStatus(value.secondaryStatus);
	if ((value.status !== undefined && !status) || (value.secondaryStatus !== undefined && !secondaryStatus)) {
		return undefined;
	}
	return {
		kind: value.kind,
		...(typeof value.title === 'string' ? { title: value.title } : {}),
		...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
		...(typeof value.reference === 'string' ? { reference: value.reference } : {}),
		...(status ? { status } : {}),
		...(secondaryStatus ? { secondaryStatus } : {}),
		...(typeof value.tooltip === 'string' ? { tooltip: value.tooltip } : {}),
		...(typeof value.ariaLabel === 'string' ? { ariaLabel: value.ariaLabel } : {}),
	};
}

function readLinkPresentationStatus(value: unknown): MarkdownLinkPresentation['status'] | undefined {
	return isRecord(value) && isLinkPresentationStatusKind(value.kind) && typeof value.label === 'string'
		? { kind: value.kind, label: value.label }
		: undefined;
}

function isLinkPresentationKind(value: unknown): value is LinkPresentation['kind'] {
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

function isLinkPresentationStatusKind(value: unknown): value is NonNullable<MarkdownLinkPresentation['status']>['kind'] {
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
