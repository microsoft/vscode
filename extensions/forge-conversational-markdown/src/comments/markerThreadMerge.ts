/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SelectionAnchor } from '../protocol/types';
import { parseForgeMarkerRanges, threadIdForMarker } from '../markdown/forgeMarkers';
import type { MutableCommentThreadRecord } from './ThreadModel';

/**
 * Ensure every forge marker range in the document has a thread; refresh quoted text from source.
 */
export function mergeDocumentMarkersIntoThreads(
	source: string,
	threads: MutableCommentThreadRecord[],
	nowIso: () => string,
): void {
	const ranges = parseForgeMarkerRanges(source);
	for (const r of ranges) {
		const tid = threadIdForMarker(r.markerId);
		const th = threads.find(t => t.id === tid);
		if (!th) {
			const t = nowIso();
			const anchor: SelectionAnchor = {
				kind: 'selection',
				markerId: r.markerId,
				quotedText: r.quotedText,
				anchorLine: r.startMarkerLine,
			};
			threads.push({
				id: tid,
				status: 'open',
				anchor,
				comments: [],
				createdAt: t,
				updatedAt: t,
			});
		} else if (th.anchor.kind === 'selection') {
			th.anchor = {
				kind: 'selection',
				markerId: r.markerId,
				quotedText: r.quotedText,
				anchorLine: r.startMarkerLine,
			};
		}
	}
}
