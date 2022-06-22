/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as uri from 'vscode-uri';
import { ILogger } from '../logging';
import { IMdParser } from '../markdownEngine';
import { MdTableOfContentsProvider, TocEntry } from '../tableOfContents';
import { ITextDocument } from '../types/textDocument';
import { noopToken } from '../util/cancellation';
import { Disposable } from '../util/dispose';
import { looksLikeMarkdownPath } from '../util/file';
import { MdWorkspaceInfoCache } from '../util/workspaceCache';
import { IMdWorkspace } from '../workspace';
import { InternalHref, MdLink, MdLinkComputer } from './documentLinks';


/**
 * A link in a markdown file.
 */
export interface MdLinkReference {
	readonly kind: 'link';
	readonly isTriggerLocation: boolean;
	readonly isDefinition: boolean;
	readonly location: vscode.Location;

	readonly link: MdLink;
}

/**
 * A header in a markdown file.
 */
export interface MdHeaderReference {
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
	 * The text of the header.
	 *
	 * In `# a b c #` this would be `a b c`
	 */
	readonly headerText: string;

	/**
	 * The range of the header text itself.
	 *
	 * In `# a b c #` this would be the range of `a b c`
	 */
	readonly headerTextLocation: vscode.Location;
}

export type MdReference = MdLinkReference | MdHeaderReference;

/**
 * Stateful object that computes references for markdown files.
 */
export class MdReferencesProvider extends Disposable {

	private readonly _linkCache: MdWorkspaceInfoCache<readonly MdLink[]>;
	private readonly _linkComputer: MdLinkComputer;

	public constructor(
		private readonly parser: IMdParser,
		private readonly workspace: IMdWorkspace,
		private readonly tocProvider: MdTableOfContentsProvider,
		private readonly logger: ILogger,
	) {
		super();

		this._linkComputer = new MdLinkComputer(parser);
		this._linkCache = this._register(new MdWorkspaceInfoCache(workspace, doc => this._linkComputer.getAllLinks(doc, noopToken)));
	}

