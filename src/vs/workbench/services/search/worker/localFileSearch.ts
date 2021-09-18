/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { UriComponents, URI } from 'vs/base/common/uri';
import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { ILocalFileSearchSimpleWorker, ILocalFileSearchSimpleWorkerHost, IWorkerFileSearchComplete, IWorkerTextSearchComplete } from 'vs/workbench/services/search/common/localFileSearchWorkerTypes';
import { ICommonQueryProps, IFileMatch, IFileQueryProps, IFolderQuery, ITextQueryProps, ITextSearchResult, } from 'vs/workbench/services/search/common/search';
import * as extpath from 'vs/base/common/extpath';
import * as paths from 'vs/base/common/path';
import { TextSearchPreviewOptions } from 'vs/workbench/services/search/common/searchExtTypes';
import { Range } from 'vs/editor/common/core/range';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';

const PERF = false;

type FileNode = {
	type: 'file',
	name: string,
	path: string,
	resolve: () => Promise<ArrayBuffer>
};

type DirNode = {
	type: 'dir',
	name: string,
	entries: Promise<(DirNode | FileNode)[]>
};

const globalStart = +new Date();
const itrcount: Record<string, number> = {};
const time = async <T>(name: string, task: () => Promise<T> | T) => {
	if (!PERF) { return task(); }

	const start = Date.now();
	const itr = (itrcount[name] ?? 0) + 1;
	console.info(name, itr, 'starting', Math.round((start - globalStart) * 10) / 10000);

	itrcount[name] = itr;
	const r = await task();
	const end = Date.now();
	console.info(name, itr, 'took', end - start);
	return r;
};

/**
 * Called on the worker side
 * @internal
 */
export function create(host: ILocalFileSearchSimpleWorkerHost): IRequestHandler {
	return new LocalFileSearchSimpleWorker(host);
}


export class LocalFileSearchSimpleWorker implements ILocalFileSearchSimpleWorker, IRequestHandler {
	_requestHandlerBrand: any;

	cancellationTokens: Map<number, CancellationTokenSource> = new Map();

	constructor(private host: ILocalFileSearchSimpleWorkerHost) { }

	cancelQuery(queryId: number): void {
		this.cancellationTokens.get(queryId)?.cancel();

	}

	private registerCancellationToken(queryId: number): CancellationTokenSource {
		const source = new CancellationTokenSource();
		this.cancellationTokens.set(queryId, source);
		return source;
	}

	async listDirectory(handle: FileSystemDirectoryHandle, query: IFileQueryProps<UriComponents>, folderQuery: IFolderQuery<UriComponents>, queryId: number): Promise<IWorkerFileSearchComplete> {
		const token = this.registerCancellationToken(queryId);
		const entries: string[] = [];
		let limitHit = false;
		let count = 0;

		const filePatternMatcher = query.filePattern
			? (name: string) => query.filePattern!.split('').every(c => name.includes(c))
			: (name: string) => true;

		await time('listDirectory', () => this.walkFolderQuery(handle, query, folderQuery, file => {
			if (!filePatternMatcher(file.name)) {
				return;
			}

			count++;

			if (query.maxResults && count > query.maxResults) {
				limitHit = true;
				token.cancel();
			}
			return entries.push(file.path);
		}, token.token));

		return {
			results: entries,
			limitHit
		};
	}

