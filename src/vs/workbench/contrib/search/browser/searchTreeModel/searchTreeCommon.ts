/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../../editor/common/core/range.js';
import { IAITextQuery, IFileMatch, ISearchComplete, ISearchProgressItem, ISearchRange, ITextQuery, ITextSearchResult } from '../../../../services/search/common/search.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IFileStatWithPartialMetadata, IFileService } from '../../../../../platform/files/common/files.js';
import { IProgress, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { ReplacePattern } from '../../../../services/search/common/replace.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';
import { RangeHighlightDecorations } from './rangeDecorations.js';
import { Event } from '../../../../../base/common/event.js';

export type FileMatchOrMatch = IFileInstanceMatch | ISearchMatch;

export type RenderableMatch = ITextSearchHeading | IFolderMatch | IFileInstanceMatch | ISearchMatch;
export function arrayContainsElementOrParent(element: RenderableMatch, testArray: RenderableMatch[]): boolean {
	do {
		if (testArray.includes(element)) {
			return true;
		}
	} while (!isSearchResult(element.parent()) && (element = <RenderableMatch>element.parent()));

	return false;
}


export interface IChangeEvent {
	elements: IFileInstanceMatch[];
	added?: boolean;
	removed?: boolean;
	clearingAll?: boolean;
}
export enum SearchModelLocation {
	PANEL,
	QUICK_ACCESS
}


export const PLAIN_TEXT_SEARCH__RESULT_ID = 'plainTextSearch';
export const AI_TEXT_SEARCH_RESULT_ID = 'aiTextSearch';

export function createParentList(element: RenderableMatch): RenderableMatch[] {
	const parentArray: RenderableMatch[] = [];
	let currElement: RenderableMatch | ITextSearchHeading = element;

	while (!isTextSearchHeading(currElement)) {
		parentArray.push(currElement);
		currElement = currElement.parent();
	}

	return parentArray;
}




export function mergeSearchResultEvents(events: IChangeEvent[]): IChangeEvent {
	const retEvent: IChangeEvent = {
		elements: [],
		added: false,
		removed: false,
	};
	events.forEach((e) => {
		if (e.added) {
			retEvent.added = true;
		}

		if (e.removed) {
			retEvent.removed = true;
		}

		retEvent.elements = retEvent.elements.concat(e.elements);
	});

	return retEvent;
}

export interface ISearchModel {
	readonly onReplaceTermChanged: Event<void>;
	readonly onSearchResultChanged: Event<IChangeEvent>;
	location: SearchModelLocation;

	getAITextResultProviderName(): Promise<string>;
	isReplaceActive(): boolean;
	replaceActive: boolean;
	replacePattern: ReplacePattern | null;
	replaceString: string;
	preserveCase: boolean;
	searchResult: ISearchResult;
	addAIResults(onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete>;
	aiSearch(query: IAITextQuery, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete>;
	hasAIResults: boolean;
	hasPlainResults: boolean;
	search(query: ITextQuery, onProgress?: (result: ISearchProgressItem) => void, callerToken?: CancellationToken): {
		asyncResults: Promise<ISearchComplete>;
		syncResults: IFileMatch<URI>[];
	};
	cancelSearch(cancelledForNewSearch?: boolean): boolean;
	cancelAISearch(cancelledForNewSearch?: boolean): boolean;
	dispose(): void;
}


export interface ISearchResult {
	readonly onChange: Event<IChangeEvent>;
	readonly searchModel: ISearchModel;
	readonly plainTextSearchResult: IPlainTextSearchHeading;
	readonly aiTextSearchResult: ITextSearchHeading;
	readonly children: ITextSearchHeading[];
	readonly hasChildren: boolean;
	readonly isDirty: boolean;
	query: ITextQuery | null;

	batchReplace(elementsToReplace: RenderableMatch[]): Promise<void>;
	batchRemove(elementsToRemove: RenderableMatch[]): void;
	folderMatches(ai?: boolean): IFolderMatch[];
	add(allRaw: IFileMatch[], searchInstanceID: string, ai: boolean, silent?: boolean): void;
	clear(): void;
	remove(matches: IFileInstanceMatch | IFolderMatch | (IFileInstanceMatch | IFolderMatch)[], ai?: boolean): void;
	replace(match: IFileInstanceMatch): Promise<any>;
	matches(ai?: boolean): IFileInstanceMatch[];
	isEmpty(): boolean;
	fileCount(): number;
	count(): number;
	setCachedSearchComplete(cachedSearchComplete: ISearchComplete | undefined, ai: boolean): void;
	getCachedSearchComplete(ai: boolean): ISearchComplete | undefined;
	toggleHighlights(value: boolean, ai?: boolean): void;
	getRangeHighlightDecorations(ai?: boolean): RangeHighlightDecorations;
	replaceAll(progress: IProgress<IProgressStep>): Promise<any>;

	dispose(): void;
}

export interface ITextSearchHeading {
	readonly onChange: Event<IChangeEvent>;
	resource: URI | null;
	hidden: boolean;
	cachedSearchComplete: ISearchComplete | undefined;
	hide(): void;
	readonly isAIContributed: boolean;
	id(): string;
	parent(): ISearchResult;
	readonly hasChildren: boolean;
	name(): string;
	readonly isDirty: boolean;
	getFolderMatch(resource: URI): IFolderMatch | undefined;
	add(allRaw: IFileMatch[], searchInstanceID: string, ai: boolean, silent?: boolean): void;
	remove(matches: IFileInstanceMatch | IFolderMatch | (IFileInstanceMatch | IFolderMatch)[], ai?: boolean): void;
	groupFilesByFolder(fileMatches: IFileInstanceMatch[]): { byFolder: Map<URI, IFileInstanceMatch[]>; other: IFileInstanceMatch[] };
	isEmpty(): boolean;
	findFolderSubstr(resource: URI): IFolderMatch | undefined;
	query: ITextQuery | null;
	folderMatches(): IFolderMatch[];
	matches(): IFileInstanceMatch[];
	showHighlights: boolean;
	toggleHighlights(value: boolean): void;
	rangeHighlightDecorations: RangeHighlightDecorations;
	fileCount(): number;
	count(): number;
	clear(): void;
	dispose(): void;
}

export interface IPlainTextSearchHeading extends ITextSearchHeading {
	replace(match: IFileInstanceMatch): Promise<any>;
	replaceAll(progress: IProgress<IProgressStep>): Promise<any>;
}


export interface IFolderMatch {
	readonly onChange: Event<IChangeEvent>;
	readonly onDispose: Event<void>;
	id(): string;
	resource: URI | null;
	index(): number;
	name(): string;
	count(): number;
	hasChildren: boolean;
	parent(): IFolderMatch | ITextSearchHeading;
	matches(): (IFileInstanceMatch | IFolderMatchWithResource)[];
	allDownstreamFileMatches(): IFileInstanceMatch[];
	remove(matches: IFileInstanceMatch | IFolderMatchWithResource | (IFileInstanceMatch | IFolderMatchWithResource)[]): void;
	addFileMatch(raw: IFileMatch[], silent: boolean, searchInstanceID: string, isAiContributed: boolean): void;
	isEmpty(): boolean;
	clear(clearingAll?: boolean): void;
	showHighlights: boolean;
	searchModel: ISearchModel;
	query: ITextQuery | null;
	replace(match: IFileInstanceMatch): Promise<any>;
	replacingAll: boolean;
	bindModel(model: ITextModel): void;
	getDownstreamFileMatch(uri: URI): IFileInstanceMatch | null;
	replaceAll(): Promise<any>;
	recursiveFileCount(): number;
	disposeMatches(): void;
	doRemoveFile(fileMatches: IFileInstanceMatch[], dispose?: boolean, trigger?: boolean, keepReadonly?: boolean): void;
	doAddFile(fileMatch: IFileInstanceMatch): void;
	onFileChange(fileMatch: IFileInstanceMatch, removed?: boolean): void;
	createIntermediateFolderMatch(resource: URI, id: string, index: number, query: ITextQuery, baseWorkspaceFolder: IFolderMatchWorkspaceRoot): IFolderMatchWithResource;
	getFolderMatch(resource: URI): IFolderMatchWithResource | undefined;
	unbindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI): void;
	bindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI): Promise<void>;
	unbindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI): void;
	hasOnlyReadOnlyMatches(): boolean;
	fileMatchesIterator(): IterableIterator<IFileInstanceMatch>;
	folderMatchesIterator(): IterableIterator<IFolderMatchWithResource>;
	recursiveFileCount(): number;
	recursiveMatchCount(): number;
	readonly closestRoot: IFolderMatchWorkspaceRoot | null;
	dispose(): void;
}
// Interface equivalent to FolderMatchWithResource

