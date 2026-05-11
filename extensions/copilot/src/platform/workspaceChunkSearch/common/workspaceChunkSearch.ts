/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { GlobIncludeOptions } from '../../../util/common/glob';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { FileChunkAndScore } from '../../chunking/common/chunk';
import { Embedding } from '../../embeddings/common/embeddingsComputer';
import { IChatEndpoint } from '../../networking/common/networking';

export interface WorkspaceChunkQuery {
	/**
	 * The original text of the query.
	 */
	readonly queryText: string;
}

export interface WorkspaceChunkQueryWithEmbeddings extends WorkspaceChunkQuery {
	resolveQueryEmbeddings(token: CancellationToken): Promise<Embedding>;
}

/**
 * Sizing hints for the search strategy.
 */
export interface StrategySearchSizing {
	readonly endpoint: IChatEndpoint;
	readonly tokenBudget: number | undefined;
	readonly maxResultCountHint: number;
}

export interface WorkspaceChunkSearchOptions {
	readonly globPatterns?: GlobIncludeOptions;
	readonly enableRerank?: boolean;
}

export interface StrategySearchResult {
	readonly chunks: readonly FileChunkAndScore[];
	readonly alerts?: readonly WorkspaceSearchAlert[];
}

export type WorkspaceSearchAlert =
	| vscode.ChatResponseWarningPart
	| vscode.ChatResponseCommandButtonPart
	| vscode.ChatResponseMarkdownPart;
