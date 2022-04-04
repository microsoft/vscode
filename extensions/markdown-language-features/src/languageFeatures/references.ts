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
import { InternalHref, MdLink, MdLinkProvider } from './documentLinkProvider';
import { MdWorkspaceCache } from './workspaceCache';


/**
 * A link in a markdown file.
 */
interface MdLinkReference {
	readonly kind: 'link';
	readonly isTriggerLocation: boolean;
	readonly isDefinition: boolean;
	readonly location: vscode.Location;

	readonly link: MdLink;

	readonly fragmentLocation: vscode.Location | undefined;
}

/**
 * A header in a markdown file.
 */
interface MdHeaderReference {
	readonly kind: 'header';

	readonly isTriggerLocation: boolean;
	readonly isDefinition: boolean;

	/**
	 * The range of the header.
	 *
	 * In `# a b c #` this would be the range of `# a b c #`
	 */
	readonly location: vscode.Location;

	/**
	 * The range of the header text itself.
	 *
	 * In `# a b c #` this would be the range of `a b c`
	 */
	readonly headerTextLocation: vscode.Location;
}

export type MdReference = MdLinkReference | MdHeaderReference;


function getFragmentLocation(link: MdLink): vscode.Location | undefined {
	const index = link.sourceText.indexOf('#');
	if (index < 0) {
		return undefined;
	}
	return new vscode.Location(link.sourceResource, link.sourceHrefRange.with({
		start: link.sourceHrefRange.start.translate({ characterDelta: index + 1 }),
	}));
}

export class MdReferencesProvider extends Disposable implements vscode.ReferenceProvider {

	private readonly _linkCache: MdWorkspaceCache<MdLink[]>;

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
		const allRefs = await this.getAllReferences(document, position, token);

