/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';

/**
 * Editor input for Query Results editor.
 * Stores connection ID and query - data is fetched dynamically from DatabaseClientService.
 */
export class QueryResultsInput extends EditorInput {

	public static readonly typeId = 'workbench.editors.erdosQueryResultsEditor';

	private _resource: URI;
	private _connectionId: string;
	private _query: string;
	private _lastExecutedQuery: string; // Track the last query that was actually executed
	private _breadcrumbPath?: string[];
	private _initialResults?: any;

	constructor(
		connectionId: string,
		query: string = '',
		resource?: URI,
		breadcrumbPath?: string[],
		initialResults?: any
	) {
		super();

		this._connectionId = connectionId;
		this._query = query;
		this._lastExecutedQuery = query; // Initially, the last executed query is the same as the original
		this._breadcrumbPath = breadcrumbPath;
		this._initialResults = initialResults;
		
		// Use provided resource or create one
		this._resource = resource || URI.from({
			scheme: 'erdos-query-results',
			path: `/${connectionId}/${Date.now()}`,
			query: query ? `sql=${encodeURIComponent(query)}` : undefined
		});
	}

	override get typeId(): string {
		return QueryResultsInput.typeId;
	}

	override get editorId(): string {
		return QueryResultsInput.typeId;
	}

	override get resource(): URI {
		return this._resource;
	}

	override getName(): string {
		// Use the last breadcrumb segment as the title if available
		if (this._breadcrumbPath && this._breadcrumbPath.length > 0) {
			return this._breadcrumbPath[this._breadcrumbPath.length - 1];
		}
		
		if (this._query) {
			// Show first 50 characters of query as name
			const queryPreview = this._query.trim().substring(0, 50);
			return `Query: ${queryPreview}${this._query.length > 50 ? '...' : ''}`;
		}
		return `Query Results - ${this._connectionId}`;
	}

	override getDescription(): string {
		return `Connection: ${this._connectionId}`;
	}

	override getTitle(): string {
		return this.getName();
	}

	/**
	 * Gets the connection ID for this query results editor.
	 */
	get connectionId(): string {
		return this._connectionId;
	}

	/**
	 * Gets the query for this editor.
	 */
	get query(): string {
		return this._query;
	}

	/**
	 * Gets the last executed query for this editor - this is what should be shown in the query bar.
	 */
	get lastExecutedQuery(): string {
		return this._lastExecutedQuery;
	}

	/**
	 * Updates the last executed query for this tab.
	 */
	updateLastExecutedQuery(query: string): void {
		this._lastExecutedQuery = query;
	}

	/**
	 * Gets the breadcrumb path for this editor.
	 */
	get breadcrumbPath(): string[] | undefined {
		return this._breadcrumbPath;
	}

	/**
	 * Gets the initial results for this editor.
	 */
	get initialResults(): any {
		return this._initialResults;
	}

	/**
	 * Checks if this input matches another input.
	 */
	override matches(otherInput: EditorInput): boolean {
		if (!(otherInput instanceof QueryResultsInput)) {
			return false;
		}

		return this._connectionId === otherInput._connectionId &&
			this._query === otherInput._query;
	}

	/**
	 * Creates a new QueryResultsInput with updated query.
	 */
	withQuery(query: string): QueryResultsInput {
		const newInput = new QueryResultsInput(this._connectionId, query);
		// Preserve the last executed query from the current input
		newInput._lastExecutedQuery = this._lastExecutedQuery;
		return newInput;
	}

	/**
	 * Dispose of resources when the input is closed.
	 */
	override dispose(): void {
		// Clear references to prevent memory leaks
		this._breadcrumbPath = undefined;
		this._initialResults = undefined;
		
		super.dispose();
	}
}