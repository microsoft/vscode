/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { SystemInfo } from '../../../../platform/diagnostics/common/diagnostics.js';
import { IFileService, IFileStatWithMetadata } from '../../../../platform/files/common/files.js';
import { readTextFileTail } from '../../../../platform/files/common/io.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProcessService } from '../../../../platform/process/common/process.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ILogEntry, IOutputService, OutputChannelUpdateMode } from '../../../services/output/common/output.js';
import { formatIssueReporterVersion } from '../common/issueReporterUtil.js';

const MAX_LOG_SOURCES = 100;
const MAX_SEARCH_SOURCES = 50;
const MAX_SEARCH_RESULTS = 50;
const DEFAULT_SEARCH_RESULTS = 20;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_OUTPUT_LINES = 5_000;
const MAX_SCANNED_LINE_LENGTH = 64 * 1024;
const MAX_RESULT_LINE_LENGTH = 1_000;
const MAX_DIRECTORY_DEPTH = 8;
const OUTPUT_CHANNEL_REFRESH_TIMEOUT = 250;

/** Trusted build metadata returned by the Issue Wizard product-information tool. */
export interface IIssueProductInfo {
	readonly version: string;
	readonly quality: string;
	readonly commit: string;
}

/** System information shared by the Issue Reporter and Issue Wizard collectors. */
export interface IIssueReporterSystemInfo {
	readonly vscodeVersion: string;
	readonly systemInfo: SystemInfo;
}

/** A current-run Output channel or log file that can be searched. */
export interface IIssueLogSource {
	readonly id: string;
	readonly label: string;
	readonly kind: 'output' | 'logFile';
}

/** A bounded literal match found in a current-run diagnostic source. */
export interface IIssueLogMatch {
	readonly source: string;
	readonly label: string;
	readonly lineNumber?: number;
	readonly timestamp?: string;
	readonly text: string;
}

/** Parameters for a bounded search of current-run VS Code diagnostics. */
export interface IIssueLogSearchOptions {
	readonly query: string;
	readonly sources?: readonly string[];
	readonly maxResults?: number;
}

/** A source that could not be read and a safe recovery action for the agent. */
export interface IIssueLogSourceFailure {
	readonly source: string;
	readonly label: string;
	readonly message: string;
}

/** Result of searching one or more current-run VS Code diagnostic sources. */
export interface IIssueLogSearchResult {
	readonly query: string;
	readonly matches: readonly IIssueLogMatch[];
	readonly searchedSourceCount: number;
	readonly matchLimitReached: boolean;
	readonly sourceLimitReached: boolean;
	readonly truncatedSources: readonly string[];
	readonly failedSources: readonly IIssueLogSourceFailure[];
}

/** Internal source descriptor containing the data needed to perform a search. */
interface IResolvedIssueLogSource extends IIssueLogSource {
	readonly resource?: URI;
	readonly channelId?: string;
}

/** Matches and truncation state produced while searching one source. */
interface ITextSearchResult {
	readonly matches: IIssueLogMatch[];
	readonly truncated: boolean;
}

/** Optional location metadata for one line in a diagnostic source. */
interface ILineMatchLocation {
	readonly lineNumber?: number;
	readonly timestamp?: string;
}

export const IIssueDiagnosticsService = createDecorator<IIssueDiagnosticsService>('issueDiagnosticsService');

/** Collects trusted product metadata and bounded current-run diagnostic evidence. */
export interface IIssueDiagnosticsService {
	readonly _serviceBrand: undefined;
	getProductInfo(): IIssueProductInfo;
	getIssueReporterSystemInfo(): Promise<IIssueReporterSystemInfo>;
	getLogSources(token: CancellationToken): Promise<readonly IIssueLogSource[]>;
	searchLogs(options: IIssueLogSearchOptions, token: CancellationToken): Promise<IIssueLogSearchResult>;
}

