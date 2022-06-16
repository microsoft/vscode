/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContents } from '../tableOfContents';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';
import { equals } from '../util/arrays';
import { Disposable } from '../util/dispose';
import { ResourceMap } from '../util/resourceMap';

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

	private readonly _onTocChanged = this._register(new vscode.EventEmitter<{ readonly uri: vscode.Uri }>);
	public readonly onTocChanged = this._onTocChanged.event;

	public constructor(
		private readonly engine: MarkdownEngine,
		private readonly workspaceContents: MdWorkspaceContents,
	) {
		super();

		this._register(this.workspaceContents.onDidChangeMarkdownDocument(this.onDidChangeDocument, this));
		this._register(this.workspaceContents.onDidCreateMarkdownDocument(this.onDidCreateDocument, this));
		this._register(this.workspaceContents.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this));
	}

	private async onDidCreateDocument(document: SkinnyTextDocument) {
		const toc = await TableOfContents.create(this.engine, document);
		this._files.set(document.uri, { toc });
	}

	private async onDidChangeDocument(document: SkinnyTextDocument) {
		const existing = this._files.get(document.uri);
		const newToc = await TableOfContents.create(this.engine, document);

		if (!existing || hasTableOfContentsChanged(existing.toc, newToc)) {
			this._onTocChanged.fire({ uri: document.uri });
		}

		this._files.set(document.uri, { toc: newToc });
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._files.delete(resource);
	}
}