	async searchDirectory(handle: FileSystemDirectoryHandle, query: ITextQueryProps<UriComponents>, folderQuery: IFolderQuery<UriComponents>, queryId: number): Promise<IWorkerTextSearchComplete> {
		return time('searchInFiles', async () => {
			const token = this.registerCancellationToken(queryId);

			const results: IFileMatch[] = [];

			const pattern = createRegExp(query.contentPattern.pattern,
				!!query.contentPattern.isRegExp, {
				matchCase: query.contentPattern.isCaseSensitive,
				wholeWord: query.contentPattern.isWordMatch,
				multiline: true,
				global: true,
			});

			const onGoingProcesses: Promise<void>[] = [];
			let fileCount = 0;
			let resultCount = 0;
			let limitHit = false;

			const processFile = async (file: FileNode) => {
				if (token.token.isCancellationRequested) {
					return;
				}

				fileCount++;

				let text: string;
				const contents = await file.resolve();
				if (token.token.isCancellationRequested) {
					return;
				}

				const bytes = new Uint8Array(contents);

				if (bytes[0] === 0xff && bytes[1] === 0xfe) {
					text = new TextDecoder('utf-16le').decode(bytes);
				} else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
					text = new TextDecoder('utf-16be').decode(bytes);
				} else {
					text = new TextDecoder('utf8').decode(bytes);
					if (text.slice(0, 1000).includes('�') && bytes.includes(0)) {
						return;
					}
				}

				const fileResults = getFileResults(text, pattern, {
					afterContext: query.afterContext ?? 0,
					beforeContext: query.beforeContext ?? 0,
					previewOptions: query.previewOptions,
					remainingResultQuota: 1000,
				});

				if (fileResults.length) {
					resultCount += fileResults.length;
					if (query.maxResults && resultCount > query.maxResults) {
						token.cancel();
					}
					const match = {
						resource: URI.joinPath(URI.revive(folderQuery.folder), file.path),
						results: fileResults,
					};
					this.host.sendTextSearchMatch(match, queryId);
					results.push(match);
				}
			};

			await time('walkFolderToResolve', () =>
				this.walkFolderQuery(handle, query, folderQuery, async file => onGoingProcesses.push(processFile(file)), token.token)
			);

			await time('resolveOngoingProcesses', () => Promise.all(onGoingProcesses));

			console.log('searched in', fileCount, 'files');

			return {
				results,
				limitHit,
			};
		});

	}

	async sayHello() {
		console.log('saying helo!');
		return 'hello';
	}

	private async walkFolderQuery(handle: FileSystemDirectoryHandle, queryProps: ICommonQueryProps<UriComponents>, folderQuery: IFolderQuery<UriComponents>, onFile: (file: FileNode) => any, token: CancellationToken): Promise<void> {

		const folderExcludes = glob.parse(folderQuery.excludePattern ?? {});

		// For folders, only check if the folder is explicitly excluded so walking continues.
		const isFolderExcluded = (path: string) => {
			if (folderExcludes(path)) { return true; }
			if (pathExcludedInQuery(queryProps, path)) { return true; }
			return false;
		};

		// For files ensure the full check takes place.
		const isFileIncluded = (path: string) => {
			if (folderExcludes(path)) { return false; }
			if (!pathIncludedInQuery(queryProps, path)) { return false; }
			return true;
		};

		const proccessFile = (file: FileSystemFileHandle, prior: string): FileNode => {

			const resolved: FileNode = {
				type: 'file',
				name: file.name,
				path: prior,
				resolve: () => file.getFile().then(r => r.arrayBuffer())
			} as const;

			return resolved;
		};


		const processDirectory = (directory: FileSystemDirectoryHandle, prior: string): DirNode => {
			return {
				type: 'dir',
				name: directory.name,
				entries: (async () => {
					const r: (DirNode | FileNode)[] = [];
					for await (const entry of directory.entries()) {
						if (token.isCancellationRequested) {
							break;
						}

						const path = prior ? prior + '/' + entry[0] : entry[0];

						if (entry[1].kind === 'directory' && !isFolderExcluded(path)) {
							r.push(processDirectory(entry[1], path));
						} else if (entry[1].kind === 'file' && isFileIncluded(path)) {
							r.push(proccessFile(entry[1], path));
						}
					}
					return r;
				})()
			};
		};

		const resolveDirectory = async (directory: DirNode, onFile: (f: FileNode) => any) => {
			if (token.isCancellationRequested) { return; }

			await Promise.all(
				(await directory.entries)
					.sort((a, b) => -(a.type === 'dir' ? 0 : 1) + (b.type === 'dir' ? 0 : 1))
					.map(async entry => {
						if (entry.type === 'dir') {
							await resolveDirectory(entry, onFile);
						}
						else {
							await onFile(entry);
						}
					}));
		};

		const processed = processDirectory(handle, '');

		await resolveDirectory(processed, onFile);

		// let entryCount = 0;

		// const onDirectory = async (contents: FileSystemDirectoryHandle, isPathIncluded: (path: URI) => Boolean): Promise<void> => {

		// 	// if (token?.isCancellationRequested) { return; }

		// 	const processes: Promise<void>[] = [];


		// 	if (!contents) { return; }

		// 	const dirs: URI[] = [];

		// 	let dirIsPathIncluded = isPathIncluded;

		// 	const ignoreFiles = contents.children.filter(child => child.name === '.gitignore' || child.name === '.ignore');
		// 	if (ignoreFiles.length) {
		// 		await Promise.all(ignoreFiles.map(async file => {
		// 			const ignoreContents = new TextDecoder('utf8').decode((await this.fileService.readFile(file.resource)).value.buffer);
		// 			const ignoreLines = ignoreContents.split('\n').map(line => line.trim()).filter(line => line[0] !== '#');
		// 			const ignoreExpression = Object.create(null);
		// 			for (const line of ignoreLines) {
		// 				ignoreExpression[line] = true;
		// 			}
		// 			const checker = parse(ignoreExpression);
		// 			dirIsPathIncluded = (path: URI) => {
		// 				if (checker('/' + path.path.slice(root.length))) {
		// 					console.log(path.path.slice(root.length), 'blocked by', file.resource.path);
		// 					return false;
		// 				}
		// 				return isPathIncluded(path);
		// 			};
		// 		}));
		// 	}

		// 	(contents.children ?? [])
		// 		.filter(node => dirIsPathIncluded(node.resource))
		// 		.forEach(child => {
		// 			entryCount++;
		// 			if (child.isFile) {
		// 				processes.push(onFile(child.resource));
		// 			} else if (child.isDirectory) {
		// 				dirs.push(child.resource);
		// 			}
		// 		});

		// 	const resolvedDirs = await this.fileService.resolveAll(dirs.map(dir => ({ resource: dir })));
		// 	resolvedDirs.map(resolution => {
		// 		if (resolution.stat) {
		// 			processes.push(onDirectory(resolution.stat, dirIsPathIncluded));
		// 		}
		// 	});


		// 	await Promise.all(processes);
		// };

		// await onDirectory(await this.fileService.resolve(folderQuery.folder), isPathIncluded);
		// console.log('found', entryCount, 'entries');
	}
}