/** Collects VS Code-owned issue diagnostics for the Issue Reporter and Issue Wizard tools. */
export class IssueDiagnosticsService implements IIssueDiagnosticsService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IProcessService private readonly processService: IProcessService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IOutputService private readonly outputService: IOutputService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) { }

	getProductInfo(): IIssueProductInfo {
		const unknown = localize('issueDiagnostics.unknownProductField', "unknown");
		return {
			version: this.productService.version,
			quality: this.productService.quality ?? unknown,
			commit: this.productService.commit ?? unknown,
		};
	}

	async getIssueReporterSystemInfo(): Promise<IIssueReporterSystemInfo> {
		return {
			vscodeVersion: formatIssueReporterVersion(this.productService),
			systemInfo: await this.processService.getSystemInfo(),
		};
	}

	async getLogSources(token: CancellationToken): Promise<readonly IIssueLogSource[]> {
		return (await this.resolveLogSources(token)).map(({ id, label, kind }) => ({ id, label, kind }));
	}

	async searchLogs(options: IIssueLogSearchOptions, token: CancellationToken): Promise<IIssueLogSearchResult> {
		const query = options.query.trim();
		if (!query) {
			throw new Error(localize('issueDiagnostics.emptyLogQuery', "A non-empty log search query is required."));
		}

		const availableSources = await this.resolveLogSources(token);
		const byId = new Map(availableSources.map(source => [source.id, source]));
		let selectedSources: IResolvedIssueLogSource[];
		if (options.sources?.length) {
			if (options.sources.length > MAX_SEARCH_SOURCES) {
				throw new Error(localize('issueDiagnostics.tooManyLogSources', "At most {0} VS Code log sources can be searched at once.", MAX_SEARCH_SOURCES));
			}
			selectedSources = options.sources.map(id => {
				const source = byId.get(id);
				if (!source) {
					throw new Error(localize('issueDiagnostics.unknownLogSource', "VS Code log source '{0}' is unavailable. List sources again and retry with a returned source ID.", id));
				}
				return source;
			});
		} else {
			selectedSources = availableSources.slice(0, MAX_SEARCH_SOURCES);
		}

		const requestedLimit = Number.isInteger(options.maxResults) ? options.maxResults! : DEFAULT_SEARCH_RESULTS;
		const resultLimit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, requestedLimit));
		const matches: IIssueLogMatch[] = [];
		const truncatedSources: string[] = [];
		const failedSources: IIssueLogSourceFailure[] = [];
		let searchedSourceCount = 0;

		for (const source of selectedSources) {
			if (token.isCancellationRequested || matches.length > resultLimit) {
				break;
			}
			searchedSourceCount++;
			try {
				const result = source.kind === 'output'
					? await this.searchOutputSource(source, query, resultLimit + 1 - matches.length, token)
					: await this.searchFileSource(source, query, resultLimit + 1 - matches.length);
				matches.push(...result.matches);
				if (result.truncated) {
					truncatedSources.push(source.id);
				}
			} catch {
				if (token.isCancellationRequested) {
					break;
				}
				failedSources.push({
					source: source.id,
					label: source.label,
					message: localize('issueDiagnostics.logSourceReadFailed', "This source could not be read. List sources again and retry if it is still available."),
				});
			}
		}

		const matchLimitReached = matches.length > resultLimit;
		return {
			query,
			matches: matchLimitReached ? matches.slice(0, resultLimit) : matches,
			searchedSourceCount,
			matchLimitReached,
			sourceLimitReached: !options.sources?.length && availableSources.length > selectedSources.length,
			truncatedSources,
			failedSources,
		};
	}

	private async resolveLogSources(token: CancellationToken): Promise<IResolvedIssueLogSource[]> {
		const outputSources = this.outputService.getChannelDescriptors()
			.map(descriptor => ({
				id: `output:${descriptor.id}`,
				label: descriptor.label,
				kind: 'output' as const,
				channelId: descriptor.id,
			}))
			.sort((a, b) => a.label.localeCompare(b.label));

		const fileSources = await this.resolveLogFileSources(Math.max(0, MAX_LOG_SOURCES - outputSources.length), token);
		return [...outputSources, ...fileSources].slice(0, MAX_LOG_SOURCES);
	}

	private async resolveLogFileSources(limit: number, token: CancellationToken): Promise<IResolvedIssueLogSource[]> {
		if (limit === 0) {
			return [];
		}
		const result: IResolvedIssueLogSource[] = [];
		const pending: { readonly resource: URI; readonly depth: number }[] = [{ resource: this.environmentService.logsHome, depth: 0 }];
		while (pending.length > 0 && result.length < limit && !token.isCancellationRequested) {
			const entry = pending.shift()!;
			let children: readonly IFileStatWithMetadata[];
			try {
				children = (await this.fileService.resolve(entry.resource, { resolveMetadata: true })).children as readonly IFileStatWithMetadata[] ?? [];
			} catch {
				continue;
			}
			for (const child of [...children].sort((a, b) => a.name.localeCompare(b.name))) {
				if (child.isSymbolicLink || !extUriBiasedIgnorePathCase.isEqualOrParent(child.resource, this.environmentService.logsHome)) {
					continue;
				}
				if (child.isDirectory) {
					if (entry.depth < MAX_DIRECTORY_DEPTH) {
						pending.push({ resource: child.resource, depth: entry.depth + 1 });
					}
					continue;
				}
				if (!child.isFile) {
					continue;
				}
				const path = relativePath(this.environmentService.logsHome, child.resource);
				if (!path) {
					continue;
				}
				result.push({ id: `log:${path}`, label: path, kind: 'logFile', resource: child.resource });
				if (result.length >= limit) {
					break;
				}
			}
		}
		return result.sort((a, b) => a.label.localeCompare(b.label));
	}

	private async searchOutputSource(source: IResolvedIssueLogSource, query: string, limit: number, token: CancellationToken): Promise<ITextSearchResult> {
		const channel = source.channelId ? this.outputService.getChannel(source.channelId) : undefined;
		if (!channel) {
			throw new Error('Output channel is unavailable');
		}
		const modelReference = await this.textModelService.createModelReference(channel.uri);
		try {
			const model = modelReference.object.textEditorModel;
			await new Promise<void>((resolve, reject) => {
				const disposables = new DisposableStore();
				const finish = () => {
					disposables.dispose();
					resolve();
				};
				disposables.add(model.onDidChangeContent(finish));
				disposables.add(token.onCancellationRequested(finish));
				disposables.add(disposableTimeout(finish, OUTPUT_CHANNEL_REFRESH_TIMEOUT));
				try {
					channel.update(OutputChannelUpdateMode.Append);
				} catch (error) {
					disposables.dispose();
					reject(error);
				}
			});
			const firstLine = Math.max(1, model.getLineCount() - MAX_OUTPUT_LINES + 1);
			const entries = channel.getLogEntries();
			const matches = collectLineMatches(
				source,
				query,
				limit,
				model.getLineCount() - firstLine + 1,
				index => model.getLineContent(firstLine + index),
				index => {
					const lineNumber = firstLine + index;
					const timestamp = findTimestamp(entries, lineNumber);
					return {
						lineNumber,
						...(timestamp === undefined ? {} : { timestamp: new Date(timestamp).toISOString() }),
					};
				},
			);
			return { matches, truncated: firstLine > 1 };
		} finally {
			modelReference.dispose();
		}
	}

	private async searchFileSource(source: IResolvedIssueLogSource, query: string, limit: number): Promise<ITextSearchResult> {
		if (!source.resource || !extUriBiasedIgnorePathCase.isEqualOrParent(source.resource, this.environmentService.logsHome)) {
			return { matches: [], truncated: false };
		}
		const stat = await this.fileService.resolve(source.resource, { resolveMetadata: true });
		if (!stat.isFile || stat.isSymbolicLink) {
			return { matches: [], truncated: false };
		}
		const content = await readTextFileTail(this.fileService, source.resource, MAX_FILE_BYTES);
		const text = content.text;
		if (text.includes('\0')) {
			return { matches: [], truncated: content.truncated };
		}
		const lines = text.split(/\r?\n/);
		const matches = collectLineMatches(source, query, limit, lines.length, index => lines[index], index => content.truncated ? {} : { lineNumber: index + 1 });
		return { matches, truncated: content.truncated };
	}
}