export interface IFolderMatchWithResource extends IFolderMatch {
	resource: URI;
}
// Interface equivalent to FolderMatchWorkspaceRoot

export interface IFolderMatchWorkspaceRoot extends IFolderMatchWithResource {
	createAndConfigureFileMatch(rawFileMatch: IFileMatch<URI>, searchInstanceID: string): IFileInstanceMatch;
}
// Interface equivalent to FolderMatchWorkspaceRoot

export interface IFolderMatchNoRoot extends IFolderMatch {
	createAndConfigureFileMatch(rawFileMatch: IFileMatch<URI>, searchInstanceID: string): IFileInstanceMatch;
}
// Interface equivalent to FileMatch

export interface IFileInstanceMatch {
	id(): string;
	resource: URI;
	onChange: Event<{
		didRemove?: boolean;
		forceUpdateModel?: boolean;
	}>;
	hasChildren: boolean;
	readonly onDispose: Event<void>;
	name(): string;
	count(): number;
	hasOnlyReadOnlyMatches(): boolean;
	matches(): ISearchMatch[];
	updateHighlights(): void;
	getSelectedMatch(): ISearchMatch | null;
	parent(): IFolderMatch;
	bindModel(model: ITextModel): void;
	hasReadonlyMatches(): boolean;
	addContext(results: ITextSearchResult[] | undefined): void;
	add(match: ISearchMatch, trigger?: boolean): void;
	replace(toReplace: ISearchMatch): Promise<void>;
	remove(matches: ISearchMatch | ISearchMatch[]): void;
	setSelectedMatch(match: ISearchMatch | null): void;
	fileStat: IFileStatWithPartialMetadata | undefined;
	resolveFileStat(fileService: IFileService): Promise<void>;
	textMatches(): ISearchMatch[];
	readonly context: Map<number, string>;
	readonly closestRoot: IFolderMatchWorkspaceRoot | null;
	isMatchSelected(match: ISearchMatch): boolean;
	dispose(): void;
}
// Type checker for ISearchModel

