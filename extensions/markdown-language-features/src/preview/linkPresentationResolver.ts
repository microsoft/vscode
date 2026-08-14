/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentation } from '@vscode/markdown-editor';
import { derived, observableValue, type IObservable, type ISettableObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import type { ILogger } from '../logging';

const cacheLifetimeMs = 60_000;

export interface LinkPresentationResolver extends vscode.Disposable {
	readonly refreshOnInterval: boolean;

	resolve(href: string, context: LinkPresentationResolverContext): IObservable<LinkPresentation> | undefined;
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

export class LinkPresentationCache {
	readonly #entries = new Map<string, LinkPresentationCacheEntry>();

	get(
		href: string,
		resolve: () => Promise<LinkPresentation>,
		now = Date.now(),
	): Promise<LinkPresentation> {
		for (const [key, entry] of this.#entries) {
			if (entry.expiresAt <= now) {
				this.#entries.delete(key);
			}
		}
		const cached = this.#entries.get(href);
		if (cached) {
			return cached.value;
		}

		const value = resolve();
		const entry = { value, expiresAt: now + cacheLifetimeMs };
		this.#entries.set(href, entry);
		void value.catch(() => {
			if (this.#entries.get(href) === entry) {
				this.#entries.delete(href);
			}
		});
		return value;
	}

	clear(): void {
		this.#entries.clear();
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
): IObservable<LinkPresentation> {
	return derived(reader => reader.store.add(new AsyncLinkPresentation(
		href,
		initialPresentation,
		context,
		resolve,
		getFailurePresentation,
		onDidRequestRefresh,
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
	) {
		this.#href = href;
		this.#context = context;
		this.#resolve = resolve;
		this.#getFailurePresentation = getFailurePresentation;
		this.presentation = observableValue(`linkPresentation:${href}`, initialPresentation);
		this.#subscriptions = vscode.Disposable.from(...onDidRequestRefresh.map(event => event(() => this.#refresh())));
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
				this.presentation.set(value, undefined);
			}
		}, error => {
			if (currentGeneration === this.#generation) {
				this.#context.logger.trace('Markdown rich link', `Failed to resolve ${this.#href}`, error);
				this.presentation.set(this.#getFailurePresentation(error), undefined);
			}
		});
	}
}