function pathExcludedInQuery(queryProps: ICommonQueryProps<UriComponents>, fsPath: string): boolean {
	if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath)) {
		return true;
	}

	return false;
}

function pathIncludedInQuery(queryProps: ICommonQueryProps<UriComponents>, fsPath: string): boolean {
	if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath)) {
		return false;
	}

	if (queryProps.includePattern || queryProps.usingSearchPaths) {
		if (queryProps.includePattern && glob.match(queryProps.includePattern, fsPath)) {
			return true;
		}

		// If searchPaths are being used, the extra file must be in a subfolder and match the pattern, if present
		if (queryProps.usingSearchPaths) {
			return !!queryProps.folderQueries && queryProps.folderQueries.some(fq => {
				const searchPath = fq.folder.path;
				if (extpath.isEqualOrParent(fsPath, searchPath)) {
					const relPath = paths.relative(searchPath, fsPath);
					return !fq.includePattern || !!glob.match(fq.includePattern, relPath);
				} else {
					return false;
				}
			});
		}

		return false;
	}

	return true;
}



// export class LocalFileSystemSearch implements ISearchResultProvider {

// 	private cache: { key: string, cache: ISearchComplete } | undefined;

// 	constructor(@IFileService private fileService: IFileService) { }

// 	async textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete> {
// 		return time('textSearch', async () => {
// 			const pattern = createRegExp(query.contentPattern.pattern,
// 				!!query.contentPattern.isRegExp, {
// 				matchCase: query.contentPattern.isCaseSensitive,
// 				wholeWord: query.contentPattern.isWordMatch,
// 				multiline: true,
// 				global: true,
// 			});

// 			const allFiles: URI[] = [];
// 			await time('list all files', () => Promise.all(query.folderQueries.map(async fq => {
// 				await this.walkFolderQuery(query, fq, async (file) => {
// 					allFiles.push(file);
// 				}, token);
// 			})));


// 			const allResults: IFileMatch[] = [];

// 			const searchBatch = async (batch: URI[]) => {
// 				await Promise.all(batch.map(async (file) => {
// 					const contents = await this.fileService.readFile(file).then(fc => fc.value.buffer);
// 					const results = getFileResults(contents, pattern, {
// 						afterContext: query.afterContext ?? 0,
// 						beforeContext: query.beforeContext ?? 0,
// 						previewOptions: query.previewOptions,
// 						remainingResultQuota: 1000,
// 					});


// 					if (results.length) {
// 						const fileMatch: IFileMatch = { results, resource: file };
// 						allResults.push(fileMatch);
// 						onProgress?.(fileMatch);
// 					}
// 				}));
// 			};

// 			const batchSize = 1000;

