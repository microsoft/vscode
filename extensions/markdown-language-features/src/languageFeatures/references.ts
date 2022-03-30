/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContents } from '../tableOfContents';
import { Disposable } from '../util/dispose';
import { MdWorkspaceContents } from '../workspaceContents';
import { InternalLinkTarget, LinkData, MdLinkProvider } from './documentLinkProvider';
import { MdWorkspaceCache } from './workspaceCache';


export class MdReferencesProvider extends Disposable implements vscode.ReferenceProvider {

	private readonly _linkCache: MdWorkspaceCache<Promise<LinkData[]>>;

	public constructor(
		linkProvider: MdLinkProvider,
		workspaceContents: MdWorkspaceContents,
		private readonly engine: MarkdownEngine,
	) {
		super();

		this._linkCache = this._register(new MdWorkspaceCache(workspaceContents, doc => linkProvider.getInlineLinks(doc.getText(), doc)));
	}

	async provideReferences(document: vscode.TextDocument, position: vscode.Position, _context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[] | undefined> {
		const toc = await TableOfContents.create(this.engine, document);
		if (token.isCancellationRequested) {
			return undefined;
		}

		const header = toc.entries.find(entry => entry.line === position.line);
		if (!header) {
			return undefined;
		}

		const links = await Promise.all(await this._linkCache.getAll());
		return links
			.flat()
			.filter(link => {
				return link.target.kind === 'internal'
					&& link.target.path.fsPath === document.uri.fsPath
					&& link.target.fragment === header.slug.value;
			})
			.map(link => {
				const target = link.target as InternalLinkTarget;
				return new vscode.Location(target.fromResource, link.sourceRange);
			});
	}
}