export function isSearchModel(obj: any): obj is ISearchModel {
	return obj && typeof obj.onReplaceTermChanged === 'object' &&
		typeof obj.onSearchResultChanged === 'object' &&
		typeof obj.location !== 'undefined' &&
		typeof obj.getAITextResultProviderName === 'function' &&
		typeof obj.isReplaceActive === 'function' &&
		typeof obj.replaceActive === 'boolean' &&
		(obj.replacePattern === null || typeof obj.replacePattern === 'object') &&
		typeof obj.replaceString === 'string' &&
		typeof obj.preserveCase === 'boolean' &&
		typeof obj.searchResult === 'object' &&
		typeof obj.addAIResults === 'function' &&
		typeof obj.aiSearch === 'function' &&
		typeof obj.hasAIResults === 'boolean' &&
		typeof obj.hasPlainResults === 'boolean' &&
		typeof obj.search === 'function' &&
		typeof obj.cancelSearch === 'function' &&
		typeof obj.cancelAISearch === 'function' &&
		typeof obj.dispose === 'function';
}
// Type checker for ISearchResult

export function isSearchResult(obj: any): obj is ISearchResult {
	return obj && typeof obj.onChange === 'object' &&
		typeof obj.searchModel === 'object' &&
		typeof obj.plainTextSearchResult === 'object' &&
		typeof obj.aiTextSearchResult === 'object' &&
		Array.isArray(obj.children) &&
		typeof obj.hasChildren === 'boolean' &&
		typeof obj.isDirty === 'boolean' &&
		(obj.query === null || typeof obj.query === 'object') &&
		typeof obj.batchReplace === 'function' &&
		typeof obj.batchRemove === 'function' &&
		typeof obj.folderMatches === 'function' &&
		typeof obj.add === 'function' &&
		typeof obj.clear === 'function' &&
		typeof obj.remove === 'function' &&
		typeof obj.replace === 'function' &&
		typeof obj.matches === 'function' &&
		typeof obj.isEmpty === 'function' &&
		typeof obj.fileCount === 'function' &&
		typeof obj.count === 'function' &&
		typeof obj.setCachedSearchComplete === 'function' &&
		typeof obj.getCachedSearchComplete === 'function' &&
		typeof obj.toggleHighlights === 'function' &&
		typeof obj.getRangeHighlightDecorations === 'function' &&
		typeof obj.replaceAll === 'function' &&
		typeof obj.dispose === 'function';
}
// Type checker for ITextSearchHeading

