/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MdTableOfContentsProvider, TableOfContents } from '../tableOfContents';
import { equals } from './arrays';
import { Disposable } from './dispose';
import { ResourceMap } from './resourceMap';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';
import { Delayer } from './async';

/**
 * Check if the items in a table of contents have changed.
 *
 * This only checks for changes in the entries themselves, not for any changes in their locations.
 */
function hasTableOfContentsChanged(a: TableOfContents, b: TableOfContents): boolean {
	const aSlugs = a.entries.map(entry => entry.slug.value).sort();
	const bSlugs = b.entries.map(entry => entry.slug.value).sort();
	return !equals(aSlugs, bSlugs);
}

export class MdTableOfContentsWatcher extends Disposable {

	private readonly _files = new ResourceMap<{
		readonly toc: TableOfContents;
	}>();

	private readonly _pending = new ResourceMap<void>();

	private readonly _onTocChanged = this._register(new vscode.EventEmitter<{ readonly uri: vscode.Uri }>);
	public readonly onTocChanged = this._onTocChanged.event;

	private readonly delayer: Delayer<void>;

	public constructor(
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly tocProvider: MdTableOfContentsProvider,
		private readonly delay: number,
	) {
		super();

		this.delayer = this._register(new Delayer<void>(delay));

		this._register(this.workspaceContents.onDidChangeMarkdownDocument(this.onDidChangeDocument, this));
		this._register(this.workspaceContents.onDidCreateMarkdownDocument(this.onDidCreateDocument, this));
		this._register(this.workspaceContents.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this));
	}

	private async onDidCreateDocument(document: SkinnyTextDocument) {
		const toc = await this.tocProvider.getForDocument(document);
		this._files.set(document.uri, { toc });
	}

	private async onDidChangeDocument(document: SkinnyTextDocument) {
		if (this.delay > 0) {
			this._pending.set(document.uri);
			this.delayer.trigger(() => this.flushPending());
		} else {
			this.updateForResource(document.uri);
		}
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._files.delete(resource);
		this._pending.delete(resource);
	}

	private async flushPending() {
		const pending = [...this._pending.keys()];
		this._pending.clear();

		return Promise.all(pending.map(resource => this.updateForResource(resource)));
	}

	private async updateForResource(resource: vscode.Uri) {
		const existing = this._files.get(resource);
		const newToc = await this.tocProvider.get(resource);

		if (!existing || hasTableOfContentsChanged(existing.toc, newToc)) {
			this._onTocChanged.fire({ uri: resource });
		}

		this._files.set(resource, { toc: newToc });
	}
}
