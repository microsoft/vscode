// import { URI } from '../../../../../base/common/uri';
// import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation';
// import { ILabelService } from '../../../../../platform/label/common/label';
// import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity';
// import { ITextQuery, IPatternInfo, ITextSearchPreviewOptions, IFileMatch } from '../../../../services/search/common/search';
// import { IReplaceService } from '../replace';
// import { TextSearchHeading, SearchResult, AI_TEXT_SEARCH_RESULT_ID, FolderMatchWorkspaceRoot, FileMatch, FolderMatch, FolderMatchWithResource } from './searchModel';

// export class AITextSearchResult extends TextSearchHeading {

// 	constructor(
// 		_allowOtherResults: boolean,
// 		parent: SearchResult,
// 		id: string,
// 		@IInstantiationService instantiationService: IInstantiationService,
// 		@IUriIdentityService uriIdentityService: IUriIdentityService,
// 	) {
// 		super(_allowOtherResults, parent, id, instantiationService, uriIdentityService);

// 	}

// 	override name(): string {
// 		return 'AI';
// 	}
// }

// export class AIFolderMatchWorkspaceRoot extends FolderMatchWorkspaceRoot {

// 	constructor(_resource: URI, _id: string, _index: number, _query: ITextQuery, _parent: TextSearchResult, private readonly _ai: boolean,
// 		@IReplaceService replaceService: IReplaceService,
// 		@IInstantiationService instantiationService: IInstantiationService,
// 		@ILabelService labelService: ILabelService,
// 		@IUriIdentityService uriIdentityService: IUriIdentityService
// 	) {
// 		super(_resource, _id, _index, _query, _parent, _parent.parent(), null, replaceService, instantiationService, labelService, uriIdentityService);
// 	}

// 	override createFileMatch(query: IPatternInfo, previewOptions: ITextSearchPreviewOptions | undefined, maxResults: number | undefined, parent: FolderMatch, rawFileMatch: IFileMatch, closestRoot: FolderMatchWorkspaceRoot | null, searchInstanceID: string): FileMatch {
// 		const fileMatch =
// 			this.instantiationService.createInstance(
// 				FileMatch,
// 				query,
// 				previewOptions,
// 				maxResults,
// 				parent,
// 				rawFileMatch,
// 				closestRoot,
// 				searchInstanceID
// 			);
// 		fileMatch.createMatches(this._ai);
// 		parent.doAddFile(fileMatch);
// 		const disposable = fileMatch.onChange(({ didRemove }) => parent.onFileChange(fileMatch, didRemove));
// 		this._register(fileMatch.onDispose(() => disposable.dispose()));
// 		return fileMatch;
// 	}

// 	override createAndConfigureFileMatch(rawFileMatch: IFileMatch<URI>, searchInstanceID: string): FileMatch {

// 		if (!this.uriHasParent(this.resource, rawFileMatch.resource)) {
// 			throw Error(`${rawFileMatch.resource} is not a descendant of ${this.resource}`);
// 		}

// 		const fileMatchParentParts: URI[] = [];
// 		let uri = this.normalizedUriParent(rawFileMatch.resource);

// 		while (!this.uriEquals(this.normalizedResource, uri)) {
// 			fileMatchParentParts.unshift(uri);
// 			const prevUri = uri;
// 			uri = this.uriIdentityService.extUri.removeTrailingPathSeparator(this.normalizedUriParent(uri));
// 			if (this.uriEquals(prevUri, uri)) {
// 				throw Error(`${rawFileMatch.resource} is not correctly configured as a child of ${this.normalizedResource}`);
// 			}
// 		}

// 		const root = this.closestRoot ?? this;
// 		let parent: FolderMatch = this;
// 		for (let i = 0; i < fileMatchParentParts.length; i++) {
// 			let folderMatch: FolderMatchWithResource | undefined = parent.getFolderMatch(fileMatchParentParts[i]);
// 			if (!folderMatch) {
// 				folderMatch = parent.createIntermediateFolderMatch(fileMatchParentParts[i], fileMatchParentParts[i].toString(), -1, this._query, root);
// 			}
// 			parent = folderMatch;
// 		}

// 		return this.createFileMatch(this._query.contentPattern, this._query.previewOptions, this._query.maxResults, parent, rawFileMatch, root, searchInstanceID);
// 	}

// }