export function isTextSearchHeading(obj: any): obj is ITextSearchHeading {
	return obj && typeof obj.onChange === 'object' &&
		(obj.resource === null || obj.resource instanceof URI) &&
		typeof obj.hidden === 'boolean' &&
		(obj.cachedSearchComplete === undefined || typeof obj.cachedSearchComplete === 'object') &&
		typeof obj.hide === 'function' &&
		typeof obj.isAIContributed === 'boolean' &&
		typeof obj.id === 'function' &&
		typeof obj.parent === 'function' &&
		typeof obj.hasChildren === 'boolean' &&
		typeof obj.name === 'function' &&
		typeof obj.isDirty === 'boolean' &&
		typeof obj.getFolderMatch === 'function' &&
		typeof obj.add === 'function' &&
		typeof obj.remove === 'function' &&
		typeof obj.groupFilesByFolder === 'function' &&
		typeof obj.isEmpty === 'function' &&
		typeof obj.findFolderSubstr === 'function' &&
		(obj.query === null || typeof obj.query === 'object') &&
		typeof obj.folderMatches === 'function' &&
		typeof obj.matches === 'function' &&
		typeof obj.showHighlights === 'boolean' &&
		typeof obj.toggleHighlights === 'function' &&
		typeof obj.rangeHighlightDecorations === 'object' &&
		typeof obj.fileCount === 'function' &&
		typeof obj.count === 'function' &&
		typeof obj.clear === 'function' &&
		typeof obj.dispose === 'function';
}
// Type checker for IPlainTextSearchHeading

export function isPlainTextSearchHeading(obj: any): obj is IPlainTextSearchHeading {
	return isTextSearchHeading(obj) &&
		typeof (<any>obj).replace === 'function' &&
		typeof (<any>obj).replaceAll === 'function';
}
// Type checker for IFolderMatch