	public async getReferencesAtPosition(document: ITextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<MdReference[]> {
		this.logger.verbose('ReferencesProvider', `getReferencesAtPosition: ${document.uri}`);

		const toc = await this.tocProvider.getForDocument(document);
		if (token.isCancellationRequested) {
			return [];
		}

		const header = toc.entries.find(entry => entry.line === position.line);
		if (header) {
			return this.getReferencesToHeader(document, header);
		} else {
			return this.getReferencesToLinkAtPosition(document, position, token);
		}
	}

	public async getAllReferencesToFile(resource: vscode.Uri, _token: vscode.CancellationToken): Promise<MdReference[]> {
		this.logger.verbose('ReferencesProvider', `getAllReferencesToFile: ${resource}`);

		const allLinksInWorkspace = (await this._linkCache.values()).flat();
		return Array.from(this.findAllLinksToFile(resource, allLinksInWorkspace, undefined));
	}

	private async getReferencesToHeader(document: ITextDocument, header: TocEntry): Promise<MdReference[]> {
		const links = (await this._linkCache.values()).flat();

		const references: MdReference[] = [];

		references.push({
			kind: 'header',
			isTriggerLocation: true,
			isDefinition: true,
			location: header.headerLocation,
			headerText: header.text,
			headerTextLocation: header.headerTextLocation
		});

		for (const link of links) {
			if (link.href.kind === 'internal'
				&& this.looksLikeLinkToDoc(link.href, document.uri)
				&& this.parser.slugifier.fromHeading(link.href.fragment).value === header.slug.value
			) {
				references.push({
					kind: 'link',
					isTriggerLocation: false,
					isDefinition: false,
					link,
					location: new vscode.Location(link.source.resource, link.source.hrefRange),
				});
			}
		}

		return references;
	}

	private async getReferencesToLinkAtPosition(document: ITextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<MdReference[]> {
		const docLinks = await this._linkComputer.getAllLinks(document, token);

		for (const link of docLinks) {
			if (link.kind === 'definition') {
				// We could be in either the ref name or the definition
				if (link.ref.range.contains(position)) {
					return Array.from(this.getReferencesToLinkReference(docLinks, link.ref.text, { resource: document.uri, range: link.ref.range }));
				} else if (link.source.hrefRange.contains(position)) {
					return this.getReferencesToLink(link, position, token);
				}
			} else {
				if (link.source.hrefRange.contains(position)) {
					return this.getReferencesToLink(link, position, token);
				}
			}
		}

		return [];
	}

	private async getReferencesToLink(sourceLink: MdLink, triggerPosition: vscode.Position, token: vscode.CancellationToken): Promise<MdReference[]> {
		const allLinksInWorkspace = (await this._linkCache.values()).flat();
		if (token.isCancellationRequested) {
			return [];
		}

		if (sourceLink.href.kind === 'reference') {
			return Array.from(this.getReferencesToLinkReference(allLinksInWorkspace, sourceLink.href.ref, { resource: sourceLink.source.resource, range: sourceLink.source.hrefRange }));
		}

		if (sourceLink.href.kind === 'external') {
			const references: MdReference[] = [];

			for (const link of allLinksInWorkspace) {
				if (link.href.kind === 'external' && link.href.uri.toString() === sourceLink.href.uri.toString()) {
					const isTriggerLocation = sourceLink.source.resource.fsPath === link.source.resource.fsPath && sourceLink.source.hrefRange.isEqual(link.source.hrefRange);
					references.push({
						kind: 'link',
						isTriggerLocation,
						isDefinition: false,
						link,
						location: new vscode.Location(link.source.resource, link.source.hrefRange),
					});
				}
			}
			return references;
		}

		const resolvedResource = await tryResolveLinkPath(sourceLink.href.path, this.workspace);
		if (token.isCancellationRequested) {
			return [];
		}

		const references: MdReference[] = [];

		if (resolvedResource && this.isMarkdownPath(resolvedResource) && sourceLink.href.fragment && sourceLink.source.fragmentRange?.contains(triggerPosition)) {
			const toc = await this.tocProvider.get(resolvedResource);
			const entry = toc.lookup(sourceLink.href.fragment);
			if (entry) {
				references.push({
					kind: 'header',
					isTriggerLocation: false,
					isDefinition: true,
					location: entry.headerLocation,
					headerText: entry.text,
					headerTextLocation: entry.headerTextLocation
				});
			}

			for (const link of allLinksInWorkspace) {
				if (link.href.kind !== 'internal' || !this.looksLikeLinkToDoc(link.href, resolvedResource)) {
					continue;
				}

				if (this.parser.slugifier.fromHeading(link.href.fragment).equals(this.parser.slugifier.fromHeading(sourceLink.href.fragment))) {
					const isTriggerLocation = sourceLink.source.resource.fsPath === link.source.resource.fsPath && sourceLink.source.hrefRange.isEqual(link.source.hrefRange);
					references.push({
						kind: 'link',
						isTriggerLocation,
						isDefinition: false,
						link,
						location: new vscode.Location(link.source.resource, link.source.hrefRange),
					});
				}
			}
		} else { // Triggered on a link without a fragment so we only require matching the file and ignore fragments
			references.push(...this.findAllLinksToFile(resolvedResource ?? sourceLink.href.path, allLinksInWorkspace, sourceLink));
		}

		return references;
	}

	private isMarkdownPath(resolvedHrefPath: vscode.Uri) {
		return this.workspace.hasMarkdownDocument(resolvedHrefPath) || looksLikeMarkdownPath(resolvedHrefPath);
	}

	private looksLikeLinkToDoc(href: InternalHref, targetDoc: vscode.Uri) {
		return href.path.fsPath === targetDoc.fsPath
			|| uri.Utils.extname(href.path) === '' && href.path.with({ path: href.path.path + '.md' }).fsPath === targetDoc.fsPath;
	}

	private *findAllLinksToFile(resource: vscode.Uri, allLinksInWorkspace: readonly MdLink[], sourceLink: MdLink | undefined): Iterable<MdReference> {
		for (const link of allLinksInWorkspace) {
			if (link.href.kind !== 'internal' || !this.looksLikeLinkToDoc(link.href, resource)) {
				continue;
			}

			// Exclude cases where the file is implicitly referencing itself
			if (link.source.text.startsWith('#') && link.source.resource.fsPath === resource.fsPath) {
				continue;
			}

			const isTriggerLocation = !!sourceLink && sourceLink.source.resource.fsPath === link.source.resource.fsPath && sourceLink.source.hrefRange.isEqual(link.source.hrefRange);
			const pathRange = this.getPathRange(link);
			yield {
				kind: 'link',
				isTriggerLocation,
				isDefinition: false,
				link,
				location: new vscode.Location(link.source.resource, pathRange),
			};
		}
	}

	private *getReferencesToLinkReference(allLinks: Iterable<MdLink>, refToFind: string, from: { resource: vscode.Uri; range: vscode.Range }): Iterable<MdReference> {
		for (const link of allLinks) {
			let ref: string;
			if (link.kind === 'definition') {
				ref = link.ref.text;
			} else if (link.href.kind === 'reference') {
				ref = link.href.ref;
			} else {
				continue;
			}

			if (ref === refToFind && link.source.resource.fsPath === from.resource.fsPath) {
				const isTriggerLocation = from.resource.fsPath === link.source.resource.fsPath && (
					(link.href.kind === 'reference' && from.range.isEqual(link.source.hrefRange)) || (link.kind === 'definition' && from.range.isEqual(link.ref.range)));

				const pathRange = this.getPathRange(link);
				yield {
					kind: 'link',
					isTriggerLocation,
					isDefinition: link.kind === 'definition',
					link,
					location: new vscode.Location(from.resource, pathRange),
				};
			}
		}
	}

	/**
	 * Get just the range of the file path, dropping the fragment
	 */
	private getPathRange(link: MdLink): vscode.Range {
		return link.source.fragmentRange
			? link.source.hrefRange.with(undefined, link.source.fragmentRange.start.translate(0, -1))
			: link.source.hrefRange;
	}
}

/**
 * Implements {@link vscode.ReferenceProvider} for markdown documents.
 */
export class MdVsCodeReferencesProvider implements vscode.ReferenceProvider {

	public constructor(
		private readonly referencesProvider: MdReferencesProvider
	) { }

	async provideReferences(document: ITextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[]> {
		const allRefs = await this.referencesProvider.getReferencesAtPosition(document, position, token);
		return allRefs
			.filter(ref => context.includeDeclaration || !ref.isDefinition)
			.map(ref => ref.location);
	}
}

export function registerReferencesSupport(
	selector: vscode.DocumentSelector,
	referencesProvider: MdReferencesProvider,
): vscode.Disposable {
	return vscode.languages.registerReferenceProvider(selector, new MdVsCodeReferencesProvider(referencesProvider));
}

export async function tryResolveLinkPath(originalUri: vscode.Uri, workspace: IMdWorkspace): Promise<vscode.Uri | undefined> {
	if (await workspace.pathExists(originalUri)) {
		return originalUri;
	}

	// We don't think the file exists. If it doesn't already have an extension, try tacking on a `.md` and using that instead
	if (uri.Utils.extname(originalUri) === '') {
		const dotMdResource = originalUri.with({ path: originalUri.path + '.md' });
		if (await workspace.pathExists(dotMdResource)) {
			return dotMdResource;
		}
	}

	return undefined;
}