// 			for (let i = 0; i < allFiles.length; i += batchSize) {
// 				await time('searchBatch', () => searchBatch(allFiles.slice(i, i + batchSize)));
// 			}

// 			return { messages: [], results: allResults };
// 		});
// 	}

// 	async fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {


// 		if (query.cacheKey === this.cache?.key) { return this.cache!.cache; }

// 		const results: IFileMatch[] = [];

// 		await time('fileList', () => Promise.all(query.folderQueries.map(fq => {
// 			return this.walkFolderQuery(query, fq, (file) => {
// 				results.push({ resource: file });
// 			}, token);
// 		})));

// 		const result = { messages: [], results: results };
// 		this.cache = { key: query.cacheKey || '', cache: result };
// 		return result;
// 	}

// 	async clearCache(cacheKey: string): Promise<void> {
// 		if (this.cache?.key === cacheKey) { this.cache = undefined; }
// 	}

// 	async walkFolderQuery(queryProps: ICommonQueryProps<URI>, folderQuery: IFolderQuery, onFile: (file: URI) => any, token?: CancellationToken): Promise<void> {

// 		const root = folderQuery.folder.path + '/';

// 		const folderExcludes = parse(folderQuery.excludePattern ?? {});
// 		const isPathIncluded = (path: URI) => {
// 			const relativePath = path.path.slice(root.length);

// 			if (folderExcludes(relativePath)) {
// 				console.log(path.path.slice(root.length), 'blocked by folder excludes');
// 				return false;
// 			}

// 			if (!pathIncludedInQuery(queryProps, relativePath)) {
// 				console.log(path.path.slice(root.length), 'blocked by query pattern');
// 				return false;
// 			}

// 			return true;
// 		};

// 		let entryCount = 0;

// 		const onDirectory = async (contents: IFileStat, isPathIncluded: (path: URI) => Boolean): Promise<void> => {

// 			if (token?.isCancellationRequested) { return; }

// 			const processes: Promise<void>[] = [];

// 			if (contents.isDirectory) {
// 				if (!contents.children) { return; }

// 				const dirs: URI[] = [];

// 				let dirIsPathIncluded = isPathIncluded;

// 				const ignoreFiles = contents.children.filter(child => child.name === '.gitignore' || child.name === '.ignore');
// 				if (ignoreFiles.length) {
// 					await Promise.all(ignoreFiles.map(async file => {
// 						const ignoreContents = new TextDecoder('utf8').decode((await this.fileService.readFile(file.resource)).value.buffer);
// 						const ignoreLines = ignoreContents.split('\n').map(line => line.trim()).filter(line => line[0] !== '#');
// 						const ignoreExpression = Object.create(null);
// 						for (const line of ignoreLines) {
// 							ignoreExpression[line] = true;
// 						}
// 						const checker = parse(ignoreExpression);
// 						dirIsPathIncluded = (path: URI) => {
// 							if (checker('/' + path.path.slice(root.length))) {
// 								console.log(path.path.slice(root.length), 'blocked by', file.resource.path);
// 								return false;
// 							}
// 							return isPathIncluded(path);
// 						};
// 					}));
// 				}

// 				(contents.children ?? [])
// 					.filter(node => dirIsPathIncluded(node.resource))
// 					.forEach(child => {
// 						entryCount++;
// 						if (child.isFile) {
// 							processes.push(onFile(child.resource));
// 						} else if (child.isDirectory) {
// 							dirs.push(child.resource);
// 						}
// 					});

// 				const resolvedDirs = await this.fileService.resolveAll(dirs.map(dir => ({ resource: dir })));
// 				resolvedDirs.map(resolution => {
// 					if (resolution.stat) {
// 						processes.push(onDirectory(resolution.stat, dirIsPathIncluded));
// 					}
// 				});
// 			} else {
// 				throw Error('ondirectory called with a file resource');
// 			}

// 			await Promise.all(processes);
// 		};

// 		await onDirectory(await this.fileService.resolve(folderQuery.folder), isPathIncluded);
// 		console.log('found', entryCount, 'entries');
// 	}
// }

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


const getFileResults = (
	file: string,
	pattern: RegExp,
	options: {
		beforeContext: number;
		afterContext: number;
		previewOptions: TextSearchPreviewOptions | undefined;
		remainingResultQuota: number;
	},
): ITextSearchResult[] => {
	const results: ITextSearchResult[] = [];


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
