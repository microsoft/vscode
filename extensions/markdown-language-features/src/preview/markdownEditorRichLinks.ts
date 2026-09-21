/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ILogger } from '../logging';
import { Disposable } from '../util/dispose';
import { getAbsoluteUri, MdLinkOpener } from '../util/openDocumentLink';
import type { LinkPresentation } from './linkPresentation/linkPresentationResolver';

export class MarkdownEditorRichLinkController extends Disposable {
	readonly #documentUri: vscode.Uri;
	readonly #linkOpener: MdLinkOpener;
	readonly #logger: ILogger;
	readonly #postMessage: (message: object) => Thenable<boolean>;
	readonly #entries = new Map<string, vscode.Disposable>();

	constructor(
		document: vscode.TextDocument,
		linkOpener: MdLinkOpener,
		logger: ILogger,
		postMessage: (message: object) => Thenable<boolean>,
	) {
		super();
		this.#documentUri = document.uri;
		this.#linkOpener = linkOpener;
		this.#logger = logger;
		this.#postMessage = postMessage;
	}

	updateTargets(hrefs: readonly string[]): void {
		const targets = new Set(hrefs);
		for (const [href, entry] of this.#entries) {
			if (!targets.has(href)) {
				entry.dispose();
				this.#entries.delete(href);
			}
		}
		for (const href of targets) {
			if (!this.#entries.has(href)) {
				this.#entries.set(href, new ApiLinkPresentationEntry(
					href,
					this.#documentUri,
					this.#linkOpener,
					presentation => this.#publishPresentation(href, presentation),
					this.#logger,
				));
			}
		}
	}

	override dispose(): void {
		for (const entry of this.#entries.values()) {
			entry.dispose();
		}
		this.#entries.clear();
		super.dispose();
	}

	async #publishPresentation(href: string, presentation: LinkPresentation | undefined): Promise<void> {
		try {
			await this.#postMessage({
				type: 'richLinkPresentations',
				presentations: [{ href, presentation }],
			});
		} catch (error) {
			this.#logger.trace('Markdown rich link', `Failed to publish ${href}`, error);
		}
	}
}

class ApiLinkPresentationEntry extends Disposable {
	constructor(
		href: string,
		documentUri: vscode.Uri,
		linkOpener: MdLinkOpener,
		publishPresentation: (presentation: LinkPresentation | undefined) => void,
		logger: ILogger,
	) {
		super();
		void this.#initialize(href, documentUri, linkOpener, publishPresentation, logger);
	}

	async #initialize(
		href: string,
		documentUri: vscode.Uri,
		linkOpener: MdLinkOpener,
		publishPresentation: (presentation: LinkPresentation | undefined) => void,
		logger: ILogger,
	): Promise<void> {
		try {
			const resource = await resolveLinkResource(href, documentUri, linkOpener);
			if (this.isDisposed) {
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

			const watcher = this._register(vscode.window.createLinkPresentationWatcher(rule.id, resource));
			publishPresentation(toMarkdownEditorPresentation(watcher.presentation));
			this._register(watcher.onDidChangePresentation(() => publishPresentation(toMarkdownEditorPresentation(watcher.presentation))));
		} catch (error) {
			logger.trace('Markdown rich link', `Failed to resolve ${href}`, error);
			if (!this.isDisposed) {
				publishPresentation(undefined);
			}
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
