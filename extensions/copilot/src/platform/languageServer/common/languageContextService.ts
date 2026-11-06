/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const ILanguageContextService = createServiceIdentifier<ILanguageContextService>('ILanguageContextService');

export enum ContextKind {
	Snippet = 'snippet',
	Trait = 'trait',
	DiagnosticBag = 'diagnosticBag'
}

/**
 * A context item represents a piece of code usually taken
 * from a source file.
 */
export interface SnippetContext {
	/**
	 * The kind of the context.
	 */
	kind: ContextKind.Snippet;

	/**
	 * A unique ID for the context item, used to provide
	 * detailed statistics about the item's usage. If an ID
	 * is not provided, it will be generated randomly.
	 */
	id?: string;

	/**
	 * The priority of the snippet. Value range is [0, 1].
	 */
	priority: number;

	/**
	 * The main source the snippet is extracted from.
	 */
	uri: vscode.Uri;

	/**
	 * Additional sources if available.
	 */
	additionalUris?: vscode.Uri[];

	/**
	 * The actual snippet value.
	 */
	value: string;
}

export interface TraitContext {
	/**
	 * The kind of the context.
	 */
	kind: ContextKind.Trait;

	/**
	 * A unique ID for the context item, used to provide
	 * detailed statistics about the item's usage. If an ID
	 * is not provided, it will be generated randomly.
	 */
	id?: string;

	/**
	 * The priority of the context.
	 */
	priority: number;

	/**
	 * The name of the trait.
	 */
	name: string;

	/**
	 * The value of the trait.
	 */
	value: string;
}

export interface DiagnosticBagContext {
	/**
	 * The kind of the context.
	 */
	kind: ContextKind.DiagnosticBag;

	/**
	 * A unique ID for the context item, used to provide
	 * detailed statistics about the item's usage. If an ID
	 * is not provided, it will be generated randomly.
	 */
	id?: string;

	/**
	 * The priority of the context.
	 */
	priority: number;

	/**
	 * The resource the diagnostics are associated with.
	 */
	uri: vscode.Uri;

	/**
	 * The diagnostics.
	 */
	values: vscode.Diagnostic[];
}

export type ContextItem = SnippetContext | TraitContext | DiagnosticBagContext;

export enum KnownSources {
	unknown = 'unknown',
	sideCar = 'sideCar',
	completion = 'completion',
	populateCache = 'populateCache',
	nes = 'nes',
	chat = 'chat',
	fix = 'fix'
}

export enum TriggerKind {
	unknown = 'unknown',
	selection = 'selection',
	completion = 'completion',
}

export type RequestContext = {
	/**
	 * A unique request id.
	 */
	requestId: string;

	/**
	 * The opportunity ID provided by VS Code core.
	 */
	opportunityId?: string;

	/**
	 * The time budget in milliseconds to compute the context.
	 */
	timeBudget?: number;

	/**
	 * The token budget to compute the context.
	 */
	tokenBudget?: number;

	/**
	 * The source of the request.
	 */
	source?: KnownSources | string;

	/**
	 * The
	 */
	trigger?: TriggerKind | undefined;

	/**
	 * A list of proposed edits that should be applied before computing the context.
	 */
	proposedEdits?: { edit: vscode.TextEdit; source?: 'selectedCompletionInfo' }[];

	/**
	 * If provided the telemetry will be sampled. A value of 1 will log every request, a value of
	 * 5 will log every 5th request, a value of 10 will log every 10th request, etc. If not provided
	 * all telemetry will be logged.
	 */
	sampleTelemetry?: number;
};

export interface ILanguageContextService {
	readonly _serviceBrand: undefined;

	/**
	 * Checks whether is language server context is activated for the
	 * given text document or language.
	 */
	isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean>;

	/**
	 * Populates the cache with context information for the given document and position.
	 *
	 * @param document The document to populate the cache for.
	 * @param position The position in the document to populate the cache for.
	 * @param context The context for the request.
	 */
	populateCache(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): Promise<void>;

	/**
	 * Retrieves the context for the given document and position.
	 *
	 * @param document The document to retrieve the context for.
	 * @param position The position in the document to retrieve the context for.
	 * @param context The context for the request.
	 * @param token A cancellation token.
	 * @returns A promise that resolves to an array of context items.
	 */
	getContext(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, token: vscode.CancellationToken): AsyncIterable<ContextItem>;

	/**
	 * Retrieves the context for the given document and position when a request timeout is reached.
	 * This method is called when the `getContext` request takes too long to complete. Items
	 * returned by this method are usually coming from a cache and might be not a 100% accurate.
	 *
	 * This method is optional and should complete execution quickly, ideally without any
	 * block or long-running operations.
	 *
	 * @param document The document to retrieve the context for.
	 * @param position The position in the document to retrieve the context for.
	 * @param context The context for the request.
	 * @returns An array of `ContextItem` or `undefined`.
	 */
	getContextOnTimeout(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): readonly ContextItem[] | undefined;
}

class EmptyAsyncIterable<T> implements AsyncIterable<T> {
	public async *[Symbol.asyncIterator](): AsyncIterator<T> {
	}
}
export const NullLanguageContextService: ILanguageContextService = {
	_serviceBrand: undefined,
	isActivated: async () => false,
	populateCache: async () => { },
	getContext: () => new EmptyAsyncIterable<ContextItem>(),
	getContextOnTimeout: () => [],
};