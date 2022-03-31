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


export interface MdReference {
	readonly isDefinition: boolean;
	readonly location: vscode.Location;
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

		let allRefs: MdReference[];
		if (header) {
			allRefs = await this.getReferencesToHeader(document, header);
		} else {
			allRefs = await this.getReferencesToLinkAtPosition(document, position);
		}

		return allRefs
			.filter(ref => context.includeDeclaration || !ref.isDefinition)
			.map(ref => ref.location);
	}

	private async getReferencesToHeader(document: SkinnyTextDocument, header: TocEntry): Promise<MdReference[]> {
		const links = (await this._linkCache.getAll()).flat();

		const references: MdReference[] = [];

		const line = document.lineAt(header.line);
		references.push({
			isDefinition: true,
			location: new vscode.Location(document.uri, new vscode.Range(header.line, 0, header.line, line.text.length)),
		});

		for (const link of links) {
			if (isLinkToHeader(link.target, header, document.uri, this.slugifier)) {
				references.push({
					isDefinition: false,
					location: new vscode.Location(link.sourceResource, link.sourceRange)
				});
			} else if (link.target.kind === 'definition' && isLinkToHeader(link.target.target, header, document.uri, this.slugifier)) {
				references.push({
					isDefinition: false,
					location: new vscode.Location(link.sourceResource, link.sourceRange)
				});
			}
		}

		return references;
	}

	private async getReferencesToLinkAtPosition(document: SkinnyTextDocument, position: vscode.Position): Promise<MdReference[]> {
		const docLinks = await this.linkProvider.getAllLinks(document);
		const sourceLink = docLinks.find(link => link.sourceRange.contains(position));
		return sourceLink ? this.getReferencesToLink(sourceLink) : [];
	}

	private async getReferencesToLink(sourceLink: LinkData): Promise<MdReference[]> {
		const allLinksInWorkspace = (await this._linkCache.getAll()).flat();

		if (sourceLink.target.kind === 'reference') {
			return Array.from(this.getReferencesToReferenceLink(allLinksInWorkspace, sourceLink));
		}

		if (sourceLink.target.kind !== 'internal') {
			return [];
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
			return [];
		}

		const references: MdReference[] = [];

		if (sourceLink.target.fragment) {
			const toc = await TableOfContents.create(this.engine, targetDoc);
			const entry = toc.lookup(sourceLink.target.fragment);
			if (entry) {
				references.push({ isDefinition: true, location: entry.location });
			}
		}

		for (const link of allLinksInWorkspace) {
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
					references.push({ isDefinition: false, location: new vscode.Location(link.sourceResource, link.sourceRange) });
				}
			} else { // Triggered on a link without a fragment so we only require matching the file and ignore fragments

				// But exclude cases where the file is referencing itself
				if (link.sourceResource.fsPath !== targetDoc.uri.fsPath) {
					references.push({ isDefinition: false, location: new vscode.Location(link.sourceResource, link.sourceRange) });
				}
			}
		}

		return references;
	}

	private *getReferencesToReferenceLink(allLinks: Iterable<LinkData>, sourceLink: LinkData): Iterable<MdReference> {
		if (sourceLink.target.kind !== 'reference') {
			return;
		}
		for (const link of allLinks) {
			if (link.target.kind === 'reference' || link.target.kind === 'definition') {
				if (link.target.ref === sourceLink.target.ref && link.sourceResource.fsPath === sourceLink.sourceResource.fsPath) {
					yield {
						isDefinition: false,
						location: new vscode.Location(sourceLink.sourceResource, link.sourceRange)
					};
				}
			}
		}
	}
}
