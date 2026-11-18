/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { URI } from '../../../../util/vs/base/common/uri';
import { AbstractSearchService } from '../../../search/common/searchService';

/**
 * A minimal mock implementation of ISearchService for testing.
 * Searches can be held open so callers racing an in-progress workspace scan can be exercised.
 */
export class MockSearchService extends AbstractSearchService {

	private _results: URI[] = [];
	private _gate: DeferredPromise<void> | undefined;
	private _error: Error | undefined;

	public findFilesCallCount = 0;

	/** Sets the files every search resolves with. */
	setResults(results: URI[]): void {
		this._results = results;
	}

	/** Makes every search reject, as an unreadable or untrusted workspace would. */
	failWith(error: Error | undefined): void {
		this._error = error;
	}

	/** Holds every subsequent search open until {@link releaseSearches}. */
	blockSearches(): void {
		this._gate = new DeferredPromise<void>();
	}

	releaseSearches(): void {
		this._gate?.complete(undefined);
		this._gate = undefined;
	}

	async findFiles(): Promise<vscode.Uri[]> {
		this.findFilesCallCount++;
		await this._gate?.p;
		if (this._error) {
			throw this._error;
		}
		return this._results as vscode.Uri[];
	}

	findTextInFiles(): Promise<vscode.TextSearchComplete> {
		return Promise.reject(new Error('Not implemented'));
	}

	findTextInFiles2(): vscode.FindTextInFilesResponse {
		throw new Error('Not implemented');
	}
}