export function isFolderMatch(obj: any): obj is IFolderMatch {
	return obj && typeof obj.id === 'function' &&
		(obj.resource === null || obj.resource instanceof URI) &&
		typeof obj.index === 'function' &&
		typeof obj.name === 'function' &&
		typeof obj.count === 'function' &&
		typeof obj.hasChildren === 'boolean' &&
		typeof obj.parent === 'function' &&
		typeof obj.matches === 'function' &&
		typeof obj.allDownstreamFileMatches === 'function' &&
		typeof obj.remove === 'function' &&
		typeof obj.addFileMatch === 'function' &&
		typeof obj.isEmpty === 'function' &&
		typeof obj.clear === 'function' &&
		typeof obj.showHighlights === 'boolean' &&
		typeof obj.searchModel === 'object' &&
		(obj.query === null || typeof obj.query === 'object') &&
		typeof obj.replace === 'function' &&
		typeof obj.replacingAll === 'boolean' &&
		typeof obj.bindModel === 'function' &&
		typeof obj.getDownstreamFileMatch === 'function' &&
		typeof obj.replaceAll === 'function' &&
		typeof obj.recursiveFileCount === 'function' &&
		typeof obj.disposeMatches === 'function' &&
		typeof obj.doRemoveFile === 'function' &&
		typeof obj.doAddFile === 'function' &&
		typeof obj.onFileChange === 'function' &&
		typeof obj.createIntermediateFolderMatch === 'function' &&
		typeof obj.getFolderMatch === 'function' &&
		typeof obj.dispose === 'function';
}
// Type checker for IFolderMatchWithResource

export function isFolderMatchWithResource(obj: any): obj is IFolderMatchWithResource {
	return isFolderMatch(obj) && obj.resource instanceof URI;
}
// Type checker for IFolderMatchWorkspaceRoot

export function isFolderMatchWorkspaceRoot(obj: any): obj is IFolderMatchWorkspaceRoot {
	return isFolderMatchWithResource(obj) &&
		typeof (<any>obj).createAndConfigureFileMatch === 'function';
}

export function isFolderMatchNoRoot(obj: any): obj is IFolderMatchNoRoot {
	return isFolderMatch(obj) &&
		typeof (<any>obj).createAndConfigureFileMatch === 'function';
}
// Type checker for IFileInstanceMatch

export function isFileInstanceMatch(obj: any): obj is IFileInstanceMatch {
	return obj && typeof obj.id === 'function' &&
		obj.resource instanceof URI &&
		typeof obj.onChange === 'object' &&
		typeof obj.hasChildren === 'boolean' &&
		typeof obj.count === 'function' &&
		typeof obj.hasOnlyReadOnlyMatches === 'function' &&
		typeof obj.matches === 'function' &&
		typeof obj.updateHighlights === 'function' &&
		typeof obj.getSelectedMatch === 'function' &&
		typeof obj.parent === 'function' &&
		typeof obj.bindModel === 'function' &&
		typeof obj.hasReadonlyMatches === 'function' &&
		typeof obj.addContext === 'function' &&
		typeof obj.add === 'function' &&
		typeof obj.replace === 'function' &&
		typeof obj.remove === 'function' &&
		typeof obj.dispose === 'function';
}

export interface ISearchMatch {
	id(): string;
	parent(): IFileInstanceMatch;
	text(): string;
	range(): Range;
	preview(): { before: string; fullBefore: string; inside: string; after: string };
	replaceString: string;
	fullMatchText(includeSurrounding?: boolean): string;
	rangeInPreview(): ISearchRange;
	fullPreviewLines(): string[];
	getMatchString(): string;
	isReadonly(): boolean;
}

export function isSearchMatch(obj: any): obj is ISearchMatch {
	return typeof obj === 'object' &&
		obj !== null &&
		typeof obj.id === 'function' &&
		typeof obj.parent === 'function' &&
		typeof obj.text === 'function' &&
		typeof obj.range === 'function' &&
		typeof obj.preview === 'function' &&
		typeof obj.replaceString === 'string' &&
		typeof obj.fullMatchText === 'function' &&
		typeof obj.rangeInPreview === 'function' &&
		Array.isArray(obj.fullPreviewLines) &&
		typeof obj.getMatchString === 'function' &&
		typeof obj.isReadonly === 'function';
}
