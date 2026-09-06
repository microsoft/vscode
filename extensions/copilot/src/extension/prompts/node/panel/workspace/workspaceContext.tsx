/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { FileChunk } from '../../../../../platform/chunking/common/chunk';
import { logExecTime } from '../../../../../platform/log/common/logExecTime';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IPromptPathRepresentationService } from '../../../../../platform/prompts/common/promptPathRepresentationService';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry';
import { getWorkspaceFileDisplayPath, IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { WorkspaceChunkQuery } from '../../../../../platform/workspaceChunkSearch/common/workspaceChunkSearch';
import { IWorkspaceChunkSearchService, WorkspaceChunkSearchResult } from '../../../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { GlobIncludeOptions } from '../../../../../util/common/glob';
import { createFencedCodeBlock, getLanguageId } from '../../../../../util/common/markdown';
import { TelemetryCorrelationId } from '../../../../../util/common/telemetryCorrelationId';
import { raceCancellationError } from '../../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { ResourceMap } from '../../../../../util/vs/base/common/map';
import { URI } from '../../../../../util/vs/base/common/uri';
import { Range } from '../../../../../util/vs/editor/common/core/range';
import { Location, Range as VSCodeRange } from '../../../../../vscodeTypes';
import { PromptReference } from '../../../../prompt/common/conversation';
import { IPromptEndpoint } from '../../base/promptRenderer';

/**
 * Maximum number of chunks that we can provide to the model.
 */
export const MAX_CHUNKS_RESULTS = 128;

/**
 * Maximum number of tokens we will ever use for chunks.
 */
export const MAX_CHUNK_TOKEN_COUNT = 32_000;

export const MAX_TOOL_CHUNK_TOKEN_COUNT = 20_000;

type WorkspaceChunksState = {
	readonly result?: WorkspaceChunkSearchResult;
};

export interface ChunksToolProps extends BasePromptElementProps {
	readonly telemetryInfo: TelemetryCorrelationId;

	readonly query: WorkspaceChunkQuery;
	readonly maxResults?: number;
	readonly globPatterns?: GlobIncludeOptions;

	readonly referencesOut?: PromptReference[];
	readonly isToolCall?: boolean;
	readonly lines1Indexed?: boolean;
	readonly absolutePaths?: boolean;
}

export class WorkspaceChunks extends PromptElement<ChunksToolProps, WorkspaceChunksState> {

	constructor(props: ChunksToolProps,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceChunkSearchService private readonly workspaceChunkSearch: IWorkspaceChunkSearchService,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing, progress: vscode.Progress<vscode.ChatResponsePart> | undefined, token = CancellationToken.None): Promise<WorkspaceChunksState> {
		if (!await this.workspaceChunkSearch.isAvailable()) {
			return {};
		}

		const searchResult = await logExecTime(this.logService, 'workspaceContext.perf.prepareWorkspaceChunks', () => {
			return raceCancellationError(
				this.workspaceChunkSearch.searchFileChunks({
					endpoint: this.promptEndpoint,
					tokenBudget: this.props.isToolCall ? MAX_TOOL_CHUNK_TOKEN_COUNT : MAX_CHUNK_TOKEN_COUNT,
					maxResults: this.props.maxResults ?? MAX_CHUNKS_RESULTS,
				}, this.props.query, {
					globPatterns: this.props.globPatterns,
				}, this.props.telemetryInfo, progress, token),
				token);
		}, (execTime, status, result) => {
			/* __GDPR__
				"workspaceContext.perf.prepareWorkspaceChunks" : {
					"owner": "mjbvz",
					"comment": "Understanding the performance of including workspace context",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" },
					"resultChunkCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of chunks returned" }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent('workspaceContext.perf.prepareWorkspaceChunks', {
				status,
				workspaceSearchSource: this.props.telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: this.props.telemetryInfo.correlationId,
			}, {
				execTime,
				resultChunkCount: result?.chunks.length ?? 0,
			});
		});

		for (const alert of searchResult.alerts ?? []) {
			progress?.report(alert);
		}

		return { result: searchResult };
	}

	override render(state: WorkspaceChunksState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (state.result === undefined) {
			return <TextChunk>The workspace index is not available at this time.</TextChunk>;
		}

		return <WorkspaceChunkList
			result={state.result}
			referencesOut={this.props.referencesOut}
			absolutePaths={!!this.props.absolutePaths}
			priority={this.props.priority}
			isToolCall={!!this.props.isToolCall}
			lines1Indexed={this.props.lines1Indexed}
		/>;
	}
}

interface WorkspaceChunkListProps extends BasePromptElementProps {
	readonly result: WorkspaceChunkSearchResult;

	readonly referencesOut: PromptReference[] | undefined;
	readonly absolutePaths: boolean;
	readonly isToolCall: boolean;
	readonly lines1Indexed?: boolean;
}

export class WorkspaceChunkList extends PromptElement<WorkspaceChunkListProps> {

	constructor(props: WorkspaceChunkListProps,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override render(_state: void, _sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const references = this.toReferences(this.props.result);
		this.props.referencesOut?.push(...references);

		// TODO: references should be tied to user message. However we've deduplicated them so we need to make sure we
		// return the correct references based on which user message we're rendering.
		return <>
			<references value={references} />

			{this.props.result.chunks
				.map((chunk, i) => {
					// Give chunks a scaled priority from `X` to `X + 1` with the earliest chunks having the highest priority
					const priority = typeof this.props.priority !== 'undefined'
						? this.props.priority + (1 - ((i + 1) / this.props.result.chunks.length))
						: undefined;

					return { chunk, priority };
				})
				// Send chunks in reverse order with most relevant chunks last
				.reverse()
				.filter(x => x.chunk.chunk.text)
				.map(({ chunk, priority }) => {
					const filePath = this.promptPathRepresentationService.getFilePath(chunk.chunk.file);
					const fileLabel = this.props.absolutePaths ? filePath : getWorkspaceFileDisplayPath(this.workspaceService, chunk.chunk.file);
					const lineForDisplay = this.props.lines1Indexed ?
						chunk.chunk.range.startLineNumber + 1 :
						chunk.chunk.range.startLineNumber;
					return <TextChunk priority={priority}>
						{chunk.chunk.isFullFile
							? `Here is the full text of \`${fileLabel}\`:`
							: `Here is a potentially relevant text excerpt in \`${fileLabel}\` starting at line ${lineForDisplay}:`}<br />
						{createFencedCodeBlock(getLanguageId(chunk.chunk.file), chunk.chunk.text, undefined, filePath)}<br /><br />
					</TextChunk>;
				})}
		</>;
	}

	private toReferences(searchResult: WorkspaceChunkSearchResult): PromptReference[] {
		const chunksByFile = new ResourceMap<FileChunk[]>();
		for (const chunk of searchResult.chunks) {
			let fileChunks = chunksByFile.get(chunk.chunk.file) ?? [];
			if (chunk.chunk.isFullFile) {
				fileChunks = [chunk.chunk];
			} else if (fileChunks.some(c => c.isFullFile || c.range.containsRange(chunk.chunk.range))) {
				// Chunk is contained by another chunk, skip
			} else {
				// Add chunk to list and remove any chunks that are contained by this chunk
				fileChunks = [...fileChunks.filter(c => !chunk.chunk.range.containsRange(c.range)), chunk.chunk];
			}

			chunksByFile.set(chunk.chunk.file, fileChunks);
		}

		const references = Array.from(chunksByFile.values()).flatMap(chunks => {
			return chunks
				.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)) // compare ranges by starts, then ends
				.map(chunk => new PromptReference(chunk.isFullFile
					? chunk.file
					: new Location(chunk.file, new VSCodeRange(chunk.range.startLineNumber, chunk.range.startColumn, chunk.range.endLineNumber, chunk.range.endColumn)), undefined, { isFromTool: this.props.isToolCall }));
		});
		return references;
	}
}

export interface WorkspaceContextProps extends BasePromptElementProps {
	readonly telemetryInfo: TelemetryCorrelationId;

	readonly query: string;
	scopedDirectories?: URI[];
	absolutePaths?: boolean;
	lines1Indexed?: boolean;

	/**
	 * A way to extract references from tool results, since references aren't returned from renderElementJSON
	 */
	referencesOut?: PromptReference[];
	isToolCall?: boolean;
	maxResults?: number;
}


export class WorkspaceContext extends PromptElement<WorkspaceContextProps, undefined> {

	override render(state: undefined, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const query = this.props.query;
		if (!query) {
			return;
		}

		const includePatterns = this.props.scopedDirectories ? this.props.scopedDirectories.map(dir => `**${dir.path}/**`) : undefined;

		return <>
			<WorkspaceChunks
				priority={this.props.priority}
				telemetryInfo={this.props.telemetryInfo}
				query={{ queryText: query }}
				globPatterns={{ include: includePatterns }}
				referencesOut={this.props.referencesOut}
				isToolCall={this.props.isToolCall}
				absolutePaths={this.props.absolutePaths}
				lines1Indexed={this.props.lines1Indexed}
				maxResults={this.props.maxResults}
			/>
		</>;
	}
}