		return allRefs
			.filter(ref => context.includeDeclaration || !ref.isDefinition)
			.map(ref => ref.location);
	}

	public async getAllReferences(document: SkinnyTextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<MdReference[]> {
		const toc = await TableOfContents.create(this.engine, document);
		if (token.isCancellationRequested) {
			return [];
		}

		const header = toc.entries.find(entry => entry.line === position.line);
		if (header) {
			return this.getReferencesToHeader(document, header);
		} else {
			return this.getReferencesToLinkAtPosition(document, position);
		}
	}

	private async getReferencesToHeader(document: SkinnyTextDocument, header: TocEntry): Promise<MdReference[]> {
		const links = (await this._linkCache.getAll()).flat();

		const references: MdReference[] = [];

		references.push({
			kind: 'header',
			isTriggerLocation: true,
			isDefinition: true,
			location: header.headerLocation,
			headerTextLocation: header.headerTextLocation
		});

		for (const link of links) {
			if (link.href.kind === 'internal'
				&& this.looksLikeLinkToDoc(link.href, document)
				&& this.slugifier.fromHeading(link.href.fragment).value === header.slug.value
			) {
				references.push({
					kind: 'link',
					isTriggerLocation: false,
					isDefinition: false,
					link,
					location: new vscode.Location(link.sourceResource, link.sourceHrefRange),
					fragmentLocation: getFragmentLocation(link),
				});
			}
		}

		return references;
	}

	private async getReferencesToLinkAtPosition(document: SkinnyTextDocument, position: vscode.Position): Promise<MdReference[]> {
		const docLinks = await this.linkProvider.getAllLinks(document);

		for (const link of docLinks) {
			if (link.kind === 'definition') {
				// We could be in either the ref name or the definition
				if (link.refRange.contains(position)) {
					return Array.from(this.getReferencesToLinkReference(docLinks, link.ref, { resource: document.uri, range: link.refRange }));
				} else if (link.sourceHrefRange.contains(position)) {
					return this.getReferencesToLink(link);
				}
			} else {
				if (link.sourceHrefRange.contains(position)) {
					return this.getReferencesToLink(link);
				}
			}
		}

		return [];
	}

	private async getReferencesToLink(sourceLink: MdLink): Promise<MdReference[]> {
		const allLinksInWorkspace = (await this._linkCache.getAll()).flat();

		if (sourceLink.href.kind === 'reference') {
			return Array.from(this.getReferencesToLinkReference(allLinksInWorkspace, sourceLink.href.ref, { resource: sourceLink.sourceResource, range: sourceLink.sourceHrefRange }));
		}

		if (sourceLink.href.kind !== 'internal') {
			return [];
		}

		let targetDoc = await this.workspaceContents.getMarkdownDocument(sourceLink.href.path);
		if (!targetDoc) {
			// We don't think the file exists. If it doesn't already have an extension, try tacking on a `.md` and using that instead
			if (uri.Utils.extname(sourceLink.href.path) === '') {
				const dotMdResource = sourceLink.href.path.with({ path: sourceLink.href.path.path + '.md' });
				targetDoc = await this.workspaceContents.getMarkdownDocument(dotMdResource);
			}
		}

		if (!targetDoc) {
			return [];
		}

		const references: MdReference[] = [];

		if (sourceLink.href.fragment) {
			const toc = await TableOfContents.create(this.engine, targetDoc);
			const entry = toc.lookup(sourceLink.href.fragment);
			if (entry) {
				references.push({
					kind: 'header',
					isTriggerLocation: false,
					isDefinition: true,
					location: entry.headerLocation,
					headerTextLocation: entry.headerTextLocation
				});
			}
		}

		for (const link of allLinksInWorkspace) {
			if (link.href.kind !== 'internal') {
				continue;
			}

			if (!this.looksLikeLinkToDoc(link.href, targetDoc)) {
				continue;
			}

			const isTriggerLocation = sourceLink.sourceResource.fsPath === link.sourceResource.fsPath && sourceLink.sourceHrefRange.isEqual(link.sourceHrefRange);

			if (sourceLink.href.fragment) {
				if (this.slugifier.fromHeading(link.href.fragment).equals(this.slugifier.fromHeading(sourceLink.href.fragment))) {
					references.push({
						kind: 'link',
						isTriggerLocation,
						isDefinition: false,
						link,
						location: new vscode.Location(link.sourceResource, link.sourceHrefRange),
						fragmentLocation: getFragmentLocation(link),
					});
				}
			} else { // Triggered on a link without a fragment so we only require matching the file and ignore fragments

				// But exclude cases where the file is implicitly referencing itself
				if (!link.sourceText.startsWith('#') || link.sourceResource.fsPath !== targetDoc.uri.fsPath) {
					references.push({
						kind: 'link',
						isTriggerLocation,
						isDefinition: false,
						link,
						location: new vscode.Location(link.sourceResource, link.sourceHrefRange),
						fragmentLocation: getFragmentLocation(link),
					});
				}
			}
		}

		return references;
	}

	private looksLikeLinkToDoc(href: InternalHref, targetDoc: SkinnyTextDocument) {
		return href.path.fsPath === targetDoc.uri.fsPath
			|| uri.Utils.extname(href.path) === '' && href.path.with({ path: href.path.path + '.md' }).fsPath === targetDoc.uri.fsPath;
	}

	private *getReferencesToLinkReference(allLinks: Iterable<MdLink>, refToFind: string, from: { resource: vscode.Uri; range: vscode.Range }): Iterable<MdReference> {
		for (const link of allLinks) {
			let ref: string;
			if (link.kind === 'definition') {
				ref = link.ref;
			} else if (link.href.kind === 'reference') {
				ref = link.href.ref;
			} else {
				continue;
			}

			if (ref === refToFind && link.sourceResource.fsPath === from.resource.fsPath) {
				const isTriggerLocation = from.resource.fsPath === link.sourceResource.fsPath && (
					(link.href.kind === 'reference' && from.range.isEqual(link.sourceHrefRange)) || (link.kind === 'definition' && from.range.isEqual(link.refRange)));
				yield {
					kind: 'link',
					isTriggerLocation,
					isDefinition: link.kind === 'definition',
					link,
					location: new vscode.Location(from.resource, link.sourceHrefRange),
					fragmentLocation: getFragmentLocation(link),
				};
			}
		}
	}
}
