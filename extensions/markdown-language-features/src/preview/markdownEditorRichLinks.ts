/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentation } from '@vscode/markdown-editor';
import { autorun, type IObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import type { ILogger } from '../logging';
import { Disposable } from '../util/dispose';
import { MdLinkOpener } from '../util/openDocumentLink';
import { AgentSessionLinkPresentationResolver } from './agentSessionLinkPresentationResolver';
import { GitHubLinkPresentationResolver } from './githubLinkPresentationResolver';
import { GitLinkPresentationResolver } from './gitLinkPresentationResolver';
import { ImmutableLinkPresentationCache, LinkPresentationCache, type LinkPresentationResolver, type LinkPresentationResolverContext } from './linkPresentationResolver';
import { WorkspaceLinkPresentationResolver } from './workspaceLinkPresentationResolver';

const refreshIntervalMs = 30_000;

interface LinkPresentationEntry {
	readonly presentation: IObservable<LinkPresentation>;
	readonly refreshOnInterval: boolean;
	readonly subscription: vscode.Disposable;
}

export class MarkdownEditorRichLinkController extends Disposable {
	readonly #logger: ILogger;
	readonly #postMessage: (message: object) => Thenable<boolean>;
	readonly #gitResolver: GitLinkPresentationResolver;
	readonly #resolvers: readonly LinkPresentationResolver[];
	readonly #entries = new Map<string, LinkPresentationEntry>();
	readonly #onDidRequestRefresh = this._register(new vscode.EventEmitter<void>());
	#refreshTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		document: vscode.TextDocument,
		linkOpener: MdLinkOpener,
		logger: ILogger,
		gitCache: ImmutableLinkPresentationCache,
		githubCache: LinkPresentationCache,
		postMessage: (message: object) => Thenable<boolean>,
	) {
		super();
		this.#logger = logger;
		this.#postMessage = postMessage;
		this.#gitResolver = this._register(new GitLinkPresentationResolver(gitCache));
		this.#resolvers = [
			this._register(new AgentSessionLinkPresentationResolver()),
			this.#gitResolver,
			this._register(new GitHubLinkPresentationResolver(githubCache)),
			this._register(new WorkspaceLinkPresentationResolver(document.uri, linkOpener)),
		];
		this._register(vscode.window.onDidChangeWindowState(event => {
			if (event.focused) {
				this.#refresh();
			}
		}));
	}

	openLink(href: string): Promise<boolean> {
		return this.#gitResolver.open(href);
	}

	updateTargets(hrefs: readonly string[]): void {
		const targets = new Set(hrefs);
		for (const [href, entry] of this.#entries) {
			if (!targets.has(href)) {
				entry.subscription.dispose();
				this.#entries.delete(href);
			}
		}
		for (const href of targets) {
			if (!this.#entries.has(href)) {
				const entry = this.#resolve(href);
				if (entry) {
					this.#entries.set(href, entry);
				}
			}
		}
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

	#resolve(href: string): LinkPresentationEntry | undefined {
		for (const resolver of this.#resolvers) {
			const context: LinkPresentationResolverContext = {
				onDidRequestRefresh: this.#onDidRequestRefresh.event,
				logger: this.#logger,
			};
			const presentation = resolver.resolve(href, context);
			if (!presentation) {
				continue;
			}
			const subscription = autorun(reader => {
				void this.#publishPresentation(href, presentation.read(reader));
			});
			return {
				presentation,
				refreshOnInterval: resolver.refreshOnInterval,
				subscription,
			};
		}

		return undefined;
	}

	async #publishPresentation(href: string, presentation: LinkPresentation): Promise<void> {
		try {
			await this.#postMessage({
				type: 'richLinkPresentations',
				presentations: [{ href, presentation }],
			});
		} catch (error) {
			this.#logger.trace('Markdown rich link', `Failed to publish ${href}`, error);
		}
	}

	#refresh(): void {
		this.#onDidRequestRefresh.fire();
		this.#scheduleRefresh();
	}

	#scheduleRefresh(): void {
		this.#cancelRefresh();
		if ([...this.#entries.values()].some(entry => entry.refreshOnInterval)) {
			this.#refreshTimer = setTimeout(() => this.#refresh(), refreshIntervalMs);
		}
	}

	#cancelRefresh(): void {
		if (this.#refreshTimer !== undefined) {
			clearTimeout(this.#refreshTimer);
			this.#refreshTimer = undefined;
		}
	}
}