/** Collects newest-first literal matches from an indexed set of lines. */
function collectLineMatches(
	source: IResolvedIssueLogSource,
	query: string,
	limit: number,
	lineCount: number,
	getLine: (index: number) => string,
	getLocation: (index: number) => ILineMatchLocation,
): IIssueLogMatch[] {
	const matches: IIssueLogMatch[] = [];
	for (let index = lineCount - 1; index >= 0 && matches.length < limit; index--) {
		const line = getLine(index);
		const matchIndex = findQuery(line, query);
		if (matchIndex === -1) {
			continue;
		}
		matches.push({
			source: source.id,
			label: source.label,
			...getLocation(index),
			text: excerptLine(line, matchIndex, query.length),
		});
	}
	return matches;
}

/** Finds a case-insensitive literal query without scanning an unbounded line. */
function findQuery(line: string, query: string): number {
	const searchableLine = line.length > MAX_SCANNED_LINE_LENGTH ? line.slice(line.length - MAX_SCANNED_LINE_LENGTH) : line;
	const index = searchableLine.toLowerCase().indexOf(query.toLowerCase());
	return index === -1 ? -1 : index + line.length - searchableLine.length;
}

/** Returns a bounded excerpt centered around the matching text. */
function excerptLine(line: string, matchIndex: number, matchLength: number): string {
	if (line.length <= MAX_RESULT_LINE_LENGTH) {
		return line;
	}
	const surroundingLength = Math.max(0, MAX_RESULT_LINE_LENGTH - matchLength);
	const start = Math.max(0, Math.min(matchIndex - Math.floor(surroundingLength / 2), line.length - MAX_RESULT_LINE_LENGTH));
	const end = Math.min(line.length, start + MAX_RESULT_LINE_LENGTH);
	return `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`;
}

/** Finds the log timestamp whose range contains a model line. */
function findTimestamp(entries: readonly ILogEntry[], lineNumber: number): number | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.range.startLineNumber <= lineNumber && entry.range.endLineNumber >= lineNumber) {
			return entry.timestamp;
		}
	}
	return undefined;
}
