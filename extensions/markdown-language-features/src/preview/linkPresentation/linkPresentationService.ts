/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, type IObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import type { ILogger } from '../../logging';
import { Disposable } from '../../util/dispose';
import { GitLinkPresentationResolver } from './gitLinkPresentationResolver';
import { ImmutableLinkPresentationCache, type LinkPresentation, type LinkPresentationResolver, type LinkPresentationResolverContext } from './linkPresentationResolver';
import { WorkspaceLinkPresentationResolver } from './workspaceLinkPresentationResolver';

const refreshIntervalMs = 30_000;
export const linkPresentationProviderIds = [
	'markdown.gitCommitLinkPresentations',
	'markdown.workspaceFileLinkPresentations',
] as const;

export interface LinkPresentationWatch extends vscode.Disposable {
	readonly presentation: IObservable<LinkPresentation>;
}

interface LinkPresentationEntry {
	readonly presentation: IObservable<LinkPresentation>;
	readonly refreshOnInterval: boolean;
	readonly subscription: vscode.Disposable;
	references: number;
}

export class LinkPresentationService extends Disposable {
	readonly #logger: ILogger;
	readonly #resolvers: readonly LinkPresentationResolver[];
	readonly #entries = new Map<string, LinkPresentationEntry>();
	readonly #onDidRequestRefresh = this._register(new vscode.EventEmitter<void>());
	#refreshTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(resolvers: readonly LinkPresentationResolver[], logger: ILogger) {
		super();
		this.#logger = logger;
		this.#resolvers = resolvers.map(resolver => this._register(resolver));
	}

	watch(href: string): LinkPresentationWatch | undefined {
		const key = canonicalizeLinkHref(href);
		let entry = this.#entries.get(key);
		if (!entry) {
			const resolved = this.#resolve(key);
			if (!resolved) {
				return undefined;
			}
			entry = {
				...resolved,
				references: 0,
				subscription: autorun(reader => resolved.presentation.read(reader)),
			};
			this.#entries.set(key, entry);
		}
		entry.references++;
		this.#scheduleRefresh();

		let disposed = false;
		return {
			presentation: entry.presentation,
			dispose: () => {
				if (!disposed) {
					disposed = true;
					this.#release(key, entry);
				}
			},
		};
	}

	async openLink(href: string): Promise<boolean> {
		for (const resolver of this.#resolvers) {
			if (resolver.open && await resolver.open(href)) {
				return true;
			}
		}
		return false;
	}

	refresh(): void {
		this.#cancelRefresh();
		this.#onDidRequestRefresh.fire();
		this.#scheduleRefresh();
	}

	override dispose(): void {
		this.#cancelRefresh();
		for (const entry of this.#entries.values()) {
			entry.subscription.dispose();
		}
		this.#entries.clear();
		super.dispose();
	}

	#resolve(href: string): Omit<LinkPresentationEntry, 'references' | 'subscription'> | undefined {
		const context: LinkPresentationResolverContext = {
			onDidRequestRefresh: this.#onDidRequestRefresh.event,
			logger: this.#logger,
		};
		for (const resolver of this.#resolvers) {
			const presentation = resolver.resolve(href, context);
			if (presentation) {
				return {
					presentation,
					refreshOnInterval: resolver.refreshOnInterval,
				};
			}
		}
		return undefined;
	}

	#release(key: string, entry: LinkPresentationEntry): void {
		entry.references--;
		if (entry.references === 0 && this.#entries.get(key) === entry) {
			entry.subscription.dispose();
			this.#entries.delete(key);
			this.#scheduleRefresh();
		}
	}

	#scheduleRefresh(): void {
		if (![...this.#entries.values()].some(entry => entry.refreshOnInterval)) {
			this.#cancelRefresh();
		} else if (this.#refreshTimer === undefined) {
			this.#refreshTimer = setTimeout(() => {
				this.#refreshTimer = undefined;
				this.refresh();
			}, refreshIntervalMs);
		}
	}

	#cancelRefresh(): void {
		if (this.#refreshTimer !== undefined) {
			clearTimeout(this.#refreshTimer);
			this.#refreshTimer = undefined;
		}
	}
}

export function createSharedLinkPresentationService(logger: ILogger): LinkPresentationService {
	return new LinkPresentationService([
		new GitLinkPresentationResolver(new ImmutableLinkPresentationCache()),
		new WorkspaceLinkPresentationResolver(),
	], logger);
}

export function registerLinkPresentationProvider(service: LinkPresentationService): vscode.Disposable {
	const provider: vscode.LinkPresentationProvider = {
		provideLinkPresentationWatcher: resource => {
			const href = resource.toString(true);
			const watch = service.watch(href);
			if (!watch) {
				throw new Error(`No link presentation resolver accepted ${href}.`);
			}
			return new ExtensionLinkPresentationWatcher(watch);
		},
	};
	return vscode.Disposable.from(...linkPresentationProviderIds.map(id => vscode.window.registerLinkPresentationProvider(id, provider)));
}

class ExtensionLinkPresentationWatcher extends Disposable implements vscode.LinkPresentationWatcher {
	readonly #onDidChangePresentation = this._register(new vscode.EventEmitter<void>());
	readonly onDidChangePresentation = this.#onDidChangePresentation.event;
	#source: LinkPresentation;
	#presentation: vscode.LinkPresentationData;

	get presentation(): vscode.LinkPresentationData {
		return this.#presentation;
	}

	constructor(watch: LinkPresentationWatch) {
		super();
		this._register(watch);
		this.#source = watch.presentation.get();
		this.#presentation = toApiPresentation(this.#source);
		this._register(autorun(reader => {
			const presentation = watch.presentation.read(reader);
			if (presentation !== this.#source) {
				this.#source = presentation;
				this.#presentation = toApiPresentation(presentation);
				this.#onDidChangePresentation.fire();
			}
		}));
	}
}

function toApiPresentation(presentation: LinkPresentation): vscode.LinkPresentationData {
	return {
		kind: presentation.kind,
		...(presentation.title ? { title: presentation.title } : {}),
		...(presentation.detail ? { detail: presentation.detail } : {}),
		...(presentation.reference ? { reference: presentation.reference } : {}),
		...(presentation.status ? { status: presentation.status } : {}),
		...(presentation.secondaryStatus ? { secondaryStatus: presentation.secondaryStatus } : {}),
		...(presentation.tooltip ? { tooltip: presentation.tooltip } : {}),
		...(presentation.ariaLabel ? { ariaLabel: presentation.ariaLabel } : {}),
		...(presentation.isLoading ? { isLoading: true } : {}),
	};
}

export function canonicalizeLinkHref(href: string): string {
	try {
		return new URL(href).toString();
	} catch {
		return href;
	}
}
