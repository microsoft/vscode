/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as uri from 'vscode-uri';
import { MarkdownEngine } from '../markdownEngine';
import { Slugifier } from '../slugify';
import { TableOfContents, TocEntry } from '../tableOfContents';
import { Disposable } from '../util/dispose';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';
import { InternalLinkTarget, LinkData, LinkTarget, MdLinkProvider } from './documentLinkProvider';
import { MdWorkspaceCache } from './workspaceCache';


function isLinkToHeader(target: LinkTarget, header: TocEntry, headerDocument: vscode.Uri, slugifier: Slugifier): target is InternalLinkTarget {
	return target.kind === 'internal'
		&& target.path.fsPath === headerDocument.fsPath
		&& slugifier.fromHeading(target.fragment).value === header.slug.value;
}

export class MdReferencesProvider extends Disposable implements vscode.ReferenceProvider {

	private readonly _linkCache: MdWorkspaceCache<LinkData[]>;

	public constructor(
		private readonly linkProvider: MdLinkProvider,
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly engine: MarkdownEngine,
		private readonly slugifier: Slugifier,
	) {
		super();

		this._linkCache = this._register(new MdWorkspaceCache(workspaceContents, doc => linkProvider.getAllLinks(doc)));
	}

	async provideReferences(document: SkinnyTextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[] | undefined> {
		const toc = await TableOfContents.create(this.engine, document);
		if (token.isCancellationRequested) {
			return undefined;
		}

		const header = toc.entries.find(entry => entry.line === position.line);
		if (header) {
			return this.getReferencesToHeader(document, header, context);
		} else {
			return this.getReferencesToLink(document, position, context);
		}
	}

	private async getReferencesToHeader(document: SkinnyTextDocument, header: TocEntry, context: vscode.ReferenceContext,): Promise<vscode.Location[] | undefined> {
		const links = (await this._linkCache.getAll()).flat();

		const references: vscode.Location[] = [];

		if (context.includeDeclaration) {
			const line = document.lineAt(header.line);
			references.push(new vscode.Location(document.uri, new vscode.Range(header.line, 0, header.line, line.text.length)));
		}

		for (const link of links) {
			if (isLinkToHeader(link.target, header, document.uri, this.slugifier)) {
				references.push(new vscode.Location(link.target.fromResource, link.sourceRange));
			} else if (link.target.kind === 'definition' && isLinkToHeader(link.target.target, header, document.uri, this.slugifier)) {
				references.push(new vscode.Location(link.target.target.fromResource, link.sourceRange));
			}
		}

		return references;
	}

	private async getReferencesToLink(document: SkinnyTextDocument, position: vscode.Position, context: vscode.ReferenceContext): Promise<vscode.Location[] | undefined> {
		const links = (await this._linkCache.getAll()).flat();

		const docLinks = await this.linkProvider.getAllLinks(document);
		const sourceLink = docLinks.find(link => link.sourceRange.contains(position));

		if (sourceLink?.target.kind === 'reference') {
			const references: vscode.Location[] = [];

			for (const link of links) {
				if (link.target.kind === 'reference' || link.target.kind === 'definition') {
					if (link.target.ref === sourceLink.target.ref && link.target.fromResource.fsPath === document.uri.fsPath) {
						references.push(new vscode.Location(document.uri, link.sourceRange));
					}
				}
			}

			return references;
		}

		if (sourceLink?.target.kind !== 'internal') {
			return undefined;
		}

		let targetDoc = await this.workspaceContents.getMarkdownDocument(sourceLink.target.path);
		if (!targetDoc) {
			// We don't think the file exists. If it doesn't already have an extension, try tacking on a `.md` and using that instead
			if (uri.Utils.extname(sourceLink.target.path) === '') {
				const dotMdResource = sourceLink.target.path.with({ path: sourceLink.target.path.path + '.md' });
				targetDoc = await this.workspaceContents.getMarkdownDocument(dotMdResource);
			}
		}

		if (!targetDoc) {
			return undefined;
		}

		const references: vscode.Location[] = [];

		if (context.includeDeclaration) {
			if (sourceLink.target.fragment) {
				const toc = await TableOfContents.create(this.engine, targetDoc);
				const entry = toc.lookup(sourceLink.target.fragment);
				if (entry) {
					references.push(entry.location);
				}
			}
		}

		for (const link of links) {
			if (link.target.kind !== 'internal') {
				continue;
			}

			const matchesFilePart = link.target.path.fsPath === targetDoc.uri.fsPath
				|| uri.Utils.extname(link.target.path) === '' && link.target.path.with({ path: link.target.path.path + '.md' }).fsPath === targetDoc.uri.fsPath;

			if (!matchesFilePart) {
				continue;
			}

			if (sourceLink.target.fragment) {
				if (this.slugifier.fromHeading(link.target.fragment).equals(this.slugifier.fromHeading(sourceLink.target.fragment))) {
					references.push(new vscode.Location(link.target.fromResource, link.sourceRange));
				}
			} else { // Triggered on a link without a fragment so we only require matching the file and ignore fragments

				// But exclude cases where the file is referencing itself
				if (link.target.fromResource.fsPath !== targetDoc.uri.fsPath) {
					references.push(new vscode.Location(link.target.fromResource, link.sourceRange));
				}
			}
		}

		return references;
	}
}
