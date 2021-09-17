/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { parse } from 'vs/base/common/glob';
import { URI } from 'vs/base/common/uri';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IFileService, IFileStat } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ICommonQueryProps, IFileMatch, IFileQuery, IFolderQuery, ISearchComplete, ISearchProgressItem, ISearchResultProvider, ISearchService, ITextQuery, ITextSearchResult, pathIncludedInQuery } from 'vs/workbench/services/search/common/search';
import { SearchService } from 'vs/workbench/services/search/common/searchService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { Range } from 'vs/editor/common/core/range';
import { TextSearchPreviewOptions } from 'vs/workbench/services/search/common/searchExtTypes';
// import { EditorWorkerClient } from 'vs/editor/common/services/editorWorkerServiceImpl';
// import { IWorkerClient } from 'vs/base/common/worker/simpleWorker';

export class RemoteSearchService extends SearchService {
	constructor(
		@IModelService modelService: IModelService,
		@IEditorService editorService: IEditorService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService);
		this.diskSearch = this.instantiationService.createInstance(LocalFileSystemSearch);
	}
}

// interface LocalFileSearchSimpleWorker {

// }

// export class LocalFileSearchWorkerClient extends EditorWorkerClient {
// 	private workerPromise: Promise<IWorkerClient<LocalFileSystemSearch>> | undefined;
// }


const globalStart = +new Date();
const itrcount: Record<string, number> = {};
const time = async <T>(name: string, task: () => Promise<T> | T) => {
	const start = Date.now();
	const itr = (itrcount[name] ?? 0) + 1;
	console.info(name, itr, 'starting', Math.round((start - globalStart) * 10) / 10000);

	itrcount[name] = itr;
	const r = await task();
	const end = Date.now();
	console.info(name, itr, 'took', end - start);
	return r;
};

export class LocalFileSystemSearch implements ISearchResultProvider {

	private cache: { key: string, cache: ISearchComplete } | undefined;

	constructor(@IFileService private fileService: IFileService) { }

	async textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete> {
		return time('textSearch', async () => {
			const pattern = createRegExp(query.contentPattern.pattern,
				!!query.contentPattern.isRegExp, {
				matchCase: query.contentPattern.isCaseSensitive,
				wholeWord: query.contentPattern.isWordMatch,
				multiline: true,
				global: true,
			});

			const allFiles: URI[] = [];
			await time('list all files', () => Promise.all(query.folderQueries.map(async fq => {
				await this.walkFolderQuery(query, fq, async (file) => {
					allFiles.push(file);
				}, token);
			})));


			const allResults: IFileMatch[] = [];

			const searchBatch = async (batch: URI[]) => {
				await Promise.all(batch.map(async (file) => {
					const contents = await this.fileService.readFile(file).then(fc => fc.value.buffer);
					const results = getFileResults(contents, pattern, {
						afterContext: query.afterContext ?? 0,
						beforeContext: query.beforeContext ?? 0,
						previewOptions: query.previewOptions,
						remainingResultQuota: 1000,
					});


					if (results.length) {
						const fileMatch: IFileMatch = { results, resource: file };
						allResults.push(fileMatch);
						onProgress?.(fileMatch);
					}
				}));
			};

			const batchSize = 1000;

			for (let i = 0; i < allFiles.length; i += batchSize) {
				await time('searchBatch', () => searchBatch(allFiles.slice(i, i + batchSize)));
			}

			return { messages: [], results: allResults };
		});
	}

	async fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {


		if (query.cacheKey === this.cache?.key) { return this.cache!.cache; }

		const results: IFileMatch[] = [];

		await time('fileList', () => Promise.all(query.folderQueries.map(fq => {
			return this.walkFolderQuery(query, fq, (file) => {
				results.push({ resource: file });
			}, token);
		})));

		const result = { messages: [], results: results };
		this.cache = { key: query.cacheKey || '', cache: result };
		return result;
	}

	async clearCache(cacheKey: string): Promise<void> {
		if (this.cache?.key === cacheKey) { this.cache = undefined; }
	}

