/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LRUCacheMap } from './helpers/cache';
import { TextDocumentIdentifier } from './textDocument';
import { ICompletionsTextDocumentManagerService } from './textDocumentManager';

/**
 * A map from the string representation of a document URI to its last access time in ms since the
 * epoch.
 */
export const accessTimes = new LRUCacheMap<string, number>();

/**
 * Returns a copy of `docs` sorted by access time, from most to least recent.
 */
export function sortByAccessTimes<T extends TextDocumentIdentifier>(docs: readonly T[]): T[] {
	return [...docs].sort((a, b) => {
		const aAccessTime = accessTimes.get(a.uri) ?? 0;
		const bAccessTime = accessTimes.get(b.uri) ?? 0;
		return bAccessTime - aAccessTime;
	});
}

/**
 * Registers a listener on the `window.onDidChangeActiveTextEditor` event that records/updates the
 * access time of the document.
 */
export const registerDocumentTracker = (accessor: ServicesAccessor) =>
	accessor.get(ICompletionsTextDocumentManagerService).onDidFocusTextDocument(e => {
		if (e.document) {
			accessTimes.set(e.document.uri.toString(), Date.now());
		}
	});
