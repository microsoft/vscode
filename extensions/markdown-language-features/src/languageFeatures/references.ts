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
import { InternalLinkTarget, MdLink, LinkTarget, MdLinkProvider, MdLinkDefinition } from './documentLinkProvider';
import { MdWorkspaceCache } from './workspaceCache';


function isLinkToHeader(target: LinkTarget, header: TocEntry, headerDocument: vscode.Uri, slugifier: Slugifier): target is InternalLinkTarget {
	return target.kind === 'internal'
		&& target.path.fsPath === headerDocument.fsPath
		&& slugifier.fromHeading(target.fragment).value === header.slug.value;
}


/**
 * A link in a markdown file.
 */
interface MdLinkReference {
	readonly kind: 'link';
	readonly isTriggerLocation: boolean;
	readonly isDefinition: boolean;
	readonly location: vscode.Location;

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
	return new vscode.Location(link.sourceResource, link.sourceRange.with({
		start: link.sourceRange.start.translate({ characterDelta: index + 1 }),
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

		const line = document.lineAt(header.line);
		references.push({
			kind: 'header',
			isTriggerLocation: true,
			isDefinition: true,
			location: new vscode.Location(document.uri, new vscode.Range(header.line, 0, header.line, line.text.length)),
			headerTextLocation: header.headerTextLocation
		});

		for (const link of links) {
			if (isLinkToHeader(link.target, header, document.uri, this.slugifier)) {
				references.push({
					kind: 'link',
					isTriggerLocation: false,
					isDefinition: false,
					location: new vscode.Location(link.sourceResource, link.sourceRange),
					fragmentLocation: getFragmentLocation(link),
				});
			} else if (link.kind === 'definition' && isLinkToHeader(link.target, header, document.uri, this.slugifier)) {
				references.push({
					kind: 'link',
					isTriggerLocation: false,
					isDefinition: false,
					location: new vscode.Location(link.sourceResource, link.sourceRange),
					fragmentLocation: getFragmentLocation(link),
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

	private async getReferencesToLink(sourceLink: MdLink): Promise<MdReference[]> {
		if (sourceLink.kind === 'definition') {
			return this.getReferencesToLink(this.getInnerLink(sourceLink));
		}

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
				references.push({
					kind: 'header',
					isTriggerLocation: false,
					isDefinition: true,
					location: entry.headerLocation,
					headerTextLocation: entry.headerTextLocation
				});
			}
		}

		for (let link of allLinksInWorkspace) {
			if (link.kind === 'definition') {
				link = this.getInnerLink(link);
			}

			if (link.target.kind !== 'internal') {
				continue;
			}

			const matchesFilePart = link.target.path.fsPath === targetDoc.uri.fsPath
				|| uri.Utils.extname(link.target.path) === '' && link.target.path.with({ path: link.target.path.path + '.md' }).fsPath === targetDoc.uri.fsPath;

			if (!matchesFilePart) {
				continue;
			}

			const isTriggerLocation = sourceLink.sourceResource.fsPath === link.sourceResource.fsPath && sourceLink.sourceRange.isEqual(link.sourceRange);

			if (sourceLink.target.fragment) {
				if (this.slugifier.fromHeading(link.target.fragment).equals(this.slugifier.fromHeading(sourceLink.target.fragment))) {
					references.push({
						kind: 'link',
						isTriggerLocation,
						isDefinition: false,
						location: new vscode.Location(link.sourceResource, link.sourceRange),
						fragmentLocation: getFragmentLocation(link),
					});
				}
			} else { // Triggered on a link without a fragment so we only require matching the file and ignore fragments

				// But exclude cases where the file is referencing itself
				if (link.sourceResource.fsPath !== targetDoc.uri.fsPath) {
					references.push({
						kind: 'link',
						isTriggerLocation,
						isDefinition: false,
						location: new vscode.Location(link.sourceResource, link.sourceRange),
						fragmentLocation: getFragmentLocation(link),
					});
				}
			}
		}

		return references;
	}

	private getInnerLink(sourceLink: MdLinkDefinition): MdLink {
		return {
			kind: 'link',
			sourceText: sourceLink.sourceText, // This is not correct
			sourceResource: sourceLink.sourceResource,
			sourceRange: sourceLink.sourceRange,
			target: sourceLink.target,
		};
	}

	private * getReferencesToReferenceLink(allLinks: Iterable<MdLink>, sourceLink: MdLink): Iterable<MdReference> {
		if (sourceLink.target.kind !== 'reference') {
			return;
		}

		for (const link of allLinks) {
			if (link.kind === 'definition') {
				if (link.ref === sourceLink.target.ref && link.sourceResource.fsPath === sourceLink.sourceResource.fsPath) {
					const isTriggerLocation = sourceLink.sourceResource.fsPath === link.sourceResource.fsPath && sourceLink.sourceRange.isEqual(link.sourceRange);
					yield {
						kind: 'link',
						isTriggerLocation,
						isDefinition: true,
						location: new vscode.Location(sourceLink.sourceResource, link.sourceRange),
						fragmentLocation: getFragmentLocation(link),
					};
				}
			} else if (link.target.kind === 'reference') {
				if (link.target.ref === sourceLink.target.ref && link.sourceResource.fsPath === sourceLink.sourceResource.fsPath) {
					const isTriggerLocation = sourceLink.sourceResource.fsPath === link.sourceResource.fsPath && sourceLink.sourceRange.isEqual(link.sourceRange);
					yield {
						kind: 'link',
						isTriggerLocation,
						isDefinition: false,
						location: new vscode.Location(sourceLink.sourceResource, link.sourceRange),
						fragmentLocation: getFragmentLocation(link),
					};
				}
			}
		}
	}
}