	async walkFolderQuery(queryProps: ICommonQueryProps<URI>, folderQuery: IFolderQuery, onFile: (file: URI) => any, token?: CancellationToken): Promise<void> {

		const root = folderQuery.folder.path + '/';

		const folderExcludes = parse(folderQuery.excludePattern ?? {});
		const isPathIncluded = (path: URI) => {
			const relativePath = path.path.slice(root.length);

			if (folderExcludes(relativePath)) {
				console.log(path.path.slice(root.length), 'blocked by folder excludes');
				return false;
			}

			if (!pathIncludedInQuery(queryProps, relativePath)) {
				console.log(path.path.slice(root.length), 'blocked by query pattern');
				return false;
			}

			return true;
		};

		let entryCount = 0;

		const onDirectory = async (contents: IFileStat, isPathIncluded: (path: URI) => Boolean): Promise<void> => {

			if (token?.isCancellationRequested) { return; }

			const processes: Promise<void>[] = [];

			if (contents.isDirectory) {
				if (!contents.children) { return; }

				const dirs: URI[] = [];

				let dirIsPathIncluded = isPathIncluded;

				const ignoreFiles = contents.children.filter(child => child.name === '.gitignore' || child.name === '.ignore');
				if (ignoreFiles.length) {
					await Promise.all(ignoreFiles.map(async file => {
						const ignoreContents = new TextDecoder('utf8').decode((await this.fileService.readFile(file.resource)).value.buffer);
						const ignoreLines = ignoreContents.split('\n').map(line => line.trim()).filter(line => line[0] !== '#');
						const ignoreExpression = Object.create(null);
						for (const line of ignoreLines) {
							ignoreExpression[line] = true;
						}
						const checker = parse(ignoreExpression);
						dirIsPathIncluded = (path: URI) => {
							if (checker('/' + path.path.slice(root.length))) {
								console.log(path.path.slice(root.length), 'blocked by', file.resource.path);
								return false;
							}
							return isPathIncluded(path);
						};
					}));
				}

				(contents.children ?? [])
					.filter(node => dirIsPathIncluded(node.resource))
					.forEach(child => {
						entryCount++;
						if (child.isFile) {
							processes.push(onFile(child.resource));
						} else if (child.isDirectory) {
							dirs.push(child.resource);
						}
					});

				const resolvedDirs = await this.fileService.resolveAll(dirs.map(dir => ({ resource: dir })));
				resolvedDirs.map(resolution => {
					if (resolution.stat) {
						processes.push(onDirectory(resolution.stat, dirIsPathIncluded));
					}
				});
			} else {
				throw Error('ondirectory called with a file resource');
			}

			await Promise.all(processes);
		};

		await onDirectory(await this.fileService.resolve(folderQuery.folder), isPathIncluded);
		console.log('found', entryCount, 'entries');
	}
}

registerSingleton(ISearchService, RemoteSearchService, true);

interface RegExpOptions {
	matchCase?: boolean;
	wholeWord?: boolean;
	multiline?: boolean;
	global?: boolean;
	unicode?: boolean;
}

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[-\\{}*+?|^$.[\]()#]/g, '\\$&');
}

function createRegExp(searchString: string, isRegex: boolean, options: RegExpOptions = {}): RegExp {
	if (!searchString) {
		throw new Error('Cannot create regex from empty string');
	}
	if (!isRegex) {
		searchString = escapeRegExpCharacters(searchString);
	}
	if (options.wholeWord) {
		if (!/\B/.test(searchString.charAt(0))) {
			searchString = `\\b${searchString} `;
		}
		if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
			searchString = `${searchString} \\b`;
		}
	}
	let modifiers = '';
	if (options.global) {
		modifiers += 'g';
	}
	if (!options.matchCase) {
		modifiers += 'i';
	}
	if (options.multiline) {
		modifiers += 'm';
	}
	if (options.unicode) {
		modifiers += 'u';
	}

	return new RegExp(searchString, modifiers);
}


