/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DisposableStore } from '@vscode/observables';
import type { ILogger } from '../logging';
import { Disposable } from '../util/dispose';
import { getAbsoluteUri, MdLinkOpener } from '../util/openDocumentLink';
import type { LinkPresentation } from './linkPresentation/linkPresentationResolver';
import type { MarkdownEditorRenderer, RichLinkSubscriptions } from './markdownEditorProtocol';

export class MarkdownEditorRichLinkController extends Disposable {
	readonly #documentUri: vscode.Uri;
	readonly #linkOpener: MdLinkOpener;
	readonly #logger: ILogger;
	readonly #publish: MarkdownEditorRenderer['richLinkPresentations'];
	readonly #subscriptions = new Map<string, DisposableStore>();

	constructor(
		document: vscode.TextDocument,
		linkOpener: MdLinkOpener,
		logger: ILogger,
		publish: MarkdownEditorRenderer['richLinkPresentations'],
	) {
		super();
		this.#documentUri = document.uri;
		this.#linkOpener = linkOpener;
		this.#logger = logger;
		this.#publish = publish;
	}

	updateSubscriptions({ subscribe, unsubscribe }: RichLinkSubscriptions): void {
		if (this.isDisposed) {
			throw new Error('Rich link controller is disposed');
		}
		for (const subscriptionId of unsubscribe) {
			this.#subscriptions.get(subscriptionId)?.dispose();
			this.#subscriptions.delete(subscriptionId);
		}
		for (const { subscriptionId, href } of subscribe) {
			if (this.#subscriptions.has(subscriptionId)) {
				throw new Error(`Duplicate rich link subscription: ${subscriptionId}`);
			}
			const store = new DisposableStore();
			this.#subscriptions.set(subscriptionId, store);
			void this.#watch(href, store, presentation => {
				if (!store.isDisposed) {
					this.#publish({ presentations: [{ subscriptionId, presentation }] });
				}
			});
		}
	}

	clear(): void {
		for (const store of this.#subscriptions.values()) {
			store.dispose();
		}
		this.#subscriptions.clear();
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	async #watch(
		href: string,
		store: DisposableStore,
		publishPresentation: (presentation: LinkPresentation | undefined) => void,
	): Promise<void> {
		try {
			const resource = await resolveLinkResource(href, this.#documentUri, this.#linkOpener);
			if (store.isDisposed) {
				return;
			}
			if (!resource) {
				publishPresentation(undefined);
				return;
			}
			const resourceString = resource.toString(true);
			const rule = vscode.window.linkPresentationRules.find(rule => matchesRule(rule.uriPattern, resourceString));
			if (!rule) {
				publishPresentation(undefined);
				return;
			}

			const watcher = store.add(vscode.window.createLinkPresentationWatcher(rule.id, resource));
			store.add(watcher.onDidChangePresentation(() => publishPresentation(toMarkdownEditorPresentation(watcher.presentation))));
			publishPresentation(toMarkdownEditorPresentation(watcher.presentation));
		} catch (error) {
			this.#logger.trace('Markdown rich link', `Failed to resolve ${href}`, error);
			publishPresentation(undefined);
		}
	}
}

function toMarkdownEditorPresentation(presentation: vscode.LinkPresentationData | undefined): LinkPresentation | undefined {
	if (!presentation) {
		return undefined;
	}
	return {
		...presentation,
		kind: presentation.kind === 'chat' ? 'session' : presentation.kind,
	};
}

async function resolveLinkResource(href: string, documentUri: vscode.Uri, linkOpener: MdLinkOpener): Promise<vscode.Uri | undefined> {
	const absoluteUri = getAbsoluteUri(href);
	if (absoluteUri) {
		return absoluteUri;
	}
	const resolved = await linkOpener.resolveDocumentLink(href, documentUri);
	return resolved && resolved.kind !== 'external' ? vscode.Uri.from(resolved.uri) : undefined;
}

function matchesRule(rule: RegExp, value: string): boolean {
	rule.lastIndex = 0;
	return rule.test(value);
}
