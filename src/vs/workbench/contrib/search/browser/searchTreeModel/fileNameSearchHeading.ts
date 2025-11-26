/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IFileMatch, IFileQuery, ITextQuery, QueryType } from '../../../../services/search/common/search.js';
import { FILE_NAME_MATCH_PREFIX, FILE_NAME_SEARCH_RESULT_ID, IFileNameMatch, IFileNameSearchHeading, ISearchResult, ISearchTreeFolderMatch, ISearchTreeFolderMatchWorkspaceRoot, TEXT_SEARCH_HEADING_PREFIX } from './searchTreeCommon.js';
import { TextSearchHeadingImpl } from './textSearchHeading.js';
import { FolderMatchNoRootImpl, FolderMatchWorkspaceRootImpl } from './folderMatch.js';

/**
 * Represents a file or folder name match in the search results.
 * This is a leaf node - it has no children unlike FileMatchImpl which contains Match instances.
 */
export class FileNameMatch extends Disposable implements IFileNameMatch {
	private readonly _id: string;

	constructor(
		public readonly resource: URI,
		public readonly isFolder: boolean,
		private readonly _parent: IFileNameSearchHeading
	) {
		super();
		this._id = FILE_NAME_MATCH_PREFIX + this.resource.toString();
	}

	id(): string {
		return this._id;
	}

	parent(): IFileNameSearchHeading {
		return this._parent;
	}

	name(): string {
		return this.resource.fsPath;
	}
}

/**
 * Adapts an IFileQuery to an ITextQuery for use with folder matches.
 * File name search doesn't need contentPattern for highlighting, so we use a placeholder.
 */
function fileQueryToTextQuery(fileQuery: IFileQuery): ITextQuery {
	return {
		type: QueryType.Text,
		contentPattern: { pattern: fileQuery.filePattern || '' },
		folderQueries: fileQuery.folderQueries,
		includePattern: fileQuery.includePattern,
		excludePattern: fileQuery.excludePattern,
		maxResults: fileQuery.maxResults,
	};
}

export class FileNameSearchHeadingImpl extends TextSearchHeadingImpl<ITextQuery> implements IFileNameSearchHeading {
	public override hidden: boolean;
	private _fileQuery: IFileQuery | null = null;
	private _fileNameMatches: FileNameMatch[] = [];

	constructor(
		parent: ISearchResult,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(true, parent, instantiationService, uriIdentityService);
		this.hidden = true; // Hidden by default like AI results
	}

	get isAIContributed(): boolean {
		return false;
	}

	id(): string {
		return TEXT_SEARCH_HEADING_PREFIX + FILE_NAME_SEARCH_RESULT_ID;
	}

	override name(): string {
		return 'File and Folder Names';
	}

	get fileQuery(): IFileQuery | null {
		return this._fileQuery;
	}

	override get query(): ITextQuery | null {
		return this._query;
	}

	override set query(query: ITextQuery | null) {
		// This setter is used internally by the base class
		this._setQuery(query, null);
	}

	setFileQuery(fileQuery: IFileQuery | null): void {
		if (!fileQuery) {
			this._setQuery(null, null);
			return;
		}
		this._setQuery(fileQueryToTextQuery(fileQuery), fileQuery);
	}

	private _setQuery(textQuery: ITextQuery | null, fileQuery: IFileQuery | null): void {
		this.clearQuery();
		this._fileQuery = fileQuery;

		if (!textQuery) {
			return;
		}

		this._folderMatches = (textQuery.folderQueries || [])
			.map(fq => fq.folder)
			.map((resource, index) => <ISearchTreeFolderMatchWorkspaceRoot>this._createBaseFolderMatch(resource, resource.toString(), index, textQuery));

		this._folderMatches.forEach(fm => this._folderMatchesMap.set(fm.resource, fm));

		this._otherFilesMatch = this._createBaseFolderMatch(null, 'otherFiles', this._folderMatches.length + 1, textQuery);

		this._query = textQuery;
	}

	private _createBaseFolderMatch(resource: URI | null, id: string, index: number, query: ITextQuery): ISearchTreeFolderMatch {
		let folderMatch: ISearchTreeFolderMatch;
		if (resource) {
			folderMatch = this._register(this.instantiationService.createInstance(FolderMatchWorkspaceRootImpl, resource, id, index, query, this));
		} else {
			folderMatch = this._register(this.instantiationService.createInstance(FolderMatchNoRootImpl, id, index, query, this));
		}
		const disposable = folderMatch.onChange((event) => this._onChange.fire(event));
		this._register(folderMatch.onDispose(() => disposable.dispose()));
		return folderMatch;
	}

	/**
	 * Override add() to create FileNameMatch objects directly instead of using folder structure.
	 * This ensures file name search results render as leaf nodes without match count badges.
	 */
	override add(allRaw: IFileMatch[], _searchInstanceID: string, silent: boolean = false): void {
		const added: FileNameMatch[] = [];

		for (const raw of allRaw) {
			// Check if we already have this file
			const existingIndex = this._fileNameMatches.findIndex(m => m.resource.toString() === raw.resource.toString());
			if (existingIndex === -1) {
				// For file search, we don't have a reliable way to know if it's a folder from IFileMatch
				// We'll treat everything as files for now - folder detection would need stat() call
				const isFolder = false;

				const match = this._register(new FileNameMatch(raw.resource, isFolder, this));
				this._fileNameMatches.push(match);
				added.push(match);
			}
		}

		if (!silent && added.length > 0) {
			this._onChange.fire({ elements: added, added: true });
		}
	}

	override isEmpty(): boolean {
		return this._fileNameMatches.length === 0;
	}

	fileNameMatches(): FileNameMatch[] {
		return this._fileNameMatches;
	}

	protected override clearQuery(): void {
		// Clear file name matches
		this._fileNameMatches.forEach(m => m.dispose());
		this._fileNameMatches = [];

		// Call base class to clear folder structure
		super.clearQuery();
	}
}