export const getFileResults = (
	content: string | Uint8Array,
	pattern: RegExp,
	options: {
		beforeContext: number;
		afterContext: number;
		previewOptions: TextSearchPreviewOptions | undefined;
		remainingResultQuota: number;
	},
): ITextSearchResult[] => {
	const results: ITextSearchResult[] = [];

	let file: string;
	if (typeof content === 'string') {
		file = content;
	} else {
		const bytes = content;
		if (bytes[0] === 0xff && bytes[1] === 0xfe) {
			file = new TextDecoder('utf-16le').decode(bytes);
		} else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
			file = new TextDecoder('utf-16be').decode(bytes);
		} else {
			file = new TextDecoder('utf8').decode(bytes);
			if (file.slice(0, 1000).includes('�') && bytes.includes(0)) {
				return [];
			}
		}
	}

	const patternIndecies: { matchStartIndex: number; matchedText: string }[] = [];

	let patternMatch: RegExpExecArray | null = null;
	let remainingResultQuota = options.remainingResultQuota;
	while (remainingResultQuota >= 0 && (patternMatch = pattern.exec(file))) {
		patternIndecies.push({ matchStartIndex: patternMatch.index, matchedText: patternMatch[0] });
		remainingResultQuota--;
	}

	if (patternIndecies.length) {
		const contextLinesNeeded = new Set<number>();
		const resultLines = new Set<number>();

		const lineRanges: { start: number; end: number }[] = [];
		const readLine = (lineNumber: number) => file.slice(lineRanges[lineNumber].start, lineRanges[lineNumber].end);

		let prevLineEnd = 0;
		let lineEndingMatch: RegExpExecArray | null = null;
		const lineEndRegex = /\r?\n/g;
		while ((lineEndingMatch = lineEndRegex.exec(file))) {
			lineRanges.push({ start: prevLineEnd, end: lineEndingMatch.index });
			prevLineEnd = lineEndingMatch.index + lineEndingMatch[0].length;
		}
		if (prevLineEnd < file.length) { lineRanges.push({ start: prevLineEnd, end: file.length }); }

		let startLine = 0;
		for (const { matchStartIndex, matchedText } of patternIndecies) {
			if (remainingResultQuota < 0) {
				break;
			}

			while (Boolean(lineRanges[startLine + 1]) && matchStartIndex > lineRanges[startLine].end) {
				startLine++;
			}
			let endLine = startLine;
			while (Boolean(lineRanges[endLine + 1]) && matchStartIndex + matchedText.length > lineRanges[endLine].end) {
				endLine++;
			}

			if (options.beforeContext) {
				for (
					let contextLine = Math.max(0, startLine - options.beforeContext);
					contextLine < startLine;
					contextLine++
				) {
					contextLinesNeeded.add(contextLine);
				}
			}

			let previewText = '';
			let offset = 0;
			for (let matchLine = startLine; matchLine <= endLine; matchLine++) {
				let previewLine = readLine(matchLine);
				if (options.previewOptions?.charsPerLine && previewLine.length > options.previewOptions.charsPerLine) {
					offset = Math.max(matchStartIndex - lineRanges[startLine].start - 20, 0);
					previewLine = previewLine.substr(offset, options.previewOptions.charsPerLine);
				}
				previewText += `${previewLine}\n`;
				resultLines.add(matchLine);
			}

			const fileRange = new Range(
				startLine,
				matchStartIndex - lineRanges[startLine].start,
				endLine,
				matchStartIndex + matchedText.length - lineRanges[endLine].start,
			);
			const previewRange = new Range(
				0,
				matchStartIndex - lineRanges[startLine].start - offset,
				endLine - startLine,
				matchStartIndex + matchedText.length - lineRanges[endLine].start - (endLine === startLine ? offset : 0),
			);

			const match: ITextSearchResult = {
				ranges: fileRange,
				preview: { text: previewText, matches: previewRange },
			};
			results.push(match);

			if (options.afterContext) {
				for (
					let contextLine = endLine + 1;
					contextLine <= Math.min(endLine + options.afterContext, lineRanges.length - 1);
					contextLine++
				) {
					contextLinesNeeded.add(contextLine);
				}
			}
		}
		for (const contextLine of contextLinesNeeded) {
			if (!resultLines.has(contextLine)) {

				results.push({
					text: readLine(contextLine),
					lineNumber: contextLine + 1,
				});
			}
		}
	}
	return results;
};
