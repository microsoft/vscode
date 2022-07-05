/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger } from './logging';
import { IMdParser } from './parser';
import { githubSlugifier, Slug, Slugifier } from './slugify';
import { ILocation, makeLocation } from './types/location';
import { makePosition } from './types/position';
import { makeRange } from './types/range';
import { getLine, ITextDocument } from './types/textDocument';
import { IUri } from './types/uri';
import { Disposable } from './util/dispose';
import { IMdWorkspace } from './workspace';
import { MdDocumentInfoCache } from './workspaceCache';

export interface TocEntry {
	readonly slug: Slug;
	readonly text: string;
	readonly level: number;
	readonly line: number;

	/**
	 * The entire range of the header section.
	 *
	* For the doc:
	 *
	 * ```md
	 * # Head #
	 * text
	 * # Next head #
	 * ```
	 *
	 * This is the range from `# Head #` to `# Next head #`
	 */
	readonly sectionLocation: ILocation;

	/**
	 * The range of the header declaration.
	 *
	 * For the doc:
	 *
	 * ```md
	 * # Head #
	 * text
	 * ```
	 *
	 * This is the range of `# Head #`
	 */
	readonly headerLocation: ILocation;

	/**
	 * The range of the header text.
	 *
	 * For the doc:
	 *
	 * ```md
	 * # Head #
	 * text
	 * ```
	 *
	 * This is the range of `Head`
	 */
	readonly headerTextLocation: ILocation;
}

export class TableOfContents {

	public static async create(parser: IMdParser, document: ITextDocument,): Promise<TableOfContents> {
		const entries = await this.buildToc(parser, document);
		return new TableOfContents(entries, parser.slugifier);
	}

	private static async buildToc(parser: IMdParser, document: ITextDocument): Promise<TocEntry[]> {
		const toc: TocEntry[] = [];
		const tokens = await parser.tokenize(document);

		const existingSlugEntries = new Map<string, { count: number }>();

		for (const heading of tokens.filter(token => token.type === 'heading_open')) {
			if (!heading.map) {
				continue;
			}

			const lineNumber = heading.map[0];
			const line = getLine(document, lineNumber);

			let slug = parser.slugifier.fromHeading(line);
			const existingSlugEntry = existingSlugEntries.get(slug.value);
			if (existingSlugEntry) {
				++existingSlugEntry.count;
				slug = parser.slugifier.fromHeading(slug.value + '-' + existingSlugEntry.count);
			} else {
				existingSlugEntries.set(slug.value, { count: 0 });
			}

			const headerLocation = makeLocation(document.uri,
				makeRange(lineNumber, 0, lineNumber, line.length));

			const headerTextLocation = makeLocation(document.uri,
				makeRange(lineNumber, line.match(/^#+\s*/)?.[0].length ?? 0, lineNumber, line.length - (line.match(/\s*#*$/)?.[0].length ?? 0)));

			toc.push({
				slug,
				text: TableOfContents.getHeaderText(line),
				level: TableOfContents.getHeaderLevel(heading.markup),
				line: lineNumber,
				sectionLocation: headerLocation, // Populated in next steps
				headerLocation,
				headerTextLocation
			});
		}

		// Get full range of section
		return toc.map((entry, startIndex): TocEntry => {
			let end: number | undefined = undefined;
			for (let i = startIndex + 1; i < toc.length; ++i) {
				if (toc[i].level <= entry.level) {
					end = toc[i].line - 1;
					break;
				}
			}
			const endLine = end ?? document.lineCount - 1;
			return {
				...entry,
				sectionLocation: makeLocation(document.uri,
					makeRange(
						entry.sectionLocation.range.start,
						makePosition(endLine, getLine(document, endLine).length)))
			};
		});
	}

	private static getHeaderLevel(markup: string): number {
		if (markup === '=') {
			return 1;
		} else if (markup === '-') {
			return 2;
		} else { // '#', '##', ...
			return markup.length;
		}
	}

	private static getHeaderText(header: string): string {
		return header.replace(/^\s*#+\s*(.*?)(\s+#+)?$/, (_, word) => word.trim());
	}

	public static readonly empty = new TableOfContents([], githubSlugifier);

	private constructor(
		public readonly entries: readonly TocEntry[],
		private readonly slugifier: Slugifier,
	) { }

	public lookup(fragment: string): TocEntry | undefined {
		const slug = this.slugifier.fromHeading(fragment);
		return this.entries.find(entry => entry.slug.equals(slug));
	}
}


export class MdTableOfContentsProvider extends Disposable {

	private readonly _cache: MdDocumentInfoCache<TableOfContents>;

	constructor(
		parser: IMdParser,
		workspace: IMdWorkspace,
		private readonly logger: ILogger,
	) {
		super();
		this._cache = this._register(new MdDocumentInfoCache<TableOfContents>(workspace, doc => {
			this.logger.verbose('TableOfContentsProvider', `create - ${doc.uri}`);
			return TableOfContents.create(parser, doc);
		}));
	}

	public async get(resource: IUri): Promise<TableOfContents> {
		return await this._cache.get(resource) ?? TableOfContents.empty;
	}

	public getForDocument(doc: ITextDocument): Promise<TableOfContents> {
		return this._cache.getForDocument(doc);
	}
}
